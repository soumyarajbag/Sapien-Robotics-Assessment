import WebSocket from "ws";

const URL = process.env.LOAD_WS_URL ?? "ws://localhost:8080/ws";
const ROOM_COUNT = Number(process.env.LOAD_ROOMS ?? 4);
const PLAYERS_PER_ROOM = Number(process.env.LOAD_PLAYERS ?? 6);
const DURATION_MS = Number(process.env.LOAD_DURATION_MS ?? 4000);

function makeClient(label, samples) {
  const socket = new WebSocket(URL);
  const events = [];
  const waiters = [];
  socket.on("message", (raw) => {
    const event = JSON.parse(raw.toString());
    events.push(event);
    if (event.type === "drawing.operation") {
      const sentAt = samples.sent.get(event.payload.operation.id);
      if (sentAt) samples.latencies.push(performance.now() - sentAt);
    }
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      if (waiters[index].predicate(event)) {
        const waiter = waiters.splice(index, 1)[0];
        waiter.resolve(event);
      }
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return {
    label,
    socket,
    playerId: null,
    events,
    async waitForOpen() { await ready; },
    send(type, payload) { socket.send(JSON.stringify({ type, requestId: `${label}-${Date.now()}-${Math.random()}`, payload })); },
    wait(type, predicate = () => true, timeout = 10000) {
      const previous = events.find((event) => event.type === type && predicate(event));
      if (previous) return Promise.resolve(previous);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out waiting for ${type}; seen=${events.map((event) => event.type === "error" ? `error:${event.payload.code}` : event.type).join(",")}`)), timeout);
        waiters.push({ predicate: (event) => event.type === type && predicate(event), resolve: (event) => { clearTimeout(timer); resolve(event); } });
      });
    },
    close() { socket.close(); },
  };
}

function percentile(values, percentage) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((percentage / 100) * sorted.length))];
}

async function runRoom(index, samples) {
  const clients = Array.from({ length: PLAYERS_PER_ROOM }, (_, player) => makeClient(`room-${index}-player-${player}`, samples));
  try {
    await Promise.all(clients.map((client) => client.waitForOpen()));
    const words = ["rocket", "rainbow", "lighthouse", "pizza", "volcano", "dragon", "robot", "jungle", "castle", "planet"];
    clients[0].send("room.create", { displayName: `Load ${index}-0`, settings: { rounds: 1, turnSeconds: 30, choiceSeconds: 5, hintEverySeconds: 10, maxPlayers: 12, words } });
    const accepted = await clients[0].wait("connection.accepted");
    const roomId = accepted.payload.roomId;
    clients[0].playerId = accepted.payload.playerId;
    await clients[0].wait("room.snapshot");
    for (let player = 1; player < clients.length; player += 1) {
      clients[player].send("room.join", { roomId, displayName: `Load ${index}-${player}` });
      const joinAccepted = await clients[player].wait("connection.accepted");
      clients[player].playerId = joinAccepted.payload.playerId;
      await clients[player].wait("room.snapshot");
    }
    await clients[0].wait("player.joined", (event) => event.payload.player.displayName === `Load ${index}-${clients.length - 1}`);
    const version = Math.max(...clients[0].events.filter((event) => event.type === "player.joined").map((event) => event.payload.version), 0);
    clients[0].send("room.start", { expectedVersion: version });
    const turn = await clients[0].wait("turn.started");
    const drawer = clients.find((client) => client.playerId === turn.payload.drawerId);
    if (!drawer) throw new Error("drawer was not assigned");
    const options = await drawer.wait("turn.wordOptions");
    drawer.send("turn.chooseWord", { optionId: options.payload.options[0].id });
    await drawer.wait("turn.drawingStarted");
    const endAt = performance.now() + DURATION_MS;
    let sequence = 0;
    while (performance.now() < endAt) {
      const id = `load-${index}-${sequence++}-${Date.now()}`;
      samples.sent.set(id, performance.now());
      drawer.send("draw.operation", { operation: { kind: "stroke", id, tool: "pen", color: "#111827", size: 5, points: [[0.1, 0.1], [0.2 + ((sequence % 10) / 100), 0.2]] } });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { roomId, operations: sequence };
  } finally {
    clients.forEach((client) => client.close());
  }
}

const samples = { sent: new Map(), latencies: [] };
const started = performance.now();
const rooms = await Promise.all(Array.from({ length: ROOM_COUNT }, (_, index) => runRoom(index, samples)));
const elapsed = performance.now() - started;
console.log(JSON.stringify({
  profile: { rooms: ROOM_COUNT, playersPerRoom: PLAYERS_PER_ROOM, connections: ROOM_COUNT * PLAYERS_PER_ROOM, durationMs: DURATION_MS },
  operations: rooms.reduce((total, room) => total + room.operations, 0),
  fanoutSamples: samples.latencies.length,
  latencyMs: { p50: Number(percentile(samples.latencies, 50).toFixed(2)), p95: Number(percentile(samples.latencies, 95).toFixed(2)), p99: Number(percentile(samples.latencies, 99).toFixed(2)) },
  elapsedMs: Number(elapsed.toFixed(2)),
}, null, 2));

