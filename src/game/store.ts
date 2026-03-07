import { create } from 'zustand';
import { GameState, Player } from '../types';

interface GameStore extends GameState {
  addPlayer: (name: string) => void;
  removePlayer: (id: number) => void;
  startGame: () => void;
  nextPlayer: () => void;
  nextEvent: () => void;
  setPhase: (phase: GameState['phase']) => void;
  resetGame: () => void;
}

const initialState: GameState = {
  players: [],
  currentPlayerIndex: 0,
  currentEventIndex: 0,
  currentAttempt: 0,
  phase: 'setup',
  lastRoll: null,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  addPlayer: (name: string) =>
    set((state) => ({
      players: [
        ...state.players,
        {
          id: Date.now(),
          name,
          scores: [],
          totalScore: 0,
        },
      ],
    })),

  removePlayer: (id: number) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== id),
    })),

  startGame: () =>
    set({ phase: 'playing', currentPlayerIndex: 0, currentEventIndex: 0 }),

  nextPlayer: () =>
    set((state) => ({
      currentPlayerIndex:
        (state.currentPlayerIndex + 1) % state.players.length,
    })),

  nextEvent: () =>
    set((state) => ({
      currentEventIndex: state.currentEventIndex + 1,
      currentPlayerIndex: 0,
      currentAttempt: 0,
    })),

  setPhase: (phase) => set({ phase }),

  resetGame: () => set(initialState),
}));
