import assert from "node:assert/strict";
import WebSocket from "ws";

const URL = process.env.SMOKE_WS_URL ?? "ws://localhost:8080/ws";

function client(name) {
  const socket = new WebSocket(URL);
  const events = [];
  const waiters = [];
  socket.on("message", (raw) => {
    const event = JSON.parse(raw.toString());
    events.push(event);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      if (waiters[index].predicate(event)) {
        const waiter = waiters.splice(index, 1)[0];
        waiter.resolve(event);
      }
    }
  });
  const open = new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return {
    name,
    socket,
    events,
    async ready() { await open; },
    send(type, payload) {
      socket.send(JSON.stringify({ type, requestId: `${name}-${Date.now()}-${Math.random()}`, payload }));
    },
    wait(type, predicate = () => true, timeout = 5000) {
      const existing = events.find((event) => event.type === type && predicate(event));
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((waiter) => waiter.resolve === resolve);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`${name} timed out waiting for ${type}`));
        }, timeout);
        waiters.push({
          predicate: (event) => event.type === type && predicate(event),
          resolve: (event) => { clearTimeout(timer); resolve(event); },
        });
      });
    },
    close() { socket.close(); },
  };
}

const words = ["red panda", "rocket", "rainbow", "lighthouse", "pizza", "volcano", "dragon", "robot", "jungle", "castle"];
const alice = client("alice");
const bob = client("bob");
const charlie = client("charlie");
const twoPlayerHost = client("two-player-host");
const twoPlayerGuest = client("two-player-guest");
const reloadHost = client("reload-host");
const reloadGuestOne = client("reload-guest-one");
const reloadGuestTwo = client("reload-guest-two");
let hostAfterReload = null;
let drawerAfterReload = null;

try {
  await Promise.all([
    alice.ready(),
    bob.ready(),
    charlie.ready(),
    twoPlayerHost.ready(),
    twoPlayerGuest.ready(),
    reloadHost.ready(),
    reloadGuestOne.ready(),
    reloadGuestTwo.ready(),
  ]);
  alice.send("room.create", {
    displayName: "Alice",
    settings: { rounds: 1, turnSeconds: 30, choiceSeconds: 5, hintEverySeconds: 10, maxPlayers: 12, words },
  });
  const accepted = await alice.wait("connection.accepted");
  const roomId = accepted.payload.roomId;
  await alice.wait("room.snapshot");
  bob.send("room.join", { roomId, displayName: "Bob" });
  await bob.wait("connection.accepted");
  await bob.wait("room.snapshot");
  charlie.send("room.join", { roomId, displayName: "Charlie" });
  await charlie.wait("connection.accepted");
  await charlie.wait("room.snapshot");
  await alice.wait("player.joined", (event) => event.payload.player.displayName === "Charlie");

  const lobbyVersion = Math.max(
    ...alice.events.filter((event) => event.type === "room.snapshot").map((event) => event.payload.version),
    ...alice.events.filter((event) => event.type === "player.joined" || event.type === "player.reconnected").map((event) => event.payload.version),
    0,
  );
  alice.send("room.settings.update", {
    expectedVersion: lobbyVersion,
    settings: { rounds: 1, turnSeconds: 60, choiceSeconds: 5, hintEverySeconds: 10, maxPlayers: 12, words: ["x".repeat(41), ...words] },
  });
  const invalidSettings = await alice.wait("error", (event) => event.payload.code === "INVALID_MESSAGE");
  assert.match(invalidSettings.payload.message, /Settings could not be saved/);
  alice.send("room.settings.update", {
    expectedVersion: lobbyVersion,
    settings: { rounds: 1, turnSeconds: 60, choiceSeconds: 5, hintEverySeconds: 10, maxPlayers: 12, words: [...words, "spaceship"] },
  });
  const updatedSettings = await alice.wait("room.settings.updated");
  assert.equal(updatedSettings.roomId, roomId, "editing settings must keep the room code");
  assert.equal(updatedSettings.payload.settings.turnSeconds, 60);
  const joinedPlayerIds = new Set([
    accepted.payload.playerId,
    ...alice.events.filter((event) => event.type === "player.joined").map((event) => event.payload.player.id),
  ]);
  assert.equal(joinedPlayerIds.size, 3, "editing settings must keep joined players");

  const updatedLobbyVersion = updatedSettings.payload.version;
  alice.send("room.start", { expectedVersion: updatedLobbyVersion });
  const turn = await alice.wait("turn.started");
  const drawerId = turn.payload.drawerId;
  const drawer = [alice, bob, charlie].find((candidate) => candidate.events.some((event) => event.type === "connection.accepted" && event.payload.playerId === drawerId));
  assert.ok(drawer, "a drawer should be assigned");
  const options = await drawer.wait("turn.wordOptions");
  drawer.send("turn.chooseWord", { optionId: options.payload.options[0].id });
  const secret = await drawer.wait("turn.secretWord");
  const drawingStarted = await alice.wait("turn.drawingStarted");
  assert.equal(drawingStarted.payload.drawerId, drawerId);

  const guessers = [alice, bob, charlie].filter((candidate) => candidate !== drawer);
  guessers[0].send("draw.operation", { operation: { kind: "stroke", id: "forged_stroke_1", tool: "pen", color: "#111827", size: 6, points: [[0.1, 0.1], [0.2, 0.2]] } });
  const forged = await guessers[0].wait("error", (event) => event.payload.code === "NOT_DRAWER");
  assert.equal(forged.payload.code, "NOT_DRAWER");

  drawer.send("draw.operation", { operation: { kind: "stroke", id: "canonical_stroke_1", tool: "pen", color: "#111827", size: 6, points: [[0.1, 0.1], [0.2, 0.2]] } });
  await Promise.all([alice, bob, charlie].map((candidate) => candidate.wait("drawing.operation", (event) => event.payload.operation.id === "canonical_stroke_1")));

  const correctGuess = guessers[0];
  correctGuess.send("chat.send", { text: secret.payload.word });
  const acceptedGuess = await correctGuess.wait("guess.accepted");
  assert.ok(acceptedGuess.payload.points >= 100);
  const publicCorrect = await drawer.wait("guess.correct");
  assert.equal(publicCorrect.payload.word, undefined, "the public correct event must not contain the answer");
  assert.equal(drawer.events.some((event) => event.type === "chat.message" && event.payload.text === secret.payload.word), false, "the answer must not be broadcast as chat");

  const disconnectedPlayerId = charlie.events.find((event) => event.type === "connection.accepted").payload.playerId;
  charlie.close();
  const left = await alice.wait("player.left", (event) => event.payload.playerId === disconnectedPlayerId);
  assert.equal(left.payload.player.connected, false, "disconnected players remain visible as offline");
  const updatedScores = await alice.wait("scoreboard.updated", (event) => event.payload.players.some((player) => player.id === disconnectedPlayerId && !player.connected));
  assert.equal(updatedScores.payload.players.find((player) => player.id === disconnectedPlayerId).connected, false, "offline players remain in the scoreboard");

  const charlieResumeToken = charlie.events.find((event) => event.type === "connection.accepted").payload.resumeToken;
  const charlieReconnect = client("charlie-reconnect");
  await charlieReconnect.ready();
  charlieReconnect.send("room.resume", { roomId, resumeToken: charlieResumeToken });
  const resumed = await charlieReconnect.wait("connection.accepted", (event) => event.payload.resumed === true);
  assert.equal(resumed.payload.playerId, disconnectedPlayerId, "reconnect must restore the same player identity");
  await charlieReconnect.wait("room.snapshot");
  const reconnected = await alice.wait("player.reconnected", (event) => event.payload.player.id === disconnectedPlayerId && event.payload.player.connected);
  const reconnectedScores = await alice.wait("scoreboard.updated", (event) => event.payload.version >= reconnected.payload.version && event.payload.players.some((player) => player.id === disconnectedPlayerId && player.connected));
  assert.equal(reconnectedScores.payload.players.find((player) => player.id === disconnectedPlayerId).connected, true, "reconnected players must be online in the scoreboard");
  charlieReconnect.close();
  await alice.wait("player.left", (event) => event.payload.playerId === disconnectedPlayerId && event.payload.version > reconnected.payload.version);

  const explicitlyLeftPlayerId = bob.events.find((event) => event.type === "connection.accepted").payload.playerId;
  bob.send("room.leave", {});
  const explicitlyLeft = await alice.wait("player.left", (event) => event.payload.playerId === explicitlyLeftPlayerId);
  assert.equal(explicitlyLeft.payload.player.connected, false, "an explicit page-leave command marks the player offline immediately");
  const endedByPlayerCount = await alice.wait("game.ended");
  assert.equal(endedByPlayerCount.payload.reason, "not-enough-players", "a live game ends when fewer than two players remain");
  assert.equal(endedByPlayerCount.payload.players[0].score >= endedByPlayerCount.payload.players[1].score, true, "final players are sorted by score");
  assert.equal(endedByPlayerCount.payload.replays[0].operations.some((operation) => operation.id === "canonical_stroke_1"), true, "final results must include the current round replay");

  twoPlayerHost.send("room.create", {
    displayName: "Two Player Host",
    settings: { rounds: 1, turnSeconds: 30, choiceSeconds: 5, hintEverySeconds: 10, maxPlayers: 12, words },
  });
  const twoPlayerAccepted = await twoPlayerHost.wait("connection.accepted");
  const twoPlayerRoomId = twoPlayerAccepted.payload.roomId;
  await twoPlayerHost.wait("room.snapshot");
  twoPlayerGuest.send("room.join", { roomId: twoPlayerRoomId, displayName: "Two Player Guest" });
  await twoPlayerGuest.wait("connection.accepted");
  await twoPlayerGuest.wait("room.snapshot");
  const twoPlayerVersion = await twoPlayerHost.wait("player.joined");
  twoPlayerHost.send("room.start", { expectedVersion: twoPlayerVersion.payload.version });
  await twoPlayerHost.wait("turn.started");
  twoPlayerGuest.send("room.leave", {});
  twoPlayerGuest.close();
  await twoPlayerHost.wait("player.left", (event) => event.payload.player.connected === false);
  const twoPlayerGameOver = await twoPlayerHost.wait("game.ended");
  assert.equal(twoPlayerGameOver.payload.reason, "not-enough-players", "a two-player game must end when one player leaves");

  reloadHost.send("room.create", {
    displayName: "Reload Host",
    settings: { rounds: 1, turnSeconds: 30, choiceSeconds: 5, hintEverySeconds: 10, maxPlayers: 12, words },
  });
  const reloadAccepted = await reloadHost.wait("connection.accepted");
  const reloadRoomId = reloadAccepted.payload.roomId;
  const reloadHostId = reloadAccepted.payload.playerId;
  await reloadHost.wait("room.snapshot");
  reloadGuestOne.send("room.join", { roomId: reloadRoomId, displayName: "Reload Guest One" });
  await reloadGuestOne.wait("connection.accepted");
  await reloadGuestOne.wait("room.snapshot");
  reloadGuestTwo.send("room.join", { roomId: reloadRoomId, displayName: "Reload Guest Two" });
  await reloadGuestTwo.wait("connection.accepted");
  await reloadGuestTwo.wait("room.snapshot");
  const reloadLobbyVersion = await reloadHost.wait("player.joined", (event) => event.payload.player.displayName === "Reload Guest Two");
  reloadHost.send("room.start", { expectedVersion: reloadLobbyVersion.payload.version });
  const activeTurn = await reloadHost.wait("turn.started");
  const phaseBeforeReload = "CHOOSING_WORD";
  const roundBeforeReload = activeTurn.payload.roundNumber;
  const drawerBeforeReload = activeTurn.payload.drawerId;
  const reloadResumeToken = reloadHost.events.find((event) => event.type === "connection.accepted").payload.resumeToken;
  reloadHost.close();
  await reloadGuestOne.wait("player.left", (event) => event.payload.playerId === reloadHostId);
  const temporaryHostSnapshot = await reloadGuestOne.wait("room.snapshot", (event) => event.payload.hostPlayerId !== reloadHostId);
  assert.equal(temporaryHostSnapshot.payload.players.some((player) => player.id !== reloadHostId && player.isHost && player.connected), true, "a connected temporary host must be assigned immediately");

  hostAfterReload = client("reload-host-after-refresh");
  await hostAfterReload.ready();
  hostAfterReload.send("room.resume", { roomId: reloadRoomId, resumeToken: reloadResumeToken });
  const resumedHost = await hostAfterReload.wait("connection.accepted", (event) => event.payload.resumed === true);
  assert.equal(resumedHost.payload.playerId, reloadHostId, "host refresh must restore the original player identity");
  const resumedSnapshot = (await hostAfterReload.wait("room.snapshot")).payload;
  assert.equal(resumedSnapshot.phase, phaseBeforeReload, "host refresh must preserve the active game phase");
  assert.equal(resumedSnapshot.roundNumber, roundBeforeReload, "host refresh must preserve the current round");
  assert.equal(resumedSnapshot.currentDrawerId, drawerBeforeReload, "host refresh must preserve the current drawer");
  assert.equal(resumedSnapshot.hostPlayerId, reloadHostId, "host refresh must restore host authority");
  assert.equal(resumedSnapshot.players.find((player) => player.id === reloadHostId).isHost, true, "resumed host must be marked as host");
  const resumedOptions = await hostAfterReload.wait("turn.wordOptions");
  assert.equal(resumedOptions.payload.options.length, 3, "a resumed drawer must receive the current word options");
  hostAfterReload.send("turn.chooseWord", { optionId: resumedOptions.payload.options[0].id });
  await hostAfterReload.wait("turn.drawingStarted");
  const selectedSecret = await hostAfterReload.wait("turn.secretWord");
  assert.equal(selectedSecret.payload.word, resumedOptions.payload.options[0].text, "the drawer must receive the selected secret");
  await reloadGuestOne.wait("player.reconnected", (event) => event.payload.player.id === reloadHostId);
  const drawerResumeToken = resumedHost.payload.resumeToken;
  hostAfterReload.close();
  await reloadGuestOne.wait("player.left", (event) => event.payload.playerId === reloadHostId && event.payload.version > resumedSnapshot.version);

  drawerAfterReload = client("drawer-after-refresh");
  await drawerAfterReload.ready();
  drawerAfterReload.send("room.resume", { roomId: reloadRoomId, resumeToken: drawerResumeToken });
  const resumedDrawer = await drawerAfterReload.wait("connection.accepted", (event) => event.payload.resumed === true);
  assert.equal(resumedDrawer.payload.playerId, reloadHostId, "a refreshed drawer must restore the same identity");
  await drawerAfterReload.wait("room.snapshot");
  const restoredSecret = await drawerAfterReload.wait("turn.secretWord");
  assert.equal(restoredSecret.payload.word, selectedSecret.payload.word, "a mid-turn drawer refresh must restore the private secret");

  console.log(`smoke test passed: room ${roomId}, private word, authority rejection, ordered stroke fan-out, scoring, reconnect projection, drawer private-state recovery, host state restoration, and minimum-player game over verified`);
} finally {
  alice.close();
  bob.close();
  charlie.close();
  twoPlayerHost.close();
  twoPlayerGuest.close();
  reloadHost.close();
  reloadGuestOne.close();
  reloadGuestTwo.close();
  hostAfterReload?.close();
  drawerAfterReload?.close();
}

