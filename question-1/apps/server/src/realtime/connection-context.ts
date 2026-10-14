import { WebSocket } from "ws";

export type ConnectionContext = {
  socket: WebSocket;
  roomId: string | null;
  playerId: string | null;
  resumeToken: string | null;
  drawTimes: number[];
  chatTimes: number[];
};

export function createConnectionContext(socket: WebSocket): ConnectionContext {
  return {
    socket,
    roomId: null,
    playerId: null,
    resumeToken: null,
    drawTimes: [],
    chatTimes: [],
  };
}
