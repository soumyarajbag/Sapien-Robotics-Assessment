import type { Server as HttpServer } from "node:http";
import { WebSocketServer } from "ws";
import { createConnectionContext } from "./connection-context";
import { RoomService } from "../rooms/application/room-service";

export class WebSocketGateway {
  private readonly sockets: WebSocketServer;

  constructor(server: HttpServer, private readonly roomService: RoomService) {
    this.sockets = new WebSocketServer({ server, path: "/ws" });
    this.registerHandlers();
  }

  get clients() {
    return this.sockets.clients;
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.sockets.close(() => resolve()));
  }

  private registerHandlers(): void {
    this.sockets.on("connection", (socket) => {
      const context = createConnectionContext(socket);
      socket.on("message", (raw) => void this.roomService.handleRaw(context, raw));
      socket.on("close", () => void this.roomService.disconnect(context));
      socket.on("error", () => void this.roomService.disconnect(context));
      socket.on("pong", () => undefined);
    });
  }
}
