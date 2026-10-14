import type { FormEvent } from "react";
import type { RoomAvailability } from "../../../shared/types/game";

type LandingPageProps = {
  connected: boolean;
  roomId: string | null;
  displayName: string;
  setDisplayName: (value: string) => void;
  rounds: number;
  setRounds: (value: number) => void;
  turnSeconds: number;
  setTurnSeconds: (value: number) => void;
  wordText: string;
  setWordText: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  roomCode: string;
  setRoomCode: (value: string) => void;
  onJoinRoom: (event: FormEvent) => void;
  toast: string | null;
  roomAvailability: RoomAvailability;
  onCreateNewRoom: () => void;
};

export function LandingPage({
  connected,
  roomId,
  displayName,
  setDisplayName,
  rounds,
  setRounds,
  turnSeconds,
  setTurnSeconds,
  wordText,
  setWordText,
  onSubmit,
  roomCode,
  setRoomCode,
  onJoinRoom,
  toast,
  roomAvailability,
  onCreateNewRoom,
}: LandingPageProps): JSX.Element {
  const unavailable = Boolean(roomId && roomAvailability === "unavailable");
  return (
    <div className="landing">
      <div className="landing-panel">
        <div className="brand large"><span className="brand-mark">✦</span><span>Sketch League</span></div>
        <span className="eyebrow">REALTIME DRAW & GUESS</span>
        <h1>{unavailable ? "This room isn’t active." : roomId ? "You’re invited to play." : "Draw something unforgettable."}</h1>
        <p className="lede">{unavailable ? "That link does not point to an active room. A host must create and initiate a room before players can join." : "A fast, fair party game where the best guessers win—and every stroke becomes part of the replay."}</p>
        {unavailable ? (
          <button className="primary wide" type="button" onClick={onCreateNewRoom}>Create a new room →</button>
        ) : <form onSubmit={onSubmit}>
          <label>Display name<input autoFocus value={displayName} maxLength={24} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Aditya" /></label>
          {!roomId && (
            <>
              <div className="settings-grid">
                <label>Rounds<select value={rounds} onChange={(event) => setRounds(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label>Turn time<select value={turnSeconds} onChange={(event) => setTurnSeconds(Number(event.target.value))}><option value={30}>30 sec</option><option value={60}>60 sec</option><option value={90}>90 sec</option><option value={120}>120 sec</option></select></label>
              </div>
              <label>Word list <span className="label-help">one word per line · minimum 10</span><textarea value={wordText} onChange={(event) => setWordText(event.target.value)} rows={6} /></label>
            </>
          )}
          <button className="primary wide" type="submit">{roomId ? "Join room →" : "Create room →"}</button>
        </form>}
        {roomId && !unavailable && (
          <div className="landing-room-exit">
            <span>Not joining this room?</span>
            <button className="secondary" type="button" onClick={onCreateNewRoom}>Back to home</button>
          </div>
        )}
        {!roomId && !unavailable && (
          <div className="join-room-card">
            <div className="join-room-heading"><span className="eyebrow">ALREADY HAVE A ROOM?</span><span>Join with a code</span></div>
            <form className="join-room-form" onSubmit={onJoinRoom}>
              <input
                value={roomCode}
                maxLength={6}
                onChange={(event) => setRoomCode(event.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                placeholder="e.g. a1b2c3"
                aria-label="Room code"
              />
              <button className="secondary" type="submit" disabled={roomCode.length !== 6}>Join room</button>
            </form>
          </div>
        )}
        {toast && <div className="inline-warning">{toast}</div>}
        <div className="connection-note"><span className={connected ? "dot green" : "dot"} />{connected ? "Server connected" : "Connecting to the game server…"}</div>
      </div>
      <div className="landing-art">
        <div className="art-card card-one">✎<span>draw</span></div>
        <div className="art-card card-two">☼<span>guess</span></div>
        <div className="art-card card-three">★<span>replay</span></div>
        <div className="art-scribble">quick<br />minds<br />win</div>
      </div>
    </div>
  );
}
