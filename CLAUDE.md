# CLAUDE.md — Track Meet Digital Decathlon

## Project Overview
Digital recreation of the Sports Illustrated "Track Meet" / "Decathlon" board game (Centennial Edition by Tom McHugh, 2012). Web-based, hot-seat multiplayer.

## Tech Stack
- React 19 + TypeScript 5.9 + Vite 7 + Zustand 5
- No test framework currently configured
- No CSS framework — plain CSS files colocated with components

## Commands
- `npm run dev` — start dev server
- `npm run build` — typecheck (`tsc -b`) then build
- `npm run lint` — ESLint
- `npm run preview` — preview production build

## Project Structure
```
src/
  game/           — core logic (store.ts, dice.ts, scoring.ts, chartLookup.ts)
  components/     — React UI components + colocated CSS
    animations/   — per-event visual animations (track, field, height, throws)
  data/           — athlete JSON, event definitions, athlete graphics
  types/          — TypeScript type definitions (index.ts)
research/         — reference materials (gitignored, not committed)
```

## Key Architecture
- **State management**: single Zustand store in `src/game/store.ts` — all game state lives here
- **Dice system**: custom SI "10-39" dice, NOT standard d6. Black die × 10 + two white dice. See `src/game/dice.ts`
- **Scoring**: IAAF/World Athletics formula in `src/game/scoring.ts`. Track = INT(A×(B-T)^C), Field = INT(A×(P-B)^C)
- **Chart lookup**: `src/game/chartLookup.ts` resolves dice rolls against athlete performance charts
- **Events flow**: 10 events across 2 days, each with unique animation component

## Conventions
- Component files: PascalCase `.tsx` with colocated `.css` file
- Game logic files: camelCase `.ts` in `src/game/`
- No test files yet — run `npm run build` to verify changes compile
- Using ERRATA rules (not original) for injuries and false starts

## Things to Watch Out For
- The `/research` directory is gitignored — never commit those files
- Athlete data comes from `src/data/athletes.json` — charts are large structured objects
- The dice distribution is non-uniform and intentional (30s=50%, 20s=33%, 10s=17%)
- Height events (high jump, pole vault) have complex round-robin turn order logic
- Multi-segment races (400m, 1500m) have lane-merging and split-time mechanics
