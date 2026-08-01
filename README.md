# Gacha-Tracker
A manual tracker for gacha games, built to help you manage daily, weekly, and endgame tasks across multiple titles, track attendance/history, and estimate currency and pulls.

**Website:** [Gacha Tracker](https://fossil-fuel.github.io/Gacha-Tracker/)

See [docs/TASK_FLOW.md](docs/TASK_FLOW.md) for how task attempts and completions work (attempts at cycle start, fill-remaining, unlock windows, Time Trends, repairs).

**Dev:** `npm run dev` (http://localhost:4000), `node build.js` to rebuild `app.js` from `src/` + `presets/`, `npm test` for regression suites.

**Presets:** Game definitions live in [`presets/`](presets/README.md) as JSON. Edit those files (or add a new one + `index.json` entry), then run `node build.js`.

Current Presets Available (These are the games I play, if you want to help add more games or have any advice current presets, please contact me through discord)
- Honkai Star Rail
- Zenless Zone Zero
- Honkai Impact 3rd
- Wuthering Waves
- Arknights: Endfield

# Contact

Drop by the Discord server for ideas, bugs, questions, or just to hang out: https://discord.gg/XYGvTuReXz

I am happy to have new contributors. Reach out on the Discord server if you’d like to help with new features.
