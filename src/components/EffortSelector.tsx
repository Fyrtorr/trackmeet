import type { EffortType } from '../types'
import { useGameStore } from '../game/store'
import './EffortSelector.css'

interface EffortSelectorProps {
  onSelect: (effort: EffortType) => void
  disabled: boolean
  injuryInEffect: boolean
  staminaRemaining: number
  allOutCost: number
}

export function EffortSelector({ onSelect, disabled, injuryInEffect, staminaRemaining, allOutCost }: EffortSelectorProps) {
  const canAfford = useGameStore(s => s.canAffordEffort)

  const efforts: { type: EffortType; label: string; cost: string; color: string }[] = [
    {
      type: 'safe',
      label: 'Safe',
      cost: injuryInEffect ? '0 SP' : '0 SP',
      color: 'safe',
    },
    {
      type: 'avg',
      label: 'Average',
      cost: injuryInEffect ? '1 SP' : '0 SP',
      color: 'avg',
    },
    {
      type: 'allout',
      label: 'All Out',
      cost: `${allOutCost} SP`,
      color: 'allout',
    },
  ]

  return (
    <div className="effort-selector">
      <div className="effort-label">Choose Effort</div>
      <div className="effort-buttons">
        {efforts.map(e => (
          <button
            key={e.type}
            className={`effort-btn effort-${e.color}`}
            onClick={() => onSelect(e.type)}
            disabled={disabled || !canAfford(e.type)}
          >
            <span className="effort-name">{e.label}</span>
            <span className="effort-cost">{e.cost}</span>
          </button>
        ))}
      </div>
      <div className="stamina-display">
        Stamina: {staminaRemaining}
        {injuryInEffect && <span className="injury-badge">INJURED</span>}
      </div>
    </div>
  )
}
