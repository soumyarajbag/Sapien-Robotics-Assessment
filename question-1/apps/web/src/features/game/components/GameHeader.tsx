import { formatTime } from "../../../shared/lib/browser";
import type { ClientGameState } from "../../../shared/types/game";

type GameHeaderProps = {
  state: ClientGameState;
  remainingMs: number;
  isDrawer: boolean;
};

export function GameHeader({ state, remainingMs, isDrawer }: GameHeaderProps): JSX.Element {
  const snapshot = state.snapshot!;
  const title = snapshot.phase === "GAME_OVER"
    ? "Match complete"
    : snapshot.phase === "ROUND_REVEAL"
      ? `The word was ${snapshot.revealedWord}`
      : isDrawer ? "Your turn to draw" : "Guess the drawing";
  const timerLabel = snapshot.phase === "CHOOSING_WORD" ? "Choose a word" : snapshot.phase === "DRAWING" ? "Time left" : "Next turn";
  const timer = snapshot.phase === "CHOOSING_WORD" || snapshot.phase === "DRAWING"
    ? formatTime(remainingMs)
    : snapshot.phase === "ROUND_REVEAL" ? "Replay" : "Final scores";

  return (
    <div className="game-header">
      <div><span className="eyebrow">ROUND {snapshot.roundNumber} / {snapshot.totalRounds}</span><h1>{title}</h1></div>
      <div className="turn-status"><span className="timer-label">{timerLabel}</span><strong>{timer}</strong></div>
    </div>
  );
}
