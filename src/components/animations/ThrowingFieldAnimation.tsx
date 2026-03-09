import { useEffect, useState, useRef, useCallback } from 'react'
import type { PlayerState } from '../../types'
import { getAthleteGraphic } from '../../data/athleteGraphics'
import './ThrowingFieldAnimation.css'

interface ThrowingFieldAnimationProps {
  players: PlayerState[]
  currentPlayerIndex: number
  eventId: string               // 'shot_put' | 'discus' | 'javelin'
  isSpecial: boolean
  showLanding: boolean          // delay showing landing until bottom animation completes
  throwTrigger: number          // increments on each throw
  onRunwayComplete?: () => void // fires after javelin runway animation
}

// ── Match oval track viewBox for consistent sizing ──
const VB_W = 594
const VB_H = 394
const PADDING = 10

// ── Event-specific geometry ──
interface EventConfig {
  sectorAngle: number     // total sector opening angle in degrees
  circleRadius: number    // SVG units for throwing circle/arc
  maxFeet: number         // max display range in feet (scale goes from 0 to this)
  markers: number[]       // distance marker values in feet
  hasRunway: boolean      // javelin has a runway
  runwayWidth: number     // SVG units
  runwayLen: number       // SVG units
}

const EVENT_CONFIGS: Record<string, EventConfig> = {
  shot_put: {
    sectorAngle: 34.92,
    circleRadius: 8,
    maxFeet: 65,
    markers: [10, 20, 30, 40, 50, 60],
    hasRunway: false,
    runwayWidth: 0,
    runwayLen: 0,
  },
  discus: {
    sectorAngle: 34.92,
    circleRadius: 10,
    maxFeet: 210,
    markers: [50, 100, 150, 200],
    hasRunway: false,
    runwayWidth: 0,
    runwayLen: 0,
  },
  javelin: {
    sectorAngle: 29,
    circleRadius: 8,
    maxFeet: 280,
    markers: [50, 100, 150, 200, 250],
    hasRunway: true,
    runwayWidth: 10,
    runwayLen: 50,
  },
}

// ── Layout: circle at bottom center, sector fans upward ──
const THROW_CX = VB_W / 2
const THROW_CY = VB_H - PADDING - 20  // near bottom

// Max radius from circle to top of SVG
const SECTOR_MAX_R = THROW_CY - PADDING

// True-to-scale: 0 feet = circle edge, maxFeet = sector outer edge
function feetToRadius(feet: number, config: EventConfig): number {
  const scale = (SECTOR_MAX_R - config.circleRadius) / config.maxFeet
  return config.circleRadius + feet * scale
}

// Get x,y for a point in the sector at a given radius and angle offset
// angle=0 is straight up, negative=left, positive=right
function sectorPoint(radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg - 90) * Math.PI / 180
  return {
    x: THROW_CX + radius * Math.cos(rad),
    y: THROW_CY + radius * Math.sin(rad),
  }
}

// Deterministic angle within the sector based on result
function landingAngle(result: number, config: EventConfig): number {
  const halfAngle = config.sectorAngle / 2
  const offset = ((result * 7 + 13) % 100) / 100
  return -halfAngle + offset * config.sectorAngle
}

export function ThrowingFieldAnimation({
  players, currentPlayerIndex, eventId, isSpecial, showLanding, throwTrigger, onRunwayComplete,
}: ThrowingFieldAnimationProps) {
  const config = EVENT_CONFIGS[eventId] ?? EVENT_CONFIGS.discus
  const currentPlayer = players[currentPlayerIndex]
  const graphic = currentPlayer ? getAthleteGraphic(currentPlayer.athleteId) : null

  // Javelin runway animation state
  const [runnerY, setRunnerY] = useState<number | null>(null) // null = at rest position
  const prevTriggerRef = useRef(throwTrigger)
  const onRunwayCompleteRef = useRef(onRunwayComplete)
  onRunwayCompleteRef.current = onRunwayComplete
  const animRef = useRef<number | null>(null)

  // Trigger runway run-up on throwTrigger change (javelin only)
  useEffect(() => {
    if (throwTrigger === prevTriggerRef.current) return
    prevTriggerRef.current = throwTrigger
    if (throwTrigger === 0) return

    if (!config.hasRunway) {
      // Non-javelin: no runway, fire immediately
      onRunwayCompleteRef.current?.()
      return
    }

    // Animate from bottom of runway to throw line
    const startY = THROW_CY + config.runwayLen
    const endY = THROW_CY
    const duration = 800

    const startTime = performance.now()
    function animate(now: number) {
      const t = Math.min(1, (now - startTime) / duration)
      const ease = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t) // ease-in-out
      setRunnerY(startY + (endY - startY) * ease)
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate)
      } else {
        setRunnerY(null) // back to default position at throw line
        onRunwayCompleteRef.current?.()
      }
    }
    setRunnerY(startY)
    animRef.current = requestAnimationFrame(animate)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [throwTrigger, config.hasRunway, config.runwayLen])

  // Reset on player change
  useEffect(() => { setRunnerY(null) }, [currentPlayerIndex])

  // Collect all landed marks
  // Hide the current player's latest attempt until the throw animation completes
  const landedMarks = players.flatMap(p => {
    const result = p.eventResults.find(r => r.eventId === eventId)
    if (!result) return []
    const isCurrentPlayer = p.id === currentPlayer?.id
    let attempts = result.attempts.filter(a => !a.isSpecial && a.resolvedResult !== null)
    // Only hide the latest valid attempt if the newest raw attempt is a valid throw
    // (not a foul) — fouls don't produce a dot so there's nothing to hide
    if (isCurrentPlayer && !showLanding && attempts.length > 0) {
      const lastRawAttempt = result.attempts[result.attempts.length - 1]
      if (lastRawAttempt && !lastRawAttempt.isSpecial && lastRawAttempt.resolvedResult !== null) {
        attempts = attempts.slice(0, -1)
      }
    }
    return attempts.map(a => {
      const feet = eventId === 'shot_put' ? a.resolvedResult! / 12 : a.resolvedResult!
      return {
        playerId: p.id,
        feet,
        color: getAthleteGraphic(p.athleteId).color,
        isBest: a.resolvedResult === result.bestResult,
      }
    })
  })

  const halfAngle = config.sectorAngle / 2

  // Sector edge lines
  const sectorLeftOuter = sectorPoint(SECTOR_MAX_R, -halfAngle)
  const sectorRightOuter = sectorPoint(SECTOR_MAX_R, halfAngle)
  const sectorLeftInner = sectorPoint(config.circleRadius, -halfAngle)
  const sectorRightInner = sectorPoint(config.circleRadius, halfAngle)

  // Sector fill path (pie wedge from circle to max radius)
  const sectorPath = (() => {
    const innerR = config.circleRadius
    const outerR = SECTOR_MAX_R
    const startAngle = (-halfAngle - 90) * Math.PI / 180
    const endAngle = (halfAngle - 90) * Math.PI / 180

    const outerStart = { x: THROW_CX + outerR * Math.cos(startAngle), y: THROW_CY + outerR * Math.sin(startAngle) }
    const outerEnd = { x: THROW_CX + outerR * Math.cos(endAngle), y: THROW_CY + outerR * Math.sin(endAngle) }
    const innerStart = { x: THROW_CX + innerR * Math.cos(endAngle), y: THROW_CY + innerR * Math.sin(endAngle) }
    const innerEnd = { x: THROW_CX + innerR * Math.cos(startAngle), y: THROW_CY + innerR * Math.sin(startAngle) }

    return `
      M ${outerStart.x} ${outerStart.y}
      A ${outerR} ${outerR} 0 0 1 ${outerEnd.x} ${outerEnd.y}
      L ${innerStart.x} ${innerStart.y}
      A ${innerR} ${innerR} 0 0 0 ${innerEnd.x} ${innerEnd.y}
      Z
    `
  })()

  return (
    <div className="throwing-field">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="throwing-field-svg" preserveAspectRatio="xMidYMid meet">

        {/* ══ GREEN FIELD SURFACE ══ */}
        <rect x={0} y={0} width={VB_W} height={VB_H} fill="#2d5a27" rx={6} />

        {/* ══ SECTOR (landing area) ══ */}
        <path d={sectorPath} fill="rgba(255,255,255,0.04)" />

        {/* ══ SHOT PUT DIRT AREA (0–60') ══ */}
        {eventId === 'shot_put' && (() => {
          const dirtR = feetToRadius(60, config)
          const innerR = config.circleRadius
          const startAng = (-halfAngle - 90) * Math.PI / 180
          const endAng = (halfAngle - 90) * Math.PI / 180
          const oS = { x: THROW_CX + dirtR * Math.cos(startAng), y: THROW_CY + dirtR * Math.sin(startAng) }
          const oE = { x: THROW_CX + dirtR * Math.cos(endAng), y: THROW_CY + dirtR * Math.sin(endAng) }
          const iS = { x: THROW_CX + innerR * Math.cos(endAng), y: THROW_CY + innerR * Math.sin(endAng) }
          const iE = { x: THROW_CX + innerR * Math.cos(startAng), y: THROW_CY + innerR * Math.sin(startAng) }
          return (
            <path
              d={`M ${oS.x} ${oS.y} A ${dirtR} ${dirtR} 0 0 1 ${oE.x} ${oE.y}
                  L ${iS.x} ${iS.y} A ${innerR} ${innerR} 0 0 0 ${iE.x} ${iE.y} Z`}
              fill="#8B6914" opacity={0.45}
            />
          )
        })()}

        {/* Sector edge lines */}
        <line
          x1={sectorLeftInner.x} y1={sectorLeftInner.y}
          x2={sectorLeftOuter.x} y2={sectorLeftOuter.y}
          stroke="rgba(255,255,255,0.5)" strokeWidth={1}
        />
        <line
          x1={sectorRightInner.x} y1={sectorRightInner.y}
          x2={sectorRightOuter.x} y2={sectorRightOuter.y}
          stroke="rgba(255,255,255,0.5)" strokeWidth={1}
        />

        {/* Distance arc markers — true to scale from 0 */}
        {config.markers.map(ft => {
          const r = feetToRadius(ft, config)
          const startAngle = (-halfAngle - 90) * Math.PI / 180
          const endAngle = (halfAngle - 90) * Math.PI / 180
          const p1 = { x: THROW_CX + r * Math.cos(startAngle), y: THROW_CY + r * Math.sin(startAngle) }
          const p2 = { x: THROW_CX + r * Math.cos(endAngle), y: THROW_CY + r * Math.sin(endAngle) }
          const labelAngle = (halfAngle + 3 - 90) * Math.PI / 180
          const labelPt = { x: THROW_CX + r * Math.cos(labelAngle), y: THROW_CY + r * Math.sin(labelAngle) }
          return (
            <g key={ft}>
              <path
                d={`M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`}
                fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={0.5}
              />
              <text
                x={labelPt.x} y={labelPt.y}
                fill="rgba(255,255,255,0.35)" fontSize={6} fontWeight={600}
                fontFamily="'Consolas', monospace" textAnchor="start"
              >
                {ft}'
              </text>
            </g>
          )
        })}

        {/* ══ JAVELIN RUNWAY ══ */}
        {config.hasRunway && (
          <g>
            <rect
              x={THROW_CX - config.runwayWidth / 2}
              y={THROW_CY}
              width={config.runwayWidth}
              height={config.runwayLen}
              fill="#c4523c" rx={1}
            />
            <line
              x1={THROW_CX - config.runwayWidth / 2} y1={THROW_CY}
              x2={THROW_CX - config.runwayWidth / 2} y2={THROW_CY + config.runwayLen}
              stroke="rgba(255,255,255,0.5)" strokeWidth={0.7}
            />
            <line
              x1={THROW_CX + config.runwayWidth / 2} y1={THROW_CY}
              x2={THROW_CX + config.runwayWidth / 2} y2={THROW_CY + config.runwayLen}
              stroke="rgba(255,255,255,0.5)" strokeWidth={0.7}
            />
            {/* Throwing arc (foul line) */}
            <path
              d={`M ${THROW_CX - config.runwayWidth / 2} ${THROW_CY}
                  A ${config.circleRadius} ${config.circleRadius} 0 0 1 ${THROW_CX + config.runwayWidth / 2} ${THROW_CY}`}
              fill="none" stroke="white" strokeWidth={1.5}
            />
          </g>
        )}

        {/* ══ THROWING CIRCLE (shot put / discus) ══ */}
        {!config.hasRunway && (
          <g>
            <circle
              cx={THROW_CX} cy={THROW_CY} r={config.circleRadius}
              fill="#c4523c"
            />
            <circle
              cx={THROW_CX} cy={THROW_CY} r={config.circleRadius}
              fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5}
            />
            {/* Toe board */}
            <line
              x1={THROW_CX - config.circleRadius} y1={THROW_CY - config.circleRadius + 1}
              x2={THROW_CX + config.circleRadius} y2={THROW_CY - config.circleRadius + 1}
              stroke="white" strokeWidth={2}
            />
          </g>
        )}

        {/* ══ LANDING MARKS ══ */}
        {landedMarks.map((mark, i) => {
          const r = feetToRadius(mark.feet, config)
          const angle = landingAngle(mark.feet * 12 + mark.playerId, config)
          const pt = sectorPoint(r, angle)
          return (
            <circle
              key={`mark-${i}`}
              cx={pt.x} cy={pt.y} r={mark.isBest ? 2.5 : 2}
              fill={mark.color}
              stroke={mark.isBest ? 'white' : 'none'}
              strokeWidth={mark.isBest ? 1 : 0}
              opacity={mark.isBest ? 1 : 0.6}
            />
          )
        })}

        {/* ══ FOUL INDICATOR ══ */}
        {showLanding && isSpecial && (
          <g>
            <text
              x={THROW_CX} y={THROW_CY - config.circleRadius - 12}
              textAnchor="middle" fill="#ef4444"
              fontSize={12} fontWeight={800} fontFamily="'Consolas', monospace"
            >
              FOUL
            </text>
            <line
              x1={THROW_CX - 8} y1={THROW_CY - 8}
              x2={THROW_CX + 8} y2={THROW_CY + 8}
              stroke="#ef4444" strokeWidth={2} opacity={0.7}
            />
            <line
              x1={THROW_CX + 8} y1={THROW_CY - 8}
              x2={THROW_CX - 8} y2={THROW_CY + 8}
              stroke="#ef4444" strokeWidth={2} opacity={0.7}
            />
          </g>
        )}

        {/* ══ CURRENT ATHLETE ══ */}
        {graphic && (
          <g>
            <circle
              cx={THROW_CX} cy={runnerY ?? THROW_CY} r={3.5}
              fill={graphic.color} stroke="white" strokeWidth={1}
            />
            {runnerY === null && (
              <text
                x={THROW_CX} y={THROW_CY + config.circleRadius + 10}
                textAnchor="middle" fill={graphic.color}
                fontSize={6} fontWeight={700} fontFamily="'Consolas', monospace"
              >
                {graphic.abbreviation}
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  )
}
