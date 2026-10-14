import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import type { DrawingOperation, RoomSettings } from "@sapien/protocol";
import { useGameSession } from "./hooks/use-game-session";
import { useTicker } from "../shared/hooks/use-ticker";
import { DEFAULT_WORDS } from "../shared/constants";
import { copyText, getRoomIdFromUrl, shareInvite } from "../shared/lib/browser";
import { useSoundEffects } from "../shared/hooks/use-sound-effects";
import { LandingPage } from "../features/lobby/components/LandingPage";
import { InviteDialog } from "../features/game/components/InviteDialog";

const LobbyScreen = lazy(() => import("../features/lobby/components/LobbyScreen").then((module) => ({ default: module.LobbyScreen })));
const GameRoom = lazy(() => import("../features/game/components/GameRoom").then((module) => ({ default: module.GameRoom })));

function ScreenLoading(): JSX.Element {
  return <div className="connection-note">Loading the room…</div>;
}

function SoundIcon({ muted }: { muted: boolean }): JSX.Element {
  return (
    <svg className="sound-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10v4h3l4 3V7l-4 3H4Z" />
      {muted ? <path d="m16 10 4 4m0-4-4 4" /> : <><path d="M15 9.5a3.5 3.5 0 0 1 0 5" /><path d="M17.5 7a7 7 0 0 1 0 10" /></>}
    </svg>
  );
}

export function App(): JSX.Element {
  const { state, send, dismissToast, showToast } = useGameSession();
  const sounds = useSoundEffects();
  const lastSoundCueKey = useRef<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [rounds, setRounds] = useState(3);
  const [turnSeconds, setTurnSeconds] = useState(60);
  const [wordText, setWordText] = useState(DEFAULT_WORDS.join("\n"));
  const [roomCode, setRoomCode] = useState("");
  const [chatText, setChatText] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const now = useTicker(250);
  const roomId = getRoomIdFromUrl();

  useEffect(() => {
    const cue = state.soundCue;
    if (!cue || cue.key === lastSoundCueKey.current) return;
    lastSoundCueKey.current = cue.key;
    sounds.playCue(cue.name);
  }, [sounds.playCue, state.soundCue]);

  const createNewRoom = (): void => {
    window.location.assign(window.location.pathname);
  };

  const createOrJoin = (event: FormEvent): void => {
    event.preventDefault();
    if (!displayName.trim()) {
      showToast("Choose a display name first.");
      return;
    }
    if (roomId) {
      send("room.join", { roomId, displayName: displayName.trim(), resumeToken: sessionStorage.getItem(`resume:${roomId}`) ?? undefined });
      return;
    }
    const settings: RoomSettings = {
      rounds,
      turnSeconds,
      choiceSeconds: 15,
      hintEverySeconds: 10,
      maxPlayers: 12,
      words: wordText.split("\n").map((word) => word.trim()).filter(Boolean),
    };
    if (settings.words.length < 10) {
      showToast("Add at least 10 words.");
      return;
    }
    send("room.create", { displayName: displayName.trim(), settings });
  };

  const joinRoomByCode = (event: FormEvent): void => {
    event.preventDefault();
    const normalizedCode = roomCode.trim().toLowerCase();
    if (!displayName.trim()) {
      showToast("Choose a display name first.");
      return;
    }
    if (!/^[a-z0-9]{6}$/.test(normalizedCode)) {
      showToast("Enter a valid 6-character room code.");
      return;
    }
    send("room.join", { roomId: normalizedCode, displayName: displayName.trim() });
  };

  const snapshot = state.snapshot;
  if (!snapshot || !state.playerId) {
    return (
      <LandingPage
        connected={state.connected}
        roomId={roomId}
        displayName={displayName}
        setDisplayName={setDisplayName}
        rounds={rounds}
        setRounds={setRounds}
        turnSeconds={turnSeconds}
        setTurnSeconds={setTurnSeconds}
        wordText={wordText}
        setWordText={setWordText}
        onSubmit={createOrJoin}
        roomCode={roomCode}
        setRoomCode={setRoomCode}
        onJoinRoom={joinRoomByCode}
        toast={state.toast}
        roomAvailability={state.roomAvailability}
        onCreateNewRoom={createNewRoom}
      />
    );
  }

  const sendOperation = (operation: DrawingOperation): void => send("draw.operation", { operation });
  const sendChat = (event: FormEvent): void => {
    event.preventDefault();
    if (!chatText.trim()) return;
    send("chat.send", { text: chatText.trim() });
    setChatText("");
  };

  const updateLobbySettings = (settings: RoomSettings, expectedVersion: number): void => {
    send("room.settings.update", { settings, expectedVersion });
  };

  const inviteUrl = window.location.href;
  const inviteMessage = `Join my Sketch League room! Use code ${state.roomId} or open this link: ${inviteUrl}`;

  const copyRoomLink = async (): Promise<void> => {
    const copied = await copyText(inviteUrl);
    showToast(copied ? "Room link copied to clipboard." : "Could not copy the room link. Try the Invite button.");
  };

  const copyInvitation = async (): Promise<void> => {
    const copied = await copyText(inviteMessage);
    showToast(copied ? "Invite message copied to clipboard." : "Could not copy the invite message.");
  };

  const shareInvitation = async (): Promise<void> => {
    const result = await shareInvite("Join my Sketch League room", inviteMessage);
    if (result === "shared") {
      showToast("Invite shared.");
      setInviteOpen(false);
    } else if (result === "unavailable") {
      showToast("Device sharing is unavailable. Choose an app below.");
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><span>Sketch League</span></div>
        <div className="room-pill">
          ROOM <strong>{state.roomId}</strong>
          <button type="button" onClick={() => void copyRoomLink()}>Copy link</button>
          <button type="button" className="invite-button" onClick={() => setInviteOpen(true)}>Invite</button>
        </div>
        <div className={state.connected ? "connection live" : "connection"}><span />{state.connected ? "Live" : "Reconnecting"}</div>
        <button className="sound-toggle" type="button" onClick={sounds.toggle} aria-label={sounds.enabled ? "Mute interaction sounds" : "Enable interaction sounds"} title={sounds.enabled ? "Mute interaction sounds" : "Enable interaction sounds"}>
          <SoundIcon muted={!sounds.enabled} /><span>{sounds.enabled ? "Sound" : "Muted"}</span>
        </button>
      </header>
      {state.toast && <button className="toast" onClick={dismissToast}>{state.toast} <span>×</span></button>}
      {inviteOpen && state.roomId && (
        <InviteDialog
          roomCode={state.roomId}
          inviteUrl={inviteUrl}
          message={inviteMessage}
          canShare={typeof navigator.share === "function"}
          onClose={() => setInviteOpen(false)}
          onCopy={() => void copyInvitation()}
          onShare={() => void shareInvitation()}
        />
      )}
      <Suspense fallback={<ScreenLoading />}>
        {snapshot.phase === "LOBBY" ? (
          <LobbyScreen
            snapshot={snapshot}
            playerId={state.playerId}
            onStart={() => send("room.start", { expectedVersion: snapshot.version })}
            onUpdateSettings={updateLobbySettings}
            onNotify={showToast}
          />
        ) : (
          <GameRoom
            state={state}
            now={now}
            chatText={chatText}
            setChatText={setChatText}
            sendOperation={sendOperation}
            onDrawStart={sounds.playDrawing}
            chooseWord={(optionId) => send("turn.chooseWord", { optionId })}
            sendChat={sendChat}
          />
        )}
      </Suspense>
    </div>
  );
}
