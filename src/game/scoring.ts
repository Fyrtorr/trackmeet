import { SCORING_PARAMS } from '../data/events';
import { parseFeetInches } from './chartLookup';

// Convert a chart result to the units the IAAF formula expects
function toScoringUnit(eventId: string, numericValue: number): number {
  const params = SCORING_PARAMS[eventId];
  if (!params) return 0;

  switch (params.unit) {
    case 'seconds':
      return numericValue;

    case 'centimeters':
      // Chart gives feet/inches stored as total inches; convert to cm
      return numericValue * 2.54;

    case 'meters':
      // Shot Put: feet/inches stored as total inches → convert to meters
      // Discus & Javelin: numeric feet → convert to meters
      if (eventId === 'shot_put') {
        return numericValue * 0.0254;
      }
      return numericValue * 0.3048;
  }
}

export function calculatePoints(eventId: string, numericValue: number): number {
  const params = SCORING_PARAMS[eventId];
  if (!params) return 0;

  const performance = toScoringUnit(eventId, numericValue);

  if (params.type === 'track') {
    const diff = params.B - performance;
    if (diff <= 0) return 0;
    return Math.floor(params.A * Math.pow(diff, params.C));
  } else {
    const diff = performance - params.B;
    if (diff <= 0) return 0;
    return Math.floor(params.A * Math.pow(diff, params.C));
  }
}

// Parse a display result string into numeric value suitable for scoring
export function parseResultForScoring(displayResult: string): number | null {
  const inches = parseFeetInches(displayResult);
  if (inches !== null) return inches;

  const num = parseFloat(displayResult);
  if (!isNaN(num)) return num;

  return null;
}
