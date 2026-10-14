# Product Requirements Document

## Sketch League - Multiplayer Drawing and Guessing Game

**Status:** Implemented assignment MVP

**Audience:** Product, engineering, reviewers, and anyone recording the demo

**Product promise:** A group can open a link, play a fair drawing game, and recover from a short refresh or network drop without losing the room state.

This document describes the behavior implemented in `question-1/`. Items labelled **Next** are deliberate production improvements, not claims about the current demo.

## 1. Product summary

Sketch League is an anonymous, browser-based Pictionary game. A host creates a room and shares a six-character room code or URL. Players join with a display name. On each turn, the server chooses the drawer, gives that player three private word choices, validates every action, owns the timer, awards points, and publishes the safe public projection of the room.

The client is intentionally treated as an untrusted view. It can request an action, but it cannot choose the answer, set a score, extend a timer, or draw as another player. The game is designed for a small group rather than an open public service: the implemented room limit is 12 players.

## 2. Goals and non-goals

### Goals in the submitted MVP

- Create a room and join it from a shareable URL or from the landing page using a room code.
- Let the host configure rounds, turn duration, and a custom word list before starting.
- Make drawing feel immediate with a local canvas preview and canonical server operations for all peers.
- Keep word selection, timers, scoring, turn transitions, and eligibility server-authoritative.
- Support pen, colour, brush size, eraser, fill, undo, and clear operations.
- Support hints, chat guesses, private near-miss feedback, and speed-based scoring.
- Keep disconnected players in the roster as offline, preserve their score, and allow resume for 30 seconds.
- Recover the room when the host refreshes and restore host authority when the original host resumes.
- End a live game when a permanent departure leaves fewer than two players.
- Store canonical drawing operations and make them playable as a stroke-by-stroke replay.
- Provide a Docker command, a development command, an automated smoke test, and a repeatable load harness.

### Explicit non-goals

- Accounts, passwords, friends, matchmaking, public room discovery, or persistent player profiles.
- Voice/video chat or mobile-native clients.
- AI drawing recognition or profanity classification. The current server does not provide a content moderation service.
- Multi-region active-active rooms or live room migration between processes.
- More than 12 players in one room.
- A production identity system. Resume tokens provide short-lived continuity, not authentication.

## 3. Personas and jobs to be done

| Persona | Job | What the product must make obvious |
| --- | --- | --- |
| Host | Start a game with friends | Room code, invite link, settings, host controls, start state |
| Drawer | Draw the private answer quickly | Word choices, secret word, tools, timer, local preview |
| Guesser | Guess before other players | Masked word, live canvas, chat, close feedback, score changes |
| Returning player | Recover after refresh or a short drop | Reconnecting state, preserved score, restored phase and canvas |
| Reviewer | Verify that the game is fair | Server authority, deterministic transitions, tests, and evidence |

## 4. Implemented user journey

### 4.1 Landing page

The player enters a display name and either creates a room or joins an existing six-character code. If the URL contains `?room=xxxxxx`, the page probes the room first. An inactive, expired, or completed room does not show a fake start state; it explains that the room is unavailable and offers a new room or another code.

When creating a room, the UI sends the current rounds, turn duration, and word list to the server. The default word bank contains 20 words. At least 10 words are required.

### 4.2 Lobby

The lobby shows the room code, player roster, online/offline state, host marker, settings, copy-link action, invite action, and start state.

The host can edit settings while the room is in `LOBBY`. Saving settings changes the settings version only; it does not change the room code or remove joined players. The server rejects stale settings updates and all updates after the game begins. At least two connected players are required to start.

If the host's socket drops, a connected player becomes the temporary host immediately. The original host has 30 seconds to resume and reclaim host authority. If that window expires, the temporary transfer becomes permanent.

If the drawer's socket drops, the server preserves the turn for five seconds. A drawer that resumes keeps the same server-side turn and receives the private word options or selected secret again, depending on the phase.

### 4.3 Turn flow

1. The server assigns the next connected drawer in join order.
2. The server broadcasts `turn.started` without a word.
3. Only the drawer receives three word options through a private event.
4. The drawer chooses one. If the choice timer expires, the server chooses the first option.
5. The server enters `DRAWING`, privately sends the answer to the drawer, and broadcasts only the masked word and absolute deadline.
6. The drawer draws. Guessers submit text through chat.
7. Exact answers are accepted once per player and are never broadcast as raw chat text. The guesser receives private points feedback; the room receives a safe correct-guess event.
8. A near-miss receives private `close!` feedback. The attempted text remains an ordinary chat message, so it is not treated as a correct-answer leak.
9. Hints are generated by the server at the configured interval.
10. The round ends on deadline, when every eligible connected guesser has guessed, when there are no eligible guessers for five seconds, or when the drawer's five-second disconnect grace expires.
11. The answer and replay become visible for a four-second reveal phase. The server then advances to the next drawer or ends the game.

### 4.4 Game completion

At `GAME_OVER`, the client shows an animated winner and final ranking. Offline players remain in the results and are labelled offline. Every completed round has a replay, and the current round is also captured if the game ends early because the room falls below the player minimum.

## 5. Product requirements and current status

| ID | Requirement | Current behavior |
| --- | --- | --- |
| PR-01 | Create/join rooms | Implemented. Six lowercase hexadecimal characters are generated by the server. The code is for sharing, not an authentication boundary. |
| PR-02 | Host settings | Implemented. Server schema accepts 1-10 rounds, 30-180 seconds, and 10-500 words. The current UI exposes 1-5 rounds and 30/60/90/120 seconds. |
| PR-03 | Lobby presence | Implemented. Roster projections include score, host marker, connected state, and guessed state. |
| PR-04 | Private word choice | Implemented. Only the drawer receives the three option texts and selected secret. Public snapshots contain a masked/revealed projection only. |
| PR-05 | Drawing tools | Implemented. Pen, eraser, fill, undo, clear, colour, and brush size are represented as validated operations. |
| PR-06 | Canvas sync | Implemented for canonical completed operations. The drawer sees a local pointer preview; the server broadcasts the operation on pointer-up. Point-chunk streaming during a long stroke is a Next improvement. |
| PR-07 | Guess chat | Implemented. Chat is capped at 200 characters and five messages per 10 seconds per connection. Exact answers are suppressed from public chat. |
| PR-08 | Server timer | Implemented. The server stores absolute choice/turn deadlines and validates actions against `Date.now()`. The client countdown is display-only. |
| PR-09 | Hints | Implemented. The server masks the word and reveals another character every configured interval. |
| PR-10 | Speed scoring | Implemented. Accepted guesses receive 100-500 points based on remaining time; the drawer receives up to 150 bonus points per turn. |
| PR-11 | Early completion | Implemented. Correct eligible guessers are tracked server-side; disconnected players are removed from eligibility after five seconds. |
| PR-12 | Resume | Implemented. `sessionStorage` retains an opaque resume token for 30 seconds. A resume receives a fresh snapshot and preserves identity and score. |
| PR-13 | Drawer recovery | Implemented. A drawer has a five-second grace period; a valid resume restores the same turn and re-sends private word options during selection or the selected secret during drawing. If the drawer does not resume, the server reveals the round and moves on. |
| PR-14 | Replay | Implemented. Replays use canonical operations sorted by `eventSeq`, with play/pause, restart, scrub, and 0.5x/1x/2x speed. |
| PR-15 | Abuse controls | Implemented at schema and connection level. Points, operation shape, text lengths, chat rate, and drawing rate are bounded. IP/global rate limits and a byte-level payload cap are Next items. |
| PR-16 | Recovery feedback | Implemented. Toasts, offline roster state, reconnect messages, inactive-room messaging, native navigation confirmation, sound cues, and final results are included. |

## 6. Settings and rules

### Server limits

| Setting | Implemented range/default |
| --- | --- |
| Rounds | 1-10 by protocol; UI currently offers 1-5; create default is 3 |
| Turn duration | 30-180 seconds by protocol; UI currently offers 30/60/90/120; create default is 60 |
| Word-choice duration | 5-30 seconds by protocol; default is 15 |
| Hint interval | 5-60 seconds by protocol; default is 10 |
| Players | 2-12; default maximum is 12 |
| Word list | 10-500 entries; each entry is trimmed and limited to 40 characters |
| Chat message | 1-200 characters |
| Stroke points | 1-4096 normalized points per stroke |
| Drawing operations | 60 operations per second per connection |

The current UI sends `maxPlayers: 12`, `choiceSeconds: 15`, and `hintEverySeconds: 10`. The lobby settings form exposes rounds, turn duration, and words; the other values are stable MVP defaults.

### Scoring

The server uses:

```text
guessPoints = 100 + floor(400 * remainingMs / turnDurationMs)
```

The result is clamped to 100-500. A player can be awarded for a word once. The drawer receives 50 points for each accepted guess, capped at 150 for that turn.

Guess normalization applies Unicode NFKC normalization, trimming, lowercasing with `en-US`, and whitespace collapsing. Near-misses use containment or Levenshtein distance of two or less for similarly sized strings.

## 7. Resilience rules visible to players

| Situation | Implemented behavior |
| --- | --- |
| Browser refresh/network drop | The WebSocket closes, the player is marked offline, and a 30-second resume record preserves identity and score. |
| Player reconnects | The new socket presents the room and resume token; the server rotates the token and sends a current snapshot. |
| Host disconnects | A connected player is promoted immediately. The original host can reclaim the role within 30 seconds. |
| Drawer disconnects | The server waits five seconds. A resumed drawer keeps the turn state and receives the private options/secret for the current phase; otherwise the round ends as `drawer-disconnected`. |
| Permanent `room.leave` | The resume token is deleted. An active game with fewer than two connected players ends as `not-enough-players`. |
| Only one connected player after a transient drop | The game waits through the 30-second reconnect window. If nobody returns, the game ends. |
| Server restarts with Redis | Recent snapshots hydrate on boot. Players can resume while their 30-second token is valid. The new process gets a new `serverEpoch`. |
| Server restarts without Redis | In-memory rooms and resume tokens are lost. This is explicitly labelled demo-memory mode. |
| All players disappear | The in-memory room is removed after ten minutes; Redis snapshots expire after 24 hours. |

## 8. Experience details

- Copy-link and Invite actions provide toast feedback.
- Invite supports the Web Share API when available, copy-to-clipboard, WhatsApp, Telegram, and email links.
- A browser `beforeunload` confirmation is used while the player is in a room. Page hide remains resumable rather than sending an explicit permanent leave.
- The sound toggle controls self-contained Web Audio cues for drawing, button interactions, correct guesses, near-misses, round changes, errors, reconnects, and disconnects. No external audio files are needed.
- The chat panel is intentionally visible beside the canvas and keeps a bounded client-side history.

## 9. Success criteria and evidence

The current automated smoke test verifies:

- room creation, three-player joining, settings validation, and settings persistence;
- private word delivery and rejection of a forged non-drawer stroke;
- canonical stroke fan-out and answer suppression;
- offline roster projection and 30-second identity resume;
- explicit-leave game over with final ranking and replay preservation;
- two-player minimum-player game over;
- host refresh, temporary host assignment, phase preservation, host restoration, and drawer private-state recovery.

The load harness measures operation fan-out latency from the synthetic drawer's send timestamp to each receiving client. A verified Docker run with the default profile used 4 rooms x 6 players (24 WebSockets), 160 operations, and 960 samples with p50 4.56 ms, p95 13.87 ms, and p99 26.21 ms. Treat this as a reproducible smoke baseline, not as a saturation limit; rerun it at a larger profile on the machine used for the final recording.

For the browser demo, success means three separate browser sessions can create/join, configure, play, reconnect, recover a drawer, and open the final replay without a stuck state.

## 10. Demo checklist

1. Start the app and open it in three separate browser windows or profiles.
2. Create a room in the first window and join from the other two using the link or code.
3. Edit lobby settings and show that the room code and players remain intact.
4. Start the game; show the drawer's private three-word choice.
5. Draw with colour, size, eraser, fill, undo, or clear and show the other canvases updating.
6. Submit a near-miss and an exact answer; show private feedback and speed-based score changes.
7. Refresh a player and show the same identity and score returning.
8. Disconnect the drawer or explicitly leave a two-player game and show clean recovery/game over.
9. Show the animated final ranking and play the replay.

## 11. Next improvements

The most valuable follow-ups are point-chunk stroke streaming, a client gap buffer with automatic `room.sync`, explicit byte-level WebSocket limits, IP/global rate limiting, stronger signed/authenticated resume tokens, and a multi-instance room ownership layer. These are intentionally separated from the submitted MVP so the current system can be reviewed honestly.
