import type { ServerEvent } from "@sapien/protocol";
import { WebSocket } from "ws";
import type { RoomRepository } from "../infrastructure/room-repository";
import type { ConnectionContext } from "../../realtime/connection-context";
import type { RuntimeRoom } from "../domain/room-runtime";
import { RoomPresenter } from "./room-presenter";

export class RoomEventBus {
  constructor(
    private readonly rooms: Map<string, RuntimeRoom>,
    private readonly repository: RoomRepository,
    private readonly presenter: RoomPresenter,
  ) {}

  sendAccepted(context: ConnectionContext, room: RuntimeRoom, requestId: string, resumed = false): void {
    this.sendPrivate(context, "connection.accepted", {
      roomId: room.state.roomId,
      playerId: context.playerId,
      resumeToken: context.resumeToken,
      serverEpoch: room.state.serverEpoch,
      resumed,
    }, requestId);
  }

  sendSnapshot(context: ConnectionContext, room: RuntimeRoom, requestId?: string): void {
    this.sendPrivate(context, "room.snapshot", this.presenter.publicSnapshot(room.state), requestId);
  }

  publish(room: RuntimeRoom, type: string, payload: unknown): void {
    this.broadcast(room, type, payload);
  }

  sendError(context: ConnectionContext, code: string, message: string, requestId?: string): void {
    this.sendPrivate(context, "error", { code, message }, requestId);
  }

  private broadcast(room: RuntimeRoom, type: string, payload: unknown, eventSeq?: number): void {
    const sequence = eventSeq ?? ++room.state.eventSeq;
    const event: ServerEvent = {
      type,
      roomId: room.state.roomId,
      serverEpoch: room.state.serverEpoch,
      eventSeq: sequence,
      serverTime: Date.now(),
      payload,
    };
    for (const connection of room.connections) this.send(connection, event);
    void this.repository.saveRoom(room.state).catch((error) => console.warn("[persistence] event checkpoint failed", error));
  }

  sendDrawingOperation(room: RuntimeRoom, payload: unknown, eventSeq: number): void {
    this.broadcast(room, "drawing.operation", payload, eventSeq);
  }

  sendPrivate(context: ConnectionContext, type: string, payload: unknown, requestId?: string): void {
    const event: ServerEvent = {
      type,
      roomId: context.roomId ?? undefined,
      requestId,
      serverEpoch: context.roomId ? this.rooms.get(context.roomId)?.state.serverEpoch : undefined,
      serverTime: Date.now(),
      payload,
    };
    this.send(context, event);
  }

  private send(context: ConnectionContext, event: ServerEvent): void {
    if (context.socket.readyState !== WebSocket.OPEN) return;
    context.socket.send(JSON.stringify(event));
  }
}
