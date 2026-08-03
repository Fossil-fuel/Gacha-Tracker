# Source Code Organization

The app logic is split into separate files for easier reading and editing. Run `node build.js` from the project root to rebuild `app.js` after making changes.

## File Structure

| File | Contents |
|------|----------|
| **00-firebase.js** | Firebase Auth + Firestore for cloud sync (Google/Facebook/Twitter login) |
| **01-core.js** | Constants, state, storage (load/save), date/time utilities, processResets, completion write path, unlock + integrity repair helpers |
| **01b-game-presets.js** | **Generated** `GAME_PRESETS` from `presets/*.json` (do not edit by hand; run `node build.js`) |
| **02-modals.js** | Task modal, game modal, delete game modal, calendar day modal, earnings modal |
| **03-games.js** | addGame, deleteGame, reallyDeleteGame, toggle functions, currency/earnings helpers |
| **04-shared.js** | Sidebar time, renderTabs, format toggles |
| **05-page-dailies.js** | Dailies page: buildDailyTaskItem, renderDailies |
| **06-page-weeklies.js** | Weeklies page: buildWeeklyTaskItem, renderWeeklies |
| **07-page-endgame.js** | Endgame page: buildEndgameTaskItem, renderEndgame, updateTaskRemainingTexts |
| **08-page-attendance.js** | Attendance page: renderAttendance, escapeHtml, pie chart helpers |
| **08b-page-extracurricular.js** | Extracurricular page |
| **09-page-data.js** | Data page: renderData, renderSidebarDataList, renderSidebarGamesList |
| **10-page-games.js** | Games page: renderGames |
| **11-page-home.js** | Home page: renderHome |
| **12-main.js** | renderAll, initTabs, initialization and intervals; optional `?liveProbe=1` exposes `__gachaLiveProbe` for localhost regression |
| **mobile-integration.js** | Mobile / Capacitor hooks |

## Build

From the project root:

```bash
node build.js
```

This concatenates all source files in order into `app.js`.

Logic contracts and regression expectations: [docs/CORE_LOGIC.md](../docs/CORE_LOGIC.md).