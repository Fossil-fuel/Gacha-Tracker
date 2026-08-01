# Game presets

Each file is one addable game for **Games → Add from preset**.

## Layout

| File | Role |
|------|------|
| `index.json` | Ordered list of preset ids (`presets` array) + `version` |
| `<id>.json` | One game: id, name, server, currencies, weeklies, endgame, optional extracurricular |

## Contributing

1. Copy an existing file (e.g. `zzz.json`) to `your-game.json`.
2. Set a unique `id` (lowercase, no spaces).
3. Fill `weeklies` / `endgame` with reset day/time, `dateStarted`, currency, and cycle fields.
4. For unlock windows (e.g. Pain Cage), set `earliestCompleteDays` (and optional hour/minute).
5. Add the id to `index.json` → `presets`.
6. Run `node build.js` (embeds presets into `app.js`).

Do **not** edit `GAME_PRESETS` inside `src/01-core.js` — that array is generated from this folder.
