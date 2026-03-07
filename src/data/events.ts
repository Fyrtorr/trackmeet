import { DecathlonEvent } from '../types';

// Placeholder event definitions — will be populated from the game instructions
// The decathlon events in order:
export const DECATHLON_EVENTS: DecathlonEvent[] = [
  { id: '100m', name: '100 Meter Dash', attemptsAllowed: 1, chart: { columns: [], rows: [] } },
  { id: 'long-jump', name: 'Long Jump', attemptsAllowed: 3, chart: { columns: [], rows: [] } },
  { id: 'shot-put', name: 'Shot Put', attemptsAllowed: 3, chart: { columns: [], rows: [] } },
  { id: 'high-jump', name: 'High Jump', attemptsAllowed: 3, chart: { columns: [], rows: [] } },
  { id: '400m', name: '400 Meters', attemptsAllowed: 1, chart: { columns: [], rows: [] } },
  { id: '110m-hurdles', name: '110 Meter Hurdles', attemptsAllowed: 1, chart: { columns: [], rows: [] } },
  { id: 'discus', name: 'Discus Throw', attemptsAllowed: 3, chart: { columns: [], rows: [] } },
  { id: 'pole-vault', name: 'Pole Vault', attemptsAllowed: 3, chart: { columns: [], rows: [] } },
  { id: 'javelin', name: 'Javelin Throw', attemptsAllowed: 3, chart: { columns: [], rows: [] } },
  { id: '1500m', name: '1500 Meters', attemptsAllowed: 1, chart: { columns: [], rows: [] } },
];
