# Music Streaming with Shared Listening Rooms

Architecture submission for Question 2 of the Sapien Robotics Full Stack Developer assignment.

## Contents

- [Design document](docs/design.md) — key decisions, data model, reliability plan, observability, failure scenarios, and an initial build plan.
- [Architecture diagram](docs/diagrams/architecture.mmd) — Mermaid source for the system architecture.
- [Pause sequence diagram](docs/diagrams/host-pause.mmd) — Mermaid source for “host presses pause in a room of 5,000 listeners”.

GitHub renders Mermaid diagrams in Markdown. If a local preview is preferred, open `docs/design.md` in a Mermaid-compatible Markdown editor or paste either `.mmd` file into the [Mermaid Live Editor](https://mermaid.live/).

## Design summary

Audio is stored as aligned, multi-bitrate CMAF assets in object storage and delivered through a CDN. A room does not relay audio through its room server: every listener downloads the same catalogue asset independently. The room service distributes a small, versioned playback timeline over WebSockets:

```text
playhead(now) = anchor_position + (server_now - anchor_server_time), while playing
```

Clients estimate server clock offset, schedule commands slightly in the future, and report drift. They gently adjust playback rate for small errors and seek/rebuffer for larger errors. This keeps the control plane small enough for 200,000 rooms while targeting p95 absolute drift below 200 ms.

## How to review

Start with the design document, then inspect the two Mermaid sources. The design is intentionally implementation-oriented: it names the consistency boundary for room state, explains the trade-offs, and calls out what a three-person team should build first.

