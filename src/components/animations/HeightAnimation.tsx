import { useEffect, useState, useRef } from 'react'
import type { PlayerState } from '../../types'
import { getAthleteGraphic } from '../../data/athleteGraphics'
import { HIGH_JUMP_HEIGHTS, POLE_VAULT_HEIGHTS } from '../../data/events'
import { parseFeetInches } from '../../game/chartLookup'
import './HeightAnimation.css'

interface HeightAnimationProps {
  eventId: string
  players: PlayerState[]
  currentPlayerIndex: number
  currentHeightIndex: number
  lastResultInches: number | null
  cleared: boolean | null
  isSpecial: boolean
  jumpTrigger: number
  onJumpComplete?: () => void
}

// Max upright height: 8 feet for high jump, 21 feet for pole vault
const HJ_MAX_INCHES = 96   // 8'
const PV_MAX_INCHES = 252   // 21'

export function HeightAnimation({
  eventId, players, currentPlayerIndex, currentHeightIndex,
  lastResultInches, cleared, isSpecial, jumpTrigger, onJumpComplete,
}: HeightAnimationProps) {
  const [phase, setPhase] = useState<'ready' | 'jumping' | 'result'>('ready')
  const prevTriggerRef = useRef(jumpTrigger)
  const onJumpCompleteRef = useRef(onJumpComplete)
  onJumpCompleteRef.current = onJumpComplete

  const isPoleVault = eventId === 'pole_vault'
  const maxUprightInches = isPoleVault ? PV_MAX_INCHES : HJ_MAX_INCHES
  const heightList = isPoleVault ? POLE_VAULT_HEIGHTS : HIGH_JUMP_HEIGHTS
  const currentBarStr = heightList[currentHeightIndex] ?? heightList[0]
  const currentBarInches = parseFeetInches(currentBarStr) ?? 68

  const currentPlayer = players[currentPlayerIndex]
  const graphic = currentPlayer ? getAthleteGraphic(currentPlayer.athleteId) : null

  // Bar position mapped to field coordinates
  // Upright starts at 8% (ground) and spans 55% of field height
  const GROUND_PCT = 8
  const UPRIGHT_HEIGHT_PCT = 55
  const barFraction = Math.min(1, currentBarInches / maxUprightInches)
  const barPercent = GROUND_PCT + barFraction * UPRIGHT_HEIGHT_PCT
  // Mat is 4 feet tall, scaled to the upright
  const matHeightPct = (48 / maxUprightInches) * UPRIGHT_HEIGHT_PCT

  // Trigger jump animation
  useEffect(() => {
    if (jumpTrigger === prevTriggerRef.current) return
    prevTriggerRef.current = jumpTrigger
    if (jumpTrigger === 0) return
    if (lastResultInches === null) {
      // Special result (FOUL, etc.) — skip animation but still signal completion
      onJumpCompleteRef.current?.()
      return
    }

    setPhase('jumping')
    const t1 = setTimeout(() => {
      setPhase('result')
      onJumpCompleteRef.current?.()
    }, 1400)
    return () => clearTimeout(t1)
  }, [jumpTrigger, lastResultInches])

  // Reset to ready when player changes
  useEffect(() => {
    setPhase('ready')
  }, [currentPlayerIndex, currentHeightIndex])

  const showAthlete = phase === 'ready' || phase === 'jumping'
  const showResult = phase === 'result' && cleared !== null
  const barKnocked = phase === 'result' && cleared === false

  return (
    <div className="height-field">
      {/* Ground / mat area */}
      <div className="hf-ground" />

      {/* Landing mat behind the bar */}
      <div className="hf-mat" style={{ height: `${matHeightPct}%` }} />

      {/* Left upright */}
      <div className="hf-upright hf-upright-left">
        <div className="hf-upright-post" />
        {/* Height tick marks on upright */}
        {heightList.map((h, i) => {
          const inches = parseFeetInches(h) ?? 0
          const pct = Math.min(100, (inches / maxUprightInches) * 100)
          const isCurrent = i === currentHeightIndex
          return (
            <div
              key={h}
              className={`hf-tick ${isCurrent ? 'current' : ''} ${i < currentHeightIndex ? 'past' : ''}`}
              style={{ bottom: `${pct}%` }}
            />
          )
        })}
      </div>

      {/* Right upright */}
      <div className="hf-upright hf-upright-right">
        <div className="hf-upright-post" />
      </div>

      {/* Height sign */}
      <div className="hf-height-sign">
        {currentBarStr}
      </div>

      {/* Bar */}
      <div
        className={`hf-bar ${barKnocked ? 'knocked' : ''}`}
        style={{ bottom: `${barPercent}%` }}
      >
      </div>

      {/* Athlete approaching / jumping */}
      {graphic && showAthlete && (
        <div
          className={`hf-athlete ${phase} ${cleared === true ? 'will-clear' : cleared === false ? 'will-miss' : ''}`}
        >
          <span className="hf-athlete-figure">{isPoleVault ? '\u{1F3CB}' : '\u{1F3C3}'}</span>
        </div>
      )}

      {/* Result badge */}
      {showResult && (
        <div className={`hf-result-badge ${cleared ? 'cleared' : 'missed'}`}>
          {cleared ? 'CLEAR!' : 'MISS!'}
        </div>
      )}

      {/* Player indicator */}
      {graphic && (
        <div className="hf-player-tag" style={{ background: graphic.color }}>
          {getAthleteGraphic(currentPlayer!.athleteId).abbreviation}
        </div>
      )}
    </div>
  )
}
