import { useGameStore } from '../game/store'
import { EVENTS } from '../data/events'
import './FinishedScreen.css'

export function FinishedScreen() {
  const players = useGameStore(s => s.players)
  const resetGame = useGameStore(s => s.resetGame)

  const sorted = [...players].sort((a, b) => b.totalPoints - a.totalPoints)
  const medals = ['gold', 'silver', 'bronze']

  return (
    <div className="finished-screen">
      <div className="finished-content">
        <h1>Decathlon Complete</h1>

        <div className="podium">
          {sorted.map((player, i) => (
            <div key={player.id} className={`podium-entry ${medals[i] ?? ''}`}>
              <div className="medal-icon">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
              </div>
              <div className="podium-name">{player.name}</div>
              <div className="podium-points">{player.totalPoints} pts</div>
            </div>
          ))}
        </div>

        <div className="full-results">
          <h2>Full Scoresheet</h2>
          <table className="results-table">
            <thead>
              <tr>
                <th>Event</th>
                {sorted.map(p => (
                  <th key={p.id} colSpan={2}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVENTS.map(event => (
                <tr key={event.id}>
                  <td className="event-label">{event.name}</td>
                  {sorted.map(player => {
                    const result = player.eventResults.find(r => r.eventId === event.id)
                    return [
                      <td key={`${player.id}-r`} className="result-cell">
                        {result?.bestResultDisplay ?? '—'}
                      </td>,
                      <td key={`${player.id}-p`} className="points-cell">
                        {result?.points ?? 0}
                      </td>,
                    ]
                  })}
                </tr>
              ))}
              <tr className="total-row">
                <td>Total</td>
                {sorted.map(player => (
                  <td key={player.id} colSpan={2} className="total-cell">
                    {player.totalPoints}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <button className="primary" onClick={resetGame}>
          New Game
        </button>
      </div>
    </div>
  )
}
