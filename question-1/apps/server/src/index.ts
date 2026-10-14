import { createServer } from "node:http";
import { loadServerConfig } from "./config/environment";
import { createStaticHandler } from "./http/static-server";
import { WebSocketGateway } from "./realtime/websocket-gateway";
import { RoomService } from "./rooms/application/room-service";
import { RoomRepository } from "./rooms/infrastructure/room-repository";

async function bootstrap(): Promise<void> {
  const config = loadServerConfig();
  const repository = new RoomRepository(config.redisUrl);
  const roomService = new RoomService(repository);
  await repository.connect();
  await roomService.hydrate();

  const httpServer = createServer(createStaticHandler(config.publicDir));
  const gateway = new WebSocketGateway(httpServer, roomService);
  const heartbeat = setInterval(() => {
    gateway.clients.forEach((socket) => {
      if (socket.readyState === socket.OPEN) socket.ping();
    });
    void roomService.tick();
  }, config.heartbeatMs);

  httpServer.listen(config.port, "0.0.0.0", () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
  });

  const shutdown = async (): Promise<void> => {
    clearInterval(heartbeat);
    await gateway.close();
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void bootstrap().catch((error) => {
  console.error("[server] failed to start", error);
  process.exitCode = 1;
});
