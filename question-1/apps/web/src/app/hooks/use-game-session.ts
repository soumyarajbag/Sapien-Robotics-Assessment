import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ClientMessage, ServerEvent } from "@sapien/protocol";
import { reduceGameState, type GameAction } from "../state/game-reducer";
import {
  createRequestId,
  getResumeStorageKey,
  getRoomIdFromUrl,
  getSocketUrl,
  updateRoomUrl,
} from "../../shared/lib/browser";
import type { ClientGameState } from "../../shared/types/game";
import { createInitialGameState } from "../../shared/types/game";

type MessageOf<T extends ClientMessage["type"]> = Extract<ClientMessage, { type: T }>;

type SocketHandlers = {
  onOpen: () => void;
  onEvent: (event: ServerEvent) => void;
  onClose: () => void;
};

class RealtimeClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pendingMessages: ClientMessage[] = [];
  private stopped = false;

  constructor(private readonly url: string, private readonly handlers: SocketHandlers) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  leave(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "room.leave", requestId: createRequestId(), payload: {} }));
      this.socket.close(1000, "player left the room");
    } else {
      this.socket?.close();
    }
    this.socket = null;
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    this.pendingMessages.push(message);
  }

  private open(): void {
    if (this.stopped || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.handlers.onOpen();
      const pendingMessages = this.pendingMessages.splice(0);
      pendingMessages.forEach((pending) => this.send(pending));
    };
    socket.onmessage = (message) => {
      try {
        this.handlers.onEvent(JSON.parse(message.data) as ServerEvent);
      } catch {
        // A malformed event is isolated to this connection; the next snapshot can repair state.
      }
    };
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      this.handlers.onClose();
      if (!this.stopped) this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, 1_200);
  }
}

function restoreOrProbeRoom(client: RealtimeClient, state: ClientGameState): void {
  const roomId = state.roomId ?? getRoomIdFromUrl();
  const storedToken = roomId ? sessionStorage.getItem(getResumeStorageKey(roomId)) : null;
  const resumeToken = state.resumeToken ?? storedToken;
  if (!roomId) return;
  if (!resumeToken) {
    client.send({ type: "room.probe", requestId: createRequestId(), payload: { roomId } });
    return;
  }
  client.send({
    type: "room.resume",
    requestId: createRequestId(),
    payload: { roomId, resumeToken, lastEventSeq: state.snapshot?.eventSeq ?? 0 },
  });
}

function persistAcceptedSession(event: ServerEvent): void {
  if (event.type !== "connection.accepted") return;
  const payload = event.payload as { roomId: string; resumeToken: string };
  sessionStorage.setItem(getResumeStorageKey(payload.roomId), payload.resumeToken);
  updateRoomUrl(payload.roomId);
}

export type GameSession = {
  state: ClientGameState;
  send: <T extends ClientMessage["type"]>(type: T, payload: MessageOf<T>["payload"]) => void;
  dismissToast: () => void;
  showToast: (message: string) => void;
};

export function useGameSession(): GameSession {
  const [state, dispatch] = useReducer((current: ClientGameState, action: GameAction) => reduceGameState(current, action), createInitialGameState(getRoomIdFromUrl()));
  const stateRef = useRef(state);
  const clientRef = useRef<RealtimeClient | null>(null);
  stateRef.current = state;

  useEffect(() => {
    const client = new RealtimeClient(getSocketUrl(), {
      onOpen: () => {
        dispatch({ type: "connection-status", connected: true });
        restoreOrProbeRoom(client, stateRef.current);
      },
      onEvent: (event) => {
        persistAcceptedSession(event);
        dispatch({ type: "server-event", event });
      },
      onClose: () => dispatch({ type: "connection-status", connected: false }),
    });
    clientRef.current = client;
    client.start();
    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!stateRef.current.playerId || !stateRef.current.roomId) return;
      event.preventDefault();
      event.returnValue = "You are currently in a game. Leave the room?";
    };
    const handlePageHide = (): void => {
      if (!stateRef.current.playerId || !stateRef.current.roomId) return;
      // A page refresh and a browser/network drop are resumable for 30s. An
      // explicit room.leave command is reserved for an intentional departure.
      clientRef.current?.stop();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  const send = useCallback(<T extends ClientMessage["type"]>(type: T, payload: MessageOf<T>["payload"]): void => {
    clientRef.current?.send({ type, requestId: createRequestId(), payload } as MessageOf<T>);
  }, []);

  const dismissToast = useCallback(() => dispatch({ type: "dismiss-toast" }), []);
  const showToast = useCallback((message: string) => dispatch({ type: "set-toast", message }), []);
  return { state, send, dismissToast, showToast };
}
