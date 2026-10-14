import type { ScoreboardProps } from "../../../shared/types/game";

export function Scoreboard({ players, drawerId, playerId }: ScoreboardProps): JSX.Element {
  return (
    <div className="scoreboard">
      <div className="side-title"><span>PLAYERS</span><small>{players.filter((player) => player.connected).length} online</small></div>
      {[...players].sort((a, b) => b.score - a.score).map((player, index) => (
        <div className={player.id === playerId ? "score-row me" : "score-row"} key={player.id}>
          <span className="rank">{index + 1}</span>
          <span className={player.connected ? "mini-avatar" : "mini-avatar offline"}>{player.displayName.slice(0, 1).toUpperCase()}</span>
          <span className="score-name">
            {player.displayName}
            {player.id === drawerId && <em> drawing</em>}
            {!player.connected && <em> away</em>}
          </span>
          <strong>{player.score}</strong>
          {player.guessed && <span className="check">✓</span>}
        </div>
      ))}
    </div>
  );
}
