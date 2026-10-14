import type { FormEvent } from "react";
import type { DrawingOperation } from "@sapien/protocol";
import type { ClientGameState } from "../../../shared/types/game";
import { CanvasBoard } from "../../drawing/components/CanvasBoard";
import { ChatPanel } from "../../chat/components/ChatPanel";
import { ReplayViewer } from "./ReplayViewer";
import { Scoreboard } from "./Scoreboard";
import { GameHeader } from "./GameHeader";
import { WordPicker } from "./WordPicker";
import { FinalResults } from "./FinalResults";

type GameRoomProps = {
  state: ClientGameState;
  now: number;
  chatText: string;
  setChatText: (value: string) => void;
  sendOperation: (operation: DrawingOperation) => void;
  onDrawStart: () => void;
  chooseWord: (optionId: string) => void;
  sendChat: (event: FormEvent) => void;
};

export function GameRoom({ state, now, chatText, setChatText, sendOperation, onDrawStart, chooseWord, sendChat }: GameRoomProps): JSX.Element {
  const snapshot = state.snapshot!;
  const player = snapshot.players.find((item) => item.id === state.playerId);
  const isDrawer = Boolean(player && snapshot.currentDrawerId === player.id);
  const targetTime = snapshot.phase === "CHOOSING_WORD" ? snapshot.choiceEndsAt : snapshot.turnEndsAt;
  const remainingMs = targetTime ? targetTime - (now + state.serverOffset) : 0;

  return (
    <>
      <GameHeader state={state} remainingMs={remainingMs} isDrawer={isDrawer} />
      {snapshot.phase !== "GAME_OVER" && <main className="game-grid">
          <section className="play-area">
            <div className="word-banner">
              <span>{isDrawer ? "SECRET WORD" : "GUESS THE WORD"}</span>
              <strong>{isDrawer ? (state.secretWord ?? "Choosing…") : (snapshot.maskedWord ?? "_ _ _ _ _")}</strong>
            </div>
            <CanvasBoard operations={snapshot.operations} canDraw={isDrawer && snapshot.phase === "DRAWING"} onOperation={sendOperation} onDrawStart={onDrawStart} />
            {snapshot.phase === "ROUND_REVEAL" && state.replays.length > 0 && <ReplayViewer replay={state.replays[state.replays.length - 1]} />}
          </section>
          <aside className="sidebar">
            <Scoreboard players={snapshot.players} drawerId={snapshot.currentDrawerId} playerId={state.playerId!} />
            <ChatPanel lines={state.chat} text={chatText} setText={setChatText} onSubmit={sendChat} disabled={snapshot.phase === "GAME_OVER"} />
          </aside>
      </main>}
      {snapshot.phase === "CHOOSING_WORD" && isDrawer && <WordPicker options={state.wordOptions} onChoose={chooseWord} />}
      {snapshot.phase === "GAME_OVER" && (
        <div className="results-panel">
          <FinalResults players={snapshot.players} playerId={state.playerId!} />
          <div className="replay-list">{state.replays.map((replay) => <ReplayViewer key={replay.roundNumber} replay={replay} />)}</div>
        </div>
      )}
    </>
  );
}
