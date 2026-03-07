import type { EventDefinition, ScoringParams } from '../types';

export const EVENTS: EventDefinition[] = [
  // Day 1
  {
    id: '100m', name: '100 Meters', day: 1, order: 1,
    type: 'sprint', allOutStaminaCost: 1,
    resultUnit: 'seconds', scoringDirection: 'lower_better',
  },
  {
    id: 'long_jump', name: 'Long Jump', day: 1, order: 2,
    type: 'field_jump', allOutStaminaCost: 1,
    resultUnit: 'feet_inches', scoringDirection: 'higher_better',
  },
  {
    id: 'shot_put', name: 'Shot Put', day: 1, order: 3,
    type: 'field_throw', allOutStaminaCost: 1,
    resultUnit: 'feet_inches', scoringDirection: 'higher_better',
  },
  {
    id: 'high_jump', name: 'High Jump', day: 1, order: 4,
    type: 'height', allOutStaminaCost: 1,
    resultUnit: 'feet_inches', scoringDirection: 'higher_better',
  },
  {
    id: '400m', name: '400 Meters', day: 1, order: 5,
    type: 'multi_segment', segments: 4, allOutStaminaCost: 1,
    resultUnit: 'seconds', scoringDirection: 'lower_better',
  },
  // Day 2
  {
    id: '110m_hurdles', name: '110 Meter Hurdles', day: 2, order: 6,
    type: 'sprint', allOutStaminaCost: 1,
    resultUnit: 'seconds', scoringDirection: 'lower_better',
  },
  {
    id: 'discus', name: 'Discus Throw', day: 2, order: 7,
    type: 'field_throw', allOutStaminaCost: 1,
    resultUnit: 'feet', scoringDirection: 'higher_better',
  },
  {
    id: 'pole_vault', name: 'Pole Vault', day: 2, order: 8,
    type: 'height', allOutStaminaCost: 1,
    resultUnit: 'feet_inches', scoringDirection: 'higher_better',
  },
  {
    id: 'javelin', name: 'Javelin Throw', day: 2, order: 9,
    type: 'field_throw', allOutStaminaCost: 1,
    resultUnit: 'feet', scoringDirection: 'higher_better',
  },
  {
    id: '1500m', name: '1500 Meters', day: 2, order: 10,
    type: 'multi_segment', segments: 5, allOutStaminaCost: 3,
    resultUnit: 'seconds', scoringDirection: 'lower_better',
  },
];

export const SCORING_PARAMS: Record<string, ScoringParams> = {
  '100m':         { A: 25.4347,  B: 18,   C: 1.81, type: 'track', unit: 'seconds' },
  'long_jump':    { A: 0.14354,  B: 220,  C: 1.4,  type: 'field', unit: 'centimeters' },
  'shot_put':     { A: 51.39,    B: 1.5,  C: 1.05, type: 'field', unit: 'meters' },
  'high_jump':    { A: 0.8465,   B: 75,   C: 1.42, type: 'field', unit: 'centimeters' },
  '400m':         { A: 1.53775,  B: 82,   C: 1.81, type: 'track', unit: 'seconds' },
  '110m_hurdles': { A: 5.74352,  B: 28.5, C: 1.92, type: 'track', unit: 'seconds' },
  'discus':       { A: 12.91,    B: 4,    C: 1.1,  type: 'field', unit: 'meters' },
  'pole_vault':   { A: 0.2797,   B: 100,  C: 1.35, type: 'field', unit: 'centimeters' },
  'javelin':      { A: 10.14,    B: 7,    C: 1.08, type: 'field', unit: 'meters' },
  '1500m':        { A: 0.03768,  B: 480,  C: 1.85, type: 'track', unit: 'seconds' },
};

// Base high jump heights: every 2" from 5'8" to 6'6", then every 1" upward
// Use generateHighJumpHeights() for game play to extend based on athletes
export const HIGH_JUMP_HEIGHTS = [
  "5' 8\"", "5' 10\"", "6' 0\"", "6' 2\"", "6' 4\"", "6' 6\"",
  "6' 7\"", "6' 8\"", "6' 9\"", "6' 10\"", "6' 11\"",
  "7' 0\"", "7' 1\"", "7' 2\"", "7' 3\"",
];

// Generate high jump heights dynamically, extending up to maxInches
export function generateHighJumpHeights(maxInches: number): string[] {
  const heights: string[] = [];
  // Every 2" from 5'8" (68") to 6'6" (78")
  for (let i = 68; i <= 78; i += 2) {
    heights.push(`${Math.floor(i / 12)}' ${i % 12}"`);
  }
  // Every 1" from 6'7" (79") upward
  for (let i = 79; i <= maxInches; i++) {
    heights.push(`${Math.floor(i / 12)}' ${i % 12}"`);
  }
  return heights;
}

export const POLE_VAULT_HEIGHTS = [
  "18' 8\"", "18' 4\"", "18' 0\"", "17' 8\"", "17' 4\"", "17' 0\"",
  "16' 8\"", "16' 4\"", "16' 0\"", "15' 8\"", "15' 5\"", "15' 1\"",
  "14' 9\"", "14' 5\"", "14' 1\"", "13' 9\"", "13' 5\"", "13' 1\"",
  "12' 9\"", "12' 5\"",
];

export function getEventById(id: string): EventDefinition | undefined {
  return EVENTS.find(e => e.id === id);
}

export function getEventByOrder(order: number): EventDefinition | undefined {
  return EVENTS.find(e => e.order === order);
}

export const STAMINA_PER_DAY = 6;
export const MAX_INJURY_POINTS = 3;
export const FATIGUE_THRESHOLD = 7;
export const MAX_FALSE_STARTS = 2;
export const MAX_CONSECUTIVE_FOULS = 3;
