import type { PlayerState } from '../types'
import { EVENTS } from '../data/events'
import './Scoresheet.css'

interface ScoresheetProps {
  player: PlayerState
  currentEventId: string
}

export function Scoresheet({ player, currentEventId }: ScoresheetProps) {
  return (
    <div className="scoresheet">
      <div className="scoresheet-header">
        <span className="player-name">{player.name}</span>
        <span className="total-points">{player.totalPoints} pts</span>
      </div>

      <div className="scoresheet-events">
        {EVENTS.map(event => {
          const result = player.eventResults.find(r => r.eventId === event.id)
          const isCurrent = event.id === currentEventId
          const isDayBreak = event.order === 6

          return (
            <div key={event.id}>
              {isDayBreak && <div className="day-divider">Day 2</div>}
              <div className={`event-row ${isCurrent ? 'current' : ''} ${result ? 'completed' : ''}`}>
                <span className="event-order">{event.order}</span>
                <span className="event-name">{event.name}</span>
                <span className="event-result">
                  {result ? result.bestResultDisplay : '—'}
                </span>
                <span className="event-points">
                  {result ? result.points : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="scoresheet-status">
        <div className="status-item">
          <span className="status-label">Stamina D1</span>
          <span className="status-value">{player.staminaDay1}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Stamina D2</span>
          <span className="status-value">{player.staminaDay2}</span>
        </div>
        <div className="status-item">
          <span className="status-label">Injuries</span>
          <span className={`status-value ${player.injuryPoints > 0 ? 'danger' : ''}`}>
            {player.injuryPoints}
          </span>
        </div>
      </div>
    </div>
  )
}
