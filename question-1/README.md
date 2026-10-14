# Question 1 - Sketch League

Sketch League is a real-time multiplayer drawing and guessing game built for the Sapien Robotics full-stack assignment.

The server is authoritative for the secret word, timer, turn, scoring, player eligibility, host state, and room transitions. The browser renders a public room projection and sends intents over WebSocket.

## What is included

- Room creation and joining by shareable URL or six-character code.
- Host-controlled rounds, turn duration, and custom word list.
- Pen, colours, brush size, eraser, fill, undo, and clear.
- Private three-word choice for the drawer.
- Server-side hints, exact-answer validation, near-miss feedback, and speed scoring.
- Offline roster state, 30-second resume, host recovery, and drawer recovery.
- Animated final ranking and canonical drawing replay.
- Copy/invite actions and self-contained Web Audio interaction cues.
- Docker Compose with Redis-backed snapshot and resume persistence.
- Smoke test and synthetic WebSocket fan-out load harness.

## Quick start: Docker

Prerequisites: Docker Desktop with Compose.

From the repository root:

```bash
cd question-1
npm run start:all
```

That is the recommended single command. It builds and starts the frontend, backend,
and Redis together through Docker Compose. The equivalent raw Docker command is
`docker compose up --build`.

Open the frontend at [http://localhost:3000](http://localhost:3000). The backend health endpoint is [http://localhost:8080/health](http://localhost:8080/health).

This starts three services:

- `redis`: Redis 7 with AOF and a named `sketch-league-redis` volume;
- `game`: the Node backend on port 8080 with the HTTP health endpoint and `/ws` WebSocket endpoint;
- `web`: the Vite frontend on port 3000, proxying `/ws` and `/health` to `game`.

Stop the foreground command with `Ctrl+C`, or from another terminal run:

```bash
npm run stop:all
```

To remove the local Redis volume as well:

```bash
docker compose down -v
```

## Development run

Prerequisites: Node.js 22 or newer and npm.

From `question-1/`:

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`npm run dev` is also a single command: it starts both the Node server and Vite
through `concurrently`. Use this when you want hot reload instead of the
production-style Docker bundle.

Vite serves the frontend on port 3000 and proxies `/ws` and `/health` to the Node server on port 8080. Redis is optional during development. Without `REDIS_URL`, the server prints a labelled `in-memory recovery mode` message; rooms do not survive a process restart in that mode.

To use Redis locally, start Redis on port 6379 and set `REDIS_URL=redis://localhost:6379` before `npm run dev`.

## Production-style local run without Docker

```bash
npm ci
npm run build
npm start
```

Open [http://localhost:8080](http://localhost:8080). `npm run build` creates ignored `dist/` folders for the protocol, game core, server, and web workspaces. They are intentionally not committed.

## Verification

Run the pure game-rule self-test:

```bash
npm test
```

With the server running on port 8080, run the multi-client behavioral test in another terminal:

```bash
npm run smoke
```

The smoke test covers room creation, three-player joining, settings validation, private word delivery, forged drawing rejection, ordered operation fan-out, answer suppression, offline/reconnect projection, explicit-leave game over, replay preservation, minimum-player game over, host refresh/restoration, and private drawer-word recovery after reconnect.

The default smoke URL is `ws://localhost:8080/ws`. Override it when necessary:

```powershell
$env:SMOKE_WS_URL = 'ws://localhost:8080/ws'
npm run smoke
```

## Load harness

The load script creates synthetic rooms and measures time from the drawer's send timestamp to each receiving WebSocket client receiving the canonical drawing operation.

Example PowerShell profile:

```powershell
$env:LOAD_ROOMS = '100'
$env:LOAD_PLAYERS = '8'
$env:LOAD_DURATION_MS = '3000'
npm run loadtest
```

Verified Docker baseline using the default load profile:

```text
4 rooms x 6 players = 24 WebSocket connections
160 drawing operations
960 fan-out samples
p50 4.56 ms | p95 13.87 ms | p99 26.21 ms
```

This is a passing reference profile, not the maximum capacity of an instance. Repeat it on the final machine and with the intended Redis configuration before presenting a capacity ceiling.

## How to play the demo

1. Open the app in three separate browser windows or profiles.
2. Enter a display name in the first window and create a room.
3. Copy the link or code and join from the other two windows.
4. In the lobby, edit settings if desired and start once two players are online.
5. The selected drawer chooses one of three private words and begins drawing.
6. Other players guess in chat. Exact answers are accepted privately, while the room sees only a safe correct-guess event.
7. Refresh a player to demonstrate the 30-second resume. The roster shows offline immediately and then online after reconnect; if the drawer refreshes, the private word/options are restored too.
8. Disconnect the drawer to demonstrate the five-second drawer grace. In a two-player room, explicitly leaving demonstrates immediate `not-enough-players` game over.
9. Play the final ranking animation and open the round replay.

The browser asks for confirmation before navigation while a player is in a room. A refresh/page hide remains resumable; an explicit `room.leave` protocol command is permanent.

## Code organization

```text
question-1/
  apps/web/src/
    app/                    app shell, lazy screens, reducer, session hook
    features/lobby/         landing page and host settings
    features/drawing/       canvas, toolbar, operation renderer
    features/game/          room, header, scoreboard, replay, results, invites
    features/chat/          chat panel
    shared/                 browser helpers, constants, sound effects, view types
  apps/server/src/
    config/                 environment parsing
    http/                   static files and /health
    realtime/               ws gateway and connection context
    rooms/application/      room service, presenter, event bus
    rooms/domain/           state factory and runtime types
    rooms/infrastructure/   Redis/in-memory repository
  packages/protocol/        Zod schemas and shared wire types
  packages/game-core/       pure scoring, hints, matching, and self-test
  tests/smoke.mjs           multi-client behavior test
  tests/load.mjs            synthetic latency harness
  PRD.md                   product behavior and acceptance criteria
  TRD.md                   implementation architecture and trade-offs
```

## Important implementation notes

### Canvas synchronization

The drawer gets an immediate local pointer preview. On pointer-up, the browser sends one normalized operation. The server validates it, assigns `eventSeq` and `serverTime`, appends it to the current/replay operation lists, and broadcasts the canonical operation to every connected player. A late joiner receives the current operation list in `room.snapshot`.

The current MVP sends one validated operation on pointer-up. The drawer gets an immediate local preview, while peers receive the canonical operation after the server assigns its sequence. Point-chunk streaming during a long stroke is a clearly documented next improvement.

### Ordering and recovery

Public room broadcasts receive a monotonic per-room `eventSeq`. WebSocket order is preserved per connection. A join or resume receives a fresh snapshot, and the reducer ignores stale versions and duplicate drawing IDs. The protocol has `room.sync`, but the browser does not yet implement a full automatic sequence-gap buffer.

### Server restart

With Redis, room snapshots have a 24-hour TTL and resume tokens have a 30-second TTL. On boot, the server hydrates snapshots and marks old sockets disconnected. Players can resume while their token is valid. The drawing event stream is written as an extension point but is not replayed during hydration. Without Redis, a restart loses in-memory rooms.

### Scaling boundary

The current app has one authoritative in-memory room owner per Node process. Redis provides persistence, not cross-process room coordination. Before horizontal scaling, add a gateway/room-owner model with leases or consistent hashing, fencing tokens, a broker for cross-gateway messages, and per-room command serialization.

## Documents

- [PRD.md](PRD.md): product requirements, game rules, UX behavior, current evidence, and next improvements.
- [TRD.md](TRD.md): architecture, protocol, persistence, failure scenarios, testing, and capacity methodology.

## Assignment submission checklist

- [x] Question 1 implementation and source structure.
- [x] One-command Docker run path.
- [x] README run and verification instructions.
- [x] Product and technical design documents.
- [x] Smoke and load harnesses.
- [ ] Two-minute recording with three separate browser sessions.
- [ ] Final GitHub push and email with the repository and recording links.
