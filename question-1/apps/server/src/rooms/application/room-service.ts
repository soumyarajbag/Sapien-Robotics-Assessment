import { randomBytes, randomUUID } from "node:crypto";
import type { RawData } from "ws";
import {
  clientMessageSchema,
  drawingOperationSchema,
  type ClientMessage,
  type DrawingOperation,
  type RoomSettings,
} from "@sapien/protocol";
import {
  calculateGuessPoints,
  chooseWordOptions,
  cleanWord,
  isNearMiss,
  maskWord,
  normalizeAnswer,
  type PlayerState,
  type Replay,
  type RoomOperation,
  type RoomState,
} from "@sapien/game-core";
import { RoomRepository } from "../infrastructure/room-repository";
import type { ConnectionContext } from "../../realtime/connection-context";
import { createPlayer, createRoomState } from "../domain/room-factory";
import type { RuntimeRoom } from "../domain/room-runtime";
import { RoomEventBus } from "./room-event-bus";
import { RoomPresenter } from "./room-presenter";

const RESUME_WINDOW_MS = 30_000;

export class RoomService {
  private readonly rooms = new Map<string, RuntimeRoom>();
  private readonly presenter = new RoomPresenter();
  private readonly events: RoomEventBus;
  private readonly persistence: RoomRepository;

  constructor(persistence: RoomRepository) {
    this.persistence = persistence;
    this.events = new RoomEventBus(this.rooms, persistence, this.presenter);
  }

  async hydrate(): Promise<void> {
    const savedRooms = await this.persistence.loadRooms();
    for (const state of savedRooms) {
      if (Date.now() - state.lastActivityAt > 24 * 60 * 60 * 1000) continue;
      state.serverEpoch = randomUUID();
      if (!Object.prototype.hasOwnProperty.call(state, "hostResumePlayerId")) {
        state.hostResumePlayerId = state.playerOrder[0] ?? state.hostPlayerId;
      } else if (state.hostResumePlayerId === null) {
        state.hostResumePlayerId = state.hostPlayerId;
      }
      for (const player of state.players) {
        player.connected = false;
        player.disconnectedAt ??= Date.now();
      }
      this.rooms.set(state.roomId, { state, connections: new Set() });
    }
    if (savedRooms.length > 0) console.log(`[rooms] hydrated ${savedRooms.length} room(s)`);
  }

  async handle(context: ConnectionContext, message: ClientMessage): Promise<void> {
    try {
      if (message.type === "room.create") {
        await this.createRoom(context, message.payload.displayName, message.payload.settings, message.requestId);
        return;
      }
      if (message.type === "room.join") {
        await this.joinRoom(
          context,
          message.payload.roomId,
          message.payload.displayName,
          message.payload.resumeToken,
          message.requestId,
        );
        return;
      }
      if (message.type === "room.resume") {
        await this.resumeRoom(context, message.payload.roomId, message.payload.resumeToken, message.requestId);
        return;
      }
      if (message.type === "room.probe") {
        await this.probeRoom(context, message.payload.roomId, message.requestId);
        return;
      }
      if (message.type === "room.leave") {
        await this.disconnect(context, true);
        return;
      }

      const room = this.requireRoom(context);
      if (!room || !context.playerId) return;

      switch (message.type) {
        case "room.start":
          await this.startGame(room, context, message.payload.expectedVersion, message.requestId);
          break;
        case "room.settings.update":
          await this.updateSettings(room, context, message.payload.settings, message.payload.expectedVersion, message.requestId);
          break;
        case "turn.chooseWord":
          await this.chooseWord(room, context, message.payload.optionId, message.requestId);
          break;
        case "draw.operation":
          await this.applyDrawingOperation(room, context, message.payload.operation, message.requestId);
          break;
        case "chat.send":
          await this.handleChat(room, context, message.payload.text, message.requestId);
          break;
        case "room.sync":
          this.sendSnapshot(context, room, message.requestId);
          break;
      }
    } catch (error) {
      console.error("[rooms] command failed", error);
      this.sendError(context, "INTERNAL_ERROR", "Something went wrong. Please try again.");
    }
  }

  async handleRaw(context: ConnectionContext, raw: RawData): Promise<void> {
    try {
      const input = JSON.parse(raw.toString());
      const parsed = clientMessageSchema.safeParse(input);
      if (!parsed.success) {
        const messageType = typeof input?.type === "string" ? input.type : "";
        const message = messageType === "room.settings.update"
          ? "Settings could not be saved. Use 1–10 rounds, 30–180 seconds, and 10–500 words with no word longer than 40 characters."
          : "That message was not valid.";
        this.sendError(context, "INVALID_MESSAGE", message);
        return;
      }
      await this.handle(context, parsed.data);
    } catch {
      this.sendError(context, "INVALID_JSON", "The message was not valid JSON.");
    }
  }

  async disconnect(context: ConnectionContext, permanent = false): Promise<void> {
    if (!context.roomId || !context.playerId) return;
    const room = this.rooms.get(context.roomId);
    if (!room) return;
    if (!room.connections.has(context)) return;
    room.connections.delete(context);
    const player = this.getPlayer(room.state, context.playerId);
    if (!player) return;

    const disconnectedAt = Date.now();
    player.connected = false;
    player.disconnectedAt = disconnectedAt;
    const token = context.resumeToken ?? this.createResumeToken();
    context.resumeToken = token;
    await this.persistence.saveResume(token, {
      roomId: room.state.roomId,
      playerId: player.id,
      expiresAt: disconnectedAt + RESUME_WINDOW_MS,
    });
    if (permanent) await this.persistence.deleteResume(token);

    if (player.id === room.state.currentDrawerId && ["DRAWING", "CHOOSING_WORD"].includes(room.state.phase)) {
      room.state.drawerGraceEndsAt = Date.now() + 5_000;
    }
    room.state.eligibleGuesserIds = room.state.eligibleGuesserIds.filter((id) => id !== player.id);
    let hostChanged = false;
    if (player.id === room.state.hostPlayerId) {
      if (permanent && room.state.hostResumePlayerId === player.id) room.state.hostResumePlayerId = null;
      if (!permanent && room.state.hostResumePlayerId === null) room.state.hostResumePlayerId = player.id;
      const previousHostId = room.state.hostPlayerId;
      this.transferHost(room.state);
      hostChanged = room.state.hostPlayerId !== previousHostId;
    }
    room.state.version += 1;
    await this.persist(room);

    // A reconnect can race with the async persistence above. If it won the
    // race, do not publish a stale offline event after the player is online.
    if (player.connected || player.disconnectedAt !== disconnectedAt) return;

    this.publish(room, "player.left", {
      playerId: player.id,
      displayName: player.displayName,
      resumeUntil: Date.now() + RESUME_WINDOW_MS,
      player: this.presenter.projectPlayer(room.state, player),
      version: room.state.version,
    });
    this.publish(room, "scoreboard.updated", { players: this.presenter.projectPlayers(room.state), version: room.state.version });
    if (hostChanged) this.publish(room, "room.snapshot", this.presenter.publicSnapshot(room.state));

    await this.finishIfNotEnoughPlayers(room, permanent);
  }

  async tick(): Promise<void> {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const state = room.state;
      state.lastActivityAt = now;

      // The close event is normally enough to trigger this transition, but
      // this guard also covers abrupt browser/network disconnects and races
      // between a close and a reconnect.
      if (await this.finishIfNotEnoughPlayers(room, false, now)) continue;

      await this.expireHostReservation(room, now);

      for (const player of state.players) {
        if (player.disconnectedAt && now - player.disconnectedAt > 5_000) {
          state.eligibleGuesserIds = state.eligibleGuesserIds.filter((id) => id !== player.id);
        }
      }

      if (state.phase === "CHOOSING_WORD" && state.choiceEndsAt !== null && now >= state.choiceEndsAt) {
        const option = state.wordOptions[0];
        if (option) await this.beginDrawing(room, option.id, now);
      } else if (state.phase === "DRAWING") {
        const drawerDisconnected = state.drawerGraceEndsAt !== null && now >= state.drawerGraceEndsAt;
        const allGuessed = state.eligibleGuesserIds.length > 0 && state.eligibleGuesserIds.every((id) => state.guessedPlayerIds.includes(id));
        const noGuessers = state.eligibleGuesserIds.length === 0 && now - (state.turnStartedAt ?? now) > 5_000;
        const deadline = state.turnEndsAt !== null && now >= state.turnEndsAt;
        if (drawerDisconnected || allGuessed || noGuessers || deadline) {
          await this.endRound(room, now, drawerDisconnected ? "drawer-disconnected" : allGuessed ? "everyone-guessed" : "time-up");
        } else {
          const nextHint = Math.floor((now - (state.turnStartedAt ?? now)) / (state.settings.hintEverySeconds * 1000));
          if (nextHint > state.hintNumber) {
            state.hintNumber = nextHint;
            state.version += 1;
            await this.persist(room);
            this.publish(room, "hint.updated", {
              maskedWord: maskWord(state.secretWord ?? "", state.hintNumber),
              hintNumber: state.hintNumber,
            });
          }
        }
      } else if (state.phase === "ROUND_REVEAL" && state.revealEndsAt !== null && now >= state.revealEndsAt) {
        await this.prepareNextTurn(room, now);
      }

      if (state.players.every((player) => player.disconnectedAt && now - player.disconnectedAt > 10 * 60_000)) {
        this.rooms.delete(state.roomId);
      }
    }
  }

  private async createRoom(context: ConnectionContext, displayName: string, settings: RoomSettings, requestId: string): Promise<void> {
    const roomId = randomBytes(4).toString("hex").slice(0, 6);
    const playerId = this.createPlayerId();
    const now = Date.now();
    const state = createRoomState(roomId, playerId, displayName, settings, now);
    const room: RuntimeRoom = { state, connections: new Set([context]) };
    this.rooms.set(roomId, room);
    this.attach(context, roomId, playerId);
    const token = this.createResumeToken();
    context.resumeToken = token;
    await this.persistence.saveResume(token, { roomId, playerId, expiresAt: now + RESUME_WINDOW_MS });
    await this.persist(room);
    this.sendAccepted(context, room, requestId);
    this.sendSnapshot(context, room);
  }

  private async joinRoom(
    context: ConnectionContext,
    roomId: string,
    displayName: string,
    resumeToken: string | undefined,
    requestId: string,
  ): Promise<void> {
    const room = await this.getRoom(roomId);
    if (!room) {
      this.sendError(context, "ROOM_NOT_FOUND", "That room does not exist or has expired.", requestId);
      return;
    }

    if (resumeToken) {
      const record = await this.persistence.loadResume(resumeToken);
      if (record && record.roomId === roomId) {
        const player = this.getPlayer(room.state, record.playerId);
        if (player) {
          await this.resumePlayer(context, room, player, resumeToken, requestId);
          return;
        }
      }
    }

    const now = Date.now();
    const activeCount = room.state.players.filter((player) => !player.disconnectedAt || now - player.disconnectedAt < RESUME_WINDOW_MS).length;
    if (activeCount >= room.state.settings.maxPlayers) {
      this.sendError(context, "ROOM_FULL", "This room is full.", requestId);
      return;
    }
    if (room.state.phase === "GAME_OVER") {
      this.sendError(context, "GAME_OVER", "This game has ended.", requestId);
      return;
    }
    if (!room.state.players.some((player) => player.connected)) {
      this.sendError(context, "ROOM_INACTIVE", "This room is no longer active. Create a new room or ask the host to reconnect.", requestId);
      return;
    }

    const player = createPlayer(this.createPlayerId(), displayName, now);
    room.state.players.push(player);
    room.state.playerOrder.push(player.id);
    if (!this.getPlayer(room.state, room.state.hostPlayerId)?.connected) this.transferHost(room.state);
    room.state.version += 1;
    this.attach(context, roomId, player.id);
    const token = this.createResumeToken();
    context.resumeToken = token;
    await this.persistence.saveResume(token, { roomId, playerId: player.id, expiresAt: now + RESUME_WINDOW_MS });
    await this.persist(room);
    this.sendAccepted(context, room, requestId);
    this.sendSnapshot(context, room);
    this.publish(room, "player.joined", { player: this.presenter.projectPlayer(room.state, player), version: room.state.version });
  }

  private async probeRoom(context: ConnectionContext, roomId: string, requestId: string): Promise<void> {
    const room = await this.getRoom(roomId);
    const active = Boolean(room && room.state.phase !== "GAME_OVER" && room.state.players.some((player) => player.connected));
    this.sendPrivate(context, "room.status", {
      roomId,
      active,
      reason: !room ? "NOT_FOUND" : room.state.phase === "GAME_OVER" ? "GAME_OVER" : active ? null : "INACTIVE",
    }, requestId);
  }

  private async resumeRoom(context: ConnectionContext, roomId: string, resumeToken: string, requestId: string): Promise<void> {
    const record = await this.persistence.loadResume(resumeToken);
    const room = await this.getRoom(roomId);
    if (!record || record.roomId !== roomId || !room) {
      this.sendError(context, "RESUME_EXPIRED", "Your reconnect window has expired. Join as a new player.", requestId);
      return;
    }
    const player = this.getPlayer(room.state, record.playerId);
    if (!player) {
      this.sendError(context, "RESUME_EXPIRED", "Your player session is no longer available.", requestId);
      return;
    }
    await this.resumePlayer(context, room, player, resumeToken, requestId);
  }

  private async resumePlayer(
    context: ConnectionContext,
    room: RuntimeRoom,
    player: PlayerState,
    oldToken: string,
    requestId: string,
  ): Promise<void> {
    for (const existing of [...room.connections]) {
      if (existing.playerId === player.id) {
        existing.socket.close(4001, "replaced by resumed connection");
        room.connections.delete(existing);
      }
    }
    const previousDisconnectedAt = player.disconnectedAt;
    const reconnectWithinWindow = previousDisconnectedAt !== null
      && Date.now() - previousDisconnectedAt <= RESUME_WINDOW_MS;
    player.connected = true;
    player.disconnectedAt = null;
    if (player.id === room.state.currentDrawerId) room.state.drawerGraceEndsAt = null;
    const legacyOriginalHost = room.state.playerOrder[0] === player.id
      && room.state.hostResumePlayerId === null
      && reconnectWithinWindow;
    const restoresHost = room.state.hostResumePlayerId === player.id || legacyOriginalHost;
    if (restoresHost) {
      room.state.hostPlayerId = player.id;
      room.state.hostResumePlayerId = null;
    } else if (!this.getPlayer(room.state, room.state.hostPlayerId)?.connected) {
      this.transferHost(room.state);
    }
    room.state.version += 1;
    this.attach(context, room.state.roomId, player.id);
    await this.persistence.deleteResume(oldToken);
    const token = this.createResumeToken();
    context.resumeToken = token;
    await this.persistence.saveResume(token, {
      roomId: room.state.roomId,
      playerId: player.id,
      expiresAt: Date.now() + RESUME_WINDOW_MS,
    });
    await this.persist(room);
    this.sendAccepted(context, room, requestId, true);
    this.sendSnapshot(context, room);
    if (player.id === room.state.currentDrawerId) {
      if (room.state.phase === "CHOOSING_WORD") {
        this.sendPrivate(context, "turn.wordOptions", { options: room.state.wordOptions });
      } else if (room.state.phase === "DRAWING" && room.state.secretWord !== null) {
        this.sendPrivate(context, "turn.secretWord", { word: room.state.secretWord });
      }
    }
    this.publish(room, "player.reconnected", {
      player: this.presenter.projectPlayer(room.state, player),
      version: room.state.version,
    });
    this.publish(room, "scoreboard.updated", {
      players: this.presenter.projectPlayers(room.state),
      version: room.state.version,
    });
    if (restoresHost) this.publish(room, "room.snapshot", this.presenter.publicSnapshot(room.state));
  }

  private async startGame(room: RuntimeRoom, context: ConnectionContext, expectedVersion: number, requestId: string): Promise<void> {
    if (!this.isHost(room.state, context)) return this.sendError(context, "NOT_HOST", "Only the host can start the game.", requestId);
    if (room.state.phase !== "LOBBY") return this.sendError(context, "INVALID_PHASE", "The game has already started.", requestId);
    if (room.state.version !== expectedVersion) return this.sendError(context, "STALE_VERSION", "The lobby changed. Please try again.", requestId);
    if (room.state.players.filter((player) => player.connected).length < 2) {
      return this.sendError(context, "NOT_ENOUGH_PLAYERS", "At least two connected players are required.", requestId);
    }
    room.state.roundNumber = 1;
    room.state.drawnInRound = [];
    room.state.version += 1;
    await this.prepareNextTurn(room, Date.now());
  }

  private async updateSettings(
    room: RuntimeRoom,
    context: ConnectionContext,
    settings: RoomSettings,
    expectedVersion: number,
    requestId: string,
  ): Promise<void> {
    if (!this.isHost(room.state, context)) return this.sendError(context, "NOT_HOST", "Only the host can edit match settings.", requestId);
    if (room.state.phase !== "LOBBY") return this.sendError(context, "INVALID_PHASE", "Match settings can only be edited before the game starts.", requestId);
    if (room.state.version !== expectedVersion) return this.sendError(context, "STALE_VERSION", "The lobby changed. Please review the settings and try again.", requestId);

    const words = settings.words.map(cleanWord);
    room.state.settings = { ...settings, words };
    room.state.wordPool = words;
    room.state.version += 1;
    await this.persist(room);
    this.publish(room, "room.settings.updated", {
      settings: room.state.settings,
      version: room.state.version,
    });
  }

  private async chooseWord(room: RuntimeRoom, context: ConnectionContext, optionId: string, requestId: string): Promise<void> {
    if (context.playerId !== room.state.currentDrawerId) return this.sendError(context, "NOT_DRAWER", "Only the drawer can choose the word.", requestId);
    if (room.state.phase !== "CHOOSING_WORD") return this.sendError(context, "INVALID_PHASE", "Word selection is closed.", requestId);
    if (!room.state.wordOptions.some((option) => option.id === optionId)) {
      return this.sendError(context, "INVALID_WORD", "That word option is no longer available.", requestId);
    }
    await this.beginDrawing(room, optionId, Date.now());
  }

  private async beginDrawing(room: RuntimeRoom, optionId: string, now: number): Promise<void> {
    const option = room.state.wordOptions.find((candidate) => candidate.id === optionId) ?? room.state.wordOptions[0];
    if (!option) return;
    room.state.secretWord = option.text;
    room.state.phase = "DRAWING";
    room.state.choiceEndsAt = null;
    room.state.turnStartedAt = now;
    room.state.turnEndsAt = now + room.state.settings.turnSeconds * 1000;
    room.state.hintNumber = 0;
    room.state.operations = [];
    room.state.replayOperations = [];
    room.state.guessedPlayerIds = [];
    room.state.drawerGraceEndsAt = null;
    room.state.drawerBonusAwarded = 0;
    room.state.eligibleGuesserIds = room.state.players
      .filter((player) => player.id !== room.state.currentDrawerId && player.connected)
      .map((player) => player.id);
    room.state.version += 1;
    await this.persist(room);
    this.publish(room, "turn.drawingStarted", {
      drawerId: room.state.currentDrawerId,
      roundNumber: room.state.roundNumber,
      maskedWord: maskWord(room.state.secretWord, 0),
      turnEndsAt: room.state.turnEndsAt,
    });
    const drawer = this.findConnection(room, room.state.currentDrawerId);
    if (drawer) this.sendPrivate(drawer, "turn.secretWord", { word: room.state.secretWord });
  }

  private async applyDrawingOperation(
    room: RuntimeRoom,
    context: ConnectionContext,
    operation: DrawingOperation,
    requestId: string,
  ): Promise<void> {
    if (context.playerId !== room.state.currentDrawerId) return this.sendError(context, "NOT_DRAWER", "Only the drawer can draw.", requestId);
    if (room.state.phase !== "DRAWING") return this.sendError(context, "INVALID_PHASE", "Drawing is not active.", requestId);
    if ((room.state.turnEndsAt ?? 0) <= Date.now()) return this.sendError(context, "TURN_ENDED", "The turn has ended.", requestId);
    const now = Date.now();
    context.drawTimes = context.drawTimes.filter((time) => now - time < 1000);
    if (context.drawTimes.length >= 60) return this.sendError(context, "RATE_LIMITED", "Drawing too quickly. Slow down.", requestId);
    context.drawTimes.push(now);
    const parsed = drawingOperationSchema.safeParse(operation);
    if (!parsed.success) return this.sendError(context, "INVALID_DRAWING", "That drawing operation was invalid.", requestId);
    if (room.state.operations.some((candidate) => candidate.id === operation.id)) return;
    if (operation.kind === "undo" && !room.state.operations.some((candidate) => candidate.id === operation.targetId)) {
      return this.sendError(context, "INVALID_UNDO", "That stroke no longer exists.", requestId);
    }

    const canonical: RoomOperation = {
      ...operation,
      eventSeq: room.state.eventSeq + 1,
      serverTime: now,
    } as RoomOperation;
    room.state.eventSeq = canonical.eventSeq;
    room.state.operations.push(canonical);
    room.state.replayOperations.push(canonical);
    room.state.version += 1;
    await this.persist(room, canonical);
    this.broadcastEvent(room, "drawing.operation", { operation: canonical }, canonical.eventSeq);
  }

  private async handleChat(room: RuntimeRoom, context: ConnectionContext, text: string, requestId: string): Promise<void> {
    if (!context.playerId) return;
    const now = Date.now();
    context.chatTimes = context.chatTimes.filter((time) => now - time < 10_000);
    if (context.chatTimes.length >= 5) return this.sendError(context, "RATE_LIMITED", "Please slow down your messages.", requestId);
    context.chatTimes.push(now);

    const player = this.getPlayer(room.state, context.playerId);
    if (!player) return;
    const safeText = text.trim().slice(0, 200);
    const secret = room.state.phase === "DRAWING" ? room.state.secretWord : null;
    if (secret && player.id !== room.state.currentDrawerId && normalizeAnswer(safeText) === normalizeAnswer(secret)) {
      await this.acceptGuess(room, context, player, now);
      return;
    }
    if (secret && player.id !== room.state.currentDrawerId && isNearMiss(safeText, secret)) {
      this.sendPrivate(context, "player.close", { message: "close!" });
    }
    this.publish(room, "chat.message", {
      playerId: player.id,
      displayName: player.displayName,
      text: safeText,
    });
  }

  private async acceptGuess(room: RuntimeRoom, context: ConnectionContext, player: PlayerState, now: number): Promise<void> {
    if (room.state.guessedPlayerIds.includes(player.id)) {
      this.sendPrivate(context, "guess.alreadyAccepted", { message: "You already guessed correctly." });
      return;
    }
    const remaining = Math.max(0, (room.state.turnEndsAt ?? now) - now);
    const points = calculateGuessPoints(remaining, room.state.settings.turnSeconds * 1000);
    player.score += points;
    player.guessed = true;
    room.state.guessedPlayerIds.push(player.id);
    const drawer = this.getPlayer(room.state, room.state.currentDrawerId);
    if (drawer && room.state.drawerBonusAwarded < 150) {
      const bonus = Math.min(50, 150 - room.state.drawerBonusAwarded);
      drawer.score += bonus;
      room.state.drawerBonusAwarded += bonus;
    }
    room.state.version += 1;
    await this.persist(room);
    this.sendPrivate(context, "guess.accepted", { points, totalScore: player.score });
    this.publish(room, "guess.correct", {
      playerId: player.id,
      displayName: player.displayName,
      points,
    });
    this.publish(room, "scoreboard.updated", { players: this.presenter.projectPlayers(room.state) });
    if (room.state.eligibleGuesserIds.length > 0 && room.state.eligibleGuesserIds.every((id) => room.state.guessedPlayerIds.includes(id))) {
      await this.endRound(room, now, "everyone-guessed");
    }
  }

  private async endRound(room: RuntimeRoom, now: number, reason: string): Promise<void> {
    if (!["DRAWING", "CHOOSING_WORD"].includes(room.state.phase)) return;
    room.state.phase = "ROUND_REVEAL";
    room.state.revealEndsAt = now + 4_000;
    room.state.choiceEndsAt = null;
    room.state.turnEndsAt = null;
    room.state.drawerGraceEndsAt = null;
    room.state.version += 1;
    const replay: Replay = {
      roundNumber: room.state.roundNumber,
      drawerId: room.state.currentDrawerId ?? "",
      word: room.state.secretWord ?? "",
      operations: [...room.state.replayOperations],
    };
    room.state.replays.push(replay);
    await this.persist(room);
    this.publish(room, "turn.ended", {
      roundNumber: room.state.roundNumber,
      reason,
      word: room.state.secretWord,
      drawerId: room.state.currentDrawerId,
      operations: room.state.replayOperations,
    });
  }

  private async prepareNextTurn(room: RuntimeRoom, now: number): Promise<void> {
    const available = room.state.players.filter((player) => player.connected).map((player) => player.id);
    if (available.length < 2) {
      await this.finishGame(room, "not-enough-players");
      return;
    }

    let next = room.state.playerOrder.find(
      (id) => available.includes(id) && !room.state.drawnInRound.includes(id),
    );
    if (!next) {
      if (room.state.roundNumber >= room.state.settings.rounds) {
        await this.finishGame(room, "completed");
        return;
      }
      room.state.roundNumber += 1;
      room.state.drawnInRound = [];
      next = room.state.playerOrder.find((id) => available.includes(id));
    }
    if (!next) return;
    room.state.currentDrawerId = next;
    room.state.drawnInRound.push(next);
    room.state.drawerIndex = room.state.playerOrder.indexOf(next);
    room.state.phase = "CHOOSING_WORD";
    room.state.choiceEndsAt = now + room.state.settings.choiceSeconds * 1000;
    room.state.revealEndsAt = null;
    room.state.turnStartedAt = null;
    room.state.turnEndsAt = null;
    room.state.secretWord = null;
    room.state.wordOptions = chooseWordOptions(room.state.wordPool, 3);
    room.state.operations = [];
    room.state.replayOperations = [];
    room.state.guessedPlayerIds = [];
    room.state.eligibleGuesserIds = [];
    room.state.hintNumber = 0;
    room.state.drawerGraceEndsAt = null;
    room.state.drawerBonusAwarded = 0;
    room.state.version += 1;
    await this.persist(room);
    this.publish(room, "turn.started", {
      roundNumber: room.state.roundNumber,
      drawerId: room.state.currentDrawerId,
      choiceEndsAt: room.state.choiceEndsAt,
      maskedWord: null,
    });
    const drawer = this.findConnection(room, room.state.currentDrawerId);
    if (drawer) this.sendPrivate(drawer, "turn.wordOptions", { options: room.state.wordOptions });
  }

  private async finishGame(room: RuntimeRoom, reason: "completed" | "not-enough-players"): Promise<void> {
    if (room.state.phase === "GAME_OVER") return;

    if (["CHOOSING_WORD", "DRAWING"].includes(room.state.phase)
      && room.state.roundNumber > 0
      && !room.state.replays.some((replay) => replay.roundNumber === room.state.roundNumber)
      && (room.state.secretWord || room.state.replayOperations.length > 0)) {
      room.state.replays.push({
        roundNumber: room.state.roundNumber,
        drawerId: room.state.currentDrawerId ?? "",
        word: room.state.secretWord ?? "",
        operations: [...room.state.replayOperations],
      });
    }

    room.state.phase = "GAME_OVER";
    room.state.choiceEndsAt = null;
    room.state.turnEndsAt = null;
    room.state.revealEndsAt = null;
    room.state.drawerGraceEndsAt = null;
    room.state.currentDrawerId = null;
    room.state.wordOptions = [];
    room.state.version += 1;
    await this.persist(room);
    this.publish(room, "game.ended", {
      reason,
      version: room.state.version,
      players: this.presenter.projectPlayers(room.state).sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName)),
      replays: room.state.replays,
    });
  }

  private async finishIfNotEnoughPlayers(room: RuntimeRoom, permanentDeparture = false, now = Date.now()): Promise<boolean> {
    const activePhase = ["CHOOSING_WORD", "DRAWING", "ROUND_REVEAL"].includes(room.state.phase);
    const connectedPlayers = room.state.players.filter((player) => player.connected).length;
    if (!activePhase || connectedPlayers >= 2) return false;
    const resumablePlayer = room.state.players.some(
      (player) => !player.connected
        && player.disconnectedAt !== null
        && now - player.disconnectedAt <= RESUME_WINDOW_MS,
    );
    if (!permanentDeparture && resumablePlayer) return false;
    await this.finishGame(room, "not-enough-players");
    return true;
  }

  private async expireHostReservation(room: RuntimeRoom, now: number): Promise<void> {
    const reservedHostId = room.state.hostResumePlayerId;
    if (!reservedHostId) return;
    const reservedHost = this.getPlayer(room.state, reservedHostId);
    if (!reservedHost || reservedHost.connected || reservedHost.disconnectedAt === null
      || now - reservedHost.disconnectedAt <= RESUME_WINDOW_MS) return;

    room.state.hostResumePlayerId = null;
    const previousHostId = room.state.hostPlayerId;
    if (!this.getPlayer(room.state, room.state.hostPlayerId)?.connected) this.transferHost(room.state);
    if (room.state.hostPlayerId === previousHostId && room.state.hostResumePlayerId === null) {
      room.state.version += 1;
      await this.persist(room);
      this.publish(room, "room.snapshot", this.presenter.publicSnapshot(room.state));
      return;
    }
    room.state.version += 1;
    await this.persist(room);
    this.publish(room, "room.snapshot", this.presenter.publicSnapshot(room.state));
  }

  private async getRoom(roomId: string): Promise<RuntimeRoom | null> {
    const current = this.rooms.get(roomId);
    if (current) return current;
    const state = await this.persistence.loadRoom(roomId);
    if (!state) return null;
    const room = { state, connections: new Set<ConnectionContext>() };
    this.rooms.set(roomId, room);
    return room;
  }

  private requireRoom(context: ConnectionContext): RuntimeRoom | null {
    if (!context.roomId) {
      this.sendError(context, "NOT_JOINED", "Join or create a room first.");
      return null;
    }
    const room = this.rooms.get(context.roomId);
    if (!room) {
      this.sendError(context, "ROOM_NOT_FOUND", "That room is no longer available.");
      return null;
    }
    return room;
  }

  private attach(context: ConnectionContext, roomId: string, playerId: string): void {
    context.roomId = roomId;
    context.playerId = playerId;
    const room = this.rooms.get(roomId);
    if (room) room.connections.add(context);
  }

  private sendAccepted(context: ConnectionContext, room: RuntimeRoom, requestId: string, resumed = false): void {
    this.events.sendAccepted(context, room, requestId, resumed);
  }

  private sendSnapshot(context: ConnectionContext, room: RuntimeRoom, requestId?: string): void {
    this.events.sendSnapshot(context, room, requestId);
  }

  private publish(room: RuntimeRoom, type: string, payload: unknown): void {
    this.events.publish(room, type, payload);
  }

  private broadcastEvent(room: RuntimeRoom, type: string, payload: unknown, eventSeq?: number): void {
    if (type === "drawing.operation" && eventSeq !== undefined) {
      this.events.sendDrawingOperation(room, payload, eventSeq);
      return;
    }
    this.events.publish(room, type, payload);
  }

  private sendPrivate(context: ConnectionContext, type: string, payload: unknown, requestId?: string): void {
    this.events.sendPrivate(context, type, payload, requestId);
  }

  private sendError(context: ConnectionContext, code: string, message: string, requestId?: string): void {
    this.events.sendError(context, code, message, requestId);
  }

  private async persist(room: RuntimeRoom, event?: unknown): Promise<void> {
    await this.persistence.saveRoom(room.state, event);
  }

  private getPlayer(state: RoomState, playerId: string | null): PlayerState | null {
    return state.players.find((player) => player.id === playerId) ?? null;
  }

  private findConnection(room: RuntimeRoom, playerId: string | null): ConnectionContext | null {
    if (!playerId) return null;
    return [...room.connections].find((connection) => connection.playerId === playerId) ?? null;
  }

  private isHost(state: RoomState, context: ConnectionContext): boolean {
    return context.playerId === state.hostPlayerId;
  }

  private transferHost(state: RoomState): void {
    const next = state.players.find((player) => player.connected);
    if (next) state.hostPlayerId = next.id;
  }

  private createPlayerId(): string {
    return `p_${randomBytes(8).toString("hex")}`;
  }

  private createResumeToken(): string {
    return `${randomBytes(18).toString("base64url")}.${randomBytes(12).toString("base64url")}`;
  }
}

