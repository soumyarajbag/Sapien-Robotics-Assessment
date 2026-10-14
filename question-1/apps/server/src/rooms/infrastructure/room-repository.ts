import { createClient, type RedisClientType } from "redis";
import type { RoomState } from "@sapien/game-core";

export type ResumeRecord = {
  roomId: string;
  playerId: string;
  expiresAt: number;
};

export class RoomRepository {
  private client: RedisClientType | null = null;
  private readonly snapshots = new Map<string, RoomState>();
  private readonly resumes = new Map<string, ResumeRecord>();

  constructor(private readonly redisUrl = process.env.REDIS_URL) {}

  async connect(): Promise<void> {
    const url = this.redisUrl;
    if (!url) {
      console.warn("[persistence] REDIS_URL not set; using in-memory recovery mode");
      return;
    }

    try {
      const client = createClient({ url });
      client.on("error", (error) => console.warn("[persistence] Redis error:", error.message));
      await client.connect();
      this.client = client as RedisClientType;
      console.log("[persistence] Redis connected");
    } catch (error) {
      console.warn("[persistence] Redis unavailable; using in-memory recovery mode", error);
      this.client = null;
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async saveRoom(state: RoomState, event?: unknown): Promise<void> {
    this.snapshots.set(state.roomId, structuredClone(state));
    if (!this.client) return;

    const key = `room:${state.roomId}:snapshot`;
    await this.client.set(key, JSON.stringify(state), { EX: 60 * 60 * 24 });
    if (event) {
      await this.client.xAdd(`room:${state.roomId}:events`, "*", {
        event: JSON.stringify(event),
      });
      await this.client.expire(`room:${state.roomId}:events`, 60 * 60 * 24);
    }
  }

  async loadRoom(roomId: string): Promise<RoomState | null> {
    const inMemory = this.snapshots.get(roomId);
    if (inMemory) return structuredClone(inMemory);
    if (!this.client) return null;
    const raw = await this.client.get(`room:${roomId}:snapshot`);
    if (!raw) return null;
    const state = JSON.parse(raw) as RoomState;
    this.snapshots.set(roomId, state);
    return structuredClone(state);
  }

  async loadRooms(): Promise<RoomState[]> {
    if (!this.client) return [...this.snapshots.values()].map((state) => structuredClone(state));
    const rooms: RoomState[] = [];
    for await (const key of this.client.scanIterator({ MATCH: "room:*:snapshot", COUNT: 100 })) {
      const raw = await this.client.get(key);
      if (!raw) continue;
      const state = JSON.parse(raw) as RoomState;
      this.snapshots.set(state.roomId, state);
      rooms.push(structuredClone(state));
    }
    return rooms;
  }

  async saveResume(token: string, record: ResumeRecord): Promise<void> {
    this.resumes.set(token, record);
    if (!this.client) return;
    await this.client.set(`resume:${token}`, JSON.stringify(record), {
      PX: Math.max(1, record.expiresAt - Date.now()),
    });
  }

  async loadResume(token: string): Promise<ResumeRecord | null> {
    const local = this.resumes.get(token);
    if (local && local.expiresAt > Date.now()) return local;
    this.resumes.delete(token);
    if (!this.client) return null;
    const raw = await this.client.get(`resume:${token}`);
    if (!raw) return null;
    const record = JSON.parse(raw) as ResumeRecord;
    if (record.expiresAt <= Date.now()) return null;
    this.resumes.set(token, record);
    return record;
  }

  async deleteResume(token: string): Promise<void> {
    this.resumes.delete(token);
    if (this.client) await this.client.del(`resume:${token}`);
  }
}

