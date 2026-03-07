import { useEffect, useState } from 'react'
import './HeightAnimation.css'

interface HeightAnimationProps {
  eventId: string
  result: number | null        // result in inches
  targetHeight: string | null  // current bar height e.g. "6' 5\""
  cleared: boolean | null      // did they clear?
  isSpecial: boolean
  onComplete?: () => void
}

export function HeightAnimation({ eventId, result, targetHeight, cleared, isSpecial, onComplete }: HeightAnimationProps) {
  const [phase, setPhase] = useState<'ready' | 'jumping' | 'result'>('ready')

  if (result === null || isSpecial || cleared === null) return null

  const isPoleVault = eventId === 'pole_vault'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('jumping'), 100)
    const t2 = setTimeout(() => {
      setPhase('result')
      onComplete?.()
    }, 1400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [result, onComplete])

  return (
    <div className="height-animation">
      <div className="height-arena">
        {/* Standards (uprights) */}
        <div className="height-standard left" />
        <div className="height-standard right" />

        {/* Bar */}
        <div className={`height-bar ${phase === 'result' && !cleared ? 'knocked' : ''}`}>
          <div className="bar-label">{targetHeight}</div>
        </div>

        {/* Athlete */}
        <div className={`height-athlete ${phase} ${cleared ? 'clear' : 'miss'} ${isPoleVault ? 'pv' : 'hj'}`}>
          {isPoleVault ? '\u{1F3CB}' : '\u{1F3C3}'}
        </div>

        {/* Result indicator */}
        {phase === 'result' && (
          <div className={`height-result-badge ${cleared ? 'cleared' : 'missed'}`}>
            {cleared ? 'O' : 'X'}
          </div>
        )}
      </div>
    </div>
  )
}
