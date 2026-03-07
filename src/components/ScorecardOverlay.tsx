import type { PlayerState } from '../types'
import { EVENTS } from '../data/events'
import { getAthleteGraphic } from '../data/athleteGraphics'
import './ScorecardOverlay.css'

interface ScorecardOverlayProps {
  players: PlayerState[]
  currentEventId: string
  onClose: () => void
}

export function ScorecardOverlay({ players, currentEventId, onClose }: ScorecardOverlayProps) {
  const sorted = [...players].sort((a, b) => b.totalPoints - a.totalPoints)
  const leaderPoints = sorted[0]?.totalPoints ?? 0

  return (
    <div className="scorecard-overlay" onClick={onClose}>
      <div className="scorecard-modal" onClick={e => e.stopPropagation()}>
        <div className="scm-header">
          <h2>Scorecard</h2>
          <button className="scm-close" onClick={onClose}>&times;</button>
        </div>

        <div className="scm-body">
          {/* Leaderboard */}
          <div className="scm-leaderboard">
            <h3>Standings</h3>
            {sorted.map((p, i) => {
              const g = getAthleteGraphic(p.athleteId)
              const behind = leaderPoints - p.totalPoints
              return (
                <div key={p.id} className="scm-standing" style={{ borderLeftColor: g.color }}>
                  <span className="scm-pos">{i + 1}</span>
                  <span className="scm-name">{p.name}</span>
                  {behind > 0 && <span className="scm-behind">-{behind}</span>}
                  <span className="scm-total">{p.totalPoints} pts</span>
                </div>
              )
            })}
          </div>

          {/* Full results table */}
          <table className="scm-table">
            <thead>
              <tr>
                <th>Event</th>
                {sorted.map(p => (
                  <th key={p.id} colSpan={2}>{p.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EVENTS.map(event => {
                const isCurrent = event.id === currentEventId
                return (
                  <tr key={event.id} className={isCurrent ? 'current-event' : ''}>
                    <td className="scm-event-name">{event.name}</td>
                    {sorted.map(player => {
                      const result = player.eventResults.find(r => r.eventId === event.id)
                      return [
                        <td key={`${player.id}-r`} className="scm-result">
                          {result?.bestResultDisplay ?? '—'}
                        </td>,
                        <td key={`${player.id}-p`} className="scm-points">
                          {result?.points ?? ''}
                        </td>,
                      ]
                    })}
                  </tr>
                )
              })}
              <tr className="scm-total-row">
                <td>Total</td>
                {sorted.map(player => (
                  <td key={player.id} colSpan={2} className="scm-total-val">
                    {player.totalPoints}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
