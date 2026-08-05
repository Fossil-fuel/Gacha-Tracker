(function () {
  "use strict";
  const STORAGE_KEY = "gacha-tracker";
  const STORAGE_SLIM_KEY = "gacha-tracker-slim";
  const STORAGE_META_KEY = "gacha-tracker-meta";
  const IDB_NAME = "gacha-tracker-db";
  const IDB_VERSION = 1;
  const IDB_STORE = "saves";
  const IDB_FULL_RECORD = "full";
  const USER_IMAGE_REF_PREFIX = "userimg:";
  const DEFAULT_RESET_HOUR = 4;
  const SERVER_RESET_HOUR_DST = 4;
  const SERVER_RESET_HOUR_STANDARD = 3;

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DEFAULT_TIME_STR = "04:00";

  /** Server regions: America (UTC-5), Asia (UTC+8), Europe (UTC+1). Etc/GMT+X = UTC-X. */
  const SERVER_OPTIONS = [
    { id: "america", label: "America", tz: "Etc/GMT+5", offsetMinutes: -300 },
    { id: "asia", label: "Asia", tz: "Etc/GMT-8", offsetMinutes: 480 },
    { id: "europe", label: "Europe", tz: "Etc/GMT-1", offsetMinutes: 60 },
  ];

  /* GAME_PRESETS: loaded from presets/*.json via build.js → src/01b-game-presets.js */

  const taskModal = {
    open: false,
    gameId: null,
    taskType: null, // "weeklies" | "endgame"
    taskId: null, // existing task id if editing
    selectedDay: 0,
    frequencyUnit: "week",
    timeLimitUnit: "week",
    bannerTarget: "board", // "home" | "games" | "board"
    bannerSource: null, // single shared source data URL
    bannerViews: {
      home: null, // { aspect, x, y, w, h } normalized stage placement of source
      games: null,
      board: null,
    },
    bannerPreviewUrls: {
      home: null,
      games: null,
      board: null,
    },
  };

  const TASK_BANNER_STAGE = { w: 640, h: 360 };
  const TASK_BANNER_CROP_MIN = 48;

  const TASK_BANNER_TARGETS = {
    home: { id: "home", label: "Home", aspect: 16 / 9 },
    games: { id: "games", label: "Games", aspect: 3 / 4 },
    board: { id: "board", label: "Board", aspect: 16 / 9 },
  };

  /** Banner crop UI ids for task modal vs extracurricular modal (shared crop state). */
  const TASK_BANNER_UI = {
    task: {
      root: "taskModal",
      chooseBtn: "taskBannerChooseBtn",
      stockBtn: "taskBannerStockBtn",
      saveLibraryBtn: "taskBannerSaveLibraryBtn",
      clearBtn: "taskBannerClearBtn",
      file: "taskBannerFile",
      wrap: "taskBannerCropWrap",
      canvas: "taskBannerCropCanvas",
      imgFrame: "taskBannerImageFrame",
      cropFrame: "taskBannerCropFrame",
      previewWrap: "taskBannerPreviewWrap",
      cardPreview: "taskBannerCardPreview",
      nameInput: "taskNameInput",
      overlayTextInput: "taskBannerOverlayText",
    },
    extra: {
      root: "extracurricularTaskModal",
      chooseBtn: "extraBannerChooseBtn",
      stockBtn: "extraBannerStockBtn",
      saveLibraryBtn: "extraBannerSaveLibraryBtn",
      clearBtn: "extraBannerClearBtn",
      file: "extraBannerFile",
      wrap: "extraBannerCropWrap",
      canvas: "extraBannerCropCanvas",
      imgFrame: "extraBannerImageFrame",
      cropFrame: "extraBannerCropFrame",
      previewWrap: "extraBannerPreviewWrap",
      cardPreview: "extraBannerCardPreview",
      nameInput: "extracurricularTaskName",
      overlayTextInput: "extraBannerOverlayText",
    },
  };
  let activeBannerUiKey = "task";
  let stockBannerPickerUiKey = "task";

  /** Bundled stock banners (relative paths; stored as URL strings on tasks). */
  const STOCK_BANNER_ASSETS = [
    { id: "story-castorice-fields", path: "assets/Castorice fields.png", kind: "story", label: "Castorice Fields" },
    { id: "story-startorch", path: "assets/Startorch.png", kind: "story", label: "Startorch" },
    { id: "story-wuling", path: "assets/Wuling.png", kind: "story", label: "Wuling" },
    { id: "event-endfield", path: "assets/Endfield.png", kind: "event", label: "Endfield" },
    { id: "event-stellar-jade", path: "assets/Stellar Jade.png", kind: "event", label: "Stellar Jade" },
    { id: "event-zzz", path: "assets/ZZZ.png", kind: "event", label: "ZZZ" },
  ];

  /** Bundled profile pictures (Settings gallery; not offered in the task banner picker). */
  const STOCK_PFP_ASSETS = [
    { id: "pfp-pgr-official", path: "assets/PFP - PGR - Official.png", kind: "pfp", label: "PGR — Official" },
    { id: "pfp-wuwa-official", path: "assets/PFP - WuWa - Official.png", kind: "pfp", label: "WuWa — Official" },
    { id: "pfp-hsr-official", path: "assets/PFP - HSR - Official.png", kind: "pfp", label: "HSR — Official" },
    { id: "pfp-hi3rd-official", path: "assets/PFP - HI3rd - Official.png", kind: "pfp", label: "HI3rd — Official" },
    { id: "pfp-zzz-official", path: "assets/PFP - ZZZ - Official.png", kind: "pfp", label: "ZZZ — Official" },
    { id: "pfp-endfield-official", path: "assets/PFP - Endfield - Official.png", kind: "pfp", label: "Endfield — Official" },
  ];

  function getStockBannerAssets() {
    return STOCK_BANNER_ASSETS.slice();
  }

  function getStockPfpAssets() {
    return STOCK_PFP_ASSETS.slice();
  }

  /** Official stock PFP id for each bundled preset (used when adding from preset). */
  const PRESET_OFFICIAL_PFP_IDS = {
    hsr: "pfp-hsr-official",
    zzz: "pfp-zzz-official",
    hi3: "pfp-hi3rd-official",
    ww: "pfp-wuwa-official",
    akendfield: "pfp-endfield-official",
    pgr: "pfp-pgr-official",
  };

  function getStockPfpAssetById(id) {
    const key = String(id || "").trim();
    if (!key) return null;
    return STOCK_PFP_ASSETS.find((a) => a.id === key) || null;
  }

  /** Resolve a preset's default icon path (relative asset URL), or null. */
  function resolvePresetIconPath(presetOrOpts) {
    const o = presetOrOpts || {};
    const stockId = o.iconStockId || PRESET_OFFICIAL_PFP_IDS[o.id || o.presetId] || null;
    const asset = getStockPfpAssetById(stockId);
    return asset && asset.path ? asset.path : null;
  }

  function isUserImageRef(path) {
    return String(path || "").trim().toLowerCase().indexOf(USER_IMAGE_REF_PREFIX) === 0;
  }

  function makeUserImageRef(id) {
    return USER_IMAGE_REF_PREFIX + String(id || "").trim();
  }

  function getUserImageIdFromRef(path) {
    const raw = String(path || "").trim();
    if (!isUserImageRef(raw)) return "";
    return raw.slice(USER_IMAGE_REF_PREFIX.length);
  }

  function getUserImageLibrary() {
    if (!Array.isArray(state.userImageLibrary)) state.userImageLibrary = [];
    return state.userImageLibrary;
  }

  function getUserImageById(id) {
    const key = String(id || "").trim();
    if (!key) return null;
    return getUserImageLibrary().find((e) => e && e.id === key) || null;
  }

  function resolveUserImageUrl(pathOrRef) {
    const id = isUserImageRef(pathOrRef) ? getUserImageIdFromRef(pathOrRef) : String(pathOrRef || "").trim();
    const entry = getUserImageById(id);
    return entry && entry.dataUrl ? entry.dataUrl : "";
  }

  function generateUserImageId() {
    return "uimg_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  /**
   * Add an image to the personal library (stored once; tasks/games keep userimg:id refs).
   * opts: { kind: "banner"|"pfp", label?, dataUrl }
   */
  function addUserImage(opts) {
    const o = opts || {};
    const dataUrl = String(o.dataUrl || "").trim();
    if (!dataUrl || dataUrl.indexOf("data:") !== 0) return null;
    const kind = o.kind === "pfp" ? "pfp" : "banner";
    const label =
      (o.label && String(o.label).trim()) ||
      (kind === "pfp" ? "Profile picture" : "Banner") +
        " " +
        (getUserImageLibrary().filter((e) => e && e.kind === kind).length + 1);
    const entry = {
      id: generateUserImageId(),
      kind: kind,
      label: label.slice(0, 80),
      createdAt: Date.now(),
      dataUrl: dataUrl,
    };
    getUserImageLibrary().unshift(entry);
    return entry;
  }

  function updateUserImageMeta(id, patch) {
    const entry = getUserImageById(id);
    if (!entry || !patch) return null;
    if (patch.label != null) {
      const label = String(patch.label).trim();
      if (label) entry.label = label.slice(0, 80);
    }
    if (patch.kind === "banner" || patch.kind === "pfp") entry.kind = patch.kind;
    return entry;
  }

  function removeUserImage(id) {
    const key = String(id || "").trim();
    if (!key) return false;
    const list = getUserImageLibrary();
    const idx = list.findIndex((e) => e && e.id === key);
    if (idx < 0) return false;
    list.splice(idx, 1);
    return true;
  }

  function cloneUserImageLibraryForSave(omitData) {
    return getUserImageLibrary().map((e) => {
      if (!e || typeof e !== "object") return e;
      if (!omitData) {
        return {
          id: e.id,
          kind: e.kind === "pfp" ? "pfp" : "banner",
          label: e.label || "",
          createdAt: e.createdAt || 0,
          dataUrl: e.dataUrl || "",
        };
      }
      return {
        id: e.id,
        kind: e.kind === "pfp" ? "pfp" : "banner",
        label: e.label || "",
        createdAt: e.createdAt || 0,
      };
    });
  }

  function normalizeLoadedUserImageLibrary(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((e) => {
        if (!e || typeof e !== "object") return null;
        const id = String(e.id || "").trim();
        const dataUrl = String(e.dataUrl || "").trim();
        if (!id) return null;
        return {
          id: id,
          kind: e.kind === "pfp" ? "pfp" : "banner",
          label: String(e.label || id).trim().slice(0, 80) || id,
          createdAt: Number(e.createdAt) || 0,
          dataUrl: dataUrl.indexOf("data:") === 0 ? dataUrl : "",
        };
      })
      .filter(Boolean);
  }

  function resolveStockBannerUrl(path) {
    const raw = String(path || "").trim();
    if (!raw) return "";
    if (isUserImageRef(raw)) return resolveUserImageUrl(raw) || "";
    if (/^(data:|blob:|https?:|\/\/)/i.test(raw)) return raw;
    try {
      return new URL(raw.replace(/^\.\//, ""), document.baseURI || window.location.href).href;
    } catch (_) {
      return raw;
    }
  }

  function setActiveBannerUi(key) {
    if (TASK_BANNER_UI[key]) activeBannerUiKey = key;
  }

  function bannerEl(part) {
    const cfg = TASK_BANNER_UI[activeBannerUiKey];
    if (!cfg || !cfg[part]) return null;
    return qs(cfg[part]);
  }

  function bannerRootEl() {
    return bannerEl("root") || document;
  }

  const taskBannerCrop = {
    sourceImg: null,
    imgX: 0,
    imgY: 0,
    imgW: 0,
    imgH: 0,
    cropX: 0,
    cropY: 0,
    cropW: 0,
    cropH: 0,
    mode: null, // "move-img" | "move-crop" | "scale-img-*" | "scale-crop-*"
    dragStartX: 0,
    dragStartY: 0,
    startImgX: 0,
    startImgY: 0,
    startImgW: 0,
    startImgH: 0,
    startCropX: 0,
    startCropY: 0,
    startCropW: 0,
    startCropH: 0,
    clear: false,
  };

  const gameModal = {
    open: false,
    selectedPresetId: "custom",
  };

  const deleteGameModalState = {
    open: false,
    gameId: null,
  };

  const deleteTaskModalState = {
    open: false,
    onConfirm: null,
  };

  let state = {
    tab: "about",
    dataSelectedGameId: null,
    gamesSelectedId: null,
    gamesSubTab: "dailies",
    games: [],
    dailiesCompleted: {},
    weekliesCompleted: {},
    endgameCompleted: {},
    dailiesAttempted: {},
    weekliesAttempted: {},
    endgameAttempted: {},
    endgameCurrencyEarned: {},
    /** Per-completion max currency for endgame cycles (parallel to endgameCurrencyEarned). */
    endgameCurrencyPotential: {},
    /** In-progress "earned this cycle" when the current cycle is not yet completed (keyed by gameId.taskId). */
    endgamePendingCurrency: {},
    /** Cycle start ms for the pending row; when it differs from the current cycle, pending resets to 0. */
    endgamePendingCycleStartMs: {},
    endgameCompletionDates: {}, // { "gameId.taskId": [{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }, ...] }
    completionByDate: {}, // { "YYYY-MM-DD": { dailies: [gameId], weeklies: ["gameId.taskId"], endgame: ["gameId.taskId"] } }
    completionTimestamps: [], // [{ dateStr, hour, gameId, taskType, taskId, taskLabel }] - when tasks were completed (for trend)
    lastProcessedResets: { dailies: {}, weeklies: {}, endgame: {} }, // last period we processed for each task
    attendancePieInclude: {},
    dataPieInclude: {}, // { gameId: { dailies, weeklies, endgame, extracurricular } } - true = include in total/pie
    dataExcludeInProgress: {}, // { gameId: true } - true = exclude unfinished current cycles (default); false = include them as theoretical potential
    dataHideDates: {}, // { gameId: true } - hide counting-since / date labels on Data page
    attendanceView: "weekly", // "weekly" | "history" | "timestamps"
    timestampsSelectedGameIds: {}, // { gameId: true } - which games to show in timestamps page; empty = all
    timestampsSelectedEndgameTasks: {}, // { "gameId.taskId": true } - which endgame tasks to show; empty = all
    timestampsEndgamePickerGameId: null, // which game's endgame tasks are shown in the picker UI
    historyMonth: null,
    historyYear: null,
    extracurricularTasks: [],
    userImageLibrary: [],
    extracurricularCompleted: {},
    extracurricularCompletedAt: {}, // { taskId: "ISO date string" } - when marked complete, for 24h visibility then archive
    extracurricularCurrencyEarned: {}, // { taskId: number } - currency earned when task marked complete (Data tab)
    extracurricularViewMode: "tasks", // "tasks" | "history" - history shows archived (completed >24h ago)
    themeMode: "preset",
    themePreset: "purple",
    themeCustom: null,
    customThemePresets: [],
    defaultResetHour: 4,
    defaultResetTimezone: "Etc/GMT+6", // timezone where default reset (3am) occurs; fixed offset (no DST)
    primaryServer: "america", // used for sidebar display and for preset games when added
    dateFormat: "mdy", // "mdy" | "dmy" | "ymd"
    timeFormat: "12h", // "12h" | "24h"
    firstDayOfWeek: 0, // 0 = Sunday, 1 = Monday
    compactMode: false,
    defaultTab: "about",
    showResetCountdown: true,
    confirmBeforeDelete: true,
    textSize: "medium", // "small" | "medium" | "large"
    lastSimulationSnapshot: null, // snapshot of state before runSimulation, for undo
    dataVersion: 0, // bumped on task/completion mutations; used to invalidate heavy view caches
    schemaVersion: 0, // one-shot data migrations; opinionated repairs live in Settings → Debug
    /** Sync-safe archive: old calendar days dropped; baselines keep tallies correct after Sync. */
    historyCompact: null, // { cutoffDateStr, compactedAt, months, baselines, ... }
    simulatedDateOffset: 0, // days to add to "today" for skip-day simulation (not persisted)
    simulatedHourOffset: 0, // hours to add for skip-time simulation (not persisted)
    lastSkipDaySnapshot: null, // snapshot before first skip (day or hours), for undo
    defaultAdjustForDST: true, // when true, reset times follow DST; when false, use standard time only
  };

  /** Check if a date is in DST for the given timezone. */
  function isDSTInTimezone(tz, date) {
    const d = date || new Date();
    const jan = new Date(d.getFullYear(), 0, 15);
    const jul = new Date(d.getFullYear(), 6, 15);
    const janOffset = getOffsetMinutesForTimezone(tz, jan);
    const julOffset = getOffsetMinutesForTimezone(tz, jul);
    if (janOffset === julOffset) return false;
    const offset = getOffsetMinutesForTimezone(tz, d);
    return offset !== janOffset;
  }

  /** Get nth occurrence of weekday in month (0=Sun..6=Sat). n>0 = nth from start, n<0 = nth from end. */
  function getNthWeekdayOfMonth(year, month, weekday, n) {
    const days = [];
    for (let d = 1; d <= 28; d++) {
      const dt = new Date(year, month, d, 12, 0, 0);
      if (dt.getDay() === weekday) days.push(dt);
    }
    if (n > 0 && n <= days.length) return days[n - 1];
    if (n < 0 && days.length >= -n) return days[days.length + n];
    return days[0] || null;
  }

  /** Get DST transition dates. US: 2nd Sun Mar (spring), 1st Sun Nov (fall). Europe: last Sun Mar, last Sun Oct. */
  function getDSTTransitionDates(tz, year) {
    const y = year || new Date().getFullYear();
    const janOffset = getOffsetMinutesForTimezone(tz, new Date(y, 0, 15));
    const julOffset = getOffsetMinutesForTimezone(tz, new Date(y, 6, 15));
    if (janOffset === julOffset) return null;

    let spring = null;
    let fall = null;
    if (tz.startsWith("America/")) {
      spring = getNthWeekdayOfMonth(y, 2, 0, 2);
      fall = getNthWeekdayOfMonth(y, 10, 0, 1);
    } else if (tz.startsWith("Europe/") && !tz.includes("Istanbul")) {
      spring = getNthWeekdayOfMonth(y, 2, 0, -1);
      fall = getNthWeekdayOfMonth(y, 9, 0, -1);
    } else {
      for (let m = 1; m <= 11; m++) {
        const mid = new Date(y, m, 15);
        const offset = getOffsetMinutesForTimezone(tz, mid);
        const prevMid = new Date(y, m - 1, 15);
        const prevOffset = getOffsetMinutesForTimezone(tz, prevMid);
        if (offset !== prevOffset) {
          const transition = findTransitionDay(tz, y, m, prevOffset, offset);
          if (prevOffset < offset) spring = transition;
          else fall = transition;
        }
      }
    }
    return (spring || fall) ? { spring, fall } : null;
  }

  function findTransitionDay(tz, year, month, fromOffset, toOffset) {
    for (let d = 1; d <= 28; d++) {
      const dt = new Date(year, month, d, 12, 0, 0);
      const offset = getOffsetMinutesForTimezone(tz, dt);
      if (offset === toOffset) return dt;
    }
    return new Date(year, month, 15, 12, 0, 0);
  }

  /** Get offset for standard (non-DST) time - use January. */
  function getStandardOffsetMinutes(tz, year) {
    const y = year || new Date().getFullYear();
    return getOffsetMinutesForTimezone(tz, new Date(y, 0, 15));
  }

  /** Get nth Sunday of month (1-based). US DST: 2nd Sun Mar, 1st Sun Nov. */
  function getNthSundayOfMonth(year, month, n) {
    let d = 1;
    let count = 0;
    while (d <= 28) {
      const dt = new Date(year, month, d);
      if (dt.getDay() === 0) {
        count++;
        if (count === n) return dt;
      }
      d++;
    }
    return new Date(year, month, 1);
  }

  /** Get last Sunday of month. Europe DST: last Sun Mar, last Sun Oct. */
  function getLastSundayOfMonth(year, month) {
    const last = new Date(year, month + 1, 0);
    const day = last.getDay();
    const diff = day === 0 ? 0 : 7 - day;
    return new Date(year, month, last.getDate() - diff);
  }

  /** DST active: tasks at 4am. DST inactive (after 1st Sun Nov for US, after last Sun Oct for Europe): 3am. Asia: no DST, always 4am. */
  function isDstActiveForServer(server, date) {
    const d = date || new Date();
    const y = d.getFullYear();
    if (server === "asia") return true;
    if (server === "america") {
      const start = getNthSundayOfMonth(y, 2, 2);
      const end = getNthSundayOfMonth(y, 10, 1);
      return d >= start && d < end;
    }
    if (server === "europe") {
      const start = getLastSundayOfMonth(y, 2);
      const end = getLastSundayOfMonth(y, 9);
      return d >= start && d < end;
    }
    return true;
  }

  /** Effective reset hour: 4 when DST active, 3 when inactive. Asia always 4. */
  function getEffectiveResetHour(server, date) {
    if (!server || server === "asia") return SERVER_RESET_HOUR_DST;
    return isDstActiveForServer(server, date) ? SERVER_RESET_HOUR_DST : SERVER_RESET_HOUR_STANDARD;
  }

  function getServerTimezone(server) {
    const s = SERVER_OPTIONS.find((o) => o.id === server);
    return s ? s.tz : "Etc/GMT+5";
  }

  /** For display: use base timezone as-is (server uses fixed Etc/GMT). */
  function getDstAwareTimezoneForDisplay(baseTz) {
    if (!baseTz || baseTz === "local") return baseTz === "local" ? Intl.DateTimeFormat().resolvedOptions().timeZone : baseTz;
    return baseTz;
  }

  /** Task timezone: use server timezone when game has server. */
  function getTimezoneForTaskDst(obj, baseTz) {
    return baseTz || "Etc/GMT+5";
  }

  /** Offset ref: use current date for correct DST. */
  function getOffsetRefDateForTask(obj, tz) {
    return getSimulatedNow();
  }

  function getUtcOffsetString(tz, date) {
    const min = getOffsetMinutesForTimezone(tz, date);
    const h = Math.floor(Math.abs(min) / 60);
    const m = Math.abs(min) % 60;
    const sign = min >= 0 ? "+" : "-";
    return "UTC" + sign + h + (m ? ":" + String(m).padStart(2, "0") : "");
  }

  /** Timezone options using Etc/GMT fixed offsets. Format: (UTC±N) Full Name */
  const TIMEZONE_OPTIONS = [
    { value: "local", label: "Local (device time)" },
    { value: "UTC", label: "(UTC+0) Coordinated Universal Time (UTC)" },
    { value: "Etc/GMT-1", label: "(UTC+1) Central European Time (CET)" },
    { value: "Etc/GMT-2", label: "(UTC+2) Eastern European Time (EET)" },
    { value: "Etc/GMT-3", label: "(UTC+3) Moscow Time (MSK)" },
    { value: "Etc/GMT-4", label: "(UTC+4) Armenia Time (AMT)" },
    { value: "Etc/GMT-5", label: "(UTC+5) Pakistan Standard Time (PKT)" },
    { value: "Etc/GMT-6", label: "(UTC+6) Omsk Time (OMSK)" },
    { value: "Etc/GMT-7", label: "(UTC+7) Krasnoyarsk Time (KRAT)" },
    { value: "Etc/GMT-8", label: "(UTC+8) China Standard Time (CST)" },
    { value: "Etc/GMT-9", label: "(UTC+9) Japan Standard Time (JST)" },
    { value: "Etc/GMT-10", label: "(UTC+10) Eastern Australia Standard Time (AEST)" },
    { value: "Etc/GMT-11", label: "(UTC+11) Sakhalin Time (SAKT)" },
    { value: "Etc/GMT-12", label: "(UTC+12) New Zealand Standard Time (NZST)" },
    { value: "Etc/GMT+1", label: "(UTC-1) West Africa Time (WAT)" },
    { value: "Etc/GMT+2", label: "(UTC-2) Azores Time (AT)" },
    { value: "Etc/GMT+3", label: "(UTC-3) Argentina Time (ART)" },
    { value: "Etc/GMT+4", label: "(UTC-4) Atlantic Standard Time (AST)" },
    { value: "Etc/GMT+5", label: "(UTC-5) Eastern Time (ET)" },
    { value: "Etc/GMT+6", label: "(UTC-6) Central Standard Time (CST)" },
    { value: "Etc/GMT+7", label: "(UTC-7) Mountain Standard Time (MST)" },
    { value: "Etc/GMT+8", label: "(UTC-8) Pacific Standard Time (PST)" },
    { value: "Etc/GMT+9", label: "(UTC-9) Alaska Standard Time (AKST)" },
    { value: "Etc/GMT+10", label: "(UTC-10) Hawaii Standard Time (HST)" },
    { value: "Etc/GMT+11", label: "(UTC-11) Nome Time (NT)" },
    { value: "Etc/GMT+12", label: "(UTC-12) International Date Line West (IDLW)" },
  ];

  function getAllTimezones() {
    return TIMEZONE_OPTIONS;
  }

  const COMMON_TIMEZONES = getAllTimezones();

  /** Find the fixed timezone option that matches the user's current local offset. */
  function getMatchingTimezoneForLocalOffset() {
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localOffset = getOffsetMinutesForTimezone(localTz, new Date());
    const match = TIMEZONE_OPTIONS.find((opt) => opt.value !== "local" && getOffsetMinutesForTimezone(opt.value, new Date()) === localOffset);
    return match ? match.value : "Etc/GMT+5";
  }

  function getAppTimezone() {
    const tz = state.defaultResetTimezone || "local";
    if (tz === "local") return Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz;
  }

  function getTimezoneLabelForId(tzId) {
    if (!tzId || tzId === "local") return "Local";
    const opt = COMMON_TIMEZONES.find((o) => o.value === tzId);
    if (opt) return opt.label;
    try {
      const short = new Intl.DateTimeFormat("en", { timeZone: tzId, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName");
      return short ? short.value : tzId;
    } catch (_) {
      return tzId;
    }
  }

  function getTimezoneDisplayLabel() {
    const tz = state.defaultResetTimezone || "local";
    if (tz === "local") return "Local";
    const opt = COMMON_TIMEZONES.find((o) => o.value === tz);
    if (opt) return opt.label;
    try {
      const short = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName");
      return short ? short.value : tz;
    } catch (_) {
      return tz;
    }
  }

  function getDatePartsInTimezone(date, tz) {
    const d = date || new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type);
    return {
      year: parseInt((get("year") || {}).value || "0", 10),
      month: parseInt((get("month") || {}).value || "1", 10) - 1,
      day: parseInt((get("day") || {}).value || "1", 10),
      hour: parseInt((get("hour") || {}).value || "0", 10),
      minute: parseInt((get("minute") || {}).value || "0", 10),
      second: parseInt((get("second") || {}).value || "0", 10),
      weekday: (get("weekday") || {}).value || "Sun",
    };
  }

  function getOffsetMinutesForTimezone(tz, date) {
    try {
      const formatter = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "longOffset" });
      const parts = formatter.formatToParts(date || new Date());
      const tzPart = parts.find((p) => p.type === "timeZoneName");
      if (!tzPart || !tzPart.value) return 0;
      const m = tzPart.value.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
      if (!m) return 0;
      const sign = m[1] === "+" ? -1 : 1;
      const h = parseInt(m[2], 10) || 0;
      const min = parseInt(m[3], 10) || 0;
      return sign * (h * 60 + min);
    } catch (_) {
      return 0;
    }
  }

  /** Create a Date representing (year,month,day,hour,minute) as local time in timezone tz.
   * @param offsetRefDate - optional; when provided, use this date for DST offset (so dateStarted does not affect time logic) */
  function createDateInTimezone(year, month, day, hour, minute, tz, offsetRefDate) {
    const d = new Date(Date.UTC(year, month, day, hour, minute || 0, 0, 0));
    const offset = getOffsetMinutesForTimezone(tz, offsetRefDate || d);
    return new Date(d.getTime() + offset * 60 * 1000);
  }

  function getNextResetDateInTimezone(now, hour, minute, tz, offsetRefDate) {
    const parts = getDatePartsInTimezone(now, tz);
    let todayReset = createDateInTimezone(parts.year, parts.month, parts.day, hour, minute, tz, offsetRefDate);
    if (now >= todayReset) {
      const todayStart = createDateInTimezone(parts.year, parts.month, parts.day, 0, 0, tz, offsetRefDate);
      const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      const parts2 = getDatePartsInTimezone(tomorrowStart, tz);
      todayReset = createDateInTimezone(parts2.year, parts2.month, parts2.day, hour, minute, tz, offsetRefDate);
    }
    return todayReset;
  }

  const THEME_PRESET_IDS_UNIQUE = ["white", "pink", "rose", "red", "orange", "yellow", "green", "teal", "aqua", "blue", "indigo", "violet", "purple", "gray", "grayscale", "black"];

  const COLOR_LAYERS = [
    { id: "bg", label: "Background", cssVar: "bg" },
    { id: "bgElevated", label: "Elevated background", cssVar: "bg-elevated" },
    { id: "bgPanel", label: "Panel background", cssVar: "bg-panel" },
    { id: "text", label: "Text", cssVar: "text" },
    { id: "textMuted", label: "Muted text", cssVar: "text-muted" },
    { id: "accent", label: "Accent", cssVar: "accent" },
    { id: "accentHover", label: "Accent hover", cssVar: "accent-hover" },
    { id: "accentActive", label: "Accent active", cssVar: "accent-active" },
    { id: "border", label: "Border", cssVar: "border" },
    { id: "success", label: "Success", cssVar: "success" },
    { id: "pieDailies", label: "Dailies (charts)", cssVar: "pie-dailies" },
    { id: "pieWeeklies", label: "Weeklies (charts)", cssVar: "pie-weeklies" },
    { id: "pieEndgame", label: "Endgame (charts)", cssVar: "pie-endgame" },
    { id: "pieMissed", label: "Missed (charts)", cssVar: "pie-missed" },
  ];

  const DEFAULT_CUSTOM_THEME = {
    bg: "#0c0a12",
    bgElevated: "#1a1526",
    bgPanel: "#13101c",
    text: "#f5f2fa",
    textMuted: "#a8a0b8",
    accent: "#a855f7",
    accentHover: "#c084fc",
    accentActive: "#9333ea",
    border: "#2e2740",
    success: "#6bbf8a",
    pieDailies: "#87ceeb",
    pieWeeklies: "#20b2aa",
    pieEndgame: "#50c878",
    pieMissed: "#ff7f50",
  };

  /** Migrate old IANA timezone IDs to fixed Etc/GMT offsets (no DST). */
  function migrateTimezoneToFixed(tz) {
    if (!tz || tz === "local" || tz === "UTC" || tz.startsWith("Etc/GMT")) return tz;
    const map = {
      "Europe/Paris": "Etc/GMT-1", "Europe/Athens": "Etc/GMT-2", "Europe/Moscow": "Etc/GMT-3",
      "Asia/Yerevan": "Etc/GMT-4", "Asia/Karachi": "Etc/GMT-5", "Asia/Omsk": "Etc/GMT-6",
      "Asia/Krasnoyarsk": "Etc/GMT-7", "Asia/Shanghai": "Etc/GMT-8", "Asia/Tokyo": "Etc/GMT-9",
      "Australia/Sydney": "Etc/GMT-10", "Asia/Sakhalin": "Etc/GMT-11", "Pacific/Auckland": "Etc/GMT-12",
      "Africa/Lagos": "Etc/GMT+1", "Atlantic/Azores": "Etc/GMT+2", "America/Buenos_Aires": "Etc/GMT+3",
      "America/Halifax": "Etc/GMT+4", "America/New_York": "Etc/GMT+5", "America/Chicago": "Etc/GMT+6",
      "America/Denver": "Etc/GMT+7", "America/Los_Angeles": "Etc/GMT+8", "America/Anchorage": "Etc/GMT+9",
      "Pacific/Honolulu": "Etc/GMT+10", "Pacific/Midway": "Etc/GMT+11",
    };
    return map[tz] || tz;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_SLIM_KEY);
      applySavePayload(raw ? JSON.parse(raw) : null, { isFirstLoad: !raw });
    } catch (_) {
      applySavePayload(null, { isFirstLoad: true });
    }
  }

  function applySavePayload(parsed, opts) {
    const isFirstLoad = !!(opts && opts.isFirstLoad) || !parsed;
    try {
      if (parsed) {
        if (parsed.games) {
          state.games = parsed.games;
          state.games.forEach((g) => {
            if (!g.server || !["america", "asia", "europe"].includes(g.server)) g.server = "america";
          });
        }
        if (parsed.dailiesCompleted) {
          state.dailiesCompleted = parsed.dailiesCompleted;
          Object.keys(state.dailiesCompleted).forEach((k) => {
            const v = state.dailiesCompleted[k];
            if (typeof v === "boolean") state.dailiesCompleted[k] = v ? 1 : 0;
            else state.dailiesCompleted[k] = Math.max(0, Number(v) || 0);
          });
        }
        if (parsed.weekliesCompleted) {
          state.weekliesCompleted = parsed.weekliesCompleted;
          Object.keys(state.weekliesCompleted).forEach((k) => {
            const v = state.weekliesCompleted[k];
            if (typeof v === "boolean") state.weekliesCompleted[k] = v ? 1 : 0;
            else state.weekliesCompleted[k] = Math.max(0, Number(v) || 0);
          });
        }
        if (parsed.endgameCompleted) {
          state.endgameCompleted = parsed.endgameCompleted;
          Object.keys(state.endgameCompleted).forEach((k) => {
            const v = state.endgameCompleted[k];
            if (typeof v === "boolean") state.endgameCompleted[k] = v ? 1 : 0;
            else state.endgameCompleted[k] = Math.max(0, Number(v) || 0);
          });
        }
        if (parsed.endgameCompletionDates) state.endgameCompletionDates = parsed.endgameCompletionDates;
        if (parsed.endgameCurrencyEarned) {
          state.endgameCurrencyEarned = parsed.endgameCurrencyEarned;
          Object.keys(state.endgameCurrencyEarned || {}).forEach((gameId) => {
            const byTask = state.endgameCurrencyEarned[gameId] || {};
            Object.keys(byTask).forEach((taskId) => {
              const v = byTask[taskId];
              if (typeof v === "number") byTask[taskId] = [v];
              else if (!Array.isArray(v)) byTask[taskId] = [];
            });
          });
        }
        if (parsed.endgameCurrencyPotential) {
          state.endgameCurrencyPotential = parsed.endgameCurrencyPotential;
          Object.keys(state.endgameCurrencyPotential || {}).forEach((gameId) => {
            const byTask = state.endgameCurrencyPotential[gameId] || {};
            Object.keys(byTask).forEach((taskId) => {
              const v = byTask[taskId];
              if (typeof v === "number") byTask[taskId] = [v];
              else if (!Array.isArray(v)) byTask[taskId] = [];
            });
          });
        }
        if (parsed.endgamePendingCurrency && typeof parsed.endgamePendingCurrency === "object") {
          state.endgamePendingCurrency = parsed.endgamePendingCurrency;
        }
        if (parsed.endgamePendingCycleStartMs && typeof parsed.endgamePendingCycleStartMs === "object") {
          state.endgamePendingCycleStartMs = parsed.endgamePendingCycleStartMs;
        }
        if (parsed.dailiesAttempted) {
          state.dailiesAttempted = parsed.dailiesAttempted;
          Object.keys(state.dailiesAttempted).forEach((k) => {
            state.dailiesAttempted[k] = Math.max(0, Number(state.dailiesAttempted[k]) || 0);
          });
        }
        if (parsed.weekliesAttempted) {
          state.weekliesAttempted = parsed.weekliesAttempted;
          Object.keys(state.weekliesAttempted).forEach((k) => {
            state.weekliesAttempted[k] = Math.max(0, Number(state.weekliesAttempted[k]) || 0);
          });
        }
        if (parsed.endgameAttempted) {
          state.endgameAttempted = parsed.endgameAttempted;
          Object.keys(state.endgameAttempted).forEach((k) => {
            state.endgameAttempted[k] = Math.max(0, Number(state.endgameAttempted[k]) || 0);
          });
        }
        if (parsed.completionByDate) state.completionByDate = parsed.completionByDate;
        if (Array.isArray(parsed.completionTimestamps)) state.completionTimestamps = parsed.completionTimestamps;
        if (parsed.timestampsSelectedGameIds && typeof parsed.timestampsSelectedGameIds === "object") state.timestampsSelectedGameIds = parsed.timestampsSelectedGameIds;
        if (parsed.timestampsSelectedEndgameTasks && typeof parsed.timestampsSelectedEndgameTasks === "object") state.timestampsSelectedEndgameTasks = parsed.timestampsSelectedEndgameTasks;
        if (typeof parsed.timestampsEndgamePickerGameId === "string") state.timestampsEndgamePickerGameId = parsed.timestampsEndgamePickerGameId;
        if (parsed.lastProcessedResets) state.lastProcessedResets = parsed.lastProcessedResets;
        if (parsed.dataSelectedGameId != null) state.dataSelectedGameId = parsed.dataSelectedGameId;
        if (parsed.gamesSelectedId != null) state.gamesSelectedId = parsed.gamesSelectedId;
        if (parsed.attendancePieInclude && typeof parsed.attendancePieInclude === "object") state.attendancePieInclude = parsed.attendancePieInclude;
        if (parsed.dataPieInclude && typeof parsed.dataPieInclude === "object") state.dataPieInclude = parsed.dataPieInclude;
        if (parsed.dataExcludeInProgress && typeof parsed.dataExcludeInProgress === "object") state.dataExcludeInProgress = parsed.dataExcludeInProgress;
        if (parsed.dataHideDates && typeof parsed.dataHideDates === "object") state.dataHideDates = parsed.dataHideDates;
        if (parsed.attendanceView === "weekly" || parsed.attendanceView === "history" || parsed.attendanceView === "timestamps") state.attendanceView = parsed.attendanceView;
        if (parsed.historyMonth != null && parsed.historyMonth >= 0 && parsed.historyMonth <= 11) state.historyMonth = parsed.historyMonth;
        if (parsed.historyYear != null && Number.isFinite(parsed.historyYear)) state.historyYear = parsed.historyYear;
        if (Array.isArray(parsed.extracurricularTasks)) state.extracurricularTasks = parsed.extracurricularTasks;
        if (Array.isArray(parsed.userImageLibrary)) {
          state.userImageLibrary = normalizeLoadedUserImageLibrary(parsed.userImageLibrary);
        }
        if (parsed.extracurricularCompleted && typeof parsed.extracurricularCompleted === "object") state.extracurricularCompleted = parsed.extracurricularCompleted;
        if (parsed.extracurricularCompletedAt && typeof parsed.extracurricularCompletedAt === "object") state.extracurricularCompletedAt = parsed.extracurricularCompletedAt;
        if (parsed.extracurricularCurrencyEarned && typeof parsed.extracurricularCurrencyEarned === "object") state.extracurricularCurrencyEarned = parsed.extracurricularCurrencyEarned;
        if (parsed.extracurricularViewMode === "tasks" || parsed.extracurricularViewMode === "history") state.extracurricularViewMode = parsed.extracurricularViewMode;
        if (parsed.themeMode === "custom" || parsed.themeMode === "preset") state.themeMode = parsed.themeMode;
        if (parsed.themePreset && typeof parsed.themePreset === "string") state.themePreset = parsed.themePreset;
        if (parsed.themeCustom && typeof parsed.themeCustom === "object") state.themeCustom = parsed.themeCustom;
        if (Array.isArray(parsed.customThemePresets)) state.customThemePresets = parsed.customThemePresets;
        if (parsed.theme && typeof parsed.theme === "string" && !parsed.themePreset) {
          state.themePreset = parsed.theme;
        }
        if (!state.themeMode) state.themeMode = "preset";
        if (Number.isFinite(parsed.defaultResetHour) && parsed.defaultResetHour >= 0 && parsed.defaultResetHour <= 23) state.defaultResetHour = parsed.defaultResetHour;
        if (["mdy", "dmy", "ymd"].includes(parsed.dateFormat)) state.dateFormat = parsed.dateFormat;
        if (["12h", "24h"].includes(parsed.timeFormat)) state.timeFormat = parsed.timeFormat;
        if (parsed.firstDayOfWeek === 0 || parsed.firstDayOfWeek === 1) state.firstDayOfWeek = parsed.firstDayOfWeek;
        if (typeof parsed.compactMode === "boolean") state.compactMode = parsed.compactMode;
        if (["about", "home", "dailies", "weeklies", "endgame", "attendance", "extracurricular", "data", "games"].includes(parsed.defaultTab)) state.defaultTab = parsed.defaultTab;
        if (typeof parsed.showResetCountdown === "boolean") state.showResetCountdown = parsed.showResetCountdown;
        if (typeof parsed.confirmBeforeDelete === "boolean") state.confirmBeforeDelete = parsed.confirmBeforeDelete;
        if (["small", "medium", "large"].includes(parsed.textSize)) state.textSize = parsed.textSize;
        if (parsed.lastSimulationSnapshot && typeof parsed.lastSimulationSnapshot === "object") state.lastSimulationSnapshot = parsed.lastSimulationSnapshot;
        if (Number.isFinite(parsed.dataVersion)) state.dataVersion = parsed.dataVersion;
        if (Number.isFinite(parsed.schemaVersion)) state.schemaVersion = parsed.schemaVersion;
        if (parsed.historyCompact && typeof parsed.historyCompact === "object") state.historyCompact = parsed.historyCompact;
        if (parsed.defaultResetTimezone && (parsed.defaultResetTimezone === "UTC" || parsed.defaultResetTimezone === "local" || (typeof parsed.defaultResetTimezone === "string" && parsed.defaultResetTimezone.includes("/")))) {
          state.defaultResetTimezone = parsed.defaultResetTimezone === "local" ? "local" : migrateTimezoneToFixed(parsed.defaultResetTimezone);
        }
        if (parsed.timezone && !parsed.defaultResetTimezone && (parsed.timezone === "local" || parsed.timezone === "UTC" || (typeof parsed.timezone === "string" && parsed.timezone.includes("/")))) {
          state.defaultResetTimezone = parsed.timezone === "local" ? "local" : migrateTimezoneToFixed(parsed.timezone);
        }
        if (typeof parsed.defaultAdjustForDST === "boolean") state.defaultAdjustForDST = parsed.defaultAdjustForDST;
        if (parsed.primaryServer && ["america", "asia", "europe"].includes(parsed.primaryServer)) state.primaryServer = parsed.primaryServer;
      }
      if (isFirstLoad) {
        state.defaultResetTimezone = "local";
      }
    } catch (_) {}
    if (state.games.length === 0) ensureTestGame();
    if (!state.completionByDate) state.completionByDate = {};
    if (!state.completionTimestamps) state.completionTimestamps = [];
    if (!state.timestampsSelectedGameIds) state.timestampsSelectedGameIds = {};
    if (!state.timestampsSelectedEndgameTasks) state.timestampsSelectedEndgameTasks = {};
    if (state.timestampsEndgamePickerGameId == null) state.timestampsEndgamePickerGameId = null;
    if (!state.lastProcessedResets) state.lastProcessedResets = { dailies: {}, weeklies: {}, endgame: {} };
    if (!state.endgamePendingCurrency) state.endgamePendingCurrency = {};
    if (!state.endgamePendingCycleStartMs) state.endgamePendingCycleStartMs = {};
    if (!state.endgameCurrencyPotential) state.endgameCurrencyPotential = {};
    // Schema migrations run once. Opinionated history repairs are Settings → Debug / Data.
    migrateSchemaIfNeeded();
    if (!state.extracurricularCompletedAt) state.extracurricularCompletedAt = {};
    if (!Array.isArray(state.userImageLibrary)) state.userImageLibrary = [];
    if (!state.extracurricularCurrencyEarned) state.extracurricularCurrencyEarned = {};
    if (!state.extracurricularViewMode) state.extracurricularViewMode = "tasks";
    const taskIds = new Set((state.extracurricularTasks || []).map((t) => t.id));
    Object.keys(state.extracurricularCompletedAt || {}).forEach((id) => {
      if (!taskIds.has(id)) delete state.extracurricularCompletedAt[id];
    });
    Object.keys(state.extracurricularCompleted || {}).forEach((id) => {
      if (!taskIds.has(id)) delete state.extracurricularCompleted[id];
    });
    Object.keys(state.extracurricularCurrencyEarned || {}).forEach((id) => {
      if (!taskIds.has(id)) delete state.extracurricularCurrencyEarned[id];
    });
    (state.games || []).forEach((g) => {
      if (g && g.dailyCurrency == null) g.dailyCurrency = 0;
      if (g && g.currencyPerPull == null) g.currencyPerPull = 0;
      if (g && g.currencyName == null) g.currencyName = "";
      if (g && g.adjustForDST === undefined) g.adjustForDST = true;
      (g.weeklies || []).forEach((t) => {
        if (t && t.currency == null) t.currency = 0;
        if (t && t.adjustForDST === undefined) t.adjustForDST = true;
      });
      (g.endgame || []).forEach((t) => {
        if (t && t.currency == null) t.currency = 0;
        if (t && t.adjustForDST === undefined) t.adjustForDST = true;
      });
    });
    applyTheme();
    applyTextSize();
    applyCompactMode();
  }

  function getDefaultResetHour() {
    return Number.isFinite(state.defaultResetHour) ? state.defaultResetHour : DEFAULT_RESET_HOUR;
  }

  function getDefaultTimeStr() {
    const h = getDefaultResetHour();
    return String(Math.min(23, Math.max(0, h | 0))).padStart(2, "0") + ":00";
  }

  /** Timezone where reset occurs: server timezone for games with server, else user's display timezone. */
  function getResetTimezoneForGame(game) {
    const server = game && game.server;
    if (server) return getServerTimezone(server);
    const defTz = state.defaultResetTimezone || "Etc/GMT+5";
    if (defTz === "local") return Intl.DateTimeFormat().resolvedOptions().timeZone;
    return defTz;
  }

  /** Timezone used for all date logic (getDateStr, today, calendar, recording). Keeps task/tally/calendar consistent. */
  function getRecordingTimezone() {
    const defTz = state.defaultResetTimezone || "Etc/GMT+6";
    if (defTz === "local") return Intl.DateTimeFormat().resolvedOptions().timeZone;
    return defTz;
  }

  /** Get reset hour: for server-based games uses effective hour (4 when DST, 3 when not) when adjustForDST is on. Falls back to stored value or default. */
  function getResetHour(obj, hourKey, defaultHour, game, date) {
    const server = game && game.server;
    if (server) {
      const adjust = obj && obj.adjustForDST !== false;
      const effective = adjust ? getEffectiveResetHour(server, date || new Date()) : SERVER_RESET_HOUR_DST;
      const stored = Number.isFinite(obj && obj[hourKey]) ? obj[hourKey] : null;
      return stored != null ? stored : effective;
    }
    const fallback = defaultHour != null ? defaultHour : getDefaultResetHour();
    return Number.isFinite(obj && obj[hourKey]) ? obj[hourKey] : fallback;
  }

  function cloneTaskWithoutImages(task) {
    if (!task || typeof task !== "object") return task;
    const c = Object.assign({}, task);
    delete c.bannerSourceImage;
    delete c.bannerImage;
    delete c.bannerHomeImage;
    delete c.bannerGamesImage;
    delete c.bannerHomeAspect;
    delete c.bannerGamesAspect;
    return c;
  }

  function cloneGameWithoutImages(game) {
    if (!game || typeof game !== "object") return game;
    const c = Object.assign({}, game);
    delete c.iconImage;
    c.weeklies = Array.isArray(game.weeklies) ? game.weeklies.map(cloneTaskWithoutImages) : game.weeklies;
    c.endgame = Array.isArray(game.endgame) ? game.endgame.map(cloneTaskWithoutImages) : game.endgame;
    return c;
  }

  function buildSavePayload(opts) {
    const omitImages = !!(opts && opts.omitImages);
    return {
      games: omitImages ? (state.games || []).map(cloneGameWithoutImages) : state.games,
      dailiesCompleted: state.dailiesCompleted,
      weekliesCompleted: state.weekliesCompleted,
      endgameCompleted: state.endgameCompleted,
      dailiesAttempted: state.dailiesAttempted,
      weekliesAttempted: state.weekliesAttempted,
      endgameAttempted: state.endgameAttempted,
      endgameCurrencyEarned: state.endgameCurrencyEarned,
      endgameCurrencyPotential: state.endgameCurrencyPotential,
      endgamePendingCurrency: state.endgamePendingCurrency,
      endgamePendingCycleStartMs: state.endgamePendingCycleStartMs,
      endgameCompletionDates: state.endgameCompletionDates,
      completionByDate: state.completionByDate,
      lastProcessedResets: state.lastProcessedResets,
      dataSelectedGameId: state.dataSelectedGameId,
      gamesSelectedId: state.gamesSelectedId,
      attendancePieInclude: state.attendancePieInclude,
      dataPieInclude: state.dataPieInclude,
      dataExcludeInProgress: state.dataExcludeInProgress,
      dataHideDates: state.dataHideDates,
      attendanceView: state.attendanceView,
      timestampsSelectedGameIds: state.timestampsSelectedGameIds,
      timestampsSelectedEndgameTasks: state.timestampsSelectedEndgameTasks,
      timestampsEndgamePickerGameId: state.timestampsEndgamePickerGameId,
      completionTimestamps: state.completionTimestamps,
      historyMonth: state.historyMonth,
      historyYear: state.historyYear,
      extracurricularTasks: omitImages
        ? (state.extracurricularTasks || []).map(cloneTaskWithoutImages)
        : state.extracurricularTasks,
      userImageLibrary: cloneUserImageLibraryForSave(omitImages),
      extracurricularCompleted: state.extracurricularCompleted,
      extracurricularCompletedAt: state.extracurricularCompletedAt,
      extracurricularCurrencyEarned: state.extracurricularCurrencyEarned,
      extracurricularViewMode: state.extracurricularViewMode,
      themeMode: state.themeMode,
      themePreset: state.themePreset,
      themeCustom: state.themeCustom,
      customThemePresets: state.customThemePresets,
      defaultResetHour: state.defaultResetHour,
      defaultResetTimezone: state.defaultResetTimezone || "Etc/GMT+6",
      dateFormat: state.dateFormat,
      timeFormat: state.timeFormat,
      firstDayOfWeek: state.firstDayOfWeek,
      compactMode: state.compactMode,
      defaultTab: state.defaultTab,
      showResetCountdown: state.showResetCountdown,
      confirmBeforeDelete: state.confirmBeforeDelete,
      textSize: state.textSize,
      lastSimulationSnapshot: state.lastSimulationSnapshot,
      dataVersion: state.dataVersion || 0,
      schemaVersion: state.schemaVersion || 0,
      defaultAdjustForDST: state.defaultAdjustForDST,
      primaryServer: state.primaryServer || "america",
      historyCompact: state.historyCompact || null,
    };
  }

  const SAVE_DEBOUNCE_MS = 200;
  let saveTimer = null;
  let pendingSaveJson = null;
  /**
   * Persistence mode — swap later without rewriting call sites:
   * - "localPrimary": IndexedDB is source of truth; cloud (__cloudSave) is optional mirror when signed in.
   * - "cloudPrimary" (future): Firestore is source of truth; IndexedDB (+ slim localStorage) is offline backup.
   *
   * Hooks used by both modes:
   * - persistLocalFull(jsonStr) / initPersistentStorage()
   * - window.__cloudSave(jsonStr) / window.__applyCloudData(jsonStr)
   */
  const PERSISTENCE_MODE = "localPrimary";
  let storageBackend = "local"; // "local" until IDB is ready, then "idb"
  let idbOpenPromise = null;

  function readStorageMeta() {
    try {
      const raw = localStorage.getItem(STORAGE_META_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeStorageMeta(meta) {
    try {
      localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta || {}));
    } catch (_) {}
  }

  function openTrackerIdb() {
    if (idbOpenPromise) return idbOpenPromise;
    idbOpenPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB unavailable"));
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
    return idbOpenPromise;
  }

  function idbGetFullJson() {
    return openTrackerIdb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_FULL_RECORD);
      req.onsuccess = () => {
        const val = req.result;
        if (typeof val === "string" && val) resolve(val);
        else if (val && typeof val === "object" && typeof val.json === "string") resolve(val.json);
        else resolve(null);
      };
      req.onerror = () => reject(req.error || new Error("IndexedDB get failed"));
    }));
  }

  function idbPutFullJson(jsonStr) {
    return openTrackerIdb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(String(jsonStr || ""), IDB_FULL_RECORD);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error("IndexedDB put failed"));
    }));
  }

  /** Game-day key for primary server reset (e.g. America ~4:00). */
  function getPrimaryServerPeriodDateStr(now) {
    const server = state.primaryServer || "america";
    const probe = { server: server, adjustForDST: true };
    return getDailyPeriodDateStr(probe, now || getSimulatedNow());
  }

  function maybeWriteDailySlimBackup(force) {
    try {
      const dateKey = getPrimaryServerPeriodDateStr();
      const meta = readStorageMeta();
      if (!force && meta.lastSlimBackupDate === dateKey) return false;
      const slimJson = JSON.stringify(buildSavePayload({ omitImages: true }));
      localStorage.setItem(STORAGE_SLIM_KEY, slimJson);
      meta.backend = "idb";
      meta.lastSlimBackupDate = dateKey;
      meta.lastSlimBackupAt = Date.now();
      writeStorageMeta(meta);
      return true;
    } catch (_) {
      return false;
    }
  }

  function persistLocalFull(jsonStr) {
    if (storageBackend === "idb") {
      return idbPutFullJson(jsonStr)
        .then(() => {
          lastSavedAtMs = Date.now();
          updateLastSavedIndicator(false);
          maybeWriteDailySlimBackup(false);
        })
        .catch(() => {
          updateLastSavedIndicator(true);
        });
    }
    try {
      localStorage.setItem(STORAGE_KEY, jsonStr);
      lastSavedAtMs = Date.now();
      updateLastSavedIndicator(false);
    } catch (_) {
      updateLastSavedIndicator(true);
    }
    return Promise.resolve();
  }

  function persistCloudMirror(jsonStr) {
    try {
      if (typeof window.__cloudSave === "function") {
        const ret = window.__cloudSave(jsonStr);
        return ret && typeof ret.then === "function" ? ret : Promise.resolve();
      }
    } catch (_) {}
    return Promise.resolve();
  }

  function writeSavePayload(jsonStr) {
    // localPrimary today: write local first, then best-effort cloud mirror.
    // cloudPrimary later: reverse order (cloud first) and treat IndexedDB as backup in persistLocalFull.
    if (PERSISTENCE_MODE === "cloudPrimary") {
      persistCloudMirror(jsonStr).finally(function () {
        persistLocalFull(jsonStr);
      });
      return;
    }
    persistLocalFull(jsonStr);
    persistCloudMirror(jsonStr);
  }

  async function initPersistentStorage() {
    let parsed = null;
    let source = "none";
    try {
      const idbJson = await idbGetFullJson();
      if (idbJson) {
        parsed = JSON.parse(idbJson);
        source = "idb";
      }
    } catch (_) {}

    if (!parsed) {
      try {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          parsed = JSON.parse(legacy);
          source = "legacy";
        }
      } catch (_) {}
    }

    if (!parsed) {
      try {
        const slim = localStorage.getItem(STORAGE_SLIM_KEY);
        if (slim) {
          parsed = JSON.parse(slim);
          source = "slim";
        }
      } catch (_) {}
    }

    applySavePayload(parsed, { isFirstLoad: !parsed });
    storageBackend = "idb";

    try {
      const fullJson = JSON.stringify(buildSavePayload());
      await idbPutFullJson(fullJson);
      const meta = readStorageMeta();
      meta.backend = "idb";
      meta.migratedFrom = source;
      meta.migratedAt = Date.now();
      writeStorageMeta(meta);
      if (source === "legacy") {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      }
      // Ensure a slim no-image backup exists after migrate / first boot.
      maybeWriteDailySlimBackup(source !== "idb" || !localStorage.getItem(STORAGE_SLIM_KEY));
    } catch (_) {
      // Fall back to localStorage full saves if IDB write fails.
      storageBackend = "local";
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSavePayload()));
      } catch (_) {}
    }
  }

  window.initPersistentStorage = initPersistentStorage;

  const PERF_DEBUG_KEY = "gacha-tracker-debug-perf";

  function isPerfDebugEnabled() {
    try {
      return localStorage.getItem(PERF_DEBUG_KEY) === "1" || !!state.debugPerf;
    } catch (_) {
      return false;
    }
  }

  function perfLog(label, ms, detail) {
    if (!isPerfDebugEnabled()) return;
    if (detail != null) console.log("[perf] " + label + ": " + ms.toFixed(1) + "ms", detail);
    else console.log("[perf] " + label + ": " + ms.toFixed(1) + "ms");
  }

  function perfMeasure(label, fn) {
    if (!isPerfDebugEnabled()) return fn();
    const t0 = performance.now();
    const result = fn();
    perfLog(label, performance.now() - t0);
    return result;
  }

  window.enablePerfDebug = function () {
    try { localStorage.setItem(PERF_DEBUG_KEY, "1"); } catch (_) {}
    console.log("[perf] Timing logs enabled. Interact with the app to see measurements.");
  };

  window.disablePerfDebug = function () {
    try { localStorage.removeItem(PERF_DEBUG_KEY); } catch (_) {}
    console.log("[perf] Timing logs disabled.");
  };

  let tallyCacheDepth = 0;
  let tallyCacheFrame = null;

  function beginTallyCacheFrame() {
    if (tallyCacheDepth === 0) tallyCacheFrame = new Map();
    tallyCacheDepth++;
  }

  function endTallyCacheFrame() {
    tallyCacheDepth--;
    if (tallyCacheDepth <= 0) {
      tallyCacheDepth = 0;
      tallyCacheFrame = null;
    }
  }

  function tallyCacheGet(key) {
    return tallyCacheFrame ? tallyCacheFrame.get(key) : undefined;
  }

  function tallyCacheSet(key, value) {
    if (tallyCacheFrame) tallyCacheFrame.set(key, value);
  }

  function bumpDataVersion() {
    state.dataVersion = (state.dataVersion || 0) + 1;
  }

  window.bumpDataVersion = bumpDataVersion;

  let lastSavedAtMs = null;

  function updateLastSavedIndicator(failed) {
    const el = document.getElementById("sidebarLastSaved");
    if (!el) return;
    if (failed) {
      el.textContent = "Save failed — storage full?";
      el.classList.add("sidebar-last-saved-error");
      return;
    }
    el.classList.remove("sidebar-last-saved-error");
    if (!lastSavedAtMs) {
      el.textContent = "";
      return;
    }
    const d = new Date(lastSavedAtMs);
    const timeStr = typeof formatTime === "function" ? formatTime(d) : d.toLocaleTimeString();
    el.textContent = "Saved " + timeStr;
  }

  function flushPendingSave() {
    if (!pendingSaveJson) return;
    try {
      const json = pendingSaveJson;
      pendingSaveJson = null;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (isPerfDebugEnabled()) perfMeasure("save.flush", () => writeSavePayload(json));
      else writeSavePayload(json);
      // IndexedDB path updates the indicator when the write resolves.
      if (storageBackend !== "idb") {
        lastSavedAtMs = Date.now();
        updateLastSavedIndicator(false);
      }
    } catch (_) {
      pendingSaveJson = null;
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      updateLastSavedIndicator(true);
    }
  }

  function saveImpl(opts) {
    const options = opts || {};
    const payload = buildSavePayload();
    const jsonStr = JSON.stringify(payload);
    if (options.immediate) {
      pendingSaveJson = jsonStr;
      flushPendingSave();
      return;
    }
    pendingSaveJson = jsonStr;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      flushPendingSave();
    }, SAVE_DEBOUNCE_MS);
  }

  function save(opts) {
    try {
      if (isPerfDebugEnabled()) perfMeasure("save", () => saveImpl(opts));
      else saveImpl(opts);
    } catch (_) {
      updateLastSavedIndicator(true);
    }
  }

  window.flushPendingSave = flushPendingSave;

  window.__applyCloudData = function (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      applySavePayload(parsed, { isFirstLoad: false });
      storageBackend = "idb";
      save({ immediate: true });
      renderAll();
    } catch (_) {
      try {
        localStorage.setItem(STORAGE_KEY, jsonStr);
        load();
        renderAll();
      } catch (__) {}
    }
  };

  window.__uploadLocalToCloud = function () { save({ immediate: true }); };

  function ensureTestGame() {
    if (state.games.some((g) => g.name === "Test")) return;
    state.games.unshift({
      id: "test_" + Date.now(),
      name: "Test",
      server: "america",
      resetHour: getDefaultResetHour(),
      dailies: true,
      dailyCurrency: 60,
      currencyPerPull: 160,
      currencyName: "",
      weeklies: [
        { id: "w1", label: "Weekly mission", weekStartDay: 0, weekStartHour: getDefaultResetHour(), currency: 100 },
      ],
      endgame: [
        { id: "e1", label: "Boss", currency: 400 },
        { id: "e2", label: "Abyss", currency: 600 },
      ],
    });
    state.gamesSelectedId = state.games[0].id;
    if (state.dataSelectedGameId == null) state.dataSelectedGameId = state.games[0].id;
    save();
  }

  function parseCssColorToRgb(color) {
    if (!color || typeof color !== "string") return null;
    const s = color.trim();
    const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      let h = hex[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }
    const rgb = s.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i);
    if (rgb) {
      return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
    }
    return null;
  }

  /** Relative luminance (WCAG). Dark surface when < ~0.45. */
  function isDarkCssColor(color) {
    const rgb = parseCssColorToRgb(color);
    if (!rgb) return true;
    const lin = (c) => {
      const v = Math.max(0, Math.min(255, c)) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
    return L < 0.45;
  }

  function applyNativeControlScheme(root, bgColor) {
    if (!root) return;
    const dark = isDarkCssColor(bgColor);
    root.style.colorScheme = dark ? "dark" : "light";
    root.style.setProperty("--native-picker-icon-filter", dark ? "invert(1)" : "none");
  }

  function clearNativeControlScheme(root) {
    if (!root) return;
    root.style.colorScheme = "";
    root.style.removeProperty("--native-picker-icon-filter");
  }

  function applyTheme() {
    const root = document.documentElement;
    if (!root) return;
    const customPreset = state.themePreset && state.themePreset.startsWith("custom_")
      ? state.customThemePresets.find((p) => p.id === state.themePreset)
      : null;
    if (state.themeMode === "custom" && state.themeCustom) {
      root.setAttribute("data-theme", "custom");
      COLOR_LAYERS.forEach((layer) => {
        const val = state.themeCustom[layer.id];
        if (val) root.style.setProperty("--" + layer.cssVar, val);
      });
      applyNativeControlScheme(root, state.themeCustom.bg || DEFAULT_CUSTOM_THEME.bg);
    } else if (customPreset && customPreset.colors) {
      root.setAttribute("data-theme", "custom");
      COLOR_LAYERS.forEach((layer) => {
        const val = customPreset.colors[layer.id];
        if (val) root.style.setProperty("--" + layer.cssVar, val);
      });
      applyNativeControlScheme(root, customPreset.colors.bg || DEFAULT_CUSTOM_THEME.bg);
    } else {
      root.style.removeProperty("--bg");
      root.style.removeProperty("--bg-elevated");
      root.style.removeProperty("--bg-panel");
      root.style.removeProperty("--text");
      root.style.removeProperty("--text-muted");
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-hover");
      root.style.removeProperty("--accent-active");
      root.style.removeProperty("--border");
      root.style.removeProperty("--success");
      root.style.removeProperty("--pie-dailies");
      root.style.removeProperty("--pie-weeklies");
      root.style.removeProperty("--pie-endgame");
      root.style.removeProperty("--pie-extracurricular");
      root.style.removeProperty("--pie-missed");
      clearNativeControlScheme(root);
      const preset = THEME_PRESET_IDS_UNIQUE.includes(state.themePreset) ? state.themePreset : "purple";
      root.setAttribute("data-theme", preset);
    }
  }

  function applyTextSize() {
    const root = document.documentElement;
    if (!root) return;
    const size = state.textSize || "medium";
    root.setAttribute("data-text-size", size);
  }

  function applyCompactMode() {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute("data-compact", state.compactMode ? "true" : "false");
  }

  function getAllGames() {
    return state.games;
  }

  function getGame(id) {
    return state.games.find((g) => g.id === id);
  }

  function reorderGame(draggedGameId, targetGameId) {
    const fromIdx = state.games.findIndex((g) => g.id === draggedGameId);
    let toIdx = state.games.findIndex((g) => g.id === targetGameId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [game] = state.games.splice(fromIdx, 1);
    if (fromIdx < toIdx) toIdx--;
    state.games.splice(toIdx, 0, game);
    save();
    renderActiveTab();
  }

  function pad2(n) {
    const s = String(Math.max(0, n | 0));
    return s.length < 2 ? "0" + s : s;
  }

  function timeToStr(hour, minute) {
    const h = Number.isFinite(hour) ? hour : getDefaultResetHour();
    const m = Number.isFinite(minute) ? minute : 0;
    return pad2(h) + ":" + pad2(m);
  }

  function parseTimeStr(str) {
    const m = String(str || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return { hour: getDefaultResetHour(), minute: 0 };
    const hour = Math.min(23, Math.max(0, parseInt(m[1], 10) || 0));
    const minute = Math.min(59, Math.max(0, parseInt(m[2], 10) || 0));
    return { hour, minute };
  }

  /** Returns the effective "now" for the app. When simulating a skip, this is real now + offset days + offset hours. */
  function getSimulatedNow() {
    const dayOffset = state.simulatedDateOffset || 0;
    const hourOffset = state.simulatedHourOffset || 0;
    if (dayOffset === 0 && hourOffset === 0) return new Date();
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setTime(d.getTime() + hourOffset * 60 * 60 * 1000);
    return d;
  }

  function getDateStr(d) {
    const date = d || getSimulatedNow();
    const tz = getRecordingTimezone();
    const parts = getDatePartsInTimezone(date, tz);
    const m = String(parts.month + 1).padStart(2, "0");
    const day = String(parts.day).padStart(2, "0");
    return parts.year + "-" + m + "-" + day;
  }

  function formatDate(d) {
    const date = typeof d === "string" ? new Date(d + "T12:00:00") : (d || new Date());
    const tz = getAppTimezone();
    const parts = getDatePartsInTimezone(date, tz);
    const y = parts.year;
    const m = String(parts.month + 1).padStart(2, "0");
    const day = String(parts.day).padStart(2, "0");
    const fmt = state.dateFormat || "mdy";
    if (fmt === "dmy") return day + "/" + m + "/" + y;
    if (fmt === "ymd") return y + "-" + m + "-" + day;
    return m + "/" + day + "/" + y;
  }

  function formatTime(d) {
    const date = d || new Date();
    const tz = getAppTimezone();
    const parts = getDatePartsInTimezone(date, tz);
    const fmt = state.timeFormat || "12h";
    if (fmt === "24h") {
      return pad2(parts.hour) + ":" + pad2(parts.minute) + ":" + pad2(parts.second);
    }
    let h = parts.hour;
    const am = h < 12;
    h = h % 12 || 12;
    return h + ":" + pad2(parts.minute) + ":" + pad2(parts.second) + (am ? " AM" : " PM");
  }

  function formatTimeOnly(hour, minute) {
    const d = new Date(2000, 0, 1, Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0);
    const fmt = state.timeFormat || "12h";
    if (fmt === "24h") return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    let h = d.getHours();
    const am = h < 12;
    h = h % 12 || 12;
    return h + ":" + pad2(d.getMinutes()) + (am ? " AM" : " PM");
  }

  function getWeeklyResetDisplay(task, now, game) {
    const n = now || new Date();
    const nextReset = new Date(n.getTime() + getWeeklyTimeRemainingMs(task, n, game));
    const resetTz = game ? getResetTimezoneForGame(game) : getRecordingTimezone();
    const parts = getDatePartsInTimezone(nextReset, resetTz);
    return (parts.weekday || "Mon") + " " + formatTimeOnly(parts.hour, parts.minute);
  }

  function getEndgameResetDisplay(task, now, game) {
    const n = now || new Date();
    const nextReset = new Date(n.getTime() + getEndgameTimeRemainingMs(task, n, game));
    const resetTz = game ? getResetTimezoneForGame(game) : getRecordingTimezone();
    const parts = getDatePartsInTimezone(nextReset, resetTz);
    return formatTimeOnly(parts.hour, parts.minute);
  }

  function isValidDateStr(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return false;
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === (mo - 1) && dt.getDate() === d;
  }

  function getIntervalMs(every, unit) {
    const e = Math.max(1, Number(every) || 1);
    const u = unit === "day" ? "day" : "week";
    return e * (u === "day" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000);
  }

  function formatRemainingMs(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "Not Available";
    const totalMin = Math.max(1, Math.ceil(ms / 60000));
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin - days * 60 * 24) / 60);
    const mins = totalMin % 60;
    const parts = [];
    if (days) parts.push(days + "d");
    if (hours || days) parts.push(hours + "h");
    parts.push(String(mins).padStart(2, "0") + "m");
    return parts.join(" ");
  }

  /**
   * Parse user input like "6d 7hr", "6 day 7hr", "6 days 7 hours" to milliseconds.
   * Supports: Nd, Nday, Ndays, Nh, Nhr, Nhrs, Nhour, Nhours, Nm, Nmin, Nmins.
   */
  function parseTimeRemainingToMs(str) {
    if (!str || typeof str !== "string") return null;
    const s = str.trim().toLowerCase();
    if (!s) return null;
    let totalMs = 0;
    const dayRe = /(\d+(?:\.\d+)?)\s*(?:d|day|days)\b/g;
    const hourRe = /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/g;
    const minRe = /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/g;
    let m;
    while ((m = dayRe.exec(s)) !== null) totalMs += parseFloat(m[1]) * 24 * 60 * 60 * 1000;
    while ((m = hourRe.exec(s)) !== null) totalMs += parseFloat(m[1]) * 60 * 60 * 1000;
    while ((m = minRe.exec(s)) !== null) totalMs += parseFloat(m[1]) * 60 * 1000;
    return totalMs > 0 ? totalMs : null;
  }

  /** Get interval and time limit for cycle-based tasks (weeklies, endgame). Uses frequency/timeLimit when set; defaults to 1 week. */
  function getCycleParams(task) {
    const freqUnit = task && task.frequencyUnit === "day" ? "day" : "week";
    const freqEvery = Number.isFinite(task && task.frequencyEvery) ? task.frequencyEvery : 1;
    const intervalMs = getIntervalMs(freqEvery, freqUnit);
    const limitUnit = task && task.timeLimitUnit === "day" ? "day" : "week";
    const hasExplicitLimit = task && (task.timeLimitEvery != null || task.timeLimitUnit != null);
    const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : intervalMs;
    return { intervalMs, timeLimitMs };
  }

  /** Cycle anchor from dateStarted (preserved). Uses weekStartDay/Hour/Minute for alignment. */
  function getEndgameAnchorDate(task, game) {
    let ds = isValidDateStr(task && task.dateStarted) ? task.dateStarted : null;
    // Missing dateStarted used to fall back to "today", which hid older calendar history.
    // Prefer the earliest calendar completion so long-tracked tasks keep their real start.
    if (!ds && game && task) {
      const taskId = task.id || task.label;
      const key = game.id + "." + taskId;
      const inWeeklies = (game.weeklies || []).some((t) => (t.id || t.label) === taskId);
      const type = inWeeklies ? "weeklies" : "endgame";
      let earliest = null;
      Object.keys(state.completionByDate || {}).forEach((dateStr) => {
        const dayData = state.completionByDate[dateStr] || {};
        if ((dayData[type] || []).includes(key) && (!earliest || dateStr < earliest)) earliest = dateStr;
      });
      if (earliest) ds = earliest;
    }
    if (!ds) ds = getDateStr();
    const weekStartHour = getResetHour(task, "weekStartHour", getResetHour(task, "resetHour", 4), game);
    const weekStartMinute = Number.isFinite(task && task.weekStartMinute) ? task.weekStartMinute : (Number.isFinite(task && task.resetMinute) ? task.resetMinute : 0);
    const weekStartDay = Number.isFinite(task && task.weekStartDay) ? task.weekStartDay : (Number.isFinite(task && task.resetDay) ? task.resetDay : 0);
    const y = parseInt(ds.slice(0, 4), 10);
    const mo = parseInt(ds.slice(5, 7), 10) - 1;
    const d = parseInt(ds.slice(8, 10), 10);
    const baseTz = game ? getResetTimezoneForGame(game) : getRecordingTimezone();
    const tz = getTimezoneForTaskDst(task, baseTz);
    const offsetRef = getOffsetRefDateForTask(task, tz);
    let anchor = createDateInTimezone(y, mo, d, weekStartHour, weekStartMinute, tz, offsetRef);

    const freqUnit = task && task.frequencyUnit === "day" ? "day" : "week";
    if (freqUnit === "week") {
      const anchorParts = getDatePartsInTimezone(anchor, tz);
      const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(anchorParts.weekday);
      const daysBack = (dayOfWeek - weekStartDay + 7) % 7;
      anchor = new Date(anchor.getTime() - daysBack * 24 * 60 * 60 * 1000);
    }
    return anchor;
  }

  function getEndgameTimeRemainingMs(task, now, game) {
    if (task && task.manualReset) return getManualResetRemainingMs(task, now);
    const n = now || new Date();
    if (isTaskCycleEnded(task, n, game)) return 0;
    const bounds = getEndgameCycleBoundsForMoment(task, n, game);
    if (!bounds) return 0;
    const lastBounds = getLastCycleBounds(task, game);
    if (lastBounds && bounds.cycleStart.getTime() > lastBounds.startMs) return 0;
    return bounds.cycleEnd.getTime() - n.getTime();
  }

  function getEndgameTimeRemainingText(task, now, game) {
    if (task && task.manualReset) return getManualResetRemainingText(task, now);
    if (isTaskCycleEnded(task, now, game)) return "Ended";
    return formatRemainingMs(getEndgameTimeRemainingMs(task, now, game));
  }

  /** End moment (ms) for extracurricular task. Uses endDate + endTime (default 23:59:59). Returns null if endDateTBD or no endDate. */
  function getExtracurricularEndMs(task) {
    if (!task || task.endDateTBD || !task.endDate || !isValidDateStr(task.endDate)) return null;
    let timeStr = (task.endTime || "").trim();
    if (!timeStr) timeStr = "23:59:59";
    else if (/^\d{1,2}:\d{2}$/.test(timeStr)) timeStr += ":00";
    else if (!/^\d{1,2}:\d{2}:\d{2}$/.test(timeStr)) timeStr = "23:59:59";
    const end = new Date(task.endDate + "T" + timeStr);
    return end.getTime();
  }

  /** Time remaining until end of endDate/endTime for extracurricular tasks. Returns null if endDateTBD or no endDate. */
  function getExtracurricularTimeRemainingMs(task, now) {
    const endMs = getExtracurricularEndMs(task);
    if (endMs == null) return null;
    const n = now || getSimulatedNow();
    return endMs - n.getTime();
  }

  function getExtracurricularTimeRemainingText(task, now) {
    const ms = getExtracurricularTimeRemainingMs(task, now);
    if (ms == null) return "TBD";
    if (ms <= 0) return "";
    return formatRemainingMs(ms);
  }

  function getEndgameCycleDates(task, index, game) {
    const anchor = getEndgameAnchorDate(task, game);
    const freqUnit = task && task.frequencyUnit === "day" ? "day" : "week";
    const intervalMs = getIntervalMs(task && task.frequencyEvery, freqUnit);
    const limitUnit = task && task.timeLimitUnit === "day" ? "day" : "week";
    const hasExplicitLimit = task && (task.timeLimitEvery != null || task.timeLimitUnit != null);
    const timeLimitMs = hasExplicitLimit ? getIntervalMs(task && task.timeLimitEvery, limitUnit) : intervalMs;
    const cycleStart = new Date(anchor.getTime() + index * intervalMs);
    const cycleEnd = new Date(cycleStart.getTime() + timeLimitMs);
    return { start: getDateStr(cycleStart), end: getDateStr(cycleEnd) };
  }

  function getEndgameTimeLimitMs(task) {
    const freqUnit = task && task.frequencyUnit === "day" ? "day" : "week";
    const intervalMs = getIntervalMs(task && task.frequencyEvery, freqUnit);
    const limitUnit = task && task.timeLimitUnit === "day" ? "day" : "week";
    const hasExplicitLimit = task && (task.timeLimitEvery != null || task.timeLimitUnit != null);
    return hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : intervalMs;
  }

  /** Cycle boundaries for the period containing dateStr (matches calendar/tally logic). */
  function getEndgameCycleDatesForDate(task, dateStr, game) {
    if (isManualResetTask(task)) {
      const bounds = getManualResetCycleBounds(task, game, "endgame");
      if (!bounds) return { start: dateStr, end: dateStr };
      return { start: getDateStr(bounds.cycleStart), end: getDateStr(bounds.cycleEnd) };
    }
    const cycleStart = getCycleStartForDate(task, dateStr, game);
    const cycleEnd = new Date(cycleStart.getTime() + getEndgameTimeLimitMs(task));
    return { start: getDateStr(cycleStart), end: getDateStr(cycleEnd) };
  }

  function dateRangesOverlap(startA, endA, startB, endB) {
    if (!isValidDateStr(startA) || !isValidDateStr(endA) || !isValidDateStr(startB) || !isValidDateStr(endB)) return false;
    return startA <= endB && startB <= endA;
  }

  function endgamePeriodHasCalendarMark(key, periodStart, periodEnd, nextCycleStart) {
    return periodHasCalendarMarkInRange(key, "endgame", periodStart, periodEnd, nextCycleStart) != null;
  }

  function getEndgameCompletionDates(gameId, taskId) {
    const key = gameId + "." + taskId;
    return state.endgameCompletionDates[key] || [];
  }

  /** Date range for one completed endgame cycle from calendar marks (matches tally/history). */
  function getEndgamePeriodDateRangeFromCalendar(task, key, period, game) {
    const refDate = periodHasCalendarMarkInRange(key, "endgame", period.periodStart, period.periodEnd, period.nextCycleStart);
    if (refDate) return getEndgameCycleDatesForDate(task, refDate, game);
    return { start: getDateStr(period.periodStart), end: getDateStr(period.periodEnd) };
  }

  /**
   * Completed endgame cycles from calendar, deduped by cycle date range (one entry per actual completion).
   * Returns [{ period, range, refDate }, ...] in chronological order.
   */
  function getEndgameCompletedPeriodsFromCalendar(game, task, key) {
    const cacheKey = "endgameCompleted|" + key;
    const cached = tallyCacheGet(cacheKey);
    if (cached) return cached;
    const history = getTaskTallyHistory(game, "endgame", key);
    const seen = new Set();
    const result = [];
    history.forEach((period) => {
      const refDate = periodHasCalendarMarkInRange(key, "endgame", period.periodStart, period.periodEnd, period.nextCycleStart);
      if (!refDate) return;
      const range = getEndgameCycleDatesForDate(task, refDate, game);
      const rangeKey = range.start + "|" + range.end;
      if (seen.has(rangeKey)) return;
      seen.add(rangeKey);
      result.push({ period, range, refDate });
    });
    tallyCacheSet(cacheKey, result);
    return result;
  }

  /** Rebuild stored completion date ranges from calendar/tally (one entry per completed cycle, in order). */
  function syncEndgameCompletionDatesFromCalendar(game, task, key) {
    const periods = getEndgameCompletedPeriodsFromCalendar(game, task, key);
    state.endgameCompletionDates[key] = periods.map((p) => ({ start: p.range.start, end: p.range.end }));
  }

  /** Updates display dates for a completion (earnings modal). Does NOT touch completionByDate.
   * Editing prior completion dates cannot affect current-cycle completion logic. */
  function setEndgameCompletionDate(gameId, taskId, index, start, end, opts) {
    const key = gameId + "." + taskId;
    if (!state.endgameCompletionDates[key]) state.endgameCompletionDates[key] = [];
    while (state.endgameCompletionDates[key].length <= index) {
      state.endgameCompletionDates[key].push({ start: "", end: "" });
    }
    state.endgameCompletionDates[key][index] = { start: start || "", end: end || "" };
    if (!opts || !opts.skipSave) save();
  }

  /** When the calendar cycle changes, reset in-progress pending amount. */
  function syncEndgamePendingForKey(key, game, task) {
    if (!game || !task) return;
    if (!state.endgamePendingCurrency) state.endgamePendingCurrency = {};
    if (!state.endgamePendingCycleStartMs) state.endgamePendingCycleStartMs = {};
    const cs = getCycleStartForDate(task, getDateStr(), game).getTime();
    if (state.endgamePendingCycleStartMs[key] !== cs) {
      state.endgamePendingCycleStartMs[key] = cs;
      state.endgamePendingCurrency[key] = 0;
    }
  }

  function getEndgamePendingAmount(key, game, task) {
    syncEndgamePendingForKey(key, game, task);
    return Math.max(0, Number(state.endgamePendingCurrency[key]) || 0);
  }

  function setEndgamePendingAmount(key, game, task, value) {
    syncEndgamePendingForKey(key, game, task);
    const n = value === "" || value === null || value === undefined ? 0 : Math.max(0, Number(value) || 0);
    state.endgamePendingCurrency[key] = n;
    save();
    renderActiveTab();
  }

  /**
   * Core: map wall-clock time to the game-day calendar date for a non-midnight reset.
   * Before today's reset hour, the calendar day still belongs to the previous game day
   * (e.g. Aug 3 03:59 with 4am reset → "2026-08-02"). After reset → today's dateStr.
   * Used by dailies and weeklies/endgame when choosing which dateStr to record.
   */
  function getPeriodDateStrForReset(now, hour, minute, tz, offsetRefDate) {
    const n = now instanceof Date ? now : new Date();
    const parts = getDatePartsInTimezone(n, tz);
    const h = Number.isFinite(hour) ? hour : getDefaultResetHour();
    const m = Number.isFinite(minute) ? minute : 0;
    const todayReset = createDateInTimezone(parts.year, parts.month, parts.day, h, m, tz, offsetRefDate);
    if (n < todayReset) {
      const todayStart = createDateInTimezone(parts.year, parts.month, parts.day, 0, 0, tz, offsetRefDate);
      const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
      const prevParts = getDatePartsInTimezone(yesterdayStart, tz);
      return prevParts.year + "-" + String(prevParts.month + 1).padStart(2, "0") + "-" + String(prevParts.day).padStart(2, "0");
    }
    return parts.year + "-" + String(parts.month + 1).padStart(2, "0") + "-" + String(parts.day).padStart(2, "0");
  }

  /** Reset clock (tz/hour/minute) for a task or game. */
  function getTaskResetClock(task, game, now) {
    const n = now instanceof Date ? now : getSimulatedNow();
    const baseTz = game ? getResetTimezoneForGame(game) : getRecordingTimezone();
    const subject = task || game;
    const tz = getTimezoneForTaskDst(subject, baseTz);
    const hour = getResetHour(
      task,
      "weekStartHour",
      getResetHour(task, "resetHour", getResetHour(game, "resetHour", getDefaultResetHour(), game, n), game, n),
      game,
      n
    );
    const minute = Number.isFinite(task && task.weekStartMinute)
      ? task.weekStartMinute
      : Number.isFinite(task && task.resetMinute)
        ? task.resetMinute
        : Number.isFinite(game && game.resetMinute)
          ? game.resetMinute
          : 0;
    const offsetRef = getOffsetRefDateForTask(subject, tz);
    return { now: n, tz, hour, minute, offsetRef };
  }

  /**
   * Core: instant used to pick which weekly/endgame cycle "now" belongs to.
   * Before reset on a calendar day, membership is still the prior cycle
   * (same rule as getPeriodDateStrForReset, expressed as a Date).
   */
  function getCycleMembershipMoment(task, game, now) {
    const clock = getTaskResetClock(task, game, now);
    const parts = getDatePartsInTimezone(clock.now, clock.tz);
    const todayReset = createDateInTimezone(
      parts.year,
      parts.month,
      parts.day,
      clock.hour,
      clock.minute,
      clock.tz,
      clock.offsetRef
    );
    return clock.now < todayReset ? new Date(todayReset.getTime() - 1) : clock.now;
  }

  /** Game-day dateStr for dailies / weeklies / endgame at `now`. */
  function getTaskPeriodDateStr(type, task, game, now) {
    const n = now instanceof Date ? now : getSimulatedNow();
    if (type === "dailies") return getDailyPeriodDateStr(game, n);
    const clock = getTaskResetClock(task, game, n);
    return getPeriodDateStrForReset(n, clock.hour, clock.minute, clock.tz, clock.offsetRef);
  }

  /** Returns the dateStr for the daily period that contains `now`. The reset time marks the start of that day:
   * e.g. reset 3am → 2:59am March 8 is still March 7's task; 3:00am March 8 starts March 8's task. */
  function getDailyPeriodDateStr(game, now) {
    const n = now || new Date();
    const baseTz = getResetTimezoneForGame(game);
    const tz = getTimezoneForTaskDst(game, baseTz);
    const hour = getResetHour(game, "resetHour", getDefaultResetHour(), game, n);
    const minute = Number.isFinite(game && game.resetMinute) ? game.resetMinute : 0;
    const offsetRef = getOffsetRefDateForTask(game, tz);
    return getPeriodDateStrForReset(n, hour, minute, tz, offsetRef);
  }

  function getDailyTimeRemainingMs(game, now) {
    const n = now || new Date();
    const hour = getResetHour(game, "resetHour", getDefaultResetHour(), game, n);
    const minute = Number.isFinite(game && game.resetMinute) ? game.resetMinute : 0;
    const baseTz = getResetTimezoneForGame(game);
    const tz = getTimezoneForTaskDst(game, baseTz);
    const offsetRef = getOffsetRefDateForTask(game, tz);
    const nextReset = getNextResetDateInTimezone(n, hour, minute, tz, offsetRef);
    return nextReset.getTime() - n.getTime();
  }

  function getDailyTimeRemainingText(game, now) {
    return formatRemainingMs(getDailyTimeRemainingMs(game, now));
  }

  function getWeeklyTimeRemainingMs(task, now, game) {
    if (task && task.manualReset) return getManualResetRemainingMs(task, now);
    const n = now || new Date();
    if (isTaskCycleEnded(task, n, game)) return 0;
    const bounds = getWeeklyCycleBoundsForMoment(task, n, game);
    if (!bounds) return 0;
    const lastBounds = getLastCycleBounds(task, game);
    if (lastBounds && bounds.cycleStart.getTime() > lastBounds.startMs) return 0;
    return bounds.cycleEnd.getTime() - n.getTime();
  }

  function getWeeklyTimeRemainingText(task, now, game) {
    if (task && task.manualReset) return getManualResetRemainingText(task, now);
    if (isTaskCycleEnded(task, now, game)) return "Ended";
    return formatRemainingMs(getWeeklyTimeRemainingMs(task, now, game));
  }

  function isManualResetTask(task) {
    return !!(task && task.manualReset);
  }

  /** Calendar-only placeholder duration when manual due is TBD. Weeklies: 7d, Endgame: 4 weeks. */
  function getManualResetPlaceholderMs(taskType) {
    if (taskType === "endgame") return 28 * 24 * 60 * 60 * 1000;
    return 7 * 24 * 60 * 60 * 1000;
  }

  /** Due end ms for manual-reset tasks. null = TBD (unknown) — not a calendar placeholder. */
  function getManualResetDueMs(task) {
    if (!task || !task.manualReset) return null;
    if (task.manualDueTbd || !task.manualDueDateStr || !isValidDateStr(task.manualDueDateStr)) return null;
    const tz = getRecordingTimezone();
    const parts = String(task.manualDueDateStr).split("-").map(Number);
    const y = parts[0];
    const m = (parts[1] || 1) - 1;
    const d = parts[2] || 1;
    // Prefer explicit due clock; fall back to cycle begin clock, else 23:59.
    const hour = Number.isFinite(task.manualDueHour)
      ? task.manualDueHour
      : (Number.isFinite(task.weekStartHour) ? task.weekStartHour : 23);
    const minute = Number.isFinite(task.manualDueMinute)
      ? task.manualDueMinute
      : (Number.isFinite(task.weekStartMinute) ? task.weekStartMinute : 59);
    const end = createDateInTimezone(y, m, d, hour, minute, tz);
    return end.getTime();
  }

  /**
   * Cycle bounds for manual-reset tasks (calendar / completion membership).
   * Remaining UI still shows TBD when due is unset; this only scaffolds calendar/history windows.
   */
  function getManualResetCycleBounds(task, game, taskType) {
    if (!isManualResetTask(task)) return null;
    const cycleStart = getEndgameAnchorDate(task, game);
    const dueMs = getManualResetDueMs(task);
    let cycleEndMs = dueMs != null ? dueMs : (cycleStart.getTime() + getManualResetPlaceholderMs(taskType));
    if (!(cycleEndMs > cycleStart.getTime())) {
      cycleEndMs = cycleStart.getTime() + getManualResetPlaceholderMs(taskType);
    }
    const cycleEnd = new Date(cycleEndMs);
    return {
      cycleStart,
      cycleEnd,
      nextCycleStart: new Date(cycleEndMs),
    };
  }

  /** Rebuild a Date at the task's reset clock for a YYYY-MM-DD (used for closed-cycle history). */
  function getManualResetMomentOnDate(task, dateStr, game) {
    if (!isValidDateStr(dateStr)) return null;
    return getEndgameAnchorDate(Object.assign({}, task, { dateStarted: dateStr }), game);
  }

  /**
   * Remove calendar marks (+ matching timestamps) for key in [fromMoment, toMomentExclusive)
   * so assumed TBD fill beyond the new cycle start cannot complete the next window.
   */
  function clearManualResetMarksInRange(key, type, fromMoment, toMomentExclusive) {
    if (!(fromMoment instanceof Date) || !(toMomentExclusive instanceof Date)) return;
    if (fromMoment.getTime() >= toMomentExclusive.getTime()) return;
    const dates = getCalendarDatesInCycleRange(fromMoment, toMomentExclusive, toMomentExclusive);
    if (!dates.length) return;
    const dateSet = new Set(dates);
    dates.forEach((ds) => {
      const dayData = state.completionByDate[ds];
      if (!dayData || !Array.isArray(dayData[type])) return;
      const idx = dayData[type].indexOf(key);
      if (idx >= 0) dayData[type].splice(idx, 1);
    });
    if (Array.isArray(state.completionTimestamps) && state.completionTimestamps.length) {
      const dot = key.indexOf(".");
      const gameId = dot > 0 ? key.slice(0, dot) : key;
      const taskId = dot > 0 ? key.slice(dot + 1) : "";
      state.completionTimestamps = state.completionTimestamps.filter((t) => {
        if (!t || !dateSet.has(t.dateStr)) return true;
        if (t.taskType !== type) return true;
        if (t.gameId !== gameId) return true;
        if (type !== "dailies" && (t.taskId || t.taskLabel) !== taskId && t.taskId !== taskId) return true;
        return false;
      });
    }
  }

  function getManualResetRemainingMs(task, now) {
    const dueMs = getManualResetDueMs(task);
    if (dueMs == null) return null;
    const n = now || getSimulatedNow();
    return dueMs - n.getTime();
  }

  function getManualResetRemainingText(task, now) {
    if (task && task.manualAwaitingRestart) return "Awaiting restart";
    const ms = getManualResetRemainingMs(task, now);
    if (ms == null) return "TBD";
    if (ms <= 0) return "Cycle Ended";
    return formatRemainingMs(ms);
  }

  function isManualResetExpired(task, now) {
    if (!isManualResetTask(task) || task.manualDueTbd || task.manualAwaitingRestart) return false;
    if (!task.manualDueDateStr || !isValidDateStr(task.manualDueDateStr)) return false;
    const ms = getManualResetRemainingMs(task, now);
    return ms != null && ms <= 0;
  }

  /**
   * Finalize previous manual window tallies (if any) and open a new window.
   * When prior was TBD (or calendar end is past the new start), clamp previous end to
   * the new cycle start [oldStart, newStart) so history/calendar ranges never overlap.
   * After Start/confirm the new window always begins incomplete (calendar marks + pending earned cleared).
   * reason: "create" | "reset" | "expiry"
   */
  function startManualResetWindow(game, task, taskType, opts) {
    if (!game || !task || !isManualResetTask(task)) return false;
    const o = opts || {};
    const key = game.id + "." + (task.id || task.label);
    const type = taskType === "endgame" ? "endgame" : "weeklies";
    const now = getSimulatedNow();
    const todayStr = getDateStr(now);
    const reason = o.reason || "reset";
    const newStartStr = isValidDateStr(o.dateStarted) ? o.dateStarted : todayStr;
    const startHour = Number.isFinite(o.startHour)
      ? Math.max(0, Math.min(23, o.startHour | 0))
      : (Number.isFinite(task.weekStartHour) ? task.weekStartHour : getResetHour(task, "weekStartHour", 4, game));
    const startMinute = Number.isFinite(o.startMinute)
      ? Math.max(0, Math.min(59, o.startMinute | 0))
      : (Number.isFinite(task.weekStartMinute) ? task.weekStartMinute : 0);
    let startWeekday = Number.isFinite(o.startWeekday) ? Math.max(0, Math.min(6, o.startWeekday | 0)) : null;
    if (startWeekday == null && isValidDateStr(newStartStr)) {
      const tmp = new Date(newStartStr + "T12:00:00");
      startWeekday = tmp.getDay();
    }
    if (startWeekday == null) {
      startWeekday = Number.isFinite(task.weekStartDay) ? task.weekStartDay : 0;
    }
    const newStartMoment = getEndgameAnchorDate(
      Object.assign({}, task, {
        dateStarted: newStartStr,
        weekStartHour: startHour,
        weekStartMinute: startMinute,
        weekStartDay: startWeekday,
      }),
      game
    );

    if (reason !== "create") {
      const prevBounds = getManualResetCycleBounds(task, game, type);
      if (prevBounds && prevBounds.cycleStart.getTime() <= newStartMoment.getTime()) {
        const sameStart = prevBounds.cycleStart.getTime() === newStartMoment.getTime();
        let cycleEnd = prevBounds.cycleEnd;
        let nextCycleStart = prevBounds.nextCycleStart;
        const endBeyondNewStart = cycleEnd.getTime() > newStartMoment.getTime();
        let completedMark = null;

        if (sameStart) {
          // Same calendar start: board toggle already counted tallies; only archive the window.
          completedMark = findCompletionDateInBounds(key, type, prevBounds);
          cycleEnd = new Date(newStartMoment.getTime());
          nextCycleStart = new Date(newStartMoment.getTime());
        } else {
          if (endBeyondNewStart) {
            // Drop assumed-TBD / overshoot marks that would bleed into the new window.
            clearManualResetMarksInRange(key, type, newStartMoment, cycleEnd);
            cycleEnd = new Date(newStartMoment.getTime());
            nextCycleStart = new Date(newStartMoment.getTime());
          }
          completedMark = findCompletionDateInBounds(key, type, {
            cycleStart: prevBounds.cycleStart,
            cycleEnd,
            nextCycleStart,
          });
        }

        const closedBounds = {
          cycleStart: prevBounds.cycleStart,
          cycleEnd,
          nextCycleStart,
        };
        if (!Array.isArray(task.manualClosedCycles)) task.manualClosedCycles = [];
        task.manualClosedCycles.push({
          start: getDateStr(closedBounds.cycleStart),
          end: getDateStr(closedBounds.cycleEnd),
          completed: completedMark ? 1 : 0,
        });
        if (completedMark && !sameStart) {
          if (type === "weeklies") {
            state.weekliesCompleted[key] = getCompletedAmount(state.weekliesCompleted, key) + 1;
          } else {
            state.endgameCompleted[key] = getCompletedAmount(state.endgameCompleted, key) + 1;
            ensureEndgameEarnedArrayLength(game.id, task.id || task.label, getCompletedAmount(state.endgameCompleted, key));
            if (!state.endgameCompletionDates) state.endgameCompletionDates = {};
            if (!state.endgameCompletionDates[key]) state.endgameCompletionDates[key] = [];
            state.endgameCompletionDates[key].push({
              start: getDateStr(closedBounds.cycleStart),
              end: getDateStr(closedBounds.cycleEnd),
            });
          }
        }
      }
    }

    task.dateStarted = newStartStr;
    if (Number.isFinite(o.startHour)) task.weekStartHour = Math.max(0, Math.min(23, o.startHour | 0));
    if (Number.isFinite(o.startMinute)) task.weekStartMinute = Math.max(0, Math.min(59, o.startMinute | 0));
    if (Number.isFinite(o.startWeekday)) task.weekStartDay = Math.max(0, Math.min(6, o.startWeekday | 0));
    if (o.tbd) {
      task.manualDueTbd = true;
      task.manualDueDateStr = null;
      task.manualDueHour = undefined;
      task.manualDueMinute = undefined;
    } else if (isValidDateStr(o.dueDateStr)) {
      task.manualDueTbd = false;
      task.manualDueDateStr = o.dueDateStr;
      if (Number.isFinite(o.dueHour)) task.manualDueHour = Math.max(0, Math.min(23, o.dueHour | 0));
      if (Number.isFinite(o.dueMinute)) task.manualDueMinute = Math.max(0, Math.min(59, o.dueMinute | 0));
    } else {
      task.manualDueTbd = true;
      task.manualDueDateStr = null;
      task.manualDueHour = undefined;
      task.manualDueMinute = undefined;
    }
    task.manualAwaitingRestart = false;

    // New cycle must start incomplete — same as a calendar reset opening an empty window.
    const newBounds = getManualResetCycleBounds(task, game, type);
    if (newBounds) {
      clearManualResetMarksInRange(key, type, newBounds.cycleStart, newBounds.cycleEnd);
    }
    if (type === "endgame") {
      if (!state.endgamePendingCurrency) state.endgamePendingCurrency = {};
      if (!state.endgamePendingCycleStartMs) state.endgamePendingCycleStartMs = {};
      state.endgamePendingCurrency[key] = 0;
      state.endgamePendingCycleStartMs[key] = newBounds
        ? newBounds.cycleStart.getTime()
        : newStartMoment.getTime();
    }

    if (type === "weeklies") {
      state.weekliesAttempted[key] = getAttemptedAmount(state.weekliesAttempted, key) + 1;
    } else {
      const attemptIdx = getAttemptedAmount(state.endgameAttempted, key);
      state.endgameAttempted[key] = attemptIdx + 1;
      snapshotEndgamePotentialAt(game.id, task.id || task.label, attemptIdx, getEndgamePotential(task));
      ensureEndgamePotentialArrayLength(game.id, task.id || task.label, getAttemptedAmount(state.endgameAttempted, key));
    }

    if (typeof bumpDataVersion === "function") bumpDataVersion();
    return true;
  }

  /** Build cycle bounds from explicit manual window fields (does not mutate task). */
  function buildManualResetBoundsFromParts(task, game, taskType, parts) {
    const p = parts || {};
    if (!task || !isValidDateStr(p.startDateStr) || !isValidDateStr(p.endDateStr)) return null;
    const startHour = Number.isFinite(p.startHour) ? Math.max(0, Math.min(23, p.startHour | 0)) : 4;
    const startMinute = Number.isFinite(p.startMinute) ? Math.max(0, Math.min(59, p.startMinute | 0)) : 0;
    const endHour = Number.isFinite(p.endHour) ? Math.max(0, Math.min(23, p.endHour | 0)) : 23;
    const endMinute = Number.isFinite(p.endMinute) ? Math.max(0, Math.min(59, p.endMinute | 0)) : 59;
    const startWeekday = new Date(p.startDateStr + "T12:00:00").getDay();
    const cycleStart = getEndgameAnchorDate(
      Object.assign({}, task, {
        dateStarted: p.startDateStr,
        weekStartHour: startHour,
        weekStartMinute: startMinute,
        weekStartDay: startWeekday,
      }),
      game
    );
    const tz = getRecordingTimezone();
    const ep = String(p.endDateStr).split("-").map(Number);
    const cycleEnd = createDateInTimezone(ep[0], (ep[1] || 1) - 1, ep[2] || 1, endHour, endMinute, tz);
    if (!(cycleEnd.getTime() > cycleStart.getTime())) return null;
    return {
      cycleStart,
      cycleEnd,
      nextCycleStart: new Date(cycleEnd.getTime()),
      startDateStr: p.startDateStr,
      endDateStr: p.endDateStr,
      startHour,
      startMinute,
      endHour,
      endMinute,
      startWeekday,
    };
  }

  function captureManualLiveWindow(task) {
    return {
      dateStarted: task.dateStarted,
      weekStartHour: task.weekStartHour,
      weekStartMinute: task.weekStartMinute,
      weekStartDay: task.weekStartDay,
      manualDueTbd: !!task.manualDueTbd,
      manualDueDateStr: task.manualDueDateStr,
      manualDueHour: task.manualDueHour,
      manualDueMinute: task.manualDueMinute,
      manualAwaitingRestart: !!task.manualAwaitingRestart,
    };
  }

  function restoreManualLiveWindow(task, snap) {
    if (!task || !snap) return;
    task.dateStarted = snap.dateStarted;
    task.weekStartHour = snap.weekStartHour;
    task.weekStartMinute = snap.weekStartMinute;
    task.weekStartDay = snap.weekStartDay;
    task.manualDueTbd = snap.manualDueTbd;
    task.manualDueDateStr = snap.manualDueDateStr;
    task.manualDueHour = snap.manualDueHour;
    task.manualDueMinute = snap.manualDueMinute;
    task.manualAwaitingRestart = snap.manualAwaitingRestart;
  }

  function applyTemporaryManualWindow(task, bounds) {
    task.dateStarted = bounds.startDateStr;
    task.weekStartHour = bounds.startHour;
    task.weekStartMinute = bounds.startMinute;
    task.weekStartDay = bounds.startWeekday;
    task.manualDueTbd = false;
    task.manualDueDateStr = bounds.endDateStr;
    task.manualDueHour = bounds.endHour;
    task.manualDueMinute = bounds.endMinute;
    task.manualAwaitingRestart = false;
  }

  function isSameManualLiveWindow(task, bounds) {
    if (!task || !bounds) return false;
    if (!isValidDateStr(task.dateStarted) || task.dateStarted !== bounds.startDateStr) return false;
    if (task.manualDueTbd || !isValidDateStr(task.manualDueDateStr)) return false;
    if (task.manualDueDateStr !== bounds.endDateStr) return false;
    const sh = Number.isFinite(task.weekStartHour) ? task.weekStartHour : 4;
    const sm = Number.isFinite(task.weekStartMinute) ? task.weekStartMinute : 0;
    const eh = Number.isFinite(task.manualDueHour) ? task.manualDueHour : sh;
    const em = Number.isFinite(task.manualDueMinute) ? task.manualDueMinute : sm;
    return sh === bounds.startHour && sm === bounds.startMinute && eh === bounds.endHour && em === bounds.endMinute;
  }

  function upsertManualClosedCycle(task, startStr, endStr, completed) {
    if (!task || !isValidDateStr(startStr) || !isValidDateStr(endStr)) return;
    if (!Array.isArray(task.manualClosedCycles)) task.manualClosedCycles = [];
    const existing = task.manualClosedCycles.find((c) => c && c.start === startStr && c.end === endStr);
    if (existing) {
      existing.completed = completed ? 1 : 0;
      return existing;
    }
    const row = { start: startStr, end: endStr, completed: completed ? 1 : 0 };
    task.manualClosedCycles.push(row);
    return row;
  }

  /**
   * Find an existing completion for a manual window (calendar/timestamps or closed-cycle flag).
   * @returns {{ dateStr: string|null, fromClosed: boolean }}
   */
  function findManualWindowCompletion(key, type, task, bounds) {
    if (!bounds) return { dateStr: null, fromClosed: false };
    const onCal = findCompletionDateInBounds(key, type, bounds);
    if (onCal) return { dateStr: onCal, fromClosed: false };
    const closed = Array.isArray(task && task.manualClosedCycles) ? task.manualClosedCycles : [];
    const hit = closed.find((c) => c && c.start === bounds.startDateStr && c.end === bounds.endDateStr && c.completed);
    if (hit) return { dateStr: bounds.startDateStr, fromClosed: true };
    return { dateStr: null, fromClosed: false };
  }

  /**
   * Log a completion for a manual-reset weekly/endgame task.
   * Past windows are archived into manualClosedCycles without clobbering the live window.
   * Uses the same calendar fill + timestamp + tally write path as applyTaskCompletion.
   */
  function applyManualResetCompletion(game, task, taskType, opts) {
    const o = opts || {};
    if (!game || !task || !isManualResetTask(task)) return { ok: false, reason: "Task not found" };
    const type = taskType === "endgame" ? "endgame" : "weeklies";
    const key = game.id + "." + (task.id || task.label);
    const dateStr = isValidDateStr(o.dateStr) ? o.dateStr : null;
    if (!dateStr) return { ok: false, reason: "Completion date required" };

    const bounds = buildManualResetBoundsFromParts(task, game, type, {
      startDateStr: o.startDateStr,
      endDateStr: o.endDateStr,
      startHour: o.startHour,
      startMinute: o.startMinute,
      endHour: o.endHour,
      endMinute: o.endMinute,
    });
    if (!bounds) return { ok: false, reason: "Cycle end must be after cycle start" };

    const hour = Number.isFinite(o.hour) ? o.hour : 12;
    const minute = Number.isFinite(o.minute) ? o.minute : 0;
    const completeMs = new Date(
      dateStr + "T" + String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0") + ":00"
    ).getTime();
    if (!Number.isFinite(completeMs) || completeMs < bounds.cycleStart.getTime() || completeMs >= bounds.cycleEnd.getTime()) {
      return { ok: false, reason: "Completion time must fall inside the cycle start/end window" };
    }

    const live = isSameManualLiveWindow(task, bounds);
    const conflict = findManualWindowCompletion(key, type, task, bounds);
    if (conflict.dateStr && !o.replace) {
      return {
        ok: false,
        reason: "conflict",
        conflictDateStr: conflict.dateStr,
        fromClosed: !!conflict.fromClosed,
      };
    }

    const snap = live ? null : captureManualLiveWindow(task);
    applyTemporaryManualWindow(task, bounds);

    let result;
    try {
      if (conflict.dateStr) {
        if (!conflict.fromClosed) {
          removeTaskCompletion(type, key, {
            dateStr: conflict.dateStr,
            skipUnlockGate: true,
            recordUndo: false,
            save: false,
            render: false,
            processResets: false,
          });
        } else {
          // Closed flag without calendar marks still counts in tallies — drop it before re-apply.
          if (type === "weeklies") {
            state.weekliesCompleted[key] = Math.max(0, getCompletedAmount(state.weekliesCompleted, key) - 1);
          } else {
            const amt = getCompletedAmount(state.endgameCompleted, key);
            state.endgameCompleted[key] = Math.max(0, amt - 1);
            ensureEndgameEarnedArrayLength(game.id, task.id || task.label, Math.max(0, amt - 1));
          }
          upsertManualClosedCycle(task, bounds.startDateStr, bounds.endDateStr, 0);
        }
      }

      result = applyTaskCompletion(type, key, {
        dateStr,
        hour,
        minute,
        skipUnlockGate: true,
        currencyValue: o.currencyValue,
        recordUndo: o.recordUndo !== false,
        undoLabel: o.undoLabel || ("Complete " + (task.label || key)),
        save: false,
        render: false,
        processResets: false,
      });
      if (!result || !result.ok) {
        return result || { ok: false, reason: "Could not apply completion" };
      }

      if (!live) {
        upsertManualClosedCycle(task, bounds.startDateStr, bounds.endDateStr, 1);
      }
    } finally {
      // Restore live window before save so past logs never overwrite the current cycle.
      if (snap) restoreManualLiveWindow(task, snap);
    }

    if (o.processResets !== false) processResets();
    if (o.save !== false) save(o.saveOptions);
    if (typeof bumpDataVersion === "function") bumpDataVersion();
    if (o.render !== false) renderActiveTab();
    return { ok: true, dateStr, pastWindow: !live };
  }

  function getWeekDates() {
    const now = getSimulatedNow();
    const tz = getRecordingTimezone();
    const parts = getDatePartsInTimezone(now, tz);
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    const firstDay = state.firstDayOfWeek === 1 ? 1 : 0;
    const daysBack = (dayOfWeek - firstDay + 7) % 7;
    const start = createDateInTimezone(parts.year, parts.month, parts.day, 0, 0, tz);
    start.setTime(start.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const dates = [];
    for (let i = -7; i < 7; i++) {
      dates.push(new Date(start.getTime() + i * 24 * 60 * 60 * 1000));
    }
    return dates;
  }

  /**
   * Calendar dates belonging to a cycle period [cycleStart, cycleEnd).
   * Core boundary rule: when nextCycleStart equals cycleEnd (adjacent full periods), the shared
   * boundary calendar day is assigned to the next cycle only — otherwise leftover "fill remaining
   * days" marks on reset day make the new weekly/endgame look already complete.
   */
  function getCalendarDatesInCycleRange(cycleStart, cycleEnd, nextCycleStart) {
    const dates = [];
    if (!(cycleStart instanceof Date) || !(cycleEnd instanceof Date) || isNaN(cycleStart.getTime()) || isNaN(cycleEnd.getTime())) {
      return dates;
    }
    const startDay = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate());
    const endDay = new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), cycleEnd.getDate());
    const nextMs = nextCycleStart instanceof Date ? nextCycleStart.getTime() : (Number.isFinite(nextCycleStart) ? nextCycleStart : null);
    const shareBoundaryWithNext = nextMs != null && nextMs === cycleEnd.getTime();
    const boundaryDateStr = shareBoundaryWithNext ? getDateStr(cycleEnd) : null;

    for (let day = new Date(startDay); day <= endDay; day.setDate(day.getDate() + 1)) {
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      const overlapStart = Math.max(dayStart.getTime(), cycleStart.getTime());
      const overlapEnd = Math.min(dayEnd.getTime(), cycleEnd.getTime());
      if (overlapStart >= overlapEnd) continue;
      const ds = getDateStr(day);
      if (boundaryDateStr && ds === boundaryDateStr) continue;
      dates.push(ds);
    }
    return dates;
  }

  /** Instant when a cycle window ends, given its start.
   * Default: cycleStart + timeLimit (end clock matches begin).
   * Optional cycleEndHour/Minute when cycleEndTimeSameAsBegin is false. */
  function getCycleEndDate(cycleStart, task, game) {
    const { timeLimitMs } = getCycleParams(task);
    const nominal = new Date(cycleStart.getTime() + timeLimitMs);
    const sameAsBegin = !task || task.cycleEndTimeSameAsBegin !== false;
    if (sameAsBegin || !Number.isFinite(task.cycleEndHour)) return nominal;
    const endHour = Math.max(0, Math.min(23, task.cycleEndHour | 0));
    const endMinute = Number.isFinite(task.cycleEndMinute) ? Math.max(0, Math.min(59, task.cycleEndMinute | 0)) : 0;
    const baseTz = game ? getResetTimezoneForGame(game) : getRecordingTimezone();
    const tz = getTimezoneForTaskDst(task, baseTz);
    const offsetRef = getOffsetRefDateForTask(task, tz);
    const parts = getDatePartsInTimezone(nominal, tz);
    return createDateInTimezone(parts.year, parts.month, parts.day, endHour, endMinute, tz, offsetRef);
  }

  function getWeeklyCycleBoundsForMoment(task, moment, game) {
    if (isManualResetTask(task)) {
      const bounds = getManualResetCycleBounds(task, game, "weeklies");
      if (!bounds) return null;
      const d = moment instanceof Date ? moment : new Date();
      if (d.getTime() < bounds.cycleStart.getTime()) return null;
      return bounds;
    }
    const d = moment instanceof Date ? moment : new Date();
    const anchor = getEndgameAnchorDate(task, game);
    const { intervalMs } = getCycleParams(task);
    const anchorMs = anchor.getTime();
    const dateMs = d.getTime();
    if (dateMs < anchorMs) return null;
    const k = Math.floor((dateMs - anchorMs) / intervalMs);
    const cycleStartMs = anchorMs + k * intervalMs;
    const cycleStart = new Date(cycleStartMs);
    return {
      cycleStart,
      cycleEnd: getCycleEndDate(cycleStart, task, game),
      nextCycleStart: new Date(cycleStartMs + intervalMs),
    };
  }

  function getEndgameCycleBoundsForMoment(task, moment, game) {
    if (isManualResetTask(task)) {
      const bounds = getManualResetCycleBounds(task, game, "endgame");
      if (!bounds) return null;
      const d = moment instanceof Date ? moment : new Date();
      if (d.getTime() < bounds.cycleStart.getTime()) return null;
      return bounds;
    }
    const d = moment instanceof Date ? moment : new Date();
    const anchor = getEndgameAnchorDate(task, game);
    const intervalMs = getIntervalMs(task.frequencyEvery, (task && task.frequencyUnit === "day") ? "day" : "week");
    const anchorMs = anchor.getTime();
    const dateMs = d.getTime();
    if (dateMs < anchorMs) return null;
    const k = Math.floor((dateMs - anchorMs) / intervalMs);
    const cycleStartMs = anchorMs + k * intervalMs;
    const cycleStart = new Date(cycleStartMs);
    return {
      cycleStart,
      cycleEnd: getCycleEndDate(cycleStart, task, game),
      nextCycleStart: new Date(cycleStartMs + intervalMs),
    };
  }

  function getRemainingDatesInCycleFrom(bounds, fromDateStr) {
    if (!bounds) return isValidDateStr(fromDateStr) ? [fromDateStr] : [];
    const all = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
    const filtered = all.filter((ds) => ds >= fromDateStr);
    if (filtered.length) return filtered;
    // Do not replant an excluded shared-boundary day (would bleed into the next cycle).
    if (all.length) {
      const last = all[all.length - 1];
      return last >= fromDateStr ? [last] : [];
    }
    return [];
  }

  function getCalendarDatesForBounds(bounds) {
    if (!bounds) return [];
    return getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
  }

  /**
   * Completion date inside a cycle. Timestamps in [cycleStart, cycleEnd) win.
   * For adjacent full periods, a bare calendar mark on the shared reset day is ignored
   * (leftover fill from the prior cycle) unless a timestamp proves this-cycle completion.
   */
  function findCompletionDateInBounds(key, type, bounds) {
    if (!bounds) return null;
    const dates = getCalendarDatesForBounds(bounds);
    if (!dates.length) return null;
    const dot = key.indexOf(".");
    const gameId = dot > 0 ? key.slice(0, dot) : key;
    const taskId = dot > 0 ? key.slice(dot + 1) : "";
    const startMs = bounds.cycleStart.getTime();
    const endMs = bounds.cycleEnd.getTime();
    const adjacent = bounds.nextCycleStart instanceof Date && bounds.nextCycleStart.getTime() === endMs;
    const startDateStr = getDateStr(bounds.cycleStart);

    for (const t of state.completionTimestamps || []) {
      if (t.taskType !== type || t.gameId !== gameId) continue;
      if (type !== "dailies" && t.taskId !== taskId) continue;
      if (!isValidDateStr(t.dateStr)) continue;
      const h = Number.isFinite(t.hour) ? t.hour : 12;
      const m = Number.isFinite(t.minute) ? t.minute : 0;
      const ms = new Date(
        t.dateStr + "T" + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00"
      ).getTime();
      if (!Number.isFinite(ms)) continue;
      if (ms >= startMs && ms < endMs) return t.dateStr;
    }

    for (const ds of dates) {
      if (adjacent && ds === startDateStr) continue;
      if ((state.completionByDate[ds] && state.completionByDate[ds][type] || []).includes(key)) return ds;
    }
    return null;
  }

  function getCompletionDateInCycle(key, type, refDateStr) {
    const dot = key.indexOf(".");
    if (dot <= 0) return null;
    const gameId = key.slice(0, dot);
    const taskId = key.slice(dot + 1);
    const game = getGame(gameId);
    if (!game) return null;
    const taskList = type === "weeklies" ? game.weeklies : game.endgame;
    const task = (taskList || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return null;
    const refMoment = isValidDateStr(refDateStr) ? new Date(refDateStr + "T12:00:00") : new Date();
    const bounds = type === "weeklies"
      ? getWeeklyCycleBoundsForMoment(task, refMoment, game)
      : getEndgameCycleBoundsForMoment(task, refMoment, game);
    return findCompletionDateInBounds(key, type, bounds);
  }

  function isCompletedInCycleForDate(key, type, refDateStr) {
    return getCompletionDateInCycle(key, type, refDateStr) != null;
  }

  /** Whether a cycle has any valid completion mark within this period's calendar date range. */
  function periodHasCalendarMarkInRange(key, type, cycleStart, cycleEnd, nextCycleStart) {
    return findCompletionDateInBounds(key, type, {
      cycleStart,
      cycleEnd,
      nextCycleStart: nextCycleStart instanceof Date ? nextCycleStart : null,
    });
  }

  function isPeriodCompletedFromCalendar(key, type, cycleStart, cycleEnd, nextCycleStart) {
    return periodHasCalendarMarkInRange(key, type, cycleStart, cycleEnd, nextCycleStart) != null;
  }

  /** Get date strings from dateStr (inclusive) to end of period for weeklies/endgame. Used when marking complete. */
  function getRemainingDatesInPeriod(type, key, dateStr) {
    const dot = key.indexOf(".");
    if (dot <= 0) return [dateStr];
    const gameId = key.slice(0, dot);
    const taskId = key.slice(dot + 1);
    const game = getGame(gameId);
    if (!game) return [dateStr];
    if (type === "weeklies") {
      const task = (game.weeklies || []).find((t) => (t.id || t.label) === taskId);
      if (!task) return [dateStr];
      const bounds = getWeeklyCycleBoundsForMoment(task, new Date(dateStr + "T12:00:00"), game);
      return getRemainingDatesInCycleFrom(bounds, dateStr);
    }
    if (type === "endgame") {
      const task = (game.endgame || []).find((t) => (t.id || t.label) === taskId);
      if (!task) return [dateStr];
      const bounds = getEndgameCycleBoundsForMoment(task, new Date(dateStr + "T12:00:00"), game);
      return getRemainingDatesInCycleFrom(bounds, dateStr);
    }
    return [dateStr];
  }

  /** Get all date strings in the period containing dateStr. Used when unmarking. */
  function getAllDatesInPeriod(type, key, dateStr) {
    const dot = key.indexOf(".");
    if (dot <= 0) return [dateStr];
    const gameId = key.slice(0, dot);
    const taskId = key.slice(dot + 1);
    const game = getGame(gameId);
    if (!game) return [dateStr];
    if (type === "weeklies") {
      const task = (game.weeklies || []).find((t) => (t.id || t.label) === taskId);
      if (!task) return [dateStr];
      const bounds = getWeeklyCycleBoundsForMoment(task, new Date(dateStr + "T12:00:00"), game);
      const all = getCalendarDatesForBounds(bounds);
      return all.length ? all : [dateStr];
    }
    if (type === "endgame") {
      const task = (game.endgame || []).find((t) => (t.id || t.label) === taskId);
      if (!task) return [dateStr];
      const bounds = getEndgameCycleBoundsForMoment(task, new Date(dateStr + "T12:00:00"), game);
      const all = getCalendarDatesForBounds(bounds);
      return all.length ? all : [dateStr];
    }
    return [dateStr];
  }

  function recordCompletion(dateStr, type, key, skipOrOpts) {
    // Weeklies and endgame fill remaining days in the cycle so later days stay marked complete.
    // Tallies still count 1 attempt / 1 complete per cycle (see getTaskTallyHistory).
    const opts =
      skipOrOpts && typeof skipOrOpts === "object"
        ? skipOrOpts
        : { skipTimestamp: !!skipOrOpts };
    const datesToRecord =
      type === "weeklies" || type === "endgame" ? getRemainingDatesInPeriod(type, key, dateStr) : [dateStr];
    datesToRecord.forEach((ds) => {
      if (!state.completionByDate[ds]) state.completionByDate[ds] = { dailies: [], weeklies: [], endgame: [] };
      const arr = state.completionByDate[ds][type];
      if (!arr.includes(key)) arr.push(key);
    });
    if (type === "endgame") {
      const dot = key.indexOf(".");
      const gameId = dot >= 0 ? key.slice(0, dot) : key;
      const taskId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gameId);
      const task = (game?.endgame || []).find((t) => (t.id || t.label) === taskId);
      if (game && task) {
        const index = getCompletedAmount(state.endgameCompleted, key) - 1;
        if (index >= 0) {
          const stored = (state.endgameCompletionDates[key] || [])[index];
          if (!stored || !stored.start || !stored.end) {
            const { start, end } = getEndgameCycleDatesForDate(task, dateStr, game);
            setEndgameCompletionDate(gameId, taskId, index, start, end);
          }
        }
      }
    }
    if (!opts.skipTimestamp) {
      recordCompletionTimestamp(type, key, {
        dateStr: isValidDateStr(opts.dateStr) ? opts.dateStr : dateStr,
        hour: opts.hour,
        minute: opts.minute,
      });
    }
    bumpDataVersion();
  }

  /**
   * Days after cycle reset before the task may be marked complete (0 = same day as reset).
   */
  function getTaskEarliestCompleteDays(task) {
    return Math.max(0, Number(task && task.earliestCompleteDays) || 0);
  }

  function getTaskEarliestCompleteTimeParts(task, game) {
    const hour = Number.isFinite(task && task.earliestCompleteHour)
      ? task.earliestCompleteHour
      : getResetHour(task, "weekStartHour", getResetHour(task, "resetHour", 4), game);
    const minute = Number.isFinite(task && task.earliestCompleteMinute)
      ? task.earliestCompleteMinute
      : (Number.isFinite(task && task.weekStartMinute) ? task.weekStartMinute : (Number.isFinite(task && task.resetMinute) ? task.resetMinute : 0));
    return { hour, minute };
  }

  function getCycleBoundsForTaskType(type, task, moment, game) {
    if (type === "weeklies") return getWeeklyCycleBoundsForMoment(task, moment, game);
    if (type === "endgame") return getEndgameCycleBoundsForMoment(task, moment, game);
    return null;
  }

  /** Calendar date (YYYY-MM-DD) when this task unlocks in the cycle containing refDateStr. */
  function getTaskUnlockDateStr(type, task, game, refDateStr) {
    if (!task || (type !== "weeklies" && type !== "endgame")) return refDateStr;
    const moment = isValidDateStr(refDateStr) ? new Date(refDateStr + "T12:00:00") : getSimulatedNow();
    const bounds = getCycleBoundsForTaskType(type, task, moment, game);
    if (!bounds) return refDateStr;
    const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
    if (!dates.length) return refDateStr;
    return addDaysToDateStr(dates[0], getTaskEarliestCompleteDays(task));
  }

  /** Instant when completion becomes allowed in the cycle containing `moment`. */
  function getTaskUnlockMoment(type, task, game, moment) {
    const m = moment instanceof Date ? moment : getSimulatedNow();
    const bounds = getCycleBoundsForTaskType(type, task, m, game);
    if (!bounds) return null;
    const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
    if (!dates.length) return null;
    const unlockDateStr = addDaysToDateStr(dates[0], getTaskEarliestCompleteDays(task));
    const { hour, minute } = getTaskEarliestCompleteTimeParts(task, game);
    const y = parseInt(unlockDateStr.slice(0, 4), 10);
    const mo = parseInt(unlockDateStr.slice(5, 7), 10) - 1;
    const d = parseInt(unlockDateStr.slice(8, 10), 10);
    const baseTz = game ? getResetTimezoneForGame(game) : getRecordingTimezone();
    const tz = getTimezoneForTaskDst(task, baseTz);
    const offsetRef = getOffsetRefDateForTask(task, tz);
    return createDateInTimezone(y, mo, d, hour, minute, tz, offsetRef);
  }

  function isTaskCompletionUnlocked(type, task, game, moment) {
    if (!task || (type !== "weeklies" && type !== "endgame")) return true;
    if (getTaskEarliestCompleteDays(task) === 0 && !Number.isFinite(task.earliestCompleteHour) && !Number.isFinite(task.earliestCompleteMinute)) {
      return true;
    }
    const now = moment instanceof Date ? moment : getSimulatedNow();
    const unlock = getTaskUnlockMoment(type, task, game, now);
    if (!unlock) return true;
    return now.getTime() >= unlock.getTime();
  }

  function getTaskUnlockHint(type, task, game, moment) {
    const unlock = getTaskUnlockMoment(type, task, game, moment || getSimulatedNow());
    if (!unlock) return "Not unlocked yet";
    const dateStr = getDateStr(unlock);
    const { hour, minute } = getTaskEarliestCompleteTimeParts(task, game);
    const t = timeToStr(hour, minute);
    return "Unlocks " + formatDate(dateStr) + " at " + t;
  }

  /**
   * True completion day for the cycle containing refDateStr (timestamp preferred, else earliest calendar mark).
   * Used by Time Trends / History so fill-remaining days are not treated as the finish day.
   */
  function getCycleCompletionDateStr(type, key, refDateStr) {
    if (!isValidDateStr(refDateStr)) return null;
    if (type === "dailies") {
      const dayData = state.completionByDate[refDateStr] || {};
      return (dayData.dailies || []).includes(key) ? refDateStr : null;
    }
    const { game, task } = resolveTaskFromKey(type, key);
    if (!game || !task) return null;
    const bounds = getCycleBoundsForTaskType(type, task, new Date(refDateStr + "T12:00:00"), game);
    return findCompletionDateInBounds(key, type, bounds);
  }

  /** True when dateStr is marked complete only because of fill-remaining after an earlier finish. */
  function isCarriedCompletionMark(type, key, dateStr) {
    if (type === "dailies") return false;
    const dayData = state.completionByDate[dateStr] || {};
    if (!(dayData[type] || []).includes(key)) return false;
    const completion = getCycleCompletionDateStr(type, key, dateStr);
    return !!(completion && completion < dateStr);
  }

  /**
   * Extracurricular stamps for Time Trends from filed completion times only.
   * Skips completed tasks with missing/invalid extracurricularCompletedAt (does not invent times).
   */
  function listExtracurricularTimestampsForTimeTrends() {
    const out = [];
    const tz = typeof getAppTimezone === "function" ? getAppTimezone() : Intl.DateTimeFormat().resolvedOptions().timeZone;
    (state.extracurricularTasks || []).forEach((task) => {
      if (!task || !task.id) return;
      if (!state.extracurricularCompleted || !state.extracurricularCompleted[task.id]) return;
      const iso = state.extracurricularCompletedAt && state.extracurricularCompletedAt[task.id];
      if (!iso || typeof iso !== "string") return;
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return;
      const parts = typeof getDatePartsInTimezone === "function"
        ? getDatePartsInTimezone(d, tz)
        : {
            year: d.getFullYear(),
            month: d.getMonth(),
            day: d.getDate(),
            hour: d.getHours(),
            minute: d.getMinutes(),
          };
      const dateStr =
        String(parts.year) +
        "-" +
        String(parts.month + 1).padStart(2, "0") +
        "-" +
        String(parts.day).padStart(2, "0");
      if (!isValidDateStr(dateStr)) return;
      const hour = Number(parts.hour);
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) return;
      out.push({
        dateStr,
        hour,
        minute: Number.isFinite(Number(parts.minute)) ? Math.max(0, Math.min(59, Math.round(Number(parts.minute)))) : 0,
        gameId: task.gameId || "",
        taskType: "extracurricular",
        taskId: task.id,
        taskLabel: task.label || task.id,
      });
    });
    return out;
  }

  /**
   * Timestamps for Time Trends hour / day-of-week charts.
   * Dailies and extracurricular pass through; weeklies/endgame keep one entry per cycle (earliest finish).
   */
  function getTimestampsForTimeTrends(rawTimestamps) {
    const list = Array.isArray(rawTimestamps) ? rawTimestamps : [];
    const out = [];
    const bestByCycle = new Map();
    list.forEach((t) => {
      if (!t || !isValidDateStr(t.dateStr)) return;
      const type = t.taskType;
      if (type === "dailies" || type === "extracurricular") {
        out.push(t);
        return;
      }
      if (type !== "weeklies" && type !== "endgame") return;
      const key = (t.gameId || "") + "." + (t.taskId || "");
      const { game, task } = resolveTaskFromKey(type, key);
      if (!game || !task) {
        out.push(t);
        return;
      }
      const bounds = getCycleBoundsForTaskType(type, task, new Date(t.dateStr + "T12:00:00"), game);
      if (!bounds) {
        out.push(t);
        return;
      }
      const cycleKey = type + "|" + t.gameId + "|" + t.taskId + "|" + getDateStr(bounds.cycleStart);
      const prev = bestByCycle.get(cycleKey);
      const hour = Number(t.hour);
      const prevHour = prev ? Number(prev.hour) : 0;
      if (
        !prev ||
        t.dateStr < prev.dateStr ||
        (t.dateStr === prev.dateStr && (Number.isFinite(hour) ? hour : 99) < (Number.isFinite(prevHour) ? prevHour : 99))
      ) {
        bestByCycle.set(cycleKey, t);
      }
    });
    bestByCycle.forEach((t) => out.push(t));
    return out;
  }

  function pctStr(n, d) {
    if (!d) return "—";
    return Math.round((n / d) * 1000) / 10 + "%";
  }

  function countMarksInDateRange(type, key, startStr, endStr) {
    let n = 0;
    Object.keys(state.completionByDate || {}).forEach((ds) => {
      if (ds < startStr || ds > endStr) return;
      if ((state.completionByDate[ds][type] || []).includes(key)) n++;
    });
    return n;
  }

  function countUniqueCyclesCompletedInRange(type, key, task, game, startStr, endStr) {
    if (!task || !game) return 0;
    const starts = new Set();
    Object.keys(state.completionByDate || {}).forEach((ds) => {
      if (ds < startStr || ds > endStr) return;
      if (!(state.completionByDate[ds][type] || []).includes(key)) return;
      const bounds = getCycleBoundsForTaskType(type, task, new Date(ds + "T12:00:00"), game);
      if (!bounds) return;
      starts.add(getDateStr(bounds.cycleStart));
    });
    return starts.size;
  }

  function countCyclesStartedInRange(type, task, game, startStr, endStr) {
    if (!task || !game) return 0;
    const { intervalMs, timeLimitMs } = getCycleParams(task);
    if (!intervalMs) return 0;
    let earliest = isValidDateStr(task.dateStarted) ? task.dateStarted : startStr;
    let cycleStartMs = getCycleStartForDate(task, earliest, game).getTime();
    const rangeStartMs = new Date(startStr + "T12:00:00").getTime();
    const rangeEndMs = new Date(endStr + "T12:00:00").getTime();
    const lastBounds = typeof getLastCycleBounds === "function" ? getLastCycleBounds(task, game) : null;
    const maxCycleStartMs = lastBounds ? lastBounds.startMs : Infinity;
    let n = 0;
    let guard = 0;
    while (cycleStartMs <= rangeEndMs && guard++ < 2000) {
      if (cycleStartMs > maxCycleStartMs) break;
      const cycleEndMs = cycleStartMs + timeLimitMs;
      if (cycleEndMs >= rangeStartMs && cycleStartMs <= rangeEndMs) n++;
      cycleStartMs += intervalMs;
    }
    return n;
  }

  function shareCardTallyDonePossible(type, key) {
    const completedMap =
      type === "dailies"
        ? state.dailiesCompleted
        : type === "weeklies"
          ? state.weekliesCompleted
          : state.endgameCompleted;
    const attemptedMap =
      type === "dailies"
        ? state.dailiesAttempted
        : type === "weeklies"
          ? state.weekliesAttempted
          : state.endgameAttempted;
    const done =
      typeof getCompletedAmount === "function"
        ? getCompletedAmount(completedMap, key)
        : Math.max(0, Number(completedMap && completedMap[key]) || 0);
    const possible =
      typeof getAttemptedAmount === "function"
        ? getAttemptedAmount(attemptedMap, key)
        : Math.max(0, Number(attemptedMap && attemptedMap[key]) || 0);
    return { done, possible };
  }

  /**
   * Readable Markdown summary (not a full backup). Used by Settings → Data → Export summary.
   */
  function buildExportSummaryMarkdown(opts) {
    const o = opts || {};
    const days = Math.max(1, Number(o.days) || 90);
    const todayStr = isValidDateStr(o.todayStr) ? o.todayStr : getDateStr();
    const startStr = addDaysToDateStr(todayStr, -(days - 1));
    const tz = typeof getAppTimezone === "function" ? getAppTimezone() : "";
    const lines = [];
    lines.push("# Gacha Tracker summary");
    lines.push("Exported: " + todayStr + (tz ? " (" + tz + ")" : ""));
    lines.push("");
    lines.push("## Completion rates (Games tallies)");
    lines.push("| Game | Dailies | Weeklies | Endgame |");
    lines.push("|------|---------|----------|---------|");

    (state.games || []).forEach((game) => {
      let dPart = "—";
      if (game.dailies) {
        const { done, possible } = shareCardTallyDonePossible("dailies", game.id);
        dPart = pctStr(done, possible) + " (" + done + "/" + possible + ")";
      }
      const weeklyBits = [];
      (game.weeklies || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const { done, possible } = shareCardTallyDonePossible("weeklies", key);
        weeklyBits.push((task.label || task.id) + " " + pctStr(done, possible) + " (" + done + "/" + possible + ")");
      });
      const endBits = [];
      (game.endgame || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const { done, possible } = shareCardTallyDonePossible("endgame", key);
        endBits.push((task.label || task.id) + " " + pctStr(done, possible) + " (" + done + "/" + possible + ")");
      });
      lines.push(
        "| " +
          (game.name || game.id) +
          " | " +
          dPart +
          " | " +
          (weeklyBits.join("; ") || "—") +
          " | " +
          (endBits.join("; ") || "—") +
          " |"
      );
    });

    lines.push("");
    lines.push("## When you finish (day of week, last " + days + " days)");
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const trendTs =
      typeof getTimestampsForTimeTrends === "function"
        ? getTimestampsForTimeTrends(state.completionTimestamps || [])
        : state.completionTimestamps || [];
    const inWindow = trendTs.filter((t) => t.dateStr >= startStr && t.dateStr <= todayStr);
    ["weeklies", "endgame"].forEach((type) => {
      const counts = [0, 0, 0, 0, 0, 0, 0];
      inWindow
        .filter((t) => t.taskType === type)
        .forEach((t) => {
          counts[new Date(t.dateStr + "T12:00:00").getDay()]++;
        });
      lines.push(
        type.charAt(0).toUpperCase() +
          type.slice(1) +
          ": " +
          dayNames.map((n, i) => n + " " + counts[i]).join(", ")
      );
    });

    lines.push("");
    lines.push("## Currency (lifetime tallies)");
    (state.games || []).forEach((game) => {
      let earned = 0;
      let potential = 0;
      if (game.dailies) {
        const c = Number(state.dailiesCompleted[game.id]) || 0;
        const a = Number(state.dailiesAttempted[game.id]) || 0;
        const pot = Number(game.dailyCurrency) || 0;
        earned += c * pot;
        potential += a * pot;
      }
      (game.weeklies || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const pot = Number(task.currency) || 0;
        earned += (Number(state.weekliesCompleted[key]) || 0) * pot;
        potential += (Number(state.weekliesAttempted[key]) || 0) * pot;
      });
      (game.endgame || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const tid = task.id || task.label;
        const c = Number(state.endgameCompleted[key]) || 0;
        const a = Number(state.endgameAttempted[key]) || 0;
        const pot = Number(task.currency) || 0;
        const earnedArr =
          (state.endgameCurrencyEarned[game.id] && state.endgameCurrencyEarned[game.id][tid]) || [];
        if (earnedArr.length) {
          earned += earnedArr.slice(0, c).reduce((s, n) => s + (Number(n) || 0), 0);
        } else {
          earned += c * pot;
        }
        const potArr =
          (state.endgameCurrencyPotential[game.id] && state.endgameCurrencyPotential[game.id][tid]) || [];
        if (potArr.length) {
          potential += potArr.slice(0, a).reduce((s, n) => s + (Number(n) || 0), 0);
        } else {
          potential += a * pot;
        }
      });
      lines.push(
        (game.name || game.id) +
          ": earned " +
          earned +
          " / potential " +
          potential +
          (potential ? " (" + pctStr(earned, potential) + ")" : "")
      );
    });

    lines.push("");
    lines.push("## Notes");
    lines.push("- Full backup: Settings → Data → Export data (JSON).");
    lines.push("- This summary uses completion timestamps for day-of-week (one event per weekly/endgame cycle).");
    if (typeof scanDataConflicts === "function") {
      const scan = scanDataConflicts();
      const total = scan && scan.counts ? scan.counts.total : (scan && scan.conflicts ? scan.conflicts.length : 0);
      if (total) lines.push("- " + total + " data conflict(s) — see Settings → Debug → Scan.");
      else lines.push("- No conflicts detected on last scan helper run.");
    }
    return lines.join("\n");
  }

  /**
   * CSV of completion events (one row per finish). Prefer deduped trend timestamps for weeklies/endgame.
   */
  function buildExportSummaryCsv(opts) {
    const o = opts || {};
    const todayStr = isValidDateStr(o.todayStr) ? o.todayStr : getDateStr();
    const days = o.days != null ? Math.max(1, Number(o.days) || 90) : null;
    const startStr = days != null ? addDaysToDateStr(todayStr, -(days - 1)) : null;
    const rows = ["game,taskType,task,completedOn,hour,dayOfWeek"];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const trendTs =
      typeof getTimestampsForTimeTrends === "function"
        ? getTimestampsForTimeTrends(state.completionTimestamps || [])
        : state.completionTimestamps || [];
    trendTs
      .filter((t) => t && isValidDateStr(t.dateStr))
      .filter((t) => !startStr || (t.dateStr >= startStr && t.dateStr <= todayStr))
      .sort((a, b) => (a.dateStr + String(a.hour)).localeCompare(b.dateStr + String(b.hour)))
      .forEach((t) => {
        const game = getGame(t.gameId);
        const gameName = (game && game.name) || t.gameId || "";
        const task = (t.taskLabel || t.taskId || "").replace(/"/g, '""');
        const dow = dayNames[new Date(t.dateStr + "T12:00:00").getDay()] || "";
        rows.push(
          '"' +
            String(gameName).replace(/"/g, '""') +
            '",' +
            (t.taskType || "") +
            ',"' +
            task +
            '",' +
            t.dateStr +
            "," +
            (Number.isFinite(Number(t.hour)) ? Number(t.hour) : "") +
            "," +
            dow
        );
      });
    return rows.join("\n");
  }

  function formatShareCardShortDate(dateStr) {
    if (!isValidDateStr(dateStr)) return String(dateStr || "");
    const d = new Date(dateStr + "T12:00:00");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  function rateParts(done, possible) {
    const d = Math.max(0, Number(done) || 0);
    const p = Math.max(0, Number(possible) || 0);
    const pct = p > 0 ? Math.round((d / p) * 100) : 0;
    return { done: d, possible: p, pct: p > 0 ? pct : null };
  }

  /**
   * Raw banner source on a task (stock path, userimg ref, or data URL).
   */
  function getTaskBannerSourceRaw(task) {
    if (!task || typeof task !== "object") return null;
    const src =
      task.bannerSourceImage ||
      task.bannerImage ||
      task.bannerHomeImage ||
      task.bannerGamesImage ||
      null;
    const s = src != null ? String(src).trim() : "";
    return s || null;
  }

  /**
   * Banner choices for a game’s share-card hero: weeklies, endgame, extracurricular linked to the game.
   */
  function collectShareCardBannerChoices(game) {
    if (!game) return [];
    const out = [];
    const seen = new Set();
    function add(source, label, kind, id) {
      const src = source != null ? String(source).trim() : "";
      if (!src || seen.has(src)) return;
      seen.add(src);
      out.push({
        id: String(id),
        label: String(label || "Banner"),
        kind: kind || "task",
        source: src,
      });
    }
    (game.weeklies || []).forEach((t) => {
      add(
        getTaskBannerSourceRaw(t),
        t.label || t.id || "Weekly",
        "weekly",
        "weekly:" + (t.id || t.label || "")
      );
    });
    (game.endgame || []).forEach((t) => {
      add(
        getTaskBannerSourceRaw(t),
        t.label || t.id || "Endgame",
        "endgame",
        "endgame:" + (t.id || t.label || "")
      );
    });
    (state.extracurricularTasks || []).forEach((t) => {
      if (!t || String(t.gameId || "") !== String(game.id)) return;
      add(
        getTaskBannerSourceRaw(t),
        t.name || t.label || "Extracurricular",
        "extra",
        "extra:" + (t.id || t.name || "")
      );
    });
    return out;
  }

  function loadShareCardImage(url) {
    return new Promise((resolve) => {
      const raw = url != null ? String(url).trim() : "";
      if (!raw) {
        resolve(null);
        return;
      }
      const src =
        typeof resolveStockBannerUrl === "function" ? resolveStockBannerUrl(raw) : raw;
      if (!src) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function drawShareCardImageCover(ctx, img, x, y, w, h) {
    if (!ctx || !img || w <= 0 || h <= 0) return;
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (iw - sw) / 2;
    const sy = (ih - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  /**
   * Data model for the share-card PNG.
   * Rates + currency use the same Games completed/attempted tallies as Games / Attendance.
   * Timeframe only filters the finish-day chart (Time Trends timestamps).
   * opts: { days?, startStr?, endStr?, todayStr?, gameIds?: string[], heroByGameId?: { [gameId]: source|"none" } }
   */
  function buildShareCardModel(opts) {
    const o = opts || {};
    const todayStr = isValidDateStr(o.todayStr) ? o.todayStr : getDateStr();
    let startStr;
    let endStr;
    let days;
    let rangeLabel;
    let isCustomRange = false;
    if (isValidDateStr(o.startStr) && isValidDateStr(o.endStr)) {
      startStr = o.startStr <= o.endStr ? o.startStr : o.endStr;
      endStr = o.startStr <= o.endStr ? o.endStr : o.startStr;
      days = 0;
      for (let ds = startStr; ds <= endStr; ds = addDaysToDateStr(ds, 1)) days++;
      isCustomRange = true;
      rangeLabel = "";
    } else {
      days = Math.max(1, Math.min(365, Math.round(Number(o.days) || 90)));
      endStr = todayStr;
      startStr = addDaysToDateStr(todayStr, -(days - 1));
      rangeLabel = "Last " + days + " days";
    }

    const allGames = typeof getAllGames === "function" ? getAllGames() : state.games || [];
    let games = allGames;
    if (Array.isArray(o.gameIds) && o.gameIds.length > 0) {
      const want = new Set(o.gameIds.map(String));
      games = allGames.filter((g) => want.has(String(g.id)));
    }
    if (!games.length) {
      return { ok: false, reason: "Select at least one game", startStr, endStr, days };
    }

    function getGameCurrencyTotals(game) {
      let earned = 0;
      let potential = 0;
      if (game.dailies) {
        const c = Number(state.dailiesCompleted[game.id]) || 0;
        const a = Number(state.dailiesAttempted[game.id]) || 0;
        const pot = Number(game.dailyCurrency) || 0;
        earned += c * pot;
        potential += a * pot;
      }
      (game.weeklies || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const pot = Number(task.currency) || 0;
        earned += (Number(state.weekliesCompleted[key]) || 0) * pot;
        potential += (Number(state.weekliesAttempted[key]) || 0) * pot;
      });
      (game.endgame || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const tid = task.id || task.label;
        const c = Number(state.endgameCompleted[key]) || 0;
        const a = Number(state.endgameAttempted[key]) || 0;
        const pot = Number(task.currency) || 0;
        const earnedArr =
          (state.endgameCurrencyEarned[game.id] && state.endgameCurrencyEarned[game.id][tid]) || [];
        if (earnedArr.length) {
          earned += earnedArr.slice(0, c).reduce((s, n) => s + (Number(n) || 0), 0);
        } else {
          earned += c * pot;
        }
        const potArr =
          (state.endgameCurrencyPotential[game.id] && state.endgameCurrencyPotential[game.id][tid]) || [];
        if (potArr.length) {
          potential += potArr.slice(0, a).reduce((s, n) => s + (Number(n) || 0), 0);
        } else {
          potential += a * pot;
        }
      });
      return {
        earned: Math.round(earned),
        potential: Math.round(potential),
        currencyName: (game.currencyName && String(game.currencyName).trim()) || "",
      };
    }

    const gameBlocks = games.map((game) => {
      const dailiesTasks = [];
      let dDone = 0;
      let dPossible = 0;
      if (game.dailies) {
        const { done, possible } = shareCardTallyDonePossible("dailies", game.id);
        dDone = done;
        dPossible = possible;
        dailiesTasks.push({
          label: "Dailies",
          ...rateParts(done, possible),
        });
      }
      const weekliesTasks = (game.weeklies || [])
        .map((task) => {
          const key = game.id + "." + (task.id || task.label);
          const { done, possible } = shareCardTallyDonePossible("weeklies", key);
          return { label: task.label || task.id || "Weekly", ...rateParts(done, possible) };
        })
        .filter((t) => t.possible > 0 || t.done > 0);
      const endgameTasks = (game.endgame || [])
        .map((task) => {
          const key = game.id + "." + (task.id || task.label);
          const { done, possible } = shareCardTallyDonePossible("endgame", key);
          return { label: task.label || task.id || "Endgame", ...rateParts(done, possible) };
        })
        .filter((t) => t.possible > 0 || t.done > 0);
      const wDone = weekliesTasks.reduce((s, t) => s + t.done, 0);
      const wPossible = weekliesTasks.reduce((s, t) => s + t.possible, 0);
      const eDone = endgameTasks.reduce((s, t) => s + t.done, 0);
      const ePossible = endgameTasks.reduce((s, t) => s + t.possible, 0);
      const bannerChoices = collectShareCardBannerChoices(game);
      const heroPick =
        o.heroByGameId && Object.prototype.hasOwnProperty.call(o.heroByGameId, game.id)
          ? o.heroByGameId[game.id]
          : undefined;
      let heroSource = null;
      if (heroPick === "none" || heroPick === "") {
        heroSource = null;
      } else if (heroPick != null && String(heroPick).trim()) {
        heroSource = String(heroPick).trim();
      } else if (bannerChoices.length) {
        heroSource = bannerChoices[0].source;
      }
      const iconSource = game.iconImage ? String(game.iconImage).trim() : null;
      return {
        id: game.id,
        name: game.name || game.id,
        subtitle: (game.subtitle && String(game.subtitle).trim()) || "",
        iconSource: iconSource || null,
        iconShape:
          game.iconShape === "circle" || game.iconShape === "square" || game.iconShape === "rounded"
            ? game.iconShape
            : "rounded",
        heroSource,
        hasIcon: !!iconSource,
        hasHero: !!heroSource,
        bannerChoiceCount: bannerChoices.length,
        summary: {
          dailies: rateParts(dDone, dPossible),
          weeklies: rateParts(wDone, wPossible),
          endgame: rateParts(eDone, ePossible),
        },
        dailies: dailiesTasks,
        weeklies: weekliesTasks,
        endgame: endgameTasks,
        currency: getGameCurrencyTotals(game),
      };
    });

    const sumCat = (cat) => {
      let done = 0;
      let possible = 0;
      gameBlocks.forEach((g) => {
        done += g.summary[cat].done;
        possible += g.summary[cat].possible;
      });
      return rateParts(done, possible);
    };

    let currencyEarned = 0;
    let currencyPotential = 0;
    gameBlocks.forEach((g) => {
      currencyEarned += g.currency.earned;
      currencyPotential += g.currency.potential;
    });
    const currencyName =
      gameBlocks.length === 1 && gameBlocks[0].currency.currencyName
        ? gameBlocks[0].currency.currencyName
        : "";

    const selectedIds = new Set(gameBlocks.map((g) => g.id));
    const trendTs =
      typeof getTimestampsForTimeTrends === "function"
        ? getTimestampsForTimeTrends(state.completionTimestamps || [])
        : state.completionTimestamps || [];
    const finishDaysSun = [0, 0, 0, 0, 0, 0, 0];
    const hourByType = {
      dailies: Array(24).fill(0),
      weeklies: Array(24).fill(0),
      endgame: Array(24).fill(0),
    };
    trendTs.forEach((t) => {
      if (!t || !isValidDateStr(t.dateStr)) return;
      if (t.dateStr < startStr || t.dateStr > endStr) return;
      if (!selectedIds.has(t.gameId)) return;
      if (t.taskType !== "weeklies" && t.taskType !== "endgame" && t.taskType !== "dailies") return;
      const day = new Date(t.dateStr + "T12:00:00").getDay();
      if (day >= 0 && day <= 6) finishDaysSun[day]++;
      const h = Number(t.hour);
      if (Number.isFinite(h) && h >= 0 && h <= 23 && hourByType[t.taskType]) {
        hourByType[t.taskType][h]++;
      }
    });
    const hourMax = Math.max(
      1,
      ...Array.from({ length: 24 }, (_, h) =>
        hourByType.dailies[h] + hourByType.weeklies[h] + hourByType.endgame[h]
      )
    );
    const dayNamesSunFirst = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const order = [1, 2, 3, 4, 5, 6, 0];
    const finishDayNames = order.map((i) => dayNamesSunFirst[i]);
    const finishDays = order.map((i) => finishDaysSun[i]);
    let peakIdx = 0;
    finishDays.forEach((n, i) => {
      if (n > finishDays[peakIdx]) peakIdx = i;
    });

    let endgameTrend = null;
    if (gameBlocks.length === 1) {
      endgameTrend = buildShareCardEndgameTrend(gameBlocks[0].id, startStr, endStr);
    }

    const dateSpan =
      formatShareCardShortDate(startStr) + " – " + formatShareCardShortDate(endStr);
    const finishWindowLabel = isCustomRange ? dateSpan : rangeLabel + " · " + dateSpan;
    const title =
      gameBlocks.length === 1
        ? gameBlocks[0].name
        : isCustomRange
          ? dateSpan
          : rangeLabel;
    const subtitle = "Games tallies · trends " + finishWindowLabel;

    return {
      ok: true,
      title,
      subtitle,
      rangeLabel,
      startStr,
      endStr,
      days,
      gameCount: gameBlocks.length,
      summary: {
        dailies: sumCat("dailies"),
        weeklies: sumCat("weeklies"),
        endgame: sumCat("endgame"),
      },
      games: gameBlocks,
      finishDays,
      finishDayNames,
      peakDay: {
        index: peakIdx,
        name: finishDayNames[peakIdx],
        count: finishDays[peakIdx],
      },
      hourByType,
      hourMax,
      endgameTrend,
      currency: {
        earned: currencyEarned,
        potential: currencyPotential,
        currencyName,
      },
    };
  }

  /**
   * Endgame line series for share card: completion index vs % time remaining.
   * Filtered to cycles whose completion (or skipped end) falls in [startStr, endStr].
   */
  function buildShareCardEndgameTrend(gameId, startStr, endStr) {
    const game = getGame(gameId);
    if (!game) return { series: [], maxX: 1 };
    const series = [];
    (game.endgame || []).forEach((task) => {
      const taskId = task.id || task.label;
      const key = game.id + "." + taskId;
      const events =
        typeof getEndgameCompletionEventsForTrend === "function"
          ? getEndgameCompletionEventsForTrend(key)
          : [];
      if (!events.length) return;
      const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
      const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
      const timeLimitMs = hasExplicitLimit
        ? getIntervalMs(task.timeLimitEvery, limitUnit)
        : getIntervalMs(task.frequencyEvery, task.frequencyUnit === "day" ? "day" : "week");
      const byCycle = {};
      events.forEach((t) => {
        let cycleStartMs;
        let cycleEndMs;
        if (t.cycleStartStr && t.cycleEndStr) {
          const startMom = getResetMomentForDateStr(task, game, t.cycleStartStr);
          const endMom = getResetMomentForDateStr(task, game, t.cycleEndStr);
          if (!startMom || !endMom || endMom.getTime() <= startMom.getTime()) return;
          cycleStartMs = startMom.getTime();
          cycleEndMs = endMom.getTime();
        } else if (t.dateStr && isValidDateStr(t.dateStr)) {
          const cycleStart = getCycleStartForDate(task, t.dateStr, game);
          cycleStartMs = cycleStart.getTime();
          cycleEndMs = cycleStartMs + timeLimitMs;
        } else {
          return;
        }
        const filterDate = t.skipped
          ? t.cycleEndStr || t.cycleStartStr
          : t.dateStr;
        if (filterDate && isValidDateStr(filterDate)) {
          if (filterDate < startStr || filterDate > endStr) return;
        }
        let pct;
        if (t.skipped) {
          pct = 0;
        } else {
          const completionMs = new Date(
            t.dateStr + "T" + String(t.hour).padStart(2, "0") + ":00:00"
          ).getTime();
          const cycleLen = cycleEndMs - cycleStartMs;
          if (cycleLen <= 0) return;
          pct = ((cycleEndMs - completionMs) / cycleLen) * 100;
          pct = Math.max(0, Math.min(100, pct));
        }
        if (byCycle[cycleStartMs] == null || pct > byCycle[cycleStartMs].pct) {
          byCycle[cycleStartMs] = { pct: pct };
        }
      });
      const sorted = Object.keys(byCycle)
        .map(Number)
        .sort((a, b) => a - b);
      if (!sorted.length) return;
      series.push({
        label: task.label || taskId,
        points: sorted.map((ms) => byCycle[ms]),
      });
    });
    const maxX = Math.max(1, ...series.map((s) => s.points.length), 1);
    return { series: series, maxX: maxX };
  }

  function getShareCardThemeColors() {
    const cs = typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement) : null;
    const pick = (name, fallback) => {
      const v = cs ? cs.getPropertyValue(name).trim() : "";
      return v || fallback;
    };
    return {
      bg: pick("--bg", "#0c0a12"),
      elevated: pick("--bg-elevated", "#1a1526"),
      panel: pick("--bg-panel", "#13101c"),
      text: pick("--text", "#f5f2fa"),
      muted: pick("--text-muted", "#a8a0b8"),
      border: pick("--border", "#2e2740"),
      accent: pick("--accent", "#a855f7"),
      dailies: pick("--pie-dailies", "#87ceeb"),
      weeklies: pick("--pie-weeklies", "#20b2aa"),
      endgame: pick("--pie-endgame", "#50c878"),
    };
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawShareCardProgressBar(ctx, x, y, w, h, pct, fillColor, trackColor) {
    roundRectPath(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = trackColor;
    ctx.fill();
    const pw = Math.max(0, Math.min(1, (Number(pct) || 0) / 100)) * w;
    if (pw > 0) {
      ctx.save();
      roundRectPath(ctx, x, y, w, h, h / 2);
      ctx.clip();
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, pw, h);
      ctx.restore();
    }
  }

  function formatShareCardRate(r, unit) {
    if (!r || r.possible <= 0 || r.pct == null) return "—";
    const u = unit ? " " + unit : "";
    return r.pct + "% · " + r.done + "/" + r.possible + u;
  }

  function formatShareCardNumber(n) {
    const v = Math.round(Number(n) || 0);
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /**
   * Render share card to a canvas (mockup-style layout).
   * Multi-game: grid of game panels + Overall (sketch layouts for 2–6+).
   */
  /**
   * Render share card to a canvas (Draft 1: hero + icon header when art exists).
   * Async — waits for icon/hero images. Missing art collapses empty bands.
   */
  async function renderShareCardCanvas(model, themeColors) {
    if (!model || !model.ok) return { ok: false, reason: (model && model.reason) || "Nothing to render" };
    if (typeof document === "undefined" || !document.createElement) {
      return { ok: false, reason: "Canvas unavailable" };
    }
    const colors = themeColors || getShareCardThemeColors();
    const games = model.games || [];
    const multi = games.length > 1;
    const cols = !multi ? 1 : games.length <= 4 ? 2 : 3;
    const W = multi ? (cols === 3 ? 1120 : 940) : 720;
    const pad = multi ? 22 : 36;
    const contentW = W - pad * 2;
    const gap = multi ? 10 : 14;
    const track = "rgba(255,255,255,0.08)";
    const font = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const cats = [
      { key: "dailies", label: "Dailies", color: colors.dailies, unit: "days" },
      { key: "weeklies", label: "Weeklies", color: colors.weeklies, unit: "" },
      { key: "endgame", label: "Endgame", color: colors.endgame, unit: "" },
    ];

    const imageCache = new Map();
    async function imgFor(src) {
      const key = src != null ? String(src) : "";
      if (!key) return null;
      if (imageCache.has(key)) return imageCache.get(key);
      const loaded = await loadShareCardImage(key);
      imageCache.set(key, loaded);
      return loaded;
    }
    await Promise.all(
      games.flatMap((g) => [imgFor(g.iconSource), imgFor(g.heroSource)])
    );

    function panelFill(ctx2, x, y, w, h, opts) {
      const o = opts || {};
      roundRectPath(ctx2, x, y, w, h, o.radius != null ? o.radius : 14);
      ctx2.fillStyle = o.fill || colors.panel;
      ctx2.fill();
      ctx2.strokeStyle = o.stroke || colors.border;
      ctx2.lineWidth = o.lineWidth != null ? o.lineWidth : 1.5;
      ctx2.stroke();
      if (o.accent) {
        ctx2.fillStyle = o.accent;
        ctx2.fillRect(x + 1, y, w - 2, 4);
      }
    }

    function ellipsize(ctx2, text, maxW) {
      let s = String(text || "");
      if (ctx2.measureText(s).width <= maxW) return s;
      while (s.length > 1 && ctx2.measureText(s + "…").width > maxW) s = s.slice(0, -1);
      return s + "…";
    }

    function drawTaskRowAt(ctx2, x, y, w, label, rate, color, unit, compact) {
      const nameSize = compact ? 11 : 15;
      const rateSize = compact ? 10 : 13;
      const barH = compact ? 6 : 10;
      const rowH = compact ? 30 : 42;
      const rateText = formatShareCardRate(rate, unit);
      ctx2.font = "600 " + rateSize + "px " + font;
      const tw = ctx2.measureText(rateText).width;
      ctx2.fillStyle = colors.text;
      ctx2.font = "600 " + nameSize + "px " + font;
      ctx2.fillText(ellipsize(ctx2, label, w - tw - 12), x, y + (compact ? 11 : 14));
      ctx2.fillStyle = colors.muted;
      ctx2.font = "600 " + rateSize + "px " + font;
      ctx2.fillText(rateText, x + w - tw, y + (compact ? 11 : 14));
      drawShareCardProgressBar(
        ctx2,
        x,
        y + (compact ? 16 : 22),
        w,
        barH,
        rate.pct != null ? rate.pct : 0,
        color,
        track
      );
      return rowH;
    }

    function categoryInnerHeight(tasks, compact) {
      if (!tasks || !tasks.length) return 0;
      const header = compact ? 18 : 28;
      const row = compact ? 30 : 42;
      return header + tasks.length * row + 6;
    }

    function drawCategoryBlock(ctx2, x, y, w, title, color, tasks, unit, compact) {
      if (!tasks || !tasks.length) return 0;
      const padIn = compact ? 10 : 14;
      const h = categoryInnerHeight(tasks, compact) + padIn;
      panelFill(ctx2, x, y, w, h, { accent: color });
      ctx2.fillStyle = color;
      ctx2.font = "700 " + (compact ? 10 : 12) + "px " + font;
      ctx2.fillText(String(title).toUpperCase(), x + padIn, y + (compact ? 20 : 26));
      let cy = y + (compact ? 28 : 36);
      tasks.forEach((t) => {
        cy += drawTaskRowAt(ctx2, x + padIn, cy, w - padIn * 2, t.label, t, color, unit, compact);
      });
      return h;
    }

    function drawMiniSummary(ctx2, x, y, w, summary, compact) {
      const gapC = compact ? 5 : 6;
      const cardW = (w - gapC * 2) / 3;
      const cardH = compact ? 48 : 72;
      cats.forEach((cat, i) => {
        const cx = x + i * (cardW + gapC);
        const r = (summary && summary[cat.key]) || { done: 0, possible: 0, pct: null };
        panelFill(ctx2, cx, y, cardW, cardH, { accent: cat.color, radius: 10 });
        ctx2.fillStyle = colors.muted;
        ctx2.font = "600 " + (compact ? 9 : 11) + "px " + font;
        ctx2.fillText(cat.label, cx + 8, y + (compact ? 16 : 20));
        ctx2.fillStyle = cat.color;
        ctx2.font = "700 " + (compact ? 18 : 24) + "px " + font;
        ctx2.fillText(r.pct != null ? r.pct + "%" : "—", cx + 8, y + (compact ? 36 : 48));
        if (!compact) {
          ctx2.fillStyle = colors.muted;
          ctx2.font = "500 10px " + font;
          ctx2.fillText(r.possible ? "(" + r.done + "/" + r.possible + ")" : "No data", cx + 8, y + 64);
        }
      });
      return cardH;
    }

    function drawCurrencyStrip(ctx2, x, y, w, cur, label, compact) {
      const h = compact ? 52 : 70;
      panelFill(ctx2, x, y, w, h, { radius: 12 });
      const gx = x + (compact ? 16 : 22);
      const gy = y + h / 2;
      const s = compact ? 8 : 11;
      ctx2.beginPath();
      ctx2.moveTo(gx, gy - s);
      ctx2.lineTo(gx + s, gy);
      ctx2.lineTo(gx, gy + s);
      ctx2.lineTo(gx - s, gy);
      ctx2.closePath();
      ctx2.fillStyle = colors.accent;
      ctx2.fill();

      const tx = x + (compact ? 32 : 44);
      ctx2.fillStyle = colors.muted;
      ctx2.font = "600 " + (compact ? 10 : 11) + "px " + font;
      ctx2.fillText(ellipsize(ctx2, label || "Currency earned", w - 50), tx, y + (compact ? 18 : 22));
      ctx2.fillStyle = colors.text;
      ctx2.font = "700 " + (compact ? 16 : 22) + "px " + font;
      const earnedStr = formatShareCardNumber(cur.earned);
      ctx2.fillText(earnedStr, tx, y + (compact ? 40 : 50));
      const earnedW = ctx2.measureText(earnedStr).width;
      ctx2.fillStyle = colors.muted;
      ctx2.font = "500 " + (compact ? 11 : 12) + "px " + font;
      const slash = " / ";
      ctx2.fillText(slash, tx + earnedW + 4, y + (compact ? 38 : 46));
      const slashW = ctx2.measureText(slash).width;
      ctx2.fillStyle = colors.accent;
      ctx2.font = "700 " + (compact ? 14 : 18) + "px " + font;
      const potStr = formatShareCardNumber(cur.potential);
      ctx2.fillText(potStr, tx + earnedW + 4 + slashW, y + (compact ? 40 : 48));
      return h;
    }

    function drawFinishChart(ctx2, x, y, w, h) {
      panelFill(ctx2, x, y, w, h, { radius: 12 });
      ctx2.fillStyle = colors.muted;
      ctx2.font = "700 10px " + font;
      ctx2.fillText("FINISH DAYS (COMPLETIONS)", x + 12, y + 18);
      const labels = model.finishDayNames || ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const counts = model.finishDays || [0, 0, 0, 0, 0, 0, 0];
      const maxC = Math.max(1, ...counts);
      const innerPad = 12;
      const chartTop = y + 28;
      const chartBottom = y + h - 22;
      const usableH = Math.max(8, chartBottom - chartTop);
      const slotW = (w - innerPad * 2) / 7;
      counts.forEach((n, i) => {
        const bx = x + innerPad + i * slotW + 4;
        const bw = Math.max(4, slotW - 8);
        const bh = Math.max(3, (n / maxC) * usableH);
        const by = chartBottom - bh;
        roundRectPath(ctx2, bx, by, bw, bh, 4);
        ctx2.fillStyle = colors.accent;
        ctx2.fill();
        ctx2.fillStyle = colors.muted;
        ctx2.font = "600 9px " + font;
        const lab = String(labels[i] || "").slice(0, 3).toUpperCase();
        const lw = ctx2.measureText(lab).width;
        ctx2.fillText(lab, bx + (bw - lw) / 2, y + h - 8);
      });
      return h;
    }

    function drawHourChart(ctx2, x, y, w, h) {
      panelFill(ctx2, x, y, w, h, { radius: 12 });
      ctx2.fillStyle = colors.muted;
      ctx2.font = "700 10px " + font;
      ctx2.fillText("COMPLETIONS BY HOUR (ROUNDED)", x + 12, y + 18);
      const legend = [
        { key: "dailies", label: "Dailies", color: colors.dailies },
        { key: "weeklies", label: "Weeklies", color: colors.weeklies },
        { key: "endgame", label: "Endgame", color: colors.endgame },
      ];
      let lx = x + 12;
      legend.forEach((item) => {
        ctx2.fillStyle = item.color;
        ctx2.fillRect(lx, y + 28, 8, 8);
        ctx2.fillStyle = colors.muted;
        ctx2.font = "600 9px " + font;
        ctx2.fillText(item.label, lx + 12, y + 35);
        lx += ctx2.measureText(item.label).width + 28;
      });
      const byType = model.hourByType || {
        dailies: Array(24).fill(0),
        weeklies: Array(24).fill(0),
        endgame: Array(24).fill(0),
      };
      const maxC = Math.max(1, Number(model.hourMax) || 1);
      const padL = 12;
      const padR = 12;
      const padB = 22;
      const chartTop = y + 48;
      const chartBottom = y + h - padB;
      const usableH = Math.max(8, chartBottom - chartTop);
      const slotW = (w - padL - padR) / 24;
      for (let hour = 0; hour < 24; hour++) {
        const bx = x + padL + hour * slotW + 1;
        const bw = Math.max(2, slotW - 2);
        let stack = 0;
        ["dailies", "weeklies", "endgame"].forEach((key) => {
          const n = (byType[key] && byType[key][hour]) || 0;
          if (n <= 0) return;
          const bh = Math.max(2, (n / maxC) * usableH);
          const by = chartBottom - stack - bh;
          ctx2.fillStyle = key === "dailies" ? colors.dailies : key === "weeklies" ? colors.weeklies : colors.endgame;
          ctx2.fillRect(bx, by, bw, bh);
          stack += bh;
        });
        if (hour % 3 === 0) {
          ctx2.fillStyle = colors.muted;
          ctx2.font = "600 8px " + font;
          const lab = String(hour);
          const tw = ctx2.measureText(lab).width;
          ctx2.fillText(lab, bx + (bw - tw) / 2, y + h - 8);
        }
      }
      return h;
    }

    function drawEndgameTrendChart(ctx2, x, y, w, h) {
      const trend = model.endgameTrend;
      if (!trend || !trend.series || !trend.series.length) return 0;
      panelFill(ctx2, x, y, w, h, { radius: 12 });
      ctx2.fillStyle = colors.muted;
      ctx2.font = "700 9px " + font;
      ctx2.fillText(
        "ENDGAME TREND: COMPLETION # VS % TIME REMAINING (100% = START, 0% = DEADLINE)",
        x + 12,
        y + 16
      );
      const padL = 40;
      const padR = 14;
      const padT = 32;
      const padB = 36;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const maxX = Math.max(1, Number(trend.maxX) || 1);
      const xDiv = maxX > 1 ? maxX - 1 : 1;
      const seriesColors = [
        colors.endgame,
        colors.dailies,
        colors.weeklies,
        "#f472b6",
        "#fbbf24",
        "#a3e635",
        "#38bdf8",
        "#c084fc",
      ];

      // axes + grid
      ctx2.strokeStyle = "rgba(255,255,255,0.08)";
      ctx2.lineWidth = 1;
      [0, 25, 50, 75, 100].forEach((pct) => {
        const gy = y + padT + plotH - (pct / 100) * plotH;
        ctx2.beginPath();
        ctx2.moveTo(x + padL, gy);
        ctx2.lineTo(x + w - padR, gy);
        ctx2.stroke();
        ctx2.fillStyle = colors.muted;
        ctx2.font = "600 9px " + font;
        ctx2.fillText(pct + "%", x + 8, gy + 3);
      });

      trend.series.forEach((serie, sIdx) => {
        const color = seriesColors[sIdx % seriesColors.length];
        const pts = serie.points || [];
        if (!pts.length) return;
        ctx2.strokeStyle = color;
        ctx2.lineWidth = 2;
        ctx2.lineJoin = "round";
        ctx2.lineCap = "round";
        ctx2.beginPath();
        pts.forEach((p, i) => {
          const px = x + padL + (i / xDiv) * plotW;
          const py = y + padT + plotH - ((Number(p.pct) || 0) / 100) * plotH;
          if (i === 0) ctx2.moveTo(px, py);
          else ctx2.lineTo(px, py);
        });
        ctx2.stroke();
        pts.forEach((p, i) => {
          const px = x + padL + (i / xDiv) * plotW;
          const py = y + padT + plotH - ((Number(p.pct) || 0) / 100) * plotH;
          ctx2.fillStyle = color;
          ctx2.beginPath();
          ctx2.arc(px, py, 3.5, 0, Math.PI * 2);
          ctx2.fill();
        });
      });

      // x labels
      ctx2.fillStyle = colors.muted;
      ctx2.font = "600 9px " + font;
      const tickStep = maxX > 8 ? 2 : 1;
      for (let i = 0; i < maxX; i += tickStep) {
        const px = x + padL + (i / xDiv) * plotW;
        const lab = String(i + 1);
        const tw = ctx2.measureText(lab).width;
        ctx2.fillText(lab, px - tw / 2, y + h - 18);
      }

      // legend
      let lx = x + padL;
      const ly = y + h - 6;
      trend.series.forEach((serie, sIdx) => {
        const color = seriesColors[sIdx % seriesColors.length];
        ctx2.fillStyle = color;
        ctx2.beginPath();
        ctx2.arc(lx + 4, ly - 3, 3.5, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.fillStyle = colors.muted;
        ctx2.font = "600 8px " + font;
        const label = ellipsize(ctx2, serie.label || "Task", 90);
        ctx2.fillText(label, lx + 12, ly);
        lx += ctx2.measureText(label).width + 28;
      });
      return h;
    }

    function drawAvatar(ctx2, game, x, y, size) {
      const img = imageCache.get(game.iconSource || "") || null;
      const shape = game.iconShape || "rounded";
      const r = shape === "circle" ? size / 2 : shape === "square" ? 6 : Math.max(8, size * 0.22);
      ctx2.save();
      roundRectPath(ctx2, x, y, size, size, r);
      ctx2.clip();
      if (img) {
        drawShareCardImageCover(ctx2, img, x, y, size, size);
      } else {
        ctx2.fillStyle = colors.panel;
        ctx2.fillRect(x, y, size, size);
        ctx2.fillStyle = colors.accent;
        ctx2.font = "700 " + Math.round(size * 0.42) + "px " + font;
        const letter = ((game.name || "?").trim().charAt(0) || "?").toUpperCase();
        const tw = ctx2.measureText(letter).width;
        ctx2.fillText(letter, x + (size - tw) / 2, y + size * 0.66);
      }
      ctx2.restore();
      ctx2.strokeStyle = colors.border;
      ctx2.lineWidth = 1.5;
      roundRectPath(ctx2, x, y, size, size, r);
      ctx2.stroke();
    }

    function measureGameCardHeight(game, innerW, compact) {
      const padIn = compact ? 10 : 16;
      const heroH = game.hasHero ? (compact ? 72 : 150) : 0;
      const headerH = compact ? 52 : 64;
      let h = (heroH ? heroH - (compact ? 18 : 28) : 0) + padIn + headerH + 6;
      h += (compact ? 48 : 72) + 8;
      cats.forEach((cat) => {
        const tasks = game[cat.key] || [];
        if (tasks.length) h += categoryInnerHeight(tasks, compact) + padIn + 6;
      });
      h += (compact ? 52 : 70) + padIn;
      return h;
    }

    function measureOverallCardHeight(innerW, compact, fullWidth) {
      const padIn = compact ? 10 : 16;
      let h = padIn + (compact ? 20 : 28) + 6;
      h += (compact ? 48 : 72) + 8;
      const chartH = fullWidth ? 100 : compact ? 84 : 110;
      h += chartH + 6;
      const hourH = fullWidth ? 130 : compact ? 100 : 120;
      h += hourH + 6;
      if (model.peakDay && model.peakDay.count > 0) h += 20;
      h += padIn;
      return h;
    }

    function drawGameHeader(ctx2, game, x, y, w, compact, withHeroOverlap) {
      const iconSize = compact ? 40 : 56;
      const textX = x + iconSize + (compact ? 10 : 14);
      const titleSize = compact ? 14 : 22;
      drawAvatar(ctx2, game, x, y, iconSize);
      ctx2.fillStyle = colors.text;
      ctx2.font = "700 " + titleSize + "px " + font;
      ctx2.fillText(ellipsize(ctx2, game.name || "Game", w - iconSize - 16), textX, y + (compact ? 16 : 22));
      const sub = game.subtitle || "";
      if (sub) {
        ctx2.fillStyle = colors.muted;
        ctx2.font = "500 " + (compact ? 10 : 12) + "px " + font;
        ctx2.fillText(ellipsize(ctx2, sub, w - iconSize - 16), textX, y + (compact ? 32 : 42));
      }
      return withHeroOverlap ? iconSize - (compact ? 8 : 12) : iconSize + (compact ? 10 : 14);
    }

    function drawGameCard(ctx2, game, x, y, w, compact, minH) {
      const padIn = compact ? 10 : 16;
      const heroH = game.hasHero ? (compact ? 72 : 110) : 0;
      const h = Math.max(measureGameCardHeight(game, w, compact), minH || 0);
      panelFill(ctx2, x, y, w, h, { radius: 14, lineWidth: 1.5 });

      let cy = y;
      if (game.hasHero) {
        const heroImg = imageCache.get(game.heroSource || "") || null;
        ctx2.save();
        roundRectPath(ctx2, x + 1, y + 1, w - 2, heroH, 13);
        ctx2.clip();
        if (heroImg) drawShareCardImageCover(ctx2, heroImg, x + 1, y + 1, w - 2, heroH);
        else {
          ctx2.fillStyle = colors.elevated;
          ctx2.fillRect(x + 1, y + 1, w - 2, heroH);
        }
        const fade = ctx2.createLinearGradient(0, y + heroH * 0.35, 0, y + heroH);
        fade.addColorStop(0, "rgba(0,0,0,0)");
        fade.addColorStop(1, "rgba(12,10,18,0.92)");
        ctx2.fillStyle = fade;
        ctx2.fillRect(x + 1, y + 1, w - 2, heroH);
        ctx2.restore();
        cy = y + heroH - (compact ? 22 : 30);
      } else {
        cy = y + padIn;
      }

      cy += drawGameHeader(ctx2, game, x + padIn, cy, w - padIn * 2, compact, !!game.hasHero) + 8;
      cy += drawMiniSummary(ctx2, x + padIn, cy, w - padIn * 2, game.summary, compact) + 8;
      cats.forEach((cat) => {
        const tasks = game[cat.key] || [];
        if (!tasks.length) return;
        cy += drawCategoryBlock(ctx2, x + padIn, cy, w - padIn * 2, cat.label, cat.color, tasks, cat.unit, compact) + 6;
      });
      const cur = game.currency || { earned: 0, potential: 0, currencyName: "" };
      const curLabel = cur.currencyName ? cur.currencyName + " earned" : "Currency earned";
      drawCurrencyStrip(ctx2, x + padIn, cy, w - padIn * 2, cur, curLabel, compact);
      return h;
    }

    function drawOverallCard(ctx2, x, y, w, compact, fullWidth, minH) {
      const padIn = compact ? 10 : 16;
      const h = Math.max(measureOverallCardHeight(w, compact, fullWidth), minH || 0);
      panelFill(ctx2, x, y, w, h, {
        radius: 14,
        lineWidth: 1.5,
        fill: colors.elevated,
      });
      let cy = y + padIn;
      ctx2.fillStyle = colors.text;
      ctx2.font = "700 " + (compact ? 14 : 18) + "px " + font;
      ctx2.fillText("Overall", x + padIn, cy + (compact ? 12 : 16));
      cy += compact ? 20 : 30;
      cy += drawMiniSummary(ctx2, x + padIn, cy, w - padIn * 2, model.summary, compact) + 8;
      const chartH = fullWidth ? 100 : compact ? 84 : 110;
      cy += drawFinishChart(ctx2, x + padIn, cy, w - padIn * 2, chartH) + 6;
      const hourH = fullWidth ? 130 : compact ? 100 : 120;
      cy += drawHourChart(ctx2, x + padIn, cy, w - padIn * 2, hourH) + 6;
      if (model.peakDay && model.peakDay.count > 0) {
        ctx2.fillStyle = colors.muted;
        ctx2.font = "600 11px " + font;
        ctx2.fillText("Peak: " + model.peakDay.name + " (" + model.peakDay.count + ")", x + padIn, cy + 12);
      }
      return h;
    }

    function measureSingleGameBody(g) {
      let h = 0;
      const heroH = g.hasHero ? 168 : 0;
      h += heroH ? heroH - 20 : 0;
      h += 70;
      h += 72 + 18;
      cats.forEach((cat) => {
        const tasks = g[cat.key] || [];
        if (tasks.length) h += categoryInnerHeight(tasks, false) + 30;
      });
      h += 120 + 14;
      h += 140 + 12;
      if (model.endgameTrend && model.endgameTrend.series && model.endgameTrend.series.length) {
        h += 200 + 12;
      }
      if (model.peakDay && model.peakDay.count > 0) h += 26;
      h += 70 + 22;
      return h;
    }

    // --- height estimate ---
    let est = pad + 160;
    if (!multi) {
      est += measureSingleGameBody(games[0] || { dailies: [], weeklies: [], endgame: [] });
    } else {
      const cellW = (contentW - gap * (cols - 1)) / cols;
      const compact = true;
      const overallInGrid = games.length % cols !== 0;
      const heights = games.map((g) => measureGameCardHeight(g, cellW, compact));
      if (overallInGrid) heights.push(measureOverallCardHeight(cellW, compact, false));
      const rows = Math.ceil(heights.length / cols);
      for (let r = 0; r < rows; r++) {
        let rowMax = 0;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          if (i < heights.length) rowMax = Math.max(rowMax, heights[i]);
        }
        est += rowMax + gap;
      }
      if (!overallInGrid) {
        est += measureOverallCardHeight(contentW, false, true) + gap;
      }
      est += 40;
    }

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = Math.max(multi ? 900 : 960, Math.ceil(est + pad));
    const ctx = canvas.getContext("2d");
    if (!ctx) return { ok: false, reason: "Canvas 2D unavailable" };

    const bgGrad = ctx.createLinearGradient(0, 0, W * 0.15, canvas.height);
    bgGrad.addColorStop(0, colors.bg);
    bgGrad.addColorStop(0.5, colors.elevated);
    bgGrad.addColorStop(1, colors.bg);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, canvas.height);

    ctx.save();
    const orb = ctx.createRadialGradient(W * 0.86, 90, 8, W * 0.86, 130, 230);
    orb.addColorStop(0, "rgba(45, 212, 191, 0.18)");
    orb.addColorStop(1, "rgba(45, 212, 191, 0)");
    ctx.fillStyle = orb;
    ctx.fillRect(0, 0, W, 380);
    ctx.restore();

    let y = pad;

    ctx.fillStyle = colors.muted;
    ctx.font = "700 12px " + font;
    ctx.fillText("GACHA TRACKER", pad, y + 12);
    y += 28;

    if (!multi) {
      const g = games[0] || {
        dailies: [],
        weeklies: [],
        endgame: [],
        summary: model.summary,
        currency: model.currency,
        name: model.title,
        hasHero: false,
        hasIcon: false,
      };
      const heroH = g.hasHero ? 168 : 0;
      if (g.hasHero) {
        const heroImg = imageCache.get(g.heroSource || "") || null;
        ctx.save();
        roundRectPath(ctx, pad, y, contentW, heroH, 18);
        ctx.clip();
        if (heroImg) drawShareCardImageCover(ctx, heroImg, pad, y, contentW, heroH);
        else {
          ctx.fillStyle = colors.elevated;
          ctx.fillRect(pad, y, contentW, heroH);
        }
        const fade = ctx.createLinearGradient(0, y + heroH * 0.4, 0, y + heroH);
        fade.addColorStop(0, "rgba(0,0,0,0)");
        fade.addColorStop(1, "rgba(12,10,18,0.95)");
        ctx.fillStyle = fade;
        ctx.fillRect(pad, y, contentW, heroH);
        ctx.restore();
        y += heroH - 36;
      }

      const iconSize = 64;
      drawAvatar(ctx, g, pad, y, iconSize);
      const textX = pad + iconSize + 16;
      ctx.fillStyle = colors.text;
      ctx.font = "700 32px " + font;
      const title = String(g.name || model.title || "Share card");
      ctx.fillText(ellipsize(ctx, title, contentW - iconSize - 20), textX, y + 28);
      ctx.fillStyle = colors.muted;
      ctx.font = "500 13px " + font;
      const subLine = g.subtitle
        ? g.subtitle + " · " + String(model.subtitle || "")
        : String(model.subtitle || "");
      ctx.fillText(ellipsize(ctx, subLine, contentW - iconSize - 20), textX, y + 50);
      y += iconSize + 18;

      const chip = model.gameCount + " game selected";
      ctx.font = "600 12px " + font;
      const chipW = ctx.measureText(chip).width + 22;
      const chipH = 26;
      roundRectPath(ctx, pad, y, chipW, chipH, 13);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = colors.text;
      ctx.fillText(chip, pad + 11, y + 17);
      y += chipH + 18;

      y += drawMiniSummary(ctx, pad, y, contentW, model.summary, false) + 18;
      cats.forEach((cat) => {
        const tasks = g[cat.key] || [];
        if (!tasks.length) return;
        y += drawCategoryBlock(ctx, pad, y, contentW, cat.label, cat.color, tasks, cat.unit, false) + 12;
      });
      y += 4;
      y += drawFinishChart(ctx, pad, y, contentW, 120) + 14;
      y += drawHourChart(ctx, pad, y, contentW, 140) + 12;
      if (model.endgameTrend && model.endgameTrend.series && model.endgameTrend.series.length) {
        y += drawEndgameTrendChart(ctx, pad, y, contentW, 200) + 12;
      }
      if (model.peakDay && model.peakDay.count > 0) {
        ctx.fillStyle = colors.text;
        ctx.font = "600 13px " + font;
        ctx.fillText("Peak: " + model.peakDay.name + " (" + model.peakDay.count + ")", pad, y + 12);
        y += 26;
      }
      const cur = model.currency || g.currency || { earned: 0, potential: 0, currencyName: "" };
      const curLabel = cur.currencyName ? cur.currencyName + " earned" : "Currency earned";
      y += drawCurrencyStrip(ctx, pad, y, contentW, cur, curLabel, false) + 22;
    } else {
      ctx.fillStyle = colors.text;
      ctx.font = "700 28px " + font;
      const title = String(model.title || "Share card");
      ctx.fillText(title.length > 40 ? title.slice(0, 38) + "…" : title, pad, y + 24);
      y += 36;
      ctx.fillStyle = colors.muted;
      ctx.font = "500 13px " + font;
      ctx.fillText(String(model.subtitle || ""), pad, y + 10);
      y += 22;
      const chip = model.gameCount + " games selected";
      ctx.font = "600 12px " + font;
      const chipW = ctx.measureText(chip).width + 22;
      roundRectPath(ctx, pad, y, chipW, 26, 13);
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = colors.text;
      ctx.fillText(chip, pad + 11, y + 17);
      y += 40;

      const cellW = (contentW - gap * (cols - 1)) / cols;
      const compact = true;
      const overallInGrid = games.length % cols !== 0;
      const items = games.map((g) => ({ kind: "game", game: g }));
      if (overallInGrid) items.push({ kind: "overall" });

      const rows = Math.ceil(items.length / cols);
      for (let r = 0; r < rows; r++) {
        const rowItems = [];
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          if (i < items.length) rowItems.push({ item: items[i], col: c });
        }
        let rowMax = 0;
        rowItems.forEach(({ item }) => {
          const mh =
            item.kind === "game"
              ? measureGameCardHeight(item.game, cellW, compact)
              : measureOverallCardHeight(cellW, compact, false);
          rowMax = Math.max(rowMax, mh);
        });
        rowItems.forEach(({ item, col }) => {
          const x = pad + col * (cellW + gap);
          if (item.kind === "game") drawGameCard(ctx, item.game, x, y, cellW, compact, rowMax);
          else drawOverallCard(ctx, x, y, cellW, compact, false, rowMax);
        });
        y += rowMax + gap;
      }

      if (!overallInGrid) {
        y += drawOverallCard(ctx, pad, y, contentW, false, true, 0) + gap;
      }
      y += 8;
    }

    ctx.fillStyle = colors.muted;
    ctx.font = "500 12px " + font;
    const foot = "Share card · not a backup";
    const fw = ctx.measureText(foot).width;
    ctx.fillText(foot, (W - fw) / 2, y + 10);
    y += 28;

    const finalH = Math.min(canvas.height, Math.max(multi ? 720 : 880, y + pad));
    if (finalH < canvas.height) {
      const trimmed = document.createElement("canvas");
      trimmed.width = W;
      trimmed.height = finalH;
      const tctx = trimmed.getContext("2d");
      if (tctx) {
        tctx.drawImage(canvas, 0, 0);
        return { ok: true, canvas: trimmed, width: W, height: finalH };
      }
    }
    return { ok: true, canvas, width: W, height: canvas.height };
  }

  async function downloadShareCardPng(opts) {
    const model = buildShareCardModel(opts);
    if (!model.ok) return model;
    const rendered = await renderShareCardCanvas(model);
    if (!rendered.ok) return rendered;
    try {
      const a = document.createElement("a");
      const stamp = (model.endStr || getDateStr()) + "";
      const slug =
        model.gameCount === 1
          ? String(model.games[0].name || "game")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
          : "multi";
      a.download = "gacha-tracker-share-" + slug + "-" + stamp + ".png";
      a.href = rendered.canvas.toDataURL("image/png");
      a.click();
      return { ok: true, model, width: rendered.width, height: rendered.height };
    } catch (err) {
      return { ok: false, reason: (err && err.message) || "Download failed" };
    }
  }

  function resolveTaskFromKey(type, key) {
    if (type === "dailies") {
      const game = getGame(key);
      return { gameId: key, taskId: "", game, task: null };
    }
    const dot = key.indexOf(".");
    const gameId = dot >= 0 ? key.slice(0, dot) : key;
    const taskId = dot >= 0 ? key.slice(dot + 1) : "";
    const game = getGame(gameId);
    const list = type === "weeklies" ? (game && game.weeklies) : (game && game.endgame);
    const task = (list || []).find((t) => (t.id || t.label) === taskId) || null;
    return { gameId, taskId, game, task };
  }

  /**
   * One write path: mark complete (calendar fill + timestamp + tallies + optional endgame currency).
   * Reversible via removeTaskCompletion (and session Undo stack).
   * @returns {{ ok: boolean, reason?: string, dateStr?: string, already?: boolean }}
   */
  const COMPLETION_UNDO_STACK_MAX = 40;
  let completionUndoStack = [];

  function cloneUndoValue(v) {
    if (v == null) return v;
    try {
      return JSON.parse(JSON.stringify(v));
    } catch (_) {
      return v;
    }
  }

  function getCompletionUndoTaskParts(type, key) {
    if (type === "dailies") return { gameId: key, taskId: "" };
    const dot = String(key || "").indexOf(".");
    return {
      gameId: dot >= 0 ? key.slice(0, dot) : key,
      taskId: dot >= 0 ? key.slice(dot + 1) : "",
    };
  }

  function timestampMatchesUndoTask(t, type, key) {
    if (!t || t.taskType !== type) return false;
    const { gameId, taskId } = getCompletionUndoTaskParts(type, key);
    if (t.gameId !== gameId) return false;
    return type === "dailies" || t.taskId === taskId;
  }

  function captureCompletionUndoSlice(type, key) {
    const markedDates = [];
    Object.keys(state.completionByDate || {})
      .sort()
      .forEach((ds) => {
        if ((state.completionByDate[ds][type] || []).includes(key)) markedDates.push(ds);
      });
    const { gameId, taskId } = getCompletionUndoTaskParts(type, key);
    const timestamps = (state.completionTimestamps || [])
      .filter((t) => timestampMatchesUndoTask(t, type, key))
      .map((t) => cloneUndoValue(t));
    const completedMap =
      type === "dailies" ? state.dailiesCompleted : type === "weeklies" ? state.weekliesCompleted : state.endgameCompleted;
    const attemptedMap =
      type === "dailies" ? state.dailiesAttempted : type === "weeklies" ? state.weekliesAttempted : state.endgameAttempted;
    const slice = {
      type,
      key,
      markedDates,
      timestamps,
      completed: Number(completedMap && completedMap[key]) || 0,
      attempted: Number(attemptedMap && attemptedMap[key]) || 0,
    };
    if (type === "endgame") {
      const eid = taskId;
      slice.endgameCurrencyEarned = cloneUndoValue(
        (state.endgameCurrencyEarned && state.endgameCurrencyEarned[gameId] && state.endgameCurrencyEarned[gameId][eid]) || []
      );
      slice.endgameCurrencyPotential = cloneUndoValue(
        (state.endgameCurrencyPotential && state.endgameCurrencyPotential[gameId] && state.endgameCurrencyPotential[gameId][eid]) || []
      );
      slice.endgameCompletionDates = cloneUndoValue((state.endgameCompletionDates && state.endgameCompletionDates[key]) || []);
      slice.endgamePendingCurrency =
        state.endgamePendingCurrency && Object.prototype.hasOwnProperty.call(state.endgamePendingCurrency, key)
          ? state.endgamePendingCurrency[key]
          : undefined;
    }
    return slice;
  }

  function restoreCompletionUndoSlice(slice) {
    if (!slice || !slice.type || !slice.key) return;
    const type = slice.type;
    const key = slice.key;
    const { gameId, taskId } = getCompletionUndoTaskParts(type, key);

    Object.keys(state.completionByDate || {}).forEach((ds) => {
      const day = state.completionByDate[ds];
      if (!day || !day[type]) return;
      const idx = day[type].indexOf(key);
      if (idx >= 0) day[type].splice(idx, 1);
    });
    (slice.markedDates || []).forEach((ds) => {
      if (!state.completionByDate[ds]) state.completionByDate[ds] = { dailies: [], weeklies: [], endgame: [] };
      if (!state.completionByDate[ds][type].includes(key)) state.completionByDate[ds][type].push(key);
    });

    state.completionTimestamps = (state.completionTimestamps || []).filter((t) => !timestampMatchesUndoTask(t, type, key));
    (slice.timestamps || []).forEach((t) => state.completionTimestamps.push(cloneUndoValue(t)));

    if (type === "dailies") {
      state.dailiesCompleted[key] = Math.max(0, Number(slice.completed) || 0);
      state.dailiesAttempted[key] = Math.max(0, Number(slice.attempted) || 0);
    } else if (type === "weeklies") {
      state.weekliesCompleted[key] = Math.max(0, Number(slice.completed) || 0);
      state.weekliesAttempted[key] = Math.max(0, Number(slice.attempted) || 0);
    } else if (type === "endgame") {
      state.endgameCompleted[key] = Math.max(0, Number(slice.completed) || 0);
      state.endgameAttempted[key] = Math.max(0, Number(slice.attempted) || 0);
      if (!state.endgameCurrencyEarned[gameId]) state.endgameCurrencyEarned[gameId] = {};
      if (!state.endgameCurrencyPotential[gameId]) state.endgameCurrencyPotential[gameId] = {};
      state.endgameCurrencyEarned[gameId][taskId] = cloneUndoValue(slice.endgameCurrencyEarned) || [];
      state.endgameCurrencyPotential[gameId][taskId] = cloneUndoValue(slice.endgameCurrencyPotential) || [];
      if (!state.endgameCompletionDates) state.endgameCompletionDates = {};
      state.endgameCompletionDates[key] = cloneUndoValue(slice.endgameCompletionDates) || [];
      if (!state.endgamePendingCurrency) state.endgamePendingCurrency = {};
      if (slice.endgamePendingCurrency === undefined) delete state.endgamePendingCurrency[key];
      else state.endgamePendingCurrency[key] = slice.endgamePendingCurrency;
    }
    bumpDataVersion();
  }

  function pushCompletionUndo(entry) {
    if (!entry || !entry.before) return;
    completionUndoStack.push({
      label: entry.label || "Completion change",
      before: entry.before,
      at: Date.now(),
    });
    while (completionUndoStack.length > COMPLETION_UNDO_STACK_MAX) completionUndoStack.shift();
    if (typeof updateCompletionUndoUI === "function") updateCompletionUndoUI();
  }

  function canUndoCompletion() {
    return completionUndoStack.length > 0;
  }

  function getCompletionUndoLabel() {
    const top = completionUndoStack[completionUndoStack.length - 1];
    return top ? top.label : "";
  }

  function undoLastCompletion(opts) {
    const o = opts || {};
    const entry = completionUndoStack.pop();
    if (!entry) return { ok: false, reason: "Nothing to undo" };
    restoreCompletionUndoSlice(entry.before);
    if (o.save !== false) save(o.saveOptions || { immediate: true });
    if (o.render !== false) renderActiveTab();
    if (typeof updateCompletionUndoUI === "function") updateCompletionUndoUI();
    return { ok: true, label: entry.label };
  }

  function clearCompletionUndoStack() {
    completionUndoStack = [];
    if (typeof updateCompletionUndoUI === "function") updateCompletionUndoUI();
  }

  function applyTaskCompletion(type, key, opts) {
    const o = opts || {};
    let dateStr = isValidDateStr(o.dateStr) ? o.dateStr : null;
    const { gameId, taskId, game, task } = resolveTaskFromKey(type, key);
    if (type === "dailies") {
      if (!game) return { ok: false, reason: "Game not found" };
      if (!dateStr) dateStr = getTaskPeriodDateStr("dailies", null, game, getSimulatedNow());
    } else if (!game || !task) {
      return { ok: false, reason: "Task not found" };
    } else if (!dateStr) {
      dateStr = getTaskPeriodDateStr(type, task, game, getSimulatedNow());
    }

    if (type === "weeklies" || type === "endgame") {
      // Block writes into cycles after the task's final cycle. Past cycles stay editable
      // in calendar history even after the event has stopped (remove already allowed this).
      const lastBounds = getLastCycleBounds(task, game);
      if (lastBounds) {
        const moment = new Date(dateStr + "T12:00:00");
        const cycleBounds =
          type === "weeklies"
            ? getWeeklyCycleBoundsForMoment(task, moment, game)
            : getEndgameCycleBoundsForMoment(task, moment, game);
        if (!cycleBounds || cycleBounds.cycleStart.getTime() > lastBounds.startMs) {
          return { ok: false, reason: "This task's cycles have ended" };
        }
      }
      const unlockDateStr = getTaskUnlockDateStr(type, task, game, dateStr);
      if (!o.skipUnlockGate) {
        if (dateStr < unlockDateStr) {
          return { ok: false, reason: getTaskUnlockHint(type, task, game, new Date(dateStr + "T12:00:00")) };
        }
        if (!isValidDateStr(o.dateStr) || o.dateStr === getDateStr()) {
          if (!isTaskCompletionUnlocked(type, task, game, getSimulatedNow())) {
            return { ok: false, reason: getTaskUnlockHint(type, task, game) };
          }
        }
      }
      if (o.clampToUnlock && dateStr < unlockDateStr) dateStr = unlockDateStr;
    }

    const already = type === "dailies"
      ? !!(state.completionByDate[dateStr] && (state.completionByDate[dateStr].dailies || []).includes(key))
      : isCompletedInCycleForDate(key, type, dateStr);
    if (already && !o.allowRetrigger) {
      return { ok: true, already: true, dateStr };
    }

    const undoBefore = o.recordUndo === false ? null : captureCompletionUndoSlice(type, key);

    if (o.updateTallies !== false) {
      if (type === "dailies") {
        const amt = getCompletedAmount(state.dailiesCompleted, key);
        state.dailiesCompleted[key] = amt + 1;
        if (getAttemptedAmount(state.dailiesAttempted, key) < state.dailiesCompleted[key]) {
          state.dailiesAttempted[key] = state.dailiesCompleted[key];
        }
      } else if (type === "weeklies") {
        const amt = getCompletedAmount(state.weekliesCompleted, key);
        state.weekliesCompleted[key] = amt + 1;
        if (getAttemptedAmount(state.weekliesAttempted, key) < state.weekliesCompleted[key]) {
          state.weekliesAttempted[key] = state.weekliesCompleted[key];
        }
      } else if (type === "endgame") {
        const amt = getCompletedAmount(state.endgameCompleted, key);
        state.endgameCompleted[key] = amt + 1;
        ensureEndgameEarnedArrayLength(gameId, taskId, amt + 1);
        snapshotEndgamePotentialAt(gameId, taskId, amt, getEndgamePotential(task));
        if (o.currencyValue != null) {
          setEndgameEarnedAt(gameId, taskId, amt, o.currencyValue, { skipSave: true, skipRender: true });
          const { start, end } = getEndgameCycleDatesForDate(task, dateStr, game);
          setEndgameCompletionDate(gameId, taskId, amt, start, end, { skipSave: true });
          if (!state.endgamePendingCurrency) state.endgamePendingCurrency = {};
          state.endgamePendingCurrency[key] = 0;
        }
        if (getAttemptedAmount(state.endgameAttempted, key) < state.endgameCompleted[key]) {
          state.endgameAttempted[key] = state.endgameCompleted[key];
        }
      }
    }

    recordCompletion(dateStr, type, key, {
      skipTimestamp: !!o.skipTimestamp,
      dateStr,
      hour: o.hour,
      minute: o.minute,
    });
    if (undoBefore) {
      const label =
        o.undoLabel ||
        ("Complete " + (type === "dailies" ? (game && game.name) || key : (task && task.label) || key));
      pushCompletionUndo({ label, before: undoBefore });
    }
    if (o.processResets !== false) processResets();
    if (o.save !== false) save(o.saveOptions);
    if (o.render !== false) renderActiveTab();
    return { ok: true, dateStr };
  }

  /**
   * One write path: undo a completion for the period containing dateStr.
   * @returns {{ ok: boolean, reason?: string, dateStr?: string, already?: boolean }}
   */
  function removeTaskCompletion(type, key, opts) {
    const o = opts || {};
    let dateStr = isValidDateStr(o.dateStr) ? o.dateStr : getDateStr();
    const { gameId, taskId, game, task } = resolveTaskFromKey(type, key);

    if (type === "dailies") {
      if (!game) return { ok: false, reason: "Game not found" };
      if (!isValidDateStr(o.dateStr)) dateStr = getTaskPeriodDateStr("dailies", null, game, getSimulatedNow());
    } else if ((type === "weeklies" || type === "endgame") && game && task && !isValidDateStr(o.dateStr)) {
      dateStr = getTaskPeriodDateStr(type, task, game, getSimulatedNow());
    }

    let completionDate = dateStr;
    if (type === "weeklies" || type === "endgame") {
      // Use the cycle that contains dateStr (calendar history edits), not "today's" cycle.
      completionDate = getCompletionDateInCycle(key, type, dateStr) || dateStr;
    }

    const isComplete = type === "dailies"
      ? (state.completionByDate[dateStr] && (state.completionByDate[dateStr].dailies || []).includes(key))
      : isCompletedInCycleForDate(key, type, dateStr);
    if (!isComplete && !o.allowRetrigger) {
      return { ok: true, already: true, dateStr: completionDate };
    }

    const undoBefore = o.recordUndo === false ? null : captureCompletionUndoSlice(type, key);

    if (o.updateTallies !== false) {
      if (type === "dailies") {
        const amt = getCompletedAmount(state.dailiesCompleted, key);
        state.dailiesCompleted[key] = Math.max(0, amt - 1);
      } else if (type === "weeklies") {
        const amt = getCompletedAmount(state.weekliesCompleted, key);
        state.weekliesCompleted[key] = Math.max(0, amt - 1);
      } else if (type === "endgame") {
        const amt = getCompletedAmount(state.endgameCompleted, key);
        state.endgameCompleted[key] = Math.max(0, amt - 1);
        ensureEndgameEarnedArrayLength(gameId, taskId, Math.max(0, amt - 1));
        ensureEndgamePotentialArrayLength(gameId, taskId, getAttemptedAmount(state.endgameAttempted, key));
      }
    }

    unrecordCompletion(completionDate, type, key, !!o.skipTimestamp);
    if (undoBefore) {
      const label =
        o.undoLabel ||
        ("Incomplete " + (type === "dailies" ? (game && game.name) || key : (task && task.label) || key));
      pushCompletionUndo({ label, before: undoBefore });
    }
    if (o.processResets !== false) processResets();
    if (o.save !== false) save(o.saveOptions);
    if (o.render !== false) renderActiveTab();
    return { ok: true, dateStr: completionDate };
  }

  function recordCompletionTimestamp(type, key, opts) {
    if (!state.completionTimestamps) state.completionTimestamps = [];
    const o = opts || {};
    const now = getSimulatedNow();
    const tz = getAppTimezone ? getAppTimezone() : Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parts = getDatePartsInTimezone
      ? getDatePartsInTimezone(now, tz)
      : {
          year: now.getFullYear(),
          month: now.getMonth(),
          day: now.getDate(),
          weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()],
          hour: now.getHours(),
          minute: now.getMinutes(),
        };
    const dateStr = isValidDateStr(o.dateStr)
      ? o.dateStr
      : String(parts.year) +
        "-" +
        String(parts.month + 1).padStart(2, "0") +
        "-" +
        String(parts.day).padStart(2, "0");
    const hour = Number.isFinite(Number(o.hour))
      ? Math.max(0, Math.min(23, Math.round(Number(o.hour))))
      : parts.hour;
    const minute = Number.isFinite(Number(o.minute))
      ? Math.max(0, Math.min(59, Math.round(Number(o.minute))))
      : Number.isFinite(parts.minute)
        ? parts.minute
        : 0;
    let gameId = key,
      taskId = "",
      taskLabel = "";
    if (type !== "dailies") {
      const dot = key.indexOf(".");
      gameId = dot >= 0 ? key.slice(0, dot) : key;
      taskId = dot >= 0 ? key.slice(dot + 1) : "";
      if (type === "extracurricular") {
        const task = (state.extracurricularTasks || []).find((t) => t.id === taskId);
        taskLabel = task ? task.label || taskId : taskId;
        if (task && task.gameId) gameId = task.gameId;
      } else {
        const game = getGame(gameId);
        const task =
          type === "weeklies"
            ? (game?.weeklies || []).find((t) => (t.id || t.label) === taskId)
            : (game?.endgame || []).find((t) => (t.id || t.label) === taskId);
        taskLabel = task ? task.label || taskId : taskId;
      }
    } else {
      const game = getGame(gameId);
      taskLabel = game ? game.name : gameId;
    }
    const already = state.completionTimestamps.some(
      (t) =>
        t.taskType === type &&
        t.gameId === gameId &&
        t.dateStr === dateStr &&
        (type === "dailies" || t.taskId === taskId)
    );
    if (already) return;
    state.completionTimestamps.push({
      dateStr,
      hour,
      minute,
      gameId,
      taskType: type,
      taskId,
      taskLabel,
    });
  }

  /**
   * List calendar completions that have no matching completionTimestamp (for Debug fill-in).
   * Returns [{ type, key, label, dateStr, gameName, taskLabel }]
   */
  function listMissingCompletionTimes() {
    const missing = [];
    const seen = new Set();
    const pushUnique = (row) => {
      const id = [row.type, row.key, row.dateStr].join("|");
      if (seen.has(id)) return;
      seen.add(id);
      missing.push(row);
    };

    // Weeklies / endgame: reuse conflict scan cycle earliest calendar day
    if (typeof scanDataConflicts === "function") {
      const scan = scanDataConflicts();
      (scan.conflicts || []).forEach((c) => {
        if (c.kind !== "calendar-without-timestamp") return;
        const game = (state.games || []).find((g) => g.name === c.game);
        if (!game) return;
        const list = c.type === "weeklies" ? game.weeklies : game.endgame;
        const task = (list || []).find((t) => (t.label || t.id) === c.task || t.id === c.task);
        if (!task) return;
        const key = game.id + "." + (task.id || task.label);
        // Prefer earliest calendar mark in that cycle as the finish day estimate
        let dateStr = c.cycleStart;
        const message = String(c.message || "");
        const m = message.match(/Calendar mark from (\d{4}-\d{2}-\d{2})/);
        if (m) dateStr = m[1];
        pushUnique({
          type: c.type,
          key,
          label: (game.name || game.id) + " — " + (task.label || task.id),
          dateStr,
          gameName: game.name,
          taskLabel: task.label || task.id,
        });
      });
    }

    // Dailies: calendar mark with no stamp on that day
    Object.keys(state.completionByDate || {})
      .sort()
      .forEach((ds) => {
        ((state.completionByDate[ds].dailies || [])).forEach((gameId) => {
          const hasTs = (state.completionTimestamps || []).some(
            (t) => t.taskType === "dailies" && t.gameId === gameId && t.dateStr === ds
          );
          if (hasTs) return;
          const game = getGame(gameId);
          pushUnique({
            type: "dailies",
            key: gameId,
            label: (game && game.name) || gameId,
            dateStr: ds,
            gameName: (game && game.name) || gameId,
            taskLabel: "Dailies",
          });
        });
      });

    return missing;
  }

  /**
   * Add missing timestamps from Debug fill-in. entries: [{ type, key, dateStr, hour, minute? }]
   */
  function fillMissingCompletionTimes(entries, opts) {
    const o = opts || {};
    const list = Array.isArray(entries) ? entries : [];
    let added = 0;
    list.forEach((row) => {
      if (!row || !row.type || !row.key || !isValidDateStr(row.dateStr)) return;
      const beforeLen = (state.completionTimestamps || []).length;
      recordCompletionTimestamp(row.type, row.key, {
        dateStr: row.dateStr,
        hour: row.hour,
        minute: row.minute,
      });
      if ((state.completionTimestamps || []).length > beforeLen) added++;
    });
    if (added) {
      bumpDataVersion();
      if (!o.skipSave) save(o.saveOptions || { immediate: true });
      if (!o.skipRender) renderActiveTab();
    }
    const after = typeof scanDataConflicts === "function" ? scanDataConflicts() : null;
    return { ok: true, added, after };
  }

  function completionStampSortKey(t) {
    const h = Number.isFinite(Number(t.hour)) ? Number(t.hour) : 0;
    const m = Number.isFinite(Number(t.minute)) ? Number(t.minute) : 0;
    return String(t.dateStr || "") + "|" + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
  }

  function stampsMatchKeepChoice(t, keep) {
    if (!t || !keep) return false;
    if (t.dateStr !== keep.dateStr) return false;
    if ((Number(t.hour) || 0) !== (Number(keep.hour) || 0)) return false;
    return (Number(t.minute) || 0) === (Number(keep.minute) || 0);
  }

  /**
   * Groups of 2+ completion timestamps in the same weekly/endgame cycle (or same daily day).
   * Returns [{ type, key, gameId, taskId, label, cycleStart, stamps: [{ dateStr, hour, minute, label }] }]
   */
  function listDuplicateCompletionTimestamps() {
    const groups = [];
    const pushGroup = (row) => {
      if (!row || !row.stamps || row.stamps.length < 2) return;
      const stamps = row.stamps
        .slice()
        .sort((a, b) => completionStampSortKey(a).localeCompare(completionStampSortKey(b)));
      groups.push(Object.assign({}, row, { stamps }));
    };

    (state.games || []).forEach((game) => {
      [["weeklies", game.weeklies], ["endgame", game.endgame]].forEach(([type, list]) => {
        (list || []).forEach((task) => {
          const taskId = task.id || task.label;
          const key = game.id + "." + taskId;
          const stamps = (state.completionTimestamps || []).filter(
            (t) =>
              t &&
              t.taskType === type &&
              t.gameId === game.id &&
              t.taskId === taskId &&
              isValidDateStr(t.dateStr)
          );
          const cycleMap = new Map();
          stamps.forEach((t) => {
            const bounds = getCycleBoundsForTaskType(type, task, new Date(t.dateStr + "T12:00:00"), game);
            if (!bounds) return;
            const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
            if (!dates.length) return;
            const start = dates[0];
            if (!cycleMap.has(start)) cycleMap.set(start, []);
            cycleMap.get(start).push({
              dateStr: t.dateStr,
              hour: Number.isFinite(Number(t.hour)) ? Number(t.hour) : 12,
              minute: Number.isFinite(Number(t.minute)) ? Number(t.minute) : 0,
            });
          });
          cycleMap.forEach((cycleStamps, start) => {
            pushGroup({
              type,
              key,
              gameId: game.id,
              taskId,
              label: (game.name || game.id) + " — " + (task.label || taskId),
              cycleStart: start,
              stamps: cycleStamps,
            });
          });
        });
      });

      if (game.dailies) {
        const byDay = new Map();
        (state.completionTimestamps || []).forEach((t) => {
          if (!t || t.taskType !== "dailies" || t.gameId !== game.id || !isValidDateStr(t.dateStr)) return;
          if (!byDay.has(t.dateStr)) byDay.set(t.dateStr, []);
          byDay.get(t.dateStr).push({
            dateStr: t.dateStr,
            hour: Number.isFinite(Number(t.hour)) ? Number(t.hour) : 12,
            minute: Number.isFinite(Number(t.minute)) ? Number(t.minute) : 0,
          });
        });
        byDay.forEach((dayStamps, ds) => {
          pushGroup({
            type: "dailies",
            key: game.id,
            gameId: game.id,
            taskId: "",
            label: (game.name || game.id) + " — Dailies",
            cycleStart: ds,
            stamps: dayStamps,
          });
        });
      }
    });

    groups.sort((a, b) => {
      const lab = String(a.label || "").localeCompare(String(b.label || ""));
      if (lab) return lab;
      return String(a.cycleStart || "").localeCompare(String(b.cycleStart || ""));
    });
    return groups;
  }

  /**
   * Keep one timestamp per duplicate group; remove the rest. Does not change calendar or tallies.
   * choices: [{ type, gameId, taskId?, cycleStart, keep: { dateStr, hour, minute? } }]
   */
  function resolveDuplicateCompletionTimestamps(choices, opts) {
    const o = opts || {};
    const list = Array.isArray(choices) ? choices : [];
    let removed = 0;
    let resolved = 0;

    list.forEach((choice) => {
      if (!choice || !choice.type || !choice.gameId || !choice.keep || !isValidDateStr(choice.keep.dateStr)) return;
      const cycleStart = isValidDateStr(choice.cycleStart) ? choice.cycleStart : null;
      if (!cycleStart) return;

      let inGroup = [];
      if (choice.type === "dailies") {
        inGroup = (state.completionTimestamps || []).filter(
          (t) => t && t.taskType === "dailies" && t.gameId === choice.gameId && t.dateStr === cycleStart
        );
      } else {
        const taskId = choice.taskId || "";
        const game = typeof getGame === "function" ? getGame(choice.gameId) : (state.games || []).find((g) => g.id === choice.gameId);
        const listTasks = game ? (choice.type === "weeklies" ? game.weeklies : game.endgame) : [];
        const task = (listTasks || []).find((t) => (t.id || t.label) === taskId);
        if (!game || !task) return;
        inGroup = (state.completionTimestamps || []).filter((t) => {
          if (!t || t.taskType !== choice.type || t.gameId !== choice.gameId || t.taskId !== taskId) return false;
          if (!isValidDateStr(t.dateStr)) return false;
          const bounds = getCycleBoundsForTaskType(choice.type, task, new Date(t.dateStr + "T12:00:00"), game);
          if (!bounds) return false;
          const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
          return dates.length && dates[0] === cycleStart;
        });
      }
      if (inGroup.length < 2) return;

      let keepRef = inGroup.find((t) => stampsMatchKeepChoice(t, choice.keep));
      if (!keepRef) keepRef = inGroup[inGroup.length - 1];
      const drop = new Set(inGroup.filter((t) => t !== keepRef));
      if (!drop.size) return;
      state.completionTimestamps = (state.completionTimestamps || []).filter((t) => !drop.has(t));
      removed += drop.size;
      resolved++;
    });

    if (removed) {
      bumpDataVersion();
      if (!o.skipSave) save(o.saveOptions || { immediate: true });
      if (!o.skipRender) renderActiveTab();
    }
    const after = typeof scanDataConflicts === "function" ? scanDataConflicts() : null;
    return { ok: true, removed, resolved, after };
  }

  /**
   * Earliest calendar mark in the weeklies/endgame cycle containing refDateStr (ignores timestamps).
   * Honors unlock clamp when possible.
   */
  function getCalendarEarliestMarkInCycle(type, key, refDateStr) {
    if (type === "dailies") {
      const dayData = state.completionByDate[refDateStr] || {};
      return (dayData.dailies || []).includes(key) ? refDateStr : null;
    }
    if (!isValidDateStr(refDateStr)) return null;
    const { game, task } = resolveTaskFromKey(type, key);
    if (!game || !task) return null;
    const bounds = getCycleBoundsForTaskType(type, task, new Date(refDateStr + "T12:00:00"), game);
    if (!bounds) return null;
    const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
    let earliest = null;
    for (const ds of dates) {
      if ((state.completionByDate[ds] && state.completionByDate[ds][type] || []).includes(key)) {
        earliest = ds;
        break;
      }
    }
    if (!earliest) return null;
    const unlockDateStr = typeof getTaskUnlockDateStr === "function" ? getTaskUnlockDateStr(type, task, game, earliest) : null;
    if (unlockDateStr && isValidDateStr(unlockDateStr) && earliest < unlockDateStr) {
      // Prefer first mark on/after unlock if one exists
      for (const ds of dates) {
        if (ds < unlockDateStr) continue;
        if ((state.completionByDate[ds] && state.completionByDate[ds][type] || []).includes(key)) return ds;
      }
    }
    return earliest;
  }

  function pickBestTimestampInList(stamps) {
    if (!stamps || !stamps.length) return null;
    return stamps
      .slice()
      .sort((a, b) => {
        if (a.dateStr !== b.dateStr) return a.dateStr < b.dateStr ? -1 : 1;
        const ha = Number(a.hour);
        const hb = Number(b.hour);
        const ma = Number(a.minute);
        const mb = Number(b.minute);
        if (ha !== hb) return (Number.isFinite(ha) ? ha : 99) - (Number.isFinite(hb) ? hb : 99);
        return (Number.isFinite(ma) ? ma : 0) - (Number.isFinite(mb) ? mb : 0);
      })[0];
  }

  /** Most common hour (then median minute) from a stamp list — keeps new fills familiar to Time Trends. */
  function inferHourMinuteFromTrendStamps(stamps) {
    const list = (stamps || []).filter((t) => t && Number.isFinite(Number(t.hour)));
    if (!list.length) return { hour: 12, minute: 0 };
    const recentFirst = list.slice().sort((a, b) => {
      if (a.dateStr !== b.dateStr) return a.dateStr < b.dateStr ? 1 : -1;
      return 0;
    });
    const sample = recentFirst.slice(0, Math.min(12, recentFirst.length));
    const hourCounts = {};
    sample.forEach((t) => {
      const h = Math.max(0, Math.min(23, Math.round(Number(t.hour))));
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    const recentHour = Math.max(0, Math.min(23, Math.round(Number(sample[0].hour))));
    let bestHour = recentHour;
    let bestCount = -1;
    Object.keys(hourCounts).forEach((h) => {
      const n = hourCounts[h];
      const hi = Number(h);
      if (n > bestCount || (n === bestCount && hi === recentHour)) {
        bestCount = n;
        bestHour = hi;
      }
    });
    const mins = sample
      .filter((t) => Math.round(Number(t.hour)) === bestHour)
      .map((t) => (Number.isFinite(Number(t.minute)) ? Math.max(0, Math.min(59, Math.round(Number(t.minute)))) : 0))
      .sort((a, b) => a - b);
    const minute = mins.length ? mins[Math.floor((mins.length - 1) / 2)] : 0;
    return { hour: bestHour, minute };
  }

  function inferCompletionTimeFromTrends(type, gameId, taskId, pool) {
    const all = Array.isArray(pool) ? pool : state.completionTimestamps || [];
    const tiers = [
      all.filter(
        (t) =>
          t &&
          t.taskType === type &&
          t.gameId === gameId &&
          (type === "dailies" || t.taskId === taskId)
      ),
      all.filter((t) => t && t.taskType === type && t.gameId === gameId),
      all.filter((t) => t && t.gameId === gameId),
      all.filter((t) => t && t.taskType === type),
      all,
    ];
    for (let i = 0; i < tiers.length; i++) {
      if (tiers[i].length) return inferHourMinuteFromTrendStamps(tiers[i]);
    }
    return { hour: 12, minute: 0 };
  }

  /**
   * Fill missing Time Trends stamps from calendar finish days — conservative.
   * - Leaves existing in-cycle stamps untouched (familiar charts).
   * - Adds stamps only where calendar has a completion and trends has none.
   * - New hours are inferred from your current Time Trends (same task → game → type → global).
   * - Does not remove orphans or rewrite calendar/tallies.
   * @param {{ gameIds?: string[], skipSave?: boolean, skipRender?: boolean }} opts
   */
  function syncTimestampsFromCalendar(opts) {
    const o = opts || {};
    const filter = Array.isArray(o.gameIds) && o.gameIds.length ? new Set(o.gameIds) : null;
    const oldStamps = Array.isArray(state.completionTimestamps) ? state.completionTimestamps.slice() : [];

    const required = [];
    const seenCycle = new Set();

    function includeGame(gameId) {
      return !filter || filter.has(gameId);
    }

    Object.keys(state.completionByDate || {})
      .sort()
      .forEach((ds) => {
        const day = state.completionByDate[ds] || {};
        (day.dailies || []).forEach((gameId) => {
          if (!includeGame(gameId)) return;
          const id = "dailies|" + gameId + "|" + ds;
          if (seenCycle.has(id)) return;
          seenCycle.add(id);
          const game = getGame(gameId);
          required.push({
            type: "dailies",
            key: gameId,
            dateStr: ds,
            gameId,
            taskId: "",
            taskLabel: (game && game.name) || gameId,
            cycleStart: ds,
            cycleEnd: ds,
          });
        });
        ["weeklies", "endgame"].forEach((type) => {
          (day[type] || []).forEach((key) => {
            const dot = key.indexOf(".");
            const gameId = dot >= 0 ? key.slice(0, dot) : key;
            if (!includeGame(gameId)) return;
            const { game, task, taskId } = resolveTaskFromKey(type, key);
            if (!game || !task) return;
            const bounds = getCycleBoundsForTaskType(type, task, new Date(ds + "T12:00:00"), game);
            if (!bounds) return;
            const cycleStart = getDateStr(bounds.cycleStart);
            const cycleKey = type + "|" + key + "|" + cycleStart;
            if (seenCycle.has(cycleKey)) return;
            const earliest = getCalendarEarliestMarkInCycle(type, key, ds);
            if (!earliest) return;
            seenCycle.add(cycleKey);
            const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
            required.push({
              type,
              key,
              dateStr: earliest,
              gameId,
              taskId: taskId || task.id || task.label,
              taskLabel: task.label || taskId,
              cycleStart,
              cycleEnd: dates.length ? dates[dates.length - 1] : cycleStart,
            });
          });
        });
      });

    let kept = 0;
    let added = 0;
    let collapsed = 0;
    const toAdd = [];

    required.forEach((req) => {
      let stampsInCycle;
      if (req.type === "dailies") {
        stampsInCycle = oldStamps.filter(
          (t) => t && t.taskType === "dailies" && t.gameId === req.gameId && t.dateStr === req.dateStr
        );
      } else {
        stampsInCycle = oldStamps.filter(
          (t) =>
            t &&
            t.taskType === req.type &&
            t.gameId === req.gameId &&
            t.taskId === req.taskId &&
            isValidDateStr(t.dateStr) &&
            t.dateStr >= req.cycleStart &&
            t.dateStr <= req.cycleEnd
        );
      }
      if (stampsInCycle.length) {
        kept++;
        // Collapse duplicate stamps in the same cycle to the earliest finish (keeps charts clean, same hour family).
        if (stampsInCycle.length > 1) {
          const best = pickBestTimestampInList(stampsInCycle);
          stampsInCycle.forEach((t) => {
            if (t === best) return;
            const idx = state.completionTimestamps.indexOf(t);
            if (idx >= 0) {
              state.completionTimestamps.splice(idx, 1);
              collapsed++;
            }
          });
        }
        return;
      }
      const inferred = inferCompletionTimeFromTrends(req.type, req.gameId, req.taskId, oldStamps);
      toAdd.push({
        type: req.type,
        key: req.key,
        dateStr: req.dateStr,
        hour: inferred.hour,
        minute: inferred.minute,
        taskLabel: req.taskLabel,
      });
    });

    toAdd.forEach((row) => {
      const beforeLen = (state.completionTimestamps || []).length;
      recordCompletionTimestamp(row.type, row.key, {
        dateStr: row.dateStr,
        hour: row.hour,
        minute: row.minute,
      });
      if ((state.completionTimestamps || []).length > beforeLen) added++;
    });

    if (added || collapsed) {
      bumpDataVersion();
      if (!o.skipSave) save(o.saveOptions || { immediate: true });
      if (!o.skipRender) renderActiveTab();
    } else if (!o.skipRender) {
      renderActiveTab();
    }
    const after = typeof scanDataConflicts === "function" ? scanDataConflicts() : null;
    return {
      ok: true,
      kept,
      added,
      collapsed,
      moved: 0,
      removed: collapsed,
      missing: [],
      after,
    };
  }

  function unrecordCompletionTimestamp(type, key, dateStr) {
    if (!state.completionTimestamps || state.completionTimestamps.length === 0) return;
    let gameId = key, taskId = "";
    if (type !== "dailies") {
      const dot = key.indexOf(".");
      gameId = dot >= 0 ? key.slice(0, dot) : key;
      taskId = dot >= 0 ? key.slice(dot + 1) : "";
    }
    let cycleDates = null;
    if (type !== "dailies" && isValidDateStr(dateStr)) {
      cycleDates = getAllDatesInPeriod(type, key, dateStr);
    }
    for (let i = state.completionTimestamps.length - 1; i >= 0; i--) {
      const t = state.completionTimestamps[i];
      if (t.gameId !== gameId || t.taskType !== type) continue;
      if (type !== "dailies" && t.taskId !== taskId) continue;
      if (cycleDates && cycleDates.length && !cycleDates.includes(t.dateStr)) continue;
      state.completionTimestamps.splice(i, 1);
      return;
    }
  }

  function unrecordCompletion(dateStr, type, key, skipTimestamp) {
    let datesToRemove;
    if (type === "weeklies" || type === "endgame") {
      // Clear the cycle containing dateStr (not only the live "current" cycle).
      const completionDate = getCompletionDateInCycle(key, type, dateStr);
      datesToRemove = completionDate
        ? getRemainingDatesInPeriod(type, key, completionDate)
        : getAllDatesInPeriod(type, key, dateStr);
    } else {
      datesToRemove = [dateStr];
    }
    datesToRemove.forEach((ds) => {
      if (!state.completionByDate[ds]) return;
      const arr = state.completionByDate[ds][type];
      const idx = arr.indexOf(key);
      if (idx >= 0) arr.splice(idx, 1);
    });
    if (!skipTimestamp) unrecordCompletionTimestamp(type, key, dateStr);
    bumpDataVersion();
  }

  /**
   * Persist dateStarted for weeklies/endgame that never had one, using earliest calendar/timestamp.
   * Prevents the "anchor = today" fallback from hiding older History calendar availability.
   * For endgame only, also pull dateStarted earlier when history clearly starts before the stored
   * value (e.g. Anomaly Arbitration drifted from 2026-02-11 to 2026-05-31). Weeklies keep an
   * existing dateStarted untouched so cycle anchors for other flows stay stable.
   */
  function migrateMissingTaskDateStarted() {
    let changed = false;
    (state.games || []).forEach((game) => {
      [["weeklies", game.weeklies], ["endgame", game.endgame]].forEach(([type, list]) => {
        (list || []).forEach((task) => {
          const key = game.id + "." + (task.id || task.label);
          const taskId = task.id || task.label;
          let earliest = getTaskFirstCalendarCompletionDate(game, type, key);
          (state.completionTimestamps || []).forEach((t) => {
            if (t.taskType !== type || t.gameId !== game.id) return;
            if (type !== "dailies" && t.taskId !== taskId) return;
            if (!isValidDateStr(t.dateStr)) return;
            if (!earliest || t.dateStr < earliest) earliest = t.dateStr;
          });
          if (!earliest) return;
          if (!isValidDateStr(task.dateStarted)) {
            task.dateStarted = earliest;
            changed = true;
            return;
          }
          if (type === "endgame" && earliest < task.dateStarted) {
            task.dateStarted = earliest;
            changed = true;
          }
        });
      });
    });
    if (changed) {
      bumpDataVersion();
      save({ immediate: true });
    }
  }

  function isPainCageTask(task) {
    if (!task) return false;
    const id = String(task.id || "").toLowerCase();
    const label = String(task.label || "").toLowerCase().replace(/\s+/g, " ").trim();
    return id === "pain_cage" || id.includes("pain_cage") || label === "pain cage";
  }

  /** One-time: seed earliestComplete* on legacy Pain Cage tasks (replaces hardcode). */
  function migrateTaskEarliestCompleteFields() {
    let changed = false;
    (state.games || []).forEach((game) => {
      (game.endgame || []).forEach((task) => {
        if (!isPainCageTask(task)) return;
        if (task.earliestCompleteDays != null) return;
        task.earliestCompleteDays = 2;
        task.earliestCompleteHour = 0;
        task.earliestCompleteMinute = 0;
        changed = true;
      });
    });
    if (changed) {
      bumpDataVersion();
      save({ immediate: true });
    }
  }

  /** Current schema version for one-shot migrations (not the cache dataVersion). */
  const SCHEMA_VERSION = 2;

  /**
   * Run safe field migrations once. Does not rewrite completion dates/timestamps;
   * use runIntegrityRepair() from Settings → Debug for that.
   */
  function migrateSchemaIfNeeded() {
    const current = Number(state.schemaVersion) || 0;
    if (typeof migrateEndgameCurrencyPotential === "function") migrateEndgameCurrencyPotential();
    if (current >= SCHEMA_VERSION) return;
    migrateMissingTaskDateStarted();
    migrateTaskEarliestCompleteFields();
    state.schemaVersion = SCHEMA_VERSION;
    bumpDataVersion();
    save({ immediate: true });
  }

  function dedupeCompletionTimestamps() {
    let removed = 0;
    const seen = new Set();
    const next = [];
    (state.completionTimestamps || []).forEach((t) => {
      if (!t || !isValidDateStr(t.dateStr) || !t.taskType || !t.gameId) return;
      const taskId = t.taskType === "dailies" ? "" : (t.taskId || "");
      const k = [t.taskType, t.gameId, taskId, t.dateStr].join("|");
      if (seen.has(k)) {
        removed++;
        return;
      }
      seen.add(k);
      next.push(t);
    });
    if (removed) state.completionTimestamps = next;
    return removed;
  }

  function syncAllTalliesFromCalendar(opts) {
    const o = opts || {};
    (state.games || []).forEach((game) => {
      if (game.dailies) syncTaskWithCalendar(game, "dailies", game.id, { skipSave: true, skipRender: true });
      (game.weeklies || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        syncTaskWithCalendar(game, "weeklies", key, { skipSave: true, skipRender: true });
      });
      (game.endgame || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        syncTaskWithCalendar(game, "endgame", key, { skipSave: true, skipRender: true });
      });
    });
    if (!o.skipSave) {
      bumpDataVersion();
      save(o.saveOptions || { immediate: true });
    }
    if (!o.skipRender) renderActiveTab();
  }

  function getHistoryCompactBaseline(bucket, key) {
    const hc = state.historyCompact;
    if (!hc || !hc.baselines || !hc.baselines[bucket]) return 0;
    const n = Number(hc.baselines[bucket][key]);
    return Number.isFinite(n) ? n : 0;
  }

  function emptyHistoryCompactBaselines() {
    return {
      dailiesCompleted: {},
      dailiesAttempted: {},
      weekliesCompleted: {},
      weekliesAttempted: {},
      endgameCompleted: {},
      endgameAttempted: {},
    };
  }

  function captureAllTalliesSnapshot() {
    return {
      dailiesCompleted: Object.assign({}, state.dailiesCompleted || {}),
      dailiesAttempted: Object.assign({}, state.dailiesAttempted || {}),
      weekliesCompleted: Object.assign({}, state.weekliesCompleted || {}),
      weekliesAttempted: Object.assign({}, state.weekliesAttempted || {}),
      endgameCompleted: Object.assign({}, state.endgameCompleted || {}),
      endgameAttempted: Object.assign({}, state.endgameAttempted || {}),
    };
  }

  function restoreAllTalliesSnapshot(snap) {
    if (!snap) return;
    state.dailiesCompleted = Object.assign({}, snap.dailiesCompleted || {});
    state.dailiesAttempted = Object.assign({}, snap.dailiesAttempted || {});
    state.weekliesCompleted = Object.assign({}, snap.weekliesCompleted || {});
    state.weekliesAttempted = Object.assign({}, snap.weekliesAttempted || {});
    state.endgameCompleted = Object.assign({}, snap.endgameCompleted || {});
    state.endgameAttempted = Object.assign({}, snap.endgameAttempted || {});
  }

  function subtractTallyMaps(fullMap, afterMap) {
    const out = {};
    const keys = new Set([].concat(Object.keys(fullMap || {}), Object.keys(afterMap || {})));
    keys.forEach((k) => {
      const n = (Number(fullMap[k]) || 0) - (Number(afterMap[k]) || 0);
      if (n > 0) out[k] = n;
    });
    return out;
  }

  function getCompactCutoffDateStr(months) {
    const m = Math.max(1, Math.min(120, Math.round(Number(months) || 12)));
    const now = getSimulatedNow();
    const d = new Date(now.getFullYear(), now.getMonth() - m, now.getDate(), 12, 0, 0);
    return getDateStr(d);
  }

  /**
   * Preview dropping calendar days on/before cutoff. Tallies are unchanged;
   * Sync stays correct via historyCompact baselines.
   */
  function previewHistoryCompact(months) {
    const m = Math.max(1, Math.min(120, Math.round(Number(months) || 12)));
    const cutoffDateStr = getCompactCutoffDateStr(m);
    let removedCalendarDays = 0;
    let removedMarks = 0;
    Object.keys(state.completionByDate || {}).forEach((ds) => {
      if (!isValidDateStr(ds) || ds > cutoffDateStr) return;
      removedCalendarDays++;
      const day = state.completionByDate[ds] || {};
      removedMarks +=
        (day.dailies || []).length + (day.weeklies || []).length + (day.endgame || []).length;
    });
    return {
      months: m,
      cutoffDateStr,
      removedCalendarDays,
      removedMarks,
      existingCutoff: state.historyCompact && state.historyCompact.cutoffDateStr
        ? state.historyCompact.cutoffDateStr
        : null,
    };
  }

  /**
   * Drop per-day marks on/before cutoff while keeping completed/attempted tallies.
   * Stores baselines so Sync = baseline + remaining calendar.
   */
  function applyHistoryCompact(months, opts) {
    const o = opts || {};
    const preview = previewHistoryCompact(months);
    if (preview.removedCalendarDays === 0) {
      return { ok: false, reason: "No calendar days on or before " + preview.cutoffDateStr, preview };
    }

    const cutoff = preview.cutoffDateStr;
    beginTallyCacheFrame();
    try {
      syncAllTalliesFromCalendar({ skipSave: true, skipRender: true });
      const full = captureAllTalliesSnapshot();

      const savedCal = state.completionByDate;
      const filtered = {};
      Object.keys(savedCal || {}).forEach((ds) => {
        if (ds > cutoff) filtered[ds] = savedCal[ds];
      });
      const prevCompact = state.historyCompact;
      state.completionByDate = filtered;
      state.historyCompact = null;
      syncAllTalliesFromCalendar({ skipSave: true, skipRender: true });
      const after = captureAllTalliesSnapshot();

      state.completionByDate = savedCal;
      state.historyCompact = prevCompact;

      const baselines = emptyHistoryCompactBaselines();
      baselines.dailiesCompleted = subtractTallyMaps(full.dailiesCompleted, after.dailiesCompleted);
      baselines.dailiesAttempted = subtractTallyMaps(full.dailiesAttempted, after.dailiesAttempted);
      baselines.weekliesCompleted = subtractTallyMaps(full.weekliesCompleted, after.weekliesCompleted);
      baselines.weekliesAttempted = subtractTallyMaps(full.weekliesAttempted, after.weekliesAttempted);
      baselines.endgameCompleted = subtractTallyMaps(full.endgameCompleted, after.endgameCompleted);
      baselines.endgameAttempted = subtractTallyMaps(full.endgameAttempted, after.endgameAttempted);

      Object.keys(state.completionByDate || {}).forEach((ds) => {
        if (ds <= cutoff) delete state.completionByDate[ds];
      });

      state.historyCompact = {
        cutoffDateStr: cutoff,
        compactedAt: new Date().toISOString(),
        months: preview.months,
        removedCalendarDays: preview.removedCalendarDays,
        removedMarks: preview.removedMarks,
        baselines,
      };
      restoreAllTalliesSnapshot(full);
    } finally {
      endTallyCacheFrame();
    }

    bumpDataVersion();
    if (!o.skipSave) save(o.saveOptions || { immediate: true });
    if (!o.skipRender) renderActiveTab();
    return { ok: true, preview, historyCompact: state.historyCompact };
  }

  /**
   * Scan for conflicting completion data (calendar vs timestamps vs tallies vs unlock).
   * Read-only — does not mutate state.
   */
  function scanDataConflicts() {
    const conflicts = [];
    const push = (c) => conflicts.push(c);

    (state.games || []).forEach((game) => {
      [["weeklies", game.weeklies], ["endgame", game.endgame]].forEach(([type, list]) => {
        (list || []).forEach((task) => {
          const taskId = task.id || task.label;
          const key = game.id + "." + taskId;
          const unlockDays = getTaskEarliestCompleteDays(task);

          const calDates = [];
          Object.keys(state.completionByDate || {}).sort().forEach((ds) => {
            if ((state.completionByDate[ds][type] || []).includes(key)) calDates.push(ds);
          });
          const stamps = (state.completionTimestamps || []).filter(
            (t) => t.taskType === type && t.gameId === game.id && t.taskId === taskId && isValidDateStr(t.dateStr)
          );

          const cycleMap = new Map(); // cycleStart -> { calEarliest, tsEarliest, stamps: [] }
          const ensureCycle = (ds) => {
            const bounds = getCycleBoundsForTaskType(type, task, new Date(ds + "T12:00:00"), game);
            if (!bounds) return null;
            const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
            if (!dates.length) return null;
            const start = dates[0];
            if (!cycleMap.has(start)) cycleMap.set(start, { calEarliest: null, tsEarliest: null, stamps: [], dates });
            return cycleMap.get(start);
          };

          calDates.forEach((ds) => {
            const cyc = ensureCycle(ds);
            if (!cyc) return;
            if (!cyc.calEarliest || ds < cyc.calEarliest) cyc.calEarliest = ds;
          });
          stamps.forEach((t) => {
            const cyc = ensureCycle(t.dateStr);
            if (!cyc) return;
            cyc.stamps.push(t);
            if (!cyc.tsEarliest || t.dateStr < cyc.tsEarliest) cyc.tsEarliest = t.dateStr;
          });

          cycleMap.forEach((cyc, start) => {
            const unlockDate = addDaysToDateStr(start, unlockDays);
            if (cyc.tsEarliest && !cyc.calEarliest) {
              push({
                severity: "warn",
                kind: "timestamp-without-calendar",
                game: game.name,
                gameId: game.id,
                task: task.label || taskId,
                taskId,
                type,
                key,
                cycleStart: start,
                dateStr: cyc.tsEarliest,
                message: "Timestamp on " + cyc.tsEarliest + " but no calendar mark in cycle starting " + start,
              });
            }
            if (cyc.calEarliest && !cyc.tsEarliest) {
              push({
                severity: "info",
                kind: "calendar-without-timestamp",
                game: game.name,
                gameId: game.id,
                task: task.label || taskId,
                taskId,
                type,
                key,
                cycleStart: start,
                dateStr: cyc.calEarliest,
                message: "Calendar mark from " + cyc.calEarliest + " with no timestamp (cycle " + start + ")",
              });
            }
            if (cyc.calEarliest && cyc.tsEarliest && cyc.calEarliest < cyc.tsEarliest) {
              let earlyStamp = null;
              (cyc.stamps || []).forEach((s) => {
                if (!s || !isValidDateStr(s.dateStr)) return;
                if (!earlyStamp || completionStampSortKey(s) < completionStampSortKey(earlyStamp)) earlyStamp = s;
              });
              push({
                severity: "warn",
                kind: "calendar-before-timestamp",
                game: game.name,
                gameId: game.id,
                task: task.label || taskId,
                taskId,
                type,
                key,
                cycleStart: start,
                dateStr: earlyStamp ? earlyStamp.dateStr : cyc.tsEarliest,
                hour: earlyStamp
                  ? Number.isFinite(Number(earlyStamp.hour))
                    ? Number(earlyStamp.hour)
                    : 12
                  : null,
                minute: earlyStamp
                  ? Number.isFinite(Number(earlyStamp.minute))
                    ? Number(earlyStamp.minute)
                    : 0
                  : null,
                calEarliest: cyc.calEarliest,
                suggestedDateStr: cyc.tsEarliest,
                suggestedHour: earlyStamp
                  ? Number.isFinite(Number(earlyStamp.hour))
                    ? Number(earlyStamp.hour)
                    : 12
                  : 12,
                suggestedMinute: earlyStamp
                  ? Number.isFinite(Number(earlyStamp.minute))
                    ? Number(earlyStamp.minute)
                    : 0
                  : 0,
                message:
                  "Calendar starts " +
                  cyc.calEarliest +
                  " but timestamp is " +
                  cyc.tsEarliest +
                  " (cycle " +
                  start +
                  ")",
              });
            }
            if (cyc.stamps.length > 1) {
              const uniq = new Set(cyc.stamps.map((s) => s.dateStr));
              if (uniq.size > 1 || cyc.stamps.length > uniq.size) {
                push({
                  severity: "warn",
                  kind: "duplicate-timestamps",
                  game: game.name,
                  gameId: game.id,
                  task: task.label || taskId,
                  taskId,
                  type,
                  key,
                  cycleStart: start,
                  stamps: (cyc.stamps || []).map((s) => ({
                    dateStr: s.dateStr,
                    hour: Number.isFinite(Number(s.hour)) ? Number(s.hour) : 12,
                    minute: Number.isFinite(Number(s.minute)) ? Number(s.minute) : 0,
                  })),
                  message: cyc.stamps.length + " timestamps in cycle " + start + " (" + [...uniq].join(", ") + ")",
                });
              }
            }
            // Only flag unlock windows the task actually defines (days > 0 or custom unlock time).
            const hasUnlockWindow =
              unlockDays > 0 ||
              Number.isFinite(task.earliestCompleteHour) ||
              Number.isFinite(task.earliestCompleteMinute);
            if (hasUnlockWindow) {
              let earlyStamp = null;
              (cyc.stamps || []).forEach((s) => {
                if (!s || !isValidDateStr(s.dateStr)) return;
                if (!earlyStamp) {
                  earlyStamp = s;
                  return;
                }
                const a = completionStampSortKey(s);
                const b = completionStampSortKey(earlyStamp);
                if (a < b) earlyStamp = s;
              });
              const earlyDate = earlyStamp ? earlyStamp.dateStr : cyc.calEarliest;
              if (earlyDate) {
                let violates = false;
                let completionLabel = earlyDate;
                const hour = earlyStamp
                  ? Number.isFinite(Number(earlyStamp.hour))
                    ? Number(earlyStamp.hour)
                    : 12
                  : null;
                const minute = earlyStamp
                  ? Number.isFinite(Number(earlyStamp.minute))
                    ? Number(earlyStamp.minute)
                    : 0
                  : null;
                if (earlyStamp) {
                  const y = parseInt(earlyDate.slice(0, 4), 10);
                  const mo = parseInt(earlyDate.slice(5, 7), 10) - 1;
                  const d = parseInt(earlyDate.slice(8, 10), 10);
                  const baseTz = getResetTimezoneForGame(game);
                  const tz = getTimezoneForTaskDst(task, baseTz);
                  const offsetRef = getOffsetRefDateForTask(task, tz);
                  const completionMoment = createDateInTimezone(y, mo, d, hour, minute, tz, offsetRef);
                  const unlockMoment = getTaskUnlockMoment(type, task, game, completionMoment);
                  completionLabel =
                    earlyDate +
                    " " +
                    (typeof timeToStr === "function" ? timeToStr(hour, minute) : hour + ":" + String(minute).padStart(2, "0"));
                  if (unlockMoment && completionMoment.getTime() < unlockMoment.getTime()) violates = true;
                } else if (earlyDate < unlockDate) {
                  violates = true;
                }
                if (violates) {
                  const unlockParts = getTaskEarliestCompleteTimeParts(task, game);
                  const unlockTimeLabel =
                    typeof timeToStr === "function"
                      ? timeToStr(unlockParts.hour, unlockParts.minute)
                      : unlockParts.hour + ":" + String(unlockParts.minute).padStart(2, "0");
                  const sameDay = earlyDate === unlockDate;
                  const msg = earlyStamp
                    ? sameDay
                      ? "Completion " +
                        completionLabel +
                        " is before unlock time " +
                        unlockDate +
                        " " +
                        unlockTimeLabel +
                        " (cycle " +
                        start +
                        ")"
                      : "Completion " +
                        completionLabel +
                        " is before unlock " +
                        unlockDate +
                        " " +
                        unlockTimeLabel +
                        " (cycle " +
                        start +
                        ")"
                    : "Completion " +
                      earlyDate +
                      " is before unlock day " +
                      unlockDate +
                      " (cycle " +
                      start +
                      ")";
                  push({
                    severity: "error",
                    kind: "before-unlock",
                    game: game.name,
                    gameId: game.id,
                    task: task.label || taskId,
                    taskId,
                    type,
                    key,
                    cycleStart: start,
                    dateStr: earlyDate,
                    hour,
                    minute,
                    unlockDate,
                    unlockHour: unlockParts.hour,
                    unlockMinute: unlockParts.minute,
                    suggestedDateStr: unlockDate,
                    suggestedHour: unlockParts.hour,
                    suggestedMinute: unlockParts.minute,
                    message: msg,
                  });
                }
              }
            }
          });

          // Tally vs calendar completed count
          if (typeof getTaskTallyHistory === "function") {
            const history = getTaskTallyHistory(game, type, key);
            const calCompleted =
              history.reduce((s, p) => s + p.completed, 0) +
              getHistoryCompactBaseline(type === "weeklies" ? "weekliesCompleted" : "endgameCompleted", key);
            const tallied = getCompletedAmount(
              type === "weeklies" ? state.weekliesCompleted : state.endgameCompleted,
              key
            );
            if (calCompleted !== tallied) {
              push({
                severity: "warn",
                kind: "tally-mismatch",
                game: game.name,
                task: task.label || taskId,
                type,
                message: "Completed tally is " + tallied + " but calendar+archive shows " + calCompleted + " cycle(s)",
              });
            }
          }
        });
      });
    });

    const byKind = {};
    conflicts.forEach((c) => {
      byKind[c.kind] = (byKind[c.kind] || 0) + 1;
    });
    return {
      schemaVersion: Number(state.schemaVersion) || 0,
      targetSchemaVersion: SCHEMA_VERSION,
      conflicts,
      counts: {
        total: conflicts.length,
        error: conflicts.filter((c) => c.severity === "error").length,
        warn: conflicts.filter((c) => c.severity === "warn").length,
        info: conflicts.filter((c) => c.severity === "info").length,
        byKind,
      },
    };
  }

  function formatConflictScanReport(scan) {
    const lines = [];
    lines.push("Schema version: " + scan.schemaVersion + " (target " + scan.targetSchemaVersion + ")");
    if (state.historyCompact && state.historyCompact.cutoffDateStr) {
      lines.push(
        "History compact: calendar on/before " +
          state.historyCompact.cutoffDateStr +
          " archived (Sync uses tallies baselines)"
      );
    }
    lines.push(
      "Conflicts: " +
        scan.counts.total +
        "  (errors " +
        scan.counts.error +
        ", warnings " +
        scan.counts.warn +
        ", info " +
        scan.counts.info +
        ")"
    );
    if (!scan.conflicts.length) {
      lines.push("");
      lines.push("No conflicts found.");
      return lines.join("\n");
    }
    lines.push("");
    lines.push("Note: [info] calendar-without-timestamp is normal for older marks and is not auto-fixed.");
    lines.push("Fix hints:");
    lines.push("  • calendar-before-timestamp / before-unlock / duplicates → Fix times & dates…");
    lines.push("  • tally-mismatch → Rebuild tallies only");
    lines.push("  • timestamp-without-calendar → Fix times & dates… or Repair (safe)");
    lines.push("  • (dropped in Fix times & dates) cycle becomes a skip after tallies rebuild");
    lines.push("");
    scan.conflicts.slice(0, 80).forEach((c, i) => {
      lines.push((i + 1) + ". [" + c.severity + "] " + (c.game || "") + " / " + (c.task || "") + " — " + c.message);
    });
    if (scan.conflicts.length > 80) lines.push("…and " + (scan.conflicts.length - 80) + " more");
    return lines.join("\n");
  }

  /** before-unlock errors from the latest scan (for Debug edit modal). */
  function listBeforeUnlockConflicts() {
    const scan = scanDataConflicts();
    return (scan.conflicts || []).filter((c) => c && c.kind === "before-unlock");
  }

  /**
   * Debug: move finish date/time for before-unlock cycles.
   * edits: [{ type, gameId, taskId, cycleStart, newDateStr, hour, minute }]
   * Rewrites timestamps + calendar marks in that cycle; tallies unchanged.
   */
  function applyDebugBeforeUnlockEdits(edits, opts) {
    const o = opts || {};
    const list = Array.isArray(edits) ? edits : [];
    let updated = 0;
    list.forEach((edit) => {
      if (!edit || !edit.type || !edit.gameId || !edit.taskId || !isValidDateStr(edit.newDateStr)) return;
      if (!isValidDateStr(edit.cycleStart)) return;
      const type = edit.type;
      if (type !== "weeklies" && type !== "endgame") return;
      const game = getGame(edit.gameId);
      if (!game) return;
      const taskList = type === "weeklies" ? game.weeklies : game.endgame;
      const task = (taskList || []).find((t) => (t.id || t.label) === edit.taskId);
      if (!task) return;
      const key = edit.gameId + "." + edit.taskId;
      const bounds = getCycleBoundsForTaskType(type, task, new Date(edit.cycleStart + "T12:00:00"), game);
      if (!bounds) return;
      const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
      if (!dates.length || dates[0] !== edit.cycleStart) return;
      if (edit.newDateStr < dates[0] || edit.newDateStr > dates[dates.length - 1]) return;

      const hourRaw = Number(edit.hour);
      const minuteRaw = Number(edit.minute);
      const safeHour = Number.isFinite(hourRaw) ? Math.max(0, Math.min(23, hourRaw)) : 12;
      const safeMinute = Number.isFinite(minuteRaw) ? Math.max(0, Math.min(59, minuteRaw)) : 0;

      dates.forEach((ds) => {
        const day = state.completionByDate[ds];
        if (!day || !Array.isArray(day[type])) return;
        day[type] = day[type].filter((k) => k !== key);
        if (
          !(day.dailies && day.dailies.length) &&
          !(day.weeklies && day.weeklies.length) &&
          !(day.endgame && day.endgame.length)
        ) {
          delete state.completionByDate[ds];
        }
      });

      state.completionTimestamps = (state.completionTimestamps || []).filter((t) => {
        if (!t || t.taskType !== type || t.gameId !== edit.gameId || t.taskId !== edit.taskId) return true;
        if (!isValidDateStr(t.dateStr)) return true;
        return dates.indexOf(t.dateStr) < 0;
      });
      state.completionTimestamps.push({
        taskType: type,
        gameId: edit.gameId,
        taskId: edit.taskId,
        dateStr: edit.newDateStr,
        hour: safeHour,
        minute: safeMinute,
      });

      const fillDates =
        typeof getRemainingDatesInPeriod === "function"
          ? getRemainingDatesInPeriod(type, key, edit.newDateStr)
          : [edit.newDateStr];
      (fillDates || []).forEach((ds) => {
        if (!isValidDateStr(ds)) return;
        if (!state.completionByDate[ds]) state.completionByDate[ds] = { dailies: [], weeklies: [], endgame: [] };
        if (!state.completionByDate[ds][type].includes(key)) state.completionByDate[ds][type].push(key);
      });
      updated++;
    });

    if (updated) {
      bumpDataVersion();
      if (!o.skipSave) save(o.saveOptions || { immediate: true });
      if (!o.skipRender) renderActiveTab();
    }
    const after = typeof scanDataConflicts === "function" ? scanDataConflicts() : null;
    return { ok: true, updated, after };
  }

  /**
   * Queue for Debug → Fix times & dates.
   * Includes before-unlock, calendar-before-timestamp, duplicate-timestamps, timestamp-without-calendar.
   */
  function listTimeDateFixQueue() {
    const scan = scanDataConflicts();
    const kinds = new Set([
      "before-unlock",
      "calendar-before-timestamp",
      "duplicate-timestamps",
      "timestamp-without-calendar",
    ]);
    const rows = (scan.conflicts || [])
      .filter((c) => c && kinds.has(c.kind))
      .map((c) => {
        const suggestedDate =
          c.suggestedDateStr ||
          (c.kind === "before-unlock" ? c.unlockDate : null) ||
          c.dateStr ||
          c.cycleStart;
        const stamps = Array.isArray(c.stamps) ? c.stamps : null;
        let uniqueStamps = stamps;
        if (stamps && stamps.length) {
          const seen = new Set();
          uniqueStamps = [];
          stamps.forEach((s) => {
            const key =
              String(s.dateStr || "") +
              "|" +
              String(Number(s.hour) || 0) +
              "|" +
              String(Number(s.minute) || 0);
            if (seen.has(key)) return;
            seen.add(key);
            uniqueStamps.push(s);
          });
        }
        return {
          kind: c.kind,
          severity: c.severity,
          game: c.game,
          gameId: c.gameId,
          task: c.task,
          taskId: c.taskId,
          type: c.type,
          key: c.key || (c.gameId && c.taskId ? c.gameId + "." + c.taskId : null),
          cycleStart: c.cycleStart,
          message: c.message,
          dateStr: c.dateStr,
          hour: c.hour,
          minute: c.minute,
          unlockDate: c.unlockDate,
          unlockHour: c.unlockHour,
          unlockMinute: c.unlockMinute,
          calEarliest: c.calEarliest,
          stamps: uniqueStamps,
          stampCount: stamps ? stamps.length : 0,
          suggestedDateStr: suggestedDate,
          suggestedHour:
            c.suggestedHour != null
              ? c.suggestedHour
              : c.unlockHour != null
                ? c.unlockHour
                : c.hour != null
                  ? c.hour
                  : 12,
          suggestedMinute:
            c.suggestedMinute != null
              ? c.suggestedMinute
              : c.unlockMinute != null
                ? c.unlockMinute
                : c.minute != null
                  ? c.minute
                  : 0,
        };
      });
    // One row per cycle (prefer duplicate-timestamps over calendar-before for same cycle).
    const rank = { "duplicate-timestamps": 0, "before-unlock": 1, "calendar-before-timestamp": 2, "timestamp-without-calendar": 3 };
    const best = new Map();
    rows.forEach((row) => {
      const k = [row.type, row.gameId, row.taskId, row.cycleStart].join("|");
      const prev = best.get(k);
      if (!prev || (rank[row.kind] ?? 9) < (rank[prev.kind] ?? 9)) best.set(k, row);
    });
    return [...best.values()];
  }

  function getOwnedCycleDatesForTask(type, game, task, cycleStart) {
    if (!game || !task || !isValidDateStr(cycleStart)) return [];
    const bounds = getCycleBoundsForTaskType(type, task, new Date(cycleStart + "T12:00:00"), game);
    if (!bounds) return [];
    const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
    if (!dates.length || dates[0] !== cycleStart) return [];
    return dates;
  }

  /** Same cycle membership as scanDataConflicts (noon on the stamp dateStr). */
  function stampBelongsToScanCycle(type, task, game, stamp, cycleStart) {
    if (!stamp || !task || !game || !isValidDateStr(stamp.dateStr) || !isValidDateStr(cycleStart)) return false;
    const bounds = getCycleBoundsForTaskType(type, task, new Date(stamp.dateStr + "T12:00:00"), game);
    if (!bounds) return false;
    const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
    return !!(dates.length && dates[0] === cycleStart);
  }

  function removeStampsForTaskScanCycle(type, gameId, taskId, cycleStart) {
    const game = getGame(gameId);
    if (!game) return [];
    const list = type === "weeklies" ? game.weeklies : game.endgame;
    const task = (list || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return [];
    const removedDates = [];
    state.completionTimestamps = (state.completionTimestamps || []).filter((t) => {
      if (!t || t.taskType !== type || t.gameId !== gameId || t.taskId !== taskId) return true;
      if (!stampBelongsToScanCycle(type, task, game, t, cycleStart)) return true;
      if (isValidDateStr(t.dateStr)) removedDates.push(t.dateStr);
      return false;
    });
    return removedDates;
  }

  function clearTaskCycleCalendarMarks(type, gameId, taskId, cycleStart, extraDateStrs) {
    const game = getGame(gameId);
    if (!game) return false;
    const list = type === "weeklies" ? game.weeklies : game.endgame;
    const task = (list || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return false;
    const key = gameId + "." + taskId;
    const markDays = new Set(getOwnedCycleDatesForTask(type, game, task, cycleStart));
    (extraDateStrs || []).forEach((ds) => {
      if (isValidDateStr(ds)) markDays.add(ds);
    });
    markDays.forEach((ds) => {
      const day = state.completionByDate[ds];
      if (!day || !Array.isArray(day[type])) return;
      day[type] = day[type].filter((k) => k !== key);
      if (
        !(day.dailies && day.dailies.length) &&
        !(day.weeklies && day.weeklies.length) &&
        !(day.endgame && day.endgame.length)
      ) {
        delete state.completionByDate[ds];
      }
    });
    return markDays.size > 0;
  }

  function clearTaskCycleMarksAndStamps(type, gameId, taskId, cycleStart) {
    const removedDates = removeStampsForTaskScanCycle(type, gameId, taskId, cycleStart);
    clearTaskCycleCalendarMarks(type, gameId, taskId, cycleStart, removedDates);
    return true;
  }

  /**
   * Apply Fix times & dates queue.
   * edits: [{ kind, type, gameId, taskId, cycleStart, action: 'set'|'drop', newDateStr?, hour?, minute?, keep? }]
   */
  function applyDebugTimeDateFixes(edits, opts) {
    const o = opts || {};
    const list = Array.isArray(edits) ? edits : [];
    let updated = 0;
    let dropped = 0;
    list.forEach((edit) => {
      if (!edit || !edit.type || !edit.gameId || !edit.taskId || !isValidDateStr(edit.cycleStart)) return;
      const action = edit.action === "drop" ? "drop" : "set";
      if (action === "drop") {
        const removedDates = removeStampsForTaskScanCycle(edit.type, edit.gameId, edit.taskId, edit.cycleStart);
        clearTaskCycleCalendarMarks(edit.type, edit.gameId, edit.taskId, edit.cycleStart, removedDates);
        dropped++;
        return;
      }

      // Duplicate: delete every stamp scan puts in this cycle, then keep exactly one.
      if (edit.kind === "duplicate-timestamps") {
        const keepDate =
          edit.keep && isValidDateStr(edit.keep.dateStr)
            ? edit.keep.dateStr
            : isValidDateStr(edit.newDateStr)
              ? edit.newDateStr
              : null;
        if (!keepDate) return;
        const keepHour = edit.keep
          ? Number(edit.keep.hour) || 0
          : Number.isFinite(Number(edit.hour))
            ? Number(edit.hour)
            : 12;
        const keepMinute = edit.keep
          ? Number(edit.keep.minute) || 0
          : Number.isFinite(Number(edit.minute))
            ? Number(edit.minute)
            : 0;
        const removedDates = removeStampsForTaskScanCycle(edit.type, edit.gameId, edit.taskId, edit.cycleStart);
        clearTaskCycleCalendarMarks(edit.type, edit.gameId, edit.taskId, edit.cycleStart, removedDates);
        const key = edit.gameId + "." + edit.taskId;
        state.completionTimestamps.push({
          taskType: edit.type,
          gameId: edit.gameId,
          taskId: edit.taskId,
          dateStr: keepDate,
          hour: keepHour,
          minute: keepMinute,
        });
        const fillDates =
          typeof getRemainingDatesInPeriod === "function"
            ? getRemainingDatesInPeriod(edit.type, key, keepDate)
            : [keepDate];
        (fillDates || []).forEach((ds) => {
          if (!isValidDateStr(ds)) return;
          if (!state.completionByDate[ds]) state.completionByDate[ds] = { dailies: [], weeklies: [], endgame: [] };
          if (!state.completionByDate[ds][edit.type].includes(key)) state.completionByDate[ds][edit.type].push(key);
        });
        updated++;
        return;
      }

      if (!isValidDateStr(edit.newDateStr)) return;
      const removedDates = removeStampsForTaskScanCycle(edit.type, edit.gameId, edit.taskId, edit.cycleStart);
      clearTaskCycleCalendarMarks(edit.type, edit.gameId, edit.taskId, edit.cycleStart, removedDates);
      const hourRaw = Number(edit.hour);
      const minuteRaw = Number(edit.minute);
      const safeHour = Number.isFinite(hourRaw) ? Math.max(0, Math.min(23, hourRaw)) : 12;
      const safeMinute = Number.isFinite(minuteRaw) ? Math.max(0, Math.min(59, minuteRaw)) : 0;
      const key = edit.gameId + "." + edit.taskId;
      state.completionTimestamps.push({
        taskType: edit.type,
        gameId: edit.gameId,
        taskId: edit.taskId,
        dateStr: edit.newDateStr,
        hour: safeHour,
        minute: safeMinute,
      });
      const fillDates =
        typeof getRemainingDatesInPeriod === "function"
          ? getRemainingDatesInPeriod(edit.type, key, edit.newDateStr)
          : [edit.newDateStr];
      (fillDates || []).forEach((ds) => {
        if (!isValidDateStr(ds)) return;
        if (!state.completionByDate[ds]) state.completionByDate[ds] = { dailies: [], weeklies: [], endgame: [] };
        if (!state.completionByDate[ds][edit.type].includes(key)) state.completionByDate[ds][edit.type].push(key);
      });
      updated++;
    });

    if (updated || dropped) {
      syncAllTalliesFromCalendar({ skipSave: true, skipRender: true });
      bumpDataVersion();
      if (!o.skipSave) save(o.saveOptions || { immediate: true });
      if (!o.skipRender) renderActiveTab();
    }
    const after = typeof scanDataConflicts === "function" ? scanDataConflicts() : null;
    return { ok: true, updated, dropped, after };
  }

  /**
   * Opinionated integrity repair (Settings → Debug / Data).
   * mode: "safe" | "prefer-timestamps" | "tallies-only"
   */
  function runIntegrityRepair(mode, opts) {
    const o = opts || {};
    const m = mode || "safe";
    const before = scanDataConflicts();
    const actions = [];

    if (m === "tallies-only") {
      syncAllTalliesFromCalendar({ skipSave: true, skipRender: true });
      actions.push("Rebuilt all tallies from calendar");
    } else {
      migrateMissingTaskDateStarted();
      migrateTaskEarliestCompleteFields();
      actions.push("Checked dateStarted / unlock fields");

      const removed = dedupeCompletionTimestamps();
      if (removed) actions.push("Removed " + removed + " duplicate timestamp(s)");

      if (m === "prefer-timestamps") {
        repairCompletionTimingFromTimestamps(["weeklies", "endgame"]);
        actions.push("Rebuilt weeklies + endgame completion days from timestamps (honoring unlock)");
      } else {
        repairCompletionTimingFromTimestamps(["endgame"]);
        actions.push("Rebuilt endgame completion days from timestamps (honoring unlock)");
      }

      // Add missing calendar marks for timestamp-only weeklies/endgame cycles
      let filled = 0;
      (state.games || []).forEach((game) => {
        [["weeklies", game.weeklies], ["endgame", game.endgame]].forEach(([type, list]) => {
          (list || []).forEach((task) => {
            const taskId = task.id || task.label;
            const key = game.id + "." + taskId;
            (state.completionTimestamps || []).forEach((t) => {
              if (t.taskType !== type || t.gameId !== game.id || t.taskId !== taskId || !isValidDateStr(t.dateStr)) return;
              const unlockDate = getTaskUnlockDateStr(type, task, game, t.dateStr);
              let completion = t.dateStr < unlockDate ? unlockDate : t.dateStr;
              const dates = getRemainingDatesInPeriod(type, key, completion);
              dates.forEach((ds) => {
                if (!state.completionByDate[ds]) state.completionByDate[ds] = { dailies: [], weeklies: [], endgame: [] };
                if (!state.completionByDate[ds][type].includes(key)) {
                  state.completionByDate[ds][type].push(key);
                  filled++;
                }
              });
            });
          });
        });
      });
      if (filled) actions.push("Filled " + filled + " calendar day(s) from timestamps");

      ensureCycleCompletionMarksFillRemainingDays();
      actions.push("Filled remaining days in completed cycles (prefer timestamp finish day)");

      syncAllTalliesFromCalendar({ skipSave: true, skipRender: true });
      actions.push("Synced tallies from calendar");
    }

    bumpDataVersion();
    if (!o.skipSave) save(o.saveOptions || { immediate: true });
    if (!o.skipRender) renderActiveTab();

    const after = scanDataConflicts();
    return { before, after, actions, mode: m };
  }

  function addDaysToDateStr(dateStr, n) {
    const d = new Date(dateStr + "T12:00:00");
    d.setDate(d.getDate() + n);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  /**
   * Rebuild completion days from timestamps when calendar was marked too early
   * (e.g. day-1 fill pollution). Honors unlock window. types: ["weeklies"], ["endgame"], or both.
   */
  function repairCompletionTimingFromTimestamps(types) {
    const typeList = Array.isArray(types) && types.length ? types : ["endgame"];
    let changed = false;
    (state.games || []).forEach((game) => {
      typeList.forEach((type) => {
        const list = type === "weeklies" ? game.weeklies : game.endgame;
        (list || []).forEach((task) => {
          const taskId = task.id || task.label;
          const key = game.id + "." + taskId;
          const cycleStarts = new Set();

          Object.keys(state.completionByDate || {}).forEach((ds) => {
            if (!((state.completionByDate[ds][type] || []).includes(key))) return;
            const bounds = getCycleBoundsForTaskType(type, task, new Date(ds + "T12:00:00"), game);
            if (!bounds) return;
            const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
            if (dates.length) cycleStarts.add(dates[0]);
          });
          (state.completionTimestamps || []).forEach((t) => {
            if (t.taskType !== type || t.gameId !== game.id || t.taskId !== taskId || !isValidDateStr(t.dateStr)) return;
            const bounds = getCycleBoundsForTaskType(type, task, new Date(t.dateStr + "T12:00:00"), game);
            if (!bounds) return;
            const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
            if (dates.length) cycleStarts.add(dates[0]);
          });

          [...cycleStarts].sort().forEach((startStr) => {
            const bounds = getCycleBoundsForTaskType(type, task, new Date(startStr + "T12:00:00"), game);
            if (!bounds) return;
            const cycleDates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
            if (cycleDates.length === 0) return;
            const cycleEndStr = cycleDates[cycleDates.length - 1];
            const minCompletion = addDaysToDateStr(cycleDates[0], getTaskEarliestCompleteDays(task));

            const tsInCycle = (state.completionTimestamps || [])
              .filter((t) => {
                if (
                  t.taskType !== type ||
                  t.gameId !== game.id ||
                  t.taskId !== taskId ||
                  !isValidDateStr(t.dateStr)
                ) {
                  return false;
                }
                // Match scan membership (not owned-date string range) so evening resets /
                // short timeLimit windows still see stamps on the shared next-cycle calendar day.
                const stampHour = Number.isFinite(Number(t.hour)) ? Number(t.hour) : 12;
                const stampMinute = Number.isFinite(Number(t.minute)) ? Number(t.minute) : 0;
                const y = parseInt(t.dateStr.slice(0, 4), 10);
                const mo = parseInt(t.dateStr.slice(5, 7), 10) - 1;
                const d = parseInt(t.dateStr.slice(8, 10), 10);
                const baseTz = getResetTimezoneForGame(game);
                const tz = getTimezoneForTaskDst(task, baseTz);
                const offsetRef = getOffsetRefDateForTask(task, tz);
                const moment = createDateInTimezone(y, mo, d, stampHour, stampMinute, tz, offsetRef);
                const stampBounds = getCycleBoundsForTaskType(type, task, moment, game);
                if (!stampBounds) return false;
                const stampDates = getCalendarDatesInCycleRange(
                  stampBounds.cycleStart,
                  stampBounds.cycleEnd,
                  stampBounds.nextCycleStart
                );
                return stampDates[0] === startStr;
              })
              .sort((a, b) => completionStampSortKey(a).localeCompare(completionStampSortKey(b)));

            let calEarliest = null;
            for (const ds of cycleDates) {
              if ((state.completionByDate[ds] && state.completionByDate[ds][type] || []).includes(key)) {
                calEarliest = ds;
                break;
              }
            }

            let completion = tsInCycle.length ? tsInCycle[0].dateStr : calEarliest;
            if (!completion) return;
            if (completion < minCompletion) completion = minCompletion;
            // Keep stamp dates that fall on the next-cycle calendar day (limbo before reset hour).
            // Only clamp calendar fill to owned cycle days below — do not rewrite the stamp earlier.
            const stampCompletion = completion;
            const calCompletion = completion > cycleEndStr ? cycleEndStr : completion;
            if (calCompletion < minCompletion) return;

            // Collapse timestamps in this cycle onto the corrected completion day.
            let keptOne = false;
            tsInCycle.forEach((t) => {
              if (!keptOne) {
                if (t.dateStr !== stampCompletion) {
                  t.dateStr = stampCompletion;
                  changed = true;
                }
                keptOne = true;
              } else {
                const idx = state.completionTimestamps.indexOf(t);
                if (idx >= 0) {
                  state.completionTimestamps.splice(idx, 1);
                  changed = true;
                }
              }
            });

            cycleDates.forEach((ds) => {
              const arr = state.completionByDate[ds] && state.completionByDate[ds][type];
              if (!arr) return;
              const idx = arr.indexOf(key);
              if (idx < 0) return;
              if (ds < calCompletion) {
                arr.splice(idx, 1);
                changed = true;
              }
            });
            getRemainingDatesInPeriod(type, key, calCompletion).forEach((ds) => {
              if (!state.completionByDate[ds]) state.completionByDate[ds] = { dailies: [], weeklies: [], endgame: [] };
              const arr = state.completionByDate[ds][type];
              if (!arr.includes(key)) {
                arr.push(key);
                changed = true;
              }
            });
          });
        });
      });
    });
    if (changed) {
      bumpDataVersion();
      save({ immediate: true });
    }
  }

  /** @deprecated name kept for callers/tests — endgame-only timing repair */
  function repairEndgameCompletionTiming() {
    repairCompletionTimingFromTimestamps(["endgame"]);
  }

  /**
   * Ensure weekly (and endgame) completions fill every calendar day from the first mark
   * through the end of that cycle. Safe to re-run; tallies stay 1 attempt per cycle.
   * Prefer a completion timestamp in the cycle over the earliest calendar mark
   * so day-1 pollution does not keep spreading (weeklies and endgame).
   */
  function ensureCycleCompletionMarksFillRemainingDays() {
    let changed = false;
    const fillType = (game, type, task) => {
      const key = game.id + "." + (task.id || task.label);
      const taskId = task.id || task.label;
      const history = getTaskTallyHistory(game, type, key);
      history.forEach((period) => {
        if (!period.completed) return;
        const dates = getCalendarDatesInCycleRange(period.periodStart, period.periodEnd, period.nextCycleStart);
        if (dates.length === 0) return;
        const cycleEndStr = dates[dates.length - 1];
        let firstMarked = null;
        const tsDates = (state.completionTimestamps || [])
          .filter(
            (t) =>
              t.taskType === type &&
              t.gameId === game.id &&
              t.taskId === taskId &&
              isValidDateStr(t.dateStr) &&
              t.dateStr >= dates[0] &&
              t.dateStr <= cycleEndStr
          )
          .map((t) => t.dateStr)
          .sort();
        if (tsDates.length) firstMarked = tsDates[0];
        if (!firstMarked) {
          for (const ds of dates) {
            const dayData = state.completionByDate[ds] || {};
            if ((dayData[type] || []).includes(key)) {
              firstMarked = ds;
              break;
            }
          }
        }
        if (!firstMarked) return;
        const minCompletion = addDaysToDateStr(dates[0], getTaskEarliestCompleteDays(task));
        if (firstMarked < minCompletion) firstMarked = minCompletion;
        dates.forEach((ds) => {
          if (ds >= firstMarked) return;
          const arr = state.completionByDate[ds] && state.completionByDate[ds][type];
          if (!arr) return;
          const idx = arr.indexOf(key);
          if (idx >= 0) {
            arr.splice(idx, 1);
            changed = true;
          }
        });
        getRemainingDatesInPeriod(type, key, firstMarked).forEach((ds) => {
          if (!state.completionByDate[ds]) state.completionByDate[ds] = { dailies: [], weeklies: [], endgame: [] };
          const arr = state.completionByDate[ds][type];
          if (!arr.includes(key)) {
            arr.push(key);
            changed = true;
          }
        });
      });
    };
    (state.games || []).forEach((game) => {
      (game.weeklies || []).forEach((task) => fillType(game, "weeklies", task));
      (game.endgame || []).forEach((task) => fillType(game, "endgame", task));
    });
    if (changed) {
      bumpDataVersion();
      save({ immediate: true });
    }
  }

  function freezeTalliesOnTimezoneChange() {
    const now = getSimulatedNow();
    const todayStr = getDateStr();
    getAllGames().forEach((game) => {
      if (game.dailies) {
        state.lastProcessedResets.dailies[game.id] = todayStr;
      }
      (game.weeklies || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const remainingMs = getWeeklyTimeRemainingMs(task, now, game);
        const { intervalMs, timeLimitMs } = getCycleParams(task);
        const cycleEndMs = now.getTime() + remainingMs;
        const nextCycleStartMs = cycleEndMs - timeLimitMs + intervalMs;
        if (!state.lastProcessedResets.weeklies) state.lastProcessedResets.weeklies = {};
        state.lastProcessedResets.weeklies[key] = nextCycleStartMs;
      });
      (game.endgame || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const cycleStart = getCycleStartForDate(task, todayStr, game);
        const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
        const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
        const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
        if (!state.lastProcessedResets.endgame) state.lastProcessedResets.endgame = {};
        state.lastProcessedResets.endgame[key] = cycleStart.getTime() + timeLimitMs;
      });
    });
  }

  /**
   * Remove leftover fill marks on the shared reset calendar day when the new cycle
   * is not actually complete (weeklies and endgame with adjacent full periods).
   */
  function cleanupCycleBoundaryBleedMarks() {
    let changed = false;
    const now = getSimulatedNow();
    getAllGames().forEach((game) => {
      ["weeklies", "endgame"].forEach((type) => {
        (game[type] || []).forEach((task) => {
          const key = game.id + "." + (task.id || task.label);
          const bounds = getCycleBoundsForTaskType(type, task, now, game);
          if (!bounds || !(bounds.nextCycleStart instanceof Date)) return;
          if (bounds.nextCycleStart.getTime() !== bounds.cycleEnd.getTime()) return;
          if (findCompletionDateInBounds(key, type, bounds) != null) return;
          const startDateStr = getDateStr(bounds.cycleStart);
          const dayData = state.completionByDate[startDateStr];
          if (!dayData || !dayData[type]) return;
          const idx = dayData[type].indexOf(key);
          if (idx < 0) return;
          dayData[type].splice(idx, 1);
          changed = true;
        });
      });
    });
    return changed;
  }

  function processResets() {
    const now = getSimulatedNow();
    const todayStr = getDateStr();
    let didChange = cleanupCycleBoundaryBleedMarks();

    getAllGames().forEach((game) => {
      if (game.dailies) {
        const gameId = game.id;
        const hour = getResetHour(game, "resetHour", getDefaultResetHour(), game, now);
        const minute = Number.isFinite(game.resetMinute) ? game.resetMinute : 0;
        let lastStr = state.lastProcessedResets.dailies[gameId];
        if (!lastStr) {
          let earliestStr = null;
          Object.keys(state.completionByDate || {}).forEach((dateStr) => {
            const dayData = state.completionByDate[dateStr] || { dailies: [] };
            if ((dayData.dailies || []).includes(gameId) && (!earliestStr || dateStr < earliestStr)) earliestStr = dateStr;
          });
          lastStr = earliestStr ? (() => { const d = new Date(earliestStr + "T12:00:00"); d.setDate(d.getDate() - 1); return getDateStr(d); })() : todayStr;
        }
        let d = new Date(lastStr + "T12:00:00");
        d.setDate(d.getDate() + 1);
        let lastProcessed = lastStr;
        while (getDateStr(d) <= todayStr) {
          const dateStr = getDateStr(d);
          const periodStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0);
          const periodEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hour, minute, 0, 0);
          if (now >= periodStart) {
            didChange = true;
            state.dailiesAttempted[gameId] = getAttemptedAmount(state.dailiesAttempted, gameId) + 1;
            if (now >= periodEnd) {
              const dayData = state.completionByDate[dateStr] || { dailies: [] };
              if ((dayData.dailies || []).includes(gameId)) {
                state.dailiesCompleted[gameId] = getCompletedAmount(state.dailiesCompleted, gameId) + 1;
              }
            }
            lastProcessed = dateStr;
          }
          d.setDate(d.getDate() + 1);
        }
        state.lastProcessedResets.dailies[gameId] = lastProcessed;
      }

      (game.weeklies || []).forEach((task) => {
        // Manual Reset/Start tasks never auto-advance cycles.
        if (isManualResetTask(task)) return;
        const key = game.id + "." + (task.id || task.label);
        const { intervalMs, timeLimitMs } = getCycleParams(task);
        let lastMs = state.lastProcessedResets.weeklies[key];
        let cycleStartMs;
        if (!lastMs || typeof lastMs !== "number") {
          let earliestStr = null;
          Object.keys(state.completionByDate || {}).forEach((dateStr) => {
            const dayData = state.completionByDate[dateStr] || { weeklies: [] };
            if ((dayData.weeklies || []).includes(key) && (!earliestStr || dateStr < earliestStr)) earliestStr = dateStr;
          });
          if (earliestStr) {
            cycleStartMs = getCycleStartForDate(task, earliestStr, game).getTime();
          } else {
            const cycleEnd = getCycleStartForDate(task, todayStr, game).getTime() + timeLimitMs;
            cycleStartMs = cycleEnd - timeLimitMs + intervalMs;
          }
        } else {
          cycleStartMs = lastMs;
        }
        const nowMs = now.getTime();
        const lastBounds = getLastCycleBounds(task, game);
        while (cycleStartMs <= nowMs) {
          if (lastBounds && cycleStartMs > lastBounds.startMs) break;
          didChange = true;
          state.weekliesAttempted[key] = getAttemptedAmount(state.weekliesAttempted, key) + 1;
          const cycleStart = new Date(cycleStartMs);
          const cycleEnd = getCycleEndDate(cycleStart, task, game);
          if (cycleEnd.getTime() <= nowMs) {
            const nextCycleStart = new Date(cycleStartMs + intervalMs);
            if (isPeriodCompletedFromCalendar(key, "weeklies", cycleStart, cycleEnd, nextCycleStart)) {
              state.weekliesCompleted[key] = getCompletedAmount(state.weekliesCompleted, key) + 1;
            }
          }
          cycleStartMs += intervalMs;
        }
        state.lastProcessedResets.weeklies[key] = cycleStartMs;
      });

      (game.endgame || []).forEach((task) => {
        // Manual Reset/Start tasks never auto-advance cycles.
        if (isManualResetTask(task)) return;
        const key = game.id + "." + (task.id || task.label);
        const { intervalMs, timeLimitMs } = getCycleParams(task);
        let lastMs = state.lastProcessedResets.endgame[key];
        let cycleStartMs;
        if (!lastMs) {
          let earliestStr = null;
          Object.keys(state.completionByDate || {}).forEach((dateStr) => {
            const dayData = state.completionByDate[dateStr] || { endgame: [] };
            if ((dayData.endgame || []).includes(key) && (!earliestStr || dateStr < earliestStr)) earliestStr = dateStr;
          });
          if (earliestStr) {
            cycleStartMs = getCycleStartForDate(task, earliestStr, game).getTime();
          } else {
            const cycleEnd = getCycleStartForDate(task, todayStr, game).getTime() + timeLimitMs;
            cycleStartMs = cycleEnd - timeLimitMs + intervalMs;
          }
        } else {
          cycleStartMs = lastMs;
        }
        const nowMs = now.getTime();
        const lastBounds = getLastCycleBounds(task, game);
        while (cycleStartMs <= nowMs) {
          if (lastBounds && cycleStartMs > lastBounds.startMs) break;
          didChange = true;
          const attemptIdx = getAttemptedAmount(state.endgameAttempted, key);
          state.endgameAttempted[key] = attemptIdx + 1;
          snapshotEndgamePotentialAt(game.id, task.id || task.label, attemptIdx, getEndgamePotential(task));
          const cycleStart = new Date(cycleStartMs);
          const cycleEnd = getCycleEndDate(cycleStart, task, game);
          if (cycleEnd.getTime() <= nowMs) {
            const nextCycleStart = new Date(cycleStartMs + intervalMs);
            if (isPeriodCompletedFromCalendar(key, "endgame", cycleStart, cycleEnd, nextCycleStart)) {
              state.endgameCompleted[key] = getCompletedAmount(state.endgameCompleted, key) + 1;
            }
          }
          cycleStartMs += intervalMs;
        }
        ensureEndgameEarnedArrayLength(game.id, task.id || task.label, getCompletedAmount(state.endgameCompleted, key));
        ensureEndgamePotentialArrayLength(game.id, task.id || task.label, getAttemptedAmount(state.endgameAttempted, key));
        state.lastProcessedResets.endgame[key] = cycleStartMs;
      });
    });

    if (didChange) {
      bumpDataVersion();
      save();
    }
    // Once per primary-server game day, refresh slim localStorage backup (no images).
    if (storageBackend === "idb") maybeWriteDailySlimBackup(false);
    return didChange;
  }

  function isCycleEndEnabled(task) {
    return !!(task && task.cycleEndEnabled && isValidDateStr(task.cycleEndDate));
  }

  /** Final cycle bounds when stop-repeating is enabled (cycle containing cycleEndDate). */
  function getLastCycleBounds(task, game) {
    if (!isCycleEndEnabled(task)) return null;
    const cycleStart = getCycleStartForDate(task, task.cycleEndDate, game);
    const cycleEnd = getCycleEndDate(cycleStart, task, game);
    const cycleEndMs = cycleEnd.getTime();
    const cycleDays = Math.max(1, Math.ceil((cycleEndMs - cycleStart.getTime()) / (24 * 60 * 60 * 1000)));
    const lastDay = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate() + cycleDays - 1);
    return {
      startMs: cycleStart.getTime(),
      endMs: cycleEndMs,
      startStr: getDateStr(cycleStart),
      endStr: getDateStr(lastDay),
    };
  }

  /** True when the final cycle has fully ended (task no longer active). */
  function isTaskCycleEnded(task, now, game) {
    if (!isCycleEndEnabled(task)) return false;
    const bounds = getLastCycleBounds(task, game);
    if (!bounds) return false;
    return (now || getSimulatedNow()).getTime() >= bounds.endMs;
  }

  /** True when cycle begin and end fall on different calendar days (multi-day window). */
  function cycleSpansMultipleCalendarDays(bounds) {
    if (!bounds) return false;
    const startStr = getDateStr(bounds.cycleStart);
    const lastInstant = new Date(Math.max(bounds.cycleStart.getTime(), bounds.cycleEnd.getTime() - 1));
    return startStr !== getDateStr(lastInstant);
  }

  /** Live membership: moment must fall inside [cycleStart, cycleEnd). */
  function isWeeklyAvailableOnDate(task, date, game) {
    const d = new Date(date);
    const bounds = getWeeklyCycleBoundsForMoment(task, d, game);
    if (!bounds) return false;
    const dateMs = d.getTime();
    if (dateMs < bounds.cycleStart.getTime() || dateMs >= bounds.cycleEnd.getTime()) return false;
    const lastBounds = getLastCycleBounds(task, game);
    if (lastBounds && bounds.cycleStart.getTime() > lastBounds.startMs) return false;
    return true;
  }

  function isEndgameAvailableOnDate(task, date, game) {
    const d = new Date(date);
    const bounds = getEndgameCycleBoundsForMoment(task, d, game);
    if (!bounds) return false;
    const dateMs = d.getTime();
    if (dateMs < bounds.cycleStart.getTime() || dateMs >= bounds.cycleEnd.getTime()) return false;
    const lastBounds = getLastCycleBounds(task, game);
    if (lastBounds && bounds.cycleStart.getTime() > lastBounds.startMs) return false;
    return true;
  }

  /**
   * Home checklist membership for weeklies/endgame.
   * Manual-reset tasks stay listed after the window ends (and while awaiting restart)
   * so incomplete cycles remain actionable until the next Start. Retired (Stop Cycle)
   * tasks still hide. Normal tasks keep strict in-window membership.
   */
  function isWeeklyOnHomeChecklist(task, now, game) {
    if (!task) return false;
    if (isTaskCycleEnded(task, now, game)) return false;
    if (isManualResetTask(task)) return true;
    return isWeeklyAvailableOnDate(task, now, game);
  }

  function isEndgameOnHomeChecklist(task, now, game) {
    if (!task) return false;
    if (isTaskCycleEnded(task, now, game)) return false;
    if (isManualResetTask(task)) return true;
    return isEndgameAvailableOnDate(task, now, game);
  }

  /**
   * Calendar-day availability (day modal / attendance history).
   * Multi-day cycles: list if dateStr is an owned calendar day (so evening-start tasks
   * appear on day one even when noon is still before cycle begin).
   * Same-day windows: keep strict clock membership at noon.
   */
  function isWeeklyAvailableOnCalendarDate(task, dateStr, game) {
    if (!isValidDateStr(dateStr)) return false;
    const eod = new Date(dateStr + "T23:59:59");
    const bounds = getWeeklyCycleBoundsForMoment(task, eod, game);
    if (!bounds) return false;
    const lastBounds = getLastCycleBounds(task, game);
    if (lastBounds && bounds.cycleStart.getTime() > lastBounds.startMs) return false;
    if (cycleSpansMultipleCalendarDays(bounds)) {
      return getCalendarDatesForBounds(bounds).includes(dateStr);
    }
    return isWeeklyAvailableOnDate(task, new Date(dateStr + "T12:00:00"), game);
  }

  function isEndgameAvailableOnCalendarDate(task, dateStr, game) {
    if (!isValidDateStr(dateStr)) return false;
    const eod = new Date(dateStr + "T23:59:59");
    const bounds = getEndgameCycleBoundsForMoment(task, eod, game);
    if (!bounds) return false;
    const lastBounds = getLastCycleBounds(task, game);
    if (lastBounds && bounds.cycleStart.getTime() > lastBounds.startMs) return false;
    if (cycleSpansMultipleCalendarDays(bounds)) {
      return getCalendarDatesForBounds(bounds).includes(dateStr);
    }
    return isEndgameAvailableOnDate(task, new Date(dateStr + "T12:00:00"), game);
  }

  function labelAfterDash(str) {
    if (!str || typeof str !== "string") return str || "";
    const i = str.indexOf(" — ");
    return i >= 0 ? str.slice(i + 3).trim() : str;
  }

  function getTasksAvailableOnDate(dateStr) {
    const ds = isValidDateStr(dateStr) ? dateStr : getDateStr();
    const result = { dailies: [], weeklies: [], endgame: [] };
    getAllGames().forEach((game) => {
      if (game.dailies) result.dailies.push({ key: game.id, label: game.name || game.id });
      (game.weeklies || []).forEach((task) => {
        if (isWeeklyAvailableOnCalendarDate(task, ds, game)) {
          const key = game.id + "." + (task.id || task.label);
          result.weeklies.push({ key, label: (game.name || game.id) + " — " + (task.label || "Weekly") });
        }
      });
      (game.endgame || []).forEach((task) => {
        if (isEndgameAvailableOnCalendarDate(task, ds, game)) {
          const key = game.id + "." + (task.id || task.label);
          result.endgame.push({ key, label: (game.name || game.id) + " — " + (task.label || "Endgame") });
        }
      });
    });
    return result;
  }

  /** Whether this weekly was completed on any day within its current cycle (week containing todayStr). */
  function isWeeklyCompletedInCurrentCycle(key, todayStr) {
    return getWeeklyCompletionDateInCurrentCycle(key, todayStr) != null;
  }

  /** Returns the dateStr where this weekly was completed in the current cycle, or null.
   * Uses actual current time so the cycle's "last day" correctly extends to reset (e.g. 4am) instead of midnight. */
  function getWeeklyCompletionDateInCurrentCycle(key, todayStr) {
    const dot = key.indexOf(".");
    if (dot <= 0) return null;
    const gameId = key.slice(0, dot);
    const taskId = key.slice(dot + 1);
    const game = getGame(gameId);
    const task = (game && game.weeklies || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return null;
    const bounds = getWeeklyCycleBoundsForMoment(task, getCycleMembershipMoment(task, game), game);
    return findCompletionDateInBounds(key, "weeklies", bounds);
  }

  /** Whether this endgame task was completed on any day within its current cycle.
   * Uses completionByDate only. endgameCompletionDates (edited in earnings modal) is for display
   * and does NOT affect this—editing prior completion dates cannot make the current cycle show as complete. */
  function isEndgameCompletedInCurrentCycle(key, todayStr) {
    return getEndgameCompletionDateInCurrentCycle(key, todayStr) != null;
  }

  /** Returns the dateStr where this endgame was completed in the current cycle, or null.
   * Uses completionByDate only; endgameCompletionDates is never consulted here.
   * Uses actual current time so the cycle's "last day" correctly extends to reset (e.g. 4am) instead of midnight. */
  function getEndgameCompletionDateInCurrentCycle(key, todayStr) {
    const dot = key.indexOf(".");
    if (dot <= 0) return null;
    const gameId = key.slice(0, dot);
    const taskId = key.slice(dot + 1);
    const game = getGame(gameId);
    const task = (game && game.endgame || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return null;
    const bounds = getEndgameCycleBoundsForMoment(task, getCycleMembershipMoment(task, game), game);
    return findCompletionDateInBounds(key, "endgame", bounds);
  }

  function toggleCalendarCompletion(dateStr, type, key, checked) {
    const result = checked
      ? applyTaskCompletion(type, key, { dateStr, save: false, render: false, processResets: false })
      : removeTaskCompletion(type, key, { dateStr, save: false, render: false, processResets: false });
    if (checked && result && !result.ok && result.reason) {
      alert(result.reason);
      return;
    }
    const todayStr = getDateStr();
    // Tallies already updated inside write path when date is today-cycle; for history edits of other days
    // the write path also updates tallies — keep today checkbox state in sync for dailies only via path.
    if (dateStr === todayStr && type === "dailies") {
      // no-op: apply/remove already set tallies
    }
    processResets();
    save();
    renderActiveTab();
  }

  function icalEscape(str) {
    return String(str || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  function toIcalDate(d) {
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    const h = pad2(d.getHours());
    const min = pad2(d.getMinutes());
    const s = pad2(d.getSeconds());
    return y + m + day + "T" + h + min + s;
  }

  /** Get week start (inclusive) for a date given task's weekStartDay and weekStartHour. Uses server tz when game has server. */
  function getWeekStartForDate(task, dateStr, game) {
    const d = isValidDateStr(dateStr) ? new Date(dateStr + "T12:00:00") : new Date();
    const tz = game ? getResetTimezoneForGame(game) : getRecordingTimezone();
    const parts = getDatePartsInTimezone(d, tz);
    const weekStartDay = Number.isFinite(task && task.weekStartDay) ? task.weekStartDay : 0;
    const hour = getResetHour(task, "weekStartHour", 4, game, d);
    const minute = Number.isFinite(task && task.weekStartMinute) ? task.weekStartMinute : 0;
    const resetMoment = createDateInTimezone(parts.year, parts.month, parts.day, hour, minute, tz);
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    const daysBack = (dayOfWeek - weekStartDay + 7) % 7;
    const weekStart = new Date(resetMoment.getTime() - daysBack * 24 * 60 * 60 * 1000);
    if (d.getTime() < weekStart.getTime()) weekStart.setTime(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    return weekStart;
  }

  /** Get cycle start for a cycle-based task (weekly, endgame) given a date. Uses dateStarted anchor. */
  function getCycleStartForDate(task, dateStr, game) {
    if (isManualResetTask(task)) {
      return getEndgameAnchorDate(task, game);
    }
    const d = isValidDateStr(dateStr) ? new Date(dateStr + "T12:00:00") : new Date();
    const anchor = getEndgameAnchorDate(task, game);
    const { intervalMs } = getCycleParams(task);
    const anchorMs = anchor.getTime();
    const dateMs = d.getTime();
    const k = Math.floor((dateMs - anchorMs) / intervalMs);
    return new Date(anchorMs + k * intervalMs);
  }

  /**
   * Earliest calendar completion date for a task (YYYY-MM-DD), or null if never completed.
   * This is when completed/attempted tally history starts counting (unless countFromDateStarted).
   */
  function getTaskFirstCalendarCompletionDate(game, type, key) {
    const matchKey = type === "dailies" ? (key || (game && game.id)) : key;
    if (!matchKey) return null;
    let earliestStr = null;
    Object.keys(state.completionByDate || {}).forEach((dateStr) => {
      const dayData = state.completionByDate[dateStr] || {};
      const arr = dayData[type] || [];
      if (arr.includes(matchKey) && (!earliestStr || dateStr < earliestStr)) earliestStr = dateStr;
    });
    return earliestStr;
  }

  /** Effective date tallies start from (first completion, or dateStarted when countFromDateStarted is on). */
  function getTaskTallyStartDate(game, type, key) {
    const firstComplete = getTaskFirstCalendarCompletionDate(game, type, key);
    if (type === "dailies" || !game) return firstComplete;
    const task = type === "weeklies"
      ? (game.weeklies || []).find((t) => (game.id + "." + (t.id || t.label)) === key)
      : (game.endgame || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
    if (task && task.countFromDateStarted && isValidDateStr(task.dateStarted)) {
      if (!firstComplete || task.dateStarted < firstComplete) return task.dateStarted;
    }
    return firstComplete;
  }

  /**
   * Get tally history for a task. Each period = 1 attempt; 1 complete if any mark in that period.
   * Returns array of { periodStart, periodEnd, completed }.
   * Weeklies/endgame start at the earliest calendar completion, or at dateStarted when
   * countFromDateStarted is enabled (cycles before tracking are excluded otherwise).
   * Toggling multiple times within a period = 1 complete (not multiple).
   */
  function getTaskTallyHistory(game, type, key) {
    const cacheKey = "history|" + type + "|" + key;
    const cached = tallyCacheGet(cacheKey);
    if (cached) return cached;
    const now = getSimulatedNow();
    const todayStr = getDateStr();
    const result = [];

    if (type === "dailies") {
      const gameId = key;
      let earliestStr = null;
      Object.keys(state.completionByDate || {}).forEach((dateStr) => {
        const dayData = state.completionByDate[dateStr] || { dailies: [] };
        if ((dayData.dailies || []).includes(gameId)) {
          if (!earliestStr || dateStr < earliestStr) earliestStr = dateStr;
        }
      });
      if (!earliestStr) return result;
      const hour = getResetHour(game, "resetHour", getDefaultResetHour());
      const minute = Number.isFinite(game.resetMinute) ? game.resetMinute : 0;
      let d = new Date(earliestStr + "T12:00:00");
      while (getDateStr(d) <= todayStr) {
        const dateStr = getDateStr(d);
        const dayData = state.completionByDate[dateStr] || { dailies: [] };
        const completed = (dayData.dailies || []).includes(gameId) ? 1 : 0;
        const periodStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0);
        const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
        result.push({ periodStart, periodEnd, completed });
        d.setDate(d.getDate() + 1);
      }
    } else if (type === "weeklies") {
      const task = (game.weeklies || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
      if (!task) return result;
      if (isManualResetTask(task)) {
        const closed = Array.isArray(task.manualClosedCycles) ? task.manualClosedCycles : [];
        closed.forEach((c) => {
          if (!c || !isValidDateStr(c.start) || !isValidDateStr(c.end)) return;
          const periodStart = getManualResetMomentOnDate(task, c.start, game);
          const periodEnd = getManualResetMomentOnDate(task, c.end, game);
          if (!periodStart || !periodEnd) return;
          result.push({
            periodStart,
            periodEnd,
            nextCycleStart: new Date(periodEnd.getTime()),
            completed: c.completed ? 1 : 0,
          });
        });
        const bounds = getManualResetCycleBounds(task, game, "weeklies");
        if (bounds) {
          const completed = isPeriodCompletedFromCalendar(key, "weeklies", bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart) ? 1 : 0;
          result.push({
            periodStart: bounds.cycleStart,
            periodEnd: bounds.cycleEnd,
            nextCycleStart: bounds.nextCycleStart,
            completed,
          });
        }
        tallyCacheSet(cacheKey, result);
        return result;
      }
      const { intervalMs, timeLimitMs } = getCycleParams(task);
      let earliestStr = null;
      Object.keys(state.completionByDate || {}).forEach((dateStr) => {
        const dayData = state.completionByDate[dateStr] || { weeklies: [] };
        if ((dayData.weeklies || []).includes(key) && (!earliestStr || dateStr < earliestStr)) earliestStr = dateStr;
      });
      if (task.countFromDateStarted && isValidDateStr(task.dateStarted)) {
        if (!earliestStr || task.dateStarted < earliestStr) earliestStr = task.dateStarted;
      }
      if (!earliestStr) return result;
      let cycleStartMs = getCycleStartForDate(task, earliestStr, game).getTime();
      const nowMs = now.getTime();
      const lastBounds = getLastCycleBounds(task, game);
      while (cycleStartMs <= nowMs) {
        if (lastBounds && cycleStartMs > lastBounds.startMs) break;
        const cycleStart = new Date(cycleStartMs);
        const cycleEnd = getCycleEndDate(cycleStart, task, game);
        const nextCycleStart = new Date(cycleStartMs + intervalMs);
        const completed = isPeriodCompletedFromCalendar(key, "weeklies", cycleStart, cycleEnd, nextCycleStart) ? 1 : 0;
        result.push({ periodStart: cycleStart, periodEnd: cycleEnd, nextCycleStart, completed });
        cycleStartMs += intervalMs;
      }
    } else if (type === "endgame") {
      const task = (game.endgame || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
      if (!task) return result;
      if (isManualResetTask(task)) {
        const closed = Array.isArray(task.manualClosedCycles) ? task.manualClosedCycles : [];
        closed.forEach((c) => {
          if (!c || !isValidDateStr(c.start) || !isValidDateStr(c.end)) return;
          const periodStart = getManualResetMomentOnDate(task, c.start, game);
          const periodEnd = getManualResetMomentOnDate(task, c.end, game);
          if (!periodStart || !periodEnd) return;
          result.push({
            periodStart,
            periodEnd,
            nextCycleStart: new Date(periodEnd.getTime()),
            completed: c.completed ? 1 : 0,
          });
        });
        const bounds = getManualResetCycleBounds(task, game, "endgame");
        if (bounds) {
          const completed = isPeriodCompletedFromCalendar(key, "endgame", bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart) ? 1 : 0;
          result.push({
            periodStart: bounds.cycleStart,
            periodEnd: bounds.cycleEnd,
            nextCycleStart: bounds.nextCycleStart,
            completed,
          });
        }
        tallyCacheSet(cacheKey, result);
        return result;
      }
      const { intervalMs, timeLimitMs } = getCycleParams(task);
      let earliestStr = null;
      Object.keys(state.completionByDate || {}).forEach((dateStr) => {
        const dayData = state.completionByDate[dateStr] || { endgame: [] };
        if ((dayData.endgame || []).includes(key) && (!earliestStr || dateStr < earliestStr)) earliestStr = dateStr;
      });
      if (task.countFromDateStarted && isValidDateStr(task.dateStarted)) {
        if (!earliestStr || task.dateStarted < earliestStr) earliestStr = task.dateStarted;
      }
      if (!earliestStr) return result;
      let cycleStartMs = getCycleStartForDate(task, earliestStr, game).getTime();
      const nowMs = now.getTime();
      const lastBounds = getLastCycleBounds(task, game);
      while (cycleStartMs <= nowMs) {
        if (lastBounds && cycleStartMs > lastBounds.startMs) break;
        const cycleStart = new Date(cycleStartMs);
        const cycleEnd = getCycleEndDate(cycleStart, task, game);
        const nextCycleStart = new Date(cycleStartMs + intervalMs);
        const completed = isPeriodCompletedFromCalendar(key, "endgame", cycleStart, cycleEnd, nextCycleStart) ? 1 : 0;
        result.push({ periodStart: cycleStart, periodEnd: cycleEnd, nextCycleStart, completed });
        cycleStartMs += intervalMs;
      }
    }
    tallyCacheSet(cacheKey, result);
    return result;
  }

  /**
   * Attempt count aligned with Completion History: completed + skipped + (optional) in-progress cycle.
   * Unlike raw history.length, this excludes orphan cycles that overlap stored completions but lack calendar marks.
   */
  function getTaskAttemptedFromCalendar(game, type, key, includeInProgress) {
    const countInProgress = includeInProgress !== false;
    const cacheKey = "attempted|" + type + "|" + key + "|" + (countInProgress ? "1" : "0");
    const cached = tallyCacheGet(cacheKey);
    if (cached != null) return cached;
    const history = getTaskTallyHistory(game, type, key);
    const now = getSimulatedNow();
    const completed = type === "endgame"
      ? getEndgameCompletedPeriodsFromCalendar(game, (game.endgame || []).find((t) => (game.id + "." + (t.id || t.label)) === key), key).length
      : history.reduce((sum, p) => sum + p.completed, 0);
    let skipped;
    if (type === "endgame") {
      skipped = getEndgameSkippedCycles(key).length;
    } else {
      skipped = history.filter((p) => p.completed === 0 && p.periodEnd.getTime() <= now.getTime()).length;
    }
    // Unfinished current cycle only — completed-but-still-open cycles stay in `completed`.
    const inProgress = countInProgress
      ? history.filter((p) => p.periodEnd.getTime() > now.getTime() && p.completed === 0).length
      : 0;
    const total = completed + skipped + inProgress;
    tallyCacheSet(cacheKey, total);
    return total;
  }

  /**
   * Skipped endgame cycles (attempted but not completed). Used for time trend (0%) and history tab.
   * Calendar-only: ended periods with no completion mark, excluding ranges already counted as completed.
   * Returns array of { periodStart, periodEnd, startStr, endStr }.
   */
  function getEndgameSkippedCycles(key) {
    const cacheKey = "endgameSkipped|" + key;
    const cached = tallyCacheGet(cacheKey);
    if (cached) return cached;
    const dot = key.indexOf(".");
    const gameId = dot >= 0 ? key.slice(0, dot) : key;
    const game = getGame(gameId);
    const task = (game?.endgame || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
    if (!game || !task) {
      const empty = [];
      tallyCacheSet(cacheKey, empty);
      return empty;
    }
    const history = getTaskTallyHistory(game, "endgame", key);
    const now = getSimulatedNow();
    const completedRangeKeys = new Set(
      getEndgameCompletedPeriodsFromCalendar(game, task, key).map((e) => e.range.start + "|" + e.range.end)
    );
    const seen = new Set();
    const result = [];
    history.forEach((p) => {
      if (p.periodEnd.getTime() > now.getTime()) return;
      if (periodHasCalendarMarkInRange(key, "endgame", p.periodStart, p.periodEnd, p.nextCycleStart)) return;
      const range = { start: getDateStr(p.periodStart), end: getDateStr(p.periodEnd) };
      const rangeKey = range.start + "|" + range.end;
      if (completedRangeKeys.has(rangeKey) || seen.has(rangeKey)) return;
      seen.add(rangeKey);
      result.push({
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        startStr: range.start,
        endStr: range.end,
      });
    });
    tallyCacheSet(cacheKey, result);
    return result;
  }

  /**
   * Merged endgame completion events for the time trend graph.
   * Completion History (start/end) = cycle boundaries = total time for the task.
   * Calendar = earliest completion date within each cycle = when it was actually completed.
   * % time remaining = (cycleEnd - completionMoment) / (cycleEnd - cycleStart) * 100.
   * Skipped cycles = 0% plot points.
   * Returns sorted array of { dateStr?, hour?, gameId, taskId, taskLabel, cycleStartStr?, cycleEndStr?, skipped? }.
   */
  function getEndgameCompletionEventsForTrend(key) {
    const dot = key.indexOf(".");
    const gameId = dot >= 0 ? key.slice(0, dot) : key;
    const taskId = dot >= 0 ? key.slice(dot + 1) : "";
    const game = getGame(gameId);
    const task = (game?.endgame || []).find((t) => (t.id || t.label) === taskId);
    const taskLabel = task ? (task.label || taskId) : taskId;

    const calendarDates = [];
    Object.keys(state.completionByDate || {}).sort().forEach((dateStr) => {
      const dayData = state.completionByDate[dateStr] || { endgame: [] };
      if ((dayData.endgame || []).includes(key)) calendarDates.push(dateStr);
    });

    const storedDates = state.endgameCompletionDates[key] || [];
    const timestampByDate = {};
    (state.completionTimestamps || []).forEach((t) => {
      if (t.taskType === "endgame" && t.gameId === gameId && t.taskId === taskId && isValidDateStr(t.dateStr)) {
        timestampByDate[t.dateStr] = Number(t.hour);
      }
    });

    const events = [];
    const usedCalendarDates = new Set();

    storedDates.forEach((stored, i) => {
      const cycleStartStr = (stored && isValidDateStr(stored.start)) ? stored.start : null;
      const cycleEndStr = (stored && isValidDateStr(stored.end)) ? stored.end : null;
      if (!cycleStartStr || !cycleEndStr) {
        const dateStr = calendarDates[i];
        if (dateStr && isValidDateStr(dateStr)) {
          const hour = Number.isFinite(timestampByDate[dateStr]) ? timestampByDate[dateStr] : 12;
          events.push({ dateStr, hour, gameId, taskId, taskLabel, cycleStartStr: null, cycleEndStr: null });
        }
        return;
      }
      const tsInCycle = Object.keys(timestampByDate)
        .filter((dateStr) => dateStr >= cycleStartStr && dateStr <= cycleEndStr)
        .sort();
      const earliestTs = tsInCycle[0] || null;
      const earliestInCycle = calendarDates.find((dateStr) => {
        if (usedCalendarDates.has(dateStr)) return false;
        return dateStr >= cycleStartStr && dateStr <= cycleEndStr;
      });
      // Timestamps are the real completion moment; calendar earliest can be polluted (day 1 fill).
      const dateStr = earliestTs || earliestInCycle || calendarDates[i];
      if (!dateStr || !isValidDateStr(dateStr)) return;
      if (dateStr < cycleStartStr || dateStr > cycleEndStr) return;
      if (earliestInCycle) usedCalendarDates.add(earliestInCycle);
      calendarDates.forEach((ds) => {
        if (ds >= cycleStartStr && ds <= cycleEndStr) usedCalendarDates.add(ds);
      });
      const hour = Number.isFinite(timestampByDate[dateStr]) ? timestampByDate[dateStr] : 12;
      events.push({ dateStr, hour, gameId, taskId, taskLabel, cycleStartStr, cycleEndStr });
    });

    calendarDates.forEach((dateStr, i) => {
      if (usedCalendarDates.has(dateStr)) return;
      const stored = storedDates[i];
      const cycleStartStr = (stored && isValidDateStr(stored.start)) ? stored.start : null;
      const cycleEndStr = (stored && isValidDateStr(stored.end)) ? stored.end : null;
      if (cycleStartStr && cycleEndStr) return;
      const hour = Number.isFinite(timestampByDate[dateStr]) ? timestampByDate[dateStr] : 12;
      events.push({ dateStr, hour, gameId, taskId, taskLabel, cycleStartStr, cycleEndStr });
    });

    (state.completionTimestamps || []).filter((t) => t.taskType === "endgame" && t.gameId === gameId && t.taskId === taskId).forEach((t) => {
      const exists = events.some((e) => e.dateStr === t.dateStr);
      if (!exists && isValidDateStr(t.dateStr)) {
        events.push({ dateStr: t.dateStr, hour: Number(t.hour) || 12, gameId, taskId, taskLabel, cycleStartStr: null, cycleEndStr: null });
      }
    });

    events.sort((a, b) => {
      const da = a.dateStr + "T" + String(a.hour).padStart(2, "0") + ":00";
      const db = b.dateStr + "T" + String(b.hour).padStart(2, "0") + ":00";
      return da.localeCompare(db);
    });

    const skipped = getEndgameSkippedCycles(key);
    skipped.forEach((s) => {
      events.push({
        dateStr: null,
        hour: 12,
        gameId,
        taskId,
        taskLabel,
        cycleStartStr: s.startStr,
        cycleEndStr: s.endStr,
        skipped: true,
      });
    });
    events.sort((a, b) => {
      const aKey = a.cycleStartStr || a.dateStr || "";
      const bKey = b.cycleStartStr || b.dateStr || "";
      return aKey.localeCompare(bKey);
    });
    return events;
  }

  /** Parse dateStr (YYYY-MM-DD) and return moment at task's reset time in task timezone. Used for cycle boundary from Completion History. */
  function getResetMomentForDateStr(task, game, dateStr) {
    if (!isValidDateStr(dateStr)) return null;
    const y = parseInt(dateStr.slice(0, 4), 10);
    const mo = parseInt(dateStr.slice(5, 7), 10) - 1;
    const d = parseInt(dateStr.slice(8, 10), 10);
    const hour = getResetHour(task, "weekStartHour", getResetHour(task, "resetHour", 4), game);
    const minute = Number.isFinite(task && task.weekStartMinute) ? task.weekStartMinute : (Number.isFinite(task && task.resetMinute) ? task.resetMinute : 0);
    const baseTz = game ? getResetTimezoneForGame(game) : getRecordingTimezone();
    const tz = getTimezoneForTaskDst(task, baseTz);
    const offsetRef = getOffsetRefDateForTask(task, tz);
    return createDateInTimezone(y, mo, d, hour, minute, tz, offsetRef);
  }

  /**
   * Sync Completed amount and Amount attempted from calendar history (tally).
   * Updates state.xxxCompleted and state.xxxAttempted to match completionByDate.
   */
  function syncTaskWithCalendar(game, type, key, opts) {
    const options = opts || {};
    const runSync = () => {
      const history = getTaskTallyHistory(game, type, key);
      const completed = history.reduce((sum, p) => sum + p.completed, 0);
      const attempted = getTaskAttemptedFromCalendar(game, type, key, true);

      const todayStr = getDateStr();

      if (type === "dailies") {
        state.dailiesCompleted[key] = completed + getHistoryCompactBaseline("dailiesCompleted", key);
        state.dailiesAttempted[key] = attempted + getHistoryCompactBaseline("dailiesAttempted", key);
        state.lastProcessedResets.dailies[key] = todayStr;
      } else if (type === "weeklies") {
        state.weekliesCompleted[key] = completed + getHistoryCompactBaseline("weekliesCompleted", key);
        state.weekliesAttempted[key] = attempted + getHistoryCompactBaseline("weekliesAttempted", key);
        const task = (game.weeklies || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
        if (task) {
          const { intervalMs } = getCycleParams(task);
          const last = history.length > 0 ? history[history.length - 1] : null;
          state.lastProcessedResets.weeklies[key] = last ? last.periodStart.getTime() + intervalMs : getCycleStartForDate(task, todayStr, game).getTime() + intervalMs;
        }
      } else if (type === "endgame") {
        const task = (game.endgame || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
        if (task) syncEndgameCompletionDatesFromCalendar(game, task, key);
        const completedPeriods = task ? getEndgameCompletedPeriodsFromCalendar(game, task, key) : [];
        const endgameCompleted = completedPeriods.length + getHistoryCompactBaseline("endgameCompleted", key);
        const endgameAttempted =
          getTaskAttemptedFromCalendar(game, type, key, true) + getHistoryCompactBaseline("endgameAttempted", key);
        state.endgameCompleted[key] = endgameCompleted;
        state.endgameAttempted[key] = endgameAttempted;
        if (task) {
          ensureEndgameEarnedArrayLength(game.id, task.id || task.label, endgameCompleted);
          ensureEndgamePotentialArrayLength(game.id, task.id || task.label, endgameAttempted);
          const last = history.length > 0 ? history[history.length - 1] : null;
          if (last) {
            const { intervalMs } = getCycleParams(task);
            state.lastProcessedResets.endgame[key] = last.periodStart.getTime() + intervalMs;
          } else {
            const { timeLimitMs } = getCycleParams(task);
            state.lastProcessedResets.endgame[key] = getCycleStartForDate(task, todayStr, game).getTime() + timeLimitMs;
          }
        }
      }

      if (!(options.skipSave && options.skipRender)) bumpDataVersion();
      if (!options.skipSave) save(options.saveOptions);
      if (!options.skipRender) renderActiveTab();
    };

    const label = "syncTaskWithCalendar:" + type + ":" + key;
    if (options.skipSave && options.skipRender) return runSync();
    beginTallyCacheFrame();
    try {
      if (isPerfDebugEnabled()) perfMeasure(label, runSync);
      else runSync();
    } finally {
      endTallyCacheFrame();
    }
  }

  /**
   * Reset all attempts and completions for a game to zero.
   * Clears dailies, weeklies, endgame completion/attempt counts and calendar history for that game.
   */
  function clearGameData(gameId) {
    if (!gameId) return;
    const game = getGame(gameId);
    if (!game) return;

    state.dailiesCompleted[gameId] = 0;
    state.dailiesAttempted[gameId] = 0;

    (game.weeklies || []).forEach((task) => {
      const key = gameId + "." + (task.id || task.label);
      state.weekliesCompleted[key] = 0;
      state.weekliesAttempted[key] = 0;
      delete state.lastProcessedResets.weeklies[key];
    });
    (game.endgame || []).forEach((task) => {
      const key = gameId + "." + (task.id || task.label);
      state.endgameCompleted[key] = 0;
      state.endgameAttempted[key] = 0;
      delete state.lastProcessedResets.endgame[key];
      delete state.endgameCompletionDates[key];
    });

    delete state.lastProcessedResets.dailies[gameId];
    if (state.endgameCurrencyEarned[gameId]) state.endgameCurrencyEarned[gameId] = {};
    if (state.endgameCurrencyPotential[gameId]) state.endgameCurrencyPotential[gameId] = {};
    Object.keys(state.endgamePendingCurrency || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgamePendingCurrency[k];
    });
    Object.keys(state.endgamePendingCycleStartMs || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgamePendingCycleStartMs[k];
    });

    Object.keys(state.completionByDate || {}).forEach((dateStr) => {
      const dayData = state.completionByDate[dateStr];
      if (!dayData) return;
      if (dayData.dailies) dayData.dailies = dayData.dailies.filter((id) => id !== gameId);
      if (dayData.weeklies) dayData.weeklies = dayData.weeklies.filter((k) => !String(k).startsWith(gameId + "."));
      if (dayData.endgame) dayData.endgame = dayData.endgame.filter((k) => !String(k).startsWith(gameId + "."));
    });

    if (state.completionTimestamps) {
      state.completionTimestamps = state.completionTimestamps.filter((t) => t.gameId !== gameId);
    }

    save();
    bumpDataVersion();
    renderAll();
  }

  /** Sync all tasks (dailies, weeklies, endgame) for a game from calendar history. */
  function syncAllTasksForGame(game) {
    if (!game) return;
    const runBatch = () => {
      beginTallyCacheFrame();
      try {
        if (game.dailies) syncTaskWithCalendar(game, "dailies", game.id, { skipSave: true, skipRender: true });
        (game.weeklies || []).forEach((task) => {
          const key = game.id + "." + (task.id || task.label);
          syncTaskWithCalendar(game, "weeklies", key, { skipSave: true, skipRender: true });
        });
        (game.endgame || []).forEach((task) => {
          const key = game.id + "." + (task.id || task.label);
          syncTaskWithCalendar(game, "endgame", key, { skipSave: true, skipRender: true });
        });
      } finally {
        endTallyCacheFrame();
      }
      bumpDataVersion();
      save({ immediate: true });
      renderActiveTab();
    };
    if (isPerfDebugEnabled()) perfMeasure("syncAllTasksForGame:" + game.id, runBatch);
    else runBatch();
  }

  /**
   * Run a 30-day simulation: randomly populate completionByDate for DWE tasks.
   * Uses past 30 days from today. Saves a snapshot for undo before modifying.
   */
  function runSimulation() {
    const games = getAllGames();
    if (games.length === 0) return;

    state.lastSimulationSnapshot = JSON.parse(JSON.stringify({
      completionByDate: state.completionByDate,
      completionTimestamps: state.completionTimestamps,
      dailiesCompleted: state.dailiesCompleted,
      weekliesCompleted: state.weekliesCompleted,
      endgameCompleted: state.endgameCompleted,
      dailiesAttempted: state.dailiesAttempted,
      weekliesAttempted: state.weekliesAttempted,
      endgameAttempted: state.endgameAttempted,
      lastProcessedResets: state.lastProcessedResets,
      endgameCurrencyEarned: state.endgameCurrencyEarned,
      endgameCurrencyPotential: state.endgameCurrencyPotential,
      endgameCompletionDates: state.endgameCompletionDates,
    }));

    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - (29 - i));
      const dateStr = getDateStr(d);
      const available = getTasksAvailableOnDate(dateStr);

      (available.dailies || []).forEach((item) => {
        if (Math.random() < 0.75) recordCompletion(dateStr, "dailies", item.key, true);
      });
      (available.weeklies || []).forEach((item) => {
        if (Math.random() < 0.55) recordCompletion(dateStr, "weeklies", item.key, true);
      });
      (available.endgame || []).forEach((item) => {
        if (Math.random() < 0.45) recordCompletion(dateStr, "endgame", item.key, true);
      });
    }

    games.forEach((game) => {
      if (game.dailies) syncTaskWithCalendar(game, "dailies", game.id, { skipSave: true, skipRender: true });
      (game.weeklies || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        syncTaskWithCalendar(game, "weeklies", key, { skipSave: true, skipRender: true });
      });
      (game.endgame || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        syncTaskWithCalendar(game, "endgame", key, { skipSave: true, skipRender: true });
      });
    });

    save({ immediate: true });
    renderAll();
  }

  /**
   * Skip 1 day forward: simulate that "today" is tomorrow. Runs processResets to apply any resets.
   * Saves a snapshot for undo (only on first skip from real time).
   */
  function skipDayForward() {
    if ((state.simulatedDateOffset || 0) === 0 && (state.simulatedHourOffset || 0) === 0) {
      state.lastSkipDaySnapshot = JSON.parse(JSON.stringify({
        completionByDate: state.completionByDate,
        completionTimestamps: state.completionTimestamps,
        dailiesCompleted: state.dailiesCompleted,
        weekliesCompleted: state.weekliesCompleted,
        endgameCompleted: state.endgameCompleted,
        dailiesAttempted: state.dailiesAttempted,
        weekliesAttempted: state.weekliesAttempted,
        endgameAttempted: state.endgameAttempted,
        lastProcessedResets: state.lastProcessedResets,
        endgameCurrencyEarned: state.endgameCurrencyEarned,
        endgameCurrencyPotential: state.endgameCurrencyPotential,
        endgameCompletionDates: state.endgameCompletionDates,
        extracurricularCompleted: state.extracurricularCompleted,
        extracurricularCompletedAt: state.extracurricularCompletedAt,
        extracurricularCurrencyEarned: state.extracurricularCurrencyEarned,
      }));
    }
    state.simulatedDateOffset = (state.simulatedDateOffset || 0) + 1;
    processResets();
    save();
    renderAll();
  }

  /**
   * Skip X hours forward: advance simulated time by the given hours. Runs processResets if crossing reset boundaries.
   * Saves a snapshot for undo (only on first skip from real time).
   */
  function skipTimeForward(hours) {
    const h = Math.max(1, Math.min(168, Math.floor(Number(hours) || 1)));
    if ((state.simulatedDateOffset || 0) === 0 && (state.simulatedHourOffset || 0) === 0) {
      state.lastSkipDaySnapshot = JSON.parse(JSON.stringify({
        completionByDate: state.completionByDate,
        completionTimestamps: state.completionTimestamps,
        dailiesCompleted: state.dailiesCompleted,
        weekliesCompleted: state.weekliesCompleted,
        endgameCompleted: state.endgameCompleted,
        dailiesAttempted: state.dailiesAttempted,
        weekliesAttempted: state.weekliesAttempted,
        endgameAttempted: state.endgameAttempted,
        lastProcessedResets: state.lastProcessedResets,
        endgameCurrencyEarned: state.endgameCurrencyEarned,
        endgameCurrencyPotential: state.endgameCurrencyPotential,
        endgameCompletionDates: state.endgameCompletionDates,
        extracurricularCompleted: state.extracurricularCompleted,
        extracurricularCompletedAt: state.extracurricularCompletedAt,
        extracurricularCurrencyEarned: state.extracurricularCurrencyEarned,
      }));
    }
    state.simulatedHourOffset = (state.simulatedHourOffset || 0) + h;
    processResets();
    save();
    renderAll();
  }

  /**
   * Undo the last skip day: restore state from the saved snapshot.
   */
  function undoSkipDay() {
    const snap = state.lastSkipDaySnapshot;
    if (!snap) return;
    state.completionByDate = snap.completionByDate || {};
    state.completionTimestamps = snap.completionTimestamps || [];
    state.dailiesCompleted = snap.dailiesCompleted || {};
    state.weekliesCompleted = snap.weekliesCompleted || {};
    state.endgameCompleted = snap.endgameCompleted || {};
    state.dailiesAttempted = snap.dailiesAttempted || {};
    state.weekliesAttempted = snap.weekliesAttempted || {};
    state.endgameAttempted = snap.endgameAttempted || {};
    state.lastProcessedResets = snap.lastProcessedResets || { dailies: {}, weeklies: {}, endgame: {} };
    state.endgameCurrencyEarned = snap.endgameCurrencyEarned || {};
    state.endgameCurrencyPotential = snap.endgameCurrencyPotential || {};
    state.endgameCompletionDates = snap.endgameCompletionDates || {};
    state.extracurricularCompleted = snap.extracurricularCompleted || {};
    state.extracurricularCompletedAt = snap.extracurricularCompletedAt || {};
    state.extracurricularCurrencyEarned = snap.extracurricularCurrencyEarned || {};
    state.simulatedDateOffset = 0;
    state.simulatedHourOffset = 0;
    state.lastSkipDaySnapshot = null;
    save();
    renderAll();
  }

  /**
   * Undo the last simulation: restore state from the saved snapshot.
   */
  function undoSimulation() {
    const snap = state.lastSimulationSnapshot;
    if (!snap) return;
    state.completionByDate = snap.completionByDate || {};
    state.completionTimestamps = snap.completionTimestamps || [];
    state.dailiesCompleted = snap.dailiesCompleted || {};
    state.weekliesCompleted = snap.weekliesCompleted || {};
    state.endgameCompleted = snap.endgameCompleted || {};
    state.dailiesAttempted = snap.dailiesAttempted || {};
    state.weekliesAttempted = snap.weekliesAttempted || {};
    state.endgameAttempted = snap.endgameAttempted || {};
    state.lastProcessedResets = snap.lastProcessedResets || { dailies: {}, weeklies: {}, endgame: {} };
    state.endgameCurrencyEarned = snap.endgameCurrencyEarned || {};
    state.endgameCurrencyPotential = snap.endgameCurrencyPotential || {};
    state.endgameCompletionDates = snap.endgameCompletionDates || {};
    state.lastSimulationSnapshot = null;
    save();
    renderAll();
  }

  function qs(id) {
    return document.getElementById(id);
  }
