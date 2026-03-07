# Track Meet - Digital Decathlon Game

A web-based digital recreation of the Track Meet board game, which simulates a full decathlon competition.

## Features (Planned)

- Hot-seat multiplayer (2+ players on the same device)
- All 10 decathlon events with authentic chart-based resolution
- Dice rolling with visual chart highlighting
- Per-event and cumulative scoring
- Faithful recreation of the original board game experience

## Tech Stack

- **React + TypeScript** — UI framework
- **Vite** — build tool and dev server
- **Zustand** — state management

## Project Structure

```
src/
  game/        — game logic (dice, scoring, event resolution)
  components/  — React UI components
  data/        — event charts and tables
  types/       — TypeScript type definitions
```

## Development

```bash
npm install
npm run dev
```

## Events

1. 100 Meter Dash
2. Long Jump
3. Shot Put
4. High Jump
5. 400 Meters
6. 110 Meter Hurdles
7. Discus Throw
8. Pole Vault
9. Javelin Throw
10. 1500 Meters
