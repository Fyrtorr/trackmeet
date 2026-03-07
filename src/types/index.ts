// ── Dice ──

export interface DiceRoll {
  black: number;       // face value from black die (1, 2, or 3)
  whiteA: number;      // face value from white die A (0-5)
  whiteB: number;      // face value from white die B (0-4)
  total: number;       // black * 10 + whiteA + whiteB (range 10-39)
}

// ── Effort ──

export type EffortType = 'safe' | 'avg' | 'allout';

// ── Chart Result ──

export type SpecialResult = 'FS' | 'FS?' | 'INJ 1' | 'INJ 2' | 'NG' | 'FOUL';

export interface ChartLookupResult {
  raw: string | number | null;       // raw value from the chart cell
  isSpecial: boolean;
  specialType?: SpecialResult;
  numericValue?: number;             // parsed numeric result (time, distance, height)
  displayValue: string;             // formatted for display
}

// ── Events ──

export type EventType = 'sprint' | 'field_throw' | 'field_jump' | 'height' | 'multi_segment';

export interface EventDefinition {
  id: string;
  name: string;
  day: 1 | 2;
  order: number;                    // 1-10
  type: EventType;
  segments?: number;                // 4 for 400m, 5 for 1500m
  allOutStaminaCost: number;        // 1 for most, 3 for 1500m
  resultUnit: 'seconds' | 'feet_inches' | 'feet';
  scoringDirection: 'lower_better' | 'higher_better';
}

// ── Athlete ──

export interface AthleteData {
  id: string;
  name: string;
  bio: {
    nation: string;
    height: string;
    weight: string;
  };
  handicap: number | null;
  abilities: Record<string, string>;   // event_id -> "Poor" | "Fair" | "Good" | "Excellent"
  hjSuccessRates: Record<string, number>;
  pvSuccessRates: Record<string, number>;
  events: Record<string, EventChart>;  // event_id -> chart
}

export type EventChart = Record<string, ChartCell>;  // dice total (string) -> cell

export interface ChartCell {
  safe: string | number | null;
  avg: string | number | null;
  allout: string | number | null;
}

// ── Scoring ──

export interface ScoringParams {
  A: number;
  B: number;
  C: number;
  type: 'track' | 'field';
  unit: 'seconds' | 'meters' | 'centimeters';
}

// ── Player State ──

export interface PlayerState {
  id: number;
  name: string;
  athleteId: string;
  staminaDay1: number;
  staminaDay2: number;
  injuryPoints: number;
  injuryInEffect: InjuryEffect | null;
  falseStarts: number;                  // for current event
  consecutiveFouls: number;             // for current event
  eventResults: EventResult[];
  totalPoints: number;
  eliminated: boolean;
  eliminationReason?: string;
}

export interface InjuryEffect {
  type: 'INJ1' | 'INJ2';
  expiresAfterEventOrder: number;       // event order # when injury expires
}

export interface EventResult {
  eventId: string;
  attempts: AttemptResult[];
  bestResult: number | null;            // best numeric result
  bestResultDisplay: string;
  points: number;
  segments?: SegmentResult[];           // for 400m / 1500m
  heightProgression?: HeightAttempt[];  // for HJ / PV
}

export interface AttemptResult {
  effort: EffortType;
  diceRoll: DiceRoll;
  rawResult: string | number | null;
  resolvedResult: number | null;        // after injury re-roll if needed
  displayResult: string;
  isSpecial: boolean;
  specialType?: SpecialResult;
  staminaSpent: number;
}

export interface SegmentResult {
  segmentNumber: number;
  effort: EffortType;
  diceRoll: DiceRoll;
  time: number;
  staminaSpent: number;
}

export interface HeightAttempt {
  height: string;
  attempts: ('O' | 'X' | '-')[];
  cleared: boolean;
}

// ── Game State ──

export type GamePhase =
  | 'setup'
  | 'choosingEffort'
  | 'rolling'
  | 'showingResult'
  | 'eventComplete'
  | 'dayBreak'
  | 'finished';

export interface GameSettings {
  scoringMode: 'classic' | 'quick';
  units: 'imperial' | 'metric' | 'both';
  handicapEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  autoRollDelay: number | null;        // ms, null = off
  autoAdvanceDelay: number | null;     // ms, null = off
}

export interface GameState {
  phase: GamePhase;
  settings: GameSettings;
  players: PlayerState[];
  currentPlayerIndex: number;
  currentEventIndex: number;           // 0-9
  currentAttempt: number;              // 0-based
  currentSegment: number;              // for multi-segment events
  lastRoll: DiceRoll | null;
  lastResult: ChartLookupResult | null;
}
