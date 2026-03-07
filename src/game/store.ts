import { create } from 'zustand';
import type {
  GameState, GameSettings, PlayerState,
  EffortType, EventResult,
  AttemptResult, InjuryEffect,
} from '../types';
import { EVENTS, STAMINA_PER_DAY, MAX_INJURY_POINTS, FATIGUE_THRESHOLD, MAX_FALSE_STARTS, MAX_CONSECUTIVE_FOULS, HIGH_JUMP_HEIGHTS, POLE_VAULT_HEIGHTS, generateHighJumpHeights } from '../data/events';
import { rollDice } from './dice';
import { lookupChart, isBetterResult, clearsHeight, parseFeetInches } from './chartLookup';
import { calculatePoints } from './scoring';
import athleteData from '../data/athletes.json';

const athletes = athleteData as Record<string, import('../types').AthleteData>;

const DEFAULT_SETTINGS: GameSettings = {
  scoringMode: 'quick',
  units: 'imperial',
  handicapEnabled: false,
  soundEnabled: true,
  soundVolume: 0.7,
  autoRollDelay: null,
  autoAdvanceDelay: null,
};

const initialState: GameState = {
  phase: 'setup',
  settings: DEFAULT_SETTINGS,
  players: [],
  currentPlayerIndex: 0,
  currentEventIndex: 0,
  currentAttempt: 0,
  currentSegment: 0,
  currentHeightIndex: 0,
  lastRoll: null,
  lastResult: null,
};

function getCurrentStamina(player: PlayerState, day: 1 | 2): number {
  return day === 1 ? player.staminaDay1 : player.staminaDay2;
}

function getStaminaCost(
  effort: EffortType,
  event: typeof EVENTS[number],
  player: PlayerState,
  totalAttemptsHJ?: number,
): number {
  let cost = 0;

  const injured = player.injuryInEffect !== null;

  if (injured) {
    // Errata injury rules
    if (event.id === '1500m') {
      if (effort === 'avg') cost = 3;
      else if (effort === 'allout') cost = 6;
    } else {
      if (effort === 'avg') cost = 1;
      else if (effort === 'allout') cost = 2;
    }
  } else {
    if (effort === 'allout') cost = event.allOutStaminaCost;
  }

  // HJ/PV fatigue: past 7th attempt costs 1 extra
  if (event.type === 'height' && totalAttemptsHJ !== undefined && totalAttemptsHJ >= FATIGUE_THRESHOLD) {
    cost += 1;
  }

  return cost;
}

function createPlayer(id: number, name: string, athleteId: string): PlayerState {
  return {
    id,
    name,
    athleteId,
    staminaDay1: STAMINA_PER_DAY,
    staminaDay2: STAMINA_PER_DAY,
    injuryPoints: 0,
    injuryInEffect: null,
    falseStarts: 0,
    consecutiveFouls: 0,
    eventResults: [],
    totalPoints: 0,
    eliminated: false,
  };
}

function getCurrentEvent(state: GameState) {
  return EVENTS[state.currentEventIndex];
}

function getPlayerAthlete(player: PlayerState) {
  return athletes[player.athleteId];
}

// Count total attempts in the current HJ/PV event for fatigue
function countHeightAttempts(eventResult: EventResult | undefined): number {
  if (!eventResult?.heightProgression) return 0;
  return eventResult.heightProgression.reduce(
    (sum, h) => sum + h.attempts.filter(a => a === 'O' || a === 'X').length, 0
  );
}

// Count consecutive misses (X) across heights — passes don't reset, clears do
function countConsecutiveMisses(eventResult: EventResult | undefined): number {
  if (!eventResult?.heightProgression) return 0;
  let misses = 0;
  // Walk all attempts in order across all heights
  for (const hp of eventResult.heightProgression) {
    for (const a of hp.attempts) {
      if (a === 'X') misses++;
      else if (a === 'O') misses = 0;
      // 'P' and '-' don't affect miss count
    }
  }
  return misses;
}

// Get the height list for an event, dynamically extended for the athletes in play
function getHeightList(eventId: string, players?: PlayerState[]): string[] {
  if (eventId === 'pole_vault') return POLE_VAULT_HEIGHTS;

  if (!players || players.length === 0) return HIGH_JUMP_HEIGHTS;

  // Find the max possible high jump result across all players' charts
  let maxInches = 87; // default 7'3" = 87 inches
  for (const p of players) {
    const athlete = athletes[p.athleteId];
    if (!athlete) continue;
    const chart = athlete.events['high_jump'];
    if (!chart) continue;
    for (const diceKey of Object.keys(chart)) {
      const cell = chart[diceKey];
      for (const effort of ['safe', 'avg', 'allout'] as const) {
        const val = cell[effort];
        if (typeof val === 'string' && val.includes("'")) {
          const inches = parseFeetInches(val);
          if (inches !== null && inches > maxInches) maxInches = inches;
        }
      }
    }
  }

  return generateHighJumpHeights(maxInches);
}

// Check if a player is done with height event (3 consecutive misses or marked done)
function isPlayerDoneWithHeight(player: PlayerState, eventId: string): boolean {
  const result = player.eventResults.find(r => r.eventId === eventId);
  if (!result) return false;
  if (result.heightDone) return true;
  if (countConsecutiveMisses(result) >= 3) return true;
  return false;
}

interface GameActions {
  // Setup
  updateSettings: (settings: Partial<GameSettings>) => void;
  addPlayer: (name: string, athleteId: string) => void;
  removePlayer: (id: number) => void;
  startGame: (startEventIndex?: number) => void;

  // Gameplay
  chooseEffort: (effort: EffortType) => void;
  performRoll: () => void;
  advanceGame: () => void;

  // HJ/PV specific
  setStartingHeight: (height: string) => void;
  passHeight: () => void;
  doneJumping: () => void;

  // Utility
  resetGame: () => void;
  canAffordEffort: (effort: EffortType) => boolean;
}

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  ...initialState,

  updateSettings: (updates) =>
    set((s) => ({ settings: { ...s.settings, ...updates } })),

  addPlayer: (name, athleteId) =>
    set((s) => ({
      players: [...s.players, createPlayer(Date.now(), name, athleteId)],
    })),

  removePlayer: (id) =>
    set((s) => ({ players: s.players.filter(p => p.id !== id) })),

  startGame: (startEventIndex?: number) =>
    set({
      phase: 'choosingEffort',
      currentPlayerIndex: 0,
      currentEventIndex: startEventIndex ?? 0,
      currentAttempt: 0,
      currentSegment: 0,
      currentHeightIndex: 0,
    }),

  canAffordEffort: (effort) => {
    const state = get();
    const event = getCurrentEvent(state);
    const player = state.players[state.currentPlayerIndex];
    if (!player || !event) return false;

    const currentResult = player.eventResults.find(r => r.eventId === event.id);
    const hjAttempts = event.type === 'height' ? countHeightAttempts(currentResult) : undefined;
    const cost = getStaminaCost(effort, event, player, hjAttempts);
    const stamina = getCurrentStamina(player, event.day);
    return cost <= stamina;
  },

  chooseEffort: (effort) => {
    const state = get();
    const event = getCurrentEvent(state);
    const player = state.players[state.currentPlayerIndex];
    if (!player || !event || state.phase !== 'choosingEffort') return;

    // Validate stamina
    const currentResult = player.eventResults.find(r => r.eventId === event.id);
    const hjAttempts = event.type === 'height' ? countHeightAttempts(currentResult) : undefined;
    const cost = getStaminaCost(effort, event, player, hjAttempts);
    const stamina = getCurrentStamina(player, event.day);
    if (cost > stamina) return;

    // Store chosen effort and move to rolling phase
    set({ phase: 'rolling', _pendingEffort: effort } as any);
  },

  performRoll: () => {
    const state = get();
    if (state.phase !== 'rolling') return;

    const effort: EffortType = (state as any)._pendingEffort;
    if (!effort) return;

    const event = getCurrentEvent(state);
    const playerIndex = state.currentPlayerIndex;
    const player = state.players[playerIndex];
    if (!player || !event) return;

    const athlete = getPlayerAthlete(player);
    if (!athlete) return;

    const dice = rollDice();
    let result = lookupChart(athlete, event.id, effort, dice.total);

    // Handle FS? — only counts as false start in 1st segment of 400m
    if (result.specialType === 'FS?' && event.id === '400m') {
      if (state.currentSegment > 0) {
        // Not first segment, re-roll (FS? is ignored)
        const dice2 = rollDice();
        result = lookupChart(athlete, event.id, effort, dice2.total);
        // Use the re-roll dice for display
        set({ lastRoll: dice2, lastResult: result });
        // Continue with this result (could still be special)
      }
    }

    // Determine stamina cost
    const currentEventResult = player.eventResults.find(r => r.eventId === event.id);
    const hjAttempts = event.type === 'height' ? countHeightAttempts(currentEventResult) : undefined;
    let staminaCost = 0;

    // False starts don't cost stamina
    if (result.specialType === 'FS' || result.specialType === 'FS?') {
      staminaCost = 0;
    } else {
      staminaCost = getStaminaCost(effort, event, player, hjAttempts);
    }

    // Handle INJ results
    let resolvedResult = result;
    if (result.specialType === 'INJ 1' || result.specialType === 'INJ 2') {
      const injPoints = result.specialType === 'INJ 1' ? 1 : 2;
      const injStamina = injPoints; // INJ costs stamina equal to points

      // Re-roll on Safe column
      const reRoll = rollDice();
      resolvedResult = lookupChart(athlete, event.id, 'safe', reRoll.total);

      // Apply injury
      const newInjuryPoints = player.injuryPoints + injPoints;
      const injuryEffect: InjuryEffect = result.specialType === 'INJ 1'
        ? { type: 'INJ1', expiresAfterEventOrder: event.order + 1 }
        : { type: 'INJ2', expiresAfterEventOrder: event.day === 1 ? 5 : 10 };

      // Update player
      const updatedPlayers = [...state.players];
      const updatedPlayer = { ...player };
      updatedPlayer.injuryPoints = newInjuryPoints;
      updatedPlayer.injuryInEffect = injuryEffect;

      // Deduct injury stamina
      if (event.day === 1) {
        updatedPlayer.staminaDay1 -= injStamina;
      } else {
        updatedPlayer.staminaDay2 -= injStamina;
      }

      // Check elimination
      if (newInjuryPoints >= MAX_INJURY_POINTS) {
        updatedPlayer.eliminated = true;
        updatedPlayer.eliminationReason = 'Eliminated due to injury';
      }
      if (getCurrentStamina(updatedPlayer, event.day) < 0) {
        updatedPlayer.eliminated = true;
        updatedPlayer.eliminationReason = 'Eliminated: not enough stamina to cover injury';
      }

      updatedPlayers[playerIndex] = updatedPlayer;
      staminaCost += 0; // injury stamina already deducted above
    }

    // Build attempt result
    const attemptResult: AttemptResult = {
      effort,
      diceRoll: dice,
      rawResult: result.raw,
      resolvedResult: resolvedResult.numericValue ?? null,
      displayResult: resolvedResult.displayValue,
      isSpecial: result.isSpecial,
      specialType: result.specialType,
      staminaSpent: staminaCost,
    };

    // Apply to game state
    const updatedPlayers = [...state.players];
    const updatedPlayer = { ...updatedPlayers[playerIndex] };

    // Deduct stamina (unless already deducted for injury)
    if (!(result.specialType === 'INJ 1' || result.specialType === 'INJ 2')) {
      if (event.day === 1) {
        updatedPlayer.staminaDay1 -= staminaCost;
      } else {
        updatedPlayer.staminaDay2 -= staminaCost;
      }
    }

    // Handle false starts
    if (result.specialType === 'FS' || (result.specialType === 'FS?' && state.currentSegment === 0)) {
      updatedPlayer.falseStarts += 1;
      if (updatedPlayer.falseStarts >= MAX_FALSE_STARTS) {
        // Disqualified for this event
        const eventResult: EventResult = {
          eventId: event.id,
          attempts: [...(updatedPlayer.eventResults.find(r => r.eventId === event.id)?.attempts || []), attemptResult],
          bestResult: null,
          bestResultDisplay: 'DQ - False Start',
          points: 0,
        };
        updatedPlayer.eventResults = [
          ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
          eventResult,
        ];
        updatedPlayers[playerIndex] = updatedPlayer;
        set({
          players: updatedPlayers,
          lastRoll: dice,
          lastResult: resolvedResult,
          phase: 'eventComplete',
        });
        return;
      }
      // Not yet disqualified, go back to choosing effort
      updatedPlayers[playerIndex] = updatedPlayer;
      set({
        players: updatedPlayers,
        lastRoll: dice,
        lastResult: result,
        phase: 'choosingEffort',
      });
      return;
    }

    // Handle fouls
    if (result.specialType === 'FOUL') {
      updatedPlayer.consecutiveFouls += 1;
      const currentER = updatedPlayer.eventResults.find(r => r.eventId === event.id);
      const attempts = [...(currentER?.attempts || []), attemptResult];

      if (updatedPlayer.consecutiveFouls >= MAX_CONSECUTIVE_FOULS) {
        const eventResult: EventResult = {
          eventId: event.id,
          attempts,
          bestResult: null,
          bestResultDisplay: 'DQ - 3 Fouls',
          points: 0,
        };
        updatedPlayer.eventResults = [
          ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
          eventResult,
        ];
        updatedPlayers[playerIndex] = updatedPlayer;
        set({ players: updatedPlayers, lastRoll: dice, lastResult: result, phase: 'eventComplete' });
        return;
      }

      // Foul but still have attempts — show result, advanceGame handles rotation
      updatedPlayer.eventResults = [
        ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
        {
          eventId: event.id,
          attempts,
          bestResult: currentER?.bestResult ?? null,
          bestResultDisplay: currentER?.bestResultDisplay ?? '',
          points: currentER?.points ?? 0,
        },
      ];
      updatedPlayers[playerIndex] = updatedPlayer;
      set({ players: updatedPlayers, lastRoll: dice, lastResult: result, phase: 'showingResult' });
      return;
    }

    // Normal result — clear consecutive fouls
    updatedPlayer.consecutiveFouls = 0;

    // Record the result based on event type
    const numericResult = resolvedResult.numericValue ?? null;
    const displayResult = resolvedResult.displayValue;

    if (event.type === 'sprint') {
      // Single roll events
      const points = numericResult !== null ? calculatePoints(event.id, numericResult) : 0;
      const eventResult: EventResult = {
        eventId: event.id,
        attempts: [attemptResult],
        bestResult: numericResult,
        bestResultDisplay: displayResult,
        points,
      };
      updatedPlayer.eventResults = [
        ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
        eventResult,
      ];
      updatedPlayer.totalPoints = updatedPlayer.eventResults.reduce((sum, r) => sum + r.points, 0);
      updatedPlayers[playerIndex] = updatedPlayer;
      set({ players: updatedPlayers, lastRoll: dice, lastResult: resolvedResult, phase: 'showingResult' });

    } else if (event.type === 'field_throw' || event.type === 'field_jump') {
      // Best of 3 attempts
      const currentER = updatedPlayer.eventResults.find(r => r.eventId === event.id);
      const attempts = [...(currentER?.attempts || []), attemptResult];
      const prevBest = currentER?.bestResult ?? null;
      let bestResult = prevBest;
      let bestDisplay = currentER?.bestResultDisplay ?? '';

      if (numericResult !== null) {
        if (bestResult === null || isBetterResult(numericResult, bestResult, event.scoringDirection)) {
          bestResult = numericResult;
          bestDisplay = displayResult;
        }
      }

      const points = bestResult !== null ? calculatePoints(event.id, bestResult) : 0;
      const eventResult: EventResult = {
        eventId: event.id,
        attempts,
        bestResult,
        bestResultDisplay: bestDisplay,
        points,
      };
      updatedPlayer.eventResults = [
        ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
        eventResult,
      ];
      updatedPlayer.totalPoints = updatedPlayer.eventResults.reduce((sum, r) => sum + r.points, 0);
      updatedPlayers[playerIndex] = updatedPlayer;

      // Don't increment currentAttempt here — advanceGame handles round rotation
      set({ players: updatedPlayers, lastRoll: dice, lastResult: resolvedResult, phase: 'showingResult' });

    } else if (event.type === 'multi_segment') {
      // 400m (4 segments) or 1500m (5 segments)
      const currentER = updatedPlayer.eventResults.find(r => r.eventId === event.id);
      const segments = [...(currentER?.segments || [])];
      segments.push({
        segmentNumber: state.currentSegment + 1,
        effort,
        diceRoll: dice,
        time: numericResult ?? 0,
        staminaSpent: staminaCost,
      });

      const totalSegments = event.segments!;
      const nextSegment = state.currentSegment + 1;
      const isComplete = nextSegment >= totalSegments;

      const totalTime = segments.reduce((sum, seg) => sum + seg.time, 0);
      const roundedTime = Math.round(totalTime * 100) / 100;
      const points = isComplete ? calculatePoints(event.id, roundedTime) : 0;

      const eventResult: EventResult = {
        eventId: event.id,
        attempts: [...(currentER?.attempts || []), attemptResult],
        bestResult: isComplete ? roundedTime : null,
        bestResultDisplay: isComplete ? roundedTime.toFixed(2) : `${roundedTime.toFixed(2)} (${nextSegment}/${totalSegments})`,
        points,
        segments,
      };

      updatedPlayer.eventResults = [
        ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
        eventResult,
      ];
      if (isComplete) {
        updatedPlayer.totalPoints = updatedPlayer.eventResults.reduce((sum, r) => sum + r.points, 0);
      }
      updatedPlayers[playerIndex] = updatedPlayer;

      if (isComplete) {
        set({ players: updatedPlayers, lastRoll: dice, lastResult: resolvedResult, phase: 'showingResult' });
      } else {
        set({ players: updatedPlayers, lastRoll: dice, lastResult: resolvedResult, currentSegment: nextSegment, phase: 'showingResult' });
      }

    } else if (event.type === 'height') {
      // HJ/PV: dice result is a height in inches, compare to current bar
      const heights = getHeightList(event.id, state.players);
      const currentHeight = heights[state.currentHeightIndex];
      if (!currentHeight) return;

      const cleared = clearsHeight(resolvedResult.numericValue ?? 0, currentHeight);
      const currentER = updatedPlayer.eventResults.find(r => r.eventId === event.id);
      const attempts = [...(currentER?.attempts || []), attemptResult];
      const progression = [...(currentER?.heightProgression || [])];

      // Find or create the entry for current height
      let heightEntry = progression.find(h => h.height === currentHeight);
      if (!heightEntry) {
        heightEntry = { height: currentHeight, attempts: [], cleared: false };
        progression.push(heightEntry);
      }

      if (cleared) {
        heightEntry.attempts.push('O');
        heightEntry.cleared = true;

        // Score is based on the bar height (in inches), not the dice result
        const barInches = parseFeetInches(currentHeight) ?? 0;
        const bestPrev = currentER?.bestResult ?? 0;
        const bestResult = Math.max(bestPrev, barInches);
        const bestDisplay = bestResult === barInches ? currentHeight : (currentER?.bestResultDisplay ?? currentHeight);
        const points = calculatePoints(event.id, bestResult);

        const eventResult: EventResult = {
          eventId: event.id,
          attempts,
          bestResult,
          bestResultDisplay: bestDisplay,
          points,
          heightProgression: progression,
        };
        updatedPlayer.eventResults = [
          ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
          eventResult,
        ];
        updatedPlayer.totalPoints = updatedPlayer.eventResults.reduce((sum, r) => sum + r.points, 0);
      } else {
        heightEntry.attempts.push('X');

        const eventResult: EventResult = {
          eventId: event.id,
          attempts,
          bestResult: currentER?.bestResult ?? null,
          bestResultDisplay: currentER?.bestResultDisplay ?? '',
          points: currentER?.points ?? 0,
          heightProgression: progression,
        };
        updatedPlayer.eventResults = [
          ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
          eventResult,
        ];
      }

      updatedPlayers[playerIndex] = updatedPlayer;
      set({ players: updatedPlayers, lastRoll: dice, lastResult: resolvedResult, phase: 'showingResult' });
    }

    updatedPlayers[playerIndex] = updatedPlayer;
  },

  advanceGame: () => {
    const state = get();
    const event = getCurrentEvent(state);
    if (!event) return;

    if (state.phase === 'eventComplete' || state.phase === 'showingResult') {
      const isFieldEvent = event.type === 'field_throw' || event.type === 'field_jump';

      // Field events: round-robin (all players do attempt 1, then 2, then 3)
      if (isFieldEvent) {
        const nextPlayerIndex = state.currentPlayerIndex + 1;
        if (nextPlayerIndex < state.players.length) {
          // Next player, same round
          const nextPlayer = state.players[nextPlayerIndex];
          const updates: Partial<GameState> = {
            currentPlayerIndex: nextPlayerIndex,
            lastRoll: null,
            lastResult: null,
            phase: 'choosingEffort' as const,
          };
          if (nextPlayer.injuryInEffect && event.order >= nextPlayer.injuryInEffect.expiresAfterEventOrder) {
            const updatedPlayers = [...state.players];
            updatedPlayers[nextPlayerIndex] = { ...nextPlayer, injuryInEffect: null };
            set({ ...updates, players: updatedPlayers });
          } else {
            set(updates);
          }
          return;
        }
        // All players done with this round
        const nextAttempt = state.currentAttempt + 1;
        if (nextAttempt < 3) {
          // Next round, back to first player
          set({
            currentAttempt: nextAttempt,
            currentPlayerIndex: 0,
            lastRoll: null,
            lastResult: null,
            phase: 'choosingEffort',
          });
          return;
        }
        // All 3 rounds done — fall through to next event
      }

      // Height events: round-robin with multiple attempts per height
      if (event.type === 'height') {
        const heights = getHeightList(event.id, state.players);
        const currentHeight = heights[state.currentHeightIndex];

        // Check if current player needs more attempts at this height
        // A player is done at this height if they: cleared, passed, or are eliminated
        const currentPlayerResult = state.players[state.currentPlayerIndex].eventResults.find(r => r.eventId === event.id);
        const currentHeightEntry = currentPlayerResult?.heightProgression?.find(h => h.height === currentHeight);
        const clearedCurrent = currentHeightEntry?.cleared ?? false;
        const passed = currentHeightEntry?.attempts.includes('P') ?? false;
        const playerEliminated = isPlayerDoneWithHeight(state.players[state.currentPlayerIndex], event.id);

        // No per-height attempt limit — only 3 consecutive misses (across all heights) eliminates
        const playerDoneAtThisHeight = clearedCurrent || passed || playerEliminated;

        if (!playerDoneAtThisHeight) {
          // Same player, same height — they can attempt again, pass, or stop
          set({ lastRoll: null, lastResult: null, phase: 'choosingEffort' });
          return;
        }

        // Find next player who still needs to act at this height (wraps around)
        const isPlayerDoneAtHeight = (playerIdx: number): boolean => {
          if (isPlayerDoneWithHeight(state.players[playerIdx], event.id)) return true;
          const pr = state.players[playerIdx].eventResults.find(r => r.eventId === event.id);
          const he = pr?.heightProgression?.find(h => h.height === currentHeight);
          if (he?.cleared) return true;
          if (he?.attempts.includes('P')) return true;
          return false;
        };

        const findNextPlayerForHeight = (startAfter: number): number => {
          // Search forward from current player, then wrap around
          for (let offset = 1; offset < state.players.length; offset++) {
            const i = (startAfter + offset) % state.players.length;
            if (!isPlayerDoneAtHeight(i)) return i;
          }
          return -1;
        };

        const nextPlayer = findNextPlayerForHeight(state.currentPlayerIndex);
        if (nextPlayer !== -1) {
          const np = state.players[nextPlayer];
          const updates: Partial<GameState> = {
            currentPlayerIndex: nextPlayer,
            lastRoll: null,
            lastResult: null,
            phase: 'choosingEffort' as const,
          };
          if (np.injuryInEffect && event.order >= np.injuryInEffect.expiresAfterEventOrder) {
            const up = [...state.players];
            up[nextPlayer] = { ...np, injuryInEffect: null };
            set({ ...updates, players: up });
          } else {
            set(updates);
          }
          return;
        }

        // All players done at this height — check if anyone is still active
        const activePlayers = state.players.filter(p => !isPlayerDoneWithHeight(p, event.id));
        if (activePlayers.length > 0) {
          // Move bar up
          const nextHeightIndex = state.currentHeightIndex + 1;
          if (nextHeightIndex < heights.length) {
            let firstActive = -1;
            for (let i = 0; i < state.players.length; i++) {
              if (!isPlayerDoneWithHeight(state.players[i], event.id)) {
                firstActive = i;
                break;
              }
            }
            if (firstActive !== -1) {
              set({
                currentHeightIndex: nextHeightIndex,
                currentPlayerIndex: firstActive,
                lastRoll: null,
                lastResult: null,
                phase: 'choosingEffort',
              });
              return;
            }
          }
        }
        // All done or no more heights — fall through to next event
      }

      // For multi-segment not yet complete
      if (event.type === 'multi_segment' && state.currentSegment < event.segments!) {
        set({ phase: 'choosingEffort' });
        return;
      }

      // Non-field, non-height events: move to next player
      if (!isFieldEvent && event.type !== 'height') {
        const nextPlayerIndex = state.currentPlayerIndex + 1;
        if (nextPlayerIndex < state.players.length) {
          const nextPlayer = state.players[nextPlayerIndex];
          if (nextPlayer.injuryInEffect && event.order >= nextPlayer.injuryInEffect.expiresAfterEventOrder) {
            const updatedPlayers = [...state.players];
            updatedPlayers[nextPlayerIndex] = { ...nextPlayer, injuryInEffect: null };
            set({
              players: updatedPlayers,
              currentPlayerIndex: nextPlayerIndex,
              currentAttempt: 0,
              currentSegment: 0,
              lastRoll: null,
              lastResult: null,
              phase: 'choosingEffort',
            });
          } else {
            set({
              currentPlayerIndex: nextPlayerIndex,
              currentAttempt: 0,
              currentSegment: 0,
              lastRoll: null,
              lastResult: null,
              phase: 'choosingEffort',
            });
          }
          // Reset per-event counters for next player
          const updatedPlayers = [...get().players];
          updatedPlayers[get().currentPlayerIndex] = {
            ...updatedPlayers[get().currentPlayerIndex],
            falseStarts: 0,
            consecutiveFouls: 0,
          };
          set({ players: updatedPlayers });
          return;
        }
      }

      // All players done with this event — move to next event
      const nextEventIndex = state.currentEventIndex + 1;

      if (nextEventIndex >= EVENTS.length) {
        // Game over
        set({ phase: 'finished' });
        return;
      }

      // Check for day break (event 5 → event 6)
      const nextEvent = EVENTS[nextEventIndex];
      const currentDay = event.day;
      const nextDay = nextEvent.day;

      // Reset per-event counters for all players & check injury expiry
      const updatedPlayers = state.players.map(p => {
        const updated = { ...p, falseStarts: 0, consecutiveFouls: 0 };
        // Check injury expiry
        if (updated.injuryInEffect && nextEvent.order > updated.injuryInEffect.expiresAfterEventOrder) {
          updated.injuryInEffect = null;
        }
        return updated;
      });

      if (currentDay !== nextDay) {
        set({
          players: updatedPlayers,
          currentEventIndex: nextEventIndex,
          currentPlayerIndex: 0,
          currentAttempt: 0,
          currentSegment: 0,
          currentHeightIndex: 0,
          lastRoll: null,
          lastResult: null,
          phase: 'dayBreak',
        });
      } else {
        set({
          players: updatedPlayers,
          currentEventIndex: nextEventIndex,
          currentPlayerIndex: 0,
          currentAttempt: 0,
          currentSegment: 0,
          currentHeightIndex: 0,
          lastRoll: null,
          lastResult: null,
          phase: 'choosingEffort',
        });
      }
    }
  },

  setStartingHeight: (_height) => {
    // HJ/PV: set starting height (managed by UI state mostly)
  },

  passHeight: () => {
    const state = get();
    const event = getCurrentEvent(state);
    const player = state.players[state.currentPlayerIndex];
    if (!event || !player || event.type !== 'height') return;

    const heights = getHeightList(event.id, state.players);
    const currentHeight = heights[state.currentHeightIndex];
    if (!currentHeight) return;

    const updatedPlayers = [...state.players];
    const updatedPlayer = { ...player };
    const currentER = updatedPlayer.eventResults.find(r => r.eventId === event.id);
    const progression = [...(currentER?.heightProgression || [])];

    // Find or create entry for current height and mark 'P'
    let heightEntry = progression.find(h => h.height === currentHeight);
    if (!heightEntry) {
      heightEntry = { height: currentHeight, attempts: [], cleared: false };
      progression.push(heightEntry);
    }
    heightEntry.attempts.push('P');

    const eventResult: EventResult = {
      eventId: event.id,
      attempts: currentER?.attempts || [],
      bestResult: currentER?.bestResult ?? null,
      bestResultDisplay: currentER?.bestResultDisplay ?? '',
      points: currentER?.points ?? 0,
      heightProgression: progression,
    };
    updatedPlayer.eventResults = [
      ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
      eventResult,
    ];
    updatedPlayers[state.currentPlayerIndex] = updatedPlayer;
    set({ players: updatedPlayers, phase: 'showingResult', lastRoll: null, lastResult: null });
  },

  doneJumping: () => {
    const state = get();
    const event = getCurrentEvent(state);
    const player = state.players[state.currentPlayerIndex];
    if (!event || !player || event.type !== 'height') return;

    const updatedPlayers = [...state.players];
    const updatedPlayer = { ...player };
    const currentER = updatedPlayer.eventResults.find(r => r.eventId === event.id);

    const eventResult: EventResult = {
      eventId: event.id,
      attempts: currentER?.attempts || [],
      bestResult: currentER?.bestResult ?? null,
      bestResultDisplay: currentER?.bestResultDisplay ?? '',
      points: currentER?.points ?? 0,
      heightProgression: currentER?.heightProgression || [],
      heightDone: true,
    };
    updatedPlayer.eventResults = [
      ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
      eventResult,
    ];
    updatedPlayers[state.currentPlayerIndex] = updatedPlayer;
    set({ players: updatedPlayers, phase: 'showingResult', lastRoll: null, lastResult: null });
  },

  resetGame: () => set(initialState),
}));
