import { join } from "node:path";

export type ServerConfig = {
  port: number;
  publicDir: string;
  redisUrl?: string;
  heartbeatMs: number;
};

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a valid TCP port");
  return port;
}

export function loadServerConfig(): ServerConfig {
  return {
    port: parsePort(process.env.PORT),
    publicDir: join(process.cwd(), "apps", "web", "dist"),
    redisUrl: process.env.REDIS_URL,
    heartbeatMs: 250,
  };
}
