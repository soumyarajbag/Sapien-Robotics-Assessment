import { useEffect, useState, type FormEvent } from "react";
import type { PublicRoomSnapshot, RoomSettings } from "@sapien/protocol";

type LobbyScreenProps = {
  snapshot: PublicRoomSnapshot;
  playerId: string;
  onStart: () => void;
  onUpdateSettings: (settings: RoomSettings, expectedVersion: number) => void;
  onNotify: (message: string) => void;
};

export function LobbyScreen({ snapshot, playerId, onStart, onUpdateSettings, onNotify }: LobbyScreenProps): JSX.Element {
  const currentPlayer = snapshot.players.find((player) => player.id === playerId);
  const isHost = snapshot.hostPlayerId === playerId || currentPlayer?.isHost === true;
  const connectedPlayers = snapshot.players.filter((player) => player.connected).length;
  const [editingSettings, setEditingSettings] = useState(false);
  const [rounds, setRounds] = useState(snapshot.settings.rounds);
  const [turnSeconds, setTurnSeconds] = useState(snapshot.settings.turnSeconds);
  const [wordText, setWordText] = useState(snapshot.settings.words.join("\n"));

  useEffect(() => {
    if (editingSettings) return;
    setRounds(snapshot.settings.rounds);
    setTurnSeconds(snapshot.settings.turnSeconds);
    setWordText(snapshot.settings.words.join("\n"));
  }, [editingSettings, snapshot.settings]);

  const saveSettings = (event: FormEvent): void => {
    event.preventDefault();
    const words = wordText.split("\n").map((word) => word.trim()).filter(Boolean);
    if (words.length < 10) {
      onNotify("Add at least 10 words before saving the match settings.");
      return;
    }
    if (words.length > 500) {
      onNotify("Keep the word list to 500 words or fewer.");
      return;
    }
    const longWord = words.find((word) => word.length > 40);
    if (longWord) {
      onNotify(`“${longWord.slice(0, 18)}…” is too long. Keep every word within 40 characters.`);
      return;
    }
    onUpdateSettings({ ...snapshot.settings, rounds, turnSeconds, words }, snapshot.version);
    setEditingSettings(false);
  };

  return (
    <main className="lobby">
      <div className="lobby-main">
        <span className="eyebrow">ROOM {snapshot.roomId}</span>
        <h1>Waiting for the crew.</h1>
        <p>Share the link and start when everyone is ready. The first round begins with a private word choice.</p>
        <div className="player-grid">
          {snapshot.players.map((player) => (
            <div className="player-card" key={player.id}>
              <span className="avatar">{player.displayName.slice(0, 1).toUpperCase()}</span>
              <div><strong>{player.displayName}{player.id === playerId ? " (you)" : ""}</strong><small>{player.isHost ? "Host" : "Ready to play"}</small></div>
              {player.isHost && <span className="host-star">✦</span>}
            </div>
          ))}
        </div>
        {isHost
          ? <button className="primary" disabled={connectedPlayers < 2} onClick={onStart}>{connectedPlayers < 2 ? "Waiting for one more player" : "Start game →"}</button>
          : <div className="waiting-note"><span className="pulse" /> The host will start the game</div>}
      </div>
      <div className="lobby-settings">
        {editingSettings ? (
          <form className="lobby-settings-form" onSubmit={saveSettings}>
            <div className="lobby-settings-heading"><span className="eyebrow">MATCH SETTINGS</span><span className="settings-host-note">HOST ONLY</span></div>
            <label>Rounds<select value={rounds} onChange={(event) => setRounds(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label>Turn time<select value={turnSeconds} onChange={(event) => setTurnSeconds(Number(event.target.value))}><option value={30}>30 sec</option><option value={60}>60 sec</option><option value={90}>90 sec</option><option value={120}>120 sec</option></select></label>
            <label>Word list <span className="label-help">one word per line · minimum 10</span><textarea value={wordText} onChange={(event) => setWordText(event.target.value)} rows={8} /></label>
            <p className="settings-preserve-note">Updating settings keeps this room code and everyone already in the room.</p>
            <div className="settings-actions">
              <button className="secondary" type="button" onClick={() => setEditingSettings(false)}>Cancel</button>
              <button className="primary" type="submit" disabled={wordText.split("\n").map((word) => word.trim()).filter(Boolean).length < 10}>Save settings</button>
            </div>
          </form>
        ) : (
          <>
            <div className="lobby-settings-heading"><span className="eyebrow">MATCH SETTINGS</span>{isHost && <button className="settings-edit" type="button" onClick={() => setEditingSettings(true)}>Edit</button>}</div>
            <div className="setting"><span>Rounds</span><strong>{snapshot.settings.rounds}</strong></div>
            <div className="setting"><span>Turn time</span><strong>{snapshot.settings.turnSeconds}s</strong></div>
            <div className="setting"><span>Hints</span><strong>Every {snapshot.settings.hintEverySeconds}s</strong></div>
            <div className="setting"><span>Word bank</span><strong>{snapshot.settings.words.length} words</strong></div>
          </>
        )}
      </div>
    </main>
  );
}
