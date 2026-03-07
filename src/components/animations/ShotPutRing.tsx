import { useEffect, useState, useRef } from 'react'
import type { PlayerState } from '../../types'
import { getAthleteGraphic } from '../../data/athleteGraphics'
import athleteData from '../../data/athletes.json'
import type { AthleteData } from '../../types'
import './ShotPutRing.css'

const athletes = athleteData as Record<string, AthleteData>

interface ShotPutRingProps {
  players: PlayerState[]
  currentPlayerIndex: number
  eventId: string
  lastResult: number | null      // inches
  lastResultDisplay: string
  isSpecial: boolean
  throwTrigger: number           // increment to trigger a new throw animation
}

// Shot put range in inches for sector scale
const SECTOR_MIN_INCHES = 30 * 12   // 30'
const SECTOR_MAX_INCHES = 60 * 12   // 60'

// Distance markers in feet
const SECTOR_MARKERS = [35, 40, 45, 50, 55]

function inchesToDisplay(inches: number): string {
  const ft = Math.floor(inches / 12)
  const inc = inches % 12
  return `${ft}'${inc}"`
}

export function ShotPutRing({ players, currentPlayerIndex, eventId, lastResult, lastResultDisplay, isSpecial, throwTrigger }: ShotPutRingProps) {
  const [phase, setPhase] = useState<'ready' | 'winding' | 'throwing' | 'landed'>('ready')
  const prevTriggerRef = useRef(throwTrigger)

  const currentPlayer = players[currentPlayerIndex]
  const graphic = currentPlayer ? getAthleteGraphic(currentPlayer.athleteId) : null
  const athleteInfo = currentPlayer ? athletes[currentPlayer.athleteId] : null
  const throwStyle = athleteInfo?.throwStyle ?? 'spin'

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

  // Convert inches to sector position percentage
  function inchesToSectorPercent(inches: number): number {
    const clamped = Math.max(SECTOR_MIN_INCHES, Math.min(SECTOR_MAX_INCHES, inches))
    return ((clamped - SECTOR_MIN_INCHES) / (SECTOR_MAX_INCHES - SECTOR_MIN_INCHES)) * 100
  }

  // Trigger throw animation when throwTrigger increments
  useEffect(() => {
    if (throwTrigger === prevTriggerRef.current) return
    prevTriggerRef.current = throwTrigger

    if (throwTrigger === 0 || (lastResult === null && !isSpecial)) return

    setPhase('winding')
    const t1 = setTimeout(() => setPhase('throwing'), 1500)
    const t2 = setTimeout(() => setPhase('landed'), 3200)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [throwTrigger, lastResult, isSpecial])

  // Reset to ready when player changes
  useEffect(() => {
    setPhase('ready')
  }, [currentPlayerIndex])

  const landingPct = lastResult !== null ? inchesToSectorPercent(lastResult) : 30
  // Angle within the sector (for variety), based on result
  const landingAngle = lastResult !== null ? 25 + (lastResult % 20) : 32

  return (
    <div className="shotput-ring-container">
      {/* Top-down view: ring on left, sector extending right */}
      <div className="sp-field">
        {/* Throwing sector (fan shape via clip-path) */}
        <div className="sp-sector">
          <div className="sp-sector-surface" />

          {/* Sector lines (edges of the fan) */}
          <div className="sp-sector-line sp-sector-line-top" />
          <div className="sp-sector-line sp-sector-line-bottom" />

          {/* Arc distance markers */}
          {SECTOR_MARKERS.map(ft => {
            const pct = inchesToSectorPercent(ft * 12)
            return (
              <div key={ft} className="sp-marker" style={{ '--marker-pct': `${pct}%` } as React.CSSProperties}>
                <div className="sp-marker-arc" />
                <span className="sp-marker-label">{ft}'</span>
              </div>
            )
          })}

          {/* Previous landing marks */}
          {landedMarks.map((mark, i) => {
            const pct = inchesToSectorPercent(mark.inches)
            const angle = 25 + (mark.inches % 20) + (mark.playerId * 5 % 15)
            return (
              <div
                key={i}
                className={`sp-landed-mark ${mark.isBest ? 'best' : ''}`}
                style={{
                  '--mark-dist': `${pct}%`,
                  '--mark-angle': `${angle}deg`,
                  '--mark-color': mark.color,
                } as React.CSSProperties}
              />
            )
          })}

          {/* Flying shot */}
          {phase === 'throwing' && lastResult !== null && (
            <div
              className="sp-shot-flying"
              style={{
                '--landing-dist': `${landingPct}%`,
                '--landing-angle': `${landingAngle}deg`,
              } as React.CSSProperties}
            />
          )}

          {/* Landing impact */}
          {phase === 'landed' && lastResult !== null && !isSpecial && (
            <div
              className="sp-landing"
              style={{
                '--landing-dist': `${landingPct}%`,
                '--landing-angle': `${landingAngle}deg`,
              } as React.CSSProperties}
            >
              <div className="sp-impact" />
              <div className="sp-distance-tag" style={{ background: graphic?.color }}>
                {lastResultDisplay || inchesToDisplay(lastResult)}
              </div>
            </div>
          )}

          {/* Foul: red flag after throw */}
          {phase === 'landed' && isSpecial && (
            <div className="sp-foul-flag">
              <div className="sp-flag-pole" />
              <div className="sp-flag-cloth">FOUL</div>
            </div>
          )}
        </div>

        {/* Throwing ring (circle) */}
        <div className="sp-ring">
          <div className="sp-ring-circle">
            {/* Toe board (flat edge on throwing side) */}
            <div className="sp-toe-board" />

            {/* Athlete in ring */}
            {graphic && (phase === 'ready' || phase === 'winding') && (
              <div className={`sp-athlete ${phase} ${throwStyle}`}>
                <span className="sp-athlete-figure">{graphic.runnerIcon}</span>
              </div>
            )}
          </div>
          {/* Player name below ring */}
          {currentPlayer && (
            <div className="sp-player-label" style={{ color: graphic?.color }}>
              {getAthleteGraphic(currentPlayer.athleteId).abbreviation}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
