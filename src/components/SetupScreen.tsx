import { useState } from 'react'
import { useGameStore } from '../game/store'
import athleteData from '../data/athletes.json'
import './SetupScreen.css'

const athletes = Object.values(athleteData) as Array<{
  id: string; name: string;
  bio: { nation: string; height: string; weight: string };
  handicap: number | null;
  abilities: Record<string, string>;
}>

export function SetupScreen() {
  const { players, addPlayer, removePlayer, startGame } = useGameStore()
  const [playerName, setPlayerName] = useState('')
  const [selectedAthlete, setSelectedAthlete] = useState(athletes[0]?.id ?? '')

  const usedAthletes = players.map(p => p.athleteId)
  const availableAthletes = athletes.filter(a => !usedAthletes.includes(a.id))

  function handleAddPlayer() {
    if (!playerName.trim() || !selectedAthlete) return
    addPlayer(playerName.trim(), selectedAthlete)
    setPlayerName('')
    const next = athletes.find(a => !usedAthletes.includes(a.id) && a.id !== selectedAthlete)
    if (next) setSelectedAthlete(next.id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleAddPlayer()
  }

  const selectedAthleteData = athletes.find(a => a.id === selectedAthlete)
  const canStart = players.length >= 1

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <h1>TRACK MEET</h1>
        <p className="subtitle">DIGITAL DECATHLON</p>
      </div>

      <div className="setup-content">
        <div className="setup-left">
          <h2>Add Players</h2>

          <div className="add-player-form">
            <input
              type="text"
              placeholder="Player name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={20}
            />
            <select
              value={selectedAthlete}
              onChange={(e) => setSelectedAthlete(e.target.value)}
            >
              {availableAthletes.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              onClick={handleAddPlayer}
              disabled={!playerName.trim() || availableAthletes.length === 0}
            >
              Add
            </button>
          </div>

          <div className="player-list">
            {players.map(p => {
              const ath = athletes.find(a => a.id === p.athleteId)
              return (
                <div key={p.id} className="player-card">
                  <div className="player-info">
                    <span className="player-name">{p.name}</span>
                    <span className="athlete-name">{ath?.name}</span>
                  </div>
                  <button className="remove-btn" onClick={() => removePlayer(p.id)}>×</button>
                </div>
              )
            })}
            {players.length === 0 && (
              <p className="empty-hint">Add at least one player to begin</p>
            )}
          </div>

          <button
            className="primary start-btn"
            onClick={startGame}
            disabled={!canStart}
          >
            Start Decathlon
          </button>
        </div>

        <div className="setup-right">
          {selectedAthleteData && (
            <div className="athlete-preview">
              <h3>{selectedAthleteData.name}</h3>
              <div className="bio-grid">
                <span className="label">Nation</span>
                <span>{selectedAthleteData.bio.nation}</span>
                <span className="label">Height</span>
                <span>{selectedAthleteData.bio.height}</span>
                <span className="label">Weight</span>
                <span>{selectedAthleteData.bio.weight}</span>
                {selectedAthleteData.handicap !== null && (
                  <>
                    <span className="label">Handicap</span>
                    <span>{selectedAthleteData.handicap > 0 ? '+' : ''}{selectedAthleteData.handicap}</span>
                  </>
                )}
              </div>
              <h4>Abilities</h4>
              <div className="abilities-grid">
                {Object.entries(selectedAthleteData.abilities).map(([event, rating]) => (
                  <div key={event} className="ability-row">
                    <span className="event-name">{event.replace(/_/g, ' ')}</span>
                    <span className={`rating rating-${rating.toLowerCase()}`}>{rating || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
