import { useEffect, useState, useRef } from 'react'
import type { PlayerState } from '../../types'
import { getAthleteGraphic } from '../../data/athleteGraphics'
import './LongJumpPit.css'

interface LongJumpPitProps {
  players: PlayerState[]
  currentPlayerIndex: number
  eventId: string
  lastResult: number | null      // inches
  lastResultDisplay: string
  isSpecial: boolean
  jumpTrigger: number            // increment to trigger a new jump animation
}

// Long jump range in inches for the pit scale
const PIT_MIN_INCHES = 19 * 12     // 19'0"
const PIT_MAX_INCHES = 28 * 12     // 28'0"

// Distance markers in feet
const PIT_MARKERS = [20, 22, 24, 26, 28]

function inchesToDisplay(inches: number): string {
  const ft = Math.floor(inches / 12)
  const inc = inches % 12
  return `${ft}'${inc}"`
}

export function LongJumpPit({ players, currentPlayerIndex, eventId, lastResult, lastResultDisplay, isSpecial, jumpTrigger }: LongJumpPitProps) {
  const [phase, setPhase] = useState<'ready' | 'running' | 'jumping' | 'landed'>('ready')
  const prevTriggerRef = useRef(jumpTrigger)

  const currentPlayer = players[currentPlayerIndex]
  const graphic = currentPlayer ? getAthleteGraphic(currentPlayer.athleteId) : null

  // Collect all landed marks from previous attempts (all players)
  const landedMarks = players.flatMap(p => {
    const result = p.eventResults.find(r => r.eventId === eventId)
    if (!result) return []
    return result.attempts
      .filter(a => !a.isSpecial && a.resolvedResult !== null)
      .map(a => ({
        playerId: p.id,
        inches: a.resolvedResult!,
        color: getAthleteGraphic(p.athleteId).color,
        isBest: a.resolvedResult === result.bestResult,
      }))
  })

  // Convert inches to pit position percentage (within the sand area)
  function inchesToPitPercent(inches: number): number {
    const clamped = Math.max(PIT_MIN_INCHES, Math.min(PIT_MAX_INCHES, inches))
    return ((clamped - PIT_MIN_INCHES) / (PIT_MAX_INCHES - PIT_MIN_INCHES)) * 100
  }

  // Trigger jump animation when jumpTrigger increments
  useEffect(() => {
    if (jumpTrigger === prevTriggerRef.current) return
    prevTriggerRef.current = jumpTrigger

    if (jumpTrigger === 0 || lastResult === null) return

    setPhase('running')
    const t1 = setTimeout(() => setPhase('jumping'), 1400)
    const t2 = setTimeout(() => setPhase('landed'), 4200)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [jumpTrigger, lastResult])

  // Reset to ready when player changes (between attempts or players)
  useEffect(() => {
    setPhase('ready')
  }, [currentPlayerIndex])

  const landingPct = lastResult !== null ? inchesToPitPercent(lastResult) : 50
  const showRunner = phase === 'ready' || phase === 'running'

  return (
    <div className="longjump-pit">
      {/* Runway — left third */}
      <div className="lj-runway">
        <div className="lj-runway-surface" />
        {/* Runner on runway */}
        {graphic && showRunner && (
          <div className={`lj-runner ${phase}`}>
            <span className="lj-runner-figure">{graphic.runnerIcon}</span>
          </div>
        )}
      </div>

      {/* Takeoff board / foul line */}
      <div className="lj-board" />

      {/* Sand pit — right two thirds */}
      <div className="lj-sand">
        {/* Distance markers */}
        {PIT_MARKERS.map(ft => {
          const pct = inchesToPitPercent(ft * 12)
          return (
            <div key={ft} className="lj-marker" style={{ left: `${pct}%` }}>
              <div className="lj-marker-line" />
              <span className="lj-marker-label">{ft}'</span>
            </div>
          )
        })}

        {/* Previous landing marks */}
        {landedMarks.map((mark, i) => (
          <div
            key={i}
            className={`lj-landed-mark ${mark.isBest ? 'best' : ''}`}
            style={{
              left: `${inchesToPitPercent(mark.inches)}%`,
              '--mark-color': mark.color,
            } as React.CSSProperties}
          />
        ))}

        {/* Jumping athlete in the air */}
        {graphic && phase === 'jumping' && (
          <div
            className="lj-jumper"
            style={{ '--landing-pct': `${landingPct}%` } as React.CSSProperties}
          >
            <span className="lj-jumper-figure">{graphic.runnerIcon}</span>
          </div>
        )}

        {/* Landing splash + distance */}
        {phase === 'landed' && lastResult !== null && !isSpecial && (
          <div className="lj-landing" style={{ left: `${landingPct}%` }}>
            <div className="lj-splash" />
            <div className="lj-distance-tag" style={{ background: graphic?.color }}>
              {lastResultDisplay || inchesToDisplay(lastResult)}
            </div>
          </div>
        )}

        {/* Foul indicator */}
        {isSpecial && (phase === 'landed' || phase === 'ready') && lastResult === null && (
          <div className="lj-foul-flag">FOUL</div>
        )}
      </div>

      {/* Backboard behind pit */}
      <div className="lj-backboard" />
    </div>
  )
}
