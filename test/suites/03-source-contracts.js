"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("../lib/assert");

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

module.exports = {
  name: "source-contracts",
  title: "Source & HTML contracts",
  run() {
    const requiredSrc = [
      "00-firebase.js",
      "01-core.js",
      "01b-game-presets.js",
      "02-modals.js",
      "03-games.js",
      "04-shared.js",
      "05-page-dailies.js",
      "06-page-weeklies.js",
      "07-page-endgame.js",
      "08-page-attendance.js",
      "08b-page-extracurricular.js",
      "09-page-data.js",
      "10-page-games.js",
      "11-page-home.js",
      "12-main.js",
      "mobile-integration.js",
    ];
    requiredSrc.forEach((f) => {
      assert.ok(fs.existsSync(path.join(SRC, f)), "missing src/" + f);
    });

    const core = read("src/01-core.js");
    [
      "function getPeriodDateStrForReset",
      "function getCycleMembershipMoment",
      "function getTaskPeriodDateStr",
      "function getCycleEndDate",
      "function getCalendarDatesInCycleRange",
      "function findCompletionDateInBounds",
      "function cleanupCycleBoundaryBleedMarks",
      "function getDailyPeriodDateStr",
      "function recordCompletion",
      "function unrecordCompletion",
      "function applyTaskCompletion",
      "function removeTaskCompletion",
      "function undoLastCompletion",
      "function pushCompletionUndo",
      "function buildExportSummaryMarkdown",
      "function buildExportSummaryCsv",
      "function buildShareCardModel",
      "function renderShareCardCanvas",
      "function downloadShareCardPng",
      "function getTaskEarliestCompleteDays",
      "function isTaskCompletionUnlocked",
      "function scanDataConflicts",
      "function runIntegrityRepair",
      "function migrateSchemaIfNeeded",
      "function getTaskTallyHistory",
      "function ensureCycleCompletionMarksFillRemainingDays",
      "function fillMissingCompletionTimes",
      "function listMissingCompletionTimes",
      "function listDuplicateCompletionTimestamps",
      "function resolveDuplicateCompletionTimestamps",
      "function listBeforeUnlockConflicts",
      "function applyDebugBeforeUnlockEdits",
      "function listTimeDateFixQueue",
      "function applyDebugTimeDateFixes",
      "function syncTimestampsFromCalendar",
      "function getCalendarEarliestMarkInCycle",
      "function repairEndgameCompletionTiming",
      "function repairCompletionTimingFromTimestamps",
      "function getEndgameCompletionEventsForTrend",
      "function getTimestampsForTimeTrends",
      "function getCycleCompletionDateStr",
      "function isCarriedCompletionMark",
      "function previewHistoryCompact",
      "function applyHistoryCompact",
      "function getHistoryCompactBaseline",
      "function processResets",
      "STORAGE_KEY",
      "STORAGE_SLIM_KEY",
      "initPersistentStorage",
      "maybeWriteDailySlimBackup",
      "PERSISTENCE_MODE",
      "earliestCompleteDays",
    ].forEach((needle) => {
      assert.ok(core.includes(needle), "01-core.js must contain " + needle);
    });

    const main = read("src/12-main.js");
    ["renderHome", "renderDailies", "renderWeeklies", "renderEndgame", "renderAttendance", "renderData", "renderGames"].forEach(
      (fn) => {
        assert.ok(main.includes(fn), "12-main.js must dispatch " + fn);
      }
    );
    assert.ok(main.includes("function renderSharedChrome"), "12-main.js must define renderSharedChrome");
    assert.ok(main.includes("function renderActiveTab"), "12-main.js must define renderActiveTab");
    assert.ok(main.includes("function renderAll"), "12-main.js must keep renderAll for bulk refresh");
    assert.ok(
      /Cold start: active tab[\s\S]*renderActiveTab\(\);[\s\S]*liveProbe/.test(main),
      "startApp cold start must paint via renderActiveTab (active tab only)"
    );
    assert.ok(
      /if\s*\([^)]*document\.hidden[^)]*\)\s*return;[\s\S]{0,100}updateSidebarTime\(/.test(main),
      "sidebar clock interval must skip work while document.hidden"
    );
    assert.ok(
      /visibilityState === ["']visible["'][\s\S]{0,160}updateSidebarTime\(/.test(main),
      "sidebar clock must refresh immediately when tab becomes visible"
    );
    assert.ok(main.includes("processResets()"), "startApp must keep processResets cadence");
    assert.ok(main.includes("60000"), "processResets minute cadence unchanged");

    const attendance = read("src/08-page-attendance.js");
    [
      "function getAttendanceSkippedGroups",
      "function createAttendanceCategoryPieBox",
      "function fillAttendanceSkippedList",
      "openAttendanceSkippedModal",
      "history-month-year-picker",
      "historyYear",
      "historyDayAriaLabel",
      "timestamps-a11y-summary",
      'setAttribute("role", "grid")',
      "function buildHistoryDayModel",
      "function getCachedHistoryDayModel",
      "function buildHistoryCalendarGrid",
      "historyRender:",
      "historyDayModelCache",
      "data-history-shell",
      "createDocumentFragment",
    ].forEach((needle) => {
      assert.ok(attendance.includes(needle), "08-page-attendance.js must contain " + needle);
    });
    assert.ok(
      /getHistoryDWEForDate\(dateStr,\s*available/.test(attendance) &&
        /getHistoryCompletedTaskLabels\(dateStr,\s*available/.test(attendance),
      "History day model must share one availability pass for DWE + labels"
    );
    assert.ok(
      /getCachedHistoryDayModel\(dateStr/.test(attendance),
      "History grid must read day models through the month cache"
    );
    assert.ok(
      /\[data-history-shell\][\s\S]{0,400}oldGrid\.replaceWith\(grid\)|existingShell[\s\S]{0,500}replaceWith\(grid\)/.test(
        attendance
      ),
      "History month changes must reuse chrome and replace only the calendar grid"
    );
    assert.ok(
      /resolveHistoryMonthYear\(getSimulatedNow\(\)\)/.test(attendance),
      "History Prev/Next must read month/year from state each click"
    );
    assert.ok(
      attendance.includes("function ensureHistoryDweTooltip") &&
        attendance.includes("function createHistoryDweTooltipEl") &&
        /_historyTipItems/.test(attendance),
      "History tooltips must be lazy-built from stored label items"
    );
    assert.ok(
      /_historyDweTipDelegated/.test(attendance),
      "History tooltip binding must use delegated listeners on the scroll wrap"
    );
    assert.ok(
      !/buildHistoryDweBar[\s\S]{0,1200}createHistoryDweTooltipEl/.test(attendance) &&
        !/buildHistoryDweBar[\s\S]{0,900}history-dwe-tooltip/.test(attendance),
      "buildHistoryDweBar must not eagerly create tooltip DOM"
    );

    const mobileJs = read("src/mobile-integration.js");
    assert.ok(mobileJs.includes("closeSidebarWhenModalOpens"), "mobile closes sidebar when modal opens");
    assert.ok(mobileJs.includes("visualViewport"), "mobile uses visualViewport");

    const mobileCss = read("styles-mobile.css");
    assert.ok(mobileCss.includes("history-calendar-scroll-wrap"), "mobile styles history calendar scroll");
    assert.ok(mobileCss.includes("timestamps-bar-graph"), "mobile styles time trends bars");
    assert.ok(mobileCss.includes("timestamps-dow-bar-graph") || mobileCss.includes("timestamps-weeklies-bar-graph"), "mobile DOW bars");
    assert.ok(mobileCss.includes("safe-area-inset"), "mobile uses safe-area insets");

    const modals = read("src/02-modals.js");
    [
      "function activateModalFocus",
      "function deactivateModalFocus",
      "function onModalFocusTrapKeydown",
      "function isMarkedOnCalendarDay",
      "check.checked = onThisDay",
      "(finished later)",
    ].forEach((needle) => {
      assert.ok(modals.includes(needle), "02-modals.js must contain " + needle);
    });
    assert.ok(
      !modals.includes('isCompletedInCycleForDate(item.key, "endgame", dateStr)'),
      "calendar day modal must not check endgame boxes from cycle-wide completion"
    );
    assert.ok(
      (modals.match(/\/\/ display-only: active tab \+ chrome/g) || []).length >= 4,
      "display-only settings handlers must use narrow render comments"
    );
    assert.ok(
      /settingsDateFormat[\s\S]*?renderActiveTab\(\)/.test(modals),
      "date format setting must refresh via renderActiveTab"
    );
    assert.ok(
      /settingsFirstDayOfWeek[\s\S]*?renderActiveTab\(\)/.test(modals),
      "first day of week setting must refresh via renderActiveTab"
    );
    assert.ok(
      /bulk state change: full refresh[\s\S]*?renderAll\(\)/.test(modals),
      "import/clear-data must keep full renderAll"
    );

    const css = read("styles.css");
    assert.ok(css.includes(".sr-only"), "styles.css must include .sr-only");
    assert.ok(css.includes("prefers-reduced-motion"), "styles.css must respect prefers-reduced-motion");
    assert.ok(css.includes("history-dwe-carried-mark"), "styles.css must style carried marks");

    const weeklies = read("src/06-page-weeklies.js");
    assert.ok(weeklies.includes("aria-describedby"), "weeklies locked checkbox must use aria-describedby");
    const endgame = read("src/07-page-endgame.js");
    assert.ok(endgame.includes("aria-describedby"), "endgame locked checkbox must use aria-describedby");

    const html = read("index.html");
    [
      'data-tab="home"',
      'data-tab="dailies"',
      'data-tab="weeklies"',
      'data-tab="endgame"',
      'data-tab="attendance"',
      'data-tab="extracurricular"',
      'id="panel-home"',
      'id="panel-dailies"',
      'id="panel-weeklies"',
      'id="panel-endgame"',
      'id="panel-attendance"',
      'id="panel-data"',
      'id="panel-games"',
      'id="panel-about"',
      'data-settings-section="debug"',
      'id="settingsDebugScanBtn"',
      'id="settingsDebugRepairSafeBtn"',
      'id="settingsDebugRepairTimestampsBtn"',
      'id="settingsDebugRepairTalliesBtn"',
      'id="settingsRepairDataBtn"',
      'id="settingsCompactPreviewBtn"',
      'id="settingsCompactApplyBtn"',
      'id="settingsCompactMonths"',
      'id="settingsUndoCompletionBtn"',
      'id="settingsExportSummaryMdBtn"',
      'id="settingsExportSummaryCsvBtn"',
      'id="settingsDebugFillMissingTimesBtn"',
      'id="settingsDebugFixTimesDatesBtn"',
      'id="completionTimeModal"',
      'id="completionTimeBatchBar"',
      'id="completionTimeBatchApply"',
      'id="completionTimeSelectAll"',
      'id="syncTimeTrendsConfirm"',
      'id="clearTimeTrendsModal"',
      'id="settingsShareCardExportBtn"',
      'id="settingsShareCardPreviewBtn"',
      'id="settingsShareCardDays"',
      'id="settingsShareCardGames"',
      'id="extracurricularOcrDrop"',
      'id="extracurricularOcrSkipDescription"',
      'id="sidebarLastSaved"',
      'id="attendanceSkippedModal"',
      "app.js",
    ].forEach((needle) => {
      assert.ok(html.includes(needle), "index.html must include " + needle);
    });
    assert.ok(html.includes("firebase-config.js"), "index.html loads firebase-config.js before app");
    assert.ok(
      html.includes("YOUR_API_KEY") || html.includes("isFirebaseConfigured"),
      "index.html gates Firebase CDN behind real config check"
    );
    assert.ok(
      !/<script[^>]+src=["']https:\/\/www\.gstatic\.com\/firebasejs\//.test(html),
      "index.html must not statically load Firebase CDN scripts"
    );

    const build = read("build.js");
    assert.ok(build.includes("08b-page-extracurricular.js"), "build.js must include extracurricular module");
    assert.ok(build.includes("mobile-integration.js"), "build.js must include mobile module");
    assert.ok(build.includes("01b-game-presets.js"), "build.js must include generated presets module");
    assert.ok(build.includes("presets"), "build.js must load presets/ folder");
    assert.ok(fs.existsSync(path.join(ROOT, "presets", "index.json")), "presets/index.json exists");
  },
};
