import { randomUUID } from "node:crypto";
import type { RoomSettings } from "@sapien/protocol";
import { cleanWord, type PlayerState, type RoomState } from "@sapien/game-core";

export function createPlayer(id: string, displayName: string, now = Date.now()): PlayerState {
  return {
    id,
    displayName,
    score: 0,
    connected: true,
    joinedAt: now,
    guessed: false,
    disconnectedAt: null,
  };
}

export function createRoomState(
  roomId: string,
  playerId: string,
  displayName: string,
  settings: RoomSettings,
  now = Date.now(),
): RoomState {
  const words = settings.words.map(cleanWord);
  return {
    roomId,
    matchId: randomUUID(),
    serverEpoch: randomUUID(),
    eventSeq: 0,
    version: 0,
    phase: "LOBBY",
    settings: {
      ...settings,
      words,
      choiceSeconds: settings.choiceSeconds ?? 15,
      hintEverySeconds: settings.hintEverySeconds ?? 10,
      maxPlayers: settings.maxPlayers ?? 12,
    },
    wordPool: words,
    players: [createPlayer(playerId, displayName, now)],
    hostPlayerId: playerId,
    hostResumePlayerId: null,
    playerOrder: [playerId],
    drawerIndex: -1,
    drawnInRound: [],
    currentDrawerId: null,
    roundNumber: 0,
    choiceEndsAt: null,
    turnStartedAt: null,
    turnEndsAt: null,
    revealEndsAt: null,
    secretWord: null,
    wordOptions: [],
    hintNumber: 0,
    operations: [],
    replayOperations: [],
    replays: [],
    guessedPlayerIds: [],
    eligibleGuesserIds: [],
    drawerGraceEndsAt: null,
    drawerBonusAwarded: 0,
    lastActivityAt: now,
  };
}
