# Source Code Organization

The app logic is split into separate files for easier reading and editing. Run `node build.js` from the project root to rebuild `app.js` after making changes.

## File Structure

| File | Contents |
|------|----------|
| **00-firebase.js** | Firebase Auth + Firestore for cloud sync (Google/Facebook/Twitter login) |
| **01-core.js** | Constants, state, storage (load/save), date/time utilities, processResets, task availability helpers |
| **02-modals.js** | Task modal, game modal, delete game modal, calendar day modal, earnings modal |
| **03-games.js** | addGame, deleteGame, reallyDeleteGame, toggle functions, currency/earnings helpers |
| **04-shared.js** | Sidebar time, renderTabs, format toggles |
| **05-page-dailies.js** | Dailies page: buildDailyTaskItem, renderDailies |
| **06-page-weeklies.js** | Weeklies page: buildWeeklyTaskItem, renderWeeklies |
| **07-page-endgame.js** | Endgame page: buildEndgameTaskItem, renderEndgame, updateTaskRemainingTexts |
| **08-page-attendance.js** | Attendance page: renderAttendance, escapeHtml, pie chart helpers |
| **09-page-data.js** | Data page: renderData, renderSidebarDataList, renderSidebarGamesList |
| **10-page-games.js** | Games page: renderGames |
| **11-page-home.js** | Home page: renderHome |
| **12-main.js** | renderAll, initTabs, initialization and intervals |

## Build

From the project root:

```bash
node build.js
```

This concatenates all source files in order into `app.js`.
