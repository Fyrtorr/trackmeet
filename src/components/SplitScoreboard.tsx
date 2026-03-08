import type { PlayerState, EventDefinition, GamePhase } from '../types'
import { getAthleteGraphic } from '../data/athleteGraphics'
import './SplitScoreboard.css'

interface SplitScoreboardProps {
  players: PlayerState[]
  event: EventDefinition
  currentPlayerIndex: number
  currentSegment: number
  phase: GamePhase
}

export function SplitScoreboard({ players, event, currentPlayerIndex, currentSegment, phase }: SplitScoreboardProps) {
  const totalSegments = event.segments ?? 4

  // Build player data with cumulative times
  const playerData = players.map((p, pi) => {
    const g = getAthleteGraphic(p.athleteId)
    const result = p.eventResults.find(r => r.eventId === event.id)
    const segments = result?.segments ?? []
    const cumTime = segments.reduce((sum, seg) => sum + seg.time, 0)
    const roundedCum = Math.round(cumTime * 100) / 100

    return {
      player: p,
      playerIndex: pi,
      graphic: g,
      segments,
      cumTime: roundedCum,
      points: result?.points ?? 0,
      isDQ: result?.bestResultDisplay?.startsWith('DQ') ?? false,
    }
  })

  // Sort by cumulative time for ranking (lower is better)
  const ranked = [...playerData]
    .filter(d => !d.isDQ && d.cumTime > 0)
    .sort((a, b) => a.cumTime - b.cumTime)

  const leaderTime = ranked.length > 0 ? ranked[0].cumTime : 0

  // Determine status labels during phases
  const isEffortPhase = phase === 'msEffortPicking'
  const isRollingPhase = phase === 'msRolling'

  return (
    <div className="split-scoreboard">
      <div className="split-header">
        <span className="split-title">{event.name}</span>
        <span className="split-segment-label">
          Segment {Math.min(currentSegment + 1, totalSegments)} / {totalSegments}
        </span>
      </div>

      <table className="split-table">
        <thead>
          <tr>
            <th className="split-th-pos">#</th>
            <th className="split-th-name">Athlete</th>
            {Array.from({ length: totalSegments }, (_, i) => (
              <th
                key={i}
                className={`split-th-seg ${i === currentSegment ? 'current' : ''} ${i < currentSegment ? 'done' : ''}`}
              >
                {i + 1}
              </th>
            ))}
            <th className="split-th-total">Total</th>
            <th className="split-th-gap">Gap</th>
            <th className="split-th-sp">SP</th>
            <th className="split-th-status">Status</th>
          </tr>
        </thead>
        <tbody>
          {[...playerData].sort((a, b) => {
            // Sort by cumulative time (leader first); players with no time go last
            if (a.cumTime > 0 && b.cumTime > 0) return a.cumTime - b.cumTime
            if (a.cumTime > 0) return -1
            if (b.cumTime > 0) return 1
            return a.playerIndex - b.playerIndex
          }).map((d) => {
            const rank = ranked.findIndex(r => r.playerIndex === d.playerIndex) + 1
            const gap = rank > 1 && d.cumTime > 0 ? (d.cumTime - leaderTime) : 0
            const isActive = d.playerIndex === currentPlayerIndex
            const stamina = event.day === 1 ? d.player.staminaDay1 : d.player.staminaDay2

            return (
              <tr
                key={d.player.id}
                className={`split-row ${isActive ? 'active' : ''}`}
                style={{ borderLeftColor: d.graphic.color }}
              >
                <td className="split-pos">
                  {d.isDQ ? '—' : rank > 0 ? rank : '—'}
                </td>
                <td className="split-name">
                  <span className="split-name-color" style={{ background: d.graphic.color }} />
                  {d.player.name}
                </td>
                {Array.from({ length: totalSegments }, (_, si) => {
                  const seg = d.segments[si]
                  return (
                    <td key={si} className={`split-seg ${si === currentSegment ? 'current' : ''}`}>
                      {seg ? seg.time.toFixed(2) : '—'}
                    </td>
                  )
                })}
                <td className="split-total">
                  {d.cumTime > 0 ? d.cumTime.toFixed(2) : '—'}
                </td>
                <td className="split-gap">
                  {gap > 0 ? `+${gap.toFixed(2)}` : ''}
                </td>
                <td className="split-sp">{stamina}</td>
                <td className="split-status-cell">
                  {isActive && isEffortPhase && <span className="split-status picking">Picking</span>}
                  {isActive && isRollingPhase && <span className="split-status rolling">Rolling</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
