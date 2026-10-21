# Gacha-Tracker
A manual tracker for gacha games, built to help you manage daily, weekly, and endgame tasks across multiple titles, track attendance/history, and estimate currency and pulls.

**Website:** [Gacha Tracker](https://fossil-fuel.github.io/Gacha-Tracker/)

**Scan updates** (Extracurricular → Scan updates, and the same button on a game’s Extracurricular tab) only works on a local hub. The public site cannot read Game8 from your browser. Everything else on the public site works as usual.

See [docs/CORE_LOGIC.md](docs/CORE_LOGIC.md) for the product/logic contract (what the site is for and which core functions must stay correct). See [docs/TASK_FLOW.md](docs/TASK_FLOW.md) for attempt/completion flow details.

## Run a local hub

Use this if you want Scan updates. The rest of the tracker does not need it.

You need:

- [Node.js 18 or newer](https://nodejs.org/). The installer includes npm. Use the LTS download for your system (Windows, macOS, or Linux).
- A web browser.
- Python is not required. No extra packages need to be installed.

Steps:

1. Download the project. On this GitHub page, choose **Code → Download ZIP**, then unzip it. Or, if you already have Git, run `git clone https://github.com/Fossil-fuel/Gacha-Tracker.git`.
2. Open a terminal in that folder.
   - Windows: open the unzipped folder, click the address bar, type `powershell`, and press Enter.
   - macOS: right-click the folder and choose New Terminal at Folder, or open Terminal and `cd` into the folder.
3. Run `npm run dev`.
4. Open http://127.0.0.1:4000 in your browser.
5. Leave that terminal window open while you use the tracker. Closing it stops the local hub, and Scan updates will stop working until you run `npm run dev` again.

Your saves stay in the browser you have open. The public site and the local hub do not share data automatically. To bring your public-site tracker over, use Settings → Data → Export there, then Import on the local hub.

**Dev:** `npm run dev` (http://localhost:4000), `node build.js` to rebuild `app.js` from `src/` + `presets/`, `npm test` for regression suites.

**Tests:** `npm test` runs build, cycle math, smoke (when the dev server is up), simulated History/Trends/Data, integrity repair, end-to-end and adversarial diagnostics, reset-day bleed, system probe, and live served-bundle probes. Start `npm run dev` first if you want live smoke + `15-live-system-probe`. Optional in-browser probes: `http://localhost:4000/?liveProbe=1` with `test/live/browser-probe-runner.js`.

**Presets:** Game definitions live in [`presets/`](presets/README.md) as JSON. Edit those files (or add a new one + `index.json` entry), then run `node build.js`. Bundled Official profile pictures apply automatically when you add a preset.

Current Presets Available (These are the games I play, if you want to help add more games or have any advice current presets, please contact me through discord)
- Honkai Star Rail
- Zenless Zone Zero
- Honkai Impact 3rd
- Wuthering Waves
- Arknights: Endfield
- Punishing Grey Raven

**Also covered in-app (About) and in `docs/`:** Manual Reset/Start windows, Add completion from Games, My Images (personal reuse library) + Stock banners/PFPs, IndexedDB saves with a slim daily localStorage backup, extracurricular OCR fill, share-card export, and shared reset-day / history write rules.

# Contact

Drop by the Discord server for ideas, bugs, questions, or just to hang out: https://discord.gg/XYGvTuReXz

I am happy to have new contributors. Reach out on the Discord server if you’d like to help with new features.
