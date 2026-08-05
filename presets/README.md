# Game presets

Each file is one addable game for **Games → Add from preset**.

## Layout

| File | Role |
|------|------|
| `index.json` | Ordered list of preset ids (`presets` array) + `version` |
| `<id>.json` | One game: id, name, server, currencies, weeklies, endgame, optional extracurricular, optional `iconStockId` |

## Icon / Official PFP

Optional `iconStockId` points at a bundled stock profile picture from Settings → Stock Assets (e.g. `"pfp-hsr-official"`). When the user adds the preset, that asset path is applied as the game icon (they can replace it later from Games → edit identity).

Bundled presets use their Official PFPs. If `iconStockId` is omitted, `addGame` still falls back to the built-in Official map for the known preset ids.

## Contributing

1. Copy an existing file (e.g. `zzz.json`) to `your-game.json`.
2. Set a unique `id` (lowercase, no spaces).
3. Fill `weeklies` / `endgame` with reset day/time, `dateStarted`, currency, and cycle fields.
4. For unlock windows (e.g. Pain Cage), set `earliestCompleteDays` (and optional hour/minute).
5. Optionally set `iconStockId` to a stock PFP id from `STOCK_PFP_ASSETS` in `src/01-core.js`.
6. Add the id to `index.json` → `presets`.
7. Run `node build.js` (embeds presets into `app.js`).

Do **not** edit `GAME_PRESETS` inside `src/01b-game-presets.js` — that file is generated from this folder.
