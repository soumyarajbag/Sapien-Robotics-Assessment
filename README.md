# Sapien Robotics — Full Stack Developer Assignment

This repository contains both parts of the assignment.

## Question 1 — Multiplayer Drawing & Guessing Game

The implementation and its design documents are in [`question-1/`](question-1/):

- [`PRD.md`](question-1/PRD.md) — user experience, game rules, requirements, acceptance criteria, and success metrics.
- [`TRD.md`](question-1/TRD.md) — implementation architecture, realtime protocol, security model, failure handling, testing, and capacity methodology.
- [`README.md`](question-1/README.md) — run instructions, verification commands, and demo checklist.

Run it from the Question 1 folder with:

```bash
cd question-1
npm run start:all
```

The raw equivalent is `docker compose up --build`; both commands start the React frontend on port 3000, Node/WebSocket backend on port 8080, and Redis together.

All Question 1 runtime files—including `package.json`, the lockfile, Docker files, and source code—are contained in [`question-1/`](question-1/). Dependencies are intentionally installed with `npm ci` or by the Docker build; generated dependency and build folders are not committed. Question 2 remains documentation-only and independent.

## Question 2 — Music Streaming with Shared Listening Rooms

The architecture submission is in [`question-2/`](question-2/):

- [`README.md`](question-2/README.md) — design overview and review guide.
- [`docs/design.md`](question-2/docs/design.md) — design document.
- [`docs/diagrams/architecture.mmd`](question-2/docs/diagrams/architecture.mmd) — architecture diagram source.
- [`docs/diagrams/host-pause.mmd`](question-2/docs/diagrams/host-pause.mmd) — pause sequence diagram source.

## Submission checklist

- [x] Implement Question 1 according to the PRD/TRD.
- [x] Add the one-command run instructions to `question-1/README.md`.
- [x] Run the capacity test and include the measured baseline; expand it on the final target machine if possible.
- [ ] Record the two-minute demo with three players in separate browser windows.
- [ ] Push the repository and email the GitHub link plus recording link to `aditya.patil@sapienrobotics.ai`.

