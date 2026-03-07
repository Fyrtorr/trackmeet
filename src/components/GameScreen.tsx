import { useState, useCallback, useEffect } from 'react'
import { useGameStore } from '../game/store'
import { EVENTS } from '../data/events'
import { DiceDisplay } from './DiceDisplay'
import { ChartDisplay } from './ChartDisplay'
import { EffortSelector } from './EffortSelector'
import { EventScorecard } from './EventScorecard'
import { ScorecardOverlay } from './ScorecardOverlay'
import { FieldAnimation } from './animations/FieldAnimation'
import { TrackAnimation } from './animations/TrackAnimation'
import { HeightAnimation } from './animations/HeightAnimation'
import { RaceTrack } from './animations/RaceTrack'
import { LongJumpPit } from './animations/LongJumpPit'
import { clearsHeight } from '../game/chartLookup'
import { getAthleteGraphic } from '../data/athleteGraphics'
import athleteData from '../data/athletes.json'
import type { EffortType, AthleteData } from '../types'
import './GameScreen.css'

const athletes = athleteData as Record<string, AthleteData>

export function GameScreen() {
  const state = useGameStore()
  const [isRolling, setIsRolling] = useState(false)
  const [chosenEffort, setChosenEffort] = useState<EffortType | null>(null)
  const [raceTriggered, setRaceTriggered] = useState(false)
  const [raceComplete, setRaceComplete] = useState(false)
  const [jumpTrigger, setJumpTrigger] = useState(0)
  const [showScorecard, setShowScorecard] = useState(false)

  const event = EVENTS[state.currentEventIndex]
  const player = state.players[state.currentPlayerIndex]
  const athlete = player ? athletes[player.athleteId] : null

  const stamina = event?.day === 1 ? player?.staminaDay1 ?? 0 : player?.staminaDay2 ?? 0
  const injuryActive = player?.injuryInEffect !== null

  const isSprint = event?.type === 'sprint'
  const isLongJump = event?.id === 'long_jump'

  // Check if all players have rolled for this sprint event
  const allPlayersRolled = isSprint && state.players.every(p =>
    p.eventResults.some(r => r.eventId === event.id)
  )

  // Detect when last player's roll animation finishes → trigger race
  useEffect(() => {
    if (allPlayersRolled && !isRolling && !raceTriggered) {
      const timer = setTimeout(() => setRaceTriggered(true), 600)
      return () => clearTimeout(timer)
    }
  }, [allPlayersRolled, isRolling, raceTriggered])

  // Reset race state when event changes
  useEffect(() => {
    setRaceTriggered(false)
    setRaceComplete(false)
  }, [state.currentEventIndex])

  const handleEffortSelect = useCallback((effort: EffortType) => {
    setChosenEffort(effort)
    state.chooseEffort(effort)
    setIsRolling(true)
    state.performRoll()
  }, [state])

  const handleRollComplete = useCallback(() => {
    setIsRolling(false)
    if (EVENTS[useGameStore.getState().currentEventIndex]?.id === 'long_jump') {
      setJumpTrigger(t => t + 1)
    }
  }, [])

  const handleAdvance = useCallback(() => {
    setChosenEffort(null)
    state.advanceGame()
  }, [state])

  const handleRaceComplete = useCallback(() => {
    setRaceComplete(true)
  }, [])

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

  // Sprint flow control
  const sprintRaceInProgress = isSprint && raceTriggered && !raceComplete
  const sprintWaitingForRace = isSprint && allPlayersRolled && !raceComplete

  const showAdvance = hasResult && !isRolling && !sprintWaitingForRace && !sprintRaceInProgress
  const isFieldEvent = event.type === 'field_throw' || event.type === 'field_jump'
  const isLastPlayer = state.currentPlayerIndex >= state.players.length - 1
  const isEventDone = (
    event.type === 'sprint' ||
    isFieldEvent && state.currentAttempt >= 2 && isLastPlayer ||
    event.type === 'multi_segment' && state.currentSegment >= (event.segments ?? 0) ||
    state.phase === 'eventComplete'
  )
  const advanceLabel = isEventDone ? 'Next' : 'Continue'

  const lastResultDisplay = state.lastResult?.displayValue ?? ''
  const isSpecial = state.lastResult?.isSpecial ?? false
  const showResultBox = hasResult && !isRolling && !(isSprint && raceTriggered)

  return (
    <div className="game-screen">
      <div className="game-header">
        <div className="event-info">
          <span className="event-day">Day {event.day}</span>
          <h2 className="event-name">{event.name}</h2>
          <span className="event-number">Event {event.order} of 10</span>
        </div>
        <div className="header-right">
          <button className="scorecard-btn" onClick={() => setShowScorecard(true)}>
            Scorecard
          </button>
          <div className="player-turn">
            <span className="turn-label">Current Player</span>
            <span className="turn-name">{player.name}</span>
            <span className="turn-athlete">{athlete.name}</span>
          </div>
        </div>
      </div>

      {/* Race track for sprint events */}
      {isSprint && (
        <div className="race-track-container">
          <RaceTrack
            players={state.players}
            eventId={event.id}
            triggerRace={raceTriggered}
            onRaceComplete={handleRaceComplete}
          />
        </div>
      )}

      {/* Long jump pit */}
      {isLongJump && (
        <div className="race-track-container">
          <LongJumpPit
            players={state.players}
            currentPlayerIndex={state.currentPlayerIndex}
            eventId={event.id}
            lastResult={state.lastResult?.numericValue ?? null}
            lastResultDisplay={state.lastResult?.displayValue ?? ''}
            isSpecial={state.lastResult?.isSpecial ?? false}
            jumpTrigger={jumpTrigger}
          />
        </div>
      )}

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

          {/* Event animations (generic fallback) */}
          {hasResult && !isRolling && !isSpecial && !isSprint && !isLongJump && (
            <>
              {(event.type === 'field_throw' || event.type === 'field_jump') && (
                <FieldAnimation
                  eventId={event.id}
                  result={state.lastResult?.numericValue ?? null}
                  isSpecial={isSpecial}
                />
              )}
              {event.type === 'multi_segment' && (
                <TrackAnimation
                  eventId={event.id}
                  result={state.lastResult?.numericValue ?? null}
                  totalTime={currentResult?.segments?.reduce((s, seg) => s + seg.time, 0)}
                  totalSegments={event.segments}
                  currentSegment={state.currentSegment}
                  isSpecial={isSpecial}
                />
              )}
              {event.type === 'height' && state.lastResult?.numericValue != null && (
                <HeightAnimation
                  eventId={event.id}
                  result={state.lastResult.numericValue}
                  targetHeight={null}
                  cleared={clearsHeight(state.lastResult.numericValue, currentResult?.heightProgression?.at(-1)?.height ?? "6' 0\"")}
                  isSpecial={isSpecial}
                />
              )}
            </>
          )}

          {/* Per-roll result box */}
          {showResultBox && (
            <div className={`result-display ${isSpecial ? 'special' : 'normal'}`}>
              <span className="result-label">Result</span>
              <span className="result-value">{lastResultDisplay}</span>
              {currentResult && currentResult.points > 0 && isEventDone && (
                <span className="result-points">{currentResult.points} pts</span>
              )}
            </div>
          )}

          {/* Sprint race results summary */}
          {isSprint && raceComplete && (
            <div className="race-results">
              {[...state.players]
                .map(p => ({
                  player: p,
                  result: p.eventResults.find(r => r.eventId === event.id),
                }))
                .sort((a, b) => {
                  if (a.result?.bestResult == null) return 1
                  if (b.result?.bestResult == null) return -1
                  return a.result.bestResult - b.result.bestResult
                })
                .map((entry, i) => {
                  const g = getAthleteGraphic(entry.player.athleteId)
                  return (
                  <div key={entry.player.id} className="race-result-row" style={{ borderLeftColor: g.color }}>
                    <span className="race-place">{i + 1}</span>
                    <span className="race-name">{entry.player.name}</span>
                    <span className="race-time">
                      {entry.result?.bestResultDisplay
                        ? entry.result.bestResultDisplay + 's'
                        : entry.result?.bestResultDisplay ?? 'DQ'}
                    </span>
                    <span className="race-pts">{entry.result?.points ?? 0} pts</span>
                  </div>
                  )
                })}
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
          <EventScorecard
            players={state.players}
            event={event}
            currentPlayerIndex={state.currentPlayerIndex}
          />
        </div>
      </div>

      {/* Scorecard overlay */}
      {showScorecard && (
        <ScorecardOverlay
          players={state.players}
          currentEventId={event.id}
          onClose={() => setShowScorecard(false)}
        />
      )}
    </div>
  )
}
