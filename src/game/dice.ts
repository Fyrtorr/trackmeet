import type { DiceRoll } from '../types';

// Sports Illustrated 10-39 dice system
// Each die has non-standard faces

const BLACK_DIE: number[] = [1, 2, 2, 3, 3, 3];
const WHITE_A: number[] = [0, 1, 2, 3, 4, 5];
const WHITE_B: number[] = [0, 0, 1, 2, 3, 4];

function pickFace(die: number[]): number {
  return die[Math.floor(Math.random() * die.length)];
}

export function rollDice(): DiceRoll {
  const black = pickFace(BLACK_DIE);
  const whiteA = pickFace(WHITE_A);
  const whiteB = pickFace(WHITE_B);
  return {
    black,
    whiteA,
    whiteB,
    total: black * 10 + whiteA + whiteB,
  };
}

// For testing / replay: create a DiceRoll from a known total
export function diceFromTotal(total: number): DiceRoll {
  const black = Math.floor(total / 10);
  const remainder = total % 10;
  const whiteA = Math.min(remainder, 5);
  const whiteB = remainder - whiteA;
  return { black, whiteA, whiteB, total };
}

// Probability distribution of each total (out of 216 possible rolls)
export function getDiceProbabilities(): Map<number, number> {
  const counts = new Map<number, number>();
  for (const b of BLACK_DIE) {
    for (const a of WHITE_A) {
      for (const wb of WHITE_B) {
        const total = b * 10 + a + wb;
        counts.set(total, (counts.get(total) || 0) + 1);
      }
    }
  }
  const probs = new Map<number, number>();
  for (const [total, count] of counts) {
    probs.set(total, count / 216);
  }
  return probs;
}
