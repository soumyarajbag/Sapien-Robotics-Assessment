import type {
  DrawingOperation,
  PlayerProjection,
  PublicOperation,
  PublicRoomSnapshot,
} from "@sapien/protocol";

export type Replay = {
  roundNumber: number;
  word: string;
  operations: PublicOperation[];
};

export type ChatLine = {
  id: string;
  kind: "chat" | "system" | "success" | "warning";
  text: string;
  displayName?: string;
};

export type WordOption = { id: string; text: string };
export type RoomAvailability = "new" | "checking" | "available" | "unavailable";
export type SoundCueName = "correct" | "near-miss" | "disconnect" | "reconnect" | "round-start" | "round-end" | "error";

export type ClientGameState = {
  snapshot: PublicRoomSnapshot | null;
  roomId: string | null;
  roomAvailability: RoomAvailability;
  playerId: string | null;
  resumeToken: string | null;
  connected: boolean;
  serverOffset: number;
  wordOptions: WordOption[];
  secretWord: string | null;
  chat: ChatLine[];
  replays: Replay[];
  toast: string | null;
  soundCue: { name: SoundCueName; key: string } | null;
};

export type DrawingStroke = Extract<DrawingOperation, { kind: "stroke" }>;

export type ScoreboardProps = {
  players: PlayerProjection[];
  drawerId: string | null;
  playerId: string;
};

export function createInitialGameState(roomId: string | null): ClientGameState {
  return {
    snapshot: null,
    roomId,
    roomAvailability: roomId ? "checking" : "new",
    playerId: null,
    resumeToken: null,
    connected: false,
    serverOffset: 0,
    wordOptions: [],
    secretWord: null,
    chat: [],
    replays: [],
    toast: null,
    soundCue: null,
  };
}
