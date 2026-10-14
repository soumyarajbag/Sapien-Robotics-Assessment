import type { DrawingOperation, RoomSettings } from "@sapien/protocol";

export type Phase = "LOBBY" | "CHOOSING_WORD" | "DRAWING" | "ROUND_REVEAL" | "GAME_OVER";

export type WordOption = {
  id: string;
  text: string;
};

export type PlayerState = {
  id: string;
  displayName: string;
  score: number;
  connected: boolean;
  joinedAt: number;
  guessed: boolean;
  disconnectedAt: number | null;
};

export type RoomOperation = DrawingOperation & {
  eventSeq: number;
  serverTime: number;
};

export type Replay = {
  roundNumber: number;
  drawerId: string;
  word: string;
  operations: RoomOperation[];
};

export type RoomState = {
  roomId: string;
  matchId: string;
  serverEpoch: string;
  eventSeq: number;
  version: number;
  phase: Phase;
  settings: RoomSettings;
  wordPool: string[];
  players: PlayerState[];
  hostPlayerId: string;
  hostResumePlayerId: string | null;
  playerOrder: string[];
  drawerIndex: number;
  currentDrawerId: string | null;
  roundNumber: number;
  drawnInRound: string[];
  choiceEndsAt: number | null;
  turnStartedAt: number | null;
  turnEndsAt: number | null;
  revealEndsAt: number | null;
  secretWord: string | null;
  wordOptions: WordOption[];
  hintNumber: number;
  operations: RoomOperation[];
  replayOperations: RoomOperation[];
  replays: Replay[];
  guessedPlayerIds: string[];
  eligibleGuesserIds: string[];
  drawerGraceEndsAt: number | null;
  drawerBonusAwarded: number;
  lastActivityAt: number;
};

export function normalizeAnswer(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

export function cleanWord(input: string): string {
  return input.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function calculateGuessPoints(remainingMs: number, turnDurationMs: number): number {
  const remaining = Math.max(0, Math.min(remainingMs, turnDurationMs));
  return 100 + Math.floor(400 * (remaining / turnDurationMs));
}

export function isNearMiss(guess: string, answer: string): boolean {
  const a = normalizeAnswer(guess);
  const b = normalizeAnswer(answer);
  if (!a || !b || a === b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  return levenshtein(a, b) <= 2;
}

export function maskWord(word: string, hintNumber: number): string {
  const letters = [...word];
  const revealable = letters
    .map((char, index) => ({ char, index }))
    .filter(({ char }) => /[\p{L}\p{N}]/u.test(char));
  const revealCount = Math.min(revealable.length, Math.max(0, hintNumber));
  const revealed = new Set<number>();
  for (let i = 0; i < revealCount; i += 1) {
    const position = Math.floor((i * revealable.length) / Math.max(1, revealCount));
    revealed.add(revealable[position]?.index ?? revealable[i].index);
  }
  return letters
    .map((char, index) => {
      if (!/[\p{L}\p{N}]/u.test(char)) return char;
      return revealed.has(index) ? char : "_";
    })
    .join(" ");
}

export function chooseWordOptions(words: string[], count = 3): WordOption[] {
  const unique = [...new Set(words.map(cleanWord).filter(Boolean))];
  const shuffled = [...unique];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((text, index) => ({
    id: `option-${index}-${Math.random().toString(36).slice(2, 8)}`,
    text,
  }));
}

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}

