import type { CSSProperties } from "react";
import type { PlayerProjection } from "@sapien/protocol";

type FinalResultsProps = {
  players: PlayerProjection[];
  playerId: string;
};

function animationStyle(index: number): CSSProperties {
  return { "--result-delay": `${index * 90}ms` } as CSSProperties;
}

export function FinalResults({ players, playerId }: FinalResultsProps): JSX.Element {
  const ranking = [...players].sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
  const winner = ranking[0];

  return (
    <section className="final-results" aria-labelledby="final-results-title">
      <div className="results-hero">
        <div>
          <span className="eyebrow">GAME COMPLETE</span>
          <h2 id="final-results-title">{winner ? `${winner.displayName} wins!` : "Game complete."}</h2>
          <p>{winner ? "The final scores are in. What a round." : "Thanks for playing."}</p>
        </div>
        {winner && <div className="winner-burst" aria-hidden="true"><span>1</span></div>}
      </div>

      <div className="podium" aria-label="Top three players">
        {ranking.slice(0, 3).map((player, index) => {
          const place = index + 1;
          return (
            <div className={`podium-card place-${place} ${player.id === playerId ? "me" : ""}`} key={player.id} style={animationStyle(index)}>
              <span className="podium-place">{place === 1 ? "WINNER" : `#${place}`}</span>
              <span className="podium-avatar">{player.displayName.slice(0, 1).toUpperCase()}</span>
              <strong>{player.displayName}</strong>
              <b>{player.score}</b>
              <small>points</small>
            </div>
          );
        })}
      </div>

      <div className="results-leaderboard">
        <div className="results-list-heading"><span>FINAL RANKING</span><small>{ranking.length} players</small></div>
        {ranking.map((player, index) => (
          <div className={`result-row ${index === 0 ? "winner" : ""} ${player.id === playerId ? "me" : ""}`} key={player.id} style={animationStyle(index)}>
            <span className="result-rank">{String(index + 1).padStart(2, "0")}</span>
            <span className={player.connected ? "result-avatar" : "result-avatar offline"}>{player.displayName.slice(0, 1).toUpperCase()}</span>
            <span className="result-name">{player.displayName}{player.id === playerId && <em> you</em>}{!player.connected && <em> offline</em>}</span>
            <strong>{player.score}<small> pts</small></strong>
          </div>
        ))}
      </div>
    </section>
  );
}
