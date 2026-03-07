import { useState, useCallback } from 'react'
import { useGameStore } from '../game/store'
import { EVENTS } from '../data/events'
import { DiceDisplay } from './DiceDisplay'
import { ChartDisplay } from './ChartDisplay'
import { EffortSelector } from './EffortSelector'
import { Scoresheet } from './Scoresheet'
import athleteData from '../data/athletes.json'
import type { EffortType, AthleteData } from '../types'
import './GameScreen.css'

const athletes = athleteData as Record<string, AthleteData>

export function GameScreen() {
  const state = useGameStore()
  const [isRolling, setIsRolling] = useState(false)
  const [chosenEffort, setChosenEffort] = useState<EffortType | null>(null)

  const event = EVENTS[state.currentEventIndex]
  const player = state.players[state.currentPlayerIndex]
  const athlete = player ? athletes[player.athleteId] : null

  const stamina = event?.day === 1 ? player?.staminaDay1 ?? 0 : player?.staminaDay2 ?? 0
  const injuryActive = player?.injuryInEffect !== null

  const handleEffortSelect = useCallback((effort: EffortType) => {
    setChosenEffort(effort)
    state.chooseEffort(effort)
    setIsRolling(true)
    state.performRoll()
  }, [state])

  const handleRollComplete = useCallback(() => {
    setIsRolling(false)
  }, [])

  const handleAdvance = useCallback(() => {
    setChosenEffort(null)
    state.advanceGame()
  }, [state])

  if (!event || !player || !athlete) return null

  const currentResult = player.eventResults.find(r => r.eventId === event.id)
  const isChoosingEffort = state.phase === 'choosingEffort'
  const hasResult = state.phase === 'showingResult' || state.phase === 'eventComplete'

  // Determine attempt display
  let attemptDisplay = ''
  if (event.type === 'field_throw' || event.type === 'field_jump') {
    attemptDisplay = `Attempt ${state.currentAttempt + 1} of 3`
  } else if (event.type === 'multi_segment') {
    attemptDisplay = `Segment ${state.currentSegment + 1} of ${event.segments}`
  }

  // Determine All Out cost considering injury
  let allOutCost = event.allOutStaminaCost
  if (injuryActive) {
    allOutCost = event.id === '1500m' ? 6 : 2
  }

  // Check if we should show advance button
  const showAdvance = hasResult && !isRolling
  const isEventDone = (
    event.type === 'sprint' ||
    (event.type === 'field_throw' || event.type === 'field_jump') && state.currentAttempt >= 2 ||
    event.type === 'multi_segment' && state.currentSegment >= (event.segments ?? 0) ||
    state.phase === 'eventComplete'
  )
  const advanceLabel = isEventDone ? 'Next' : 'Continue'

  // Result display
  const lastResultDisplay = state.lastResult?.displayValue ?? ''
  const isSpecial = state.lastResult?.isSpecial ?? false

  return (
    <div className="game-screen">
      <div className="game-header">
        <div className="event-info">
          <span className="event-day">Day {event.day}</span>
          <h2 className="event-name">{event.name}</h2>
          <span className="event-number">Event {event.order} of 10</span>
        </div>
        <div className="player-turn">
          <span className="turn-label">Current Player</span>
          <span className="turn-name">{player.name}</span>
          <span className="turn-athlete">{athlete.name}</span>
        </div>
      </div>

      <div className="game-body">
        <div className="game-left">
          <ChartDisplay
            athlete={athlete}
            eventId={event.id}
            highlightDice={state.lastRoll?.total ?? null}
            highlightEffort={chosenEffort}
          />
        </div>

        <div className="game-center">
          {attemptDisplay && (
            <div className="attempt-badge">{attemptDisplay}</div>
          )}

          <DiceDisplay
            roll={state.lastRoll}
            rolling={isRolling}
            onRollComplete={handleRollComplete}
          />

          {hasResult && !isRolling && (
            <div className={`result-display ${isSpecial ? 'special' : 'normal'}`}>
              <span className="result-label">Result</span>
              <span className="result-value">{lastResultDisplay}</span>
              {currentResult && currentResult.points > 0 && isEventDone && (
                <span className="result-points">{currentResult.points} pts</span>
              )}
            </div>
          )}

          {isChoosingEffort && (
            <EffortSelector
              onSelect={handleEffortSelect}
              disabled={isRolling}
              injuryInEffect={injuryActive}
              staminaRemaining={stamina}
              allOutCost={allOutCost}
            />
          )}

          {showAdvance && (
            <button className="primary advance-btn" onClick={handleAdvance}>
              {advanceLabel}
            </button>
          )}
        </div>

        <div className="game-right">
          <Scoresheet player={player} currentEventId={event.id} />
        </div>
      </div>
    </div>
  )
}
