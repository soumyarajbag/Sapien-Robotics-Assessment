import type { RoomState } from "@sapien/game-core";
import type { ConnectionContext } from "../../realtime/connection-context";

export type RuntimeRoom = {
  state: RoomState;
  connections: Set<ConnectionContext>;
};
