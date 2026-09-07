"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("../lib/assert");
const productMap = require("../lib/product-map");

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
      "function buildShareCardEndgameTrend",
      "function collectShareCardBannerChoices",
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
      "function estimateBrowserStorageUsage",
      "function getPersistenceSurfaceStatus",
      "function formatStorageBytes",
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
      "function listExtracurricularTimestampsForTimeTrends",
      "function getCycleCompletionDateStr",
      "function isCarriedCompletionMark",
      "function getHistoryCompactBaseline",
      "function splitAutoHistoryForManualConvert",
      "function convertScheduledTaskToManualReset",
      "function convertManualResetTaskToScheduled",
      "function applyManualResetCompletion",
      "function applyManualResetSkip",
      "function applyManualResetDelete",
      "function applyScheduledCycleSkip",
      "function getTaskDefaultEndTimeParts",
      "function setEndgameCompletionDate",
      "function setCycleCompletionMoment",
      "function setExtracurricularCompletionMoment",
      "function getManualPeriodBoundsForDateStr",
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
    productMap.expectedRenders().forEach((fn) => {
      assert.ok(main.includes(fn), "12-main.js must dispatch " + fn);
    });
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
    assert.ok(main.includes("setCycleCompletionMoment"), "12-main.js live probe exports setCycleCompletionMoment");
    assert.ok(main.includes("setExtracurricularCompletionMoment"), "12-main.js live probe exports setExtracurricularCompletionMoment");
    assert.ok(
      main.includes('extracurricularCompletedAt: state.extracurricularCompletedAt'),
      "live probe snapshot includes extracurricularCompletedAt"
    );

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
      "listExtracurricularTimestampsForTimeTrends",
      'appendDayOfWeekChart("extracurricular"',
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
      "function appendEarningsFinishEditors",
      "Cycle Start/End edits are manual-reset only",
      "function saveEarningsModal",
      "function flushEarningsModalDraftFromDom",
      "function toggleEarningsDraftStatus",
      "setCycleCompletionMoment(",
      "function maybeApplyBannerUnionCropToSavePayload",
      "function computePaddedBannerUnionCropRect",
      "function remapBannerViewAfterSourceCrop",
      "Keep full image",
      "BANNER_UNION_CROP_PAD_RATIO",
    ].forEach((needle) => {
      assert.ok(modals.includes(needle), "02-modals.js must contain " + needle);
    });
    assert.ok(modals.includes('earningsModalSave'), "Completion History has Save control");
    assert.ok(modals.includes("function openEarningsMarkCompleteModal"), "skipped cycles can open Mark completed popup");
    assert.ok(modals.includes("Cycle timeframe (kept)"), "Mark completed popup preserves cycle range");
    assert.ok(
      /Mark completed[\s\S]{0,400}openEarningsMarkCompleteModal/.test(modals),
      "Skipped Mark completed wires finish popup for scheduled + manual"
    );
    assert.ok(
      modals.includes("Mark skipped") && modals.includes("Mark completed"),
      "manual-reset history exposes completed↔skipped toggle"
    );
    assert.ok(core.includes("function getManualResetEndMomentOnDate"), "closed cycles use end clock");
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
    assert.ok(
      /settingsImportInput[\s\S]*?applySavePayload\(data,\s*\{\s*isFirstLoad:\s*false\s*\}\)/.test(modals),
      "import must use applySavePayload (preserves banners + userImageLibrary)"
    );
    assert.ok(
      !/settingsImportInput[\s\S]*?save\(\{\s*immediate:\s*true\s*\}\)[\s\S]*?\bload\(\)/.test(modals),
      "import must not reload from slim via load() after save"
    );
    assert.ok(core.includes("function isEmbeddedImageUrl"), "slim image omit must detect embedded URLs only");
    assert.ok(core.includes("function mergeLoadedUserImageLibrary"), "core must merge My Images blobs on apply");
    assert.ok(
      core.includes("if (storageBackend === \"idb\") return;"),
      "load() must not apply slim localStorage when IndexedDB is active"
    );

    const extracurricular = read("src/08b-page-extracurricular.js");
    assert.ok(extracurricular.includes("extracurricular-completed-row"), "08b must render Completed editors");
    assert.ok(
      extracurricular.includes("Dates/Currency live in dedicated rows below"),
      "08b must not duplicate Dates/Currency in snippet"
    );
    assert.ok(
      extracurricular.includes("setExtracurricularCompletionMoment"),
      "08b must wire completed moment edits"
    );

    const css = read("styles.css");
    assert.ok(css.includes(".sr-only"), "styles.css must include .sr-only");
    assert.ok(css.includes("prefers-reduced-motion"), "styles.css must respect prefers-reduced-motion");
    assert.ok(css.includes("history-dwe-carried-mark"), "styles.css must style carried marks");
    assert.ok(css.includes(".earnings-modal-finish-row"), "styles.css must style Finished editors");
    assert.ok(css.includes(".extracurricular-completed-row"), "styles.css must style Completed row");
    assert.ok(css.includes(".settings-storage-usage"), "styles.css must style Settings storage usage");
    assert.ok(css.includes(".settings-storage-track"), "styles.css must style Settings storage bar track");
    assert.ok(css.includes(".settings-storage-fill"), "styles.css must style Settings storage bar fill");
    assert.ok(css.includes(".settings-storage-bars"), "styles.css must style per-surface storage bars");

    const modalsPage = read("src/02-modals.js");
    assert.ok(modalsPage.includes("refreshSettingsStorageUsage"), "Settings must refresh browser storage usage");
    assert.ok(modalsPage.includes("estimateBrowserStorageUsage"), "Settings must call browser storage estimate");
    assert.ok(modalsPage.includes("openIndexedDbFullModal"), "Settings/modals must open IndexedDB full popup");
    assert.ok(core.includes("showIdbFullModalOnNextSave"), "core arms IndexedDB-full modal for next save");
    assert.ok(core.includes("persistToLocalStorageFull"), "core falls back to localStorage when IndexedDB fails");
    assert.ok(core.includes("isCloudSaveAvailable"), "core can prefer Firebase when signed in");

    const weeklies = read("src/06-page-weeklies.js");
    assert.ok(weeklies.includes("aria-describedby"), "weeklies locked checkbox must use aria-describedby");
    const endgame = read("src/07-page-endgame.js");
    assert.ok(endgame.includes("aria-describedby"), "endgame locked checkbox must use aria-describedby");

    const html = read("index.html");
    assert.ok(html.includes('id="settingsStorageUsage"'), "index.html has Settings storage usage block");
    assert.ok(html.includes('id="settings-section-data"'), "index.html has Settings Data section");
    assert.ok(html.includes('id="settingsStorageWarning"'), "Settings Data has near-full warning banner");
    assert.ok(html.includes('id="indexedDbFullModal"'), "index.html has IndexedDB full modal");
    assert.ok(html.includes('data-storage-bar="indexedDB"'), "Settings storage has IndexedDB bar");
    assert.ok(html.includes('data-storage-bar="localStorage"'), "Settings storage has localStorage bar");
    assert.ok(html.includes('data-storage-bar="firebase"'), "Settings storage has Firebase bar");
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
      'id="taskBannerKeepFullImage"',
      'id="extraBannerKeepFullImage"',
      'id="extracurricularOcrDrop"',
      'id="extracurricularOcrSkipDescription"',
      'id="sidebarLastSaved"',
      'id="attendanceSkippedModal"',
      "app.js",
    ].forEach((needle) => {
      assert.ok(html.includes(needle), "index.html must include " + needle);
    });
    assert.ok(
      html.includes("For Manual Reset/Start, this is the default Due time"),
      "index.html Cycle end time tooltip must mention Manual Reset default Due time"
    );
    assert.ok(
      !/<div class="task-menu-cell span-2 task-menu-label task-menu-scheduled-only">Cycle end time<\/div>/.test(html),
      "Cycle end time label must stay visible for Manual Reset (not scheduled-only)"
    );
    assert.ok(
      html.includes('id="manualCompletionOutcomeCompleted"') && html.includes('id="manualCompletionOutcomeSkipped"'),
      "index.html Add Attempt modal must offer Completed/Skipped"
    );
    assert.ok(html.includes("Add Attempt"), "index.html references Add Attempt");
    assert.ok(html.includes('id="earningsMarkCompleteModal"'), "index.html has Mark completed popup for skipped cycles");
    assert.ok(html.includes("When was this cycle completed?"), "Mark completed popup asks for finish moment");
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
