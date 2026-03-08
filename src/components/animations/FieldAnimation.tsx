import { useEffect, useState, useRef } from 'react'
import './FieldAnimation.css'

interface FieldAnimationProps {
  eventId: string
  result: number | null      // numeric result (inches for SP, feet for discus/javelin)
  isSpecial: boolean
  bestDistance: number | null // best distance so far (same units as result)
  onComplete?: () => void
}

// Ranges for normalizing position on the field (min/max expected values)
const EVENT_RANGES: Record<string, { min: number; max: number; unit: string; toFeet: (v: number) => number }> = {
  long_jump:  { min: 200, max: 340, unit: 'ft', toFeet: v => v / 12 },
  shot_put:   { min: 360, max: 720, unit: 'ft', toFeet: v => v / 12 },
  discus:     { min: 100, max: 200, unit: 'ft', toFeet: v => v },
  javelin:    { min: 150, max: 300, unit: 'ft', toFeet: v => v },
}

export function FieldAnimation({ eventId, result, isSpecial, bestDistance, onComplete }: FieldAnimationProps) {
  const [phase, setPhase] = useState<'ready' | 'flying' | 'landed'>('ready')
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const range = EVENT_RANGES[eventId]
  if (!range || result === null || isSpecial) return null

  const distanceFt = range.toFeet(result)
  const normalized = Math.max(0, Math.min(1, (result - range.min) / (range.max - range.min)))
  const landingPercent = 10 + normalized * 80 // land between 10% and 90% of the field

  // Best distance yellow marker position
  const bestPercent = bestDistance !== null
    ? 10 + Math.max(0, Math.min(1, (bestDistance - range.min) / (range.max - range.min))) * 80
    : null

  useEffect(() => {
    setPhase('ready')
    const t1 = setTimeout(() => setPhase('flying'), 100)
    const t2 = setTimeout(() => {
      setPhase('landed')
      onCompleteRef.current?.()
    }, 1400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [result])

  // Generate distance markers
  const markerCount = 5
  const markers = Array.from({ length: markerCount }, (_, i) => {
    const frac = i / (markerCount - 1)
    const val = range.min + frac * (range.max - range.min)
    const ft = range.toFeet(val)
    return { pct: 10 + frac * 80, label: `${Math.round(ft)}'` }
  })

  const projectileIcon = eventId === 'long_jump' ? '\u{1F3C3}' // runner
    : eventId === 'shot_put' ? '\u26AB' // black circle
    : eventId === 'discus' ? '\u{1F4BF}' // disc
    : '\u{1F4A8}' // javelin dash

  return (
    <div className="field-animation">
      <div className="field-track">
        {/* Distance markers */}
        {markers.map((m, i) => (
          <div key={i} className="field-marker" style={{ left: `${m.pct}%` }}>
            <span className="field-marker-line" />
            <span className="field-marker-label">{m.label}</span>
          </div>
        ))}

        {/* Best distance yellow line */}
        {bestPercent !== null && (
          <div className="field-best-line" style={{ left: `${bestPercent}%` }}>
            <span className="field-best-marker" />
            <span className="field-best-label">Best</span>
          </div>
        )}

        {/* Landing zone */}
        {phase === 'landed' && (
          <div className="field-landing" style={{ left: `${landingPercent}%` }}>
            <div className="landing-marker" />
            <div className="landing-label">{distanceFt.toFixed(1)}'</div>
          </div>
        )}

        {/* Projectile */}
        <div
          className={`field-projectile ${phase}`}
          style={{
            '--landing-x': `${landingPercent}%`,
          } as React.CSSProperties}
        >
          {projectileIcon}
        </div>
      </div>
    </div>
  )
}
