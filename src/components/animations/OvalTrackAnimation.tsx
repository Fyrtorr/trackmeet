import { useEffect, useState, useRef } from 'react'
import type { PlayerState } from '../../types'
import { getAthleteGraphic } from '../../data/athleteGraphics'
import './OvalTrackAnimation.css'

interface OvalTrackAnimationProps {
  players: PlayerState[]
  eventId: string
  currentSegment: number
  totalSegments: number
  phase: string
  pendingTimes?: Record<number, number>  // playerIndex -> time from current round's rolls
  onAnimationComplete?: () => void
}

// ── Track geometry (based on real IAAF standard 400m track) ──
const TOTAL_LANES = 8
const LANE_WIDTH = 14
const INNER_R = 80              // inner curve radius (circular, like a real track)
const STRAIGHT_LEN = 200        // SVG units for each straight section

// Real track: straight = 84.39m, so our scale factor:
const METERS_PER_UNIT = 84.39 / STRAIGHT_LEN  // ~0.422 m per SVG unit
const UNITS_PER_METER = STRAIGHT_LEN / 84.39   // ~2.37 SVG units per m

// Sprint extension: extra straight at bottom-left for 100m/110mH starts
// 110mH needs ~25.6m past the curve = ~61 SVG units
const EXTENSION_LEN = 70

const TRACK_WIDTH = TOTAL_LANES * LANE_WIDTH
const OUTER_R = INNER_R + TRACK_WIDTH

const PADDING = 5
const VB_W = STRAIGHT_LEN + 2 * OUTER_R + 2 * PADDING
const VB_H = 2 * OUTER_R + 2 * PADDING

// Center of the oval
const CX = VB_W / 2
const CY = VB_H / 2
const HALF_S = STRAIGHT_LEN / 2

// Official IAAF cumulative stagger values per lane (meters ahead of lane 1)
// Lane 1 measured at 30cm from inner edge, lanes 2-8 at 20cm from inner lane line
const STAGGERS_400M = [0, 7.04, 14.68, 22.12, 29.56, 37.00, 44.44, 51.88]
const STAGGERS_200M = [0, 3.52, 7.34, 11.06, 14.78, 18.50, 22.22, 25.94]
const TRACK_LENGTH_M = 400

// ── Helpers ──

function laneR(lane: number): number { return INNER_R + (lane + 0.5) * LANE_WIDTH }

/**
 * Get a point on the oval track at a given fraction (0–1).
 * Fraction 0 = finish line (right end of home/bottom straight).
 * Direction: counterclockwise.
 *   → right curve (up) → back straight (R→L) → left curve (down) → home straight (L→R)
 */
function getOvalPoint(fraction: number, laneIndex: number): { x: number; y: number } {
  const r = laneR(laneIndex)
  const f = ((fraction % 1) + 1) % 1

  const curveLen = Math.PI * r
  const totalPerimeter = 2 * STRAIGHT_LEN + 2 * curveLen
  const curveFrac = curveLen / totalPerimeter
  const straightFrac = STRAIGHT_LEN / totalPerimeter

  // NOTE: SVG has y-axis pointing DOWN, so angles are flipped vs standard math.
  // To trace counterclockwise on screen: right curve goes bottom→top (π/2 → -π/2),
  // left curve goes top→bottom (-π/2 → -3π/2).

  if (f < curveFrac) {
    // Right curve: bottom-right (finish) → top-right
    const t = f / curveFrac
    const angle = Math.PI / 2 - t * Math.PI
    return {
      x: CX + HALF_S + r * Math.cos(angle),
      y: CY + r * Math.sin(angle),
    }
  } else if (f < curveFrac + straightFrac) {
    // Back/top straight: right to left
    const t = (f - curveFrac) / straightFrac
    return { x: CX + HALF_S - t * STRAIGHT_LEN, y: CY - r }
  } else if (f < 2 * curveFrac + straightFrac) {
    // Left curve: top-left → bottom-left
    const t = (f - curveFrac - straightFrac) / curveFrac
    const angle = -Math.PI / 2 - t * Math.PI
    return {
      x: CX - HALF_S + r * Math.cos(angle),
      y: CY + r * Math.sin(angle),
    }
  } else {
    // Home/bottom straight: left to right (back toward finish)
    const t = (f - 2 * curveFrac - straightFrac) / straightFrac
    return { x: CX - HALF_S + t * STRAIGHT_LEN, y: CY + r }
  }
}

/** SVG oval path for a given radius */
function ovalPath(r: number): string {
  return `
    M ${CX - HALF_S} ${CY + r}
    L ${CX + HALF_S} ${CY + r}
    A ${r} ${r} 0 0 0 ${CX + HALF_S} ${CY - r}
    L ${CX - HALF_S} ${CY - r}
    A ${r} ${r} 0 0 0 ${CX - HALF_S} ${CY + r}
    Z
  `
}

/** Ring path between two concentric ovals (for lane fill) */
function ringPath(outerRV: number, innerRV: number): string {
  const outer = `
    M ${CX - HALF_S} ${CY + outerRV}
    L ${CX + HALF_S} ${CY + outerRV}
    A ${outerRV} ${outerRV} 0 0 0 ${CX + HALF_S} ${CY - outerRV}
    L ${CX - HALF_S} ${CY - outerRV}
    A ${outerRV} ${outerRV} 0 0 0 ${CX - HALF_S} ${CY + outerRV}
  `
  const inner = `
    M ${CX - HALF_S} ${CY + innerRV}
    A ${innerRV} ${innerRV} 0 0 1 ${CX - HALF_S} ${CY - innerRV}
    L ${CX + HALF_S} ${CY - innerRV}
    A ${innerRV} ${innerRV} 0 0 1 ${CX + HALF_S} ${CY + innerRV}
    L ${CX - HALF_S} ${CY + innerRV}
  `
  return outer + inner
}

/** Perpendicular mark across a single lane at a fraction of the oval */
function laneMarkLine(frac: number, lane: number) {
  const pt = getOvalPoint(frac, lane)
  const pt1 = getOvalPoint(frac - 0.002, lane)
  const pt2 = getOvalPoint(frac + 0.002, lane)
  const dx = pt2.x - pt1.x
  const dy = pt2.y - pt1.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const nx = -dy / len * (LANE_WIDTH / 2 - 1)
  const ny = dx / len * (LANE_WIDTH / 2 - 1)
  return { x1: pt.x + nx, y1: pt.y + ny, x2: pt.x - nx, y2: pt.y - ny }
}


// ── Key marking positions ──
// Distances in meters from the finish, converted to fractions of 400m going counterclockwise.
// To go BACKWARDS from finish by D meters: fraction = 1 - D/400

// 100m start: 100m before finish → on the home straight near left end
// Home straight is 84.39m, so 100m extends ~15.6m past the curve onto the extension
const START_100M_FRAC = 1 - (100 / TRACK_LENGTH_M)

// 110m hurdles start: 110m before finish → ~25.6m onto the extension
const START_110MH_DIST_M = 110

// 200m start: 200m before finish → on the back curve / start of back straight
const START_200M_FRAC = 1 - (200 / TRACK_LENGTH_M)


// ── Extension geometry ──
const EXT_LEFT = CX - HALF_S - EXTENSION_LEN
const EXT_RIGHT = CX - HALF_S

// ─────────────────────────────────────────────────

export function OvalTrackAnimation({
  players, eventId, currentSegment, totalSegments, phase, pendingTimes, onAnimationComplete,
}: OvalTrackAnimationProps) {
  const [runnerPositions, setRunnerPositions] = useState<Record<number, number>>({})
  const animFrameRef = useRef<number | null>(null)
  const onCompleteRef = useRef(onAnimationComplete)
  onCompleteRef.current = onAnimationComplete

  const startLane = Math.floor((TOTAL_LANES - players.length) / 2)
  const is400 = eventId === '400m'

  // Stagger fractions (400m only — each lane starts further counterclockwise)
  const staggerFractions = players.map((_, i) => {
    if (!is400) return 0
    const lane = startLane + i
    return STAGGERS_400M[lane] / TRACK_LENGTH_M
  })

  // Expected total time for gap scaling
  const expectedTotal = eventId === '400m' ? 51 : 265  // seconds

  // Simple runner positioning:
  //  - Leader advances to segmentsDone/totalSegments of the track
  //  - Others fall behind by their time gap as a fraction of expected total
  //  - pendingTimes includes the CURRENT round's roll times (not yet in eventResults)
  function getTargetFraction(playerIndex: number): number {
    const result = players[playerIndex].eventResults.find(r => r.eventId === eventId)
    const committedSegs = result?.segments ?? []
    const committedTime = committedSegs.reduce((sum, seg) => sum + seg.time, 0)

    // Add pending time from current round (stored in msSegmentRolls, not yet committed)
    const pendingTime = pendingTimes?.[playerIndex] ?? 0
    const myTime = committedTime + pendingTime
    const segsDone = committedSegs.length + (pendingTime > 0 ? 1 : 0)

    if (segsDone === 0) return staggerFractions[playerIndex]

    // Find the best (lowest) cumulative time across all players
    const allTimes = players.map((p, i) => {
      const r = p.eventResults.find(er => er.eventId === eventId)
      const ct = (r?.segments ?? []).reduce((sum, seg) => sum + seg.time, 0)
      const pt = pendingTimes?.[i] ?? 0
      return ct + pt
    }).filter(t => t > 0)
    const bestTime = Math.min(...allTimes)

    // Leader at segmentsDone/totalSegments, others behind by gap
    const leaderProgress = segsDone / totalSegments
    const gapFrac = (myTime - bestTime) / expectedTotal

    // For the final segment, push the leader slightly past 1.0 so they cross the finish
    const baseFrac = staggerFractions[playerIndex] + leaderProgress - gapFrac
    if (segsDone >= totalSegments) {
      // Ensure all runners end past the finish line (fraction > 1.0)
      return Math.max(baseFrac, 1.0 + staggerFractions[playerIndex] + 0.02)
    }
    return baseFrac
  }

  // Animate runners when entering msAnimating phase
  useEffect(() => {
    if (phase !== 'msAnimating') return

    const startPositions = { ...runnerPositions }
    const targetPositions: Record<number, number> = {}
    players.forEach((_, i) => {
      targetPositions[i] = getTargetFraction(i)
    })

    const duration = 2500
    const startTime = performance.now()

    function animate(now: number) {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)
      const ease = 1 - Math.pow(1 - t, 3)
      const pos: Record<number, number> = {}
      players.forEach((_, i) => {
        const start = startPositions[i] ?? staggerFractions[i]
        pos[i] = start + (targetPositions[i] - start) * ease
      })
      setRunnerPositions(pos)
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate)
      } else {
        onCompleteRef.current?.()
      }
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [phase, currentSegment]) // eslint-disable-line react-hooks/exhaustive-deps

  // Init positions at stagger marks
  useEffect(() => {
    const init: Record<number, number> = {}
    players.forEach((_, i) => { init[i] = staggerFractions[i] })
    setRunnerPositions(init)
  }, [eventId, players.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Finish line coordinates (right end of home straight)
  const finishX = CX + HALF_S
  const finishInnerY = CY + INNER_R
  const finishOuterY = CY + OUTER_R

  // 400m stagger fractions for all 8 lanes (IAAF cumulative values)
  const allStagger400Fracs = STAGGERS_400M.map(s => s / TRACK_LENGTH_M)

  return (
    <div className="oval-track">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="oval-track-svg" preserveAspectRatio="xMidYMid meet">

        {/* ══════════════════════════════════════════ */}
        {/* ══ TRACK SURFACES                      ══ */}
        {/* ══════════════════════════════════════════ */}

        {/* Green infield */}
        <path d={ovalPath(INNER_R)} fill="#2d5a27" />

        {/* Oval lane surfaces */}
        {Array.from({ length: TOTAL_LANES }, (_, i) => {
          const oR = INNER_R + (i + 1) * LANE_WIDTH
          const iR = INNER_R + i * LANE_WIDTH
          return (
            <path
              key={i}
              d={ringPath(oR, iR)}
              fill={i % 2 === 0 ? '#c4523c' : '#b8442f'}
              fillRule="evenodd"
            />
          )
        })}

        {/* Sprint extension lanes (bottom-left, for 100m/110mH) */}
        {Array.from({ length: TOTAL_LANES }, (_, i) => {
          const yTop = CY + INNER_R + i * LANE_WIDTH
          return (
            <rect
              key={`ext-${i}`}
              x={EXT_LEFT} y={yTop}
              width={EXTENSION_LEN} height={LANE_WIDTH}
              fill={i % 2 === 0 ? '#c4523c' : '#b8442f'}
            />
          )
        })}

        {/* ══════════════════════════════════════════ */}
        {/* ══ LANE LINES                          ══ */}
        {/* ══════════════════════════════════════════ */}

        {/* Oval lane lines */}
        {Array.from({ length: TOTAL_LANES + 1 }, (_, i) => {
          const r = INNER_R + i * LANE_WIDTH
          return (
            <path
              key={`ll-${i}`}
              d={ovalPath(r)}
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={i === 0 || i === TOTAL_LANES ? 2 : 0.7}
            />
          )
        })}

        {/* Extension lane lines (horizontal) */}
        {Array.from({ length: TOTAL_LANES + 1 }, (_, i) => {
          const y = CY + INNER_R + i * LANE_WIDTH
          return (
            <line
              key={`ell-${i}`}
              x1={EXT_LEFT} y1={y} x2={EXT_RIGHT} y2={y}
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={i === 0 || i === TOTAL_LANES ? 2 : 0.7}
            />
          )
        })}

        {/* Extension left cap */}
        <line
          x1={EXT_LEFT} y1={CY + INNER_R}
          x2={EXT_LEFT} y2={CY + OUTER_R}
          stroke="rgba(255,255,255,0.6)" strokeWidth={2}
        />

        {/* ══════════════════════════════════════════ */}
        {/* ══ TRACK MARKINGS                      ══ */}
        {/* ══════════════════════════════════════════ */}

        {/* ── FINISH LINE (right end of home straight) ── */}
        {/* Glow zone */}
        <line
          x1={finishX} y1={finishInnerY - 1}
          x2={finishX} y2={finishOuterY + 1}
          stroke="rgba(255,255,255,0.12)" strokeWidth={10}
        />
        {/* Main line */}
        <line
          x1={finishX} y1={finishInnerY}
          x2={finishX} y2={finishOuterY}
          stroke="white" strokeWidth={2.5}
        />
        {/* ── 100m START LINES (staggered, on extension + home straight) ── */}
        {/* The home straight is 84.39m; 100m race needs ~15.6m of extension.       */}
        {/* Inner lanes start near the oval edge, outer lanes extend onto extension. */}
        {Array.from({ length: TOTAL_LANES }, (_, lane) => {
          // Each lane's 100m start is offset by its stagger (tiny for 100m, ~0 for lane 0)
          // The base 100m start (lane 0) is at the left end of the home straight,
          // slightly into the extension (~15.6m past the curve start)
          const distFromFinishM = 100 + lane * 0.1  // slight stagger for outer lanes
          const xPos = finishX - distFromFinishM * UNITS_PER_METER
          const r = laneR(lane)
          const halfLW = LANE_WIDTH / 2 - 1
          return (
            <line
              key={`100s-${lane}`}
              x1={xPos} y1={CY + r - halfLW}
              x2={xPos} y2={CY + r + halfLW}
              stroke="white" strokeWidth={1.5} opacity={0.7}
            />
          )
        })}
        {/* ── 110m HURDLES START LINES (further on extension) ── */}
        {Array.from({ length: TOTAL_LANES }, (_, lane) => {
          const distM = START_110MH_DIST_M + lane * 0.1
          const xPos = finishX - distM * UNITS_PER_METER
          const r = laneR(lane)
          const halfLW = LANE_WIDTH / 2 - 1
          return (
            <line
              key={`110h-${lane}`}
              x1={xPos} y1={CY + r - halfLW}
              x2={xPos} y2={CY + r + halfLW}
              stroke="white" strokeWidth={1.5} opacity={0.45}
            />
          )
        })}
        {/* ── 200m STAGGER START LINES (on the back straight / left curve) ── */}
        {/* Per the reference diagram: red lines on the upper-left of the track */}
        {Array.from({ length: TOTAL_LANES }, (_, lane) => {
          const stag200 = START_200M_FRAC + STAGGERS_200M[lane] / TRACK_LENGTH_M
          const mark = laneMarkLine(stag200, lane)
          return (
            <line
              key={`200s-${lane}`}
              x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2}
              stroke="white" strokeWidth={1.5} opacity={0.5}
            />
          )
        })}

        {/* ── 400m STAGGER START LINES (on the right curve) ── */}
        {/* Per the reference diagram: red lines on the right side of the track */}
        {/* Lane 1 starts at finish, outer lanes stagger up the right curve */}
        {Array.from({ length: TOTAL_LANES }, (_, lane) => {
          if (lane === 0) return null  // lane 1 starts at finish line
          const mark = laneMarkLine(allStagger400Fracs[lane], lane)
          return (
            <line
              key={`stag400-${lane}`}
              x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2}
              stroke="white" strokeWidth={1.5} opacity={is400 ? 0.85 : 0.25}
            />
          )
        })}

        {/* ── LANE NUMBERS (on home straight, centered) ── */}
        {Array.from({ length: TOTAL_LANES }, (_, i) => {
          const r = laneR(i)
          return (
            <text
              key={`ln-${i}`}
              x={CX + HALF_S - 10}
              y={CY + r + 3.5}
              textAnchor="middle"
              fill="rgba(255,255,255,0.35)"
              fontSize={8}
              fontWeight={700}
              fontFamily="'Consolas', monospace"
            >
              {i + 1}
            </text>
          )
        })}

        {/* ══════════════════════════════════════════ */}
        {/* ══ RUNNERS                             ══ */}
        {/* ══════════════════════════════════════════ */}
        {players.map((p, i) => {
          const lane = startLane + i
          const fraction = runnerPositions[i] ?? staggerFractions[i]
          const pt = getOvalPoint(fraction, lane)
          const g = getAthleteGraphic(p.athleteId)
          return (
            <g key={p.id}>
              <circle cx={pt.x} cy={pt.y} r={5} fill={g.color} stroke="white" strokeWidth={1.5} />
              <text
                x={pt.x} y={pt.y - 9}
                textAnchor="middle" fill={g.color}
                fontSize={8} fontWeight={700} fontFamily="'Consolas', monospace"
              >
                {g.abbreviation}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
