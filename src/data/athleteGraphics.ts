// Athlete visual identity — extend with sprite paths/images later
export interface AthleteGraphic {
  runnerIcon: string       // emoji or character for now, image path later
  color: string            // primary color for lane tags, highlights
  abbreviation: string     // 3-letter short name for compact displays
}

const ATHLETE_GRAPHICS: Record<string, AthleteGraphic> = {
  avilov: {
    runnerIcon: '\u{1F3C3}',
    color: '#ef4444',      // red — USSR
    abbreviation: 'AVI',
  },
  thorpe: {
    runnerIcon: '\u{1F3C3}',
    color: '#3b82f6',      // blue — USA
    abbreviation: 'THO',
  },
  eaton: {
    runnerIcon: '\u{1F3C3}',
    color: '#22c55e',      // green — USA
    abbreviation: 'EAT',
  },
}

// Fallback colors for athletes without a defined graphic
const FALLBACK_COLORS = [
  '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

let fallbackIndex = 0

export function getAthleteGraphic(athleteId: string): AthleteGraphic {
  if (ATHLETE_GRAPHICS[athleteId]) {
    return ATHLETE_GRAPHICS[athleteId]
  }
  // Generate a fallback
  const color = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
  fallbackIndex++
  return {
    runnerIcon: '\u{1F3C3}',
    color,
    abbreviation: athleteId.slice(0, 3).toUpperCase(),
  }
}
