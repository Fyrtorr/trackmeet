import { create } from 'zustand';
import type {
  GameState, GameSettings, PlayerState,
  EffortType, EventResult,
  AttemptResult, InjuryEffect,
} from '../types';
import { EVENTS, STAMINA_PER_DAY, MAX_INJURY_POINTS, FATIGUE_THRESHOLD, MAX_FALSE_STARTS, MAX_CONSECUTIVE_FOULS } from '../data/events';
import { rollDice } from './dice';
import { lookupChart, isBetterResult } from './chartLookup';
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
    (sum, h) => sum + h.attempts.filter(a => a !== '-').length, 0
  );
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

      // Foul but still have attempts
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

      const maxAttempts = event.type === 'field_throw' || event.type === 'field_jump' ? 3 : 1;
      const nextAttempt = state.currentAttempt + 1;
      if (nextAttempt >= maxAttempts) {
        set({ players: updatedPlayers, lastRoll: dice, lastResult: result, phase: 'eventComplete' });
      } else {
        set({ players: updatedPlayers, lastRoll: dice, lastResult: result, currentAttempt: nextAttempt, phase: 'choosingEffort' });
      }
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

      const nextAttempt = state.currentAttempt + 1;
      if (nextAttempt >= 3) {
        set({ players: updatedPlayers, lastRoll: dice, lastResult: resolvedResult, phase: 'showingResult' });
      } else {
        set({ players: updatedPlayers, lastRoll: dice, lastResult: resolvedResult, currentAttempt: nextAttempt, phase: 'showingResult' });
      }

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
      // HJ/PV handled separately — the result is a height that we compare to the attempted height
      // For now, store the result; the UI will manage height progression
      const currentER = updatedPlayer.eventResults.find(r => r.eventId === event.id);
      const attempts = [...(currentER?.attempts || []), attemptResult];
      const eventResult: EventResult = {
        eventId: event.id,
        attempts,
        bestResult: currentER?.bestResult ?? null,
        bestResultDisplay: currentER?.bestResultDisplay ?? '',
        points: currentER?.points ?? 0,
        heightProgression: currentER?.heightProgression || [],
      };
      updatedPlayer.eventResults = [
        ...updatedPlayer.eventResults.filter(r => r.eventId !== event.id),
        eventResult,
      ];
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
      // Check if more attempts remain for field events
      if ((event.type === 'field_throw' || event.type === 'field_jump') && state.currentAttempt < 2) {
        set({ phase: 'choosingEffort' });
        return;
      }

      // For multi-segment not yet complete
      if (event.type === 'multi_segment' && state.currentSegment < event.segments!) {
        set({ phase: 'choosingEffort' });
        return;
      }

      // Move to next player
      const nextPlayerIndex = state.currentPlayerIndex + 1;
      if (nextPlayerIndex < state.players.length) {
        // Check injury expiry for next player
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
    // HJ/PV: pass on current height
  },

  resetGame: () => set(initialState),
}));
