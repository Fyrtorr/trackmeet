# Track Meet - Digital Decathlon Game

A web-based digital recreation of the Sports Illustrated "Track Meet" / "Decathlon" board game (Centennial Edition by Tom McHugh, 2012). Play a full decathlon competition with hot-seat multiplayer, animated event visuals, and faithful chart-based resolution.

## Features

- **Hot-seat multiplayer** — 2+ players on the same device
- **All 10 decathlon events** with authentic chart-based resolution using SI custom dice (10-39 range)
- **Animated event visuals** — sprint race tracks, throwing field top-down views with true-to-scale distances, high jump/pole vault field with jump animations, long jump pit
- **Dice rolling** with visual chart highlighting showing the lookup in real time
- **IAAF/World Athletics scoring** — identical to the game's 1985 Scoring Tables
- **Stamina & injury system** — manage stamina across events with Safe/Average/All Out effort choices
- **Height events** — full high jump and pole vault with spreadsheet-style scorecard, pass/done options, round-robin turn order, and fatigue tracking
- **Multi-segment races** — 400m (4 segments) and 1500m (5 segments) with oval track animation and split times
- **Per-event and cumulative scoring** with full scorecard overlay

## Tech Stack

- **React + TypeScript** — UI framework
- **Vite** — build tool and dev server
- **Zustand** — state management

## Project Structure

```
src/
  game/        — game logic (dice, scoring, chart lookup, store)
  components/  — React UI components and event animations
  data/        — athlete charts, event definitions, and graphics
  types/       — TypeScript type definitions
```

## Development

```bash
npm install
npm run dev
```

## Events

| Day 1 | Day 2 |
|-------|-------|
| 1. 100 Meter Dash | 6. 110 Meter Hurdles |
| 2. Long Jump | 7. Discus Throw |
| 3. Shot Put | 8. Pole Vault |
| 4. High Jump | 9. Javelin Throw |
| 5. 400 Meters | 10. 1500 Meters |

## Game Rules

Based on the Centennial Edition rules with errata corrections. Uses custom SI dice (black die for tens, two white dice for ones) producing a non-uniform distribution where 30s are most common (50%), 20s moderate (33%), and 10s least common (17%).
