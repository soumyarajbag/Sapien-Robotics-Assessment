import type { FormEvent } from "react";
import type { ChatLine } from "../../../shared/types/game";

type ChatPanelProps = {
  lines: ChatLine[];
  text: string;
  setText: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  disabled: boolean;
};

export function ChatPanel({ lines, text, setText, onSubmit, disabled }: ChatPanelProps): JSX.Element {
  return (
    <div className="chat">
      <div className="side-title"><span>CHAT</span><small>guesses are public</small></div>
      <div className="chat-log">
        {lines.length === 0 && <div className="chat-empty">The first correct guess gets the biggest bonus.</div>}
        {lines.map((line) => (
          <div className={`chat-line ${line.kind}`} key={line.id}>
            {line.displayName && <strong>{line.displayName}: </strong>}{line.text}
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={onSubmit}>
        <input disabled={disabled} value={text} onChange={(event) => setText(event.target.value)} placeholder={disabled ? "Game over" : "Type your guess…"} maxLength={200} />
        <button disabled={disabled || !text.trim()} aria-label="Send guess">↑</button>
      </form>
    </div>
  );
}
