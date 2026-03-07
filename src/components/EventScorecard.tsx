import type { PlayerState, EventDefinition } from '../types'
import { getAthleteGraphic } from '../data/athleteGraphics'
import { parseFeetInches } from '../game/chartLookup'
import './EventScorecard.css'

interface EventScorecardProps {
  players: PlayerState[]
  event: EventDefinition
  currentPlayerIndex: number
  heightList?: string[]
  playerMaxHeights?: Record<number, number>  // playerId -> max possible height in inches
}

function inchesToDisplay(inches: number): string {
  const ft = Math.floor(inches / 12)
  const inn = inches % 12
  return `${ft}' ${inn}"`
}

export function EventScorecard({ players, event, currentPlayerIndex, heightList = [], playerMaxHeights = {} }: EventScorecardProps) {
  const isFieldEvent = event.type === 'field_throw' || event.type === 'field_jump'
  const isMultiSegment = event.type === 'multi_segment'
  const isHeight = event.type === 'height'

  // For height events, use a spreadsheet-style table
  if (isHeight) {
    return (
      <div className="event-scorecard esc-height-card">
        <div className="esc-header">
          <span className="esc-title">{event.name}</span>
        </div>

        <div className="esc-height-table-wrap">
          <table className="esc-height-table">
            <thead>
              <tr>
                <th className="esc-ht-height-col">Height</th>
                {players.map((p, pi) => {
                  const g = getAthleteGraphic(p.athleteId)
                  return (
                    <th
                      key={p.id}
                      colSpan={3}
                      className={`esc-ht-player-col ${pi === currentPlayerIndex ? 'active' : ''}`}
                      style={{ borderBottomColor: g.color }}
                    >
                      {g.abbreviation}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {heightList.map(height => {
                return (
                  <tr key={height}>
                    <td className="esc-ht-height">{height}</td>
                    {players.map(p => {
                      // Check if this height is impossible for this athlete
                      const maxHeight = playerMaxHeights[p.id] ?? Infinity
                      const heightInches = parseFeetInches(height) ?? 0
                      if (heightInches > maxHeight) {
                        return [0, 1, 2].map(boxIdx => (
                          <td key={`${p.id}-${boxIdx}`} className="esc-ht-box blocked" />
                        ))
                      }

                      const result = p.eventResults.find(r => r.eventId === event.id)
                      const hp = result?.heightProgression?.find(h => h.height === height)
                      const attempts = hp?.attempts ?? []

                      // Check if player is completely done (chose to stop or 3 consecutive misses)
                      let totalConsecMisses = 0
                      if (result?.heightProgression) {
                        for (const prevHp of result.heightProgression) {
                          for (const a of prevHp.attempts) {
                            if (a === 'X') totalConsecMisses++
                            else if (a === 'O') totalConsecMisses = 0
                          }
                        }
                      }
                      const playerDone = result?.heightDone || totalConsecMisses >= 3

                      // If player is done and has no entry at this height, fill all with '-'
                      if (playerDone && !hp) {
                        return [0, 1, 2].map(boxIdx => (
                          <td key={`${p.id}-${boxIdx}`} className="esc-ht-box skip">-</td>
                        ))
                      }

                      // Count carried consecutive misses entering this height
                      let carriedMisses = 0
                      if (result?.heightProgression) {
                        for (const prevHp of result.heightProgression) {
                          if (prevHp.height === height) break
                          for (const a of prevHp.attempts) {
                            if (a === 'X') carriedMisses++
                            else if (a === 'O') carriedMisses = 0
                          }
                        }
                      }

                      // Build the 3-box display with carried miss offset
                      const isDone = hp?.cleared || attempts.includes('P') || playerDone
                      const actualAttempts = attempts.filter(a => a === 'O' || a === 'X' || a === 'P')

                      return [0, 1, 2].map(boxIdx => {
                        let val = ''
                        if (boxIdx < carriedMisses) {
                          val = '-'
                        } else {
                          const attemptIdx = boxIdx - carriedMisses
                          val = actualAttempts[attemptIdx] ?? ''
                          if (val === '' && isDone && attemptIdx >= actualAttempts.length) {
                            val = '-'
                          }
                        }
                        let cls = 'esc-ht-box'
                        if (val === 'O') cls += ' cleared'
                        else if (val === 'X') cls += ' missed'
                        else if (val === 'P') cls += ' passed'
                        else if (val === '-') cls += ' skip'
                        return (
                          <td key={`${p.id}-${boxIdx}`} className={cls}>
                            {val}
                          </td>
                        )
                      })
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Player status row */}
        <div className="esc-height-status">
          {players.map((p, pi) => {
            const g = getAthleteGraphic(p.athleteId)
            const result = p.eventResults.find(r => r.eventId === event.id)
            return (
              <div
                key={p.id}
                className={`esc-ht-status-item ${pi === currentPlayerIndex ? 'active' : ''}`}
                style={{ borderLeftColor: g.color }}
              >
                <span className="esc-ht-status-name">{p.name}</span>
                {playerMaxHeights[p.id] != null && (
                  <span className="esc-ht-status-pb">
                    PB: {inchesToDisplay(playerMaxHeights[p.id])}
                  </span>
                )}
                {result && result.bestResult !== null && (
                  <span className="esc-ht-status-best">
                    {result.bestResultDisplay}
                    {result.points > 0 && <span className="esc-pts"> ({result.points})</span>}
                  </span>
                )}
                <span className="esc-ht-status-sp">
                  SP: {event.day === 1 ? p.staminaDay1 : p.staminaDay2}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

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
