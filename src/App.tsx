import { useGameStore } from './game/store'
import { SetupScreen } from './components/SetupScreen'
import { GameScreen } from './components/GameScreen'
import { DayBreakScreen } from './components/DayBreakScreen'
import { FinishedScreen } from './components/FinishedScreen'
import './App.css'

function App() {
  const phase = useGameStore((s) => s.phase)

  if (phase === 'setup') return <SetupScreen />
  if (phase === 'dayBreak') return <DayBreakScreen />
  if (phase === 'finished') return <FinishedScreen />
  return <GameScreen />
}

export default App
