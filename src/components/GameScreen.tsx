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
import { OvalTrackAnimation } from './animations/OvalTrackAnimation'
import { RaceTrack } from './animations/RaceTrack'
import { LongJumpPit } from './animations/LongJumpPit'
import { ShotPutRing } from './animations/ShotPutRing'
import { ThrowingFieldAnimation } from './animations/ThrowingFieldAnimation'
import { SplitScoreboard } from './SplitScoreboard'
import { audioManager } from '../audio/audioManager'
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
  const [throwLanded, setThrowLanded] = useState(false)
  const [runwayDone, setRunwayDone] = useState(true)
  const [heightJumpTrigger, setHeightJumpTrigger] = useState(0)
  const [jumpAnimDone, setJumpAnimDone] = useState(true)
  const [showScorecard, setShowScorecard] = useState(false)
  const [heightAction, setHeightAction] = useState<'choosing' | 'attempting' | 'confirming-done'>('choosing')
  const [awaitingMsContinue, setAwaitingMsContinue] = useState(false)
  const [msDisplayPlayerIndex, setMsDisplayPlayerIndex] = useState<number | null>(null)

  const event = EVENTS[state.currentEventIndex]
  const player = state.players[state.currentPlayerIndex]
  const athlete = player ? athletes[player.athleteId] : null

  const stamina = event?.day === 1 ? player?.staminaDay1 ?? 0 : player?.staminaDay2 ?? 0
  const injuryActive = player?.injuryInEffect !== null

  const isSprint = event?.type === 'sprint'
  const isLongJump = event?.id === 'long_jump'
  const isShotPut = event?.id === 'shot_put'
  const isDiscus = event?.id === 'discus'
  const isJavelin = event?.id === 'javelin'
  const isThrowingField = isShotPut || isDiscus || isJavelin
  const isHeight = event?.type === 'height'
  const isMultiSegment = event?.type === 'multi_segment'

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

  // Reset animation state when event changes
  useEffect(() => {
    setRaceTriggered(false)
    setRaceComplete(false)
    setJumpAnimDone(true)
    setThrowLanded(false)
    setRunwayDone(true)
    setAwaitingMsContinue(false)
    setMsDisplayPlayerIndex(null)
  }, [state.currentEventIndex])

  // Reset height action when player, height, or phase changes back to choosing
  useEffect(() => {
    setHeightAction('choosing')
  }, [state.currentPlayerIndex, state.currentHeightIndex, state.phase])

  // Auto-end height event if player can't afford any effort (0 stamina + fatigue)
  useEffect(() => {
    if (!isHeight || state.phase !== 'choosingEffort') return
    const canAffordAny = state.canAffordEffort('safe') || state.canAffordEffort('avg') || state.canAffordEffort('allout')
    if (!canAffordAny) {
      state.doneJumping()
    }
  }, [isHeight, state.phase, state.currentPlayerIndex, state])

  const handleEffortSelect = useCallback((effort: EffortType) => {
    setChosenEffort(effort)
    setThrowLanded(false)
    setJumpAnimDone(false)
    state.chooseEffort(effort)
    setIsRolling(true)
    audioManager.playDiceRattle()
    state.performRoll()
  }, [state])

  // Play crowd reaction sounds based on the current lastResult
  const playResultSound = useCallback(() => {
    const result = useGameStore.getState().lastResult
    if (!result) return
    const st = result.specialType
    if (st === 'FOUL' || st === 'FS' || st === 'FS?') {
      audioManager.playWhistle()
      if (st === 'FOUL') setTimeout(() => audioManager.playCrowdGroan(), 300)
    } else if (st && st.startsWith('INJ')) {
      audioManager.playCrowdGasp()
    } else if (st === 'NG') {
      audioManager.playCrowdGroan()
    } else if (!result.isSpecial) {
      audioManager.playCrowdCheer()
    }
  }, [])

  const handleRollComplete = useCallback(() => {
    setIsRolling(false)
    const s = useGameStore.getState()
    const currentEventId = EVENTS[s.currentEventIndex]?.id
    const currentEventType = EVENTS[s.currentEventIndex]?.type

    if (currentEventType === 'multi_segment') {
      // ms roll complete — dice animation done, no further action needed
      return
    }
    if (currentEventId === 'long_jump') {
      // Foul → no animation (lastResult is null), play sound immediately
      if (s.lastResult?.isSpecial) {
        playResultSound()
      }
      setJumpTrigger(t => t + 1)
    } else if (currentEventId === 'shot_put' || currentEventId === 'discus' || currentEventId === 'javelin') {
      const isFoul = s.lastResult?.isSpecial ?? false
      if (isFoul) {
        // Fouls skip the flying animation — play sound immediately
        playResultSound()
      }
      setThrowLanded(isFoul)
      setRunwayDone(currentEventId !== 'javelin') // javelin waits for runway
      setThrowTrigger(t => t + 1)
    } else if (currentEventType === 'height') {
      if (s.lastResult?.numericValue == null) {
        // Special result (FOUL, etc.) — no jump animation, play sound immediately
        playResultSound()
        setJumpAnimDone(true)
      } else {
        setHeightJumpTrigger(t => t + 1)
      }
    }
  }, [playResultSound])

  const handleAdvance = useCallback(() => {
    setChosenEffort(null)
    setMsDisplayPlayerIndex(null)
    state.advanceGame()
  }, [state])

  const handleRaceComplete = useCallback(() => {
    setRaceComplete(true)
    audioManager.playCrowdCheer()
  }, [])

  // Multi-segment handlers
  const handleMsEffortSelect = useCallback((effort: EffortType) => {
    setChosenEffort(effort)
    state.msChooseEffort(effort)
  }, [state])

  const handleMsRoll = useCallback(() => {
    const s = useGameStore.getState()
    setMsDisplayPlayerIndex(s.msRollingPlayerIndex)
    setIsRolling(true)
    audioManager.playDiceRattle()
    s.msPerformRoll()
  }, [])

  const handleMsRollComplete = useCallback(() => {
    setIsRolling(false)
    const s = useGameStore.getState()

    if (s.phase === 'msRolling') {
      setAwaitingMsContinue(true)
    } else {
      // Last player rolled → phase moved to msAnimating, clear override
      setMsDisplayPlayerIndex(null)
    }
  }, [])

  const handleMsAnimationComplete = useCallback(() => {
    playResultSound()
    state.msAnimationComplete()
  }, [state, playResultSound])

  const handleInjuryReroll = useCallback(() => {
    setIsRolling(true)
    audioManager.playDiceRattle()
    state.injuryReroll()
  }, [state])

  if (!event || !player || !athlete) return null

  const currentResult = player.eventResults.find(r => r.eventId === event.id)
  const isChoosingEffort = state.phase === 'choosingEffort'
  const isMsEffortPicking = state.phase === 'msEffortPicking'
  const isMsRolling = state.phase === 'msRolling'
  const isMsAnimating = state.phase === 'msAnimating'
  const isMsSplitReview = state.phase === 'msSplitReview'
  const hasResult = state.phase === 'showingResult' || state.phase === 'eventComplete'

  // Determine attempt display
  let attemptDisplay = ''
  if (event.type === 'field_throw' || event.type === 'field_jump') {
    attemptDisplay = `Attempt ${state.currentAttempt + 1} of 3`
  } else if (event.type === 'multi_segment') {
    if (isMsEffortPicking) {
      attemptDisplay = `Segment ${state.currentSegment + 1} — Pick Effort`
    } else if (isMsRolling) {
      attemptDisplay = `Segment ${state.currentSegment + 1} — Rolling`
    } else if (isMsAnimating) {
      attemptDisplay = `Segment ${state.currentSegment + 1} — Racing`
    } else if (isMsSplitReview) {
      attemptDisplay = `Segment ${state.currentSegment + 1} of ${event.segments} — Complete`
    } else {
      attemptDisplay = `Segment ${state.currentSegment + 1} of ${event.segments}`
    }
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

  // For throwing/height events, delay showing advance/result until the animation finishes
  const throwAnimDone = !isThrowingField || throwLanded
  const heightAnimDone = !isHeight || jumpAnimDone
  const animDone = throwAnimDone && heightAnimDone
  const showAdvance = (hasResult || isMsSplitReview) && !isRolling && !sprintWaitingForRace && !sprintRaceInProgress && animDone
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

  const msComplete = isMultiSegment && isMsSplitReview && state.currentSegment + 1 >= (event.segments ?? 0)
  const isEventDone = (
    (isSprint && allPlayersRolled && raceComplete) ||
    isFieldEvent && state.currentAttempt >= 2 && isLastPlayer ||
    msComplete ||
    allHeightPlayersDone ||
    state.phase === 'eventComplete'
  )
  const advanceLabel = isEventDone ? 'Next Event' : 'Continue'

  const lastResultDisplay = state.lastResult?.displayValue ?? ''
  const isSpecial = state.lastResult?.isSpecial ?? false
  const injuryPending = state.injuryRerollPending
  // Don't show result box for height pass/done (no dice rolled)
  // Show result box after a roll completes (including ms rolling/split review phases)
  const msHasRoll = (isMsRolling || isMsSplitReview) && state.lastRoll !== null
  const showResultBox = ((hasResult || msHasRoll || injuryPending !== null) && !isRolling && !(isSprint && raceTriggered) && state.lastRoll !== null)

  return (
    <div className="game-screen">
      <div className="game-header">
        <div className="event-info">
          <span className="event-day">Day {event.day}</span>
          <h2 className="event-name">{event.name}</h2>
          <span className="event-number">Event {event.order} of 10</span>
        </div>
        <div className="header-right">
          <button
            className="mute-btn"
            onClick={() => state.updateSettings({ soundEnabled: !state.settings.soundEnabled })}
            title={state.settings.soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          >
            {state.settings.soundEnabled ? '\u{1F50A}' : '\u{1F507}'}
          </button>
          <button className="scorecard-btn" onClick={() => setShowScorecard(true)}>
            Scorecard
          </button>
          <div className="player-turn">
            <span className="turn-label">Current Player</span>
            <span className="turn-name">{(isMultiSegment && msDisplayPlayerIndex != null ? state.players[msDisplayPlayerIndex]?.name : player.name)}</span>
            <span className="turn-athlete">{(isMultiSegment && msDisplayPlayerIndex != null ? athletes[state.players[msDisplayPlayerIndex]?.athleteId]?.name : athlete.name)}</span>
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

      {/* Throwing field (shot put, discus, javelin) — ms-style layout */}
      {isThrowingField && (<>
        <div className="ms-top-row">
          <div className="ms-chart-side">
            <ChartDisplay
              athlete={athlete}
              eventId={event.id}
              highlightDice={state.lastRoll?.total ?? null}
              highlightEffort={chosenEffort}
            />
          </div>
          <div className="ms-track-side">
            <ThrowingFieldAnimation
              players={state.players}
              currentPlayerIndex={state.currentPlayerIndex}
              eventId={event.id}
              isSpecial={state.lastResult?.isSpecial ?? false}
              showLanding={throwLanded}
              throwTrigger={throwTrigger}
              onRunwayComplete={() => setRunwayDone(true)}
            />
          </div>
          <div className="ms-right-side">
            <div className="ms-scoreboard-side">
              <EventScorecard
                players={state.players}
                event={event}
                currentPlayerIndex={state.currentPlayerIndex}
                heightList={heightList}
                playerMaxHeights={playerMaxHeights}
              />
            </div>
            <div className="ms-controls-side">
              <div className="player-badge" style={{ borderColor: getAthleteGraphic(player.athleteId).color }}>
                {player.name}
              </div>

              {attemptDisplay && (
                <div className="attempt-badge">{attemptDisplay}</div>
              )}

              <DiceDisplay
                roll={state.lastRoll}
                rolling={isRolling}
                onRollComplete={handleRollComplete}
              />

              {showResultBox && throwAnimDone && (
                <div className={`result-display ${isSpecial ? 'special' : 'normal'}`}>
                  <span className="result-label">{injuryPending ? 'INJ Re-Roll' : 'Result'}</span>
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

              {injuryPending && !injuryPending.isMultiSegment && !isRolling && (
                <button className="primary advance-btn" onClick={handleInjuryReroll}>
                  Roll
                </button>
              )}

              {showAdvance && !injuryPending && (
                <button className="primary advance-btn" onClick={handleAdvance}>
                  {advanceLabel}
                </button>
              )}
            </div>
          </div>
        </div>
        {hasResult && !isRolling && !throwLanded && runwayDone && (
          <FieldAnimation
            eventId={event.id}
            result={state.lastResult?.numericValue ?? null}
            isSpecial={isSpecial}
            bestDistance={(() => {
              // Best distance excluding the current player's latest attempt
              // so the yellow line stays at the previous best during the animation
              let best: number | null = null
              const currentP = state.players[state.currentPlayerIndex]
              for (const p of state.players) {
                const er = p.eventResults.find(r => r.eventId === event.id)
                if (!er) continue
                const isCurrentPlayer = p.id === currentP?.id
                if (isCurrentPlayer) {
                  // Use second-best from this player's attempts (exclude latest)
                  const valid = er.attempts.filter(a => !a.isSpecial && a.resolvedResult !== null)
                  const previous = valid.slice(0, -1)
                  for (const a of previous) {
                    if (best === null || a.resolvedResult! > best) best = a.resolvedResult!
                  }
                } else {
                  if (er.bestResult != null) {
                    if (best === null || er.bestResult > best) best = er.bestResult
                  }
                }
              }
              return best
            })()}
            onComplete={() => { setThrowLanded(true); playResultSound() }}
          />
        )}
      </>)}

      {/* Height event (high jump / pole vault) — ms-style layout */}
      {isHeight && (
        <div className="ms-top-row">
          <div className="ms-chart-side">
            <ChartDisplay
              athlete={athlete}
              eventId={event.id}
              highlightDice={state.lastRoll?.total ?? null}
              highlightEffort={chosenEffort}
            />
          </div>
          <div className="ms-track-side">
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
              onJumpComplete={() => { setJumpAnimDone(true); playResultSound() }}
            />
          </div>
          <div className="ms-right-side">
            <div className="ms-scoreboard-side">
              <EventScorecard
                players={state.players}
                event={event}
                currentPlayerIndex={state.currentPlayerIndex}
                heightList={heightList}
                playerMaxHeights={playerMaxHeights}
                hideLatestAttempt={!jumpAnimDone}
              />
            </div>
            <div className="ms-controls-side">
              <div className="player-badge" style={{ borderColor: getAthleteGraphic(player.athleteId).color }}>
                {player.name}
              </div>

              {(() => {
                const heightAttempts = currentResult?.heightProgression?.reduce(
                  (sum, h) => sum + h.attempts.filter(a => a === 'O' || a === 'X').length, 0
                ) ?? 0
                const fatigued = heightAttempts >= FATIGUE_THRESHOLD
                return (
                  <div className={`height-fatigue ${fatigued ? 'active' : ''}`}>
                    Attempts: {heightAttempts}
                    {fatigued && <span className="fatigue-warn"> (+1 SP fatigue)</span>}
                  </div>
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

              {showResultBox && jumpAnimDone && (
                <div className={`result-display ${isSpecial ? 'special' : 'normal'}`}>
                  <span className="result-label">{injuryPending ? 'INJ Re-Roll' : 'Result'}</span>
                  <span className="result-value">{lastResultDisplay}</span>
                  {currentResult && currentResult.points > 0 && isEventDone && (
                    <span className="result-points">{currentResult.points} pts</span>
                  )}
                </div>
              )}

              {isChoosingEffort && heightAction === 'choosing' && (
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

              {isChoosingEffort && heightAction === 'confirming-done' && (() => {
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

              {isChoosingEffort && heightAction === 'attempting' && (
                <EffortSelector
                  onSelect={handleEffortSelect}
                  disabled={isRolling}
                  injuryInEffect={injuryActive}
                  staminaRemaining={stamina}
                  allOutCost={allOutCost}
                />
              )}

              {injuryPending && !injuryPending.isMultiSegment && !isRolling && (
                <button className="primary advance-btn" onClick={handleInjuryReroll}>
                  Roll
                </button>
              )}

              {showAdvance && !injuryPending && (
                <button className="primary advance-btn" onClick={handleAdvance}>
                  {advanceLabel}
                </button>
              )}
            </div>
          </div>
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
            onLandingComplete={playResultSound}
          />
        </div>
      )}

      {/* Oval track for multi-segment events (400m, 1500m) */}
      {isMultiSegment && (() => {
        const msPlayerIdx = msDisplayPlayerIndex ?? state.currentPlayerIndex
        const msPlayer = state.players[msPlayerIdx]
        const msAthlete = msPlayer ? athletes[msPlayer.athleteId] : null
        if (!msPlayer || !msAthlete) return null
        const msStamina = event.day === 1 ? msPlayer.staminaDay1 : msPlayer.staminaDay2
        const msInjuryActive = msPlayer.injuryInEffect !== null
        return (
          <div className="ms-layout">
            <div className="ms-top-row">
              <div className="ms-chart-side">
                <ChartDisplay
                  athlete={msAthlete}
                  eventId={event.id}
                  highlightDice={msDisplayPlayerIndex != null ? (state.lastRoll?.total ?? null) : null}
                  highlightEffort={msDisplayPlayerIndex != null ? chosenEffort : null}
                />
              </div>
              <div className="ms-track-side">
                <OvalTrackAnimation
                  players={state.players}
                  eventId={event.id}
                  currentSegment={state.currentSegment}
                  totalSegments={event.segments ?? 4}
                  phase={state.phase}
                  pendingTimes={Object.fromEntries(
                    Object.entries(state.msSegmentRolls).map(([k, v]) => [k, v.time])
                  )}
                  onAnimationComplete={handleMsAnimationComplete}
                />
              </div>
              <div className="ms-controls-side">
                <div className="player-badge" style={{ borderColor: getAthleteGraphic(msPlayer.athleteId).color }}>
                  {msPlayer.name}
                </div>

                {attemptDisplay && (
                  <div className="attempt-badge">{attemptDisplay}</div>
                )}

                <DiceDisplay
                  roll={state.lastRoll}
                  rolling={isRolling}
                  onRollComplete={handleMsRollComplete}
                />

                {isMsEffortPicking && (
                  <EffortSelector
                    onSelect={handleMsEffortSelect}
                    disabled={false}
                    injuryInEffect={msInjuryActive}
                    staminaRemaining={msStamina}
                    allOutCost={allOutCost}
                  />
                )}

                {showResultBox && (
                  <div className={`result-display ${isSpecial ? 'special' : 'normal'}`}>
                    <span className="result-label">{injuryPending ? 'INJ Re-Roll' : 'Result'}</span>
                    <span className="result-value">{lastResultDisplay}</span>
                    {currentResult && currentResult.points > 0 && isEventDone && (
                      <span className="result-points">{currentResult.points} pts</span>
                    )}
                  </div>
                )}

                {isMsAnimating && (
                  <div className="ms-animating-label">Racing...</div>
                )}

                {injuryPending?.isMultiSegment && !isRolling && (
                  <button className="primary advance-btn" onClick={handleInjuryReroll}>
                    Roll
                  </button>
                )}

                {!injuryPending && awaitingMsContinue && isMsRolling && !isRolling && (
                  <button className="primary advance-btn" onClick={() => {
                    setAwaitingMsContinue(false)
                    setMsDisplayPlayerIndex(null)
                  }}>
                    Continue
                  </button>
                )}

                {!injuryPending && !awaitingMsContinue && isMsRolling && state.msRollingPlayerIndex === state.currentPlayerIndex && !isRolling && (
                  <button className="primary advance-btn" onClick={handleMsRoll}>
                    Roll
                  </button>
                )}

                {showAdvance && !injuryPending && (
                  <button className="primary advance-btn" onClick={handleAdvance}>
                    {advanceLabel}
                  </button>
                )}
              </div>
            </div>
            <div className="ms-bottom-row">
              <SplitScoreboard
                players={state.players}
                event={event}
                currentPlayerIndex={state.currentPlayerIndex}
                currentSegment={state.currentSegment}
                phase={state.phase}
              />
            </div>
          </div>
        )
      })()}

      {!isMultiSegment && !isThrowingField && !isHeight && (
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
            <div className="player-badge" style={{ borderColor: getAthleteGraphic(player.athleteId).color }}>
              {player.name}
            </div>

            {attemptDisplay && (
              <div className="attempt-badge">{attemptDisplay}</div>
            )}

            <DiceDisplay
              roll={state.lastRoll}
              rolling={isRolling}
              onRollComplete={handleRollComplete}
            />

            {showResultBox && (
              <div className={`result-display ${isSpecial ? 'special' : 'normal'}`}>
                <span className="result-label">{injuryPending ? 'INJ Re-Roll' : 'Result'}</span>
                <span className="result-value">{lastResultDisplay}</span>
                {currentResult && currentResult.points > 0 && isEventDone && (
                  <span className="result-points">{currentResult.points} pts</span>
                )}
              </div>
            )}

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

            {injuryPending && !injuryPending.isMultiSegment && !isRolling && (
              <button className="primary advance-btn" onClick={handleInjuryReroll}>
                Roll
              </button>
            )}

            {showAdvance && !injuryPending && (
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
      )}

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
