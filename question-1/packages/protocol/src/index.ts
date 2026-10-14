import { z } from "zod";

export const toolSchema = z.enum(["pen", "eraser", "fill"]);
export type Tool = z.infer<typeof toolSchema>;

export const roomSettingsSchema = z.object({
  rounds: z.number().int().min(1).max(10),
  turnSeconds: z.number().int().min(30).max(180),
  choiceSeconds: z.number().int().min(5).max(30).default(15),
  hintEverySeconds: z.number().int().min(5).max(60).default(10),
  maxPlayers: z.number().int().min(2).max(12).default(12),
  words: z.array(z.string().trim().min(1).max(40)).min(10).max(500),
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

const coordinate = z.number().min(0).max(1);
const point = z.tuple([coordinate, coordinate]);

export const strokeOperationSchema = z.object({
  kind: z.literal("stroke"),
  id: z.string().min(8).max(80),
  tool: z.enum(["pen", "eraser"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.number().min(1).max(80),
  points: z.array(point).min(1).max(4096),
});

export const undoOperationSchema = z.object({
  kind: z.literal("undo"),
  id: z.string().min(8).max(80),
  targetId: z.string().min(8).max(80),
});

export const clearOperationSchema = z.object({
  kind: z.literal("clear"),
  id: z.string().min(8).max(80),
});

export const fillOperationSchema = z.object({
  kind: z.literal("fill"),
  id: z.string().min(8).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  point,
});

export const drawingOperationSchema = z.discriminatedUnion("kind", [
  strokeOperationSchema,
  undoOperationSchema,
  clearOperationSchema,
  fillOperationSchema,
]);
export type DrawingOperation = z.infer<typeof drawingOperationSchema>;

export const createRoomMessageSchema = z.object({
  type: z.literal("room.create"),
  requestId: z.string().min(1).max(100),
  payload: z.object({
    displayName: z.string().trim().min(1).max(24),
    settings: roomSettingsSchema,
  }),
});

export const joinRoomMessageSchema = z.object({
  type: z.literal("room.join"),
  requestId: z.string().min(1).max(100),
  payload: z.object({
    roomId: z.string().regex(/^[a-z0-9]{6}$/),
    displayName: z.string().trim().min(1).max(24),
    resumeToken: z.string().min(20).max(300).optional(),
  }),
});

export const resumeMessageSchema = z.object({
  type: z.literal("room.resume"),
  requestId: z.string().min(1).max(100),
  payload: z.object({
    roomId: z.string().regex(/^[a-z0-9]{6}$/),
    resumeToken: z.string().min(20).max(300),
    lastEventSeq: z.number().int().min(0).optional(),
  }),
});

export const probeRoomMessageSchema = z.object({
  type: z.literal("room.probe"),
  requestId: z.string().min(1).max(100),
  payload: z.object({
    roomId: z.string().regex(/^[a-z0-9]{6}$/),
  }),
});

export const leaveRoomMessageSchema = z.object({
  type: z.literal("room.leave"),
  requestId: z.string().min(1).max(100),
  payload: z.object({}),
});

export const updateRoomSettingsMessageSchema = z.object({
  type: z.literal("room.settings.update"),
  requestId: z.string().min(1).max(100),
  payload: z.object({
    expectedVersion: z.number().int().min(0),
    settings: roomSettingsSchema,
  }),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  createRoomMessageSchema,
  joinRoomMessageSchema,
  resumeMessageSchema,
  probeRoomMessageSchema,
  leaveRoomMessageSchema,
  updateRoomSettingsMessageSchema,
  z.object({
    type: z.literal("room.start"),
    requestId: z.string().min(1).max(100),
    payload: z.object({ expectedVersion: z.number().int().min(0) }),
  }),
  z.object({
    type: z.literal("turn.chooseWord"),
    requestId: z.string().min(1).max(100),
    payload: z.object({ optionId: z.string().min(1).max(80) }),
  }),
  z.object({
    type: z.literal("draw.operation"),
    requestId: z.string().min(1).max(100),
    payload: z.object({ operation: drawingOperationSchema }),
  }),
  z.object({
    type: z.literal("chat.send"),
    requestId: z.string().min(1).max(100),
    payload: z.object({ text: z.string().trim().min(1).max(200) }),
  }),
  z.object({
    type: z.literal("room.sync"),
    requestId: z.string().min(1).max(100),
    payload: z.object({ lastEventSeq: z.number().int().min(0).optional() }),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type PlayerProjection = {
  id: string;
  displayName: string;
  score: number;
  connected: boolean;
  isHost: boolean;
  guessed: boolean;
};

export type PublicOperation = DrawingOperation & {
  eventSeq: number;
  serverTime: number;
};

export type PublicRoomSnapshot = {
  roomId: string;
  matchId: string;
  serverEpoch: string;
  eventSeq: number;
  version: number;
  phase: "LOBBY" | "CHOOSING_WORD" | "DRAWING" | "ROUND_REVEAL" | "GAME_OVER";
  settings: RoomSettings;
  players: PlayerProjection[];
  hostPlayerId: string;
  currentDrawerId: string | null;
  roundNumber: number;
  totalRounds: number;
  choiceEndsAt: number | null;
  turnEndsAt: number | null;
  maskedWord: string | null;
  hintNumber: number;
  operations: PublicOperation[];
  revealedWord: string | null;
  replayOperations: PublicOperation[];
};

export type ServerEvent<T = unknown> = {
  type: string;
  roomId?: string;
  requestId?: string;
  serverEpoch?: string;
  eventSeq?: number;
  serverTime: number;
  payload: T;
};

