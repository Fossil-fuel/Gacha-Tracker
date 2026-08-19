"use strict";

/**
 * Canonical website surfaces. The full-product suite treats this as the
 * source of truth: adding a tab/modal/write path to the app without updating
 * this map (or removing one from HTML/src while it remains here) fails tests.
 *
 * Tests are product-shaped, not patch-shaped — they exist so Home, boards,
 * History, Time Trends, Data, and Games stay consistent after any change.
 */

const TABS = [
  { id: "home", panel: "panel-home", render: "renderHome", sidebarTab: true },
  { id: "extracurricular", panel: "panel-extracurricular", render: "renderExtracurricular", sidebarTab: true },
  { id: "dailies", panel: "panel-dailies", render: "renderDailies", sidebarTab: true },
  { id: "weeklies", panel: "panel-weeklies", render: "renderWeeklies", sidebarTab: true },
  { id: "endgame", panel: "panel-endgame", render: "renderEndgame", sidebarTab: true },
  { id: "attendance", panel: "panel-attendance", render: "renderAttendance", sidebarTab: true },
  { id: "data", panel: "panel-data", render: "renderData", sidebarTab: false },
  { id: "games", panel: "panel-games", render: "renderGames", sidebarTab: false },
  { id: "about", panel: "panel-about", render: null, sidebarTab: false },
];

const SUBVIEWS = [
  { id: "extracurricular-history", needle: 'data-extracurricular-view-mode="history"' },
  { id: "attendance-history", needle: 'data-attendance-view="history"' },
  { id: "attendance-trends", needle: 'data-attendance-view="timestamps"' },
];

const MODALS = [
  "taskModal",
  "dailyTaskModal",
  "calendarDayModal",
  "completionTimeModal",
  "extracurricularTaskModal",
  "gameModal",
  "gameIdentityModal",
  "earningsModal",
  "earningsMarkCompleteModal",
  "endgameCompleteModal",
  "extracurricularCompleteModal",
  "settingsModal",
  "stockBannerPickerModal",
  "manualResetModal",
  "manualCompletionModal",
  "colorWheelModal",
  "savePresetModal",
  "deletePresetModal",
  "clearDataModal",
  "clearGameDataModal",
  "clearTimeTrendsModal",
  "timeTrendsDetailModal",
  "attendanceSkippedModal",
  "deleteGameModal",
  "deleteTaskModal",
];

/** User write paths that mutate tracker state. Each must still exist in source. */
const WRITE_PATHS = [
  { name: "function applyTaskCompletion", file: "src/01-core.js" },
  { name: "function removeTaskCompletion", file: "src/01-core.js" },
  { name: "function applyManualResetCompletion", file: "src/01-core.js" },
  { name: "function applyManualResetSkip", file: "src/01-core.js" },
  { name: "function applyManualResetDelete", file: "src/01-core.js" },
  { name: "function applyScheduledCycleSkip", file: "src/01-core.js" },
  { name: "function setCycleCompletionMoment", file: "src/01-core.js" },
  { name: "function setEndgameCompletionDate", file: "src/01-core.js" },
  { name: "function setExtracurricularCompletionMoment", file: "src/01-core.js" },
  { name: "function undoLastCompletion", file: "src/01-core.js" },
  { name: "function convertScheduledTaskToManualReset", file: "src/01-core.js" },
  { name: "function convertManualResetTaskToScheduled", file: "src/01-core.js" },
  { name: "function saveEarningsModal", file: "src/02-modals.js" },
  { name: "function openEarningsMarkCompleteModal", file: "src/02-modals.js" },
];

const CROSS_SURFACES = [
  "home",
  "dailies",
  "weeklies",
  "endgame",
  "extracurricular",
  "attendance-history",
  "attendance-trends",
  "data",
  "games",
];

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort();
}

function extractFromHtml(html) {
  const tabs = uniqueSorted(
    Array.from(String(html || "").matchAll(/\bdata-tab="([^"]+)"/g)).map((m) => m[1])
  );
  const panels = uniqueSorted(
    Array.from(String(html || "").matchAll(/\bid="(panel-[^"]+)"/g)).map((m) => m[1])
  );
  const modals = uniqueSorted(
    Array.from(String(html || "").matchAll(/\bid="([^"]+Modal)"/g)).map((m) => m[1])
  );
  return { tabs, panels, modals };
}

function expectedSidebarTabs() {
  return uniqueSorted(TABS.filter((t) => t.sidebarTab).map((t) => t.id));
}

function expectedPanels() {
  return uniqueSorted(TABS.map((t) => t.panel));
}

function expectedModals() {
  return uniqueSorted(MODALS);
}

function expectedRenders() {
  return TABS.filter((t) => t.render).map((t) => t.render);
}

module.exports = {
  TABS,
  SUBVIEWS,
  MODALS,
  WRITE_PATHS,
  CROSS_SURFACES,
  extractFromHtml,
  expectedSidebarTabs,
  expectedPanels,
  expectedModals,
  expectedRenders,
};
