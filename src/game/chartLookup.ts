import type { AthleteData, ChartLookupResult, EffortType, SpecialResult } from '../types';

const SPECIAL_PATTERNS: [RegExp, SpecialResult][] = [
  [/^INJ\s*2$/i, 'INJ 2'],
  [/^INJ\s*1$/i, 'INJ 1'],
  [/^INJ1$/i, 'INJ 1'],
  [/^INJ2$/i, 'INJ 2'],
  [/^FS\?$/i, 'FS?'],
  [/^FS$/i, 'FS'],
  [/^NG$/i, 'NG'],
  [/^FOUL$/i, 'FOUL'],
];

function parseSpecial(value: string): SpecialResult | undefined {
  const trimmed = value.trim().toUpperCase();
  for (const [pattern, result] of SPECIAL_PATTERNS) {
    if (pattern.test(trimmed)) return result;
  }
  return undefined;
}

// Parse feet/inches strings like `25' 1"` or `6' 11"` into total inches
export function parseFeetInches(value: string): number | null {
  const match = value.match(/(\d+)'\s*(\d+)"/);
  if (!match) return null;
  return parseInt(match[1]) * 12 + parseInt(match[2]);
}

// Convert total inches back to display string
export function inchesToFeetInches(totalInches: number): string {
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}' ${inches}"`;
}

// Convert feet/inches to meters
export function feetInchesToMeters(feetInchStr: string): number | null {
  const inches = parseFeetInches(feetInchStr);
  if (inches === null) return null;
  return inches * 0.0254;
}

export function lookupChart(
  athlete: AthleteData,
  eventId: string,
  effort: EffortType,
  diceTotal: number,
): ChartLookupResult {
  const eventChart = athlete.events[eventId];
  if (!eventChart) {
    return { raw: null, isSpecial: false, displayValue: 'NO CHART' };
  }

  const cell = eventChart[String(diceTotal)];
  if (!cell) {
    return { raw: null, isSpecial: false, displayValue: 'INVALID ROLL' };
  }

  const raw = cell[effort];

  // Null / empty cell — treat as foul
  if (raw === null || raw === undefined || raw === '') {
    return { raw: null, isSpecial: true, specialType: 'FOUL', displayValue: 'FOUL' };
  }

  // String results: could be special or feet/inches
  if (typeof raw === 'string') {
    const special = parseSpecial(raw);
    if (special) {
      return { raw, isSpecial: true, specialType: special, displayValue: special };
    }

    // Try parsing as feet/inches
    const inches = parseFeetInches(raw);
    if (inches !== null) {
      return { raw, isSpecial: false, numericValue: inches, displayValue: raw };
    }

    return { raw, isSpecial: false, displayValue: raw };
  }

  // Numeric result (time in seconds, or distance in feet)
  if (typeof raw === 'number') {
    return { raw, isSpecial: false, numericValue: raw, displayValue: String(raw) };
  }

  return { raw, isSpecial: false, displayValue: String(raw) };
}

// Returns true if resultA is better than resultB
export function isBetterResult(
  resultA: number,
  resultB: number,
  scoringDirection: 'lower_better' | 'higher_better',
): boolean {
  if (scoringDirection === 'lower_better') return resultA < resultB;
  return resultA > resultB;
}

// Returns true if the result clears the attempted height (for HJ/PV)
export function clearsHeight(resultInches: number, attemptedHeightStr: string): boolean {
  const attemptedInches = parseFeetInches(attemptedHeightStr);
  if (attemptedInches === null) return false;
  return resultInches >= attemptedInches;
}
