import type {
  PlayerProjection,
  PublicRoomSnapshot,
} from "@sapien/protocol";
import { maskWord, type PlayerState, type RoomState } from "@sapien/game-core";

export class RoomPresenter {
  publicSnapshot(state: RoomState): PublicRoomSnapshot {
    const maskedWord = state.secretWord && state.phase === "DRAWING"
      ? maskWord(state.secretWord, state.hintNumber)
      : null;
    const isRevealPhase = state.phase === "ROUND_REVEAL" || state.phase === "GAME_OVER";
    return {
      roomId: state.roomId,
      matchId: state.matchId,
      serverEpoch: state.serverEpoch,
      eventSeq: state.eventSeq,
      version: state.version,
      phase: state.phase,
      settings: state.settings,
      players: this.projectPlayers(state),
      hostPlayerId: state.hostPlayerId,
      currentDrawerId: state.currentDrawerId,
      roundNumber: state.roundNumber,
      totalRounds: state.settings.rounds,
      choiceEndsAt: state.choiceEndsAt,
      turnEndsAt: state.turnEndsAt,
      maskedWord,
      hintNumber: state.hintNumber,
      operations: [...state.operations],
      revealedWord: isRevealPhase ? state.secretWord : null,
      replayOperations: isRevealPhase ? [...state.replayOperations] : [],
    };
  }

  projectPlayers(state: RoomState): PlayerProjection[] {
    return state.players.map((player) => this.projectPlayer(state, player));
  }

  projectPlayer(state: RoomState, player: PlayerState): PlayerProjection {
    return {
      id: player.id,
      displayName: player.displayName,
      score: player.score,
      connected: player.connected,
      isHost: player.id === state.hostPlayerId,
      guessed: state.guessedPlayerIds.includes(player.id),
    };
  }
}
