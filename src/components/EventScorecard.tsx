import type { PlayerState, EventDefinition } from '../types'
import { getAthleteGraphic } from '../data/athleteGraphics'
import './EventScorecard.css'

interface EventScorecardProps {
  players: PlayerState[]
  event: EventDefinition
  currentPlayerIndex: number
}

export function EventScorecard({ players, event, currentPlayerIndex }: EventScorecardProps) {
  const isFieldEvent = event.type === 'field_throw' || event.type === 'field_jump'
  const isMultiSegment = event.type === 'multi_segment'

  return (
    <div className="event-scorecard">
      <div className="esc-header">
        <span className="esc-title">{event.name}</span>
      </div>

      <div className="esc-players">
        {players.map((player, pi) => {
          const g = getAthleteGraphic(player.athleteId)
          const result = player.eventResults.find(r => r.eventId === event.id)
          const isActive = pi === currentPlayerIndex

          return (
            <div
              key={player.id}
              className={`esc-player ${isActive ? 'active' : ''}`}
              style={isActive ? { borderLeftColor: g.color } : undefined}
            >
              <div className="esc-player-header">
                <span className="esc-player-name">{player.name}</span>
                {result && result.bestResult !== null && (
                  <span className="esc-player-best">
                    {result.bestResultDisplay}
                    {result.points > 0 && <span className="esc-pts"> ({result.points})</span>}
                  </span>
                )}
              </div>

              {/* Field events: show attempts */}
              {isFieldEvent && (
                <div className="esc-attempts">
                  {[0, 1, 2].map(attemptIdx => {
                    const attempt = result?.attempts[attemptIdx]
                    const isBest = attempt && !attempt.isSpecial &&
                      attempt.resolvedResult !== null &&
                      attempt.resolvedResult === result?.bestResult

                    return (
                      <div
                        key={attemptIdx}
                        className={`esc-attempt ${attempt ? 'done' : 'pending'} ${isBest ? 'best' : ''}`}
                      >
                        <span className="esc-attempt-num">{attemptIdx + 1}</span>
                        <span className="esc-attempt-val">
                          {attempt
                            ? attempt.isSpecial
                              ? attempt.specialType ?? 'FOUL'
                              : attempt.displayResult
                            : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Multi-segment: show segment times */}
              {isMultiSegment && (
                <div className="esc-segments">
                  {Array.from({ length: event.segments ?? 0 }, (_, si) => {
                    const seg = result?.segments?.[si]
                    return (
                      <div key={si} className={`esc-segment ${seg ? 'done' : 'pending'}`}>
                        <span className="esc-seg-num">{si + 1}</span>
                        <span className="esc-seg-val">{seg ? seg.time.toFixed(2) : '—'}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Sprint: just show time */}
              {event.type === 'sprint' && result && (
                <div className="esc-sprint-time">
                  {result.bestResultDisplay || '—'}
                </div>
              )}

              {/* Height: show progression */}
              {event.type === 'height' && result?.heightProgression && (
                <div className="esc-heights">
                  {result.heightProgression.map((hp, hi) => (
                    <div key={hi} className="esc-height-row">
                      <span className="esc-height-val">{hp.height}</span>
                      <span className="esc-height-attempts">
                        {hp.attempts.join(' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Status bar */}
              <div className="esc-player-status">
                <span className="esc-stamina">
                  SP: {event.day === 1 ? player.staminaDay1 : player.staminaDay2}
                </span>
                {player.injuryPoints > 0 && (
                  <span className="esc-injury">INJ: {player.injuryPoints}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
