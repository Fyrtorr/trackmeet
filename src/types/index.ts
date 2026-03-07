export interface Player {
  id: number;
  name: string;
  scores: EventScore[];
  totalScore: number;
}

export interface EventScore {
  eventId: string;
  attempts: number[];
  finalScore: number;
}

export interface DecathlonEvent {
  id: string;
  name: string;
  attemptsAllowed: number;
  chart: EventChart;
}

export interface EventChart {
  columns: number[];       // dice values for column headers
  rows: EventChartRow[];
}

export interface EventChartRow {
  label: string;           // row label (e.g., skill level or attempt)
  results: Record<number, number | string>;  // dice value -> outcome
}

export interface DiceRoll {
  dice1: number;
  dice2: number;
  total: number;
}

export type GamePhase = 'setup' | 'playing' | 'eventResult' | 'finished';

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  currentEventIndex: number;
  currentAttempt: number;
  phase: GamePhase;
  lastRoll: DiceRoll | null;
}
