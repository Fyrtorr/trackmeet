import { useEffect, useState, useRef } from 'react'
import type { PlayerState } from '../../types'
import { getAthleteGraphic } from '../../data/athleteGraphics'
import { audioManager } from '../../audio/audioManager'
import './RaceTrack.css'

interface RaceTrackProps {
  players: PlayerState[]
  eventId: string
  triggerRace: boolean
  onRaceComplete: () => void
}

const TOTAL_LANES = 8

export function RaceTrack({ players, eventId, triggerRace, onRaceComplete }: RaceTrackProps) {
  const [racePhase, setRacePhase] = useState<'blocks' | 'set' | 'racing' | 'finished'>('blocks')
  const raceStartedRef = useRef(false)
  const onRaceCompleteRef = useRef(onRaceComplete)
  onRaceCompleteRef.current = onRaceComplete

  // Assign lanes — center the players
  const startLane = Math.floor((TOTAL_LANES - players.length) / 2)

  // Get each player's time and athlete graphic for this event
  const runnerData = players.map((p, i) => {
    const result = p.eventResults.find(r => r.eventId === eventId)
    const time = result?.bestResult ?? null
    const display = result?.bestResultDisplay ?? ''
    const isDQ = display.startsWith('DQ')
    const graphic = getAthleteGraphic(p.athleteId)
    return {
      player: p,
      lane: startLane + i,
      graphic,
      time,
      display,
      isDQ,
    }
  })

  // Find the fastest and slowest times for proportional animation
  const validTimes = runnerData.filter(r => r.time !== null && !r.isDQ).map(r => r.time!)
  const fastestTime = validTimes.length > 0 ? Math.min(...validTimes) : 11
  const slowestTime = validTimes.length > 0 ? Math.max(...validTimes) : 11

  // Base animation duration for the fastest runner (seconds)
  const BASE_RACE_DURATION = 3.5

  function getRunnerDuration(time: number | null, isDQ: boolean): number {
    if (time === null || isDQ) return BASE_RACE_DURATION * 1.15 // DQ runners lag behind
    return BASE_RACE_DURATION * (time / fastestTime)
  }

  // Trigger race sequence
  useEffect(() => {
    if (!triggerRace || raceStartedRef.current) return
    raceStartedRef.current = true

    // "Set" phase — brief pause
    setRacePhase('set')

    const gunTimer = setTimeout(() => {
      audioManager.playGunshot()
      setRacePhase('racing')
    }, 800)

    // Race ends when slowest runner finishes
    const maxDuration = slowestTime === fastestTime
      ? BASE_RACE_DURATION
      : BASE_RACE_DURATION * (slowestTime / fastestTime)
    const finishTimer = setTimeout(() => {
      setRacePhase('finished')
      onRaceCompleteRef.current()
    }, 800 + maxDuration * 1000 + 400) // +400ms buffer after slowest finishes

    return () => {
      clearTimeout(gunTimer)
      clearTimeout(finishTimer)
    }
  }, [triggerRace, fastestTime, slowestTime])

  // Reset when event changes
  useEffect(() => {
    raceStartedRef.current = false
    setRacePhase('blocks')
  }, [eventId])

  return (
    <div className="race-track">
      {/* Lane numbers and surface */}
      {Array.from({ length: TOTAL_LANES }, (_, i) => (
        <div key={i} className="race-lane">
          <span className="lane-number">{i + 1}</span>
          <div className="lane-surface" />
        </div>
      ))}

      {/* Start line */}
      <div className="race-start-line" />

      {/* Finish line */}
      <div className="race-finish-line" />

      {/* Runners */}
      {runnerData.map((runner) => {
        const duration = getRunnerDuration(runner.time, runner.isDQ)
        const laneTop = (runner.lane / TOTAL_LANES) * 100
        const laneHeight = 100 / TOTAL_LANES

        return (
          <div
            key={runner.player.id}
            className={`race-runner ${racePhase}`}
            style={{
              top: `${laneTop + laneHeight * 0.15}%`,
              height: `${laneHeight * 0.7}%`,
              '--race-duration': `${duration}s`,
            } as React.CSSProperties}
          >
            <div className="runner-icon">
              <span className="runner-figure">{runner.graphic.runnerIcon}</span>
            </div>

            {/* Name tag at start */}
            {(racePhase === 'blocks' || racePhase === 'set') && (
              <div className="runner-name-tag" style={{ background: runner.graphic.color }}>
                {runner.player.name}
              </div>
            )}

            {/* Time display after finish */}
            {racePhase === 'finished' && (
              <div className="runner-time-tag">
                {runner.isDQ ? 'DQ' : runner.display ? runner.display + 's' : '—'}
              </div>
            )}
          </div>
        )
      })}

      {/* "SET" indicator */}
      {racePhase === 'set' && (
        <div className="race-overlay-text set">SET</div>
      )}
    </div>
  )
}
