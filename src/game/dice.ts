import { DiceRoll } from '../types';

export function rollDice(): DiceRoll {
  const dice1 = Math.floor(Math.random() * 6) + 1;
  const dice2 = Math.floor(Math.random() * 6) + 1;
  return {
    dice1,
    dice2,
    total: dice1 + dice2,
  };
}
