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

/**
 * Convert a lane-0-based fraction to the equivalent fraction for another lane,
 * so that both positions fall on the same perpendicular cross-section of the track.
 * On straights, all lanes cover the same distance; on curves, outer lanes cover more.
 */
function alignedFraction(lane0Frac: number, targetLane: number): number {
  if (targetLane === 0) return lane0Frac

  const r0 = laneR(0)
  const rT = laneR(targetLane)

  // Lane 0 segment boundaries
  const curve0 = Math.PI * r0
  const perim0 = 2 * STRAIGHT_LEN + 2 * curve0
  const curveFrac0 = curve0 / perim0
  const straightFrac0 = STRAIGHT_LEN / perim0

  // Target lane segment boundaries
  const curveT = Math.PI * rT
  const perimT = 2 * STRAIGHT_LEN + 2 * curveT
  const curveFracT = curveT / perimT
  const straightFracT = STRAIGHT_LEN / perimT

  const f = ((lane0Frac % 1) + 1) % 1
  const laps = Math.floor(lane0Frac)

  let result: number
  if (f < curveFrac0) {
    // Right curve: same angular proportion
    const t = f / curveFrac0
    result = t * curveFracT
  } else if (f < curveFrac0 + straightFrac0) {
    // Back straight: same linear proportion
    const t = (f - curveFrac0) / straightFrac0
    result = curveFracT + t * straightFracT
  } else if (f < 2 * curveFrac0 + straightFrac0) {
    // Left curve: same angular proportion
    const t = (f - curveFrac0 - straightFrac0) / curveFrac0
    result = curveFracT + straightFracT + t * curveFracT
  } else {
    // Home straight: same linear proportion
    const t = (f - 2 * curveFrac0 - straightFrac0) / straightFrac0
    result = 2 * curveFracT + straightFracT + t * straightFracT
  }

  return laps + result
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

// 1500m start: 300m before finish (1500 mod 400 = 300) → on the back straight near right curve
const START_1500M_FRAC = 1 - (300 / TRACK_LENGTH_M)

// 1500m = 3.75 laps; 5 segments → each segment = 0.75 laps
const LAPS_PER_SEGMENT_1500 = 0.75
const TOTAL_LAPS_1500 = 3.75

// ── Extension geometry ──
const EXT_LEFT = CX - HALF_S - EXTENSION_LEN
const EXT_RIGHT = CX - HALF_S

// ─────────────────────────────────────────────────

export function OvalTrackAnimation({
  players, eventId, currentSegment, totalSegments, phase, pendingTimes, onAnimationComplete,
}: OvalTrackAnimationProps) {
  const [runnerPositions, setRunnerPositions] = useState<Record<number, number>>({})
  // Track per-runner display lane (for smooth lane merging in 1500m)
  const [runnerLanes, setRunnerLanes] = useState<Record<number, number>>({})
  const animFrameRef = useRef<number | null>(null)
  const onCompleteRef = useRef(onAnimationComplete)
  onCompleteRef.current = onAnimationComplete

  const is400 = eventId === '400m'
  const is1500 = eventId === '1500m'

  // For both events: spread players across center lanes at start
  const startLane = Math.floor((TOTAL_LANES - players.length) / 2)

  // Stagger fractions (400m only — each lane starts further counterclockwise)
  const staggerFractions = players.map((_, i) => {
    if (!is400) return 0
    const lane = startLane + i
    return STAGGERS_400M[lane] / TRACK_LENGTH_M
  })

  // 1500m start offset: runners begin at 300m before finish (fraction 0.75 of one lap)
  const startOffset = is1500 ? START_1500M_FRAC : 0

  // Offset to place runner circles tangent behind the start line (circle r=5)
  const RUNNER_RADIUS = 5
  const lane0Perim = 2 * STRAIGHT_LEN + 2 * Math.PI * laneR(0)
  const runnerOffset = is1500 ? -(RUNNER_RADIUS + 1) / lane0Perim : 0

  // Gap scaling: ~5 meters behind per second of time gap
  // Convert to fraction of one lap: 5m / 400m = 0.0125 per second
  const GAP_METERS_PER_SEC = 5
  const gapFracPerSec = GAP_METERS_PER_SEC / TRACK_LENGTH_M

  // Total laps for the event
  const totalLaps = is1500 ? TOTAL_LAPS_1500 : 1.0
  // Finish line fraction (from origin)
  const finishFrac = startOffset + totalLaps

  // Collect all players' cumulative times (committed + pending)
  function getPlayerTime(pi: number): { time: number; segsDone: number } {
    const result = players[pi].eventResults.find(r => r.eventId === eventId)
    const committedSegs = result?.segments ?? []
    const committedTime = committedSegs.reduce((sum, seg) => sum + seg.time, 0)
    const pendingTime = pendingTimes?.[pi] ?? 0
    return {
      time: committedTime + pendingTime,
      segsDone: committedSegs.length + (pendingTime > 0 ? 1 : 0),
    }
  }

  // Runner positioning:
  //  - Leader advances proportionally through the race each segment
  //  - Others trail behind by ~5m per second of time gap
  //  - On final segment: leader crosses finish and keeps going, others finish
  //    at natural spacing — no clamping so gaps are preserved visually
  function getTargetFraction(playerIndex: number): number {
    const { time: myTime, segsDone } = getPlayerTime(playerIndex)

    if (segsDone === 0) return staggerFractions[playerIndex] + startOffset

    // Find the best (lowest) cumulative time across all players
    const allTimes = players.map((_, i) => getPlayerTime(i).time).filter(t => t > 0)
    const bestTime = Math.min(...allTimes)

    // Leader progress: proportional to segments completed
    const leaderProgress = is1500
      ? segsDone * LAPS_PER_SEGMENT_1500   // each segment = 0.75 laps
      : segsDone / totalSegments           // each segment = 0.25 laps (400m)

    // Gap: ~5 meters behind per second slower than leader
    const timeBehind = myTime - bestTime
    const gapFrac = timeBehind * gapFracPerSec

    if (segsDone >= totalSegments) {
      // Final segment: leader stops ~50 yards (45.7m) past the finish
      // Ensure even the slowest runner ends up past the finish line
      const maxTimeBehind = Math.max(...allTimes) - bestTime
      const maxGapM = maxTimeBehind * GAP_METERS_PER_SEC
      const minOvershoot = maxGapM + 10 // +10m buffer so last runner clears the line
      const leaderOvershoot = Math.max(45.7, minOvershoot) / TRACK_LENGTH_M
      const leaderFrac = finishFrac + leaderOvershoot
      return leaderFrac - gapFrac
    }

    return staggerFractions[playerIndex] + startOffset + leaderProgress - gapFrac
  }

  // Animate runners when entering msAnimating phase
  useEffect(() => {
    if (phase !== 'msAnimating') return

    // Detect first segment: no committed results yet
    const isFirstSegment = !players.some(p => {
      const r = p.eventResults.find(er => er.eventId === eventId)
      return (r?.segments ?? []).length > 0
    })

    // Detect final segment
    const isFinalSegment = players.every(p => {
      const r = p.eventResults.find(er => er.eventId === eventId)
      const committed = (r?.segments ?? []).length
      const pending = pendingTimes?.[players.indexOf(p)] ?? 0
      return committed + (pending > 0 ? 1 : 0) >= totalSegments
    })

    // Use current rendered positions as animation start
    const startPositions: Record<number, number> = {}
    const startLanes: Record<number, number> = {}
    players.forEach((_, i) => {
      startPositions[i] = runnerPositions[i] ?? (staggerFractions[i] + startOffset)
      startLanes[i] = runnerLanes[i] ?? (is1500 ? startLane + i : startLane + i)
    })

    const targetPositions: Record<number, number> = {}
    players.forEach((_, i) => {
      targetPositions[i] = getTargetFraction(i)
    })

    // For first segment: stagger the lane merge — inner runners merge first
    // Each runner merges to lane 0 over the first 30-60% of the animation
    const mergeTimes: Record<number, number> = {}
    if (isFirstSegment && is1500) {
      players.forEach((_, i) => {
        const lane = startLane + i
        // Inner lanes merge by 30%, outer lanes by 60%
        mergeTimes[i] = 0.3 + (lane / TOTAL_LANES) * 0.3
      })
    }

    // For the final segment, compute per-runner animation speeds so the leader
    // arrives first and others cross the finish at their natural gap timing
    const runnerSpeeds: Record<number, number> = {}
    if (isFinalSegment) {
      // All runners should move at roughly the same visual speed
      // The leader covers the most distance (to 50yd past), others cover less
      // Scale each runner's duration so they all move at the leader's speed
      const leaderDist = Math.max(...players.map((_, i) =>
        Math.abs(targetPositions[i] - startPositions[i])
      ))
      players.forEach((_, i) => {
        const dist = Math.abs(targetPositions[i] - startPositions[i])
        // Speed = fraction of leader's animation time proportional to distance
        runnerSpeeds[i] = leaderDist > 0 ? dist / leaderDist : 1
      })
    }

    const duration = 5000
    const startTime = performance.now()

    function animate(now: number) {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / duration)
      // First segment: ease-in (accelerate from standstill)
      // Subsequent segments: linear (constant running speed)
      const baseProgress = isFirstSegment ? t * t : t
      const pos: Record<number, number> = {}
      const lanes: Record<number, number> = {}
      players.forEach((_, i) => {
        const start = startPositions[i]
        let progress: number
        if (isFinalSegment) {
          // Each runner moves at the same visual speed — leader arrives first,
          // others keep running until they reach their target
          const runnerT = Math.min(1, t / runnerSpeeds[i])
          progress = runnerT
        } else {
          progress = baseProgress
        }
        pos[i] = start + (targetPositions[i] - start) * progress

        // Lane interpolation for first segment merge
        if (isFirstSegment && is1500 && mergeTimes[i] !== undefined) {
          const mergeProgress = Math.min(1, t / mergeTimes[i])
          const smoothMerge = mergeProgress * mergeProgress * (3 - 2 * mergeProgress) // smoothstep
          lanes[i] = startLanes[i] * (1 - smoothMerge) // lerp from start lane to 0
        } else {
          lanes[i] = 0
        }
      })
      setRunnerPositions(pos)
      setRunnerLanes(lanes)
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(animate)
      } else {
        onCompleteRef.current?.()
      }
    }
    animFrameRef.current = requestAnimationFrame(animate)
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current) }
  }, [phase, currentSegment]) // eslint-disable-line react-hooks/exhaustive-deps

  // Init positions at start marks
  useEffect(() => {
    const init: Record<number, number> = {}
    const initLanes: Record<number, number> = {}
    players.forEach((_, i) => {
      if (is1500) {
        init[i] = alignedFraction(startOffset + runnerOffset, startLane + i)
        initLanes[i] = startLane + i
      } else {
        init[i] = staggerFractions[i] + startOffset
        initLanes[i] = startLane + i
      }
    })
    setRunnerPositions(init)
    setRunnerLanes(initLanes)
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

        {/* ── 1500m START LINE (from inner border to outer border) ── */}
        {(() => {
          // Get the track direction at the start to compute the perpendicular
          const refPt1 = getOvalPoint(START_1500M_FRAC - 0.002, 0)
          const refPt2 = getOvalPoint(START_1500M_FRAC + 0.002, 0)
          const tx = refPt2.x - refPt1.x
          const ty = refPt2.y - refPt1.y
          const tLen = Math.sqrt(tx * tx + ty * ty)
          // Normal (perpendicular), pointing outward
          const nx = -ty / tLen
          const ny = tx / tLen
          // Anchor at inner lane center, then extend to inner/outer borders
          const anchorPt = getOvalPoint(START_1500M_FRAC, 0)
          const halfLane = LANE_WIDTH / 2
          const innerX = anchorPt.x - nx * halfLane
          const innerY = anchorPt.y - ny * halfLane
          const outerX = innerX + nx * TRACK_WIDTH
          const outerY = innerY + ny * TRACK_WIDTH
          return (
            <line
              x1={innerX} y1={innerY}
              x2={outerX} y2={outerY}
              stroke="white" strokeWidth={2} opacity={is1500 ? 0.85 : 0.25}
            />
          )
        })()}

        {/* ── LANE NUMBERS (on home straight, near finish) ── */}
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
        {(() => {
          // Build runner data with fractions
          const runners = players.map((p, i) => ({
            player: p,
            index: i,
            fraction: runnerPositions[i] ?? (staggerFractions[i] + startOffset),
            baseLane: startLane + i,
            graphic: getAthleteGraphic(p.athleteId),
          }))

          // For 1500m: use runnerLanes for smooth lane interpolation
          // During first segment animation, lanes interpolate from start lane → 0
          // After that, detect overlaps to shift runners outward when bunched
          if (is1500) {
            // Determine display lane for each runner
            const displayLanes: Record<number, number> = {}

            // Start with the animated lane value (smooth merge during first segment)
            runners.forEach(r => {
              displayLanes[r.index] = runnerLanes[r.index] ?? 0
            })

            // If all runners are at lane 0, apply overlap detection
            const allAtLane0 = runners.every(r => (runnerLanes[r.index] ?? 0) < 0.1)
            if (allAtLane0) {
              const sorted = [...runners].sort((a, b) => b.fraction - a.fraction)
              const OVERLAP_THRESHOLD = 0.008 // ~3m — allow more overlap before lane shift

              for (const runner of sorted) {
                let lane = 0
                for (const placed of sorted) {
                  if (placed.index === runner.index) break
                  if (displayLanes[placed.index] === undefined) continue
                  const gap = Math.abs(
                    (placed.fraction % 1) - (runner.fraction % 1)
                  )
                  const wrapGap = Math.min(gap, 1 - gap)
                  if (wrapGap < OVERLAP_THRESHOLD && displayLanes[placed.index] === lane) {
                    lane++
                  }
                }
                displayLanes[runner.index] = Math.min(lane, TOTAL_LANES - 1)
              }
            }

            return runners.map(r => {
              const lane = displayLanes[r.index] ?? 0
              const pt = getOvalPoint(r.fraction, lane)
              return (
                <g key={r.player.id}>
                  <circle cx={pt.x} cy={pt.y} r={5} fill={r.graphic.color} stroke="white" strokeWidth={1.5} />
                  <text
                    x={pt.x} y={pt.y - 9}
                    textAnchor="middle" fill={r.graphic.color}
                    fontSize={8} fontWeight={700} fontFamily="'Consolas', monospace"
                  >
                    {r.graphic.abbreviation}
                  </text>
                </g>
              )
            })
          }

          // 400m: each runner in their own staggered lane, no overlap issues
          return runners.map(r => {
            const pt = getOvalPoint(r.fraction, r.baseLane)
            return (
              <g key={r.player.id}>
                <circle cx={pt.x} cy={pt.y} r={5} fill={r.graphic.color} stroke="white" strokeWidth={1.5} />
                <text
                  x={pt.x} y={pt.y - 9}
                  textAnchor="middle" fill={r.graphic.color}
                  fontSize={8} fontWeight={700} fontFamily="'Consolas', monospace"
                >
                  {r.graphic.abbreviation}
                </text>
              </g>
            )
          })
        })()}
      </svg>
    </div>
  )
}
