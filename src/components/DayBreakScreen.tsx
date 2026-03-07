import { useGameStore } from '../game/store'
import './DayBreakScreen.css'

export function DayBreakScreen() {
  const players = useGameStore(s => s.players)

  const sorted = [...players].sort((a, b) => b.totalPoints - a.totalPoints)

  function handleContinue() {
    useGameStore.setState({ phase: 'choosingEffort' })
  }

  return (
    <div className="daybreak-screen">
      <div className="daybreak-content">
        <h1>End of Day 1</h1>
        <p className="daybreak-subtitle">Standings after 5 events</p>

        <div className="standings-list">
          {sorted.map((player, i) => (
            <div key={player.id} className="standing-row">
              <span className="standing-pos">{i + 1}</span>
              <span className="standing-name">{player.name}</span>
              <span className="standing-points">{player.totalPoints} pts</span>
            </div>
          ))}
        </div>

        <p className="daybreak-note">
          Stamina has been reset to 6 for Day 2. All unused Day 1 stamina is lost.
        </p>

        <button className="primary" onClick={handleContinue}>
          Begin Day 2
        </button>
      </div>
    </div>
  )
}
