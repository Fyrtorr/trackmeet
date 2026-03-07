import { useEffect, useState } from 'react'
import './TrackAnimation.css'

interface TrackAnimationProps {
  eventId: string
  result: number | null        // time in seconds for this segment/sprint
  totalTime?: number           // cumulative time for multi-segment
  totalSegments?: number       // total segments expected
  currentSegment?: number      // 0-based current segment
  isSpecial: boolean
  onComplete?: () => void
}

// Expected time ranges for each event (in seconds)
const TIME_RANGES: Record<string, { best: number; worst: number }> = {
  '100m':         { best: 10.0, worst: 12.5 },
  '400m':         { best: 46.0, worst: 56.0 },
  '110m_hurdles': { best: 13.0, worst: 17.0 },
  '1500m':        { best: 230, worst: 300 },
}

export function TrackAnimation({ eventId, result, totalTime, totalSegments, currentSegment, isSpecial, onComplete }: TrackAnimationProps) {
  const [phase, setPhase] = useState<'ready' | 'running' | 'finished'>('ready')

  const range = TIME_RANGES[eventId]
  if (!range || result === null || isSpecial) return null

  const isMultiSegment = eventId === '400m' || eventId === '1500m'
  const isHurdles = eventId === '110m_hurdles'

  // For multi-segment: show progress based on segments completed
  let progressPct: number
  if (isMultiSegment && totalSegments) {
    const segsDone = currentSegment ?? 0
    progressPct = (segsDone / totalSegments) * 100
  } else {
    // For sprint: map result quality to a "finishing position" feel
    // Faster = runner reaches further right
    const normalized = 1 - (result - range.best) / (range.worst - range.best)
    progressPct = Math.max(20, Math.min(100, normalized * 80 + 20))
  }

  // Animation duration scales slightly with result (faster result = faster animation)
  const animDuration = isMultiSegment ? 800 : 1000

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('running'), 50)
    const t2 = setTimeout(() => {
      setPhase('finished')
      onComplete?.()
    }, animDuration + 100)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [result, animDuration, onComplete])

  // Generate hurdle positions
  const hurdles = isHurdles ? [15, 25, 35, 45, 55, 65, 72, 79, 86, 93] : []

  // Format time display
  const timeDisplay = isMultiSegment && totalTime !== undefined
    ? totalTime.toFixed(2) + 's'
    : result.toFixed(2) + 's'

  return (
    <div className="track-animation">
      <div className="track-surface">
        {/* Lane lines */}
        <div className="track-lane" />

        {/* Start line */}
        <div className="track-start-line" />

        {/* Finish line */}
        <div className="track-finish-line" />

        {/* Hurdles */}
        {hurdles.map((pos, i) => (
          <div key={i} className="track-hurdle" style={{ left: `${pos}%` }} />
        ))}

        {/* Runner */}
        <div
          className={`track-runner ${phase}`}
          style={{
            '--finish-x': `${progressPct}%`,
            '--anim-duration': `${animDuration}ms`,
          } as React.CSSProperties}
        >
          {'\u{1F3C3}'}
        </div>

        {/* Time display at finish */}
        {phase === 'finished' && (
          <div className="track-time" style={{ left: `${progressPct}%` }}>
            {timeDisplay}
          </div>
        )}
      </div>

      {/* Segment indicators for multi-segment events */}
      {isMultiSegment && totalSegments && (
        <div className="segment-dots">
          {Array.from({ length: totalSegments }, (_, i) => (
            <div
              key={i}
              className={`segment-dot ${i < (currentSegment ?? 0) ? 'filled' : ''}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
