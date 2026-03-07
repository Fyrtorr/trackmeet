import { useState, useCallback, useEffect, useMemo } from 'react'
import { useGameStore } from '../game/store'
import { EVENTS, POLE_VAULT_HEIGHTS, FATIGUE_THRESHOLD, generateHighJumpHeights } from '../data/events'
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
import { ShotPutRing } from './animations/ShotPutRing'
import { clearsHeight, parseFeetInches } from '../game/chartLookup'
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
  const [throwTrigger, setThrowTrigger] = useState(0)
  const [heightJumpTrigger, setHeightJumpTrigger] = useState(0)
  const [showScorecard, setShowScorecard] = useState(false)
  const [heightAction, setHeightAction] = useState<'choosing' | 'attempting' | 'confirming-done'>('choosing')

  const event = EVENTS[state.currentEventIndex]
  const player = state.players[state.currentPlayerIndex]
  const athlete = player ? athletes[player.athleteId] : null

  const stamina = event?.day === 1 ? player?.staminaDay1 ?? 0 : player?.staminaDay2 ?? 0
  const injuryActive = player?.injuryInEffect !== null

  const isSprint = event?.type === 'sprint'
  const isLongJump = event?.id === 'long_jump'
  const isShotPut = event?.id === 'shot_put'
  const isHeight = event?.type === 'height'

  // Compute dynamic height list based on athletes in game
  const heightList = useMemo(() => {
    if (!event || event.type !== 'height') return []
    if (event.id === 'pole_vault') return POLE_VAULT_HEIGHTS

    // Find max possible HJ result across all players' charts
    let maxInches = 87 // default 7'3"
    for (const p of state.players) {
      const a = athletes[p.athleteId]
      if (!a?.events?.high_jump) continue
      for (const cell of Object.values(a.events.high_jump)) {
        for (const effort of ['safe', 'avg', 'allout'] as const) {
          const val = cell[effort]
          if (typeof val === 'string' && val.includes("'")) {
            const inches = parseFeetInches(val)
            if (inches !== null && inches > maxInches) maxInches = inches
          }
        }
      }
    }
    return generateHighJumpHeights(maxInches)
  }, [event, state.players])

  // Compute max possible height per player for scorecard blackout
  const playerMaxHeights = useMemo(() => {
    if (!event || event.type !== 'height') return {}
    const eventId = event.id
    const result: Record<number, number> = {}
    for (const p of state.players) {
      const a = athletes[p.athleteId]
      const chart = a?.events?.[eventId]
      if (!chart) continue
      let max = 0
      for (const cell of Object.values(chart)) {
        for (const effort of ['safe', 'avg', 'allout'] as const) {
          const val = cell[effort]
          if (typeof val === 'string' && val.includes("'")) {
            const inches = parseFeetInches(val)
            if (inches !== null && inches > max) max = inches
          }
        }
      }
      result[p.id] = max
    }
    return result
  }, [event, state.players])

  const currentBarHeight = isHeight ? heightList[state.currentHeightIndex] ?? null : null

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

  // Reset height action when player, height, or phase changes back to choosing
  useEffect(() => {
    setHeightAction('choosing')
  }, [state.currentPlayerIndex, state.currentHeightIndex, state.phase])

  const handleEffortSelect = useCallback((effort: EffortType) => {
    setChosenEffort(effort)
    state.chooseEffort(effort)
    setIsRolling(true)
    state.performRoll()
  }, [state])

  const handleRollComplete = useCallback(() => {
    setIsRolling(false)
    const s = useGameStore.getState()
    const currentEventId = EVENTS[s.currentEventIndex]?.id
    const currentEventType = EVENTS[s.currentEventIndex]?.type
    if (currentEventId === 'long_jump') {
      setJumpTrigger(t => t + 1)
    } else if (currentEventId === 'shot_put') {
      setThrowTrigger(t => t + 1)
    } else if (currentEventType === 'height') {
      setHeightJumpTrigger(t => t + 1)
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
  } else if (isHeight && currentBarHeight) {
    attemptDisplay = `Bar: ${currentBarHeight}`
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
  // For height events, check if all players are done
  const allHeightPlayersDone = isHeight && state.players.every(p => {
    const r = p.eventResults.find(er => er.eventId === event.id)
    if (!r) return false
    if (r.heightDone) return true
    // Check 3 consecutive misses
    let misses = 0
    for (const hp of (r.heightProgression ?? [])) {
      for (const a of hp.attempts) {
        if (a === 'X') misses++
        else if (a === 'O') misses = 0
      }
    }
    return misses >= 3
  })

  const isEventDone = (
    event.type === 'sprint' ||
    isFieldEvent && state.currentAttempt >= 2 && isLastPlayer ||
    event.type === 'multi_segment' && state.currentSegment >= (event.segments ?? 0) ||
    allHeightPlayersDone ||
    state.phase === 'eventComplete'
  )
  const advanceLabel = isEventDone ? 'Next' : 'Continue'

  const lastResultDisplay = state.lastResult?.displayValue ?? ''
  const isSpecial = state.lastResult?.isSpecial ?? false
  // Don't show result box for height pass/done (no dice rolled)
  const showResultBox = hasResult && !isRolling && !(isSprint && raceTriggered) && state.lastRoll !== null

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

      {/* Shot put ring */}
      {isShotPut && (
        <div className="race-track-container">
          <ShotPutRing
            players={state.players}
            currentPlayerIndex={state.currentPlayerIndex}
            eventId={event.id}
            lastResult={state.lastResult?.numericValue ?? null}
            lastResultDisplay={state.lastResult?.displayValue ?? ''}
            isSpecial={state.lastResult?.isSpecial ?? false}
            throwTrigger={throwTrigger}
          />
        </div>
      )}

      {/* Height event (high jump / pole vault) */}
      {isHeight && (
        <div className="race-track-container">
          <HeightAnimation
            eventId={event.id}
            players={state.players}
            currentPlayerIndex={state.currentPlayerIndex}
            currentHeightIndex={state.currentHeightIndex}
            lastResultInches={state.lastResult?.numericValue ?? null}
            cleared={state.lastResult?.numericValue != null && currentBarHeight
              ? clearsHeight(state.lastResult.numericValue, currentBarHeight)
              : null}
            isSpecial={isSpecial}
            jumpTrigger={heightJumpTrigger}
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

      <div className={`game-body ${isHeight ? 'height-layout' : ''}`}>
        <div className="game-left">
          <ChartDisplay
            athlete={athlete}
            eventId={event.id}
            highlightDice={state.lastRoll?.total ?? null}
            highlightEffort={chosenEffort}
          />
        </div>

        <div className="game-center">
          {isHeight && (() => {
            const heightAttempts = currentResult?.heightProgression?.reduce(
              (sum, h) => sum + h.attempts.filter(a => a === 'O' || a === 'X').length, 0
            ) ?? 0
            const fatigued = heightAttempts >= FATIGUE_THRESHOLD
            return (
              <>
                <div className="height-player-badge" style={{ borderColor: getAthleteGraphic(player.athleteId).color }}>
                  {player.name}
                </div>
                <div className={`height-fatigue ${fatigued ? 'active' : ''}`}>
                  Attempts: {heightAttempts}
                  {fatigued && <span className="fatigue-warn"> (+1 SP fatigue)</span>}
                </div>
              </>
            )
          })()}
          {attemptDisplay && (
            <div className="attempt-badge">{attemptDisplay}</div>
          )}

          <DiceDisplay
            roll={state.lastRoll}
            rolling={isRolling}
            onRollComplete={handleRollComplete}
          />

          {/* Event animations (generic fallback) */}
          {hasResult && !isRolling && !isSpecial && !isSprint && !isLongJump && !isShotPut && (
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
              {/* Height animation is now always-visible above the grid */}
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

          {isChoosingEffort && !isHeight && (
            <EffortSelector
              onSelect={handleEffortSelect}
              disabled={isRolling}
              injuryInEffect={injuryActive}
              staminaRemaining={stamina}
              allOutCost={allOutCost}
            />
          )}

          {/* Height event action buttons */}
          {isChoosingEffort && isHeight && heightAction === 'choosing' && (
            <div className="height-actions">
              <button className="primary height-btn" onClick={() => setHeightAction('attempting')}>
                Attempt {currentBarHeight}
              </button>
              <button className="height-btn height-pass" onClick={() => { state.passHeight(); }}>
                Pass
              </button>
              <button className="height-btn height-done" onClick={() => setHeightAction('confirming-done')}>
                Done Jumping
              </button>
            </div>
          )}

          {/* Height event: confirm done jumping */}
          {isChoosingEffort && isHeight && heightAction === 'confirming-done' && (() => {
            const bestHeight = currentResult?.bestResultDisplay || 'No height cleared'
            const pts = currentResult?.points ?? 0
            return (
              <div className="height-confirm-done">
                <div className="height-confirm-title">Stop Jumping?</div>
                <div className="height-confirm-score">
                  <span className="height-confirm-label">Best Height</span>
                  <span className="height-confirm-value">{bestHeight}</span>
                  <span className="height-confirm-pts">{pts} pts</span>
                </div>
                <div className="height-confirm-buttons">
                  <button className="height-btn height-done" onClick={() => { state.doneJumping(); }}>
                    Accept &amp; Stop
                  </button>
                  <button className="height-btn height-pass" onClick={() => setHeightAction('choosing')}>
                    Go Back
                  </button>
                </div>
              </div>
            )
          })()}

          {isChoosingEffort && isHeight && heightAction === 'attempting' && (
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
            heightList={heightList}
            playerMaxHeights={playerMaxHeights}
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
