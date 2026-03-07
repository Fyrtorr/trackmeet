import { useState, useEffect } from 'react'
import type { DiceRoll } from '../types'
import './DiceDisplay.css'

interface DiceDisplayProps {
  roll: DiceRoll | null
  rolling: boolean
  onRollComplete?: () => void
}

const ROLL_DURATION = 800 // ms
const FRAME_INTERVAL = 80 // ms

function randomFace(max: number): number {
  return Math.floor(Math.random() * max)
}

export function DiceDisplay({ roll, rolling, onRollComplete }: DiceDisplayProps) {
  const [animBlack, setAnimBlack] = useState(0)
  const [animWhiteA, setAnimWhiteA] = useState(0)
  const [animWhiteB, setAnimWhiteB] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (!rolling) return

    setIsAnimating(true)
    const startTime = Date.now()

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      if (elapsed >= ROLL_DURATION) {
        clearInterval(interval)
        if (roll) {
          setAnimBlack(roll.black)
          setAnimWhiteA(roll.whiteA)
          setAnimWhiteB(roll.whiteB)
        }
        setIsAnimating(false)
        onRollComplete?.()
        return
      }
      setAnimBlack(randomFace(3) + 1)
      setAnimWhiteA(randomFace(6))
      setAnimWhiteB(randomFace(5))
    }, FRAME_INTERVAL)

    return () => clearInterval(interval)
  }, [rolling, roll, onRollComplete])

  // Show final values when not animating
  const displayBlack = isAnimating ? animBlack : (roll?.black ?? 0)
  const displayWhiteA = isAnimating ? animWhiteA : (roll?.whiteA ?? 0)
  const displayWhiteB = isAnimating ? animWhiteB : (roll?.whiteB ?? 0)
  const displayTotal = isAnimating ? '?' : (roll?.total ?? '—')

  return (
    <div className="dice-display">
      <div className="dice-row">
        <div className={`die die-black ${isAnimating ? 'tumbling' : ''}`}>
          <span className="die-value">{displayBlack || '—'}</span>
          <span className="die-label">×10</span>
        </div>
        <span className="dice-op">+</span>
        <div className={`die die-white ${isAnimating ? 'tumbling' : ''}`}>
          <span className="die-value">{displayWhiteA}</span>
        </div>
        <span className="dice-op">+</span>
        <div className={`die die-white die-yellow ${isAnimating ? 'tumbling' : ''}`}>
          <span className="die-value">{displayWhiteB}</span>
        </div>
      </div>
      <div className={`dice-total ${roll && !isAnimating ? 'revealed' : ''}`}>
        {displayTotal}
      </div>
    </div>
  )
}
