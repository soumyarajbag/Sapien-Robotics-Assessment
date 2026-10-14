import type {
  PlayerProjection,
  PublicOperation,
  PublicRoomSnapshot,
  ServerEvent,
} from "@sapien/protocol";
import { MAX_CHAT_LINES } from "../../shared/constants";
import type { ChatLine, ClientGameState, Replay, SoundCueName, WordOption } from "../../shared/types/game";

export type GameAction =
  | { type: "server-event"; event: ServerEvent }
  | { type: "connection-status"; connected: boolean }
  | { type: "dismiss-toast" }
  | { type: "set-toast"; message: string };

type AcceptedPayload = {
  roomId: string;
  playerId: string;
  resumeToken: string;
  resumed: boolean;
};

type PlayerEventPayload = { player: PlayerProjection; version: number };
type DrawingStartedPayload = { roundNumber: number; drawerId: string; maskedWord: string; turnEndsAt: number };
type TurnStartedPayload = { roundNumber: number; drawerId: string; choiceEndsAt: number };
type DrawingPayload = { operation: PublicOperation };

function eventSeq(state: ClientGameState, event: ServerEvent): number {
  return Math.max(state.snapshot?.eventSeq ?? 0, event.eventSeq ?? 0);
}

function withSnapshot(
  state: ClientGameState,
  event: ServerEvent,
  update: (snapshot: PublicRoomSnapshot) => PublicRoomSnapshot,
): ClientGameState {
  if (!state.snapshot) return state;
  return { ...state, snapshot: update(state.snapshot) };
}

function appendChatLine(state: ClientGameState, line: ChatLine): ClientGameState {
  return { ...state, chat: [...state.chat.slice(-MAX_CHAT_LINES), line] };
}

function replacePlayer(players: PlayerProjection[], incoming: PlayerProjection): PlayerProjection[] {
  const exists = players.some((player) => player.id === incoming.id);
  return exists
    ? players.map((player) => (player.id === incoming.id ? incoming : player))
    : [...players, incoming];
}

function isOlderVersion(snapshot: PublicRoomSnapshot, version: number | undefined): boolean {
  return version !== undefined && version < snapshot.version;
}

function hostIdFromPlayers(players: PlayerProjection[], fallback: string): string {
  return players.find((player) => player.isHost)?.id ?? fallback;
}

function withSoundCue(state: ClientGameState, event: ServerEvent, name: SoundCueName): ClientGameState {
  return {
    ...state,
    soundCue: { name, key: `${event.type}:${event.serverTime}:${event.eventSeq ?? "private"}` },
  };
}

export function reduceGameState(state: ClientGameState, action: GameAction): ClientGameState {
  if (action.type === "connection-status") return { ...state, connected: action.connected };
  if (action.type === "dismiss-toast") return { ...state, toast: null };
  if (action.type === "set-toast") return { ...state, toast: action.message };

  const { event } = action;
  const baseState = { ...state, serverOffset: event.serverTime - Date.now() };

  switch (event.type) {
    case "connection.accepted": {
      const payload = event.payload as AcceptedPayload;
      return {
        ...baseState,
        roomId: payload.roomId,
        roomAvailability: "available",
        playerId: payload.playerId,
        resumeToken: payload.resumeToken,
        connected: true,
        toast: payload.resumed ? "Welcome back — your score is safe." : null,
      };
    }
    case "room.snapshot": {
      const snapshot = event.payload as PublicRoomSnapshot;
      if (state.snapshot && snapshot.version < state.snapshot.version) return baseState;
      const revealReplay = snapshot.phase === "ROUND_REVEAL" && snapshot.revealedWord !== null
        ? { roundNumber: snapshot.roundNumber, word: snapshot.revealedWord, operations: snapshot.replayOperations }
        : null;
      const replays = revealReplay
        ? [...state.replays.filter((replay) => replay.roundNumber !== revealReplay.roundNumber), revealReplay]
        : state.replays;
      return { ...baseState, snapshot, replays, roomAvailability: "available", connected: true };
    }
    case "room.status": {
      const payload = event.payload as { active: boolean; reason?: string | null };
      return {
        ...baseState,
        roomAvailability: payload.active ? "available" : "unavailable",
        toast: payload.active ? null : "This room is no longer active. Create a new room to start playing.",
      };
    }
    case "turn.wordOptions":
      return { ...baseState, wordOptions: (event.payload as { options: WordOption[] }).options };
    case "turn.secretWord":
      return { ...baseState, secretWord: (event.payload as { word: string }).word };
    case "turn.started": {
      const payload = event.payload as TurnStartedPayload;
      const next = withSnapshot(
        { ...baseState, wordOptions: [], secretWord: null },
        event,
        (snapshot) => ({
          ...snapshot,
          phase: "CHOOSING_WORD",
          roundNumber: payload.roundNumber,
          currentDrawerId: payload.drawerId,
          choiceEndsAt: payload.choiceEndsAt,
          turnEndsAt: null,
          maskedWord: null,
          operations: [],
          replayOperations: [],
          revealedWord: null,
          eventSeq: eventSeq(state, event),
        }),
      );
      return withSoundCue(next, event, "round-start");
    }
    case "turn.drawingStarted": {
      const payload = event.payload as DrawingStartedPayload;
      return withSnapshot(baseState, event, (snapshot) => ({
        ...snapshot,
        phase: "DRAWING",
        roundNumber: payload.roundNumber,
        currentDrawerId: payload.drawerId,
        choiceEndsAt: null,
        turnEndsAt: payload.turnEndsAt,
        maskedWord: payload.maskedWord,
        hintNumber: 0,
        operations: [],
        replayOperations: [],
        revealedWord: null,
        eventSeq: eventSeq(state, event),
      }));
    }
    case "hint.updated": {
      const payload = event.payload as { maskedWord: string; hintNumber: number };
      return withSnapshot(baseState, event, (snapshot) => ({
        ...snapshot,
        maskedWord: payload.maskedWord,
        hintNumber: payload.hintNumber,
        eventSeq: eventSeq(state, event),
      }));
    }
    case "drawing.operation": {
      const payload = event.payload as DrawingPayload;
      return withSnapshot(baseState, event, (snapshot) => snapshot.operations.some((operation) => operation.id === payload.operation.id)
        ? snapshot
        : { ...snapshot, operations: [...snapshot.operations, payload.operation], eventSeq: eventSeq(state, event) });
    }
    case "player.joined":
    case "player.reconnected": {
      const payload = event.payload as PlayerEventPayload;
      if (state.snapshot && isOlderVersion(state.snapshot, payload.version)) return baseState;
      const next = withSnapshot(baseState, event, (snapshot) => ({
        ...snapshot,
        version: payload.version,
        hostPlayerId: payload.player.isHost ? payload.player.id : snapshot.hostPlayerId,
        players: replacePlayer(snapshot.players, payload.player),
        eventSeq: eventSeq(state, event),
      }));
      return withSoundCue({ ...next, toast: `${payload.player.displayName} reconnected.` }, event, "reconnect");
    }
    case "player.left": {
      const payload = event.payload as { playerId: string; displayName?: string; player?: PlayerProjection; version?: number };
      if (state.snapshot && isOlderVersion(state.snapshot, payload.version)) return baseState;
      const next = withSnapshot(baseState, event, (snapshot) => ({
        ...snapshot,
        version: payload.version ?? snapshot.version,
        hostPlayerId: hostIdFromPlayers(payload.player ? [payload.player, ...snapshot.players] : snapshot.players, snapshot.hostPlayerId),
        players: payload.player
          ? replacePlayer(snapshot.players, payload.player)
          : snapshot.players.map((player) => player.id === payload.playerId ? { ...player, connected: false } : player),
        eventSeq: eventSeq(state, event),
      }));
      const displayName = payload.displayName ?? payload.player?.displayName ?? "A player";
      const notified = withSoundCue({ ...next, toast: `${displayName} went offline. Their score is kept and they have 30 seconds to reconnect.` }, event, "disconnect");
      return appendChatLine(notified, {
        id: crypto.randomUUID(),
        kind: "warning",
        text: `${displayName} went offline. They are no longer eligible for this turn.`,
      });
    }
    case "chat.message": {
      const payload = event.payload as { displayName: string; text: string };
      return appendChatLine(baseState, {
        id: crypto.randomUUID(),
        kind: "chat",
        displayName: payload.displayName,
        text: payload.text,
      });
    }
    case "guess.correct": {
      const payload = event.payload as { displayName: string; points: number };
      return withSoundCue(appendChatLine(baseState, {
        id: crypto.randomUUID(),
        kind: "success",
        text: `${payload.displayName} guessed correctly (+${payload.points})`,
      }), event, "correct");
    }
    case "scoreboard.updated": {
      const payload = event.payload as { players: PlayerProjection[]; version?: number };
      if (state.snapshot && isOlderVersion(state.snapshot, payload.version)) return baseState;
      return withSnapshot(baseState, event, (snapshot) => ({
        ...snapshot,
        players: payload.players,
        hostPlayerId: hostIdFromPlayers(payload.players, snapshot.hostPlayerId),
        version: payload.version ?? snapshot.version,
        eventSeq: eventSeq(state, event),
      }));
    }
    case "room.settings.updated": {
      const payload = event.payload as { settings: PublicRoomSnapshot["settings"]; version: number };
      const next = withSnapshot(baseState, event, (snapshot) => ({
        ...snapshot,
        settings: payload.settings,
        totalRounds: payload.settings.rounds,
        version: payload.version,
        eventSeq: eventSeq(state, event),
      }));
      return { ...next, toast: "Match settings updated. Your room and players are unchanged." };
    }
    case "player.close":
      return withSoundCue({ ...baseState, toast: "Close!" }, event, "near-miss");
    case "guess.accepted":
      return { ...baseState, toast: `Correct! +${(event.payload as { points: number }).points} points` };
    case "turn.ended": {
      const payload = event.payload as { roundNumber: number; word: string; operations: PublicOperation[] };
      const replay: Replay = { roundNumber: payload.roundNumber, word: payload.word, operations: payload.operations };
      const next = withSnapshot(
        { ...baseState, replays: [...state.replays.filter((item) => item.roundNumber !== replay.roundNumber), replay] },
        event,
        (snapshot) => ({
          ...snapshot,
          phase: "ROUND_REVEAL",
          turnEndsAt: null,
          choiceEndsAt: null,
          revealedWord: payload.word,
          replayOperations: payload.operations,
          eventSeq: eventSeq(state, event),
        }),
      );
      const nextWithSound = withSoundCue(next, event, "round-end");
      return appendChatLine(nextWithSound, {
        id: crypto.randomUUID(),
        kind: "system",
        text: `Round ${payload.roundNumber} ended — the word was “${payload.word}”.`,
      });
    }
    case "game.ended": {
      const payload = event.payload as { replays: Replay[]; players?: PlayerProjection[]; version?: number };
      const next = withSnapshot({ ...baseState, replays: payload.replays }, event, (snapshot) => ({
        ...snapshot,
        phase: "GAME_OVER",
        currentDrawerId: null,
        turnEndsAt: null,
        choiceEndsAt: null,
        players: payload.players ?? snapshot.players,
        version: payload.version ?? snapshot.version,
        eventSeq: eventSeq(state, event),
      }));
      return withSoundCue(next, event, "round-end");
    }
    case "game.waiting":
    case "error": {
      const payload = event.payload as { code?: string; message: string };
      const roomUnavailable = ["ROOM_NOT_FOUND", "ROOM_INACTIVE", "GAME_OVER"].includes(payload.code ?? "");
      const next = {
        ...baseState,
        roomAvailability: roomUnavailable ? "unavailable" : baseState.roomAvailability,
        toast: roomUnavailable ? "This room is no longer active. Create a new room to start playing." : payload.message,
      };
      return withSoundCue(next, event, "error");
    }
    default:
      return baseState;
  }
}
