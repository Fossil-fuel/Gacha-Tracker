/**
 * GENERATED — edit src/* and presets/*.json, then run: node build.js
 */
/**
 * Firebase Auth + Firestore for cloud sync.
 * SDK scripts are loaded by index.html only when FIREBASE_CONFIG is real (not placeholders).
 * When unconfigured or SDK missing, cloud features stay no-ops.
 *
 * Future (cloud-primary): keep __cloudSave / __applyCloudData as the cloud I/O surface;
 * local IndexedDB becomes an offline cache via persistence mode in 01-core.js.
 */
(function () {
  "use strict";

  const USERS_COLLECTION = "users";
  const DATA_FIELD = "data";

  function isFirebaseConfigured() {
    const cfg = typeof window !== "undefined" && window.FIREBASE_CONFIG;
    return cfg && cfg.apiKey && cfg.apiKey !== "YOUR_API_KEY" && cfg.projectId && cfg.projectId !== "YOUR_PROJECT_ID";
  }

  window.isFirebaseConfigured = isFirebaseConfigured;

  function noop() {}

  window.initFirebaseAuth = noop;
  window.__cloudSave = noop;
  window.__firebaseAuthReady = noop;
  window.getFirebaseUser = function () { return null; };
  window.signInWithGoogle = noop;
  window.signInWithFacebook = noop;
  window.signInWithTwitter = noop;
  window.signOutCloud = noop;
  window.updateAccountUI = noop;

  if (!isFirebaseConfigured()) return;

  if (typeof firebase === "undefined") return;

  try {
    const app = firebase.initializeApp(window.FIREBASE_CONFIG);
    const auth = firebase.auth();
    const db = firebase.firestore();

    let currentUser = null;

    window.getFirebaseUser = function () {
      return currentUser;
    };

    window.__cloudSave = function (jsonStr) {
      if (!currentUser) return Promise.resolve();
      return db.collection(USERS_COLLECTION).doc(currentUser.uid).set({ [DATA_FIELD]: jsonStr, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () {});
    };

    function fetchCloudData() {
      if (!currentUser) return Promise.resolve(null);
      return db.collection(USERS_COLLECTION).doc(currentUser.uid).get().then(function (doc) {
        return doc.exists && doc.data() && doc.data()[DATA_FIELD] ? doc.data()[DATA_FIELD] : null;
      }).catch(function () { return null; });
    }

    function onAuthStateChanged(user) {
      currentUser = user;
      if (typeof window.updateAccountUI === "function") window.updateAccountUI(user);

      if (!user) {
        window.__firebaseAuthReady();
        return;
      }

      fetchCloudData().then(function (cloudData) {
        if (cloudData && typeof window.__applyCloudData === "function") {
          window.__applyCloudData(cloudData);
        } else if (typeof window.__uploadLocalToCloud === "function") {
          window.__uploadLocalToCloud();
        }
        window.__firebaseAuthReady();
      }).catch(function () {
        window.__firebaseAuthReady();
      });
    }

    auth.onAuthStateChanged(onAuthStateChanged);

    auth.getRedirectResult().catch(function () {});

    window.initFirebaseAuth = function () {
      currentUser = auth.currentUser;
      if (currentUser && typeof window.updateAccountUI === "function") window.updateAccountUI(currentUser);
    };

    function signInWithProvider(provider) {
      auth.signInWithPopup(provider).catch(function (err) {
        if (err.code === "auth/popup-blocked") {
          auth.signInWithRedirect(provider);
        } else {
          alert("Sign-in failed: " + (err.message || err.code));
        }
      });
    }

    window.signInWithGoogle = function () {
      signInWithProvider(new firebase.auth.GoogleAuthProvider());
    };

    window.signInWithFacebook = function () {
      signInWithProvider(new firebase.auth.FacebookAuthProvider());
    };

    window.signInWithTwitter = function () {
      signInWithProvider(new firebase.auth.TwitterAuthProvider());
    };

    window.signOutCloud = function () {
      auth.signOut();
    };
  } catch (e) {
    console.warn("Firebase init failed:", e);
  }
})();

(function () {
  "use strict";
  const STORAGE_KEY = "gacha-tracker";
  const STORAGE_SLIM_KEY = "gacha-tracker-slim";
  const STORAGE_META_KEY = "gacha-tracker-meta";
  const IDB_NAME = "gacha-tracker-db";
  const IDB_VERSION = 1;
  const IDB_STORE = "saves";
  const IDB_FULL_RECORD = "full";
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
      clearBtn: "taskBannerClearBtn",
      file: "taskBannerFile",
      wrap: "taskBannerCropWrap",
      canvas: "taskBannerCropCanvas",
      imgFrame: "taskBannerImageFrame",
      cropFrame: "taskBannerCropFrame",
      previewWrap: "taskBannerPreviewWrap",
      cardPreview: "taskBannerCardPreview",
      nameInput: "taskNameInput",
    },
    extra: {
      root: "extracurricularTaskModal",
      chooseBtn: "extraBannerChooseBtn",
      stockBtn: "extraBannerStockBtn",
      clearBtn: "extraBannerClearBtn",
      file: "extraBannerFile",
      wrap: "extraBannerCropWrap",
      canvas: "extraBannerCropCanvas",
      imgFrame: "extraBannerImageFrame",
      cropFrame: "extraBannerCropFrame",
      previewWrap: "extraBannerPreviewWrap",
      cardPreview: "extraBannerCardPreview",
      nameInput: "extracurricularTaskName",
    },
  };
  let activeBannerUiKey = "task";
  let stockBannerPickerUiKey = "task";

  /** Bundled stock banners (relative paths; stored as URL strings on tasks). */
  const STOCK_BANNER_ASSETS = [
    { id: "story-castorice-fields", path: "assets/Story - Castorice fields.png", kind: "story", label: "Castorice Fields" },
    { id: "story-qingming", path: "assets/Story - QingMing.png", kind: "story", label: "Qingming" },
    { id: "story-startorch", path: "assets/Story - Startorch.png", kind: "story", label: "Startorch" },
    { id: "story-wuling", path: "assets/Story - Wuling.png", kind: "story", label: "Wuling" },
    { id: "event-acheron", path: "assets/Event - Acheron.png", kind: "event", label: "Acheron" },
    { id: "event-endfield", path: "assets/Event - Endfield.png", kind: "event", label: "Endfield" },
    { id: "event-excostrider", path: "assets/Event - Excostrider.png", kind: "event", label: "Excostrider" },
    { id: "event-stellar-jade", path: "assets/Event - Stellar Jade.png", kind: "event", label: "Stellar Jade" },
    { id: "event-zzz", path: "assets/Event - ZZZ.png", kind: "event", label: "ZZZ" },
  ];

  /** Bundled profile pictures (Settings gallery; not offered in the task banner picker). */
  const STOCK_PFP_ASSETS = [
    { id: "pfp-endfield-arcane", path: "assets/PFP - Endfield - Arcane.png", kind: "pfp", label: "Endfield — Arcane" },
    { id: "pfp-hi3rd-seele", path: "assets/PFP - HI3rd - Seele.png", kind: "pfp", label: "HI3rd — Seele" },
    { id: "pfp-hsr-castorice", path: "assets/PFP - HSR - Castorice.png", kind: "pfp", label: "HSR — Castorice" },
    { id: "pfp-pgr-alpha", path: "assets/PFP - PGR - Alpha.png", kind: "pfp", label: "PGR — Alpha" },
    { id: "pfp-wuwa-hsin", path: "assets/PFP - WuWa - Hsin.png", kind: "pfp", label: "WuWa — Hsin" },
    { id: "pfp-zzz-shungus", path: "assets/PFP - ZZZ - Shungus.png", kind: "pfp", label: "ZZZ — Shungus" },
  ];

  function getStockBannerAssets() {
    return STOCK_BANNER_ASSETS.slice();
  }

  function getStockPfpAssets() {
    return STOCK_PFP_ASSETS.slice();
  }

  function resolveStockBannerUrl(path) {
    const raw = String(path || "").trim();
    if (!raw) return "";
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
    } else if (customPreset && customPreset.colors) {
      root.setAttribute("data-theme", "custom");
      COLOR_LAYERS.forEach((layer) => {
        const val = customPreset.colors[layer.id];
        if (val) root.style.setProperty("--" + layer.cssVar, val);
      });
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
      root.style.removeProperty("--pie-missed");
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
    // End of due calendar day at task reset time when available, else 23:59.
    const hour = Number.isFinite(task.weekStartHour) ? task.weekStartHour : 23;
    const minute = Number.isFinite(task.weekStartMinute) ? task.weekStartMinute : 59;
    const end = createDateInTimezone(y, m, d, hour, minute, tz);
    // If using midnight-ish reset, treat due as that clock on the due day; if 23:59, fine as-is.
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
    if (ms <= 0) return "Due";
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
    const newStartMoment = getManualResetMomentOnDate(task, newStartStr, game) || getEndgameAnchorDate(
      Object.assign({}, task, { dateStarted: newStartStr }),
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
    if (o.tbd) {
      task.manualDueTbd = true;
      task.manualDueDateStr = null;
    } else if (isValidDateStr(o.dueDateStr)) {
      task.manualDueTbd = false;
      task.manualDueDateStr = o.dueDateStr;
    } else {
      task.manualDueTbd = true;
      task.manualDueDateStr = null;
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
   * Timestamps for Time Trends hour / day-of-week charts.
   * Dailies pass through; weeklies/endgame keep one entry per cycle (earliest finish).
   */
  function getTimestampsForTimeTrends(rawTimestamps) {
    const list = Array.isArray(rawTimestamps) ? rawTimestamps : [];
    const out = [];
    const bestByCycle = new Map();
    list.forEach((t) => {
      if (!t || !isValidDateStr(t.dateStr)) return;
      const type = t.taskType;
      if (type === "dailies") {
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
   * Data model for the share-card PNG.
   * Rates + currency use the same Games completed/attempted tallies as Games / Attendance.
   * Timeframe only filters the finish-day chart (Time Trends timestamps).
   * opts: { days?, startStr?, endStr?, todayStr?, gameIds?: string[] }
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
      return {
        id: game.id,
        name: game.name || game.id,
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
    trendTs.forEach((t) => {
      if (!t || !isValidDateStr(t.dateStr)) return;
      if (t.dateStr < startStr || t.dateStr > endStr) return;
      if (!selectedIds.has(t.gameId)) return;
      if (t.taskType !== "weeklies" && t.taskType !== "endgame" && t.taskType !== "dailies") return;
      const day = new Date(t.dateStr + "T12:00:00").getDay();
      if (day >= 0 && day <= 6) finishDaysSun[day]++;
    });
    const dayNamesSunFirst = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const order = [1, 2, 3, 4, 5, 6, 0];
    const finishDayNames = order.map((i) => dayNamesSunFirst[i]);
    const finishDays = order.map((i) => finishDaysSun[i]);
    let peakIdx = 0;
    finishDays.forEach((n, i) => {
      if (n > finishDays[peakIdx]) peakIdx = i;
    });

    const dateSpan =
      formatShareCardShortDate(startStr) + " – " + formatShareCardShortDate(endStr);
    const finishWindowLabel = isCustomRange ? dateSpan : rangeLabel + " · " + dateSpan;
    const title =
      gameBlocks.length === 1
        ? gameBlocks[0].name
        : isCustomRange
          ? dateSpan
          : rangeLabel;
    const subtitle = "Games tallies · finish days " + finishWindowLabel;

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
      currency: {
        earned: currencyEarned,
        potential: currencyPotential,
        currencyName,
      },
    };
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
  function renderShareCardCanvas(model, themeColors) {
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

    function measureGameCardHeight(game, innerW, compact) {
      const padIn = compact ? 10 : 16;
      let h = padIn + (compact ? 20 : 28) + 6;
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
      if (model.peakDay && model.peakDay.count > 0) h += 20;
      h += padIn;
      return h;
    }

    function drawGameCard(ctx2, game, x, y, w, compact, minH) {
      const padIn = compact ? 10 : 16;
      const h = Math.max(measureGameCardHeight(game, w, compact), minH || 0);
      panelFill(ctx2, x, y, w, h, { radius: 14, lineWidth: 1.5 });
      let cy = y + padIn;
      ctx2.fillStyle = colors.text;
      ctx2.font = "700 " + (compact ? 14 : 18) + "px " + font;
      ctx2.fillText(ellipsize(ctx2, game.name || "Game", w - padIn * 2), x + padIn, cy + (compact ? 12 : 16));
      cy += compact ? 20 : 30;
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
      if (model.peakDay && model.peakDay.count > 0) {
        ctx2.fillStyle = colors.muted;
        ctx2.font = "600 11px " + font;
        ctx2.fillText("Peak: " + model.peakDay.name + " (" + model.peakDay.count + ")", x + padIn, cy + 12);
      }
      return h;
    }

    // --- height estimate ---
    let est = pad + 160;
    if (!multi) {
      const g = games[0] || { dailies: [], weeklies: [], endgame: [] };
      est += 130;
      cats.forEach((cat) => {
        const tasks = g[cat.key] || [];
        if (tasks.length) est += categoryInnerHeight(tasks, false) + 30;
      });
      est += 280;
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
    orb.addColorStop(0, "rgba(124, 58, 237, 0.25)");
    orb.addColorStop(1, "rgba(124, 58, 237, 0)");
    ctx.fillStyle = orb;
    ctx.fillRect(0, 0, W, 380);
    ctx.restore();

    let y = pad;

    ctx.fillStyle = colors.muted;
    ctx.font = "700 12px " + font;
    ctx.fillText("GACHA TRACKER", pad, y + 12);
    y += 34;

    ctx.fillStyle = colors.text;
    ctx.font = "700 36px " + font;
    const title = String(model.title || "Share card");
    ctx.fillText(title.length > 34 ? title.slice(0, 32) + "…" : title, pad, y + 30);
    y += 46;

    ctx.fillStyle = colors.muted;
    ctx.font = "500 14px " + font;
    ctx.fillText(String(model.subtitle || ""), pad, y + 12);
    y += 28;

    const chip = model.gameCount + " game" + (model.gameCount === 1 ? "" : "s") + " selected";
    ctx.font = "600 12px " + font;
    const chipW = ctx.measureText(chip).width + 22;
    const chipH = 26;
    roundRectPath(ctx, pad, y, chipW, chipH, 13);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.fillText(chip, pad + 11, y + 17);
    y += chipH + 24;

    if (!multi) {
      const g = games[0] || { dailies: [], weeklies: [], endgame: [], summary: model.summary, currency: model.currency };
      y += drawMiniSummary(ctx, pad, y, contentW, model.summary, false) + 18;
      cats.forEach((cat) => {
        const tasks = g[cat.key] || [];
        if (!tasks.length) return;
        y += drawCategoryBlock(ctx, pad, y, contentW, cat.label, cat.color, tasks, cat.unit, false) + 12;
      });
      y += 4;
      y += drawFinishChart(ctx, pad, y, contentW, 120) + 14;
      if (model.peakDay && model.peakDay.count > 0) {
        ctx.fillStyle = colors.text;
        ctx.font = "600 13px " + font;
        ctx.fillText("Peak: " + model.peakDay.name + " (" + model.peakDay.count + ")", pad, y + 12);
        y += 26;
      }
      const cur = model.currency || g.currency || { earned: 0, potential: 0, currencyName: "" };
      y += drawCurrencyStrip(ctx, pad, y, contentW, cur, "Currency earned", false) + 22;
    } else {
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

  function downloadShareCardPng(opts) {
    const model = buildShareCardModel(opts);
    if (!model.ok) return model;
    const rendered = renderShareCardCanvas(model);
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
      const game = getGame(gameId);
      const task =
        type === "weeklies"
          ? (game?.weeklies || []).find((t) => (t.id || t.label) === taskId)
          : (game?.endgame || []).find((t) => (t.id || t.label) === taskId);
      taskLabel = task ? task.label || taskId : taskId;
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

  // GENERATED by build.js from presets/*.json — do not edit by hand.
  const GAME_PRESETS = [
    {
      "id": "hsr",
      "name": "Honkai Star Rail",
      "server": "america",
      "resetHour": 4,
      "dailies": true,
      "dailyCurrency": 60,
      "currencyPerPull": 160,
      "currencyName": "Stellar Jade",
      "weeklies": [
        {
          "id": "divergent",
          "label": "Divergent Universe",
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "currency": 225,
          "frequencyEvery": 2,
          "frequencyUnit": "week",
          "timeLimitEvery": 2,
          "timeLimitUnit": "week",
          "adjustForDST": true,
          "dateStarted": "2026-03-09"
        },
        {
          "id": "currency",
          "label": "Currency Wars",
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "currency": 225,
          "frequencyEvery": 2,
          "frequencyUnit": "week",
          "timeLimitEvery": 2,
          "timeLimitUnit": "week",
          "adjustForDST": true,
          "dateStarted": "2026-03-02"
        }
      ],
      "endgame": [
        {
          "id": "apocalyptic",
          "label": "Apocalyptic Shadow",
          "currency": 800,
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "dateStarted": "2026-02-02",
          "frequencyEvery": 6,
          "frequencyUnit": "week",
          "timeLimitEvery": 6,
          "timeLimitUnit": "week",
          "adjustForDST": true
        },
        {
          "id": "anomaly",
          "label": "Anomaly Arbitration",
          "currency": 0,
          "weekStartDay": 3,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "dateStarted": "2026-02-11",
          "frequencyEvery": 6,
          "frequencyUnit": "week",
          "timeLimitEvery": 6,
          "timeLimitUnit": "week",
          "adjustForDST": true
        },
        {
          "id": "moc",
          "label": "Memory of Chaos",
          "currency": 800,
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "dateStarted": "2026-03-02",
          "frequencyEvery": 6,
          "frequencyUnit": "week",
          "timeLimitEvery": 6,
          "timeLimitUnit": "week",
          "adjustForDST": true
        },
        {
          "id": "purefiction",
          "label": "Pure Fiction",
          "currency": 800,
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "dateStarted": "2026-02-16",
          "frequencyEvery": 6,
          "frequencyUnit": "week",
          "timeLimitEvery": 6,
          "timeLimitUnit": "week",
          "adjustForDST": true
        }
      ]
    },
    {
      "id": "zzz",
      "name": "Zenless Zone Zero",
      "server": "america",
      "resetHour": 4,
      "dailies": true,
      "dailyCurrency": 60,
      "currencyPerPull": 160,
      "currencyName": "Polychrome",
      "weeklies": [
        {
          "id": "weekly_ridu",
          "label": "Weekly Ridu",
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "currency": 60,
          "adjustForDST": true,
          "dateStarted": "2026-03-14"
        },
        {
          "id": "hallow_zero",
          "label": "Hallow Zero",
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "currency": 160,
          "adjustForDST": true,
          "dateStarted": "2026-03-14"
        }
      ],
      "endgame": [
        {
          "id": "deadly_assault",
          "label": "Deadly Assault",
          "currency": 300,
          "weekStartDay": 5,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "dateStarted": "2026-02-13",
          "frequencyEvery": 2,
          "frequencyUnit": "week",
          "timeLimitEvery": 2,
          "timeLimitUnit": "week",
          "adjustForDST": true
        },
        {
          "id": "shiyu_defense",
          "label": "Shiyu Defense",
          "currency": 780,
          "weekStartDay": 5,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "dateStarted": "2026-02-06",
          "frequencyEvery": 2,
          "frequencyUnit": "week",
          "timeLimitEvery": 2,
          "timeLimitUnit": "week",
          "adjustForDST": true
        }
      ]
    },
    {
      "id": "hi3",
      "name": "Honkai Impact 3rd",
      "server": "america",
      "resetHour": 4,
      "resetMinute": 0,
      "dailies": true,
      "dailyCurrency": 40,
      "currencyPerPull": 280,
      "currencyName": "Crystals",
      "weeklies": [
        {
          "id": "weekly_share",
          "label": "Weekly Share",
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "currency": 30,
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 1,
          "timeLimitUnit": "week",
          "dateStarted": "2026-03-10",
          "adjustForDST": true
        },
        {
          "id": "elysian_realm",
          "label": "Elysian Realm",
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "currency": 500,
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 1,
          "timeLimitUnit": "week",
          "dateStarted": "2026-03-10",
          "adjustForDST": true
        },
        {
          "id": "armata_contribution",
          "label": "Armata Contribution",
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "currency": 25,
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 1,
          "timeLimitUnit": "week",
          "dateStarted": "2026-03-10",
          "adjustForDST": true
        }
      ],
      "endgame": [
        {
          "id": "memorial_arena",
          "label": "Memorial Arena",
          "currency": 140,
          "weekStartDay": 2,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "dateStarted": "2026-03-10",
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 6,
          "timeLimitUnit": "day",
          "adjustForDST": true
        },
        {
          "id": "superstring_p1",
          "label": "Superstring Dimension P1",
          "currency": 520,
          "weekStartDay": 1,
          "weekStartHour": 20,
          "weekStartMinute": 0,
          "dateStarted": "2026-03-23",
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 2,
          "timeLimitUnit": "day",
          "adjustForDST": true
        },
        {
          "id": "superstring_p2",
          "label": "Superstring Dimension P2",
          "currency": 520,
          "weekStartDay": 5,
          "weekStartHour": 20,
          "weekStartMinute": 0,
          "dateStarted": "2026-03-06",
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 2,
          "timeLimitUnit": "day",
          "adjustForDST": true
        }
      ]
    },
    {
      "id": "ww",
      "name": "Wuthering Waves",
      "server": "america",
      "resetHour": 4,
      "resetMinute": 0,
      "dailies": true,
      "dailyCurrency": 60,
      "currencyPerPull": 160,
      "currencyName": "Astrite",
      "weeklies": [
        {
          "id": "thousand_gateways",
          "label": "Thousand Gateways",
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "currency": 160,
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 1,
          "timeLimitUnit": "week",
          "dateStarted": "2026-03-10",
          "adjustForDST": true
        }
      ],
      "endgame": [
        {
          "id": "tower_of_adversity",
          "label": "Tower of Adversity",
          "currency": 800,
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "dateStarted": "2026-03-02",
          "frequencyEvery": 4,
          "frequencyUnit": "week",
          "timeLimitEvery": 4,
          "timeLimitUnit": "week",
          "adjustForDST": true
        },
        {
          "id": "whimpering_wastes",
          "label": "Whimpering Wastes",
          "currency": 800,
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "dateStarted": "2026-02-16",
          "frequencyEvery": 4,
          "frequencyUnit": "week",
          "timeLimitEvery": 4,
          "timeLimitUnit": "week",
          "adjustForDST": true
        }
      ],
      "extracurricular": [
        {
          "label": "Doubled Pawns Matrix",
          "description": "This is a Placeholder for the Doubled Pawns Matrix gamemode (GM). Starting date does not matter for this task, just change the End date. Feel free to remove this if you don't wish to track this GM. For a new rotation of this GM, a new task will have to be created for the respective rotation.",
          "endDateTBD": true
        }
      ]
    },
    {
      "id": "akendfield",
      "name": "Arknights: Endfield",
      "server": "america",
      "resetHour": 4,
      "resetMinute": 0,
      "dailies": true,
      "dailyCurrency": 200,
      "currencyPerPull": 500,
      "currencyName": "Oroberyls",
      "weeklies": [
        {
          "id": "weekly_routine",
          "label": "Weekly Routine",
          "weekStartDay": 1,
          "weekStartHour": 4,
          "weekStartMinute": 0,
          "currency": 500,
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 1,
          "timeLimitUnit": "week",
          "dateStarted": "2026-03-10",
          "adjustForDST": true
        }
      ],
      "endgame": []
    },
    {
      "id": "pgr",
      "name": "Punishing Grey Raven",
      "server": "america",
      "resetHour": 0,
      "resetMinute": 0,
      "dailies": true,
      "dailyCurrency": 30,
      "currencyPerPull": 250,
      "currencyName": "Black Cards",
      "weeklies": [
        {
          "id": "missions",
          "label": "Missions",
          "weekStartDay": 1,
          "weekStartHour": 0,
          "weekStartMinute": 0,
          "currency": 1000,
          "dateStarted": "2026-03-17",
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 1,
          "timeLimitUnit": "week",
          "adjustForDST": true
        },
        {
          "id": "operation_guardians",
          "label": "Operation Guardians",
          "weekStartDay": 1,
          "weekStartHour": 0,
          "weekStartMinute": 0,
          "currency": 0,
          "dateStarted": "2026-03-17",
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 1,
          "timeLimitUnit": "week",
          "adjustForDST": true
        }
      ],
      "endgame": [
        {
          "id": "warzone",
          "label": "WarZone",
          "currency": 0,
          "weekStartDay": 1,
          "weekStartHour": 0,
          "weekStartMinute": 0,
          "dateStarted": "2026-03-17",
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 1,
          "timeLimitUnit": "week",
          "adjustForDST": true
        },
        {
          "id": "pain_cage",
          "label": "Pain Cage",
          "currency": 50,
          "weekStartDay": 1,
          "weekStartHour": 0,
          "weekStartMinute": 0,
          "dateStarted": "2026-03-17",
          "frequencyEvery": 1,
          "frequencyUnit": "week",
          "timeLimitEvery": 1,
          "timeLimitUnit": "week",
          "adjustForDST": true,
          "earliestCompleteDays": 2,
          "earliestCompleteHour": 0,
          "earliestCompleteMinute": 0
        }
      ]
    }
  ];

  function setModalOpen(open) {
    const el = qs("taskModal");
    if (!el) return;
    taskModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) activateModalFocus(el);
    else deactivateModalFocus();
  }

  function setGameModalOpen(open) {
    const el = qs("gameModal");
    if (!el) return;
    gameModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) activateModalFocus(el);
    else deactivateModalFocus();
  }

  function setDeleteGameModalOpen(open) {
    const el = qs("deleteGameModal");
    if (!el) return;
    deleteGameModalState.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) activateModalFocus(el);
    else deactivateModalFocus();
  }

  function setDeleteTaskModalOpen(open) {
    const el = qs("deleteTaskModal");
    if (!el) return;
    deleteTaskModalState.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) activateModalFocus(el);
    else deactivateModalFocus();
  }

  function openDeleteTaskModal(taskLabel, onConfirm) {
    if (typeof onConfirm !== "function") return;
    deleteTaskModalState.onConfirm = onConfirm;
    const msg = qs("deleteTaskMessage");
    if (msg) {
      const name = String(taskLabel || "").trim() || "this task";
      msg.textContent = 'Are you sure you want to delete "' + name + '"? This cannot be undone.';
    }
    setDeleteTaskModalOpen(true);
  }

  function closeDeleteTaskModal() {
    setDeleteTaskModalOpen(false);
    deleteTaskModalState.onConfirm = null;
  }

  function initDeleteTaskModal() {
    const modalEl = qs("deleteTaskModal");
    const closeBtn = qs("deleteTaskModalClose");
    const cancelBtn = qs("deleteTaskCancel");
    const confirmBtn = qs("deleteTaskConfirm");
    if (!modalEl || !confirmBtn) return;

    modalEl.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("modal-backdrop") ||
        (e.target.getAttribute && e.target.getAttribute("data-close") === "deleteTaskModal")
      ) {
        closeDeleteTaskModal();
      }
    });
    if (closeBtn) closeBtn.addEventListener("click", closeDeleteTaskModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeDeleteTaskModal);

    confirmBtn.addEventListener("click", () => {
      const fn = deleteTaskModalState.onConfirm;
      closeDeleteTaskModal();
      if (typeof fn === "function") fn();
    });

    document.addEventListener("keydown", (e) => {
      if (!deleteTaskModalState.open) return;
      if (e.key === "Escape") closeDeleteTaskModal();
    });
  }

  const MODAL_FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let modalFocusReturnEl = null;
  let modalFocusTrapBound = false;

  function listModalFocusable(modalRoot) {
    if (!modalRoot) return [];
    const dialog = modalRoot.querySelector(".modal-dialog") || modalRoot;
    return Array.from(dialog.querySelectorAll(MODAL_FOCUSABLE)).filter((el) => {
      if (el.hasAttribute("disabled")) return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      if (el.closest("[hidden]")) return false;
      return true;
    });
  }

  function getTopOpenModal() {
    const open = Array.from(document.querySelectorAll(".modal")).filter((el) => !el.hidden);
    if (!open.length) return null;
    let best = null;
    let bestZ = -Infinity;
    let bestIdx = -1;
    open.forEach((el, i) => {
      let z = parseFloat(window.getComputedStyle(el).zIndex);
      if (!Number.isFinite(z)) z = 0;
      if (z > bestZ || (z === bestZ && i > bestIdx)) {
        best = el;
        bestZ = z;
        bestIdx = i;
      }
    });
    return best;
  }

  function onModalFocusTrapKeydown(e) {
    if (e.key !== "Tab") return;
    const modal = getTopOpenModal();
    if (!modal) return;
    const focusables = listModalFocusable(modal);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function activateModalFocus(modalRoot) {
    if (!modalRoot) return;
    if (!modalFocusReturnEl || !modalFocusReturnEl.closest || !modalFocusReturnEl.closest(".modal")) {
      modalFocusReturnEl = document.activeElement;
    }
    const focusables = listModalFocusable(modalRoot);
    const preferred =
      focusables.find((el) => el.matches("input, select, textarea") && el.type !== "hidden") ||
      focusables.find((el) => !el.classList.contains("modal-close")) ||
      focusables[0];
    if (preferred) setTimeout(() => preferred.focus(), 0);
    if (!modalFocusTrapBound) {
      modalFocusTrapBound = true;
      document.addEventListener("keydown", onModalFocusTrapKeydown, true);
    }
  }

  function deactivateModalFocus() {
    const stillOpen = getTopOpenModal();
    if (stillOpen) {
      activateModalFocus(stillOpen);
      return;
    }
    if (modalFocusTrapBound) {
      document.removeEventListener("keydown", onModalFocusTrapKeydown, true);
      modalFocusTrapBound = false;
    }
    const ret = modalFocusReturnEl;
    modalFocusReturnEl = null;
    if (ret && typeof ret.focus === "function") {
      setTimeout(() => {
        try {
          ret.focus();
        } catch (_) {}
      }, 0);
    }
  }

  let clearGameDataModalGameId = null;
  function openClearGameDataModal(gameId) {
    const modal = qs("clearGameDataModal");
    const msg = qs("clearGameDataMessage");
    if (!modal || !msg) return;
    clearGameDataModalGameId = gameId;
    const game = getGame(gameId);
    msg.textContent = "Are you sure? This will reset all attempts and completions for " + (game ? game.name : "this game") + " to zero. Calendar history for this game will also be cleared. This cannot be undone.";
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    activateModalFocus(modal);
  }
  function closeClearGameDataModal() {
    const modal = qs("clearGameDataModal");
    if (modal) {
      clearGameDataModalGameId = null;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }
  function confirmClearGameData() {
    if (clearGameDataModalGameId) {
      clearGameData(clearGameDataModalGameId);
      clearGameDataModalGameId = null;
    }
    closeClearGameDataModal();
  }

  let clearDataModalOpen = false;
  function openClearDataModal() {
    const modal = qs("clearDataModal");
    if (!modal) return;
    clearDataModalOpen = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    activateModalFocus(modal);
  }
  function closeClearDataModal() {
    const modal = qs("clearDataModal");
    if (modal) {
      clearDataModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen) document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }
  function confirmClearData() {
    state.games = [];
    state.dailiesCompleted = {};
    state.weekliesCompleted = {};
    state.endgameCompleted = {};
    state.dailiesAttempted = {};
    state.weekliesAttempted = {};
    state.endgameAttempted = {};
    state.endgameCurrencyEarned = {};
    state.endgameCurrencyPotential = {};
    state.endgamePendingCurrency = {};
    state.endgamePendingCycleStartMs = {};
    state.endgameCompletionDates = {};
    state.completionByDate = {};
    state.completionTimestamps = [];
    state.historyCompact = null;
    state.lastProcessedResets = { dailies: {}, weeklies: {}, endgame: {} };
    state.lastSimulationSnapshot = null;
    state.lastSkipDaySnapshot = null;
    state.simulatedDateOffset = 0;
    state.attendancePieInclude = {};
    state.dataPieInclude = {};
    state.extracurricularTasks = [];
    state.extracurricularCompleted = {};
    state.extracurricularCompletedAt = {};
    state.extracurricularCurrencyEarned = {};
    state.tab = state.defaultTab || "about";
    save();
    // bulk state change: full refresh
    renderAll();
    closeClearDataModal();
    closeSettingsModal();
  }

  let calendarDayModal = { open: false, dateStr: null };
  /** @type {null|{ mode: 'calendar'|'debug', dateStr?: string, checkboxes?: any, currencyMap?: object|null, rows: Array<{type,key,label,dateStr}> }} */
  let completionTimeModalCtx = null;

  function setCalendarDayModalOpen(open) {
    const el = qs("calendarDayModal");
    if (!el) return;
    calendarDayModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) activateModalFocus(el);
    else deactivateModalFocus();
  }

  function setCompletionTimeModalOpen(open) {
    const el = qs("completionTimeModal");
    if (!el) return;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      document.body.style.overflow = "hidden";
      activateModalFocus(el);
    } else {
      deactivateModalFocus();
      // Keep scroll lock if Settings (or another modal) is still open underneath.
      const still = typeof getTopOpenModal === "function" ? getTopOpenModal() : null;
      if (still) {
        document.body.style.overflow = "hidden";
        return;
      }
      document.body.style.overflow = "";
    }
  }

  function defaultCompletionTimeValue() {
    const now = typeof getSimulatedNow === "function" ? getSimulatedNow() : new Date();
    const tz = typeof getAppTimezone === "function" ? getAppTimezone() : null;
    if (tz && typeof getDatePartsInTimezone === "function") {
      const p = getDatePartsInTimezone(now, tz);
      return String(p.hour).padStart(2, "0") + ":" + String(p.minute || 0).padStart(2, "0");
    }
    return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  function parseTimeInputValue(value) {
    const m = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!m) return { hour: 12, minute: 0 };
    return {
      hour: Math.max(0, Math.min(23, parseInt(m[1], 10) || 0)),
      minute: Math.max(0, Math.min(59, parseInt(m[2], 10) || 0)),
    };
  }

  function taskLabelForCompletionRow(type, key) {
    if (type === "dailies") {
      const game = getGame(key);
      return (game && game.name) || key;
    }
    const dot = key.indexOf(".");
    const gameId = dot >= 0 ? key.slice(0, dot) : key;
    const taskId = dot >= 0 ? key.slice(dot + 1) : "";
    const game = getGame(gameId);
    const list = type === "weeklies" ? (game && game.weeklies) : (game && game.endgame);
    const task = (list || []).find((t) => (t.id || t.label) === taskId);
    const gName = (game && game.name) || gameId;
    return gName + " — " + ((task && task.label) || taskId);
  }

  function isMarkedOnCalendarDay(dateStr, type, key) {
    const dayData = state.completionByDate[dateStr] || {};
    if (type === "dailies") return (dayData.dailies || []).includes(key);
    if (type === "weeklies") return (dayData.weeklies || []).includes(key);
    if (type === "endgame") return (dayData.endgame || []).includes(key);
    return false;
  }

  function collectNewlyCompletedFromCalendar(dateStr, checkboxes) {
    const rows = [];
    (checkboxes || []).forEach(({ check, type, key }) => {
      if (!check || !check.checked) return;
      // Only brand-new marks on this day (not already filled / carried).
      if (isMarkedOnCalendarDay(dateStr, type, key)) return;
      rows.push({
        type,
        key,
        label: taskLabelForCompletionRow(type, key),
        dateStr,
      });
    });
    return rows;
  }

  function syncCompletionTimeBatchSelectAll() {
    const selectAll = qs("completionTimeSelectAll");
    const ctx = completionTimeModalCtx;
    if (!selectAll || !ctx || !ctx.rows || !ctx.rows.length) return;
    const checks = ctx.rows.map((r) => r._check).filter(Boolean);
    const n = checks.filter((c) => c.checked).length;
    selectAll.checked = n > 0 && n === checks.length;
    selectAll.indeterminate = n > 0 && n < checks.length;
  }

  function applyBatchCompletionTimeToSelected() {
    const ctx = completionTimeModalCtx;
    if (!ctx || !ctx.rows) return;
    const batchInput = qs("completionTimeBatchInput");
    const value = batchInput ? batchInput.value : defaultCompletionTimeValue();
    let applied = 0;
    ctx.rows.forEach((row) => {
      if (!row._check || !row._check.checked) return;
      if (row._input) row._input.value = value;
      applied++;
    });
    if (!applied) {
      alert("Select one or more tasks first, then Apply to selected.");
    }
  }

  function openCompletionTimeModal(ctx) {
    completionTimeModalCtx = ctx;
    const list = qs("completionTimeModalList");
    const title = qs("completionTimeModalTitle");
    const desc = qs("completionTimeModalDesc");
    const batchBar = qs("completionTimeBatchBar");
    const selectAll = qs("completionTimeSelectAll");
    const batchInput = qs("completionTimeBatchInput");
    const confirmBtn = qs("completionTimeModalConfirm");
    if (!list) return;
    list.innerHTML = "";
    const def = defaultCompletionTimeValue();
    const isDupes = ctx.mode === "debug-dupes";
    const isUnlockEdit = ctx.mode === "debug-before-unlock";
    const isTimeDateFix = ctx.mode === "debug-time-date-fix";
    if (title) {
      title.textContent = isDupes
        ? "Resolve duplicate times"
        : isTimeDateFix
          ? "Fix times & dates"
          : isUnlockEdit
            ? "Edit unlock-error dates"
            : ctx.mode === "debug"
              ? "Fill missing times"
              : "Completion time";
    }
    if (desc) {
      desc.textContent = isDupes
        ? "These tasks have more than one finish timestamp in the same cycle. Pick which one to keep; the others are removed. Calendar marks and tallies stay unchanged."
        : isTimeDateFix
          ? "Update finish date/time, pick which duplicate to keep, or Drop a cycle so it counts as skipped. Tallies rebuild after Save."
          : isUnlockEdit
            ? "These finishes are before the task unlock window. Date/time default to unlock. Tallies stay unchanged. If unlock days were set by mistake, clear them on the task in Games instead."
            : ctx.mode === "debug"
              ? "These calendar marks have no finish time. Enter times individually, or select several and use Batch → Apply to selected."
              : "When did you finish each newly completed task on " +
                (typeof formatDate === "function" ? formatDate(ctx.dateStr) : ctx.dateStr) +
                "? Select several to set the same time in one step.";
    }
    if (confirmBtn) {
      confirmBtn.textContent = isDupes
        ? "Keep selected"
        : isTimeDateFix
          ? "Apply fixes"
          : isUnlockEdit
            ? "Save dates"
            : "Save times";
    }
    if (batchBar) {
      batchBar.hidden = !!(isDupes || isUnlockEdit || isTimeDateFix || !(ctx.rows && ctx.rows.length));
      if (isTimeDateFix || isDupes || isUnlockEdit) batchBar.setAttribute("hidden", "");
    }
    if (batchInput) batchInput.value = def;
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }

    if (isDupes) {
      (ctx.groups || []).forEach((group, gIdx) => {
        const block = document.createElement("div");
        block.className = "completion-time-dupe-group";
        const head = document.createElement("div");
        head.className = "completion-time-dupe-head";
        head.textContent = group.label;
        const meta = document.createElement("div");
        meta.className = "completion-time-dupe-meta";
        meta.textContent =
          (group.type === "dailies" ? "Day " : "Cycle ") +
          group.cycleStart +
          (group.type ? " · " + group.type : "");
        block.appendChild(head);
        block.appendChild(meta);
        const radios = [];
        const stamps = group.stamps || [];
        const defaultIdx = Math.max(0, stamps.length - 1);
        stamps.forEach((stamp, sIdx) => {
          const opt = document.createElement("label");
          opt.className = "completion-time-dupe-option";
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = "completionTimeDupe_" + gIdx;
          radio.value = String(sIdx);
          radio.checked = sIdx === defaultIdx;
          radio.dataset.dateStr = stamp.dateStr;
          radio.dataset.hour = String(Number(stamp.hour) || 0);
          radio.dataset.minute = String(Number(stamp.minute) || 0);
          const text = document.createElement("span");
          const timeLabel =
            typeof formatTimeOnly === "function"
              ? formatTimeOnly(Number(stamp.hour) || 0, Number(stamp.minute) || 0)
              : String(stamp.hour) + ":" + String(stamp.minute || 0).padStart(2, "0");
          const dateLabel =
            typeof formatDate === "function" ? formatDate(stamp.dateStr) : stamp.dateStr;
          text.textContent = dateLabel + " · " + timeLabel;
          opt.appendChild(radio);
          opt.appendChild(text);
          block.appendChild(opt);
          radios.push(radio);
        });
        list.appendChild(block);
        group._radios = radios;
      });
      setCompletionTimeModalOpen(true);
      return;
    }

    if (isUnlockEdit) {
      (ctx.rows || []).forEach((row, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "completion-time-row completion-time-row-unlock-edit";
        const lab = document.createElement("div");
        lab.className = "completion-time-row-label";
        lab.textContent = row.label;
        const meta = document.createElement("div");
        meta.className = "completion-time-row-meta";
        meta.textContent =
          "Cycle " +
          row.cycleStart +
          " · unlock " +
          (row.unlockDate || row.suggestedDateStr || "—") +
          (row.unlockHour != null
            ? " " +
              (typeof timeToStr === "function"
                ? timeToStr(row.unlockHour, row.unlockMinute || 0)
                : String(row.unlockHour).padStart(2, "0") +
                  ":" +
                  String(row.unlockMinute || 0).padStart(2, "0"))
            : "") +
          (row.type ? " · " + row.type : "") +
          (row.dateStr
            ? " · was " +
              row.dateStr +
              (row.hour != null
                ? " " +
                  (typeof timeToStr === "function"
                    ? timeToStr(row.hour, row.minute || 0)
                    : String(row.hour).padStart(2, "0") + ":" + String(row.minute || 0).padStart(2, "0"))
                : "")
            : "");
        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.id = "completionUnlockDate_" + idx;
        dateInput.className = "settings-input";
        dateInput.value = row.suggestedDateStr || row.unlockDate || row.dateStr || "";
        dateInput.min = row.cycleStart || "";
        const timeInput = document.createElement("input");
        timeInput.type = "time";
        timeInput.id = "completionUnlockTime_" + idx;
        timeInput.className = "settings-input";
        const h = Number.isFinite(Number(row.suggestedHour))
          ? Number(row.suggestedHour)
          : Number.isFinite(Number(row.unlockHour))
            ? Number(row.unlockHour)
            : Number.isFinite(Number(row.hour))
              ? Number(row.hour)
              : Number(def.slice(0, 2)) || 12;
        const m = Number.isFinite(Number(row.suggestedMinute))
          ? Number(row.suggestedMinute)
          : Number.isFinite(Number(row.unlockMinute))
            ? Number(row.unlockMinute)
            : Number.isFinite(Number(row.minute))
              ? Number(row.minute)
              : Number(def.slice(3, 5)) || 0;
        timeInput.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
        wrap.appendChild(lab);
        wrap.appendChild(dateInput);
        wrap.appendChild(timeInput);
        wrap.appendChild(meta);
        list.appendChild(wrap);
        row._dateInput = dateInput;
        row._input = timeInput;
      });
      setCompletionTimeModalOpen(true);
      return;
    }

    if (isTimeDateFix) {
      (ctx.rows || []).forEach((row, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "completion-time-row completion-time-row-unlock-edit";
        const lab = document.createElement("div");
        lab.className = "completion-time-row-label";
        lab.textContent = (row.label || "") + " · " + (row.kind || "");
        const meta = document.createElement("div");
        meta.className = "completion-time-row-meta";
        meta.textContent =
          (row.message || "") +
          (row.cycleStart ? " · cycle " + row.cycleStart : "") +
          (row.type ? " · " + row.type : "");

        const action = document.createElement("select");
        action.className = "settings-select";
        action.setAttribute("aria-label", "Action for " + (row.label || "item"));
        [
          ["set", "Update finish"],
          ["drop", "Drop (count as skip)"],
        ].forEach(([val, text]) => {
          const opt = document.createElement("option");
          opt.value = val;
          opt.textContent = text;
          action.appendChild(opt);
        });

        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.className = "settings-input";
        dateInput.value = row.suggestedDateStr || row.dateStr || row.cycleStart || "";

        const timeInput = document.createElement("input");
        timeInput.type = "time";
        timeInput.className = "settings-input";
        const h = Number.isFinite(Number(row.suggestedHour))
          ? Number(row.suggestedHour)
          : Number.isFinite(Number(row.hour))
            ? Number(row.hour)
            : Number(def.slice(0, 2)) || 12;
        const m = Number.isFinite(Number(row.suggestedMinute))
          ? Number(row.suggestedMinute)
          : Number.isFinite(Number(row.minute))
            ? Number(row.minute)
            : Number(def.slice(3, 5)) || 0;
        timeInput.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");

        const syncActionUi = () => {
          const dropping = action.value === "drop";
          dateInput.disabled = dropping;
          timeInput.disabled = dropping;
          if (row._dupeRadios) row._dupeRadios.forEach((r) => { r.disabled = dropping; });
        };
        action.addEventListener("change", syncActionUi);

        wrap.appendChild(lab);
        wrap.appendChild(action);
        wrap.appendChild(dateInput);
        wrap.appendChild(timeInput);
        wrap.appendChild(meta);

        if (row.kind === "duplicate-timestamps" && Array.isArray(row.stamps) && row.stamps.length) {
          const dupeWrap = document.createElement("div");
          dupeWrap.className = "completion-time-dupe-group";
          const hint = document.createElement("div");
          hint.className = "completion-time-dupe-meta";
          hint.textContent =
            "Pick one finish to keep. All other timestamps in this cycle are deleted (no new stamp is added).";
          dupeWrap.appendChild(hint);
          const radios = [];
          row.stamps.forEach((stamp, sIdx) => {
            const opt = document.createElement("label");
            opt.className = "completion-time-dupe-option";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "fixTimeDupe_" + idx;
            radio.checked = sIdx === row.stamps.length - 1;
            radio.dataset.dateStr = stamp.dateStr;
            radio.dataset.hour = String(Number(stamp.hour) || 0);
            radio.dataset.minute = String(Number(stamp.minute) || 0);
            radio.addEventListener("change", () => {
              if (!radio.checked) return;
              dateInput.value = stamp.dateStr || dateInput.value;
              timeInput.value =
                String(Number(stamp.hour) || 0).padStart(2, "0") +
                ":" +
                String(Number(stamp.minute) || 0).padStart(2, "0");
            });
            const text = document.createElement("span");
            const timeLabel =
              typeof formatTimeOnly === "function"
                ? formatTimeOnly(Number(stamp.hour) || 0, Number(stamp.minute) || 0)
                : String(stamp.hour) + ":" + String(stamp.minute || 0).padStart(2, "0");
            const dateLabel =
              typeof formatDate === "function" ? formatDate(stamp.dateStr) : stamp.dateStr;
            text.textContent = "Keep " + dateLabel + " · " + timeLabel;
            opt.appendChild(radio);
            opt.appendChild(text);
            dupeWrap.appendChild(opt);
            radios.push(radio);
          });
          wrap.appendChild(dupeWrap);
          row._dupeRadios = radios;
          const last = row.stamps[row.stamps.length - 1];
          if (last) {
            dateInput.value = last.dateStr || dateInput.value;
            timeInput.value =
              String(Number(last.hour) || 0).padStart(2, "0") +
              ":" +
              String(Number(last.minute) || 0).padStart(2, "0");
          }
        }

        list.appendChild(wrap);
        row._actionSelect = action;
        row._dateInput = dateInput;
        row._input = timeInput;
        syncActionUi();
      });
      setCompletionTimeModalOpen(true);
      return;
    }

    (ctx.rows || []).forEach((row, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "completion-time-row";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "completion-time-row-check";
      check.id = "completionTimeSelect_" + idx;
      check.setAttribute("aria-label", "Select " + (row.label || "task") + " for batch time");
      check.addEventListener("change", () => {
        wrap.classList.toggle("is-batch-selected", check.checked);
        syncCompletionTimeBatchSelectAll();
      });
      const lab = document.createElement("label");
      lab.className = "completion-time-row-label";
      lab.htmlFor = "completionTimeInput_" + idx;
      lab.textContent = row.label;
      const meta = document.createElement("div");
      meta.className = "completion-time-row-meta";
      meta.textContent = row.dateStr + (row.type ? " · " + row.type : "");
      const input = document.createElement("input");
      input.type = "time";
      input.id = "completionTimeInput_" + idx;
      input.className = "settings-input";
      input.value = def;
      input.dataset.idx = String(idx);
      wrap.appendChild(check);
      wrap.appendChild(lab);
      wrap.appendChild(input);
      wrap.appendChild(meta);
      list.appendChild(wrap);
      row._input = input;
      row._check = check;
    });
    setCompletionTimeModalOpen(true);
  }

  function closeCompletionTimeModal() {
    completionTimeModalCtx = null;
    setCompletionTimeModalOpen(false);
  }

  function confirmCompletionTimeModal() {
    const ctx = completionTimeModalCtx;
    if (!ctx) return;
    if (ctx.mode === "debug-dupes") {
      const choices = (ctx.groups || []).map((group) => {
        const radios = group._radios || [];
        let picked = radios.find((r) => r.checked);
        if (!picked) picked = radios[radios.length - 1] || radios[0];
        const keep = picked
          ? {
              dateStr: picked.dataset.dateStr,
              hour: Number(picked.dataset.hour) || 0,
              minute: Number(picked.dataset.minute) || 0,
            }
          : null;
        return {
          type: group.type,
          gameId: group.gameId,
          taskId: group.taskId,
          cycleStart: group.cycleStart,
          keep,
        };
      });
      closeCompletionTimeModal();
      const result =
        typeof resolveDuplicateCompletionTimestamps === "function"
          ? resolveDuplicateCompletionTimestamps(choices)
          : { ok: false, removed: 0, resolved: 0 };
      const report = qs("settingsDebugReport");
      if (report) {
        const lines = [];
        lines.push("Resolve duplicate times");
        lines.push("Groups resolved: " + (result.resolved || 0));
        lines.push("Timestamps removed: " + (result.removed || 0));
        lines.push("");
        if (result.after && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(result.after));
        } else if (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(scanDataConflicts()));
        }
        report.textContent = lines.join("\n");
      }
      if (typeof syncSettingsUI === "function") syncSettingsUI();
      return;
    }
    if (ctx.mode === "debug-before-unlock") {
      const edits = (ctx.rows || []).map((row) => {
        const parsed = parseTimeInputValue(row._input && row._input.value);
        const newDateStr = (row._dateInput && row._dateInput.value) || row.suggestedDateStr || row.dateStr;
        return {
          type: row.type,
          gameId: row.gameId,
          taskId: row.taskId,
          cycleStart: row.cycleStart,
          newDateStr,
          hour: parsed.hour,
          minute: parsed.minute,
        };
      });
      closeCompletionTimeModal();
      const result =
        typeof applyDebugBeforeUnlockEdits === "function"
          ? applyDebugBeforeUnlockEdits(edits)
          : { ok: false, updated: 0 };
      const report = qs("settingsDebugReport");
      if (report) {
        const lines = [];
        lines.push("Edit unlock-error dates");
        lines.push("Cycles updated: " + (result.updated || 0));
        lines.push("");
        if (result.after && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(result.after));
        } else if (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(scanDataConflicts()));
        }
        report.textContent = lines.join("\n");
      }
      if (typeof syncSettingsUI === "function") syncSettingsUI();
      return;
    }
    if (ctx.mode === "debug-time-date-fix") {
      const edits = (ctx.rows || []).map((row) => {
        const action = (row._actionSelect && row._actionSelect.value) || "set";
        const parsed = parseTimeInputValue(row._input && row._input.value);
        const newDateStr = (row._dateInput && row._dateInput.value) || row.suggestedDateStr || row.dateStr;
        let keep = null;
        if (row.kind === "duplicate-timestamps" && row._dupeRadios) {
          const picked = row._dupeRadios.find((r) => r.checked) || row._dupeRadios[row._dupeRadios.length - 1];
          if (picked) {
            keep = {
              dateStr: picked.dataset.dateStr,
              hour: Number(picked.dataset.hour) || 0,
              minute: Number(picked.dataset.minute) || 0,
            };
          }
        }
        return {
          kind: row.kind,
          type: row.type,
          gameId: row.gameId,
          taskId: row.taskId,
          cycleStart: row.cycleStart,
          action,
          newDateStr: keep ? keep.dateStr : newDateStr,
          hour: keep ? keep.hour : parsed.hour,
          minute: keep ? keep.minute : parsed.minute,
          keep,
        };
      });
      closeCompletionTimeModal();
      const result =
        typeof applyDebugTimeDateFixes === "function"
          ? applyDebugTimeDateFixes(edits)
          : { ok: false, updated: 0, dropped: 0 };
      const report = qs("settingsDebugReport");
      if (report) {
        const lines = [];
        lines.push("Fix times & dates");
        lines.push("Updated: " + (result.updated || 0) + "  ·  Dropped: " + (result.dropped || 0));
        lines.push("");
        if (result.after && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(result.after));
        } else if (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(scanDataConflicts()));
        }
        report.textContent = lines.join("\n");
      }
      if (typeof syncSettingsUI === "function") syncSettingsUI();
      return;
    }
    const timesByKey = {};
    (ctx.rows || []).forEach((row) => {
      const parsed = parseTimeInputValue(row._input && row._input.value);
      timesByKey[row.type + "|" + row.key] = parsed;
      row.hour = parsed.hour;
      row.minute = parsed.minute;
    });
    if (ctx.mode === "debug") {
      const entries = (ctx.rows || []).map((row) => ({
        type: row.type,
        key: row.key,
        dateStr: row.dateStr,
        hour: row.hour,
        minute: row.minute,
      }));
      closeCompletionTimeModal();
      const result =
        typeof fillMissingCompletionTimes === "function"
          ? fillMissingCompletionTimes(entries)
          : { ok: false, added: 0 };
      const report = qs("settingsDebugReport");
      if (report) {
        const lines = [];
        lines.push("Fill missing times");
        lines.push("Added: " + (result.added || 0) + " timestamp(s)");
        lines.push("");
        if (result.after && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(result.after));
        } else if (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(scanDataConflicts()));
        }
        report.textContent = lines.join("\n");
      }
      if (typeof syncSettingsUI === "function") syncSettingsUI();
      return;
    }

    // Calendar save path
    const dateStr = ctx.dateStr;
    const checkboxes = ctx.checkboxes;
    const currencyMap = ctx.currencyMap || null;
    closeCompletionTimeModal();
    applyCalendarDayModalSave(dateStr, checkboxes, currencyMap, timesByKey);
  }

  function openCalendarDayModal(dateStr) {
    calendarDayModal.dateStr = dateStr;
    const titleEl = qs("calendarDayModalTitle");
    if (titleEl) titleEl.textContent = "Edit " + (typeof formatDate === "function" ? formatDate(dateStr) : dateStr);
    const container = qs("calendarDayModalTasks");
    if (!container) return;
    container.innerHTML = "";
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const available = getTasksAvailableOnDate(dateStr);
    const checkboxes = [];
    let anyCarried = false;
    const addTask = (item, type) => {
      // Checkbox must match the calendar D/W/E bar: marked on THIS day only.
      // (Endgame used to use cycle-wide completion, so later finishes looked done on earlier days.)
      const onThisDay =
        type === "dailies"
          ? (dayData.dailies || []).includes(item.key)
          : type === "weeklies"
            ? (dayData.weeklies || []).includes(item.key)
            : (dayData.endgame || []).includes(item.key);
      const cycleFinish =
        (type === "weeklies" || type === "endgame") && typeof getCompletionDateInCycle === "function"
          ? getCompletionDateInCycle(item.key, type, dateStr)
          : null;
      const carried =
        !!onThisDay &&
        (type === "weeklies" || type === "endgame") &&
        typeof isCarriedCompletionMark === "function" &&
        isCarriedCompletionMark(type, item.key, dateStr);
      const finishedLater = !onThisDay && !!cycleFinish && cycleFinish > dateStr;
      const finishedEarlierUnmarked = !onThisDay && !!cycleFinish && cycleFinish < dateStr;
      if (carried) anyCarried = true;
      const label = document.createElement("label");
      label.className =
        "calendar-day-modal-task calendar-day-modal-task-" +
        type +
        (carried ? " calendar-day-modal-task-carried" : "") +
        (finishedLater || finishedEarlierUnmarked ? " calendar-day-modal-task-elsewhere" : "");
      if (carried) {
        label.title = "Carried: finished earlier in this cycle (fill-remaining). Uncheck to clear the cycle.";
      } else if (finishedLater) {
        label.title = "Finished later in this cycle (" + cycleFinish + "). Not marked on this day.";
      } else if (finishedEarlierUnmarked) {
        label.title = "Finished earlier in this cycle (" + cycleFinish + "), but this day has no fill mark.";
      }
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = onThisDay;
      check.dataset.type = type;
      check.dataset.key = item.key;
      label.appendChild(check);
      const span = document.createElement("span");
      span.appendChild(document.createTextNode(labelAfterDash(item.label)));
      if (carried) {
        const tag = document.createElement("span");
        tag.className = "calendar-day-modal-carried-tag";
        tag.textContent = " (carried)";
        span.appendChild(tag);
      } else if (finishedLater) {
        const tag = document.createElement("span");
        tag.className = "calendar-day-modal-elsewhere-tag";
        tag.textContent = " (finished later)";
        span.appendChild(tag);
      } else if (finishedEarlierUnmarked) {
        const tag = document.createElement("span");
        tag.className = "calendar-day-modal-elsewhere-tag";
        tag.textContent = " (finished earlier)";
        span.appendChild(tag);
      }
      label.appendChild(span);
      container.appendChild(label);
      checkboxes.push({ check, type, key: item.key });
    };
    available.dailies.forEach((item) => addTask(item, "dailies"));
    available.weeklies.forEach((item) => addTask(item, "weeklies"));
    available.endgame.forEach((item) => addTask(item, "endgame"));
    if (container.children.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No tasks available for this day.";
      container.appendChild(p);
    } else if (anyCarried) {
      const hint = document.createElement("p");
      hint.className = "calendar-day-modal-carried-hint";
      hint.textContent =
        "Carried = finished earlier in this cycle; later days stay marked (fill-remaining). The E/W bars count marks on this day only — tasks finished later stay unchecked here.";
      container.insertBefore(hint, container.firstChild);
    }
    calendarDayModal.checkboxes = checkboxes;
    setCalendarDayModalOpen(true);
  }

  let earningsModal = { gameId: null, task: null, taskType: null };

  function formatHistoryCycleDateRange(periodStart, periodEnd) {
    return getDateStr(periodStart) + " — " + getDateStr(periodEnd);
  }

  function appendEarningsMaxLabel(parent, maxValue) {
    const maxSpan = document.createElement("span");
    maxSpan.className = "earnings-modal-max";
    maxSpan.textContent = "Max: " + maxValue;
    parent.appendChild(maxSpan);
  }

  function createTaskCurrencyInfoIcon(taskType) {
    const infoIcon = document.createElement("span");
    infoIcon.className = "currency-info-icon";
    infoIcon.setAttribute("aria-label", "More information");
    infoIcon.textContent = "ⓘ";
    if (taskType === "endgame") {
      infoIcon.title = "Maximum currency earnable per cycle. Changing this only affects new cycles—the max for past cycles is saved when each cycle is attempted or completed, so your Data page history stays accurate.";
    } else {
      infoIcon.title = "Maximum currency earnable when this weekly is completed. Changing this updates the potential cap shown on the Data page for all cycles.";
    }
    return infoIcon;
  }

  function setEarningsModalSkippedLayout(hasSkipped) {
    const columns = qs("earningsModalColumns");
    if (columns) columns.classList.toggle("has-skipped", !!hasSkipped);
    const skippedSection = qs("earningsModalSkippedSection");
    if (skippedSection) skippedSection.hidden = !hasSkipped;
  }

  function populateWeeklyEarningsModal(gameId, task, listEl, skippedSection, skippedListEl) {
    const game = getGame(gameId);
    const key = gameId + "." + (task.id || task.label);
    const history = game ? getTaskTallyHistory(game, "weeklies", key) : [];
    const pot = getWeeklyPotential(task);
    const now = getSimulatedNow();
    const completedPeriods = history.filter((p) => p.completed > 0);

    listEl.innerHTML = "";
    if (completedPeriods.length === 0) {
      const empty = document.createElement("p");
      empty.className = "earnings-modal-empty";
      empty.textContent = history.length === 0
        ? "No cycles yet. Complete this task to add history."
        : "No completed cycles yet.";
      listEl.appendChild(empty);
    } else {
      let completionNum = 0;
      history.forEach((period) => {
        if (period.completed === 0) return;
        completionNum += 1;
        const item = document.createElement("div");
        item.className = "earnings-modal-item";
        const dateRow = document.createElement("div");
        dateRow.className = "earnings-modal-date-row";
        const dateDisplay = document.createElement("span");
        dateDisplay.className = "earnings-modal-date-display";
        dateDisplay.textContent = "Completion " + completionNum + ": " + formatHistoryCycleDateRange(period.periodStart, period.periodEnd);
        dateRow.appendChild(dateDisplay);
        item.appendChild(dateRow);

        const earnRow = document.createElement("div");
        earnRow.className = "earnings-modal-earn-row";
        earnRow.innerHTML = "<label>Earned:</label>";
        const earnVal = document.createElement("span");
        earnVal.className = "earnings-modal-earn-value";
        earnVal.textContent = String(pot);
        earnRow.appendChild(earnVal);
        appendEarningsMaxLabel(earnRow, pot);
        item.appendChild(earnRow);
        listEl.appendChild(item);
      });
    }

    const skipped = history.filter((p) => p.completed === 0 && p.periodEnd.getTime() <= now.getTime());
    if (skippedListEl) {
      skippedListEl.innerHTML = "";
      if (skipped.length === 0) {
        setEarningsModalSkippedLayout(false);
      } else {
        setEarningsModalSkippedLayout(true);
        skipped.forEach((period) => {
          const item = document.createElement("div");
          item.className = "earnings-modal-skipped-item";
          item.textContent = formatHistoryCycleDateRange(period.periodStart, period.periodEnd) + " (skipped) · Max: " + pot;
          skippedListEl.appendChild(item);
        });
      }
    }
  }

  function openEarningsModal(gameId, task, taskType) {
    const type = taskType === "weeklies" ? "weeklies" : "endgame";
    earningsModal.gameId = gameId;
    earningsModal.task = task;
    earningsModal.taskType = type;

    const titleEl = qs("earningsModalTitle");
    if (titleEl) titleEl.textContent = "Completion History — " + (task.label || "Task");

    const listEl = qs("earningsModalList");
    const skippedSection = qs("earningsModalSkippedSection");
    const skippedListEl = qs("earningsModalSkippedList");
    if (!listEl) return;
    setEarningsModalSkippedLayout(false);

    if (type === "weeklies") {
      populateWeeklyEarningsModal(gameId, task, listEl, skippedSection, skippedListEl);
      const modalEl = qs("earningsModal");
      if (modalEl) {
        modalEl.hidden = false;
        modalEl.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        activateModalFocus(modalEl);
      }
      return;
    }

    const key = gameId + "." + (task.id || task.label);
    const completedCount = getCompletedAmount(state.endgameCompleted, key);
    ensureEndgameEarnedArrayLength(gameId, task.id || task.label, completedCount);
    const earnedArr = getEndgameEarnedPerCompletion(gameId, task.id || task.label);
    const game = getGame(gameId);
    const completedEntries = game ? getEndgameCompletedPeriodsFromCalendar(game, task, key) : [];
    const endgameHistory = game ? getTaskTallyHistory(game, "endgame", key) : [];

    listEl.innerHTML = "";

    if (completedEntries.length === 0 && earnedArr.length === 0) {
      const empty = document.createElement("p");
      empty.className = "earnings-modal-empty";
      empty.textContent = "No completions yet. Complete this task to add earnings.";
      listEl.appendChild(empty);
    } else {
      completedEntries.forEach((entry, i) => {
        const completionNum = i + 1;
        const startVal = entry.range.start;
        const endVal = entry.range.end;
        const dateLabel = startVal && endVal ? startVal + " — " + endVal : "(Start - End)";

        const item = document.createElement("div");
        item.className = "earnings-modal-item";
        const dateRow = document.createElement("div");
        dateRow.className = "earnings-modal-date-row";
        const dateDisplay = document.createElement("span");
        dateDisplay.className = "earnings-modal-date-display";
        dateDisplay.textContent = "Completion " + completionNum + ": " + dateLabel;
        dateRow.appendChild(dateDisplay);
        const startInput = document.createElement("input");
        startInput.type = "date";
        startInput.placeholder = "Start";
        startInput.value = startVal;
        startInput.title = "Start date";
        const endInput = document.createElement("input");
        endInput.type = "date";
        endInput.placeholder = "End";
        endInput.value = endVal;
        endInput.title = "End date";
        const dateEditWrap = document.createElement("div");
        dateEditWrap.className = "earnings-modal-date-edit";
        dateEditWrap.appendChild(startInput);
        dateEditWrap.appendChild(document.createTextNode(" — "));
        dateEditWrap.appendChild(endInput);
        const updateDateDisplay = () => {
          const s = startInput.value || "";
          const e = endInput.value || "";
          dateDisplay.textContent = "Completion " + completionNum + ": " + (s && e ? s + " — " + e : "(Start - End)");
          setEndgameCompletionDate(gameId, task.id || task.label, i, s, e);
        };
        startInput.addEventListener("change", updateDateDisplay);
        endInput.addEventListener("change", updateDateDisplay);
        dateRow.appendChild(dateEditWrap);
        item.appendChild(dateRow);

        const earnRow = document.createElement("div");
        earnRow.className = "earnings-modal-earn-row";
        earnRow.innerHTML = "<label>Earned:</label>";
        const earnInput = document.createElement("input");
        earnInput.type = "number";
        earnInput.min = "0";
        earnInput.placeholder = "0";
        earnInput.value = String(earnedArr[i] || 0);
        earnInput.addEventListener("change", () => setEndgameEarnedAt(gameId, task.id || task.label, i, earnInput.value));
        earnRow.appendChild(earnInput);
        const historyIdx = endgameHistory.findIndex((p) => p.periodStart.getTime() === entry.period.periodStart.getTime());
        const maxPot = historyIdx >= 0
          ? getEndgamePotentialAtCycle(gameId, task.id || task.label, task, historyIdx)
          : getEndgamePotential(task);
        appendEarningsMaxLabel(earnRow, maxPot);
        item.appendChild(earnRow);
        listEl.appendChild(item);
      });
    }

    const skippedCycles = getEndgameSkippedCycles(key);
    if (skippedListEl) {
      skippedListEl.innerHTML = "";
      if (skippedCycles.length === 0) {
        setEarningsModalSkippedLayout(false);
      } else {
        setEarningsModalSkippedLayout(true);
        skippedCycles.forEach((s) => {
          const idx = endgameHistory.findIndex((p) => p.periodStart.getTime() === s.periodStart.getTime());
          const maxPot = idx >= 0
            ? getEndgamePotentialAtCycle(gameId, task.id || task.label, task, idx)
            : getEndgamePotential(task);
          const item = document.createElement("div");
          item.className = "earnings-modal-skipped-item";
          item.textContent = s.startStr + " — " + s.endStr + " (skipped) · Max: " + maxPot;
          skippedListEl.appendChild(item);
        });
      }
    }

    const modalEl = qs("earningsModal");
    if (modalEl) {
      modalEl.hidden = false;
      modalEl.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      activateModalFocus(modalEl);
    }
  }

  function closeEarningsModal() {
    earningsModal.gameId = null;
    earningsModal.task = null;
    earningsModal.taskType = null;
    const modalEl = qs("earningsModal");
    if (modalEl) {
      modalEl.hidden = true;
      modalEl.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }

  let endgameCompleteModalCtx = null;

  function setEndgameCompleteModalOpen(open) {
    const el = qs("endgameCompleteModal");
    if (!el) return;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      document.body.style.overflow = "hidden";
      activateModalFocus(el);
    } else {
      if (!calendarDayModal.open) {
        const ex = qs("extracurricularCompleteModal");
        if (!ex || ex.hidden) document.body.style.overflow = "";
      }
      deactivateModalFocus();
    }
  }

  function populateEndgameCompleteModal(gameId, taskId) {
    const game = getGame(gameId);
    const task = game && (game.endgame || []).find((t) => (t.id || t.label) === taskId);
    const titleEl = qs("endgameCompleteModalTitle");
    const descEl = qs("endgameCompleteModalDesc");
    const input = qs("endgameCompleteCurrencyInput");
    if (!task || !input) return;
    const key = gameId + "." + taskId;
    syncEndgamePendingForKey(key, game, task);
    const prefill = getEndgamePendingAmount(key, game, task);
    if (titleEl) {
      titleEl.textContent = "Currency earned";
      titleEl.dataset.gameId = gameId;
      titleEl.dataset.taskId = taskId;
    }
    if (descEl) {
      const cur = getCurrencyLabel(game);
      descEl.textContent = (task.label || "Endgame") + " — How much " + cur + " did you earn for completing this cycle?";
    }
    const completedCount = getCompletedAmount(state.endgameCompleted, key);
    const earnedArr = getEndgameEarnedPerCompletion(gameId, taskId);
    const pastWrap = qs("endgameCompletePastWrap");
    const pastSummary = qs("endgameCompletePastSummary");
    const pastList = qs("endgameCompletePastList");
    const pastToggle = qs("endgameCompletePastToggle");
    const samePastBtn = qs("endgameCompleteSameAsPastBtn");
    const curLabel = getCurrencyLabel(game);
    const lastPastAmount = completedCount > 0 ? (Number(earnedArr[completedCount - 1]) || 0) : 0;
    if (pastSummary) {
      if (completedCount > 0) {
        pastSummary.textContent = "Last completion earned: " + lastPastAmount + " " + curLabel + ".";
      } else {
        pastSummary.textContent = "No prior completions recorded for this task.";
      }
    }
    if (pastList) {
      pastList.innerHTML = "";
      for (let i = 0; i < completedCount; i++) {
        const li = document.createElement("li");
        li.textContent = "Completion " + (i + 1) + ": " + (Number(earnedArr[i]) || 0) + " " + curLabel;
        pastList.appendChild(li);
      }
      pastList.hidden = true;
    }
    if (pastToggle) {
      if (completedCount >= 1) {
        pastToggle.hidden = false;
        pastToggle.textContent = "Show past earnings";
        pastToggle.setAttribute("aria-expanded", "false");
        pastToggle.title = "Show or hide earnings from each previous completion.";
        pastToggle.setAttribute("aria-label", "Show past earnings: list amounts from previous completions");
      } else {
        pastToggle.hidden = true;
      }
    }
    if (samePastBtn) {
      if (completedCount > 0) {
        samePastBtn.hidden = false;
        samePastBtn.textContent = "Same as past cycle (" + lastPastAmount + ")";
        samePastBtn.title = "Set amount to last completion's earnings (" + lastPastAmount + " " + curLabel + ").";
        samePastBtn.setAttribute("aria-label", "Same as past cycle: set to " + lastPastAmount + " " + curLabel);
      } else {
        samePastBtn.hidden = true;
      }
    }
    if (pastWrap) pastWrap.hidden = false;
    input.value = prefill > 0 ? String(prefill) : "";
    input.min = "0";
    input.placeholder = "0";
    const fullBtn = qs("endgameCompleteFullPotentialBtn");
    const pot = getEndgamePotential(task);
    if (fullBtn) {
      if (pot > 0) {
        fullBtn.hidden = false;
        const cur = getCurrencyLabel(game);
        fullBtn.textContent = "Earned full amount (" + pot + ")";
        fullBtn.title = "Set earned to this task's full potential (" + pot + " " + cur + ").";
        fullBtn.setAttribute("aria-label", "Earned full amount: set to " + pot + " " + cur);
      } else {
        fullBtn.hidden = true;
      }
    }
    setTimeout(() => input.focus(), 0);
  }

  function applyEndgameCompleteFullPotential() {
    const titleEl = qs("endgameCompleteModalTitle");
    const gameId = titleEl && titleEl.dataset.gameId;
    const taskId = titleEl && titleEl.dataset.taskId;
    if (!gameId || !taskId) return;
    const game = getGame(gameId);
    const task = game && (game.endgame || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return;
    const pot = getEndgamePotential(task);
    const input = qs("endgameCompleteCurrencyInput");
    if (input && pot > 0) input.value = String(pot);
  }

  function applyEndgameCompleteSameAsPastCycle() {
    const titleEl = qs("endgameCompleteModalTitle");
    const gameId = titleEl && titleEl.dataset.gameId;
    const taskId = titleEl && titleEl.dataset.taskId;
    if (!gameId || !taskId) return;
    const key = gameId + "." + taskId;
    const completedCount = getCompletedAmount(state.endgameCompleted, key);
    if (completedCount <= 0) return;
    const earnedArr = getEndgameEarnedPerCompletion(gameId, taskId);
    const lastPast = Number(earnedArr[completedCount - 1]) || 0;
    const input = qs("endgameCompleteCurrencyInput");
    if (input) input.value = String(lastPast);
  }

  /**
   * @param {string} gameId
   * @param {string} taskId
   * @param {null|{ dateStr: string, checkboxes: Array, dayData: object, newEndgameKeys: string[], currencyMap: object, idx: number }} calCtx
   */
  function openEndgameCompleteModal(gameId, taskId, calCtx) {
    endgameCompleteModalCtx = calCtx;
    populateEndgameCompleteModal(gameId, taskId);
    setEndgameCompleteModalOpen(true);
  }

  function closeEndgameCompleteModal() {
    endgameCompleteModalCtx = null;
    setEndgameCompleteModalOpen(false);
  }

  function setExtracurricularCompleteModalOpen(open) {
    const el = qs("extracurricularCompleteModal");
    if (!el) return;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      document.body.style.overflow = "hidden";
      activateModalFocus(el);
    } else {
      if (!calendarDayModal.open) {
        const eg = qs("endgameCompleteModal");
        if (!eg || eg.hidden) document.body.style.overflow = "";
      }
      deactivateModalFocus();
    }
  }

  function populateExtracurricularCompleteModal(taskId) {
    const tasks = state.extracurricularTasks || [];
    const task = tasks.find((t) => t.id === taskId);
    const titleEl = qs("extracurricularCompleteModalTitle");
    const descEl = qs("extracurricularCompleteModalDesc");
    const input = qs("extracurricularCompleteCurrencyInput");
    const fullBtn = qs("extracurricularCompleteFullPotentialBtn");
    if (!task || !input) return;
    const game = task.gameId ? getGame(task.gameId) : null;
    const curLabel = getCurrencyLabel(game);
    if (titleEl) {
      titleEl.textContent = "Currency earned";
      titleEl.dataset.taskId = taskId;
    }
    if (descEl) {
      descEl.textContent = (task.label || "Task") + " — How much " + curLabel + " did you earn for completing this task?";
    }
    const pot = Math.max(0, Number(task.currency) || 0);
    input.value = pot > 0 ? String(pot) : "";
    input.min = "0";
    input.placeholder = "0";
    if (fullBtn) {
      if (pot > 0) {
        fullBtn.hidden = false;
        fullBtn.textContent = "Earned full amount (" + pot + ")";
        fullBtn.title = "Set earned to the potential amount set on this task (" + pot + " " + curLabel + ").";
      } else {
        fullBtn.hidden = true;
      }
    }
    setTimeout(() => input.focus(), 0);
  }

  function openExtracurricularCompleteModal(taskId) {
    populateExtracurricularCompleteModal(taskId);
    setExtracurricularCompleteModalOpen(true);
  }

  function closeExtracurricularCompleteModal() {
    setExtracurricularCompleteModalOpen(false);
  }

  function confirmExtracurricularCompleteModal() {
    const titleEl = qs("extracurricularCompleteModalTitle");
    const taskId = titleEl && titleEl.dataset.taskId;
    const input = qs("extracurricularCompleteCurrencyInput");
    const raw = input && input.value !== undefined && input.value !== null ? input.value : "";
    const num = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
    if (!taskId) {
      closeExtracurricularCompleteModal();
      return;
    }
    closeExtracurricularCompleteModal();
    completeExtracurricularWithCurrency(taskId, num);
  }

  function applyExtracurricularCompleteFullPotential() {
    const titleEl = qs("extracurricularCompleteModalTitle");
    const taskId = titleEl && titleEl.dataset.taskId;
    const tasks = state.extracurricularTasks || [];
    const task = taskId && tasks.find((t) => t.id === taskId);
    if (!task) return;
    const pot = Math.max(0, Number(task.currency) || 0);
    const input = qs("extracurricularCompleteCurrencyInput");
    if (input && pot > 0) input.value = String(pot);
  }

  function confirmEndgameCompleteModal() {
    const input = qs("endgameCompleteCurrencyInput");
    const raw = input && input.value !== undefined && input.value !== null ? input.value : "";
    const num = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
    const ctx = endgameCompleteModalCtx;
    if (ctx) {
      const keys = ctx.newEndgameKeys;
      const idx = ctx.idx;
      const key = keys[idx];
      ctx.currencyMap[key] = num;
      if (idx + 1 < keys.length) {
        ctx.idx = idx + 1;
        const dot = keys[idx + 1].indexOf(".");
        const ngid = dot >= 0 ? keys[idx + 1].slice(0, dot) : keys[idx + 1];
        const ntid = dot >= 0 ? keys[idx + 1].slice(dot + 1) : "";
        populateEndgameCompleteModal(ngid, ntid);
        return;
      }
      const dateStr = ctx.dateStr;
      const checkboxes = ctx.checkboxes;
      const currencyMap = ctx.currencyMap;
      endgameCompleteModalCtx = null;
      setEndgameCompleteModalOpen(false);
      const timeRows = collectNewlyCompletedFromCalendar(dateStr, checkboxes);
      if (timeRows.length) {
        openCompletionTimeModal({
          mode: "calendar",
          dateStr,
          checkboxes,
          currencyMap,
          rows: timeRows,
        });
        return;
      }
      applyCalendarDayModalSave(dateStr, checkboxes, currencyMap, null);
      return;
    }
    const titleEl = qs("endgameCompleteModalTitle");
    let gameId = null;
    let taskId = null;
    if (titleEl && titleEl.dataset.gameId) {
      gameId = titleEl.dataset.gameId;
      taskId = titleEl.dataset.taskId || "";
    }
    if (!gameId || !taskId) {
      closeEndgameCompleteModal();
      return;
    }
    closeEndgameCompleteModal();
    completeEndgameWithCurrency(gameId, taskId, num);
  }

  function openEndgameCompleteModalForCalendar(dateStr, checkboxes, dayData, newEndgameKeys) {
    const firstKey = newEndgameKeys[0];
    const dot = firstKey.indexOf(".");
    const gameId = dot >= 0 ? firstKey.slice(0, dot) : firstKey;
    const taskId = dot >= 0 ? firstKey.slice(dot + 1) : "";
    const ctx = {
      dateStr,
      checkboxes,
      dayData,
      newEndgameKeys,
      currencyMap: {},
      idx: 0,
    };
    openEndgameCompleteModal(gameId, taskId, ctx);
  }

  function closeCalendarDayModal() {
    calendarDayModal.dateStr = null;
    calendarDayModal.checkboxes = null;
    setCalendarDayModalOpen(false);
  }

  function saveCalendarDayModal() {
    const dateStr = calendarDayModal.dateStr;
    const checkboxes = calendarDayModal.checkboxes || [];
    if (!dateStr) return;
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const newEndgameKeys = [];
    checkboxes.forEach(({ check, type, key }) => {
      if (type !== "endgame") return;
      // Currency prompt only when this day gains a new endgame mark (not carried/already marked).
      if (!isMarkedOnCalendarDay(dateStr, "endgame", key) && check.checked) newEndgameKeys.push(key);
    });
    if (newEndgameKeys.length > 0) {
      openEndgameCompleteModalForCalendar(dateStr, checkboxes, dayData, newEndgameKeys);
      return;
    }
    const timeRows = collectNewlyCompletedFromCalendar(dateStr, checkboxes);
    if (timeRows.length) {
      openCompletionTimeModal({
        mode: "calendar",
        dateStr,
        checkboxes,
        currencyMap: null,
        rows: timeRows,
      });
      return;
    }
    applyCalendarDayModalSave(dateStr, checkboxes, null, null);
  }

  /**
   * @param {null|Object<string, number>} endgameCurrencyOverrides
   * @param {null|Object<string, {hour:number, minute:number}>} completionTimesByTypeKey — key = "type|key"
   */
  function applyCalendarDayModalSave(dateStr, checkboxes, endgameCurrencyOverrides, completionTimesByTypeKey) {
    const blocked = [];
    const times = completionTimesByTypeKey || {};
    checkboxes.forEach(({ check, type, key }) => {
      // Compare against this day's calendar marks so Save on a pre-finish day
      // does not wipe a cycle that was completed later.
      const wasCompleted = isMarkedOnCalendarDay(dateStr, type, key);
      const nowCompleted = check.checked;
      if (wasCompleted === nowCompleted) return;

      if (nowCompleted) {
        const currencyValue =
          type === "endgame" && endgameCurrencyOverrides && endgameCurrencyOverrides[key] !== undefined
            ? endgameCurrencyOverrides[key]
            : undefined;
        const t = times[type + "|" + key];
        const result = applyTaskCompletion(type, key, {
          dateStr,
          currencyValue,
          hour: t ? t.hour : undefined,
          minute: t ? t.minute : undefined,
          save: false,
          render: false,
          processResets: false,
        });
        if (result && !result.ok) {
          check.checked = false;
          blocked.push(result.reason || key);
        }
      } else {
        removeTaskCompletion(type, key, {
          dateStr,
          save: false,
          render: false,
          processResets: false,
        });
      }
    });
    if (blocked.length) {
      alert("Some tasks are still locked:\n" + blocked.slice(0, 5).join("\n"));
    }
    processResets();
    save();
    renderActiveTab();
    closeCalendarDayModal();
  }

  function updateDaySelection(dayIndex) {
    taskModal.selectedDay = dayIndex;
    document.querySelectorAll(".task-menu-grid .day-cell").forEach((cell) => {
      const d = Number(cell.getAttribute("data-day"));
      cell.classList.toggle("active", d === dayIndex);
      cell.setAttribute("aria-pressed", d === dayIndex ? "true" : "false");
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
    });
  }

  function readCycleEndTimeFieldsFromModal(beginHour, beginMinute) {
    const sameToggle = qs("taskCycleEndTimeSameAsBegin");
    const endInput = qs("taskCycleEndTime");
    const sameAsBegin = !sameToggle || sameToggle.checked;
    if (sameAsBegin) {
      return { cycleEndTimeSameAsBegin: true };
    }
    const parts = parseTimeStr(endInput && endInput.value ? endInput.value : timeToStr(beginHour, beginMinute));
    return {
      cycleEndTimeSameAsBegin: false,
      cycleEndHour: parts.hour,
      cycleEndMinute: parts.minute,
    };
  }

  function updateTaskTimeRemainingDisplay() {
    if (!taskModal.open || (taskModal.taskType !== "weeklies" && taskModal.taskType !== "endgame")) return;
    const el = qs("taskTimeRemainingInput");
    if (!el) return;
    const dateInput = qs("taskDateStarted");
    const resetTime = qs("taskResetTime");
    const freqEvery = qs("taskFrequencyEvery");
    const limEvery = qs("taskTimeLimitEvery");
    const dstToggle = qs("taskAdjustForDST");
    const { hour, minute } = parseTimeStr(resetTime && resetTime.value ? resetTime.value : getDefaultTimeStr());
    const dateStarted = isValidDateStr(dateInput && dateInput.value) ? dateInput.value : getDateStr();
    const frequencyEvery = Math.max(1, Number(freqEvery && freqEvery.value) || 1);
    const timeLimitEvery = Math.max(1, Number(limEvery && limEvery.value) || 1);
    const adjustForDST = dstToggle ? dstToggle.checked : true;
    const tempTask = Object.assign(
      {
        dateStarted,
        weekStartDay: taskModal.selectedDay,
        weekStartHour: hour,
        weekStartMinute: minute,
        frequencyEvery,
        frequencyUnit: taskModal.frequencyUnit || "week",
        timeLimitEvery,
        timeLimitUnit: taskModal.timeLimitUnit || "week",
        adjustForDST,
      },
      readCycleEndTimeFieldsFromModal(hour, minute)
    );
    const game = taskModal.gameId ? getGame(taskModal.gameId) : null;
    const ms = taskModal.taskType === "weeklies"
      ? getWeeklyTimeRemainingMs(tempTask, null, game)
      : getEndgameTimeRemainingMs(tempTask, null, game);
    el.value = formatRemainingMs(ms);
  }

  function applyTaskTimeRemainingFromInput() {
    if (!taskModal.open || (taskModal.taskType !== "weeklies" && taskModal.taskType !== "endgame")) return;
    const input = qs("taskTimeRemainingInput");
    const dateInput = qs("taskDateStarted");
    const resetTime = qs("taskResetTime");
    const freqEvery = qs("taskFrequencyEvery");
    const limEvery = qs("taskTimeLimitEvery");
    if (!input || !dateInput || !resetTime) return;
    const remainingMs = parseTimeRemainingToMs(input.value.trim());
    if (remainingMs == null || remainingMs <= 0) return;
    const freqUnit = taskModal.frequencyUnit || "week";
    const limitUnit = taskModal.timeLimitUnit || "week";
    const periodMs = taskModal.taskType === "weeklies"
      ? 7 * 24 * 60 * 60 * 1000
      : getIntervalMs(Math.max(1, Number(limEvery && limEvery.value) || 1), limitUnit);
    const elapsedMs = Math.max(0, periodMs - remainingMs);
    const now = getSimulatedNow();
    const cycleStart = new Date(now.getTime() - elapsedMs);
    const tz = getRecordingTimezone();
    const parts = getDatePartsInTimezone(cycleStart, tz);
    const dateStr = parts.year + "-" + String(parts.month + 1).padStart(2, "0") + "-" + String(parts.day).padStart(2, "0");
    const timeStr = timeToStr(parts.hour, parts.minute);
    dateInput.value = dateStr;
    resetTime.value = timeStr;
    if (typeof syncTaskCycleEndTimeUI === "function") syncTaskCycleEndTimeUI();
    input.value = formatRemainingMs(remainingMs);
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    if (dayOfWeek >= 0) updateDaySelection(dayOfWeek);
  }

  function buildTempTaskFromModal() {
    const dateInput = qs("taskDateStarted");
    const resetTime = qs("taskResetTime");
    const freqEvery = qs("taskFrequencyEvery");
    const limEvery = qs("taskTimeLimitEvery");
    const dstToggle = qs("taskAdjustForDST");
    const manualResetToggle = qs("taskManualReset");
    const { hour, minute } = parseTimeStr(resetTime && resetTime.value ? resetTime.value : getDefaultTimeStr());
    const dateStarted = isValidDateStr(dateInput && dateInput.value) ? dateInput.value : getDateStr();
    return Object.assign(
      {
        dateStarted,
        weekStartDay: taskModal.selectedDay,
        weekStartHour: hour,
        weekStartMinute: minute,
        frequencyEvery: Math.max(1, Number(freqEvery && freqEvery.value) || 1),
        frequencyUnit: taskModal.frequencyUnit || "week",
        timeLimitEvery: Math.max(1, Number(limEvery && limEvery.value) || 1),
        timeLimitUnit: taskModal.timeLimitUnit || "week",
        adjustForDST: dstToggle ? dstToggle.checked : true,
        cycleEndEnabled: !!(qs("taskCycleEndEnabled") && qs("taskCycleEndEnabled").checked),
        cycleEndDate: qs("taskCycleEndDate") && qs("taskCycleEndDate").value ? qs("taskCycleEndDate").value : null,
        manualReset: !!(manualResetToggle && manualResetToggle.checked),
      },
      readCycleEndTimeFieldsFromModal(hour, minute)
    );
  }

  function updateTaskCycleEndPreview() {
    const preview = qs("taskCycleEndPreview");
    const dateInput = qs("taskCycleEndDate");
    const toggle = qs("taskCycleEndEnabled");
    if (!preview || !dateInput || !toggle) return;
    if (!toggle.checked) {
      preview.textContent = "";
      preview.hidden = true;
      return;
    }
    const endDate = dateInput.value;
    if (!isValidDateStr(endDate)) {
      preview.textContent = "Pick a date for the final cycle.";
      preview.hidden = false;
      return;
    }
    const game = taskModal.gameId ? getGame(taskModal.gameId) : null;
    const tempTask = buildTempTaskFromModal();
    tempTask.cycleEndDate = endDate;
    tempTask.cycleEndEnabled = true;
    const bounds = getLastCycleBounds(tempTask, game);
    if (!bounds) {
      preview.textContent = "";
      preview.hidden = true;
      return;
    }
    const startDate = new Date(bounds.startStr + "T12:00:00");
    const endDayDate = new Date(bounds.endStr + "T12:00:00");
    preview.textContent = "Final cycle: " + formatDate(startDate) + " – " + formatDate(endDayDate);
    preview.hidden = false;
  }

  function setTaskCycleEndFieldsVisible(show) {
    const dateInput = qs("taskCycleEndDate");
    const wrap = qs("taskCycleEndDateWrap");
    if (dateInput) dateInput.disabled = !show;
    if (wrap) wrap.classList.toggle("task-cycle-end-disabled", !show);
  }

  function updateUnitToggles(kind, unit) {
    if (kind === "frequency") taskModal.frequencyUnit = unit;
    if (kind === "timeLimit") taskModal.timeLimitUnit = unit;

    const freqDay = qs("taskFrequencyUnitDay");
    const freqWeek = qs("taskFrequencyUnitWeek");
    const limDay = qs("taskTimeLimitUnitDay");
    const limWeek = qs("taskTimeLimitUnitWeek");

    if (freqDay && freqWeek) {
      freqDay.classList.toggle("active", taskModal.frequencyUnit === "day");
      freqWeek.classList.toggle("active", taskModal.frequencyUnit === "week");
      freqDay.setAttribute("aria-pressed", taskModal.frequencyUnit === "day" ? "true" : "false");
      freqWeek.setAttribute("aria-pressed", taskModal.frequencyUnit === "week" ? "true" : "false");
    }

    if (limDay && limWeek) {
      limDay.classList.toggle("active", taskModal.timeLimitUnit === "day");
      limWeek.classList.toggle("active", taskModal.timeLimitUnit === "week");
      limDay.setAttribute("aria-pressed", taskModal.timeLimitUnit === "day" ? "true" : "false");
      limWeek.setAttribute("aria-pressed", taskModal.timeLimitUnit === "week" ? "true" : "false");
    }
  }

  function setExtraFields(taskType, task) {
    const extra = qs("taskModalExtra");
    if (!extra) return;
    extra.innerHTML = "";

    const row1 = document.createElement("div");
    row1.className = "task-menu-extra-row";
    const label1 = document.createElement("label");
    label1.textContent = "Currency (potential)";
    label1.setAttribute("for", "taskCurrencyInput");
    label1.appendChild(createTaskCurrencyInfoIcon(taskType));
    const input1 = document.createElement("input");
    input1.id = "taskCurrencyInput";
    input1.type = "number";
    input1.min = "0";
    input1.step = "1";
    input1.placeholder = "0";
    input1.value = String(Math.max(0, Number(task && task.currency) || 0));
    row1.appendChild(label1);
    row1.appendChild(input1);
    extra.appendChild(row1);

    if (taskType === "weeklies" || taskType === "endgame") {
      const row2 = document.createElement("div");
      row2.className = "task-menu-extra-row";
      const label2 = document.createElement("label");
      label2.textContent = "Cycle start date";
      label2.setAttribute("for", "taskDateStarted");
      const input2 = document.createElement("input");
      input2.id = "taskDateStarted";
      input2.type = "date";
      input2.value = isValidDateStr(task && task.dateStarted) ? task.dateStarted : getDateStr();
      row2.appendChild(label2);
      row2.appendChild(input2);
      extra.appendChild(row2);

      const rowCountFrom = document.createElement("div");
      rowCountFrom.className = "task-menu-extra-row task-cycle-end-row";
      const countFromLabel = document.createElement("label");
      countFromLabel.className = "task-cycle-end-toggle-label";
      const countFromToggle = document.createElement("input");
      countFromToggle.type = "checkbox";
      countFromToggle.id = "taskCountFromDateStarted";
      countFromToggle.className = "fill-toggle";
      countFromToggle.checked = !!(task && task.countFromDateStarted);
      countFromToggle.setAttribute("aria-label", "Count from cycle start date even without a completion");
      const countFromText = document.createElement("span");
      countFromText.textContent = "Count from cycle start date (even if incomplete)";
      countFromLabel.appendChild(countFromToggle);
      countFromLabel.appendChild(countFromText);
      countFromLabel.title = "When on, completed/attempted tallies start at the cycle start date above, including skipped cycles before the first calendar completion.";
      rowCountFrom.appendChild(countFromLabel);
      extra.appendChild(rowCountFrom);

      const rowUnlock = document.createElement("div");
      rowUnlock.className = "task-menu-extra-row";
      const labelUnlockDays = document.createElement("label");
      labelUnlockDays.textContent = "Earliest complete (days after reset)";
      labelUnlockDays.setAttribute("for", "taskEarliestCompleteDays");
      labelUnlockDays.title = "How many days after the cycle reset before this task can be marked complete. 0 = same day as reset. Pain Cage uses 2 (day 3).";
      const inputUnlockDays = document.createElement("input");
      inputUnlockDays.id = "taskEarliestCompleteDays";
      inputUnlockDays.type = "number";
      inputUnlockDays.min = "0";
      inputUnlockDays.step = "1";
      inputUnlockDays.value = String(Math.max(0, Number(task && task.earliestCompleteDays) || 0));
      rowUnlock.appendChild(labelUnlockDays);
      rowUnlock.appendChild(inputUnlockDays);
      extra.appendChild(rowUnlock);

      const rowUnlockTime = document.createElement("div");
      rowUnlockTime.className = "task-menu-extra-row";
      const labelUnlockTime = document.createElement("label");
      labelUnlockTime.textContent = "Unlock time on that day";
      labelUnlockTime.setAttribute("for", "taskEarliestCompleteTime");
      labelUnlockTime.title = "Time on the unlock day when completion becomes allowed. Leave blank to use the task reset time.";
      const inputUnlockTime = document.createElement("input");
      inputUnlockTime.id = "taskEarliestCompleteTime";
      inputUnlockTime.type = "time";
      inputUnlockTime.step = "60";
      if (task && (Number.isFinite(task.earliestCompleteHour) || Number.isFinite(task.earliestCompleteMinute))) {
        inputUnlockTime.value = timeToStr(task.earliestCompleteHour, task.earliestCompleteMinute);
      } else {
        inputUnlockTime.value = "";
        inputUnlockTime.placeholder = "Same as reset";
      }
      rowUnlockTime.appendChild(labelUnlockTime);
      rowUnlockTime.appendChild(inputUnlockTime);
      extra.appendChild(rowUnlockTime);

      const rowRemaining = document.createElement("div");
      rowRemaining.className = "task-menu-extra-row task-menu-time-remaining";
      const labelRem = document.createElement("label");
      labelRem.textContent = "Time remaining";
      labelRem.setAttribute("for", "taskTimeRemainingInput");
      const remainingInput = document.createElement("input");
      remainingInput.id = "taskTimeRemainingInput";
      remainingInput.type = "text";
      remainingInput.className = "task-time-remaining-input";
      remainingInput.placeholder = "e.g. 6d 7hr";
      remainingInput.setAttribute("aria-label", "Time remaining (input to auto-fill cycle start)");
      const inputWrap = document.createElement("span");
      inputWrap.className = "task-time-remaining-input-wrap";
      inputWrap.appendChild(remainingInput);
      const applyHint = document.createElement("span");
      applyHint.className = "task-time-remaining-hint";
      applyHint.textContent = "Enter to apply";
      inputWrap.appendChild(applyHint);
      rowRemaining.appendChild(labelRem);
      rowRemaining.appendChild(inputWrap);
      extra.appendChild(rowRemaining);
      remainingInput.addEventListener("blur", applyTaskTimeRemainingFromInput);
      remainingInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          applyTaskTimeRemainingFromInput();
        }
      });

      const rowStop = document.createElement("div");
      rowStop.className = "task-menu-extra-row task-cycle-end-row";
      const stopLabel = document.createElement("label");
      stopLabel.className = "task-cycle-end-toggle-label";
      const stopToggle = document.createElement("input");
      stopToggle.type = "checkbox";
      stopToggle.id = "taskCycleEndEnabled";
      stopToggle.className = "fill-toggle";
      stopToggle.checked = !!(task && task.cycleEndEnabled);
      stopToggle.setAttribute("aria-label", "Stop repeating cycles");
      const stopText = document.createElement("span");
      stopText.textContent = "Stop repeating cycles";
      stopLabel.appendChild(stopToggle);
      stopLabel.appendChild(stopText);
      rowStop.appendChild(stopLabel);
      extra.appendChild(rowStop);

      const rowEndDate = document.createElement("div");
      rowEndDate.className = "task-menu-extra-row task-cycle-end-row";
      rowEndDate.id = "taskCycleEndDateWrap";
      const labelEnd = document.createElement("label");
      labelEnd.textContent = "Last cycle ends";
      labelEnd.setAttribute("for", "taskCycleEndDate");
      const inputEnd = document.createElement("input");
      inputEnd.id = "taskCycleEndDate";
      inputEnd.type = "date";
      inputEnd.value = isValidDateStr(task && task.cycleEndDate) ? task.cycleEndDate : getDateStr();
      inputEnd.disabled = !stopToggle.checked;
      rowEndDate.appendChild(labelEnd);
      rowEndDate.appendChild(inputEnd);
      extra.appendChild(rowEndDate);

      const rowPreview = document.createElement("p");
      rowPreview.id = "taskCycleEndPreview";
      rowPreview.className = "task-menu-desc task-cycle-end-preview";
      rowPreview.hidden = true;
      extra.appendChild(rowPreview);

      const onCycleEndChange = () => {
        setTaskCycleEndFieldsVisible(stopToggle.checked);
        if (stopToggle.checked && !isValidDateStr(inputEnd.value)) inputEnd.value = getDateStr();
        updateTaskCycleEndPreview();
        updateTaskTimeRemainingDisplay();
      };
      stopToggle.addEventListener("change", onCycleEndChange);
      inputEnd.addEventListener("change", onCycleEndChange);
      input2.addEventListener("change", () => { updateTaskCycleEndPreview(); updateTaskTimeRemainingDisplay(); });
      remainingInput.addEventListener("input", () => updateTaskTimeRemainingDisplay());
      onCycleEndChange();
    }
  }

  function syncTaskCycleEndTimeUI() {
    const sameToggle = qs("taskCycleEndTimeSameAsBegin");
    const endTime = qs("taskCycleEndTime");
    const beginTime = qs("taskResetTime");
    if (!endTime) return;
    const same = !sameToggle || sameToggle.checked;
    endTime.disabled = same;
    endTime.setAttribute("aria-disabled", same ? "true" : "false");
    if (same && beginTime && beginTime.value) endTime.value = beginTime.value;
  }

  function openTaskModal(opts) {
    const { gameId, taskType, task } = opts || {};
    const title = qs("taskModalTitle");
    if (title) title.textContent = (task ? "Edit" : "New") + " " + (taskType === "endgame" ? "Endgame Task" : "Weekly Task");

    taskModal.gameId = gameId;
    taskModal.taskType = taskType;
    taskModal.taskId = task ? task.id : null;

    const nameInput = qs("taskNameInput");
    const resetTime = qs("taskResetTime");
    const freqEvery = qs("taskFrequencyEvery");
    const limEvery = qs("taskTimeLimitEvery");

    if (nameInput) nameInput.value = (task && task.label) ? task.label : "";

    // day selection: both use weekStartDay (endgame falls back to resetDay for legacy tasks)
    const selectedDay =
      taskType === "weeklies"
        ? (task && Number.isFinite(task.weekStartDay) ? task.weekStartDay : 0)
        : (task && Number.isFinite(task.weekStartDay) ? task.weekStartDay : (task && Number.isFinite(task.resetDay) ? task.resetDay : 0));
    updateDaySelection(selectedDay);

    // time selection: both use weekStartHour/weekStartMinute (endgame falls back to resetHour/resetMinute for legacy)
    let tStr = getDefaultTimeStr();
    if (taskType === "weeklies") {
      tStr = timeToStr(task && task.weekStartHour, task && task.weekStartMinute);
    } else {
      const h = Number.isFinite(task && task.weekStartHour) ? task.weekStartHour : (Number.isFinite(task && task.resetHour) ? task.resetHour : undefined);
      const m = Number.isFinite(task && task.weekStartMinute) ? task.weekStartMinute : (Number.isFinite(task && task.resetMinute) ? task.resetMinute : undefined);
      tStr = timeToStr(h, m);
    }
    if (resetTime) resetTime.value = tStr;

    const sameEndToggle = qs("taskCycleEndTimeSameAsBegin");
    const cycleEndTime = qs("taskCycleEndTime");
    const sameAsBegin = !task || task.cycleEndTimeSameAsBegin !== false;
    if (sameEndToggle) sameEndToggle.checked = sameAsBegin;
    if (cycleEndTime) {
      if (sameAsBegin) {
        cycleEndTime.value = tStr;
      } else {
        cycleEndTime.value = timeToStr(
          Number.isFinite(task && task.cycleEndHour) ? task.cycleEndHour : undefined,
          Number.isFinite(task && task.cycleEndMinute) ? task.cycleEndMinute : undefined
        );
      }
    }
    syncTaskCycleEndTimeUI();

    const dstToggle = qs("taskAdjustForDST");
    if (dstToggle) dstToggle.checked = task && task.adjustForDST !== false;

    const manualResetToggle = qs("taskManualReset");
    if (manualResetToggle) manualResetToggle.checked = !!(task && task.manualReset);

    // frequency + time limit (stored on task but not used elsewhere yet)
    const fEvery = Math.max(1, Number(task && task.frequencyEvery) || 1);
    const fUnit = (task && (task.frequencyUnit === "day" || task.frequencyUnit === "week")) ? task.frequencyUnit : (taskType === "weeklies" ? "week" : "week");
    const lEvery = Math.max(1, Number(task && task.timeLimitEvery) || 1);
    const lUnit = (task && (task.timeLimitUnit === "day" || task.timeLimitUnit === "week")) ? task.timeLimitUnit : "week";

    if (freqEvery) freqEvery.value = String(fEvery);
    if (limEvery) limEvery.value = String(lEvery);
    updateUnitToggles("frequency", fUnit);
    updateUnitToggles("timeLimit", lUnit);

    setExtraFields(taskType, task);
    setActiveBannerUi("task");
    taskModal.bannerTarget = "board";
    const loaded = loadTaskBannersFromTask(task);
    taskModal.bannerSource = loaded.source;
    taskModal.bannerViews = loaded.views;
    taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    resetTaskBannerCropState();
    syncTaskBannerTargetButtons();
    syncTaskBannerPreview();
    setModalOpen(true);
    requestAnimationFrame(() => {
      resizeTaskBannerCropStage();
      drawTaskBannerCrop();
      if (taskModal.bannerSource) {
        loadTaskBannerSourceFromUrl(taskModal.bannerSource, { keepViews: true }).catch(() => {});
      } else {
        syncTaskBannerEditorFrames();
        drawTaskBannerCrop();
      }
    });
    updateTaskTimeRemainingDisplay();

    // focus name input for quick typing
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function closeTaskModal() {
    setModalOpen(false);
    taskModal.gameId = null;
    taskModal.taskType = null;
    taskModal.taskId = null;
    taskModal.bannerTarget = "board";
    taskModal.bannerSource = null;
    taskModal.bannerViews = emptyTaskBannerViews();
    taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    resetTaskBannerCropState();
    syncTaskBannerPreview();
    syncTaskBannerTargetButtons();
  }

  const manualResetModalState = {
    open: false,
    gameId: null,
    taskType: null,
    taskId: null,
    reason: "reset", // "create" | "reset" | "expiry"
  };

  function setManualResetModalOpen(open) {
    const el = qs("manualResetModal");
    if (!el) return;
    manualResetModalState.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      document.body.style.overflow = "hidden";
      activateModalFocus(el);
    } else {
      const otherOpen = Array.from(document.querySelectorAll(".modal")).some((m) => m !== el && !m.hidden);
      if (!otherOpen) document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }

  function syncManualResetDueInputs() {
    const tbd = qs("manualResetDueTbd");
    const due = qs("manualResetDueDate");
    if (!due) return;
    const isTbd = !!(tbd && tbd.checked);
    due.disabled = isTbd;
    due.setAttribute("aria-disabled", isTbd ? "true" : "false");
  }

  function openManualResetModal(opts) {
    const o = opts || {};
    const game = getGame(o.gameId);
    if (!game) return;
    const list = o.taskType === "endgame" ? (game.endgame || []) : (game.weeklies || []);
    const task = list.find((t) => (t.id || t.label) === o.taskId);
    if (!task || !task.manualReset) return;
    if (manualResetModalState.open) return;

    manualResetModalState.gameId = o.gameId;
    manualResetModalState.taskType = o.taskType === "endgame" ? "endgame" : "weeklies";
    manualResetModalState.taskId = o.taskId;
    manualResetModalState.reason = o.reason || "reset";

    const title = qs("manualResetModalTitle");
    const desc = qs("manualResetModalDesc");
    const dueInput = qs("manualResetDueDate");
    const tbdToggle = qs("manualResetDueTbd");
    const label = task.label || (manualResetModalState.taskType === "endgame" ? "Endgame" : "Weekly");

    if (title) {
      title.textContent = manualResetModalState.reason === "expiry"
        ? "Cycle due — set next window"
        : "Manual Reset / Start";
    }
    if (desc) {
      desc.textContent = manualResetModalState.reason === "expiry"
        ? ("\"" + label + "\" is past due. Set the next due date, or TBD if you do not know yet.")
        : ("Set when \"" + label + "\" is due, or leave TBD if you do not know yet.");
    }

    const hasDue = !task.manualDueTbd && isValidDateStr(task.manualDueDateStr);
    if (tbdToggle) tbdToggle.checked = false;
    if (dueInput) {
      dueInput.value = hasDue && manualResetModalState.reason === "reset"
        ? task.manualDueDateStr
        : getDateStr();
    }
    syncManualResetDueInputs();
    setManualResetModalOpen(true);
  }

  function closeManualResetModal() {
    setManualResetModalOpen(false);
    manualResetModalState.gameId = null;
    manualResetModalState.taskType = null;
    manualResetModalState.taskId = null;
    manualResetModalState.reason = "reset";
  }

  function confirmManualResetModal() {
    const game = getGame(manualResetModalState.gameId);
    if (!game) {
      closeManualResetModal();
      return;
    }
    const list = manualResetModalState.taskType === "endgame" ? (game.endgame || []) : (game.weeklies || []);
    const task = list.find((t) => (t.id || t.label) === manualResetModalState.taskId);
    if (!task) {
      closeManualResetModal();
      return;
    }
    const tbdToggle = qs("manualResetDueTbd");
    const dueInput = qs("manualResetDueDate");
    const tbd = !!(tbdToggle && tbdToggle.checked);
    const dueDateStr = !tbd && dueInput && isValidDateStr(dueInput.value) ? dueInput.value : null;
    if (!tbd && !dueDateStr) {
      if (dueInput) dueInput.focus();
      return;
    }

    startManualResetWindow(game, task, manualResetModalState.taskType, {
      reason: manualResetModalState.reason,
      tbd,
      dueDateStr,
      dateStarted: (manualResetModalState.reason === "create" && isValidDateStr(task.dateStarted))
        ? task.dateStarted
        : getDateStr(),
    });
    save();
    if (typeof bumpDataVersion === "function") bumpDataVersion();
    closeManualResetModal();
    renderActiveTab();
    if (typeof checkManualResetExpiries === "function") checkManualResetExpiries();
  }

  function cancelManualResetModal() {
    const game = getGame(manualResetModalState.gameId);
    const list = game
      ? (manualResetModalState.taskType === "endgame" ? (game.endgame || []) : (game.weeklies || []))
      : [];
    const task = list.find((t) => (t.id || t.label) === manualResetModalState.taskId);
    const reason = manualResetModalState.reason;
    // Cancel on create/expiry = "don't know next cycle yet" (pin). Cancel on mid-cycle Reset aborts with no change.
    if (task && task.manualReset && (reason === "create" || reason === "expiry")) {
      task.manualAwaitingRestart = true;
      if (reason === "create" && !isValidDateStr(task.manualDueDateStr)) {
        task.manualDueTbd = true;
        task.manualDueDateStr = null;
      }
      save();
      if (typeof bumpDataVersion === "function") bumpDataVersion();
      renderActiveTab();
    }
    closeManualResetModal();
  }

  function initManualResetModal() {
    const modalEl = qs("manualResetModal");
    if (!modalEl) return;
    const confirmBtn = qs("manualResetModalConfirm");
    const cancelBtn = qs("manualResetModalCancel");
    const closeBtn = qs("manualResetModalClose");
    const tbdToggle = qs("manualResetDueTbd");
    const dueInput = qs("manualResetDueDate");

    modalEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-close") === "manualResetModal") {
        cancelManualResetModal();
      }
    });
    if (confirmBtn) confirmBtn.addEventListener("click", confirmManualResetModal);
    if (cancelBtn) cancelBtn.addEventListener("click", cancelManualResetModal);
    if (closeBtn) closeBtn.addEventListener("click", cancelManualResetModal);
    if (tbdToggle) tbdToggle.addEventListener("change", syncManualResetDueInputs);
    if (dueInput) {
      dueInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmManualResetModal();
        }
      });
    }
    document.addEventListener("keydown", (e) => {
      if (!manualResetModalState.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cancelManualResetModal();
      }
    });
  }

  /** Scan for expired manual-reset due windows and open the start popup (once per task). */
  function checkManualResetExpiries() {
    if (manualResetModalState.open) return false;
    const now = getSimulatedNow();
    const games = typeof getAllGames === "function" ? getAllGames() : (state.games || []);
    for (let gi = 0; gi < games.length; gi++) {
      const game = games[gi];
      const pairs = [
        ["weeklies", game.weeklies || []],
        ["endgame", game.endgame || []],
      ];
      for (let pi = 0; pi < pairs.length; pi++) {
        const taskType = pairs[pi][0];
        const list = pairs[pi][1];
        for (let ti = 0; ti < list.length; ti++) {
          const task = list[ti];
          if (!isManualResetTask(task)) continue;
          if (task.manualAwaitingRestart) continue;
          if (!isManualResetExpired(task, now)) continue;
          openManualResetModal({
            gameId: game.id,
            taskType,
            taskId: task.id || task.label,
            reason: "expiry",
          });
          return true;
        }
      }
    }
    return false;
  }

  function getPreset(presetId) {
    return GAME_PRESETS.find((p) => p.id === presetId) || null;
  }

  function updatePresetButtons(selectedId) {
    document.querySelectorAll(".game-add-options .game-add-option").forEach((btn) => {
      const id = btn.getAttribute("data-preset");
      const active = id === selectedId;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function openGameModal() {
    gameModal.selectedPresetId = "custom";
    updatePresetButtons("custom");
    const nameInput = qs("gameNameInput");
    if (nameInput) nameInput.value = "";
    setGameModalOpen(true);
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function closeGameModal() {
    setGameModalOpen(false);
    gameModal.selectedPresetId = "custom";
  }

  function openDeleteGameModal(gameId) {
    const game = getGame(gameId);
    if (!game) return;
    deleteGameModalState.gameId = gameId;
    const msg = qs("deleteGameMessage");
    if (msg) {
      msg.textContent = 'Are you sure you want to delete "' + (game.name || "game") + '"? This cannot be undone.';
    }
    setDeleteGameModalOpen(true);
  }

  function closeDeleteGameModal() {
    setDeleteGameModalOpen(false);
    deleteGameModalState.gameId = null;
  }

  function initGameModal() {
    const modalEl = qs("gameModal");
    const closeBtn = qs("gameModalClose");
    const cancelBtn = qs("gameModalCancel");
    const form = qs("gameModalForm");
    const nameInput = qs("gameNameInput");

    if (!modalEl || !form) return;

    modalEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-close") === "true") closeGameModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeGameModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeGameModal);

    document.querySelectorAll(".game-add-options .game-add-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const presetId = btn.getAttribute("data-preset") || "custom";
        gameModal.selectedPresetId = presetId;
        updatePresetButtons(presetId);
        const preset = presetId === "custom" ? null : getPreset(presetId);
        if (nameInput) nameInput.value = preset ? preset.name : (nameInput.value || "");
        const serverEl = qs("gameServerSelect");
        if (serverEl) serverEl.value = state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
        if (nameInput) nameInput.focus();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (!gameModal.open) return;
      if (e.key === "Escape") closeGameModal();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const rawName = nameInput && nameInput.value ? nameInput.value.trim() : "";
      const preset = gameModal.selectedPresetId === "custom" ? null : getPreset(gameModal.selectedPresetId);
      const name = rawName || (preset ? preset.name : "New game");
      const serverEl = qs("gameServerSelect");
      const server = serverEl && ["america", "asia", "europe"].includes(serverEl.value) ? serverEl.value : "america";

      state.tab = "games";
      const primaryServer = state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
      if (preset) addGame(name, { ...preset, presetId: preset.id, server: primaryServer });
      else addGame(name, { presetId: null, server });
      closeGameModal();
    });
  }

  function initDeleteGameModal() {
    const modalEl = qs("deleteGameModal");
    const closeBtn = qs("deleteGameModalClose");
    const cancelBtn = qs("deleteGameCancel");
    const confirmBtn = qs("deleteGameConfirm");

    if (!modalEl || !confirmBtn) return;

    modalEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-close") === "true") {
        closeDeleteGameModal();
      }
    });
    if (closeBtn) closeBtn.addEventListener("click", closeDeleteGameModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeDeleteGameModal);

    confirmBtn.addEventListener("click", () => {
      const id = deleteGameModalState.gameId;
      if (id) reallyDeleteGame(id);
      closeDeleteGameModal();
    });

    document.addEventListener("keydown", (e) => {
      if (!deleteGameModalState.open) return;
      if (e.key === "Escape") closeDeleteGameModal();
    });
  }

  function initClearGameDataModal() {
    const modalEl = qs("clearGameDataModal");
    const closeBtn = qs("clearGameDataModalClose");
    const cancelBtn = qs("clearGameDataCancel");
    const confirmBtn = qs("clearGameDataConfirm");
    if (!modalEl || !confirmBtn) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "clearGameDataModal") closeClearGameDataModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeClearGameDataModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeClearGameDataModal);
    confirmBtn.addEventListener("click", confirmClearGameData);
    document.addEventListener("keydown", (e) => {
      if (!clearGameDataModalGameId) return;
      if (e.key === "Escape") closeClearGameDataModal();
    });
  }

  let clearTimeTrendsModalOpen = false;
  function openClearTimeTrendsModal() {
    const modal = qs("clearTimeTrendsModal");
    const container = qs("clearTimeTrendsModalGames");
    const titleEl = qs("clearTimeTrendsModalTitle");
    if (!modal || !container) return;
    clearTimeTrendsModalOpen = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (titleEl) titleEl.textContent = "Sync Time Trends with Calendar";
    container.innerHTML = "";
    container.className = "clear-time-trends-games timestamps-game-selector";
    container.style.display = "flex";
    container.style.flexWrap = "wrap";
    container.style.gap = "0.5rem";
    const games = getAllGames();
    const gameIdsWithData = new Set((state.completionTimestamps || []).map((t) => t.gameId));
    const selected = new Set(gameIdsWithData.size ? gameIdsWithData : games.map((g) => g.id));
    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timestamps-game-pill clear-time-trends-pill";
      const stampCount = (state.completionTimestamps || []).filter((t) => t.gameId === game.id).length;
      btn.textContent = game.name + (stampCount ? " (" + stampCount + ")" : "");
      btn.dataset.gameId = game.id;
      btn.setAttribute("aria-pressed", selected.has(game.id) ? "true" : "false");
      if (selected.has(game.id)) btn.classList.add("filled");
      btn.addEventListener("click", () => {
        if (selected.has(game.id)) {
          selected.delete(game.id);
          btn.classList.remove("filled");
          btn.setAttribute("aria-pressed", "false");
        } else {
          selected.add(game.id);
          btn.classList.add("filled");
          btn.setAttribute("aria-pressed", "true");
        }
      });
      container.appendChild(btn);
    });
    if (games.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No games to sync.";
      container.appendChild(p);
    }
    activateModalFocus(modal);
  }
  function closeClearTimeTrendsModal() {
    const modal = qs("clearTimeTrendsModal");
    if (modal) {
      clearTimeTrendsModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen && !clearDataModalOpen && !timeTrendsDetailModalOpen) document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }
  function getSelectedTimeTrendsGameIds() {
    const container = qs("clearTimeTrendsModalGames");
    const selectedIds = [];
    if (!container) return selectedIds;
    container.querySelectorAll('.clear-time-trends-pill.filled, .clear-time-trends-pill[aria-pressed="true"]').forEach((btn) => {
      if (btn.dataset.gameId) selectedIds.push(btn.dataset.gameId);
    });
    return selectedIds;
  }
  function confirmClearTimeTrends() {
    const selectedIds = getSelectedTimeTrendsGameIds();
    if (selectedIds.length > 0 && state.completionTimestamps) {
      const drop = new Set(selectedIds);
      state.completionTimestamps = state.completionTimestamps.filter((t) => !drop.has(t.gameId));
    }
    save();
    renderActiveTab();
    closeClearTimeTrendsModal();
  }
  function confirmSyncTimeTrendsFromCalendar() {
    const selectedIds = getSelectedTimeTrendsGameIds();
    if (!selectedIds.length) {
      alert("Select at least one game to sync.");
      return;
    }
    if (typeof syncTimestampsFromCalendar !== "function") {
      alert("Sync with Calendar is unavailable.");
      return;
    }
    const result = syncTimestampsFromCalendar({
      gameIds: selectedIds,
      skipRender: false,
      skipSave: false,
    });
    closeClearTimeTrendsModal();
    const parts = [
      "Synced Time Trends with Calendar.",
      "Already had times (unchanged): " + (result.kept || 0),
      "Filled from your usual trend hours: " + (result.added || 0),
    ];
    if (result.collapsed) parts.push("Duplicate stamps collapsed: " + result.collapsed);
    parts.push("Existing Time Trends stamps were left as-is so charts stay familiar.");
    alert(parts.join("\n"));
  }

  let timeTrendsDetailModalOpen = false;
  function openTimeTrendsDetailModal(title, items) {
    const modal = qs("timeTrendsDetailModal");
    if (!modal) return;
    timeTrendsDetailModalOpen = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const titleEl = qs("timeTrendsDetailModalTitle");
    if (titleEl) titleEl.textContent = title;
    const listEl = qs("timeTrendsDetailModalList");
    if (listEl) {
      listEl.innerHTML = "";
      if (!items || items.length === 0) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.textContent = "No completions in this period.";
        listEl.appendChild(p);
      } else {
        items.forEach((item) => {
          const row = document.createElement("div");
          row.className = "time-trends-detail-list-item";
          const gameName = item.gameName || item.gameId || "?";
          const taskLabel = item.taskLabel || "";
          const typeLabel = item.taskType ? " (" + item.taskType.charAt(0).toUpperCase() + item.taskType.slice(1) + ")" : "";
          const datePart = item.dateStr ? " — " + item.dateStr : "";
          row.textContent = gameName + (taskLabel ? " – " + taskLabel : "") + typeLabel + datePart;
          listEl.appendChild(row);
        });
      }
    }
    activateModalFocus(modal);
  }
  function closeTimeTrendsDetailModal() {
    const modal = qs("timeTrendsDetailModal");
    if (modal) {
      timeTrendsDetailModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen && !clearDataModalOpen) document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }
  function initTimeTrendsDetailModal() {
    const modalEl = qs("timeTrendsDetailModal");
    const closeBtn = qs("timeTrendsDetailModalClose");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "timeTrendsDetailModal") closeTimeTrendsDetailModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeTimeTrendsDetailModal);
    document.addEventListener("keydown", (e) => {
      if (!timeTrendsDetailModalOpen) return;
      if (e.key === "Escape") closeTimeTrendsDetailModal();
    });
  }

  let attendanceSkippedModalOpen = false;
  function openAttendanceSkippedModal(title, groups, skippedTotal) {
    const modal = qs("attendanceSkippedModal");
    if (!modal) return;
    attendanceSkippedModalOpen = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const titleEl = qs("attendanceSkippedModalTitle");
    if (titleEl) titleEl.textContent = title || "Skipped tasks";
    const summaryEl = qs("attendanceSkippedModalSummary");
    if (summaryEl) {
      const taskCount = (groups || []).reduce((n, g) => n + ((g.tasks && g.tasks.length) || 0), 0);
      const skipSum = (groups || []).reduce(
        (n, g) => n + (g.tasks || []).reduce((s, t) => s + (Number(t.skipped) || 0), 0),
        0
      );
      const total = Number.isFinite(skippedTotal) ? skippedTotal : skipSum;
      summaryEl.textContent =
        total <= 0
          ? "Nothing skipped for included games."
          : total +
            " skipped cycle" +
            (total === 1 ? "" : "s") +
            " across " +
            taskCount +
            " task" +
            (taskCount === 1 ? "" : "s") +
            ".";
    }
    const listEl = qs("attendanceSkippedModalList");
    if (listEl && typeof fillAttendanceSkippedList === "function") {
      fillAttendanceSkippedList(listEl, groups || [], "No skipped tasks.");
    } else if (listEl) {
      listEl.innerHTML = "";
      (groups || []).forEach((group) => {
        const block = document.createElement("div");
        block.className = "attendance-skipped-game";
        const h = document.createElement("h4");
        h.className = "attendance-skipped-game-title";
        h.textContent = group.gameName;
        block.appendChild(h);
        const ul = document.createElement("ul");
        ul.className = "attendance-skipped-task-list";
        (group.tasks || []).forEach((task) => {
          const li = document.createElement("li");
          li.textContent =
            task.label + " — " + task.skipped + " skipped (" + task.completed + "/" + task.attempted + ")";
          ul.appendChild(li);
        });
        block.appendChild(ul);
        listEl.appendChild(block);
      });
    }
    activateModalFocus(modal);
  }
  function closeAttendanceSkippedModal() {
    const modal = qs("attendanceSkippedModal");
    if (modal) {
      attendanceSkippedModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen && !clearDataModalOpen && !timeTrendsDetailModalOpen) document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }
  function initAttendanceSkippedModal() {
    const modalEl = qs("attendanceSkippedModal");
    const closeBtn = qs("attendanceSkippedModalClose");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("modal-backdrop") ||
        e.target.getAttribute("data-close") === "attendanceSkippedModal"
      ) {
        closeAttendanceSkippedModal();
      }
    });
    if (closeBtn) closeBtn.addEventListener("click", closeAttendanceSkippedModal);
    document.addEventListener("keydown", (e) => {
      if (!attendanceSkippedModalOpen) return;
      if (e.key === "Escape") closeAttendanceSkippedModal();
    });
  }

  function initClearTimeTrendsModal() {
    const modalEl = qs("clearTimeTrendsModal");
    const closeBtn = qs("clearTimeTrendsModalClose");
    const cancelBtn = qs("clearTimeTrendsCancel");
    const clearBtn = qs("clearTimeTrendsConfirm");
    const syncBtn = qs("syncTimeTrendsConfirm");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "clearTimeTrendsModal") closeClearTimeTrendsModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeClearTimeTrendsModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeClearTimeTrendsModal);
    if (clearBtn) clearBtn.addEventListener("click", confirmClearTimeTrends);
    if (syncBtn) syncBtn.addEventListener("click", confirmSyncTimeTrendsFromCalendar);
    document.addEventListener("keydown", (e) => {
      if (!clearTimeTrendsModalOpen) return;
      if (e.key === "Escape") closeClearTimeTrendsModal();
    });
  }

  function initEarningsModal() {
    const modalEl = qs("earningsModal");
    const closeBtn = qs("earningsModalClose");
    const cancelBtn = qs("earningsModalCancel");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeEarningsModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeEarningsModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeEarningsModal);
  }

  function initEndgameCompleteModal() {
    const modalEl = qs("endgameCompleteModal");
    const confirmBtn = qs("endgameCompleteModalConfirm");
    const cancelBtn = qs("endgameCompleteModalCancel");
    const closeBtn = qs("endgameCompleteModalClose");
    const fullPotentialBtn = qs("endgameCompleteFullPotentialBtn");
    const input = qs("endgameCompleteCurrencyInput");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeEndgameCompleteModal();
    });
    if (confirmBtn) confirmBtn.addEventListener("click", confirmEndgameCompleteModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeEndgameCompleteModal);
    if (closeBtn) closeBtn.addEventListener("click", closeEndgameCompleteModal);
    if (fullPotentialBtn) fullPotentialBtn.addEventListener("click", applyEndgameCompleteFullPotential);
    const sameAsPastBtn = qs("endgameCompleteSameAsPastBtn");
    if (sameAsPastBtn) sameAsPastBtn.addEventListener("click", applyEndgameCompleteSameAsPastCycle);
    const pastToggle = qs("endgameCompletePastToggle");
    const pastList = qs("endgameCompletePastList");
    if (pastToggle && pastList) {
      pastToggle.addEventListener("click", () => {
        const show = pastList.hidden;
        pastList.hidden = !show;
        pastToggle.textContent = show ? "Hide past earnings" : "Show past earnings";
        pastToggle.setAttribute("aria-expanded", show ? "true" : "false");
        pastToggle.title = show ? "Hide the list of past completion amounts." : "Show or hide earnings from each previous completion.";
      });
    }
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmEndgameCompleteModal();
        }
      });
    }
    document.addEventListener("keydown", (e) => {
      const el = qs("endgameCompleteModal");
      if (!el || el.hidden) return;
      if (e.key === "Escape") closeEndgameCompleteModal();
    });
  }

  function initExtracurricularCompleteModal() {
    const modalEl = qs("extracurricularCompleteModal");
    const confirmBtn = qs("extracurricularCompleteModalConfirm");
    const cancelBtn = qs("extracurricularCompleteModalCancel");
    const closeBtn = qs("extracurricularCompleteModalClose");
    const fullBtn = qs("extracurricularCompleteFullPotentialBtn");
    const input = qs("extracurricularCompleteCurrencyInput");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeExtracurricularCompleteModal();
    });
    if (confirmBtn) confirmBtn.addEventListener("click", confirmExtracurricularCompleteModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeExtracurricularCompleteModal);
    if (closeBtn) closeBtn.addEventListener("click", closeExtracurricularCompleteModal);
    if (fullBtn) fullBtn.addEventListener("click", applyExtracurricularCompleteFullPotential);
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmExtracurricularCompleteModal();
        }
      });
    }
    document.addEventListener("keydown", (e) => {
      const el = qs("extracurricularCompleteModal");
      if (!el || el.hidden) return;
      if (e.key === "Escape") closeExtracurricularCompleteModal();
    });
  }

  function initCalendarDayModal() {
    const modalEl = qs("calendarDayModal");
    const closeBtn = qs("calendarDayModalClose");
    const cancelBtn = qs("calendarDayModalCancel");
    const saveBtn = qs("calendarDayModalSave");

    if (!modalEl) return;

    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeCalendarDayModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeCalendarDayModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeCalendarDayModal);
    if (saveBtn) saveBtn.addEventListener("click", saveCalendarDayModal);

    document.addEventListener("keydown", (e) => {
      if (!calendarDayModal.open) return;
      if (e.key === "Escape") closeCalendarDayModal();
    });

    initCompletionTimeModal();
  }

  function initCompletionTimeModal() {
    const modalEl = qs("completionTimeModal");
    if (!modalEl || modalEl.dataset.bound === "1") return;
    modalEl.dataset.bound = "1";
    const closeBtn = qs("completionTimeModalClose");
    const cancelBtn = qs("completionTimeModalCancel");
    const confirmBtn = qs("completionTimeModalConfirm");
    const selectAll = qs("completionTimeSelectAll");
    const batchApply = qs("completionTimeBatchApply");
    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeCompletionTimeModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeCompletionTimeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeCompletionTimeModal);
    if (confirmBtn) confirmBtn.addEventListener("click", confirmCompletionTimeModal);
    if (selectAll) {
      selectAll.addEventListener("change", () => {
        const ctx = completionTimeModalCtx;
        if (!ctx || !ctx.rows) return;
        ctx.rows.forEach((row) => {
          if (!row._check) return;
          row._check.checked = selectAll.checked;
          if (row._check.parentElement) {
            row._check.parentElement.classList.toggle("is-batch-selected", selectAll.checked);
          }
        });
        selectAll.indeterminate = false;
      });
    }
    if (batchApply) batchApply.addEventListener("click", applyBatchCompletionTimeToSelected);
    document.addEventListener("keydown", (e) => {
      const el = qs("completionTimeModal");
      if (!el || el.hidden) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeCompletionTimeModal();
      }
    });
  }

  function openDebugFillMissingTimes() {
    if (typeof listMissingCompletionTimes !== "function") {
      alert("Fill missing times is unavailable.");
      return;
    }
    const missing = listMissingCompletionTimes();
    const report = qs("settingsDebugReport");
    if (!missing.length) {
      if (report) {
        report.textContent =
          "Fill missing times\n\nNo calendar completions without timestamps were found." +
          (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function"
            ? "\n\n" + formatConflictScanReport(scanDataConflicts())
            : "");
      }
      return;
    }
    openCompletionTimeModal({
      mode: "debug",
      rows: missing.map((row) => ({
        type: row.type,
        key: row.key,
        label: row.label,
        dateStr: row.dateStr,
      })),
    });
  }

  function openDebugResolveDuplicateTimes() {
    if (typeof listDuplicateCompletionTimestamps !== "function") {
      alert("Resolve duplicate times is unavailable.");
      return;
    }
    const groups = listDuplicateCompletionTimestamps();
    const report = qs("settingsDebugReport");
    if (!groups.length) {
      if (report) {
        report.textContent =
          "Resolve duplicate times\n\nNo tasks with multiple timestamps in the same cycle were found." +
          (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function"
            ? "\n\n" + formatConflictScanReport(scanDataConflicts())
            : "");
      }
      return;
    }
    openCompletionTimeModal({
      mode: "debug-dupes",
      groups: groups.map((g) => ({
        type: g.type,
        key: g.key,
        gameId: g.gameId,
        taskId: g.taskId,
        label: g.label,
        cycleStart: g.cycleStart,
        stamps: (g.stamps || []).map((s) => ({
          dateStr: s.dateStr,
          hour: s.hour,
          minute: s.minute,
        })),
      })),
    });
  }

  function openDebugFixTimesDates() {
    if (typeof listTimeDateFixQueue !== "function") {
      alert("Fix times & dates is unavailable.");
      return;
    }
    const queue = listTimeDateFixQueue();
    const report = qs("settingsDebugReport");
    if (!queue.length) {
      if (report) {
        report.textContent =
          "Fix times & dates\n\nNo time/date conflicts to fix." +
          (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function"
            ? "\n\n" + formatConflictScanReport(scanDataConflicts())
            : "");
      }
      return;
    }
    openCompletionTimeModal({
      mode: "debug-time-date-fix",
      rows: queue.map((c) => ({
        kind: c.kind,
        type: c.type,
        key: c.key,
        gameId: c.gameId,
        taskId: c.taskId,
        label: (c.game || "") + " — " + (c.task || c.taskId || ""),
        cycleStart: c.cycleStart,
        message: c.message,
        dateStr: c.dateStr,
        hour: c.hour,
        minute: c.minute,
        unlockDate: c.unlockDate,
        unlockHour: c.unlockHour,
        unlockMinute: c.unlockMinute,
        stamps: c.stamps,
        suggestedDateStr: c.suggestedDateStr,
        suggestedHour: c.suggestedHour,
        suggestedMinute: c.suggestedMinute,
      })),
    });
  }

  let settingsModalOpen = false;

  const PRESET_NAMES = {
    purple: "Purple",
    blue: "Blue",
    green: "Green",
    rose: "Rose",
    amber: "Amber",
    teal: "Teal",
    aqua: "Aqua",
    grayscale: "Grayscale",
    red: "Red",
    orange: "Orange",
    yellow: "Yellow",
    pink: "Pink",
    indigo: "Indigo",
    violet: "Violet",
    brown: "Brown",
    gray: "Gray",
    black: "Black",
    white: "White",
  };

  function openSettingsModal() {
    const modalEl = qs("settingsModal");
    if (!modalEl) return;
    settingsModalOpen = true;
    modalEl.hidden = false;
    modalEl.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderSettingsPresetGrid();
    renderSettingsCustomLayers();
    renderSettingsSavedPresets();
    syncSettingsUI();
    syncShareCardCustomRow();
    renderShareCardGamePills();
    activateModalFocus(modalEl);
  }

  function closeSettingsModal() {
    const modalEl = qs("settingsModal");
    if (!modalEl) return;
    settingsModalOpen = false;
    modalEl.hidden = true;
    modalEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    deactivateModalFocus();
  }

  function renderSettingsPresetGrid() {
    const grid = qs("settings-preset-grid");
    if (!grid) return;
    grid.innerHTML = "";
    THEME_PRESET_IDS_UNIQUE.forEach((id) => {
      const name = PRESET_NAMES[id] || id;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-theme-option";
      btn.dataset.theme = id;
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", name);
      btn.title = name;
      const swatch = document.createElement("span");
      swatch.className = "settings-theme-swatch settings-theme-" + id;
      const label = document.createElement("span");
      label.className = "settings-theme-name";
      label.textContent = name;
      btn.appendChild(swatch);
      btn.appendChild(label);
      grid.appendChild(btn);
    });
    grid.querySelectorAll(".settings-theme-option").forEach((btn) => {
      btn.addEventListener("click", () => selectPreset(btn.getAttribute("data-theme")));
    });
  }

  function selectPreset(themeId) {
    if (!themeId) return;
    const isCustom = themeId.startsWith("custom_");
    const hasPreset = THEME_PRESET_IDS_UNIQUE.includes(themeId);
    const hasCustomPreset = isCustom && state.customThemePresets.some((p) => p.id === themeId);
    if (!hasPreset && !hasCustomPreset) return;
    state.themeMode = "preset";
    state.themePreset = themeId;
    applyTheme();
    state.themeCustom = getCurrentThemeColors();
    save();
    syncSettingsUI();
    renderSettingsSavedPresets();
  }

  function hexToRgb(hex) {
    const m = hex.replace(/^#/, "").match(/^([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  let colorPickerEditingLayerId = null;

  let colorPickerHsl = { h: 270, s: 75, l: 50 };

  function openColorPickerPopover(layerId, layerLabel, hex) {
    const modal = qs("colorWheelModal");
    if (!modal) return;
    colorPickerEditingLayerId = layerId;
    const nameEl = qs("settings-picker-layer-name");
    if (nameEl) nameEl.textContent = layerLabel;
    const titleEl = qs("colorWheelModalTitle");
    if (titleEl) titleEl.textContent = layerLabel;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    const rgb = hexToRgb(hex || "#a855f7");
    if (rgb) {
      colorPickerHsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    }
    const lightnessSlider = qs("settings-lightness-slider");
    if (lightnessSlider) lightnessSlider.value = colorPickerHsl.l;
    drawColorWheel();
    updateWheelMarker();
  }

  function closeColorPickerPopover() {
    const modal = qs("colorWheelModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
    colorPickerEditingLayerId = null;
  }

  function drawColorWheel() {
    const canvas = qs("settings-color-wheel");
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const innerR = size * 0.32;
    const outerR = size * 0.48;
    for (let i = 0; i < 360; i += 2) {
      const hue = i;
      const startAng = ((hue - 1) * Math.PI) / 180;
      const endAng = ((hue + 1) * Math.PI) / 180;
      const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      grad.addColorStop(0, "hsl(" + hue + ", 0%, 50%)");
      grad.addColorStop(1, "hsl(" + hue + ", 100%, 50%)");
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAng, endAng);
      ctx.arc(cx, cy, innerR, endAng, startAng, true);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = "hsl(0, 0%, 50%)";
    ctx.fill();
  }

  function wheelPosToHsl(px, py) {
    const canvas = qs("settings-color-wheel");
    if (!canvas) return colorPickerHsl;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const x = (px - rect.left) * scaleX - cx;
    const y = (py - rect.top) * scaleY - cy;
    const r = Math.sqrt(x * x + y * y);
    const innerR = canvas.width * 0.32;
    const outerR = canvas.width * 0.48;
    let h = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    let s = 0;
    if (r >= outerR) {
      s = 100;
    } else if (r > innerR) {
      s = ((r - innerR) / (outerR - innerR)) * 100;
    }
    const lSlider = qs("settings-lightness-slider");
    const l = lSlider ? parseInt(lSlider.value || "50", 10) : 50;
    return { h: Math.round(h), s: Math.round(s), l };
  }

  function updateWheelMarker() {
    const wrap = document.querySelector(".settings-color-wheel-wrap");
    const marker = qs("settings-wheel-marker");
    const canvas = qs("settings-color-wheel");
    if (!wrap || !marker || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const innerR = canvas.width * 0.32;
    const outerR = canvas.width * 0.48;
    const r = innerR + (colorPickerHsl.s / 100) * (outerR - innerR);
    const rad = (colorPickerHsl.h * Math.PI) / 180;
    const x = rect.width / 2 + r * scaleX * Math.cos(rad);
    const y = rect.height / 2 + r * scaleY * Math.sin(rad);
    marker.style.left = (rect.left - wrap.getBoundingClientRect().left + x) + "px";
    marker.style.top = (rect.top - wrap.getBoundingClientRect().top + y) + "px";
  }

  function getColorPickerHex() {
    const lSlider = qs("settings-lightness-slider");
    const l = lSlider ? parseInt(lSlider.value || "50", 10) : colorPickerHsl.l;
    const rgb = hslToRgb(colorPickerHsl.h, colorPickerHsl.s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  function applyColorPickerToLayer() {
    if (!colorPickerEditingLayerId) return;
    const hex = getColorPickerHex();
    updateCustomLayer(colorPickerEditingLayerId, hex);
    const row = document.querySelector('.settings-custom-layer[data-layer-id="' + colorPickerEditingLayerId + '"]');
    if (row) {
      const swatch = row.querySelector(".settings-layer-swatch");
      if (swatch) swatch.style.background = hex;
    }
  }

  let colorPickerPopoverInitialized = false;

  function initColorPickerPopover() {
    if (colorPickerPopoverInitialized) return;
    colorPickerPopoverInitialized = true;
    const modal = qs("colorWheelModal");
    const canvas = qs("settings-color-wheel");
    const wrap = document.querySelector(".settings-color-wheel-wrap");
    const lightnessSlider = qs("settings-lightness-slider");
    const closeBtn = qs("settings-picker-close");
    const modalCloseBtn = qs("colorWheelModalClose");
    if (!modal || !canvas || !wrap) return;

    const closeWheel = () => { applyColorPickerToLayer(); closeColorPickerPopover(); };
    if (closeBtn) closeBtn.addEventListener("click", closeWheel);
    if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeWheel);
    modal.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "colorWheelModal") closeWheel();
    });

    function handleWheelClick(e) {
      const rect = canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      colorPickerHsl = wheelPosToHsl(e.clientX, e.clientY);
      updateWheelMarker();
      applyColorPickerToLayer();
    }

    canvas.addEventListener("mousedown", (e) => {
      handleWheelClick(e);
      const move = (ev) => {
        handleWheelClick(ev);
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });

    if (lightnessSlider) {
      lightnessSlider.addEventListener("input", () => {
        applyColorPickerToLayer();
      });
    }

    drawColorWheel();
  }

  function renderSettingsSavedPresets() {
    const container = qs("settings-saved-presets");
    if (!container) return;
    container.innerHTML = "";
    (state.customThemePresets || []).forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-saved-preset" + (state.themePreset === preset.id ? " selected" : "");
      btn.dataset.presetId = preset.id;
      const swatch = document.createElement("span");
      swatch.className = "settings-saved-preset-swatch";
      swatch.style.background = preset.colors?.accent || "#a855f7";
      const label = document.createElement("span");
      label.className = "settings-saved-preset-name";
      label.textContent = preset.name || preset.id;
      btn.title = preset.name || preset.id;
      btn.appendChild(swatch);
      btn.appendChild(label);
      btn.addEventListener("click", () => selectPreset(preset.id));
      container.appendChild(btn);
    });
  }

  function getCurrentThemeColors() {
    if (state.themeMode === "custom" && state.themeCustom) return { ...state.themeCustom };
    if (state.themePreset && state.themePreset.startsWith("custom_")) {
      const p = state.customThemePresets.find((pr) => pr.id === state.themePreset);
      if (p && p.colors) return { ...p.colors };
    }
    const root = document.documentElement;
    const cs = root ? getComputedStyle(root) : null;
    if (!cs) return { ...DEFAULT_CUSTOM_THEME };
    return {
      bg: cs.getPropertyValue("--bg").trim() || DEFAULT_CUSTOM_THEME.bg,
      bgElevated: cs.getPropertyValue("--bg-elevated").trim() || DEFAULT_CUSTOM_THEME.bgElevated,
      bgPanel: cs.getPropertyValue("--bg-panel").trim() || DEFAULT_CUSTOM_THEME.bgPanel,
      text: cs.getPropertyValue("--text").trim() || DEFAULT_CUSTOM_THEME.text,
      textMuted: cs.getPropertyValue("--text-muted").trim() || DEFAULT_CUSTOM_THEME.textMuted,
      accent: cs.getPropertyValue("--accent").trim() || DEFAULT_CUSTOM_THEME.accent,
      accentHover: cs.getPropertyValue("--accent-hover").trim() || DEFAULT_CUSTOM_THEME.accentHover,
      accentActive: cs.getPropertyValue("--accent-active").trim() || DEFAULT_CUSTOM_THEME.accentActive,
      border: cs.getPropertyValue("--border").trim() || DEFAULT_CUSTOM_THEME.border,
      success: cs.getPropertyValue("--success").trim() || DEFAULT_CUSTOM_THEME.success,
      pieDailies: cs.getPropertyValue("--pie-dailies").trim() || DEFAULT_CUSTOM_THEME.pieDailies,
      pieWeeklies: cs.getPropertyValue("--pie-weeklies").trim() || DEFAULT_CUSTOM_THEME.pieWeeklies,
      pieEndgame: cs.getPropertyValue("--pie-endgame").trim() || DEFAULT_CUSTOM_THEME.pieEndgame,
      pieMissed: cs.getPropertyValue("--pie-missed").trim() || DEFAULT_CUSTOM_THEME.pieMissed,
    };
  }

  function openSavePresetModal() {
    const modal = qs("savePresetModal");
    const input = qs("savePresetNameInput");
    if (!modal || !input) return;
    input.value = "My theme";
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    activateModalFocus(modal);
  }

  function closeSavePresetModal() {
    const modal = qs("savePresetModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      deactivateModalFocus();
    }
  }

  function confirmSavePreset() {
    const input = qs("savePresetNameInput");
    const name = input && input.value ? input.value.trim() : "";
    if (!name) return;
    closeSavePresetModal();
    const colors = getCurrentThemeColors();
    const id = "custom_" + Date.now();
    state.customThemePresets = state.customThemePresets || [];
    state.customThemePresets.push({ id, name, colors });
    state.themeMode = "preset";
    state.themePreset = id;
    applyTheme();
    save();
    syncSettingsUI();
    renderSettingsSavedPresets();
  }

  function openDeletePresetModal() {
    if (!state.themePreset || !state.themePreset.startsWith("custom_")) return;
    const preset = state.customThemePresets.find((p) => p.id === state.themePreset);
    const modal = qs("deletePresetModal");
    const msg = qs("deletePresetMessage");
    if (!modal || !msg) return;
    msg.textContent = 'Are you sure you want to delete "' + (preset ? preset.name : "this preset") + '"? This cannot be undone.';
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    activateModalFocus(modal);
  }

  function closeDeletePresetModal() {
    const modal = qs("deletePresetModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      deactivateModalFocus();
    }
  }

  function confirmDeletePreset() {
    if (!state.themePreset || !state.themePreset.startsWith("custom_")) return;
    closeDeletePresetModal();
    state.customThemePresets = (state.customThemePresets || []).filter((p) => p.id !== state.themePreset);
    state.themePreset = "purple";
    state.themeMode = "preset";
    applyTheme();
    save();
    syncSettingsUI();
    renderSettingsSavedPresets();
  }

  function renderSettingsCustomLayers() {
    const container = qs("settings-custom-layers");
    if (!container) return;
    if (!state.themeCustom) {
      state.themeCustom = { ...DEFAULT_CUSTOM_THEME };
    }
    container.innerHTML = "";
    COLOR_LAYERS.forEach((layer) => {
      const row = document.createElement("div");
      row.className = "settings-custom-layer";
      row.dataset.layerId = layer.id;
      const label = document.createElement("label");
      label.textContent = layer.label;
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "settings-layer-swatch";
      swatch.style.background = state.themeCustom[layer.id] || "#000000";
      swatch.title = layer.label + " (click for color wheel)";
      row.appendChild(label);
      row.appendChild(swatch);
      container.appendChild(row);

      swatch.addEventListener("click", () => {
        openColorPickerPopover(layer.id, layer.label, state.themeCustom[layer.id] || "#000000");
      });
    });
    renderSettingsSavedPresets();
    initColorPickerPopover();
  }

  function updateCustomLayer(layerId, hex) {
    state.themeMode = "custom";
    if (!state.themeCustom) state.themeCustom = { ...DEFAULT_CUSTOM_THEME };
    state.themeCustom[layerId] = hex;
    applyTheme();
    save();
  }

  function syncSettingsUI() {
    document.querySelectorAll(".settings-theme-option").forEach((btn) => {
      const themeId = btn.getAttribute("data-theme");
      const active = state.themeMode === "preset" && themeId === state.themePreset;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const textSizeEl = qs("settingsTextSize");
    if (textSizeEl) textSizeEl.value = state.textSize || "medium";
    const primaryServerEl = qs("settingsPrimaryServer");
    if (primaryServerEl) primaryServerEl.value = state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
    const defaultResetTzEl = qs("settingsDefaultResetTimezone");
    if (defaultResetTzEl) {
      if (defaultResetTzEl.options.length === 0) {
        COMMON_TIMEZONES.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label;
          defaultResetTzEl.appendChild(o);
        });
      }
      defaultResetTzEl.value = state.defaultResetTimezone || "Etc/GMT+5";
    }
    const dateFormatEl = qs("settingsDateFormat");
    if (dateFormatEl) dateFormatEl.value = state.dateFormat || "mdy";
    const timeFormatEl = qs("settingsTimeFormat");
    if (timeFormatEl) timeFormatEl.value = state.timeFormat || "12h";
    const firstDayEl = qs("settingsFirstDayOfWeek");
    if (firstDayEl) firstDayEl.value = String(state.firstDayOfWeek ?? 0);
    const compactEl = qs("settingsCompactMode");
    if (compactEl) compactEl.checked = !!state.compactMode;
    const defaultTabEl = qs("settingsDefaultTab");
    if (defaultTabEl) defaultTabEl.value = state.defaultTab || "about";
    const countdownEl = qs("settingsShowResetCountdown");
    if (countdownEl) countdownEl.checked = state.showResetCountdown !== false;
    const confirmDeleteEl = qs("settingsConfirmBeforeDelete");
    if (confirmDeleteEl) confirmDeleteEl.checked = state.confirmBeforeDelete !== false;
    const undoRow = qs("settingsUndoSimulationRow");
    if (undoRow) undoRow.hidden = !state.lastSimulationSnapshot;
    const undoSkipRow = qs("settingsUndoSkipDayRow");
    if (undoSkipRow) undoSkipRow.hidden = !state.lastSkipDaySnapshot;
    updateCompletionUndoUI();
    const schemaEl = qs("settingsDebugSchemaVersion");
    if (schemaEl) {
      schemaEl.textContent = String(Number(state.schemaVersion) || 0) + " / target " + (typeof SCHEMA_VERSION !== "undefined" ? SCHEMA_VERSION : 2);
    }
    const standardTab = document.querySelector('.settings-tab-btn[data-color-tab="standard"]');
    const customTab = document.querySelector('.settings-tab-btn[data-color-tab="custom"]');
    const standardPanel = qs("settings-color-standard");
    const customPanel = qs("settings-color-custom");
    const isCustom = state.themeMode === "custom" || (state.themePreset && state.themePreset.startsWith("custom_"));
    if (standardTab) {
      standardTab.classList.toggle("active", !isCustom);
      standardTab.setAttribute("aria-selected", !isCustom ? "true" : "false");
    }
    if (customTab) {
      customTab.classList.toggle("active", isCustom);
      customTab.setAttribute("aria-selected", isCustom ? "true" : "false");
    }
    if (standardPanel) {
      standardPanel.classList.toggle("active", !isCustom);
      standardPanel.hidden = isCustom;
    }
    if (customPanel) {
      customPanel.classList.toggle("active", isCustom);
      customPanel.hidden = !isCustom;
    }
  }

  function updateCompletionUndoUI() {
    const btn = document.getElementById("settingsUndoCompletionBtn");
    const hint = document.getElementById("settingsUndoCompletionHint");
    const can = typeof canUndoCompletion === "function" && canUndoCompletion();
    if (btn) {
      btn.disabled = !can;
      const label = typeof getCompletionUndoLabel === "function" ? getCompletionUndoLabel() : "";
      btn.title = can ? "Undo: " + label : "Nothing to undo";
    }
    if (hint) {
      hint.textContent = can
        ? "Next undo: " + (typeof getCompletionUndoLabel === "function" ? getCompletionUndoLabel() : "") + " (Ctrl+Z)"
        : "Ctrl+Z also undoes the last complete/incomplete (this session)";
    }
  }

  function downloadTextFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const shareCardSelected = new Set();
  /** Once the user Clears or toggles pills, empty selection must stay empty (do not re-select all). */
  let shareCardSelectionTouched = false;

  function syncShareCardCustomRow() {
    const daysEl = qs("settingsShareCardDays");
    const row = qs("settingsShareCardCustomRow");
    if (!row) return;
    const custom = daysEl && daysEl.value === "custom";
    row.hidden = !custom;
    if (custom) {
      const today = typeof getDateStr === "function" ? getDateStr() : new Date().toISOString().slice(0, 10);
      const startEl = qs("settingsShareCardStart");
      const endEl = qs("settingsShareCardEnd");
      if (startEl && !startEl.value) {
        const d = new Date(today + "T12:00:00");
        d.setDate(d.getDate() - 89);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        startEl.value = y + "-" + m + "-" + day;
      }
      if (endEl && !endEl.value) endEl.value = today;
    }
  }

  function renderShareCardGamePills() {
    const wrap = qs("settingsShareCardGames");
    if (!wrap) return;
    const games = typeof getAllGames === "function" ? getAllGames() : [];
    // Default to all games only before the user has touched the selector.
    if (!shareCardSelectionTouched && shareCardSelected.size === 0 && games.length) {
      games.forEach((g) => shareCardSelected.add(g.id));
    }
    // Drop ids for games that no longer exist
    Array.from(shareCardSelected).forEach((id) => {
      if (!games.some((g) => g.id === id)) shareCardSelected.delete(id);
    });
    wrap.innerHTML = "";
    if (!games.length) {
      const p = document.createElement("p");
      p.className = "settings-hint";
      p.textContent = "No games yet. Add one in Games first.";
      wrap.appendChild(p);
      return;
    }
    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timestamps-game-pill";
      btn.textContent = game.name;
      const on = shareCardSelected.has(game.id);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) btn.classList.add("filled");
      btn.addEventListener("click", () => {
        shareCardSelectionTouched = true;
        if (shareCardSelected.has(game.id)) shareCardSelected.delete(game.id);
        else shareCardSelected.add(game.id);
        renderShareCardGamePills();
      });
      wrap.appendChild(btn);
    });
  }

  function getShareCardExportOpts() {
    const daysEl = qs("settingsShareCardDays");
    const mode = daysEl ? daysEl.value : "90";
    const opts = { gameIds: Array.from(shareCardSelected) };
    if (mode === "custom") {
      const startEl = qs("settingsShareCardStart");
      const endEl = qs("settingsShareCardEnd");
      opts.startStr = startEl && startEl.value;
      opts.endStr = endEl && endEl.value;
    } else {
      opts.days = Number(mode) || 90;
    }
    return opts;
  }

  function updateAccountUI(user) {
    const statusEl = qs("accountStatus");
    const loginBtns = qs("accountLoginButtons");
    const logoutRow = qs("accountLogoutRow");
    if (!statusEl || !loginBtns || !logoutRow) return;

    if (user) {
      const provider = user.providerData && user.providerData[0] ? user.providerData[0].providerId : "";
      const providerName = provider === "google.com" ? "Google" : provider === "facebook.com" ? "Facebook" : provider === "twitter.com" ? "Twitter" : "Account";
      statusEl.textContent = "Signed in with " + providerName + " (" + (user.email || user.displayName || "signed in") + ")";
      statusEl.className = "account-status account-signed-in";
      loginBtns.hidden = true;
      logoutRow.hidden = false;
    } else {
      statusEl.textContent = "";
      statusEl.className = "account-status";
      loginBtns.hidden = false;
      logoutRow.hidden = true;
    }
  }

  function initSettingsModal() {
    const modalEl = qs("settingsModal");
    const closeBtn = qs("settingsModalClose");
    const settingsBtn = qs("sidebarSettingsBtn");

    if (!modalEl) return;

    if (settingsBtn) settingsBtn.addEventListener("click", openSettingsModal);

    const loginGoogle = qs("accountLoginGoogle");
    const loginFacebook = qs("accountLoginFacebook");
    const loginTwitter = qs("accountLoginTwitter");
    const logoutBtn = qs("accountLogoutBtn");
    if (loginGoogle && typeof window.signInWithGoogle === "function") loginGoogle.addEventListener("click", window.signInWithGoogle);
    if (loginFacebook && typeof window.signInWithFacebook === "function") loginFacebook.addEventListener("click", window.signInWithFacebook);
    if (loginTwitter && typeof window.signInWithTwitter === "function") loginTwitter.addEventListener("click", window.signInWithTwitter);
    if (logoutBtn && typeof window.signOutCloud === "function") logoutBtn.addEventListener("click", window.signOutCloud);

    if (typeof window.updateAccountUI === "function") {
      window.updateAccountUI = updateAccountUI;
      updateAccountUI(window.getFirebaseUser ? window.getFirebaseUser() : null);
    }


    function setSettingsSectionDropdownOpen(open) {
      const trigger = qs("settingsSectionTrigger");
      const menu = qs("settingsSectionMenu");
      if (!trigger || !menu) return;
      const isOpen = !!open;
      trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      menu.hidden = !isOpen;
    }

    function syncSettingsSectionDropdown(section) {
      const labelEl = qs("settingsSectionTriggerLabel");
      const menu = qs("settingsSectionMenu");
      if (!menu) return;
      let label = "Appearance";
      menu.querySelectorAll('[role="option"]').forEach((opt) => {
        const on = opt.getAttribute("data-settings-section") === section;
        opt.setAttribute("aria-selected", on ? "true" : "false");
        if (on) label = (opt.textContent || "").trim() || label;
      });
      if (labelEl) labelEl.textContent = label;
    }

    function activateSettingsSection(section) {
      if (!section) return;
      document.querySelectorAll(".settings-nav-item[data-settings-section]").forEach((b) => {
        const on = b.getAttribute("data-settings-section") === section;
        b.classList.toggle("active", on);
        if (on) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      document.querySelectorAll(".settings-section").forEach((sectionEl) => {
        sectionEl.classList.remove("active");
      });
      const target = document.getElementById("settings-section-" + section);
      if (target) target.classList.add("active");
      syncSettingsSectionDropdown(section);
      setSettingsSectionDropdownOpen(false);
      if (section === "stock-assets") fillSettingsStockAssetsGallery();
    }

    document.querySelectorAll(".settings-nav-item[data-settings-section]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activateSettingsSection(btn.getAttribute("data-settings-section"));
      });
    });

    const settingsSectionTrigger = qs("settingsSectionTrigger");
    const settingsSectionMenu = qs("settingsSectionMenu");
    const settingsSectionDropdown = qs("settingsSectionDropdown");
    if (settingsSectionTrigger && settingsSectionMenu) {
      settingsSectionTrigger.addEventListener("click", (e) => {
        e.preventDefault();
        const open = settingsSectionTrigger.getAttribute("aria-expanded") === "true";
        setSettingsSectionDropdownOpen(!open);
      });
      settingsSectionMenu.querySelectorAll('[role="option"]').forEach((opt) => {
        opt.addEventListener("click", () => {
          activateSettingsSection(opt.getAttribute("data-settings-section"));
        });
      });
      document.addEventListener("click", (e) => {
        if (!settingsSectionDropdown || settingsSectionMenu.hidden) return;
        if (settingsSectionDropdown.contains(e.target)) return;
        setSettingsSectionDropdownOpen(false);
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && settingsSectionTrigger.getAttribute("aria-expanded") === "true") {
          setSettingsSectionDropdownOpen(false);
          settingsSectionTrigger.focus();
        }
      });
    }

    const textSizeEl = qs("settingsTextSize");
    if (textSizeEl) textSizeEl.addEventListener("change", () => {
      state.textSize = textSizeEl.value || "medium";
      applyTextSize();
      save();
    });
    const primaryServerEl = qs("settingsPrimaryServer");
    if (primaryServerEl) primaryServerEl.addEventListener("change", () => {
      const v = primaryServerEl.value;
      if (["america", "asia", "europe"].includes(v)) {
        state.primaryServer = v;
        save();
        updateSidebarTime();
      }
    });
    const defaultResetTzEl = qs("settingsDefaultResetTimezone");
    if (defaultResetTzEl) defaultResetTzEl.addEventListener("change", () => {
      state.defaultResetTimezone = defaultResetTzEl.value || "Etc/GMT+5";
      freezeTalliesOnTimezoneChange();
      save();
      updateSidebarTime();
      // display-only: active tab + chrome
      renderActiveTab();
    });
    const dateFormatEl = qs("settingsDateFormat");
    if (dateFormatEl) dateFormatEl.addEventListener("change", () => {
      state.dateFormat = dateFormatEl.value || "mdy";
      save();
      // display-only: active tab + chrome
      renderActiveTab();
    });
    const timeFormatEl = qs("settingsTimeFormat");
    if (timeFormatEl) timeFormatEl.addEventListener("change", () => {
      state.timeFormat = timeFormatEl.value || "12h";
      save();
      updateSidebarTime();
    });
    const syncLocalTzBtn = qs("settingsSyncLocalTimezoneBtn");
    if (syncLocalTzBtn) syncLocalTzBtn.addEventListener("click", () => {
      const matched = getMatchingTimezoneForLocalOffset();
      state.defaultResetTimezone = matched;
      const defaultResetTzEl = qs("settingsDefaultResetTimezone");
      if (defaultResetTzEl) defaultResetTzEl.value = matched;
      freezeTalliesOnTimezoneChange();
      save();
      updateSidebarTime();
      // display-only: active tab + chrome
      renderActiveTab();
    });
    const firstDayEl = qs("settingsFirstDayOfWeek");
    if (firstDayEl) firstDayEl.addEventListener("change", () => {
      state.firstDayOfWeek = parseInt(firstDayEl.value, 10) || 0;
      save();
      // display-only: active tab + chrome
      renderActiveTab();
    });
    const compactEl = qs("settingsCompactMode");
    if (compactEl) compactEl.addEventListener("change", () => {
      state.compactMode = compactEl.checked;
      applyCompactMode();
      save();
      // display-only: active tab + chrome
      renderActiveTab();
    });
    const defaultTabEl = qs("settingsDefaultTab");
    if (defaultTabEl) defaultTabEl.addEventListener("change", () => {
      state.defaultTab = defaultTabEl.value || "about";
      save();
    });
    const countdownEl = qs("settingsShowResetCountdown");
    if (countdownEl) countdownEl.addEventListener("change", () => {
      state.showResetCountdown = countdownEl.checked;
      save();
      updateSidebarTime();
    });
    const confirmDeleteEl = qs("settingsConfirmBeforeDelete");
    if (confirmDeleteEl) confirmDeleteEl.addEventListener("change", () => {
      state.confirmBeforeDelete = confirmDeleteEl.checked;
      save();
    });

    const exportBtn = qs("settingsExportBtn");
    if (exportBtn) exportBtn.addEventListener("click", () => {
      // Ensure debounced edits are flushed, then export the in-memory full payload (includes images).
      if (typeof flushPendingSave === "function") flushPendingSave();
      save({ immediate: true });
      const raw = JSON.stringify(buildSavePayload());
      if (!raw || raw === "{}") {
        alert("Nothing to export yet — local save is empty.");
        return;
      }
      const payload = JSON.stringify({ [STORAGE_KEY]: raw }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gacha-tracker-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    const exportMdBtn = qs("settingsExportSummaryMdBtn");
    if (exportMdBtn) exportMdBtn.addEventListener("click", () => {
      const md = buildExportSummaryMarkdown({ days: 90 });
      downloadTextFile("gacha-tracker-summary-" + new Date().toISOString().slice(0, 10) + ".md", md, "text/markdown;charset=utf-8");
    });
    const exportCsvBtn = qs("settingsExportSummaryCsvBtn");
    if (exportCsvBtn) exportCsvBtn.addEventListener("click", () => {
      const csv = buildExportSummaryCsv({ days: 90 });
      downloadTextFile("gacha-tracker-completions-" + new Date().toISOString().slice(0, 10) + ".csv", csv, "text/csv;charset=utf-8");
    });

    const shareDaysEl = qs("settingsShareCardDays");
    if (shareDaysEl) shareDaysEl.addEventListener("change", syncShareCardCustomRow);
    const shareAllBtn = qs("settingsShareCardSelectAllBtn");
    if (shareAllBtn) shareAllBtn.addEventListener("click", () => {
      const games = typeof getAllGames === "function" ? getAllGames() : [];
      shareCardSelectionTouched = true;
      shareCardSelected.clear();
      games.forEach((g) => shareCardSelected.add(g.id));
      renderShareCardGamePills();
    });
    const shareNoneBtn = qs("settingsShareCardSelectNoneBtn");
    if (shareNoneBtn) shareNoneBtn.addEventListener("click", () => {
      shareCardSelectionTouched = true;
      shareCardSelected.clear();
      renderShareCardGamePills();
    });
    const shareExportBtn = qs("settingsShareCardExportBtn");
    if (shareExportBtn) shareExportBtn.addEventListener("click", () => {
      if (typeof downloadShareCardPng !== "function") {
        alert("Share card export is unavailable.");
        return;
      }
      const result = downloadShareCardPng(getShareCardExportOpts());
      if (!result.ok) alert(result.reason || "Could not export share card.");
    });

    function updateShareCardPreview() {
      const wrap = qs("settingsShareCardPreview");
      const img = qs("settingsShareCardPreviewImg");
      const meta = qs("settingsShareCardPreviewMeta");
      if (!wrap || !img) return;
      if (typeof buildShareCardModel !== "function" || typeof renderShareCardCanvas !== "function") {
        wrap.hidden = false;
        if (meta) meta.textContent = "Preview unavailable.";
        return;
      }
      const model = buildShareCardModel(getShareCardExportOpts());
      if (!model.ok) {
        wrap.hidden = false;
        img.removeAttribute("src");
        if (meta) meta.textContent = model.reason || "Nothing to preview.";
        return;
      }
      const rendered = renderShareCardCanvas(model);
      if (!rendered.ok) {
        wrap.hidden = false;
        img.removeAttribute("src");
        if (meta) meta.textContent = rendered.reason || "Could not render preview.";
        return;
      }
      img.src = rendered.canvas.toDataURL("image/png");
      wrap.hidden = false;
      if (meta) {
        meta.textContent =
          rendered.width +
          "×" +
          rendered.height +
          " · " +
          model.gameCount +
          " game" +
          (model.gameCount === 1 ? "" : "s");
      }
    }

    const sharePreviewBtn = qs("settingsShareCardPreviewBtn");
    if (sharePreviewBtn) sharePreviewBtn.addEventListener("click", () => updateShareCardPreview());

    const undoCompletionBtn = qs("settingsUndoCompletionBtn");
    if (undoCompletionBtn) undoCompletionBtn.addEventListener("click", () => {
      const result = undoLastCompletion();
      if (!result.ok) {
        alert(result.reason || "Nothing to undo");
        return;
      }
      syncSettingsUI();
    });
    const importInput = qs("settingsImportInput");
    if (importInput) importInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          let data = null;
          // Preferred backup shape: { "gacha-tracker": "<json string>" }
          if (parsed && typeof parsed[STORAGE_KEY] === "string") {
            data = JSON.parse(parsed[STORAGE_KEY]);
          } else if (parsed && parsed[STORAGE_KEY] && typeof parsed[STORAGE_KEY] === "object") {
            // Tolerate already-parsed inner payload
            data = parsed[STORAGE_KEY];
          } else if (parsed && Array.isArray(parsed.games)) {
            // Tolerate raw save payload without wrapper
            data = parsed;
          }
          if (!data || !Array.isArray(data.games)) {
            throw new Error("Invalid backup file (expected Export data JSON)");
          }
          const keys = Object.keys(data);
          keys.forEach((k) => {
            if (state[k] !== undefined && k !== "lastSimulationSnapshot") state[k] = data[k];
          });
          state.lastSimulationSnapshot = null;
          if (typeof clearCompletionUndoStack === "function") clearCompletionUndoStack();
          // Must flush before load(), or load() reloads the previous localStorage and undoes the import.
          save({ immediate: true });
          load();
          // bulk state change: full refresh
          renderAll();
          const report = qs("settingsDebugReport");
          if (report && typeof formatConflictScanReport === "function" && typeof scanDataConflicts === "function") {
            report.textContent =
              "Import complete. Suggested next step: open Debug and scan for conflicts.\n\n" +
              formatConflictScanReport(scanDataConflicts());
          }
          alert("Import complete. Your local backup is now loaded on this site.");
          closeSettingsModal();
        } catch (err) {
          alert("Failed to import: " + (err.message || "Invalid file"));
        }
        importInput.value = "";
      };
      reader.readAsText(file);
    });

    function showRepairResult(result) {
      const report = qs("settingsDebugReport");
      if (!report) return;
      const lines = [];
      lines.push("Repair mode: " + (result.mode || "safe"));
      lines.push("Actions:");
      (result.actions || []).forEach((a) => lines.push("  • " + a));
      lines.push("");
      lines.push("Before — " + result.before.counts.total + " conflict(s)");
      lines.push("After  — " + result.after.counts.total + " conflict(s)");
      const infoLeft = result.after.counts.info || 0;
      const warnLeft = (result.after.counts.warn || 0) + (result.after.counts.error || 0);
      if (infoLeft && !warnLeft) {
        lines.push("");
        lines.push(
          "Remaining items are [info] only (usually calendar marks without timestamps). Those are not auto-fixed."
        );
      }
      lines.push("");
      lines.push(formatConflictScanReport(result.after));
      report.textContent = lines.join("\n");
      syncSettingsUI();
    }

    const repairDataBtn = qs("settingsRepairDataBtn");
    if (repairDataBtn) repairDataBtn.addEventListener("click", () => {
      if (!confirm("Repair current data?\n\nThis rebuilds completion days from timestamps, clamps unlock windows, fills remaining cycle days, and syncs tallies.")) return;
      const result = runIntegrityRepair("safe");
      showRepairResult(result);
      alert(
        "Repair finished.\nConflicts: " +
          result.before.counts.total +
          " → " +
          result.after.counts.total +
          "\n\nSee Settings → Debug for the full report."
      );
    });

    const debugScanBtn = qs("settingsDebugScanBtn");
    if (debugScanBtn) debugScanBtn.addEventListener("click", () => {
      const report = qs("settingsDebugReport");
      if (report) report.textContent = formatConflictScanReport(scanDataConflicts());
      syncSettingsUI();
    });
    const debugRepairSafeBtn = qs("settingsDebugRepairSafeBtn");
    if (debugRepairSafeBtn) debugRepairSafeBtn.addEventListener("click", () => {
      if (!confirm("Run safe integrity repair on current data?")) return;
      showRepairResult(runIntegrityRepair("safe"));
    });
    const debugRepairTsBtn = qs("settingsDebugRepairTimestampsBtn");
    if (debugRepairTsBtn) debugRepairTsBtn.addEventListener("click", () => {
      if (!confirm("Repair preferring timestamps (rebuild early calendar marks from timestamps)?")) return;
      showRepairResult(runIntegrityRepair("prefer-timestamps"));
    });
    const debugRepairTalliesBtn = qs("settingsDebugRepairTalliesBtn");
    if (debugRepairTalliesBtn) debugRepairTalliesBtn.addEventListener("click", () => {
      if (!confirm("Rebuild all completed/attempted tallies from the calendar only?")) return;
      showRepairResult(runIntegrityRepair("tallies-only"));
    });
    const debugFillTimesBtn = qs("settingsDebugFillMissingTimesBtn");
    if (debugFillTimesBtn) debugFillTimesBtn.addEventListener("click", () => openDebugFillMissingTimes());
    const debugFixTimesDatesBtn = qs("settingsDebugFixTimesDatesBtn");
    if (debugFixTimesDatesBtn) debugFixTimesDatesBtn.addEventListener("click", () => openDebugFixTimesDates());

    function getSelectedCompactMonths() {
      const sel = qs("settingsCompactMonths");
      return sel ? Number(sel.value) || 12 : 12;
    }

    function formatCompactPreview(preview) {
      if (!preview) return "No preview.";
      const lines = [];
      lines.push("Compact preview");
      lines.push("Keep calendar after: " + preview.cutoffDateStr + " (drop on/before)");
      lines.push("Months: " + preview.months);
      lines.push("Calendar days to remove: " + preview.removedCalendarDays);
      lines.push("Completion marks to remove: " + preview.removedMarks);
      lines.push("Tallies: unchanged (archived baselines keep Sync correct)");
      if (preview.existingCutoff) lines.push("Existing archive cutoff: " + preview.existingCutoff);
      if (preview.removedCalendarDays === 0) lines.push("Nothing to compact for this range.");
      return lines.join("\n");
    }

    const compactPreviewBtn = qs("settingsCompactPreviewBtn");
    if (compactPreviewBtn) compactPreviewBtn.addEventListener("click", () => {
      const report = qs("settingsDebugReport");
      if (!report || typeof previewHistoryCompact !== "function") return;
      report.textContent = formatCompactPreview(previewHistoryCompact(getSelectedCompactMonths()));
    });

    const compactApplyBtn = qs("settingsCompactApplyBtn");
    if (compactApplyBtn) compactApplyBtn.addEventListener("click", () => {
      if (typeof previewHistoryCompact !== "function" || typeof applyHistoryCompact !== "function") return;
      const months = getSelectedCompactMonths();
      const preview = previewHistoryCompact(months);
      const report = qs("settingsDebugReport");
      if (report) report.textContent = formatCompactPreview(preview);
      if (preview.removedCalendarDays === 0) {
        alert("Nothing to compact for the selected range.");
        return;
      }
      if (
        !confirm(
          "Compact history older than " +
            months +
            " month(s)?\n\n" +
            "Remove " +
            preview.removedCalendarDays +
            " calendar day(s) and " +
            preview.removedMarks +
            " mark(s) on/before " +
            preview.cutoffDateStr +
            ".\nTallies stay the same; Sync will use archived baselines.\n\nContinue?"
        )
      ) {
        return;
      }
      if (confirm("Download a full JSON backup before compacting?\n\nOK = download then compact\nCancel = compact without new download")) {
        const data = JSON.stringify(buildSavePayload(), null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "gacha-tracker-pre-compact-" + new Date().toISOString().slice(0, 10) + ".json";
        a.click();
        URL.revokeObjectURL(a.href);
      }
      const result = applyHistoryCompact(months);
      if (report) {
        const lines = [formatCompactPreview(result.preview || preview)];
        if (result.ok) {
          lines.push("");
          lines.push("Applied. New archive cutoff: " + (result.historyCompact && result.historyCompact.cutoffDateStr));
        } else {
          lines.push("");
          lines.push("Not applied: " + (result.reason || "unknown"));
        }
        report.textContent = lines.join("\n");
      }
      if (result.ok) alert("History compacted. Tallies unchanged.");
      else alert(result.reason || "Compact did not run.");
    });

    const simulateBtn = qs("settingsSimulateBtn");
    if (simulateBtn) simulateBtn.addEventListener("click", () => {
      runSimulation();
      closeSettingsModal();
    });
    const undoBtn = qs("settingsUndoSimulationBtn");
    if (undoBtn) undoBtn.addEventListener("click", () => {
      undoSimulation();
      closeSettingsModal();
    });
    const skipDayBtn = qs("settingsSkipDayBtn");
    if (skipDayBtn) skipDayBtn.addEventListener("click", () => {
      skipDayForward();
      syncSettingsUI();
      closeSettingsModal();
    });
    const skipTimeBtn = qs("settingsSkipTimeBtn");
    const skipHoursInput = qs("settingsSkipHoursInput");
    if (skipTimeBtn && skipHoursInput) skipTimeBtn.addEventListener("click", () => {
      skipTimeForward(Number(skipHoursInput.value) || 1);
      syncSettingsUI();
      closeSettingsModal();
    });
    const undoSkipBtn = qs("settingsUndoSkipDayBtn");
    if (undoSkipBtn) undoSkipBtn.addEventListener("click", () => {
      undoSkipDay();
      syncSettingsUI();
      closeSettingsModal();
    });
    const clearBtn = qs("settingsClearDataBtn");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      if (state.confirmBeforeDelete === false) {
        confirmClearData();
        return;
      }
      openClearDataModal();
    });

    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeSettingsModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeSettingsModal);

    document.querySelectorAll('.settings-tab-btn[data-color-tab]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-color-tab");
        const isCustom = tab === "custom";
        state.themeMode = isCustom ? "custom" : "preset";
        if (isCustom && !state.themeCustom) {
          state.themeCustom = { ...DEFAULT_CUSTOM_THEME };
        }
        applyTheme();
        save();
        syncSettingsUI();
        if (isCustom) renderSettingsCustomLayers();
      });
    });

    const saveBtn = qs("settings-save-preset-btn");
    const deleteBtn = qs("settings-delete-preset-btn");
    if (saveBtn) saveBtn.addEventListener("click", openSavePresetModal);
    if (deleteBtn) deleteBtn.addEventListener("click", openDeletePresetModal);

    qs("savePresetModal")?.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "savePresetModal") closeSavePresetModal();
    });
    qs("savePresetModalClose")?.addEventListener("click", closeSavePresetModal);
    qs("savePresetCancel")?.addEventListener("click", closeSavePresetModal);
    qs("savePresetConfirm")?.addEventListener("click", confirmSavePreset);
    qs("savePresetNameInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmSavePreset();
    });

    qs("deletePresetModal")?.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "deletePresetModal") closeDeletePresetModal();
    });
    qs("deletePresetModalClose")?.addEventListener("click", closeDeletePresetModal);
    qs("deletePresetCancel")?.addEventListener("click", closeDeletePresetModal);
    qs("deletePresetConfirm")?.addEventListener("click", confirmDeletePreset);

    qs("clearDataModal")?.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "clearDataModal") closeClearDataModal();
    });
    qs("clearDataModalClose")?.addEventListener("click", closeClearDataModal);
    qs("clearDataCancel")?.addEventListener("click", closeClearDataModal);
    qs("clearDataConfirm")?.addEventListener("click", confirmClearData);

    document.addEventListener("keydown", (e) => {
      if (!settingsModalOpen && !clearDataModalOpen) return;
      if (e.key === "Escape") {
        const top = typeof getTopOpenModal === "function" ? getTopOpenModal() : null;
        // Nested modals (Fill missing times, etc.) handle their own Escape.
        if (top && top.id && top.id !== "settingsModal" && top.id !== "clearDataModal") return;
        if (clearDataModalOpen) {
          closeClearDataModal();
        } else if (colorPickerEditingLayerId) {
          applyColorPickerToLayer();
          closeColorPickerPopover();
        } else {
          closeSettingsModal();
        }
      }
    });

  }

  function emptyBannerView(aspect) {
    return {
      aspect: (Number.isFinite(aspect) && aspect > 0) ? aspect : 16 / 9,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    };
  }

  function emptyTaskBannerViews() {
    return {
      home: null,
      games: null,
      board: null,
    };
  }

  function defaultFitBannerView(stageAspect, imageAspect) {
    const aspect = (Number(stageAspect) > 0) ? Number(stageAspect) : 16 / 9;
    const imgAspect = (Number(imageAspect) > 0) ? Number(imageAspect) : aspect;
    if (imgAspect >= aspect) {
      const h = aspect / imgAspect;
      return { aspect: aspect, x: 0, y: (1 - h) / 2, w: 1, h: h };
    }
    const w = imgAspect / aspect;
    return { aspect: aspect, x: (1 - w) / 2, y: 0, w: w, h: 1 };
  }

  function cloneBannerView(view, fallbackAspect) {
    if (!view || typeof view !== "object") return emptyBannerView(fallbackAspect);
    return {
      aspect: (Number(view.aspect) > 0) ? Number(view.aspect) : (fallbackAspect || 16 / 9),
      x: Number.isFinite(Number(view.x)) ? Number(view.x) : 0,
      y: Number.isFinite(Number(view.y)) ? Number(view.y) : 0,
      w: Number(view.w) > 0 ? Number(view.w) : 1,
      h: Number(view.h) > 0 ? Number(view.h) : 1,
    };
  }

  function resolveTaskBannerSource(task) {
    if (!task) return null;
    if (task.bannerSourceImage) return task.bannerSourceImage;
    return task.bannerImage || task.bannerHomeImage || task.bannerGamesImage || null;
  }

  function resolveTaskBannerView(task, surface) {
    const s = surface || "board";
    const fallback = (TASK_BANNER_TARGETS[s] || TASK_BANNER_TARGETS.board).aspect;
    if (task && task.bannerViews && task.bannerViews[s]) {
      return cloneBannerView(task.bannerViews[s], fallback);
    }
    return null;
  }

  function loadTaskBannersFromTask(task) {
    const source = resolveTaskBannerSource(task);
    const views = emptyTaskBannerViews();
    if (task && task.bannerViews) {
      views.home = task.bannerViews.home ? cloneBannerView(task.bannerViews.home, TASK_BANNER_TARGETS.home.aspect) : null;
      views.games = task.bannerViews.games ? cloneBannerView(task.bannerViews.games, TASK_BANNER_TARGETS.games.aspect) : null;
      views.board = task.bannerViews.board ? cloneBannerView(task.bannerViews.board, TASK_BANNER_TARGETS.board.aspect) : null;
    }
    return { source: source, views: views };
  }

  function getActiveTaskBannerView() {
    const key = taskModal.bannerTarget || "board";
    if (!taskModal.bannerViews) taskModal.bannerViews = emptyTaskBannerViews();
    const fallback = (TASK_BANNER_TARGETS[key] || TASK_BANNER_TARGETS.board).aspect;
    if (!taskModal.bannerViews[key]) return null;
    return cloneBannerView(taskModal.bannerViews[key], fallback);
  }

  function applyTaskBannersToSavePayload(next) {
    if (taskModal.bannerSource) {
      next.bannerSourceImage = taskModal.bannerSource;
      const img = taskBannerCrop.sourceImg;
      const imageAspect = (img && img.naturalWidth > 0)
        ? (img.naturalWidth / img.naturalHeight)
        : 16 / 9;
      const ensureView = (key, fallbackAspect) => {
        if (taskModal.bannerViews && taskModal.bannerViews[key]) {
          return cloneBannerView(taskModal.bannerViews[key], fallbackAspect);
        }
        return defaultFitBannerView(fallbackAspect, imageAspect);
      };
      next.bannerViews = {
        home: ensureView("home", TASK_BANNER_TARGETS.home.aspect),
        games: ensureView("games", TASK_BANNER_TARGETS.games.aspect),
        board: ensureView("board", TASK_BANNER_TARGETS.board.aspect),
      };
    } else {
      next.bannerSourceImage = undefined;
      next.bannerViews = undefined;
    }
    next.bannerImage = undefined;
    next.bannerAspect = undefined;
    next.bannerShape = undefined;
    next.bannerHomeImage = undefined;
    next.bannerHomeAspect = undefined;
    next.bannerGamesImage = undefined;
    next.bannerGamesAspect = undefined;
  }

  function clearTaskBannerFieldsFromMerged(merged) {
    if (!taskModal.bannerSource) {
      delete merged.bannerSourceImage;
      delete merged.bannerViews;
    }
    delete merged.bannerImage;
    delete merged.bannerAspect;
    delete merged.bannerShape;
    delete merged.bannerHomeImage;
    delete merged.bannerHomeAspect;
    delete merged.bannerGamesImage;
    delete merged.bannerGamesAspect;
  }

  function resetTaskBannerCropState() {
    taskBannerCrop.sourceImg = null;
    taskBannerCrop.imgX = 0;
    taskBannerCrop.imgY = 0;
    taskBannerCrop.imgW = 0;
    taskBannerCrop.imgH = 0;
    taskBannerCrop.cropX = 0;
    taskBannerCrop.cropY = 0;
    taskBannerCrop.cropW = 0;
    taskBannerCrop.cropH = 0;
    taskBannerCrop.mode = null;
    taskBannerCrop.clear = false;
  }

  function getTaskBannerCropAspect() {
    const target = taskModal.bannerTarget || "board";
    if (target === "home" || target === "games") {
      return (TASK_BANNER_TARGETS[target] || TASK_BANNER_TARGETS.home).aspect;
    }
    if (taskBannerCrop.cropW > 0 && taskBannerCrop.cropH > 0) {
      return taskBannerCrop.cropW / taskBannerCrop.cropH;
    }
    if (taskModal.bannerViews && taskModal.bannerViews.board && Number(taskModal.bannerViews.board.aspect) > 0) {
      return Number(taskModal.bannerViews.board.aspect);
    }
    const img = taskBannerCrop.sourceImg;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      return img.naturalWidth / img.naturalHeight;
    }
    return 16 / 9;
  }

  function getTaskBannerImageAspect() {
    const img = taskBannerCrop.sourceImg;
    if (!img || !(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return 16 / 9;
    return img.naturalWidth / img.naturalHeight;
  }

  function softClampTaskBannerRect(kind) {
    const stage = TASK_BANNER_STAGE;
    const margin = 24;
    const isImg = kind === "img";
    let x = isImg ? taskBannerCrop.imgX : taskBannerCrop.cropX;
    let y = isImg ? taskBannerCrop.imgY : taskBannerCrop.cropY;
    const w = isImg ? taskBannerCrop.imgW : taskBannerCrop.cropW;
    const h = isImg ? taskBannerCrop.imgH : taskBannerCrop.cropH;
    if (x + w < margin) x = margin - w;
    if (y + h < margin) y = margin - h;
    if (x > stage.w - margin) x = stage.w - margin;
    if (y > stage.h - margin) y = stage.h - margin;
    if (isImg) {
      taskBannerCrop.imgX = x;
      taskBannerCrop.imgY = y;
    } else {
      taskBannerCrop.cropX = x;
      taskBannerCrop.cropY = y;
    }
  }

  function placeTaskBannerCropBox(aspect) {
    const stage = TASK_BANNER_STAGE;
    const a = (Number(aspect) > 0) ? Number(aspect) : 16 / 9;
    const pad = 28;
    const maxW = Math.max(40, stage.w - pad * 2);
    const maxH = Math.max(40, stage.h - pad * 2);
    let cropW;
    let cropH;
    if (maxW / maxH > a) {
      cropH = maxH * 0.82;
      cropW = cropH * a;
    } else {
      cropW = maxW * 0.82;
      cropH = cropW / a;
    }
    if (cropW < TASK_BANNER_CROP_MIN) {
      cropW = TASK_BANNER_CROP_MIN;
      cropH = cropW / a;
    }
    if (cropH < TASK_BANNER_CROP_MIN) {
      cropH = TASK_BANNER_CROP_MIN;
      cropW = cropH * a;
    }
    taskBannerCrop.cropW = cropW;
    taskBannerCrop.cropH = cropH;
    taskBannerCrop.cropX = (stage.w - cropW) / 2;
    taskBannerCrop.cropY = (stage.h - cropH) / 2;
  }

  function fitTaskBannerImageToStage() {
    const img = taskBannerCrop.sourceImg;
    if (!img) return;
    const stage = TASK_BANNER_STAGE;
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    const scale = Math.min(stage.w / nw, stage.h / nh) * 0.92;
    taskBannerCrop.imgW = nw * scale;
    taskBannerCrop.imgH = nh * scale;
    taskBannerCrop.imgX = (stage.w - taskBannerCrop.imgW) / 2;
    taskBannerCrop.imgY = (stage.h - taskBannerCrop.imgH) / 2;
    placeTaskBannerCropBox(getTaskBannerCropAspect());
  }

  function applyBannerViewToStage(view) {
    if (!view || !(Number(view.w) > 0) || !(Number(view.h) > 0)) {
      fitTaskBannerImageToStage();
      return;
    }
    const aspect = (Number(view.aspect) > 0)
      ? Number(view.aspect)
      : getTaskBannerCropAspect();
    placeTaskBannerCropBox(aspect);
    const v = cloneBannerView(view, aspect);
    taskBannerCrop.imgX = taskBannerCrop.cropX + v.x * taskBannerCrop.cropW;
    taskBannerCrop.imgY = taskBannerCrop.cropY + v.y * taskBannerCrop.cropH;
    taskBannerCrop.imgW = Math.max(0.001, v.w) * taskBannerCrop.cropW;
    taskBannerCrop.imgH = Math.max(0.001, v.h) * taskBannerCrop.cropH;
    // Keep natural image aspect (no stretch)
    const nat = getTaskBannerImageAspect();
    const midX = taskBannerCrop.imgX + taskBannerCrop.imgW / 2;
    const midY = taskBannerCrop.imgY + taskBannerCrop.imgH / 2;
    if (taskBannerCrop.imgW / Math.max(0.001, taskBannerCrop.imgH) > nat) {
      taskBannerCrop.imgH = taskBannerCrop.imgW / nat;
    } else {
      taskBannerCrop.imgW = taskBannerCrop.imgH * nat;
    }
    taskBannerCrop.imgX = midX - taskBannerCrop.imgW / 2;
    taskBannerCrop.imgY = midY - taskBannerCrop.imgH / 2;
  }

  function captureBannerViewFromStage() {
    const cw = Math.max(0.001, taskBannerCrop.cropW);
    const ch = Math.max(0.001, taskBannerCrop.cropH);
    return {
      aspect: cw / ch,
      x: (taskBannerCrop.imgX - taskBannerCrop.cropX) / cw,
      y: (taskBannerCrop.imgY - taskBannerCrop.cropY) / ch,
      w: taskBannerCrop.imgW / cw,
      h: taskBannerCrop.imgH / ch,
    };
  }

  function renderBannerViewDataUrl(img, view, maxLong) {
    if (!img || !view) return null;
    const aspect = (Number(view.aspect) > 0) ? Number(view.aspect) : 16 / 9;
    const long = maxLong || 720;
    let finalW;
    let finalH;
    if (aspect >= 1) {
      finalW = long;
      finalH = Math.max(1, Math.round(long / aspect));
    } else {
      finalH = long;
      finalW = Math.max(1, Math.round(long * aspect));
    }
    const out = document.createElement("canvas");
    out.width = finalW;
    out.height = finalH;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, finalW, finalH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      Number(view.x || 0) * finalW,
      Number(view.y || 0) * finalH,
      Math.max(0.001, Number(view.w || 1)) * finalW,
      Math.max(0.001, Number(view.h || 1)) * finalH
    );
    return out.toDataURL("image/jpeg", 0.82);
  }

  function syncTaskBannerEditorFrames() {
    const imgFrame = bannerEl("imgFrame");
    const cropFrame = bannerEl("cropFrame");
    const has = !!taskBannerCrop.sourceImg && !taskBannerCrop.clear;
    [imgFrame, cropFrame].forEach((frame) => {
      if (!frame) return;
      frame.hidden = !has;
      frame.setAttribute("aria-hidden", has ? "false" : "true");
    });
    if (!has) return;
    if (imgFrame) {
      imgFrame.style.left = taskBannerCrop.imgX + "px";
      imgFrame.style.top = taskBannerCrop.imgY + "px";
      imgFrame.style.width = taskBannerCrop.imgW + "px";
      imgFrame.style.height = taskBannerCrop.imgH + "px";
    }
    if (cropFrame) {
      cropFrame.style.left = taskBannerCrop.cropX + "px";
      cropFrame.style.top = taskBannerCrop.cropY + "px";
      cropFrame.style.width = taskBannerCrop.cropW + "px";
      cropFrame.style.height = taskBannerCrop.cropH + "px";
    }
  }

  function syncTaskBannerTargetButtons() {
    const active = taskModal.bannerTarget || "board";
    const hasSource = !!taskModal.bannerSource;
    bannerRootEl().querySelectorAll(".task-banner-target-btn").forEach((btn) => {
      const on = btn.dataset.bannerTarget === active;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      const key = btn.dataset.bannerTarget;
      const preview = taskModal.bannerPreviewUrls && taskModal.bannerPreviewUrls[key];
      btn.classList.toggle("has-image", !!(hasSource && preview));
      const media = btn.querySelector(".task-banner-target-media");
      if (media) {
        if (hasSource && preview) {
          media.style.backgroundImage = "url(\"" + String(preview).replace(/"/g, "%22") + "\")";
        } else if (hasSource) {
          const src =
            typeof resolveStockBannerUrl === "function"
              ? resolveStockBannerUrl(taskModal.bannerSource)
              : taskModal.bannerSource;
          media.style.backgroundImage = "url(\"" + String(src).replace(/"/g, "%22") + "\")";
        } else {
          media.style.backgroundImage = "";
        }
      }
    });
  }

  function resizeTaskBannerCropStage() {
    const canvas = bannerEl("canvas");
    const wrap = bannerEl("wrap");
    if (!canvas || !wrap) return;
    const prevW = TASK_BANNER_STAGE.w || 1;
    const prevH = TASK_BANNER_STAGE.h || 1;
    const cssW = Math.max(160, Math.round(wrap.clientWidth || (wrap.parentElement && wrap.parentElement.clientWidth) || 480));
    // Fixed workspace (not tied to crop aspect) so image + crop can both move/scale
    const cssH = Math.max(220, Math.min(420, Math.round(cssW * 9 / 16)));
    if (cssW === TASK_BANNER_STAGE.w && cssH === TASK_BANNER_STAGE.h && canvas.width === cssW && canvas.height === cssH) {
      return;
    }
    TASK_BANNER_STAGE.w = cssW;
    TASK_BANNER_STAGE.h = cssH;
    canvas.width = cssW;
    canvas.height = cssH;
    wrap.style.height = cssH + "px";
    if (taskBannerCrop.sourceImg && prevW > 0 && prevH > 0) {
      const sx = cssW / prevW;
      const sy = cssH / prevH;
      taskBannerCrop.imgX *= sx;
      taskBannerCrop.imgY *= sy;
      taskBannerCrop.imgW *= sx;
      taskBannerCrop.imgH *= sy;
      taskBannerCrop.cropX *= sx;
      taskBannerCrop.cropY *= sy;
      taskBannerCrop.cropW *= sx;
      taskBannerCrop.cropH *= sy;
    }
  }

  function drawTaskBannerCrop() {
    const canvas = bannerEl("canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    const img = taskBannerCrop.sourceImg;
    if (!img || taskBannerCrop.clear) {
      syncTaskBannerEditorFrames();
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      taskBannerCrop.imgX,
      taskBannerCrop.imgY,
      taskBannerCrop.imgW,
      taskBannerCrop.imgH
    );
    syncTaskBannerEditorFrames();
  }

  function commitTaskBannerCrop() {
    const key = taskModal.bannerTarget || "board";
    if (!taskModal.bannerViews) taskModal.bannerViews = emptyTaskBannerViews();
    if (!taskModal.bannerPreviewUrls) {
      taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    }
    if (taskBannerCrop.clear || !taskBannerCrop.sourceImg) {
      taskModal.bannerSource = null;
      taskModal.bannerViews = emptyTaskBannerViews();
      taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    } else {
      taskModal.bannerSource = taskBannerCrop.sourceImg.src || taskModal.bannerSource;
      const view = captureBannerViewFromStage();
      if (key === "home" || key === "games") {
        view.aspect = TASK_BANNER_TARGETS[key].aspect;
      }
      taskModal.bannerViews[key] = view;
      const preview = renderBannerViewDataUrl(taskBannerCrop.sourceImg, view, 360);
      if (preview) taskModal.bannerPreviewUrls[key] = preview;
    }
    syncTaskBannerPreview();
    syncTaskBannerTargetButtons();
  }

  function loadTaskBannerSourceFromUrl(url, opts) {
    const resetViews = !(opts && opts.keepViews === true);
    const storedUrl = String(url || "");
    const loadUrl = typeof resolveStockBannerUrl === "function" ? resolveStockBannerUrl(storedUrl) : storedUrl;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        taskBannerCrop.sourceImg = img;
        taskBannerCrop.clear = false;
        taskModal.bannerSource = storedUrl;
        if (resetViews) {
          taskModal.bannerViews = emptyTaskBannerViews();
          taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
        }
        resizeTaskBannerCropStage();
        if (resetViews) fitTaskBannerImageToStage();
        else applyBannerViewToStage(getActiveTaskBannerView());
        drawTaskBannerCrop();
        commitTaskBannerCrop();
        resolve();
      };
      img.onerror = () => reject(new Error("Could not load image."));
      img.src = loadUrl;
    });
  }

  function getTaskBannerPreviewTaskStub() {
    const nameInput = bannerEl("nameInput");
    const label = (nameInput && nameInput.value.trim()) || "Task name";
    return {
      label: label,
      bannerSourceImage: taskModal.bannerSource || null,
      bannerViews: {
        home: cloneBannerView(taskModal.bannerViews && taskModal.bannerViews.home, TASK_BANNER_TARGETS.home.aspect),
        games: cloneBannerView(taskModal.bannerViews && taskModal.bannerViews.games, TASK_BANNER_TARGETS.games.aspect),
        board: cloneBannerView(taskModal.bannerViews && taskModal.bannerViews.board, TASK_BANNER_TARGETS.board.aspect),
      },
    };
  }

  function getTaskBannerPreviewGame() {
    if (activeBannerUiKey === "extra") {
      const gameSelect = qs("extracurricularTaskGame");
      const gameId = (gameSelect && gameSelect.value) || taskModal.gameId;
      return getGame(gameId) || { name: (gameSelect && gameSelect.selectedOptions && gameSelect.selectedOptions[0] && gameSelect.selectedOptions[0].textContent) || "Game", iconImage: null };
    }
    return getGame(taskModal.gameId) || { name: "Game", iconImage: null };
  }

  function getTaskBannerPreviewPotential() {
    if (activeBannerUiKey === "extra") {
      const potInput = qs("extracurricularTaskCurrency");
      const n = potInput ? Number(potInput.value) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    const type = taskModal.taskType;
    const game = getTaskBannerPreviewGame();
    const taskId = taskModal.taskId;
    if (type === "weeklies" && game && taskId) {
      const task = (game.weeklies || []).find((t) => (t.id || t.label) === taskId);
      if (task && typeof getWeeklyPotential === "function") return getWeeklyPotential(task);
    }
    if (type === "endgame" && game && taskId) {
      const task = (game.endgame || []).find((t) => (t.id || t.label) === taskId);
      if (task && typeof getEndgamePotential === "function") return getEndgamePotential(task);
    }
    const potInput = qs("taskPotential") || qs("taskCurrency") || qs("endgameCurrencyMax");
    const n = potInput ? Number(potInput.value) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function buildGamesBannerPreviewCard(task, pot, opts) {
    const mobile = !!(opts && opts.mobile);
    const row = document.createElement("div");
    row.className = "task-item task-item-with-changer games-task-card task-banner-preview-games "
      + (mobile ? "task-banner-preview-games-mobile" : "task-banner-preview-games-desktop");
    appendGamesTaskSideMedia(row, task, { surface: mobile ? "home" : "games" });
    const main = document.createElement("div");
    main.className = "games-task-main";
    const top = document.createElement("div");
    top.className = "task-item-top games-task-top";
    const titleLine = document.createElement("div");
    titleLine.className = "games-task-title-line";
    const label = document.createElement("span");
    label.className = "task-label";
    label.textContent = task.label;
    titleLine.appendChild(label);
    top.appendChild(titleLine);
    main.appendChild(top);
    if (pot > 0) {
      const bottom = document.createElement("div");
      bottom.className = "games-task-bottom";
      const right = document.createElement("div");
      right.className = "games-task-bottom-right";
      const potSpan = document.createElement("span");
      potSpan.className = "games-task-potential";
      potSpan.textContent = "Potential: " + pot;
      right.appendChild(potSpan);
      bottom.appendChild(right);
      main.appendChild(bottom);
    }
    row.appendChild(main);
    return row;
  }

  function syncTaskBannerPreview() {
    const wrap = bannerEl("previewWrap");
    const cardHost = bannerEl("cardPreview");
    const clearBtn = bannerEl("clearBtn");
    const has = !!taskModal.bannerSource;
    if (clearBtn) clearBtn.hidden = !(has || taskBannerCrop.sourceImg);
    if (wrap) wrap.hidden = !has;
    if (!cardHost) return;
    cardHost.innerHTML = "";
    if (!has) return;

    const target = taskModal.bannerTarget || "board";
    const task = getTaskBannerPreviewTaskStub();
    const game = getTaskBannerPreviewGame();
    const pot = getTaskBannerPreviewPotential();
    const outerLabel = wrap && wrap.querySelector(":scope > .task-banner-preview-label");

    if (target === "games") {
      if (outerLabel) outerLabel.hidden = true;
      cardHost.classList.add("task-banner-card-preview-dual");
      const stack = document.createElement("div");
      stack.className = "task-banner-preview-stack";

      const deskBlock = document.createElement("div");
      deskBlock.className = "task-banner-preview-block";
      const deskLabel = document.createElement("span");
      deskLabel.className = "task-banner-preview-label";
      deskLabel.textContent = "Desktop";
      deskBlock.appendChild(deskLabel);
      deskBlock.appendChild(buildGamesBannerPreviewCard(task, pot, { mobile: false }));

      const mobBlock = document.createElement("div");
      mobBlock.className = "task-banner-preview-block";
      const mobHead = document.createElement("div");
      mobHead.className = "task-banner-preview-heading";
      const mobLabel = document.createElement("span");
      mobLabel.className = "task-banner-preview-label";
      mobLabel.textContent = "Mobile / hamburger";
      const mobNote = document.createElement("span");
      mobNote.className = "task-banner-preview-note";
      mobNote.textContent = "Uses the Home image setting (not Games) in hamburger / compressed mode.";
      mobHead.appendChild(mobLabel);
      mobHead.appendChild(mobNote);
      mobBlock.appendChild(mobHead);
      mobBlock.appendChild(buildGamesBannerPreviewCard(task, pot, { mobile: true }));

      stack.appendChild(deskBlock);
      stack.appendChild(mobBlock);
      cardHost.appendChild(stack);
      return;
    }

    if (outerLabel) {
      outerLabel.hidden = false;
      outerLabel.textContent = "Preview";
    }
    cardHost.classList.remove("task-banner-card-preview-dual");

    const card = document.createElement("div");
    card.className = "task-item task-card-knot task-banner-preview-card";
    appendTaskCardMedia(card, task, game, { surface: target === "home" ? "home" : "board" });
    const body = appendTaskCardBody(card);

    const top = document.createElement("div");
    top.className = "task-top task-card-title-row";
    const titleCol = document.createElement("div");
    titleCol.className = "task-game-heading-text";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label;
    titleCol.appendChild(span);
    if (pot > 0) {
      const potSpan = document.createElement("span");
      potSpan.className = "task-potential";
      potSpan.textContent = "Potential: " + pot;
      titleCol.appendChild(potSpan);
    }
    top.appendChild(titleCol);
    body.appendChild(top);

    const snippet = document.createElement("p");
    snippet.className = "task-card-snippet";
    snippet.textContent = "Incomplete · Preview";
    body.appendChild(snippet);

    const sub = document.createElement("div");
    sub.className = "task-subrows";
    const statusRow = document.createElement("div");
    statusRow.className = "task-subrow";
    const statusLeft = document.createElement("div");
    statusLeft.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    check.disabled = true;
    check.setAttribute("aria-hidden", "true");
    const statusLabel = document.createElement("span");
    statusLabel.innerHTML = "<strong>Status:</strong> Incomplete";
    statusLeft.appendChild(check);
    statusLeft.appendChild(statusLabel);
    statusRow.appendChild(statusLeft);
    sub.appendChild(statusRow);

    const remainingRow = document.createElement("div");
    remainingRow.className = "task-subrow";
    const remLeft = document.createElement("div");
    remLeft.className = "left";
    remLeft.innerHTML = "<strong>Time remaining:</strong>";
    remainingRow.appendChild(remLeft);
    const remVal = document.createElement("span");
    remVal.className = "task-remaining";
    remVal.textContent = "—";
    remainingRow.appendChild(remVal);
    sub.appendChild(remainingRow);
    body.appendChild(sub);

    cardHost.appendChild(card);
  }

  async function setTaskBannerFromFile(file) {
    try {
      const dataUrl = await compressImageFileToDataUrl(file, { maxWidth: 1400, quality: 0.92 });
      await loadTaskBannerSourceFromUrl(dataUrl);
    } catch (err) {
      alert((err && err.message) || "Could not use that image.");
    }
  }

  function fillStockBannerPickerGrid(host) {
    if (!host) return;
    host.innerHTML = "";
    const assets = typeof getStockBannerAssets === "function" ? getStockBannerAssets() : [];
    if (!assets.length) {
      host.innerHTML = '<p class="settings-hint">No stock banners bundled.</p>';
      return;
    }
    const byKind = { story: [], event: [], other: [] };
    assets.forEach((a) => {
      const k = a.kind === "story" || a.kind === "event" ? a.kind : "other";
      byKind[k].push(a);
    });
    [["story", "Story"], ["event", "Event"], ["other", "Other"]].forEach(([kind, title]) => {
      const list = byKind[kind];
      if (!list.length) return;
      const heading = document.createElement("h4");
      heading.className = "stock-banner-picker-heading";
      heading.textContent = title;
      host.appendChild(heading);
      const row = document.createElement("div");
      row.className = "stock-banner-picker-row";
      list.forEach((asset) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "stock-banner-picker-card";
        btn.setAttribute("data-stock-id", asset.id);
        btn.setAttribute("aria-label", "Use stock image " + asset.label);
        const img = document.createElement("img");
        img.src = resolveStockBannerUrl(asset.path);
        img.alt = "";
        img.loading = "lazy";
        const cap = document.createElement("span");
        cap.className = "stock-banner-picker-label";
        cap.textContent = asset.label;
        btn.appendChild(img);
        btn.appendChild(cap);
        btn.addEventListener("click", () => applyStockBannerAsset(asset));
        row.appendChild(btn);
      });
      host.appendChild(row);
    });
  }

  function appendStockAssetCard(grid, asset, kindLabel) {
    const card = document.createElement("figure");
    card.className = "stock-assets-card";
    const img = document.createElement("img");
    img.src = resolveStockBannerUrl(asset.path);
    img.alt = asset.label;
    img.loading = "lazy";
    const fig = document.createElement("figcaption");
    fig.textContent = kindLabel + " · " + asset.label;
    const path = document.createElement("code");
    path.className = "stock-assets-path";
    path.textContent = asset.path;
    card.appendChild(img);
    card.appendChild(fig);
    card.appendChild(path);
    grid.appendChild(card);
  }

  function fillSettingsStockAssetsGallery() {
    const host = qs("settingsStockAssetsList");
    if (!host) return;
    host.innerHTML = "";
    const banners = typeof getStockBannerAssets === "function" ? getStockBannerAssets() : [];
    const pfps = typeof getStockPfpAssets === "function" ? getStockPfpAssets() : [];
    if (!banners.length && !pfps.length) {
      host.innerHTML = '<p class="settings-hint">No stock assets found.</p>';
      return;
    }

    if (banners.length) {
      const block = document.createElement("div");
      block.className = "stock-assets-block";
      const heading = document.createElement("h5");
      heading.className = "stock-assets-section-heading";
      heading.textContent = "Banners";
      const grid = document.createElement("div");
      grid.className = "stock-assets-gallery";
      banners.forEach((asset) => {
        const kind =
          asset.kind === "story" ? "Story" : asset.kind === "event" ? "Event" : "Banner";
        appendStockAssetCard(grid, asset, kind);
      });
      block.appendChild(heading);
      block.appendChild(grid);
      host.appendChild(block);
    }

    if (pfps.length) {
      if (banners.length) {
        const divider = document.createElement("hr");
        divider.className = "stock-assets-divider";
        divider.setAttribute("aria-hidden", "true");
        host.appendChild(divider);
      }
      const block = document.createElement("div");
      block.className = "stock-assets-block";
      const heading = document.createElement("h5");
      heading.className = "stock-assets-section-heading";
      heading.id = "settings-stock-pfps-heading";
      heading.textContent = "Profile pictures";
      const grid = document.createElement("div");
      grid.className = "stock-assets-gallery stock-assets-gallery--pfp";
      grid.setAttribute("aria-labelledby", "settings-stock-pfps-heading");
      pfps.forEach((asset) => appendStockAssetCard(grid, asset, "PFP"));
      block.appendChild(heading);
      block.appendChild(grid);
      host.appendChild(block);
    }
  }

  function closeStockBannerPicker() {
    const el = qs("stockBannerPickerModal");
    if (!el || el.hidden) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    if (typeof deactivateModalFocus === "function") deactivateModalFocus(el);
  }

  function openStockBannerPicker(uiKey) {
    stockBannerPickerUiKey = TASK_BANNER_UI[uiKey] ? uiKey : "task";
    const el = qs("stockBannerPickerModal");
    const grid = qs("stockBannerPickerGrid");
    if (!el || !grid) return;
    fillStockBannerPickerGrid(grid);
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    if (typeof activateModalFocus === "function") activateModalFocus(el);
    const closeBtn = qs("stockBannerPickerModalClose");
    if (closeBtn) closeBtn.focus();
  }

  async function applyStockBannerAsset(asset) {
    if (!asset || !asset.path) return;
    const uiKey = stockBannerPickerUiKey || "task";
    setActiveBannerUi(uiKey);
    closeStockBannerPicker();
    try {
      await loadTaskBannerSourceFromUrl(asset.path);
      drawTaskBannerCrop();
      syncTaskBannerPreview();
      syncTaskBannerTargetButtons();
    } catch (err) {
      alert((err && err.message) || "Could not load that stock image.");
    }
  }

  async function switchTaskBannerTarget(target) {
    if (!TASK_BANNER_TARGETS[target]) return;
    if (taskBannerCrop.sourceImg && !taskBannerCrop.clear) commitTaskBannerCrop();
    taskModal.bannerTarget = target;
    syncTaskBannerTargetButtons();
    resizeTaskBannerCropStage();
    if (taskModal.bannerSource && taskBannerCrop.sourceImg) {
      applyBannerViewToStage(getActiveTaskBannerView());
      drawTaskBannerCrop();
      syncTaskBannerPreview();
    } else if (taskModal.bannerSource) {
      try {
        await loadTaskBannerSourceFromUrl(taskModal.bannerSource, { keepViews: true });
      } catch (_) {
        drawTaskBannerCrop();
        syncTaskBannerPreview();
      }
    } else {
      resetTaskBannerCropState();
      drawTaskBannerCrop();
      syncTaskBannerPreview();
    }
  }

  function applyTaskBannerCornerScaleLocked(kind, mode, dx, dy, aspect) {
    const min = TASK_BANNER_CROP_MIN;
    const isImg = kind === "img";
    const startX = isImg ? taskBannerCrop.startImgX : taskBannerCrop.startCropX;
    const startY = isImg ? taskBannerCrop.startImgY : taskBannerCrop.startCropY;
    const startW = isImg ? taskBannerCrop.startImgW : taskBannerCrop.startCropW;
    const startH = isImg ? taskBannerCrop.startImgH : taskBannerCrop.startCropH;
    let w = startW;
    let h = startH;
    const growW = (mode === "ne" || mode === "se") ? dx : -dx;
    const growH = (mode === "sw" || mode === "se") ? dy : -dy;
    if (Math.abs(growW) >= Math.abs(growH) * aspect) {
      w = startW + growW;
      h = w / aspect;
    } else {
      h = startH + growH;
      w = h * aspect;
    }
    if (w < min) {
      w = min;
      h = w / aspect;
    }
    if (h < min) {
      h = min;
      w = h * aspect;
    }
    let x = startX;
    let y = startY;
    if (mode === "nw" || mode === "sw") x = startX + startW - w;
    if (mode === "nw" || mode === "ne") y = startY + startH - h;
    if (isImg) {
      taskBannerCrop.imgX = x;
      taskBannerCrop.imgY = y;
      taskBannerCrop.imgW = w;
      taskBannerCrop.imgH = h;
      softClampTaskBannerRect("img");
    } else {
      taskBannerCrop.cropX = x;
      taskBannerCrop.cropY = y;
      taskBannerCrop.cropW = w;
      taskBannerCrop.cropH = h;
      softClampTaskBannerRect("crop");
    }
  }

  function applyTaskBannerCropFreeScale(mode, dx, dy) {
    const min = TASK_BANNER_CROP_MIN;
    let x = taskBannerCrop.startCropX;
    let y = taskBannerCrop.startCropY;
    let w = taskBannerCrop.startCropW;
    let h = taskBannerCrop.startCropH;
    if (mode === "nw") {
      x = taskBannerCrop.startCropX + dx;
      y = taskBannerCrop.startCropY + dy;
      w = taskBannerCrop.startCropW - dx;
      h = taskBannerCrop.startCropH - dy;
    } else if (mode === "ne") {
      y = taskBannerCrop.startCropY + dy;
      w = taskBannerCrop.startCropW + dx;
      h = taskBannerCrop.startCropH - dy;
    } else if (mode === "sw") {
      x = taskBannerCrop.startCropX + dx;
      w = taskBannerCrop.startCropW - dx;
      h = taskBannerCrop.startCropH + dy;
    } else {
      w = taskBannerCrop.startCropW + dx;
      h = taskBannerCrop.startCropH + dy;
    }
    if (w < min) {
      if (mode === "nw" || mode === "sw") x = taskBannerCrop.startCropX + taskBannerCrop.startCropW - min;
      w = min;
    }
    if (h < min) {
      if (mode === "nw" || mode === "ne") y = taskBannerCrop.startCropY + taskBannerCrop.startCropH - min;
      h = min;
    }
    taskBannerCrop.cropX = x;
    taskBannerCrop.cropY = y;
    taskBannerCrop.cropW = w;
    taskBannerCrop.cropH = h;
    softClampTaskBannerRect("crop");
  }

  function pointInRect(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  function nearTaskBannerCropBorder(px, py, band) {
    const b = band || 12;
    const x = taskBannerCrop.cropX;
    const y = taskBannerCrop.cropY;
    const w = taskBannerCrop.cropW;
    const h = taskBannerCrop.cropH;
    if (!pointInRect(px, py, x - b, y - b, w + b * 2, h + b * 2)) return false;
    return !pointInRect(px, py, x + b, y + b, Math.max(0, w - b * 2), Math.max(0, h - b * 2));
  }

  function hitBannerFrameHandle(px, py, x, y, w, h, pad) {
    const size = pad || 14;
    const corners = {
      nw: [x, y],
      ne: [x + w, y],
      sw: [x, y + h],
      se: [x + w, y + h],
    };
    for (const key of Object.keys(corners)) {
      const hx = corners[key][0];
      const hy = corners[key][1];
      if (Math.abs(px - hx) <= size && Math.abs(py - hy) <= size) return key;
    }
    return null;
  }

  function initTaskBannerControls() {
    const pointerPos = (clientX, clientY) => {
      const wrap = bannerEl("wrap");
      if (!wrap) return { x: 0, y: 0 };
      const rect = wrap.getBoundingClientRect();
      const sx = TASK_BANNER_STAGE.w / Math.max(1, rect.width);
      const sy = TASK_BANNER_STAGE.h / Math.max(1, rect.height);
      return {
        x: (clientX - rect.left) * sx,
        y: (clientY - rect.top) * sy,
      };
    };

    const snapshotDragStart = (p) => {
      taskBannerCrop.dragStartX = p.x;
      taskBannerCrop.dragStartY = p.y;
      taskBannerCrop.startImgX = taskBannerCrop.imgX;
      taskBannerCrop.startImgY = taskBannerCrop.imgY;
      taskBannerCrop.startImgW = taskBannerCrop.imgW;
      taskBannerCrop.startImgH = taskBannerCrop.imgH;
      taskBannerCrop.startCropX = taskBannerCrop.cropX;
      taskBannerCrop.startCropY = taskBannerCrop.cropY;
      taskBannerCrop.startCropW = taskBannerCrop.cropW;
      taskBannerCrop.startCropH = taskBannerCrop.cropH;
    };

    const onDown = (clientX, clientY, forcedMode) => {
      if (!taskBannerCrop.sourceImg) return;
      const p = pointerPos(clientX, clientY);
      snapshotDragStart(p);
      if (forcedMode) {
        taskBannerCrop.mode = forcedMode;
        return;
      }
      const cropHandle = hitBannerFrameHandle(
        p.x, p.y,
        taskBannerCrop.cropX, taskBannerCrop.cropY,
        taskBannerCrop.cropW, taskBannerCrop.cropH
      );
      if (cropHandle) {
        taskBannerCrop.mode = "scale-crop-" + cropHandle;
        return;
      }
      const imgHandle = hitBannerFrameHandle(
        p.x, p.y,
        taskBannerCrop.imgX, taskBannerCrop.imgY,
        taskBannerCrop.imgW, taskBannerCrop.imgH
      );
      if (imgHandle) {
        taskBannerCrop.mode = "scale-img-" + imgHandle;
        return;
      }
      if (nearTaskBannerCropBorder(p.x, p.y)) {
        taskBannerCrop.mode = "move-crop";
        return;
      }
      if (pointInRect(p.x, p.y, taskBannerCrop.imgX, taskBannerCrop.imgY, taskBannerCrop.imgW, taskBannerCrop.imgH)) {
        taskBannerCrop.mode = "move-img";
        return;
      }
      if (pointInRect(p.x, p.y, taskBannerCrop.cropX, taskBannerCrop.cropY, taskBannerCrop.cropW, taskBannerCrop.cropH)) {
        taskBannerCrop.mode = "move-crop";
        return;
      }
      taskBannerCrop.mode = null;
    };

    const onMove = (clientX, clientY) => {
      if (!taskBannerCrop.mode) return;
      const p = pointerPos(clientX, clientY);
      const dx = p.x - taskBannerCrop.dragStartX;
      const dy = p.y - taskBannerCrop.dragStartY;
      const mode = taskBannerCrop.mode;

      if (mode === "move-img") {
        taskBannerCrop.imgX = taskBannerCrop.startImgX + dx;
        taskBannerCrop.imgY = taskBannerCrop.startImgY + dy;
        softClampTaskBannerRect("img");
      } else if (mode === "move-crop") {
        taskBannerCrop.cropX = taskBannerCrop.startCropX + dx;
        taskBannerCrop.cropY = taskBannerCrop.startCropY + dy;
        softClampTaskBannerRect("crop");
      } else if (mode.indexOf("scale-img-") === 0) {
        applyTaskBannerCornerScaleLocked("img", mode.slice("scale-img-".length), dx, dy, getTaskBannerImageAspect());
      } else if (mode.indexOf("scale-crop-") === 0) {
        const corner = mode.slice("scale-crop-".length);
        const target = taskModal.bannerTarget || "board";
        if (target === "board") {
          applyTaskBannerCropFreeScale(corner, dx, dy);
        } else {
          applyTaskBannerCornerScaleLocked("crop", corner, dx, dy, getTaskBannerCropAspect());
        }
      }
      drawTaskBannerCrop();
    };

    const onUp = () => {
      if (!taskBannerCrop.mode) return;
      taskBannerCrop.mode = null;
      if (taskBannerCrop.sourceImg) commitTaskBannerCrop();
    };

    function bindOneBannerUi(uiKey) {
      const prev = activeBannerUiKey;
      setActiveBannerUi(uiKey);
      const fileInput = bannerEl("file");
      const chooseBtn = bannerEl("chooseBtn");
      const stockBtn = bannerEl("stockBtn");
      const clearBtn = bannerEl("clearBtn");
      const wrap = bannerEl("wrap");
      const imgFrame = bannerEl("imgFrame");
      const cropFrame = bannerEl("cropFrame");
      const nameInput = bannerEl("nameInput");
      const root = bannerRootEl();
      setActiveBannerUi(prev);
      if (!fileInput || !root) return;

      const activate = () => setActiveBannerUi(uiKey);

      if (typeof ResizeObserver !== "undefined" && wrap) {
        const ro = new ResizeObserver(() => {
          if (!wrap.isConnected) return;
          if (activeBannerUiKey !== uiKey) return;
          resizeTaskBannerCropStage();
          drawTaskBannerCrop();
        });
        ro.observe(wrap);
      }

      root.querySelectorAll(".task-banner-target-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          activate();
          switchTaskBannerTarget(btn.dataset.bannerTarget || "board");
        });
      });

      if (chooseBtn) {
        chooseBtn.addEventListener("click", (e) => {
          e.preventDefault();
          activate();
          fileInput.click();
        });
      }
      if (stockBtn) {
        stockBtn.addEventListener("click", (e) => {
          e.preventDefault();
          activate();
          openStockBannerPicker(uiKey);
        });
      }
      fileInput.addEventListener("change", () => {
        activate();
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (file) setTaskBannerFromFile(file);
      });

      if (wrap) {
        ["dragenter", "dragover"].forEach((type) => {
          wrap.addEventListener(type, (e) => {
            e.preventDefault();
            wrap.classList.add("is-dragover");
          });
        });
        ["dragleave", "drop"].forEach((type) => {
          wrap.addEventListener(type, (e) => {
            e.preventDefault();
            wrap.classList.remove("is-dragover");
          });
        });
        wrap.addEventListener("drop", (e) => {
          activate();
          const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (file) setTaskBannerFromFile(file);
        });
        wrap.addEventListener("mousedown", (e) => {
          if (e.target && e.target.classList && e.target.classList.contains("task-banner-crop-handle")) return;
          e.preventDefault();
          activate();
          onDown(e.clientX, e.clientY, null);
        });
        wrap.addEventListener("touchstart", (e) => {
          if (!e.touches || !e.touches[0]) return;
          if (e.target && e.target.classList && e.target.classList.contains("task-banner-crop-handle")) return;
          activate();
          onDown(e.touches[0].clientX, e.touches[0].clientY, null);
        }, { passive: true });
      }

      if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
          e.preventDefault();
          activate();
          resetTaskBannerCropState();
          taskBannerCrop.clear = true;
          taskModal.bannerSource = null;
          taskModal.bannerViews = emptyTaskBannerViews();
          taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
          resizeTaskBannerCropStage();
          drawTaskBannerCrop();
          syncTaskBannerPreview();
          syncTaskBannerTargetButtons();
        });
      }

      if (nameInput) {
        nameInput.addEventListener("input", () => {
          if (activeBannerUiKey !== uiKey) return;
          if (taskModal.bannerSource) syncTaskBannerPreview();
        });
      }

      const bindFrameDown = (frame, frameKind) => {
        if (!frame) return;
        frame.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          activate();
          const handle = e.target && e.target.getAttribute && e.target.getAttribute("data-handle");
          if (handle) {
            onDown(e.clientX, e.clientY, "scale-" + frameKind + "-" + handle);
          } else {
            onDown(e.clientX, e.clientY, "move-" + frameKind);
          }
        });
        frame.addEventListener("touchstart", (e) => {
          if (!e.touches || !e.touches[0]) return;
          activate();
          const handle = e.target && e.target.getAttribute && e.target.getAttribute("data-handle");
          if (handle) {
            onDown(e.touches[0].clientX, e.touches[0].clientY, "scale-" + frameKind + "-" + handle);
          } else {
            onDown(e.touches[0].clientX, e.touches[0].clientY, "move-" + frameKind);
          }
        }, { passive: true });
      };
      bindFrameDown(imgFrame, "img");
      bindFrameDown(cropFrame, "crop");
    }

    Object.keys(TASK_BANNER_UI).forEach(bindOneBannerUi);

    const stockPicker = qs("stockBannerPickerModal");
    const stockPickerClose = qs("stockBannerPickerModalClose");
    if (stockPickerClose) {
      stockPickerClose.addEventListener("click", () => closeStockBannerPicker());
    }
    if (stockPicker) {
      stockPicker.addEventListener("click", (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute("data-close") === "stockBannerPickerModal") {
          closeStockBannerPicker();
        }
      });
    }

    window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", (e) => {
      if (!taskBannerCrop.mode || !e.touches || !e.touches[0]) return;
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    window.addEventListener("touchend", onUp);
  }

  function initTaskModal() {
    const modalEl = qs("taskModal");
    const closeBtn = qs("taskModalClose");
    const cancelBtn = qs("taskModalCancel");
    const form = qs("taskModalForm");

    if (!modalEl || !form) return;

    modalEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-close") === "true") closeTaskModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeTaskModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeTaskModal);
    initTaskBannerControls();

    const resetTime = qs("taskResetTime");
    const sameEndToggle = qs("taskCycleEndTimeSameAsBegin");
    const cycleEndTime = qs("taskCycleEndTime");
    if (resetTime) {
      resetTime.addEventListener("input", () => {
        syncTaskCycleEndTimeUI();
        if (typeof updateTaskCycleEndPreview === "function") updateTaskCycleEndPreview();
        if (typeof updateTaskTimeRemainingDisplay === "function") updateTaskTimeRemainingDisplay();
      });
      resetTime.addEventListener("change", () => {
        syncTaskCycleEndTimeUI();
        if (typeof updateTaskCycleEndPreview === "function") updateTaskCycleEndPreview();
        if (typeof updateTaskTimeRemainingDisplay === "function") updateTaskTimeRemainingDisplay();
      });
    }
    if (sameEndToggle) {
      sameEndToggle.addEventListener("change", () => {
        syncTaskCycleEndTimeUI();
        if (typeof updateTaskCycleEndPreview === "function") updateTaskCycleEndPreview();
        if (typeof updateTaskTimeRemainingDisplay === "function") updateTaskTimeRemainingDisplay();
      });
    }
    if (cycleEndTime) {
      cycleEndTime.addEventListener("change", () => {
        if (typeof updateTaskCycleEndPreview === "function") updateTaskCycleEndPreview();
        if (typeof updateTaskTimeRemainingDisplay === "function") updateTaskTimeRemainingDisplay();
      });
    }

    document.querySelectorAll(".task-menu-grid .day-cell").forEach((cell) => {
      cell.addEventListener("click", () => {
        updateDaySelection(Number(cell.getAttribute("data-day")));
      });
      cell.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          updateDaySelection(Number(cell.getAttribute("data-day")));
        }
      });
    });

    const freqDay = qs("taskFrequencyUnitDay");
    const freqWeek = qs("taskFrequencyUnitWeek");
    const limDay = qs("taskTimeLimitUnitDay");
    const limWeek = qs("taskTimeLimitUnitWeek");
    if (freqDay) freqDay.addEventListener("click", () => { updateUnitToggles("frequency", "day"); updateTaskCycleEndPreview(); updateTaskTimeRemainingDisplay(); });
    if (freqWeek) freqWeek.addEventListener("click", () => { updateUnitToggles("frequency", "week"); updateTaskCycleEndPreview(); updateTaskTimeRemainingDisplay(); });
    if (limDay) limDay.addEventListener("click", () => { updateUnitToggles("timeLimit", "day"); updateTaskCycleEndPreview(); updateTaskTimeRemainingDisplay(); });
    if (limWeek) limWeek.addEventListener("click", () => { updateUnitToggles("timeLimit", "week"); updateTaskCycleEndPreview(); updateTaskTimeRemainingDisplay(); });

    document.addEventListener("keydown", (e) => {
      if (!taskModal.open) return;
      if (e.key === "Escape") closeTaskModal();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const game = getGame(taskModal.gameId);
      if (!game) return;

      const nameInput = qs("taskNameInput");
      const resetTime = qs("taskResetTime");
      const freqEvery = qs("taskFrequencyEvery");
      const limEvery = qs("taskTimeLimitEvery");
      const currencyInput = qs("taskCurrencyInput");
      const dateStartedInput = qs("taskDateStarted");

      const label = (nameInput && nameInput.value ? nameInput.value.trim() : "");
      if (!label) {
        if (nameInput) nameInput.focus();
        return;
      }

      const { hour, minute } = parseTimeStr(resetTime && resetTime.value ? resetTime.value : getDefaultTimeStr());
      const sameEndToggle = qs("taskCycleEndTimeSameAsBegin");
      const cycleEndTimeInput = qs("taskCycleEndTime");
      const cycleEndTimeSameAsBegin = !sameEndToggle || sameEndToggle.checked;
      let cycleEndHour;
      let cycleEndMinute;
      if (!cycleEndTimeSameAsBegin) {
        const endParts = parseTimeStr(
          cycleEndTimeInput && cycleEndTimeInput.value ? cycleEndTimeInput.value : timeToStr(hour, minute)
        );
        cycleEndHour = endParts.hour;
        cycleEndMinute = endParts.minute;
      }
      const frequencyEvery = Math.max(1, Number(freqEvery && freqEvery.value) || 1);
      const timeLimitEvery = Math.max(1, Number(limEvery && limEvery.value) || 1);
      const currency = Math.max(0, Number(currencyInput && currencyInput.value) || 0);
      const dateStarted = isValidDateStr(dateStartedInput && dateStartedInput.value) ? dateStartedInput.value : getDateStr();
      const cycleEndToggle = qs("taskCycleEndEnabled");
      const cycleEndDateInput = qs("taskCycleEndDate");
      const cycleEndEnabled = !!(cycleEndToggle && cycleEndToggle.checked);
      const countFromToggle = qs("taskCountFromDateStarted");
      const countFromDateStarted = !!(countFromToggle && countFromToggle.checked);
      const unlockDaysInput = qs("taskEarliestCompleteDays");
      const unlockTimeInput = qs("taskEarliestCompleteTime");
      const earliestCompleteDays = Math.max(0, Number(unlockDaysInput && unlockDaysInput.value) || 0);
      let earliestCompleteHour;
      let earliestCompleteMinute;
      let hasUnlockTime = false;
      if (unlockTimeInput && unlockTimeInput.value) {
        const parts = parseTimeStr(unlockTimeInput.value);
        earliestCompleteHour = parts.hour;
        earliestCompleteMinute = parts.minute;
        hasUnlockTime = true;
      }
      let cycleEndDate = cycleEndEnabled && cycleEndDateInput && isValidDateStr(cycleEndDateInput.value)
        ? cycleEndDateInput.value
        : null;
      if (cycleEndEnabled && !cycleEndDate) {
        if (cycleEndDateInput) cycleEndDateInput.focus();
        return;
      }
      if (cycleEndEnabled && cycleEndDate < dateStarted) {
        alert("Last cycle end date must be on or after the cycle start date.");
        if (cycleEndDateInput) cycleEndDateInput.focus();
        return;
      }

      if (taskModal.taskType === "weeklies") {
        game.weeklies = game.weeklies || [];
        const existingIdx = taskModal.taskId ? game.weeklies.findIndex((t) => t.id === taskModal.taskId) : -1;
        const dstToggle = qs("taskAdjustForDST");
        const adjustForDST = dstToggle ? dstToggle.checked : true;
        const manualResetToggle = qs("taskManualReset");
        const manualReset = !!(manualResetToggle && manualResetToggle.checked);
        const prevTask = existingIdx >= 0 ? game.weeklies[existingIdx] : null;
        const wasManual = !!(prevTask && prevTask.manualReset);
        const next = {
          id: taskModal.taskId || ("w_" + Date.now()),
          label,
          weekStartDay: taskModal.selectedDay,
          weekStartHour: hour,
          weekStartMinute: minute,
          cycleEndTimeSameAsBegin: cycleEndTimeSameAsBegin ? undefined : false,
          cycleEndHour: cycleEndTimeSameAsBegin ? undefined : cycleEndHour,
          cycleEndMinute: cycleEndTimeSameAsBegin ? undefined : cycleEndMinute,
          currency,
          dateStarted,
          frequencyEvery,
          frequencyUnit: taskModal.frequencyUnit,
          timeLimitEvery,
          timeLimitUnit: taskModal.timeLimitUnit,
          adjustForDST,
          countFromDateStarted: countFromDateStarted || undefined,
          earliestCompleteDays: earliestCompleteDays || undefined,
          earliestCompleteHour: hasUnlockTime ? earliestCompleteHour : undefined,
          earliestCompleteMinute: hasUnlockTime ? earliestCompleteMinute : undefined,
          cycleEndEnabled: cycleEndEnabled || undefined,
          cycleEndDate: cycleEndEnabled ? cycleEndDate : null,
          manualReset: manualReset || undefined,
          manualDueDateStr: manualReset
            ? (prevTask && isValidDateStr(prevTask.manualDueDateStr) ? prevTask.manualDueDateStr : null)
            : null,
          manualDueTbd: manualReset ? !!(prevTask && prevTask.manualDueTbd) || !(prevTask && isValidDateStr(prevTask.manualDueDateStr)) : undefined,
          manualAwaitingRestart: manualReset ? !!(prevTask && prevTask.manualAwaitingRestart) : undefined,
        };
        if (taskBannerCrop.sourceImg && !taskBannerCrop.clear) commitTaskBannerCrop();
        applyTaskBannersToSavePayload(next);
        if (existingIdx >= 0) {
          const merged = { ...game.weeklies[existingIdx], ...next };
          if (!cycleEndEnabled) {
            delete merged.cycleEndEnabled;
            delete merged.cycleEndDate;
          }
          if (!countFromDateStarted) delete merged.countFromDateStarted;
          if (!earliestCompleteDays) delete merged.earliestCompleteDays;
          if (!hasUnlockTime) {
            delete merged.earliestCompleteHour;
            delete merged.earliestCompleteMinute;
          }
          if (cycleEndTimeSameAsBegin) {
            delete merged.cycleEndTimeSameAsBegin;
            delete merged.cycleEndHour;
            delete merged.cycleEndMinute;
          }
          if (!manualReset) {
            delete merged.manualReset;
            delete merged.manualDueDateStr;
            delete merged.manualDueTbd;
            delete merged.manualAwaitingRestart;
            delete merged.manualClosedCycles;
          }
          clearTaskBannerFieldsFromMerged(merged);
          game.weeklies[existingIdx] = merged;
        } else game.weeklies.push(next);

        save();
        if (typeof bumpDataVersion === "function") bumpDataVersion();
        const savedId = next.id;
        const openManual = manualReset && (!wasManual || existingIdx < 0);
        closeTaskModal();
        renderActiveTab();
        if (openManual && typeof openManualResetModal === "function") {
          openManualResetModal({
            gameId: game.id,
            taskType: "weeklies",
            taskId: savedId,
            reason: "create",
          });
        }
        return;
      } else if (taskModal.taskType === "endgame") {
        game.endgame = game.endgame || [];
        const existingIdx = taskModal.taskId ? game.endgame.findIndex((t) => t.id === taskModal.taskId) : -1;
        const dstToggle = qs("taskAdjustForDST");
        const adjustForDST = dstToggle ? dstToggle.checked : true;
        const manualResetToggle = qs("taskManualReset");
        const manualReset = !!(manualResetToggle && manualResetToggle.checked);
        const prevTask = existingIdx >= 0 ? game.endgame[existingIdx] : null;
        const wasManual = !!(prevTask && prevTask.manualReset);
        const next = {
          id: taskModal.taskId || ("e_" + Date.now()),
          label,
          currency,
          weekStartDay: taskModal.selectedDay,
          weekStartHour: hour,
          weekStartMinute: minute,
          cycleEndTimeSameAsBegin: cycleEndTimeSameAsBegin ? undefined : false,
          cycleEndHour: cycleEndTimeSameAsBegin ? undefined : cycleEndHour,
          cycleEndMinute: cycleEndTimeSameAsBegin ? undefined : cycleEndMinute,
          dateStarted,
          frequencyEvery,
          frequencyUnit: taskModal.frequencyUnit,
          timeLimitEvery,
          timeLimitUnit: taskModal.timeLimitUnit,
          adjustForDST,
          countFromDateStarted: countFromDateStarted || undefined,
          earliestCompleteDays: earliestCompleteDays || undefined,
          earliestCompleteHour: hasUnlockTime ? earliestCompleteHour : undefined,
          earliestCompleteMinute: hasUnlockTime ? earliestCompleteMinute : undefined,
          cycleEndEnabled: cycleEndEnabled || undefined,
          cycleEndDate: cycleEndEnabled ? cycleEndDate : null,
          manualReset: manualReset || undefined,
          manualDueDateStr: manualReset
            ? (prevTask && isValidDateStr(prevTask.manualDueDateStr) ? prevTask.manualDueDateStr : null)
            : null,
          manualDueTbd: manualReset ? !!(prevTask && prevTask.manualDueTbd) || !(prevTask && isValidDateStr(prevTask.manualDueDateStr)) : undefined,
          manualAwaitingRestart: manualReset ? !!(prevTask && prevTask.manualAwaitingRestart) : undefined,
        };
        if (taskBannerCrop.sourceImg && !taskBannerCrop.clear) commitTaskBannerCrop();
        applyTaskBannersToSavePayload(next);
        if (existingIdx >= 0) {
          const prev = game.endgame[existingIdx];
          const oldCurrency = getEndgamePotential(prev);
          const taskId = prev.id || prev.label;
          if (oldCurrency !== currency) {
            const key = game.id + "." + taskId;
            const attempted = getAttemptedAmount(state.endgameAttempted, key);
            if (attempted > 0) {
              freezeEndgameCurrencyPotentialForPastCycles(game.id, taskId, oldCurrency, attempted);
            }
          }
          const merged = { ...game.endgame[existingIdx], ...next };
          if (!cycleEndEnabled) {
            delete merged.cycleEndEnabled;
            delete merged.cycleEndDate;
          }
          if (!countFromDateStarted) delete merged.countFromDateStarted;
          if (!earliestCompleteDays) delete merged.earliestCompleteDays;
          if (!hasUnlockTime) {
            delete merged.earliestCompleteHour;
            delete merged.earliestCompleteMinute;
          }
          if (cycleEndTimeSameAsBegin) {
            delete merged.cycleEndTimeSameAsBegin;
            delete merged.cycleEndHour;
            delete merged.cycleEndMinute;
          }
          if (!manualReset) {
            delete merged.manualReset;
            delete merged.manualDueDateStr;
            delete merged.manualDueTbd;
            delete merged.manualAwaitingRestart;
            delete merged.manualClosedCycles;
          }
          clearTaskBannerFieldsFromMerged(merged);
          game.endgame[existingIdx] = merged;
        } else {
          game.endgame.push(next);
        }

        save();
        if (typeof bumpDataVersion === "function") bumpDataVersion();
        const savedId = next.id;
        const openManual = manualReset && (!wasManual || existingIdx < 0);
        closeTaskModal();
        renderActiveTab();
        if (openManual && typeof openManualResetModal === "function") {
          openManualResetModal({
            gameId: game.id,
            taskType: "endgame",
            taskId: savedId,
            reason: "create",
          });
        }
        return;
      } else {
        return;
      }
    });
  }

  function addGame(name, opts) {
    const o = opts || {};
    const id = "g_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const weeklies = Array.isArray(o.weeklies) ? o.weeklies.map((t) => ({
      ...t,
      dateStarted: isValidDateStr(t.dateStarted) ? t.dateStarted : getDateStr(),
      frequencyEvery: Number.isFinite(t.frequencyEvery) ? t.frequencyEvery : 1,
      frequencyUnit: t.frequencyUnit || "week",
      timeLimitEvery: t.timeLimitEvery != null ? t.timeLimitEvery : 1,
      timeLimitUnit: t.timeLimitUnit || "week",
    })) : [];
    const endgame = Array.isArray(o.endgame) ? o.endgame.map((t) => ({
      ...t,
      dateStarted: isValidDateStr(t.dateStarted) ? t.dateStarted : getDateStr(),
    })) : [];
    state.games.push({
      id,
      name: name || "New game",
      presetId: o.presetId || null,
      server: (o.server && ["america", "asia", "europe"].includes(o.server)) ? o.server : "america",
      resetHour: Number.isFinite(o.resetHour) ? o.resetHour : getDefaultResetHour(),
      dailies: o.dailies == null ? true : !!o.dailies,
      dailyCurrency: Math.max(0, Number(o.dailyCurrency) || 0),
      currencyPerPull: Math.max(0, Number(o.currencyPerPull) || 0),
      currencyName: (o.currencyName && String(o.currencyName).trim()) || "",
      weeklies,
      endgame,
    });
    const game = getGame(id);
    if (game && o.presetId) {
      const now = getSimulatedNow();
      const todayStr = getDateStr();
      if (game.dailies) {
        state.lastProcessedResets.dailies = state.lastProcessedResets.dailies || {};
        state.lastProcessedResets.dailies[id] = todayStr;
      }
      (game.weeklies || []).forEach((task) => {
        const key = id + "." + (task.id || task.label);
        const remainingMs = getWeeklyTimeRemainingMs(task, now, game);
        const { intervalMs, timeLimitMs } = getCycleParams(task);
        const cycleEndMs = now.getTime() + remainingMs;
        const nextCycleStartMs = cycleEndMs - timeLimitMs + intervalMs;
        state.lastProcessedResets.weeklies = state.lastProcessedResets.weeklies || {};
        state.lastProcessedResets.weeklies[key] = nextCycleStartMs;
      });
      (game.endgame || []).forEach((task) => {
        const key = id + "." + (task.id || task.label);
        const cycleStart = getCycleStartForDate(task, todayStr, game);
        const { intervalMs } = getCycleParams(task);
        state.lastProcessedResets.endgame = state.lastProcessedResets.endgame || {};
        state.lastProcessedResets.endgame[key] = cycleStart.getTime() + intervalMs;
      });
    }
    if (o.presetId && Array.isArray(o.extracurricular) && o.extracurricular.length > 0) {
      state.extracurricularTasks = state.extracurricularTasks || [];
      o.extracurricular.forEach((t, i) => {
        state.extracurricularTasks.push({
          id: "ex_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2, 8),
          label: t.label || "Task",
          startDate: getDateStr(),
          endDateTBD: t.endDateTBD !== false,
          endDate: t.endDateTBD === false ? (t.endDate || null) : null,
          description: t.description || null,
          gameId: id,
          currency: t.currency != null ? t.currency : undefined,
        });
      });
    }
    state.gamesSelectedId = id;
    state.dataSelectedGameId = id;
    save();
    renderActiveTab();
  }

  function deleteGame(gameId) {
    if (state.confirmBeforeDelete === false) {
      reallyDeleteGame(gameId);
    } else {
      openDeleteGameModal(gameId);
    }
  }

  function reallyDeleteGame(gameId) {
    const game = getGame(gameId);
    if (!game) return;

    state.games = state.games.filter((g) => g.id !== gameId);

    delete state.dailiesCompleted[gameId];
    delete state.dailiesAttempted[gameId];
    Object.keys(state.weekliesCompleted).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.weekliesCompleted[k];
    });
    Object.keys(state.weekliesAttempted).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.weekliesAttempted[k];
    });
    Object.keys(state.endgameCompleted).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgameCompleted[k];
    });
    Object.keys(state.endgameAttempted).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgameAttempted[k];
    });
    delete state.endgameCurrencyEarned[gameId];
    delete state.endgameCurrencyPotential[gameId];
    Object.keys(state.endgameCompletionDates || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgameCompletionDates[k];
    });
    Object.keys(state.endgamePendingCurrency || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgamePendingCurrency[k];
    });
    Object.keys(state.endgamePendingCycleStartMs || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgamePendingCycleStartMs[k];
    });

    delete state.lastProcessedResets.dailies[gameId];
    Object.keys(state.lastProcessedResets.weeklies || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.lastProcessedResets.weeklies[k];
    });
    Object.keys(state.lastProcessedResets.endgame || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.lastProcessedResets.endgame[k];
    });

    Object.keys(state.completionByDate || {}).forEach((dateStr) => {
      const day = state.completionByDate[dateStr];
      if (!day) return;
      if (day.dailies) day.dailies = day.dailies.filter((id) => id !== gameId);
      if (day.weeklies) day.weeklies = day.weeklies.filter((k) => !k.startsWith(gameId + "."));
      if (day.endgame) day.endgame = day.endgame.filter((k) => !k.startsWith(gameId + "."));
    });

    (state.extracurricularTasks || []).filter((t) => t.gameId === gameId).forEach((t) => {
      delete state.extracurricularCompleted[t.id];
      if (state.extracurricularCompletedAt) delete state.extracurricularCompletedAt[t.id];
      if (state.extracurricularCurrencyEarned) delete state.extracurricularCurrencyEarned[t.id];
    });
    state.extracurricularTasks = (state.extracurricularTasks || []).filter((t) => t.gameId !== gameId);

    if (state.dataSelectedGameId === gameId || state.gamesSelectedId === gameId) {
      const remaining = getAllGames();
      const nextId = remaining.length ? remaining[0].id : null;
      state.dataSelectedGameId = nextId;
      state.gamesSelectedId = nextId;
    }

    save();
    renderActiveTab();
  }

  function getCompletedAmount(obj, key) {
    const v = obj[key];
    if (v === undefined || v === null) return 0;
    if (typeof v === "boolean") return v ? 1 : 0;
    return Math.max(0, Number(v) || 0);
  }

  function getAttemptedAmount(obj, key) {
    const v = obj[key];
    if (v === undefined || v === null) return 0;
    return Math.max(0, Number(v) || 0);
  }

  function setDailiesAttempted(gameId, value) {
    state.dailiesAttempted[gameId] = Math.max(0, Number(value) || 0);
    save();
    renderActiveTab();
  }

  function setWeekliesAttempted(gameId, taskId, value) {
    const key = gameId + "." + taskId;
    state.weekliesAttempted[key] = Math.max(0, Number(value) || 0);
    save();
    renderActiveTab();
  }

  function setEndgameAttempted(gameId, taskId, value) {
    const key = gameId + "." + taskId;
    const old = getAttemptedAmount(state.endgameAttempted, key);
    const next = Math.max(0, Number(value) || 0);
    state.endgameAttempted[key] = next;
    const game = getGame(gameId);
    const task = game && (game.endgame || []).find((t) => (t.id || t.label) === taskId);
    if (task) {
      if (next > old) {
        const pot = getEndgamePotential(task);
        for (let i = old; i < next; i++) snapshotEndgamePotentialAt(gameId, taskId, i, pot);
      }
      ensureEndgamePotentialArrayLength(gameId, taskId, next);
    }
    save();
    renderActiveTab();
  }

  function isCompletedToday(type, key) {
    const dateStr = type === "dailies"
      ? (() => { const g = getGame(key); return g ? getDailyPeriodDateStr(g, getSimulatedNow()) : getDateStr(); })()
      : getDateStr();
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    return (dayData[type] || []).includes(key);
  }

  function toggleDaily(gameId) {
    const game = getGame(gameId);
    const dateStr = game ? getDailyPeriodDateStr(game, getSimulatedNow()) : getDateStr();
    const isMarkingComplete = !(state.completionByDate[dateStr] && (state.completionByDate[dateStr].dailies || []).includes(gameId));
    if (isMarkingComplete) {
      applyTaskCompletion("dailies", gameId, { dateStr });
    } else {
      removeTaskCompletion("dailies", gameId, { dateStr });
    }
  }

  function toggleWeekly(gameId, taskId) {
    const game = getGame(gameId);
    const task = (game && game.weeklies || []).find((t) => (t.id || t.label) === taskId);
    if (task && isTaskCycleEnded(task, getSimulatedNow(), game)) return;
    const key = gameId + "." + taskId;
    const dateStr = getTaskPeriodDateStr("weeklies", task, game, getSimulatedNow());
    const isMarkingComplete = !isWeeklyCompletedInCurrentCycle(key, dateStr);
    if (isMarkingComplete) {
      const result = applyTaskCompletion("weeklies", key, { dateStr });
      if (result && !result.ok && result.reason) alert(result.reason);
    } else {
      removeTaskCompletion("weeklies", key, { dateStr });
    }
  }

  function requestToggleEndgame(gameId, taskId) {
    const game = getGame(gameId);
    const task = (game && game.endgame || []).find((t) => (t.id || t.label) === taskId);
    if (task && isTaskCycleEnded(task, getSimulatedNow(), game)) return;
    const key = gameId + "." + taskId;
    const dateStr = getTaskPeriodDateStr("endgame", task, game, getSimulatedNow());
    if (isEndgameCompletedInCurrentCycle(key, dateStr)) {
      toggleEndgame(gameId, taskId);
      return;
    }
    if (task && !isTaskCompletionUnlocked("endgame", task, game)) {
      alert(getTaskUnlockHint("endgame", task, game));
      return;
    }
    openEndgameCompleteModal(gameId, taskId, null);
  }

  function completeEndgameWithCurrency(gameId, taskId, currencyValue) {
    const game = getGame(gameId);
    const task = (game && game.endgame || []).find((t) => (t.id || t.label) === taskId);
    const key = gameId + "." + taskId;
    const dateStr = getTaskPeriodDateStr("endgame", task, game, getSimulatedNow());
    const result = applyTaskCompletion("endgame", key, {
      dateStr,
      currencyValue,
    });
    if (result && !result.ok && result.reason) alert(result.reason);
  }

  function toggleEndgame(gameId, taskId) {
    const game = getGame(gameId);
    const task = (game && game.endgame || []).find((t) => (t.id || t.label) === taskId);
    const key = gameId + "." + taskId;
    const dateStr = getTaskPeriodDateStr("endgame", task, game, getSimulatedNow());
    const isMarkingComplete = !isEndgameCompletedInCurrentCycle(key, dateStr);
    if (isMarkingComplete) {
      const result = applyTaskCompletion("endgame", key, { dateStr });
      if (result && !result.ok && result.reason) alert(result.reason);
    } else {
      removeTaskCompletion("endgame", key, { dateStr });
    }
  }

  function completeExtracurricularWithCurrency(taskId, currencyValue) {
    const task = (state.extracurricularTasks || []).find((t) => t.id === taskId);
    if (!task) return;
    if (!state.extracurricularCurrencyEarned) state.extracurricularCurrencyEarned = {};
    state.extracurricularCurrencyEarned[taskId] = Math.max(0, Number(currencyValue) || 0);
    state.extracurricularCompleted[taskId] = true;
    if (!state.extracurricularCompletedAt) state.extracurricularCompletedAt = {};
    state.extracurricularCompletedAt[taskId] = getSimulatedNow().toISOString();
    save();
    renderActiveTab();
  }

  function clearExtracurricularCompletion(taskId) {
    delete state.extracurricularCompleted[taskId];
    if (state.extracurricularCompletedAt) delete state.extracurricularCompletedAt[taskId];
    if (state.extracurricularCurrencyEarned) delete state.extracurricularCurrencyEarned[taskId];
    save();
    renderActiveTab();
  }

  /**
   * Confirm before deleting a task (honors Settings → Confirm before delete).
   * Uses the shared delete-task modal; onConfirm runs only if the user confirms.
   */
  function confirmTaskDelete(taskLabel, onConfirm) {
    if (typeof onConfirm !== "function") return;
    if (state.confirmBeforeDelete === false) {
      onConfirm();
      return;
    }
    openDeleteTaskModal(taskLabel, onConfirm);
  }

  /** Remove a weekly/endgame task from its game and related completion state (same persist/render pattern as extracurricular). */
  function deleteGameBoardTask(gameId, taskType, taskId) {
    if (!gameId || !taskId || (taskType !== "weeklies" && taskType !== "endgame")) return;
    const game = getGame(gameId);
    if (!game) return;
    const listKey = taskType === "weeklies" ? "weeklies" : "endgame";
    const list = game[listKey] || [];
    const task = list.find((t) => (t.id || t.label) === taskId);
    if (!task) return;
    confirmTaskDelete(task.label || taskId, () => reallyDeleteGameBoardTask(gameId, taskType, taskId));
  }

  function reallyDeleteGameBoardTask(gameId, taskType, taskId) {
    if (!gameId || !taskId || (taskType !== "weeklies" && taskType !== "endgame")) return;
    const game = getGame(gameId);
    if (!game) return;
    const listKey = taskType === "weeklies" ? "weeklies" : "endgame";
    const list = game[listKey] || [];
    const next = list.filter((t) => (t.id || t.label) !== taskId);
    if (next.length === list.length) return;
    game[listKey] = next;

    const key = gameId + "." + taskId;
    if (taskType === "weeklies") {
      delete state.weekliesCompleted[key];
      delete state.weekliesAttempted[key];
      if (state.lastProcessedResets && state.lastProcessedResets.weeklies) {
        delete state.lastProcessedResets.weeklies[key];
      }
    } else {
      delete state.endgameCompleted[key];
      delete state.endgameAttempted[key];
      if (state.endgameCompletionDates) delete state.endgameCompletionDates[key];
      if (state.endgamePendingCurrency) delete state.endgamePendingCurrency[key];
      if (state.endgamePendingCycleStartMs) delete state.endgamePendingCycleStartMs[key];
      if (state.lastProcessedResets && state.lastProcessedResets.endgame) {
        delete state.lastProcessedResets.endgame[key];
      }
      if (state.endgameCurrencyEarned && state.endgameCurrencyEarned[gameId]) {
        delete state.endgameCurrencyEarned[gameId][taskId];
      }
      if (state.endgameCurrencyPotential && state.endgameCurrencyPotential[gameId]) {
        delete state.endgameCurrencyPotential[gameId][taskId];
      }
      if (state.timestampsSelectedEndgameTasks) {
        delete state.timestampsSelectedEndgameTasks[key];
      }
    }

    Object.keys(state.completionByDate || {}).forEach((dateStr) => {
      const day = state.completionByDate[dateStr];
      if (!day || !Array.isArray(day[taskType])) return;
      day[taskType] = day[taskType].filter((k) => k !== key);
      if (
        !(day.dailies && day.dailies.length) &&
        !(day.weeklies && day.weeklies.length) &&
        !(day.endgame && day.endgame.length)
      ) {
        delete state.completionByDate[dateStr];
      }
    });

    if (Array.isArray(state.completionTimestamps)) {
      state.completionTimestamps = state.completionTimestamps.filter((t) => {
        if (!t || t.taskType !== taskType || t.gameId !== gameId) return true;
        return String(t.taskId || "") !== String(taskId);
      });
    }

    save();
    renderActiveTab();
  }

  function setTaskCycleStop(gameId, taskType, taskId, enabled, cycleEndDate) {
    const game = getGame(gameId);
    if (!game) return false;
    const list = taskType === "weeklies" ? (game.weeklies || []) : (game.endgame || []);
    const task = list.find((t) => (t.id || t.label) === taskId);
    if (!task) return false;
    const dateStarted = isValidDateStr(task.dateStarted) ? task.dateStarted : getDateStr();
    if (enabled) {
      const endDate = isValidDateStr(cycleEndDate) ? cycleEndDate : getDateStr();
      if (endDate < dateStarted) {
        alert("Last cycle end date must be on or after the cycle start date.");
        renderActiveTab();
        return false;
      }
      task.cycleEndEnabled = true;
      task.cycleEndDate = endDate;
    } else {
      delete task.cycleEndEnabled;
      delete task.cycleEndDate;
    }
    processResets();
    save();
    renderActiveTab();
    return true;
  }

  function isTaskHiddenInData(task) {
    return !!(task && (task.hideInData || task.excludeFromData));
  }

  function setTaskHideInData(gameId, taskType, taskId, hidden) {
    const game = getGame(gameId);
    if (!game) return false;
    const list = taskType === "endgame" ? (game.endgame || []) : (game.weeklies || []);
    const task = list.find((t) => (t.id || t.label) === taskId);
    if (!task) return false;
    if (hidden) task.hideInData = true;
    else delete task.hideInData;
    bumpDataVersion();
    save();
    renderActiveTab();
    return true;
  }

  function appendTaskCycleEndFooter(parent, game, task, taskType) {
    if (!parent || !game || !task) return;
    const taskId = task.id || task.label;
    const footer = document.createElement("div");
    footer.className = "task-panel-cycle-end-footer";

    const left = document.createElement("div");
    left.className = "task-panel-cycle-end-left";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "task-panel-cycle-end-toggle";
    toggleLabel.title = "Stop repeating cycles after the selected date";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "fill-toggle";
    toggle.checked = !!(task.cycleEndEnabled && isValidDateStr(task.cycleEndDate));
    toggle.setAttribute("aria-label", "Stop repeating cycles");

    const toggleText = document.createElement("span");
    toggleText.textContent = "Stop cycles";

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.className = "task-panel-cycle-end-date";
    dateInput.value = isValidDateStr(task.cycleEndDate) ? task.cycleEndDate : getDateStr();
    dateInput.hidden = !toggle.checked;
    dateInput.setAttribute("aria-label", "Last cycle end date");

    toggleLabel.appendChild(toggle);
    toggleLabel.appendChild(toggleText);
    left.appendChild(toggleLabel);
    left.appendChild(dateInput);
    footer.appendChild(left);

    const hideLabel = document.createElement("label");
    hideLabel.className = "task-panel-cycle-end-toggle task-panel-hide-in-data-toggle";
    hideLabel.title = "Hide this task from the Data tab";
    const hideToggle = document.createElement("input");
    hideToggle.type = "checkbox";
    hideToggle.className = "fill-toggle";
    hideToggle.checked = !!task.hideInData;
    hideToggle.setAttribute("aria-label", "Hide in Data");
    const hideText = document.createElement("span");
    hideText.textContent = "Hide in Data";
    hideLabel.appendChild(hideToggle);
    hideLabel.appendChild(hideText);
    hideToggle.addEventListener("change", () => {
      setTaskHideInData(game.id, taskType, taskId, hideToggle.checked);
    });
    footer.appendChild(hideLabel);

    toggle.addEventListener("change", () => {
      dateInput.hidden = !toggle.checked;
      if (!toggle.checked) {
        setTaskCycleStop(game.id, taskType, taskId, false);
        return;
      }
      if (!isValidDateStr(dateInput.value)) dateInput.value = getDateStr();
      setTaskCycleStop(game.id, taskType, taskId, true, dateInput.value);
    });
    dateInput.addEventListener("change", () => {
      if (!toggle.checked) return;
      setTaskCycleStop(game.id, taskType, taskId, true, dateInput.value);
    });

    parent.appendChild(footer);
  }

  function getDailyEarned(gameId) {
    const game = getGame(gameId);
    if (!game || !game.dailies) return 0;
    const amt = getCompletedAmount(state.dailiesCompleted, gameId);
    return amt * getDailyPotential(game);
  }

  function getDailyPotential(game) {
    return Math.max(0, Number(game && game.dailyCurrency) || 0);
  }

  function getWeeklyEarned(gameId, taskId) {
    const game = getGame(gameId);
    const task = (game?.weeklies || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return 0;
    const key = gameId + "." + taskId;
    const amt = getCompletedAmount(state.weekliesCompleted, key);
    return amt * getWeeklyPotential(task);
  }

  function getWeeklyPotential(task) {
    return Math.max(0, Number(task && task.currency) || 0);
  }

  function getEndgameEarnedPerCompletion(gameId, taskId) {
    const arr = state.endgameCurrencyEarned[gameId] && state.endgameCurrencyEarned[gameId][taskId];
    return Array.isArray(arr) ? arr.slice() : [];
  }

  function setEndgameEarnedAt(gameId, taskId, index, value, opts) {
    if (!state.endgameCurrencyEarned[gameId]) state.endgameCurrencyEarned[gameId] = {};
    let arr = state.endgameCurrencyEarned[gameId][taskId];
    if (!Array.isArray(arr)) arr = [];
    while (arr.length <= index) arr.push(0);
    arr[index] = Math.max(0, Number(value) || 0);
    state.endgameCurrencyEarned[gameId][taskId] = arr;
    if (!opts || !opts.skipSave) save();
    if (!opts || !opts.skipRender) renderActiveTab();
  }

  function ensureEndgameEarnedArrayLength(gameId, taskId, minLen) {
    if (!state.endgameCurrencyEarned[gameId]) state.endgameCurrencyEarned[gameId] = {};
    let arr = state.endgameCurrencyEarned[gameId][taskId];
    if (!Array.isArray(arr)) arr = [];
    while (arr.length < minLen) arr.push(0);
    if (arr.length > minLen) arr = arr.slice(0, minLen);
    state.endgameCurrencyEarned[gameId][taskId] = arr;
  }

  function setEndgameEarned(gameId, taskId, value) {
    if (!state.endgameCurrencyEarned[gameId]) state.endgameCurrencyEarned[gameId] = {};
    const num = value === "" ? 0 : Math.max(0, Number(value) || 0);
    state.endgameCurrencyEarned[gameId][taskId] = [num];
    save();
    renderActiveTab();
  }

  function getEndgameEarned(gameId, taskId) {
    const arr = getEndgameEarnedPerCompletion(gameId, taskId);
    return arr.reduce((s, x) => s + (Number(x) || 0), 0);
  }

  function getEndgamePotential(task) {
    return Math.max(0, Number(task && task.currency) || 0);
  }

  function getEndgamePotentialPerCompletion(gameId, taskId) {
    const arr = state.endgameCurrencyPotential[gameId] && state.endgameCurrencyPotential[gameId][taskId];
    return Array.isArray(arr) ? arr.slice() : [];
  }

  function setEndgamePotentialAt(gameId, taskId, index, value, opts) {
    if (!state.endgameCurrencyPotential[gameId]) state.endgameCurrencyPotential[gameId] = {};
    let arr = state.endgameCurrencyPotential[gameId][taskId];
    if (!Array.isArray(arr)) arr = [];
    while (arr.length <= index) arr.push(null);
    arr[index] = Math.max(0, Number(value) || 0);
    state.endgameCurrencyPotential[gameId][taskId] = arr;
    if (!opts || !opts.skipSave) save();
    if (!opts || !opts.skipRender) renderActiveTab();
  }

  function ensureEndgamePotentialArrayLength(gameId, taskId, minLen) {
    if (!state.endgameCurrencyPotential[gameId]) state.endgameCurrencyPotential[gameId] = {};
    let arr = state.endgameCurrencyPotential[gameId][taskId];
    if (!Array.isArray(arr)) arr = [];
    while (arr.length < minLen) arr.push(null);
    if (arr.length > minLen) arr = arr.slice(0, minLen);
    state.endgameCurrencyPotential[gameId][taskId] = arr;
  }

  function snapshotEndgamePotentialAt(gameId, taskId, index, potential, opts) {
    setEndgamePotentialAt(gameId, taskId, index, potential, opts);
  }

  function freezeEndgameCurrencyPotentialForPastCycles(gameId, taskId, oldCurrency, throughAttempted) {
    const pot = Math.max(0, Number(oldCurrency) || 0);
    ensureEndgamePotentialArrayLength(gameId, taskId, throughAttempted);
    for (let i = 0; i < throughAttempted; i++) {
      snapshotEndgamePotentialAt(gameId, taskId, i, pot, { skipSave: true, skipRender: true });
    }
  }

  function getEndgamePotentialAtCycle(gameId, taskId, task, index) {
    const arr = getEndgamePotentialPerCompletion(gameId, taskId);
    if (index < arr.length && arr[index] != null && Number.isFinite(Number(arr[index]))) {
      return Math.max(0, Number(arr[index]) || 0);
    }
    return getEndgamePotential(task);
  }

  function getEndgamePotentialSum(gameId, taskId, task, cycleCount) {
    const n = Math.max(0, Number(cycleCount) || 0);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += getEndgamePotentialAtCycle(gameId, taskId, task, i);
    return sum;
  }

  /** Backfill missing per-cycle potential from the task's current currency (one-time for existing saves). */
  function migrateEndgameCurrencyPotential() {
    let changed = false;
    (state.games || []).forEach((game) => {
      (game.endgame || []).forEach((task) => {
        const taskId = task.id || task.label;
        const key = game.id + "." + taskId;
        const attempted = getAttemptedAmount(state.endgameAttempted, key);
        const completed = getCompletedAmount(state.endgameCompleted, key);
        const earnedLen = getEndgameEarnedPerCompletion(game.id, taskId).length;
        const maxLen = Math.max(attempted, completed, earnedLen);
        if (maxLen <= 0) return;
        const potArr = getEndgamePotentialPerCompletion(game.id, taskId);
        const livePot = getEndgamePotential(task);
        ensureEndgamePotentialArrayLength(game.id, taskId, maxLen);
        for (let i = 0; i < maxLen; i++) {
          if (i < potArr.length && potArr[i] != null && Number.isFinite(Number(potArr[i]))) continue;
          snapshotEndgamePotentialAt(game.id, taskId, i, livePot, { skipSave: true, skipRender: true });
          changed = true;
        }
      });
    });
    if (changed) save();
  }

  function getCurrencyLabel(game) {
    const name = game && game.currencyName && String(game.currencyName).trim();
    return name || "Currency";
  }

  /**
   * Calendar-based completed/attempted for Data tab.
   * Completed always includes finished-early current cycles.
   * includeInProgress=false excludes only unfinished current cycles from attempted/potential.
   */
  function getCalendarCompletedAttempted(game, type, key, includeInProgress) {
    const history = getTaskTallyHistory(game, type, key);
    let completed;
    if (type === "endgame") {
      const task = (game.endgame || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
      completed = task ? getEndgameCompletedPeriodsFromCalendar(game, task, key).length : 0;
    } else {
      completed = history.reduce((s, p) => s + p.completed, 0);
    }
    return {
      completed,
      attempted: getTaskAttemptedFromCalendar(game, type, key, includeInProgress),
    };
  }

  /** @deprecated Use getCalendarCompletedAttempted(game, type, key, false). */
  function getCompletedAttemptedCompletedCyclesOnly(game, type, key) {
    return getCalendarCompletedAttempted(game, type, key, false);
  }

  /** Get earned for endgame from only completed cycles (first N entries from endgameCurrencyEarned). */
  function getEndgameEarnedCompletedCyclesOnly(gameId, taskId, completedCount) {
    const arr = getEndgameEarnedPerCompletion(gameId, taskId);
    let sum = 0;
    for (let i = 0; i < completedCount && i < arr.length; i++) {
      sum += Number(arr[i]) || 0;
    }
    return sum;
  }

  function getGameEarnedAndPotential(game, excludeInProgress) {
    if (!game) return null;
    const excl = excludeInProgress !== false && (state.dataExcludeInProgress && state.dataExcludeInProgress[game.id] !== false);
    const includeInProgress = !excl;
    const dailyPot = getDailyPotential(game);

    let dEarned, dPotential;
    if (game.dailies) {
      const ca = getCalendarCompletedAttempted(game, "dailies", game.id, includeInProgress);
      dEarned = ca.completed * dailyPot;
      dPotential = ca.attempted * dailyPot;
    } else {
      dEarned = 0;
      dPotential = 0;
    }

    let wEarned = 0, wPotential = 0;
    (game.weeklies || []).forEach((t) => {
      if (isTaskHiddenInData(t)) return;
      const key = game.id + "." + (t.id || t.label);
      const pot = getWeeklyPotential(t);
      const ca = getCalendarCompletedAttempted(game, "weeklies", key, includeInProgress);
      wEarned += ca.completed * pot;
      wPotential += ca.attempted * pot;
    });

    let eEarned = 0, ePotential = 0;
    (game.endgame || []).forEach((t) => {
      if (isTaskHiddenInData(t)) return;
      const key = game.id + "." + (t.id || t.label);
      const taskId = t.id || t.label;
      const ca = getCalendarCompletedAttempted(game, "endgame", key, includeInProgress);
      eEarned += getEndgameEarnedCompletedCyclesOnly(game.id, taskId, ca.completed);
      ePotential += getEndgamePotentialSum(game.id, taskId, t, ca.attempted);
    });

    let xEarned = 0, xPotential = 0;
    (state.extracurricularTasks || []).forEach((t) => {
      if (t.gameId !== game.id) return;
      if (isTaskHiddenInData(t)) return;
      const cur = Math.max(0, Number(t.currency) || 0);
      if (cur > 0) xPotential += cur;
      if (!state.extracurricularCompleted[t.id]) return;
      const recorded = state.extracurricularCurrencyEarned && state.extracurricularCurrencyEarned[t.id];
      if (recorded !== undefined && recorded !== null) {
        xEarned += Math.max(0, Number(recorded) || 0);
      } else if (cur > 0) {
        xEarned += cur;
      }
    });

    return {
      dailies: { earned: dEarned, potential: dPotential },
      weeklies: { earned: wEarned, potential: wPotential },
      endgame: { earned: eEarned, potential: ePotential },
      extracurricular: { earned: xEarned, potential: xPotential },
      total: {
        earned: dEarned + wEarned + eEarned + xEarned,
        potential: dPotential + wPotential + ePotential + xPotential,
      },
    };
  }


  function getSidebarResetHour() {
    const server = state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
    return getEffectiveResetHour ? getEffectiveResetHour(server, getSimulatedNow()) : getDefaultResetHour();
  }

  function getSidebarResetMinute() {
    return 0;
  }

  function getSidebarPrimaryServer() {
    return state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
  }

  function getNextResetDate(now) {
    const server = getSidebarPrimaryServer();
    const baseTz = getServerTimezone ? getServerTimezone(server) : getRecordingTimezone();
    const hour = getSidebarResetHour();
    const minute = getSidebarResetMinute();
    const tz = getDstAwareTimezoneForDisplay(baseTz);
    const offsetRef = new Date();
    return getNextResetDateInTimezone(now, hour, minute, tz, offsetRef);
  }

  /** Next reset with DST (4am when active, 3am when inactive). */
  function getNextResetDateWithDST(now) {
    return getNextResetDate(now);
  }

  /** Next reset with no DST shift (3am for America/Europe, 4am for Asia). */
  function getNextResetDateStandard(now) {
    const server = getSidebarPrimaryServer();
    const baseTz = getServerTimezone ? getServerTimezone(server) : getRecordingTimezone();
    const hour = server === "asia" ? 4 : 3;
    const minute = 0;
    const tz = baseTz;
    const offsetRef = getSimulatedNow();
    return getNextResetDateInTimezone(now, hour, minute, tz, offsetRef);
  }

  let lastDstSidebarUpdateMs = 0;

  function updateSidebarTime() {
    const now = getSimulatedNow();
    const tz = getAppTimezone();
    const recTz = getRecordingTimezone();
    const parts = getDatePartsInTimezone(now, tz);
    const dateEl = document.getElementById("currentDate");
    if (dateEl) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = monthNames[parts.month];
      const offset = (state.simulatedDateOffset || 0);
      dateEl.textContent = parts.weekday + ", " + month + " " + parts.day + ", " + parts.year + (offset > 0 ? " (+" + offset + " day simulated)" : "");
    }
    const timeEl = document.getElementById("currentTime");
    if (timeEl) {
      timeEl.textContent = formatTime(now);
    }
    const tzEl = document.getElementById("sidebarTimezone");
    if (tzEl) {
      tzEl.textContent = getTimezoneDisplayLabel();
    }
    const countdownEl = document.getElementById("resetCountdown");
    if (countdownEl) {
      if (state.showResetCountdown === false) {
        countdownEl.style.display = "none";
      } else {
        countdownEl.style.display = "";
        const next = getNextResetDate(now);
        const ms = next.getTime() - now.getTime();
        countdownEl.textContent = "Next reset in " + formatRemainingMs(ms);
      }
    }
    const dstDatesEl = document.getElementById("sidebarDstDates");
    if (dstDatesEl) {
      const nowMs = now.getTime();
      if (nowMs - lastDstSidebarUpdateMs >= 60000) {
        lastDstSidebarUpdateMs = nowMs;
      const server = getSidebarPrimaryServer();
      const dstZoneMap = { america: "America/New_York", europe: "Europe/Paris", asia: null };
      const dstTz = (server === "asia" || !getDSTTransitionDates) ? null : (dstZoneMap[server] || "America/New_York");
      const dstInfo = dstTz ? getDSTTransitionDates(dstTz, now.getFullYear()) : null;
      if (dstInfo && (dstInfo.spring || dstInfo.fall)) {
        const lines = [];
        if (dstInfo.spring) lines.push("DST starts: " + formatDate(dstInfo.spring));
        if (dstInfo.fall) lines.push("DST ends: " + formatDate(dstInfo.fall));
        dstDatesEl.textContent = lines.join(" · ");
        dstDatesEl.style.display = "";
      } else {
        dstDatesEl.textContent = "";
        dstDatesEl.style.display = "none";
        }
      }
    }
    const resetCompareEl = document.getElementById("sidebarResetCompare");
    if (resetCompareEl) {
      const nextWith = getNextResetDateWithDST(now);
      const nextWithout = getNextResetDateStandard(now);
      const partsWith = getDatePartsInTimezone(nextWith, tz);
      const partsWithout = getDatePartsInTimezone(nextWithout, tz);
      const msWith = nextWith.getTime() - now.getTime();
      const msWithout = nextWithout.getTime() - now.getTime();
      const withStr = formatTimeOnly(partsWith.hour, partsWith.minute) + " (" + formatRemainingMs(msWith) + ")";
      const withoutStr = formatTimeOnly(partsWithout.hour, partsWithout.minute) + " (" + formatRemainingMs(msWithout) + ")";
      resetCompareEl.innerHTML = "W/ DST: " + withStr + "<br>W/O DST: " + withoutStr;
      resetCompareEl.style.display = "";
    }
    const hintEl = document.getElementById("sidebarHint");
    if (hintEl) {
      const next = getNextResetDate(now);
      const displayParts = getDatePartsInTimezone(next, tz);
      const displayTzLabel = getTimezoneLabelForId(tz);
      const recTzLabel = getTimezoneLabelForId(recTz);
      hintEl.textContent = "Dailies reset at " + formatTimeOnly(displayParts.hour, displayParts.minute) + " (" + displayTzLabel + "). Dates/calendar use " + recTzLabel + ". Data saved in this browser.";
    }
  }

  function setDateLabels() {
    updateSidebarTime();
  }

  function renderTabs() {
    const current = document.getElementById("breadcrumbCurrent");
    const tabNames = { about: "About", home: "Home", dailies: "Dailies", weeklies: "Weeklies", endgame: "Endgame", attendance: "Attendance", extracurricular: "Extracurricular", data: "Data", games: "Games" };
    let label = tabNames[state.tab] || state.tab;
    if (state.tab === "attendance" && state.attendanceView === "timestamps") label = "Time Trends";
    else if (state.tab === "attendance" && state.attendanceView === "history") label = "History";
    if (current) current.textContent = label;

    document.querySelectorAll(".tab").forEach((btn) => {
      const t = btn.dataset.tab;
      const view = btn.dataset.attendanceView;
      const exViewMode = btn.dataset.extracurricularViewMode;
      let active = t === state.tab;
      if (active && view) {
        active = state.attendanceView === view;
      } else if (active && t === "attendance" && !view) {
        active = state.attendanceView === "weekly";
      }
      if (active && exViewMode) {
        active = state.extracurricularViewMode === exViewMode;
      } else if (active && t === "extracurricular" && !exViewMode) {
        active = state.extracurricularViewMode === "tasks";
      }
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    document.querySelectorAll(".panel").forEach((panel) => {
      const id = panel.id;
      const name = id.replace("panel-", "");
      panel.classList.toggle("active", name === state.tab);
      panel.hidden = name !== state.tab;
    });
  }

  /** Pack .task-grid cards into equal-width shortest-column masonry (up to 4 cols). Skips home checklist strip. */
  function unwrapTaskMasonry(root) {
    if (!root) return;
    root.querySelectorAll(":scope > .task-masonry-col").forEach((col) => {
      while (col.firstChild) root.insertBefore(col.firstChild, col);
      col.remove();
    });
    root.classList.remove("task-grid-masonry-js", "task-grid-masonry-single");
  }

  function applyTaskMasonry(root, opts) {
    if (!root || !root.classList || !root.classList.contains("task-grid")) return;
    if (root.closest(".home-dwe-checklist-scroll")) return;
    const force = !!(opts && opts.force);
    const items = Array.from(root.querySelectorAll(":scope > .task-item, :scope > .task-masonry-col > .task-item"));
    if (items.length === 0) {
      unwrapTaskMasonry(root);
      return;
    }
    const gap = 12;
    const minColRaw = Number(root.dataset.masonryMin);
    const minColDefault = root.classList.contains("task-grid-dailies") ? 300 : 200;
    const minCol = Number.isFinite(minColRaw) && minColRaw >= 120 ? minColRaw : minColDefault;
    const width = root.getBoundingClientRect().width || root.clientWidth || 0;
    if (width < 40) return;
    const maxColsRaw = Number(root.dataset.masonryMax);
    const maxCols = Number.isFinite(maxColsRaw) && maxColsRaw > 0 ? Math.min(4, Math.floor(maxColsRaw)) : 4;
    let colCount = Math.floor((width + gap) / (minCol + gap));
    colCount = Math.max(1, Math.min(maxCols, colCount));
    const prevCols = Number(root.dataset.masonryCols || 0);
    const alreadyPacked = !!root.querySelector(":scope > .task-masonry-col");
    if (!force && alreadyPacked && prevCols === colCount) return;

    unwrapTaskMasonry(root);
    root.dataset.masonryCols = String(colCount);
    if (colCount === 1) {
      root.classList.add("task-grid-masonry-js", "task-grid-masonry-single");
      return;
    }
    root.classList.add("task-grid-masonry-js");
    const columns = [];
    const heights = [];
    for (let i = 0; i < colCount; i++) {
      const col = document.createElement("div");
      col.className = "task-masonry-col";
      root.appendChild(col);
      columns.push(col);
      heights.push(0);
    }
    items.forEach((item) => {
      let best = 0;
      for (let i = 1; i < colCount; i++) {
        if (heights[i] < heights[best]) best = i;
      }
      columns[best].appendChild(item);
      heights[best] += (item.getBoundingClientRect().height || 140) + gap;
    });
  }

  let taskMasonryResizeObserver = null;
  /**
   * Pack task cards into a staggered masonry grid.
   * Packs once on open; does not reshuffle as images load (banner aspect-ratio
   * reserves height). Window resize only re-packs if the column count changes.
   */
  function scheduleTaskMasonry(root) {
    if (!root) return;
    requestAnimationFrame(() => {
      applyTaskMasonry(root, { force: true });
      if (typeof ResizeObserver === "undefined") return;
      if (!taskMasonryResizeObserver) {
        taskMasonryResizeObserver = new ResizeObserver((entries) => {
          // force:false → only re-pack when column count changes (see applyTaskMasonry).
          entries.forEach((entry) => applyTaskMasonry(entry.target, { force: false }));
        });
      }
      try {
        taskMasonryResizeObserver.observe(root);
      } catch (_) {}
    });
  }

  /** Sort board entries: incomplete first by soonest due, completed at end. */
  function sortBoardTaskEntries(entries) {
    return [...entries].sort((a, b) => {
      const aAwait = !!(a.task && a.task.manualAwaitingRestart);
      const bAwait = !!(b.task && b.task.manualAwaitingRestart);
      if (aAwait !== bAwait) return aAwait ? -1 : 1;
      if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
      const aDue = Number.isFinite(a.dueMs) ? a.dueMs : Number.POSITIVE_INFINITY;
      const bDue = Number.isFinite(b.dueMs) ? b.dueMs : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      if ((a.gameOrder || 0) !== (b.gameOrder || 0)) return (a.gameOrder || 0) - (b.gameOrder || 0);
      return (a.taskOrder || 0) - (b.taskOrder || 0);
    });
  }

  function normalizeTaskBannerShape(shape) {
    if (shape === "square" || shape === "vertical" || shape === "horizontal") return shape;
    return "horizontal";
  }

  /** Resolved banner aspect ratio (width/height). Supports freeform bannerAspect + legacy shapes. */
  function getTaskBannerAspect(task) {
    if (task && Number.isFinite(Number(task.bannerAspect)) && Number(task.bannerAspect) > 0) {
      return Number(task.bannerAspect);
    }
    const shape = normalizeTaskBannerShape(task && task.bannerShape);
    if (shape === "square") return 1;
    if (shape === "vertical") return 9 / 16;
    return 16 / 9;
  }

  /** surface: "home" | "games" | "board" (default). Uses shared bannerSourceImage + bannerViews. */
  function getTaskBannerForSurface(task, surface) {
    const s = surface || "board";
    if (!task) return { image: null, aspect: 16 / 9, source: null };
    const source = (typeof resolveTaskBannerSource === "function")
      ? resolveTaskBannerSource(task)
      : (task.bannerSourceImage || task.bannerImage || task.bannerHomeImage || task.bannerGamesImage || null);
    const view = (typeof resolveTaskBannerView === "function")
      ? resolveTaskBannerView(task, s)
      : null;
    if (source) {
      let aspect = (view && Number(view.aspect) > 0) ? Number(view.aspect) : null;
      if (!aspect) {
        if (s === "home") aspect = 16 / 9;
        else if (s === "games") aspect = 3 / 4;
        else aspect = getTaskBannerAspect(task);
      }
      const display =
        typeof resolveStockBannerUrl === "function" ? resolveStockBannerUrl(source) : source;
      return { image: display, aspect: aspect, view: view, source: source };
    }
    // Legacy per-surface images (pre single-source)
    if (s === "home" && task.bannerHomeImage) {
      return {
        image: task.bannerHomeImage,
        aspect: (Number(task.bannerHomeAspect) > 0 ? Number(task.bannerHomeAspect) : 16 / 9),
        view: null,
        source: null,
      };
    }
    if (s === "games" && task.bannerGamesImage) {
      return {
        image: task.bannerGamesImage,
        aspect: (Number(task.bannerGamesAspect) > 0 ? Number(task.bannerGamesAspect) : 3 / 4),
        view: null,
        source: null,
      };
    }
    if (task.bannerImage) {
      return {
        image: task.bannerImage,
        aspect: getTaskBannerAspect(task),
        view: null,
        source: null,
      };
    }
    return { image: null, aspect: (view && view.aspect) || 16 / 9, view: null, source: null };
  }

  function applyBannerViewportImgStyles(img, view) {
    if (!img) return;
    if (!view) {
      img.style.left = "0";
      img.style.top = "0";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      return;
    }
    img.style.left = (Number(view.x || 0) * 100) + "%";
    img.style.top = (Number(view.y || 0) * 100) + "%";
    img.style.width = (Math.max(0.001, Number(view.w || 1)) * 100) + "%";
    img.style.height = (Math.max(0.001, Number(view.h || 1)) * 100) + "%";
    img.style.objectFit = "fill";
    img.style.objectPosition = "center";
  }

  /** Banner strip/thumb for weekly & endgame task cards. variant: "card" | "thumb" */
  function appendTaskBanner(parent, task, variant) {
    if (!parent || !task) return null;
    const surface = variant === "thumb" ? "games" : "board";
    const banner = getTaskBannerForSurface(task, surface);
    if (!banner.image) return null;
    const wrap = document.createElement("div");
    wrap.className = (variant === "thumb" ? "task-banner-thumb-wrap" : "task-banner-card-wrap");
    wrap.style.aspectRatio = String(banner.aspect);
    const img = document.createElement("img");
    img.className = (variant === "thumb" ? "task-banner-thumb" : "task-banner-card") + " task-banner-viewport-img";
    img.src = banner.image;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    applyBannerViewportImgStyles(img, banner.view);
    wrap.appendChild(img);
    parent.insertBefore(wrap, parent.firstChild);
    parent.classList.add(variant === "thumb" ? "has-task-banner-thumb" : "has-task-banner");
    return img;
  }

  function isGamesBannerHamburgerMode() {
    try {
      return !!(window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
    } catch (_) {
      return false;
    }
  }

  /** Full-height left media panel for Games-page managed task cards.
   *  opts.surface: force "home" | "games". Default: home in hamburger, games otherwise. */
  function appendGamesTaskSideMedia(cardEl, task, opts) {
    if (!cardEl) return null;
    const media = document.createElement("div");
    media.className = "games-task-media";
    const forced = opts && opts.surface;
    const surface = (forced === "home" || forced === "games")
      ? forced
      : (isGamesBannerHamburgerMode() ? "home" : "games");
    const banner = getTaskBannerForSurface(task, surface);
    if (banner.image) {
      const stage = document.createElement("div");
      stage.className = "games-task-media-stage";
      const fallbackAspect = surface === "home" ? (16 / 9) : (3 / 4);
      const aspect = Number(banner.aspect) > 0 ? Number(banner.aspect) : fallbackAspect;
      stage.style.aspectRatio = String(aspect);
      stage.style.setProperty("--banner-aspect", String(aspect));
      media.style.setProperty("--banner-aspect", String(aspect));
      const img = document.createElement("img");
      img.className = "games-task-media-img task-banner-viewport-img";
      img.src = banner.image;
      img.alt = "";
      img.loading = "lazy";
      img.draggable = false;
      applyBannerViewportImgStyles(img, banner.view);
      stage.appendChild(img);
      media.appendChild(stage);
      cardEl.classList.add("has-games-task-media");
    } else {
      const ph = document.createElement("div");
      ph.className = "games-task-media-placeholder";
      ph.setAttribute("aria-hidden", "true");
      media.appendChild(ph);
    }
    cardEl.insertBefore(media, cardEl.firstChild);
    return media;
  }

  function buildTaskCardAvatar(game) {
    if (game && game.iconImage) {
      const img = document.createElement("img");
      img.className = "task-card-avatar";
      img.src = game.iconImage;
      img.alt = "";
      img.draggable = false;
      return img;
    }
    const ph = document.createElement("div");
    ph.className = "task-card-avatar task-card-avatar-placeholder";
    ph.setAttribute("aria-hidden", "true");
    ph.textContent = ((game && game.name) || "?").trim().charAt(0).toUpperCase() || "?";
    return ph;
  }

  /**
   * Home/dailies heading: game icon left of name, optional potential under the name.
   * Returns { el, nameEl }.
   */
  function buildTaskGameHeading(game, opts) {
    const o = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "task-game-heading" + (o.className ? " " + o.className : "");

    if (game && game.iconImage) {
      const img = document.createElement("img");
      img.className = "task-game-heading-icon";
      img.src = game.iconImage;
      img.alt = "";
      img.draggable = false;
      wrap.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "task-game-heading-icon task-game-heading-icon-placeholder";
      ph.setAttribute("aria-hidden", "true");
      ph.textContent = ((game && game.name) || o.title || "?").trim().charAt(0).toUpperCase() || "?";
      wrap.appendChild(ph);
    }

    const text = document.createElement("div");
    text.className = "task-game-heading-text";
    const nameEl = document.createElement("span");
    nameEl.className = "task-label";
    nameEl.textContent = o.title || (game && game.name) || "Game";
    text.appendChild(nameEl);
    if (o.potential != null && String(o.potential).trim() !== "") {
      const pot = document.createElement("span");
      pot.className = "task-potential";
      pot.textContent = o.potential;
      text.appendChild(pot);
    }
    wrap.appendChild(text);
    return { el: wrap, nameEl: nameEl };
  }

  /**
   * Inter-Knot style media header: banner (or placeholder) + overlapping game avatar/name.
   * opts.surface: "home" | "board" | "games" (default board)
   * Empty banners shrink to the game-name byline except on home (keeps full placeholder).
   */
  function appendTaskCardMedia(cardEl, task, game, opts) {
    if (!cardEl) return null;
    const surface = (opts && opts.surface) || "board";
    const banner = getTaskBannerForSurface(task, surface);
    const hasBanner = !!banner.image;
    const shrinkEmpty = !hasBanner && surface !== "home";
    const aspect = hasBanner ? banner.aspect : 16 / 9;
    const media = document.createElement("div");
    media.className = "task-card-media"
      + (hasBanner ? "" : " task-card-media-empty")
      + (shrinkEmpty ? " task-card-media-compact" : "");
    if (!shrinkEmpty) media.style.aspectRatio = String(aspect);

    if (hasBanner) {
      const img = document.createElement("img");
      img.className = "task-banner-card task-banner-viewport-img";
      img.src = banner.image;
      img.alt = "";
      img.loading = "lazy";
      img.draggable = false;
      applyBannerViewportImgStyles(img, banner.view);
      media.appendChild(img);
      cardEl.classList.add("has-task-banner");
    } else if (!shrinkEmpty) {
      const ph = document.createElement("div");
      ph.className = "task-card-media-placeholder";
      ph.setAttribute("aria-hidden", "true");
      media.appendChild(ph);
    }

    const byline = document.createElement("div");
    byline.className = "task-card-byline";
    byline.appendChild(buildTaskCardAvatar(game));
    const author = document.createElement("span");
    author.className = "task-card-author";
    author.textContent = (game && game.name) || "Game";
    byline.appendChild(author);
    media.appendChild(byline);

    cardEl.classList.add("task-card-knot");
    cardEl.appendChild(media);
    return media;
  }

  function appendTaskCardBody(cardEl) {
    const body = document.createElement("div");
    body.className = "task-card-body";
    cardEl.appendChild(body);
    return body;
  }

  /** Compress an image file to a JPEG data URL (shared by task banners + game icons). */
  function compressImageFileToDataUrl(file, opts) {
    const options = opts || {};
    const maxW = options.maxWidth || 720;
    const quality = options.quality == null ? 0.72 : options.quality;
    const maxBytes = options.maxBytes || 4 * 1024 * 1024;
    return new Promise((resolve, reject) => {
      if (!file || !String(file.type || "").startsWith("image/")) {
        reject(new Error("Choose an image file."));
        return;
      }
      if (file.size > maxBytes) {
        reject(new Error("Image is too large (max " + Math.round(maxBytes / (1024 * 1024)) + "MB)."));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth || img.width));
        const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load image."));
      };
      img.src = url;
    });
  }

  /**
   * Game identity row: square icon + name + optional subtitle (list headers / Games title).
   * opts: { tagName?, className?, showPlaceholder?, interactive? }
   */
  function buildGameIdentityHeader(game, opts) {
    const o = opts || {};
    const el = document.createElement(o.tagName || "div");
    const shape = (game && (game.iconShape === "circle" || game.iconShape === "square" || game.iconShape === "rounded"))
      ? game.iconShape
      : "rounded";
    el.className =
      "game-identity game-identity-shape-" +
      shape +
      (o.className ? " " + o.className : "") +
      (o.interactive ? " game-identity-interactive" : "");
    if (o.interactive) {
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.setAttribute("aria-label", "Edit game identity for " + ((game && game.name) || "game"));
    }
    if (game && game.iconImage) {
      const icon = document.createElement("img");
      icon.className = "game-identity-icon";
      icon.src = game.iconImage;
      icon.alt = "";
      icon.draggable = false;
      el.appendChild(icon);
    } else if (o.showPlaceholder) {
      const ph = document.createElement("div");
      ph.className = "game-identity-icon game-identity-icon-placeholder";
      ph.setAttribute("aria-hidden", "true");
      const letter = ((game && game.name) || "?").trim().charAt(0).toUpperCase() || "?";
      ph.textContent = letter;
      el.appendChild(ph);
    }
    const text = document.createElement("div");
    text.className = "game-identity-text";
    const name = document.createElement("div");
    name.className = "game-identity-name";
    name.textContent = (game && game.name) || "Game";
    text.appendChild(name);
    const sub = (game && game.subtitle && String(game.subtitle).trim()) || "";
    if (sub) {
      const subtitle = document.createElement("div");
      subtitle.className = "game-identity-subtitle";
      subtitle.textContent = sub;
      text.appendChild(subtitle);
    } else if (o.interactive) {
      const hint = document.createElement("div");
      hint.className = "game-identity-subtitle game-identity-hint";
      hint.textContent = "Click to edit icon, name, and subtitle";
      text.appendChild(hint);
    }
    el.appendChild(text);
    return el;
  }


  function buildDailyTaskItem(game, tagName) {
    const doneToday = isCompletedToday("dailies", game.id);
    const el = document.createElement(tagName || "li");
    el.className = "task-item task-item-daily" + (doneToday ? " done" : "");

    const iconWrap = document.createElement("div");
    iconWrap.className = "task-daily-icon";
    if (game && game.iconImage) {
      const img = document.createElement("img");
      img.src = game.iconImage;
      img.alt = "";
      img.draggable = false;
      iconWrap.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "task-daily-icon-placeholder";
      ph.setAttribute("aria-hidden", "true");
      ph.textContent = ((game && game.name) || "?").trim().charAt(0).toUpperCase() || "?";
      iconWrap.appendChild(ph);
    }
    el.appendChild(iconWrap);

    const main = document.createElement("div");
    main.className = "task-daily-main";

    const head = document.createElement("div");
    head.className = "task-daily-head";
    const nameEl = document.createElement("span");
    nameEl.className = "task-label";
    nameEl.textContent = (game && game.name) || game.id;
    nameEl.addEventListener("click", () => toggleDaily(game.id));
    head.appendChild(nameEl);
    const pot = document.createElement("span");
    pot.className = "task-potential";
    pot.textContent = "Potential: " + getDailyPotential(game);
    head.appendChild(pot);
    main.appendChild(head);

    const statusRow = document.createElement("div");
    statusRow.className = "task-daily-status";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    check.setAttribute("aria-label", doneToday ? "Mark incomplete" : "Mark complete");
    check.addEventListener("click", () => toggleDaily(game.id));
    statusRow.appendChild(check);
    const statusText = document.createElement("div");
    statusText.className = "task-daily-status-text";
    const statusLabel = document.createElement("strong");
    statusLabel.textContent = "Completion Status:";
    const statusVal = document.createElement("span");
    statusVal.textContent = doneToday ? "Complete" : "Incomplete";
    statusText.appendChild(statusLabel);
    statusText.appendChild(statusVal);
    statusRow.appendChild(statusText);
    main.appendChild(statusRow);

    const remainingRow = document.createElement("div");
    remainingRow.className = "task-daily-remaining";
    const remLabel = document.createElement("span");
    remLabel.innerHTML = "<strong>Time remaining:</strong>";
    remainingRow.appendChild(remLabel);
    const remainingVal = document.createElement("span");
    remainingVal.className = "task-remaining";
    remainingVal.dataset.type = "daily";
    remainingVal.dataset.gameId = game.id;
    remainingVal.textContent = getDailyTimeRemainingText(game, getSimulatedNow());
    remainingRow.appendChild(remainingVal);
    main.appendChild(remainingRow);

    el.appendChild(main);
    return el;
  }

  /** Square left icon sized to card height, but capped so it never covers text on narrow screens. */
  function syncDailyCardIconSizes(root) {
    if (!root) return;
    const cards = Array.from(root.querySelectorAll(".task-item-daily"));
    if (cards.length === 0) return;
    cards.forEach((card) => {
      const icon = card.querySelector(".task-daily-icon");
      if (!icon) return;
      icon.style.width = "";
      icon.style.minWidth = "";
      icon.style.height = "";
      icon.style.minHeight = "";
    });
    cards.forEach((card) => {
      const icon = card.querySelector(".task-daily-icon");
      if (!icon) return;
      const cs = getComputedStyle(card);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const rect = card.getBoundingClientRect();
      const fromHeight = Math.max(56, Math.round(rect.height - padY));
      // Keep enough room for the text column on narrow / hamburger layouts.
      const maxFromWidth = Math.max(56, Math.floor((rect.width - padX) * 0.4));
      const side = Math.min(fromHeight, maxFromWidth);
      icon.style.width = side + "px";
      icon.style.minWidth = side + "px";
      icon.style.height = side + "px";
      icon.style.minHeight = side + "px";
    });
  }

  /** Size home daily cards; use 2 rows when hamburger / only ~2 would fit in one row. */
  function syncHomeDailyCardSizes(grid) {
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll(":scope > .task-item-daily"));
    if (cards.length === 0) return;

    const scroll = grid.closest(".home-dwe-checklist-scroll");
    const viewportW = scroll ? scroll.clientWidth : 0;
    const styles = scroll ? getComputedStyle(scroll) : null;
    const padX = styles
      ? (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
      : 16;
    const gap = parseFloat(getComputedStyle(grid).gap) || 8;
    const usable = viewportW > 0 ? Math.max(0, viewportW - padX) : 0;
    const isNarrow = viewportW > 0 && viewportW < 769;
    const minSingle = isNarrow ? 300 : 280;
    const colsIfSingle = usable > 0
      ? Math.floor((usable + gap) / (minSingle + gap))
      : 4;
    const useTwoRows = cards.length >= 2 && (isNarrow || colsIfSingle <= 2);

    let visibleCols;
    let minCard;
    if (useTwoRows) {
      // Prefer 2 columns across when width allows; otherwise one column + peek scroll.
      visibleCols = usable >= (minSingle * 2 + gap) ? 2 : 1.25;
      minCard = isNarrow ? 280 : 260;
    } else {
      visibleCols = 3.5;
      minCard = 280;
    }
    const fitW = usable > 0
      ? Math.floor((usable - gap * Math.max(0, visibleCols - 1)) / visibleCols)
      : 0;

    cards.forEach((card) => {
      card.style.width = "auto";
      card.style.minWidth = "0";
      card.style.height = "auto";
      card.style.minHeight = "0";
      card.style.maxHeight = "none";
      const icon = card.querySelector(".task-daily-icon");
      if (icon) {
        icon.style.width = "";
        icon.style.minWidth = "";
        icon.style.height = "";
        icon.style.minHeight = "";
        icon.style.flex = "";
      }
    });

    const cardW = Math.max(minCard, fitW || minCard);
    grid.classList.toggle("home-dailies-two-rows", useTwoRows);
    grid.style.gridAutoColumns = cardW + "px";
    grid.style.gridAutoFlow = "column";
    grid.style.gridTemplateRows = useTwoRows ? "auto auto" : "1fr";
    cards.forEach((card) => {
      card.style.width = cardW + "px";
      card.style.minWidth = cardW + "px";
    });

    let maxH = 0;
    cards.forEach((card) => {
      maxH = Math.max(maxH, Math.ceil(card.scrollHeight), Math.ceil(card.getBoundingClientRect().height));
    });
    maxH = Math.max(140, maxH);

    cards.forEach((card) => {
      card.style.height = maxH + "px";
      card.style.minHeight = maxH + "px";
      card.style.maxHeight = maxH + "px";
    });
    if (useTwoRows) {
      grid.style.gridTemplateRows = maxH + "px " + maxH + "px";
    }
    syncDailyCardIconSizes(grid);
  }

  function renderDailies() {
    const content = document.getElementById("dailies-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const list = document.createElement("div");
    list.id = "list-dailies";
    list.className = "task-grid task-grid-dailies";
    list.dataset.masonryMax = "3";
    list.setAttribute("data-type", "dailies");

    let hasAny = false;
    games.forEach((game) => {
      if (!game.dailies) return;
      hasAny = true;
      list.appendChild(buildDailyTaskItem(game, "div"));
    });
    if (!hasAny) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.style.gridColumn = "1 / -1";
      empty.textContent = "No games yet. Add one in the Games tab.";
      list.appendChild(empty);
    }
    content.appendChild(list);
    scheduleTaskMasonry(list);
    requestAnimationFrame(() => {
      syncDailyCardIconSizes(list);
      list.querySelectorAll("img").forEach((img) => {
        if (img.complete) return;
        img.addEventListener("load", () => syncDailyCardIconSizes(list), { once: true });
      });
    });
  }

  function buildWeeklyTaskItem(game, task, tagName, opts) {
    const key = game.id + "." + (task.id || task.label);
    const now = getSimulatedNow();
    const ended = isTaskCycleEnded(task, now, game);
    const doneToday = !ended && isWeeklyCompletedInCurrentCycle(key, getDateStr());
    const locked = !ended && !doneToday && !isTaskCompletionUnlocked("weeklies", task, game, now);
    const el = document.createElement(tagName || "li");
    el.className = "task-item" + (doneToday ? " done" : "") + (ended ? " task-item-ended" : "") + (locked ? " task-item-locked" : "");

    const media = appendTaskCardMedia(el, task, game, opts);
    const surface = (opts && opts.surface) || "board";
    if (surface !== "home" && media) {
      const actions = document.createElement("div");
      actions.className = "task-card-media-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn";
      editBtn.textContent = "✎";
      editBtn.setAttribute("aria-label", "Edit task");
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openTaskModal({ gameId: game.id, taskType: "weeklies", task: task });
      });
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "icon-btn";
      deleteBtn.textContent = "×";
      deleteBtn.setAttribute("aria-label", "Delete task");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteGameBoardTask(game.id, "weeklies", task.id || task.label);
      });
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      media.appendChild(actions);
    }
    const body = appendTaskCardBody(el);

    const top = document.createElement("div");
    top.className = "task-top task-card-title-row";
    const titleCol = document.createElement("div");
    titleCol.className = "task-game-heading-text";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label || "Weekly";
    const potSpan = document.createElement("span");
    potSpan.className = "task-potential";
    potSpan.textContent = "Potential: " + getWeeklyPotential(task);
    titleCol.appendChild(span);
    titleCol.appendChild(potSpan);
    top.appendChild(titleCol);
    body.appendChild(top);

    const remainingText = ended ? "Ended" : getWeeklyTimeRemainingText(task, now, game);
    const statusText = ended ? "Ended" : (doneToday ? "Complete" : (locked ? "Locked" : "Incomplete"));
    const snippet = document.createElement("p");
    snippet.className = "task-card-snippet";
    snippet.textContent = statusText + " · " + remainingText;
    body.appendChild(snippet);

    const sub = document.createElement("div");
    sub.className = "task-subrows";
    const row1 = document.createElement("div");
    row1.className = "task-subrow";
    const left1 = document.createElement("div");
    left1.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    const unlockHint = locked ? getTaskUnlockHint("weeklies", task, game, now) : "";
    const statusId = "weekly-status-" + String(key).replace(/[^a-zA-Z0-9_-]/g, "_");
    check.setAttribute("aria-label", doneToday ? "Mark incomplete" : (locked ? "Locked. " + unlockHint : "Mark complete"));
    if (ended || locked) check.disabled = true;
    if (locked) {
      check.setAttribute("aria-disabled", "true");
      check.setAttribute("aria-describedby", statusId);
      check.title = unlockHint;
    }
    check.addEventListener("click", () => toggleWeekly(game.id, task.id || task.label));
    const label1 = document.createElement("span");
    label1.id = statusId;
    label1.innerHTML = "<strong>Status:</strong> " + (ended ? "Ended" : (doneToday ? "Complete" : (locked ? ("Locked — " + unlockHint) : "Incomplete")));
    if (!ended && !locked) span.addEventListener("click", () => toggleWeekly(game.id, task.id || task.label));
    left1.appendChild(check);
    left1.appendChild(label1);
    row1.appendChild(left1);
    sub.appendChild(row1);

    const remainingRow = document.createElement("div");
    remainingRow.className = "task-subrow";
    const leftR = document.createElement("div");
    leftR.className = "left";
    const labelR = document.createElement("span");
    labelR.innerHTML = "<strong>Time remaining:</strong>";
    leftR.appendChild(labelR);
    remainingRow.appendChild(leftR);
    const rightR = document.createElement("div");
    rightR.className = "task-subrow-right";
    const remainingVal = document.createElement("span");
    remainingVal.className = "task-remaining";
    remainingVal.dataset.type = "weekly";
    remainingVal.dataset.gameId = game.id;
    remainingVal.dataset.taskId = (task.id || task.label);
    remainingVal.textContent = remainingText;
    rightR.appendChild(remainingVal);
    if (task.manualReset) {
      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "task-manual-reset-btn";
      resetBtn.setAttribute("aria-label", "Manual reset / start");
      resetBtn.title = "Manual reset / start";
      resetBtn.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><polyline points=\"23 4 23 10 17 10\"/><path d=\"M20.49 15a9 9 0 1 1-2.12-9.36L23 10\"/></svg>";
      resetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof openManualResetModal === "function") {
          openManualResetModal({
            gameId: game.id,
            taskType: "weeklies",
            taskId: task.id || task.label,
            reason: "reset",
          });
        }
      });
      rightR.appendChild(resetBtn);
    }
    remainingRow.appendChild(rightR);
    sub.appendChild(remainingRow);

    body.appendChild(sub);
    return el;
  }

  function collectWeeklyBoardEntries() {
    const now = getSimulatedNow();
    const todayStr = getDateStr();
    const entries = [];
    getAllGames().forEach((game, gameIdx) => {
      (game.weeklies || []).forEach((task, taskIdx) => {
        if (isTaskCycleEnded(task, now, game)) return;
        const key = game.id + "." + (task.id || task.label);
        entries.push({
          game,
          task,
          completed: isWeeklyCompletedInCurrentCycle(key, todayStr),
          dueMs: (() => {
            const rem = getWeeklyTimeRemainingMs(task, now, game);
            return rem == null ? Number.POSITIVE_INFINITY : now.getTime() + rem;
          })(),
          gameOrder: gameIdx,
          taskOrder: taskIdx,
        });
      });
    });
    return sortBoardTaskEntries(entries);
  }

  function renderWeeklies() {
    const content = document.getElementById("weeklies-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const entries = collectWeeklyBoardEntries();

    if (games.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No tasks yet. Add one above.";
      content.appendChild(p);
      return;
    }

    if (entries.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No active weekly tasks. Add tasks in the Games tab.";
      content.appendChild(p);
      return;
    }

    const list = document.createElement("div");
    list.id = "list-weeklies";
    list.className = "task-grid task-grid-knot";
    list.setAttribute("data-type", "weeklies");
    entries.forEach((entry) => {
      list.appendChild(buildWeeklyTaskItem(entry.game, entry.task, "div"));
    });
    content.appendChild(list);
    scheduleTaskMasonry(list);
  }

  function buildEndgameTaskItem(game, task, tagName, opts) {
    const key = game.id + "." + (task.id || task.label);
    const now = getSimulatedNow();
    const ended = isTaskCycleEnded(task, now, game);
    const doneToday = !ended && isEndgameCompletedInCurrentCycle(key, getDateStr());
    const locked = !ended && !doneToday && !isTaskCompletionUnlocked("endgame", task, game, now);
    const el = document.createElement(tagName || "li");
    el.className = "task-item" + (doneToday ? " done" : "") + (ended ? " task-item-ended" : "") + (locked ? " task-item-locked" : "");

    const media = appendTaskCardMedia(el, task, game, opts);
    const surface = (opts && opts.surface) || "board";
    if (surface !== "home" && media) {
      const actions = document.createElement("div");
      actions.className = "task-card-media-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "icon-btn";
      editBtn.textContent = "✎";
      editBtn.setAttribute("aria-label", "Edit task");
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openTaskModal({ gameId: game.id, taskType: "endgame", task: task });
      });
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "icon-btn";
      deleteBtn.textContent = "×";
      deleteBtn.setAttribute("aria-label", "Delete task");
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteGameBoardTask(game.id, "endgame", task.id || task.label);
      });
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      media.appendChild(actions);
    }
    const body = appendTaskCardBody(el);

    const top = document.createElement("div");
    top.className = "task-top task-card-title-row";
    const titleCol = document.createElement("div");
    titleCol.className = "task-game-heading-text";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label || "Endgame";
    const potSpan = document.createElement("span");
    potSpan.className = "task-potential";
    potSpan.textContent = "Potential: " + getEndgamePotential(task);
    titleCol.appendChild(span);
    titleCol.appendChild(potSpan);
    top.appendChild(titleCol);
    body.appendChild(top);

    const remainingText = ended ? "Ended" : getEndgameTimeRemainingText(task, now, game);
    const statusText = ended ? "Ended" : (doneToday ? "Complete" : (locked ? "Locked" : "Incomplete"));
    const snippet = document.createElement("p");
    snippet.className = "task-card-snippet";
    snippet.textContent = statusText + " · " + remainingText;
    body.appendChild(snippet);

    const sub = document.createElement("div");
    sub.className = "task-subrows";

    const row1 = document.createElement("div");
    row1.className = "task-subrow";
    const left1 = document.createElement("div");
    left1.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    const unlockHint = locked ? getTaskUnlockHint("endgame", task, game, now) : "";
    const statusId = "endgame-status-" + String(key).replace(/[^a-zA-Z0-9_-]/g, "_");
    check.setAttribute("aria-label", doneToday ? "Mark incomplete" : (locked ? "Locked. " + unlockHint : "Mark complete"));
    if (ended || locked) check.disabled = true;
    if (locked) {
      check.setAttribute("aria-disabled", "true");
      check.setAttribute("aria-describedby", statusId);
      check.title = unlockHint;
    }
    check.addEventListener("click", () => requestToggleEndgame(game.id, task.id || task.label));
    const label1 = document.createElement("span");
    label1.id = statusId;
    label1.innerHTML = "<strong>Status:</strong> " + (ended ? "Ended" : (doneToday ? "Complete" : (locked ? ("Locked — " + unlockHint) : "Incomplete")));
    if (!ended && !locked) span.addEventListener("click", () => requestToggleEndgame(game.id, task.id || task.label));
    left1.appendChild(check);
    left1.appendChild(label1);
    row1.appendChild(left1);
    sub.appendChild(row1);

    const remainingRow = document.createElement("div");
    remainingRow.className = "task-subrow";
    const leftR = document.createElement("div");
    leftR.className = "left";
    const labelR = document.createElement("span");
    labelR.innerHTML = "<strong>Time remaining:</strong>";
    leftR.appendChild(labelR);
    remainingRow.appendChild(leftR);
    const remainingVal = document.createElement("span");
    remainingVal.className = "task-remaining";
    remainingVal.dataset.type = "endgame";
    remainingVal.dataset.gameId = game.id;
    remainingVal.dataset.taskId = (task.id || task.label);
    remainingVal.textContent = remainingText;
    remainingRow.appendChild(remainingVal);
    sub.appendChild(remainingRow);

    const completedCount = getCompletedAmount(state.endgameCompleted, key);
    ensureEndgameEarnedArrayLength(game.id, task.id || task.label, completedCount);
    const earnedArr = getEndgameEarnedPerCompletion(game.id, task.id || task.label);
    const row2 = document.createElement("div");
    row2.className = "task-subrow";
    const left2 = document.createElement("div");
    left2.className = "left";
    const label2 = document.createElement("span");
    label2.innerHTML = "<strong>Earned this cycle:</strong>";
    left2.appendChild(label2);
    row2.appendChild(left2);
    const right2 = document.createElement("div");
    right2.className = "task-subrow-right";
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.placeholder = "0";
    let currentIdx;
    if (doneToday) {
      currentIdx = completedCount > 0 ? completedCount - 1 : 0;
      inp.value = completedCount > 0 ? String(earnedArr[currentIdx] || 0) : "";
    } else {
      currentIdx = completedCount;
      const pending = getEndgamePendingAmount(key, game, task);
      inp.value = pending > 0 ? String(pending) : "";
    }
    inp.title = "Amount earned for the current cycle";
    inp.addEventListener("change", () => {
      if (doneToday) {
        setEndgameEarnedAt(game.id, task.id || task.label, currentIdx, inp.value);
      } else {
        setEndgamePendingAmount(key, game, task, inp.value);
      }
    });
    right2.appendChild(inp);
    if (task.manualReset) {
      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "task-manual-reset-btn";
      resetBtn.setAttribute("aria-label", "Manual reset / start");
      resetBtn.title = "Manual reset / start";
      resetBtn.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><polyline points=\"23 4 23 10 17 10\"/><path d=\"M20.49 15a9 9 0 1 1-2.12-9.36L23 10\"/></svg>";
      resetBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof openManualResetModal === "function") {
          openManualResetModal({
            gameId: game.id,
            taskType: "endgame",
            taskId: task.id || task.label,
            reason: "reset",
          });
        }
      });
      right2.appendChild(resetBtn);
    }
    row2.appendChild(right2);
    sub.appendChild(row2);

    body.appendChild(sub);
    return el;
  }

  function collectEndgameBoardEntries() {
    const now = getSimulatedNow();
    const todayStr = getDateStr();
    const entries = [];
    getAllGames().forEach((game, gameIdx) => {
      (game.endgame || []).forEach((task, taskIdx) => {
        if (isTaskCycleEnded(task, now, game)) return;
        const key = game.id + "." + (task.id || task.label);
        entries.push({
          game,
          task,
          completed: isEndgameCompletedInCurrentCycle(key, todayStr),
          dueMs: (() => {
            const rem = getEndgameTimeRemainingMs(task, now, game);
            return rem == null ? Number.POSITIVE_INFINITY : now.getTime() + rem;
          })(),
          gameOrder: gameIdx,
          taskOrder: taskIdx,
        });
      });
    });
    return sortBoardTaskEntries(entries);
  }

  function renderEndgame() {
    const content = document.getElementById("endgame-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const entries = collectEndgameBoardEntries();

    if (games.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No tasks yet. Add one above.";
      content.appendChild(p);
      return;
    }

    if (entries.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No active endgame tasks. Add tasks in the Games tab.";
      content.appendChild(p);
      return;
    }

    const list = document.createElement("div");
    list.id = "list-endgame";
    list.className = "task-grid task-grid-knot";
    list.setAttribute("data-type", "endgame");
    entries.forEach((entry) => {
      list.appendChild(buildEndgameTaskItem(entry.game, entry.task, "div"));
    });
    content.appendChild(list);
    scheduleTaskMasonry(list);
  }

  function updateTaskRemainingTexts() {
    const tab = state.tab;
    if (tab !== "dailies" && tab !== "weeklies" && tab !== "endgame" && tab !== "home") return;
    const now = getSimulatedNow();
    document.querySelectorAll(".task-remaining").forEach((el) => {
      const type = el.dataset.type;
      const gameId = el.dataset.gameId;
      const taskId = el.dataset.taskId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game) return;
      if (type === "daily") {
        el.textContent = getDailyTimeRemainingText(game, now);
      } else if (type === "weekly" && taskId) {
        const task = (game.weeklies || []).find((t) => (t.id || t.label) === taskId);
        if (task) el.textContent = getWeeklyTimeRemainingText(task, now, game);
      } else if (type === "endgame" && taskId) {
        const task = (game.endgame || []).find((t) => (t.id || t.label) === taskId);
        if (task) el.textContent = getEndgameTimeRemainingText(task, now, game);
      }
    });
  }


  function getHistoryDWEForDate(dateStr, availableOpt) {
    const available = availableOpt || getTasksAvailableOnDate(dateStr);
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const wCompleted = (available.weeklies || []).filter((item) => (dayData.weeklies || []).includes(item.key)).length;
    const eCompleted = (available.endgame || []).filter((item) => (dayData.endgame || []).includes(item.key)).length;
    return {
      dCompleted: (dayData.dailies || []).length,
      dTotal: (available.dailies || []).length,
      wCompleted,
      wTotal: (available.weeklies || []).length,
      eCompleted,
      eTotal: (available.endgame || []).length,
    };
  }

  function getHistoryCompletedTaskLabels(dateStr, availableOpt) {
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const available = availableOpt || getTasksAvailableOnDate(dateStr);
    const labels = { dailies: [], weeklies: [], endgame: [] };
    (dayData.dailies || []).forEach((gameId) => {
      const game = getGame(gameId);
      labels.dailies.push({ text: game ? game.name : gameId, carried: false });
    });
    (available.weeklies || []).filter((item) => (dayData.weeklies || []).includes(item.key)).forEach((item) => {
      const key = item.key;
      const dot = key.indexOf(".");
      const gId = dot >= 0 ? key.slice(0, dot) : key;
      const tId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gId);
      const task = (game?.weeklies || []).find((t) => (t.id || t.label) === tId);
      const carried = typeof isCarriedCompletionMark === "function" && isCarriedCompletionMark("weeklies", key, dateStr);
      labels.weeklies.push({
        text: (task ? task.label : tId) + (carried ? " (carried)" : ""),
        carried: !!carried,
      });
    });
    (available.endgame || []).filter((item) => (dayData.endgame || []).includes(item.key)).forEach((item) => {
      const key = item.key;
      const dot = key.indexOf(".");
      const gId = dot >= 0 ? key.slice(0, dot) : key;
      const tId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gId);
      const task = (game?.endgame || []).find((t) => (t.id || t.label) === tId);
      const carried = typeof isCarriedCompletionMark === "function" && isCarriedCompletionMark("endgame", key, dateStr);
      labels.endgame.push({
        text: (task ? task.label : tId) + (carried ? " (carried)" : ""),
        carried: !!carried,
      });
    });
    return labels;
  }

  /** H1: one availability scan per day for History DWE bars + tooltips. */
  function buildHistoryDayModel(dateStr) {
    const available = getTasksAvailableOnDate(dateStr);
    return {
      dateStr,
      available,
      dwe: getHistoryDWEForDate(dateStr, available),
      labels: getHistoryCompletedTaskLabels(dateStr, available),
    };
  }

  // H2: cache day models across History renders; wipe when completion/games/format inputs change.
  let historyDayModelCache = null; // { invalidationKey, models: Map<dateStr, model> }

  function getHistoryDayModelCacheKey() {
    const games = typeof getAllGames === "function" ? getAllGames() : [];
    const gameSig = games
      .map((g) => {
        const w = (g.weeklies || []).map((t) => t.id || t.label).join(",");
        const e = (g.endgame || []).map((t) => t.id || t.label).join(",");
        return g.id + ":w[" + w + "]:e[" + e + "]";
      })
      .join("|");
    const tz =
      typeof getRecordingTimezone === "function"
        ? getRecordingTimezone()
        : typeof getAppTimezone === "function"
          ? getAppTimezone()
          : "";
    return [
      state.dataVersion || 0,
      state.dateFormat || "",
      state.firstDayOfWeek ?? "",
      tz,
      gameSig,
    ].join("::");
  }

  function getCachedHistoryDayModel(dateStr, stats) {
    const inv = getHistoryDayModelCacheKey();
    if (!historyDayModelCache || historyDayModelCache.invalidationKey !== inv) {
      historyDayModelCache = { invalidationKey: inv, models: new Map() };
    }
    const hit = historyDayModelCache.models.get(dateStr);
    if (hit) {
      if (stats) stats.hits++;
      return hit;
    }
    if (stats) stats.misses++;
    const model = buildHistoryDayModel(dateStr);
    historyDayModelCache.models.set(dateStr, model);
    // Soft cap: keep roughly a few months of visited days.
    if (historyDayModelCache.models.size > 120) {
      const oldest = historyDayModelCache.models.keys().next().value;
      if (oldest != null) historyDayModelCache.models.delete(oldest);
    }
    return model;
  }

  let historyDweTooltipActive = null;
  let historyDweTooltipWrap = null;

  function hideHistoryDweTooltip() {
    const tip = historyDweTooltipActive;
    const wrap = historyDweTooltipWrap;
    historyDweTooltipActive = null;
    historyDweTooltipWrap = null;
    if (!tip) return;
    tip.classList.remove("is-open");
    tip.style.position = "";
    tip.style.left = "";
    tip.style.top = "";
    tip.style.bottom = "";
    tip.style.transform = "";
    tip.style.zIndex = "";
    tip.style.maxWidth = "";
    if (wrap && tip.parentNode !== wrap) wrap.appendChild(tip);
    else if (!wrap && tip.parentNode === document.body) tip.remove();
  }

  function positionHistoryDweTooltip(wrap, tip) {
    const rect = wrap.getBoundingClientRect();
    tip.style.position = "fixed";
    tip.style.bottom = "auto";
    tip.style.zIndex = "10000";
    tip.style.maxWidth = "min(22rem, calc(100vw - 1rem))";
    tip.style.left = Math.max(8, rect.left) + "px";
    tip.style.top = rect.top + "px";
    tip.style.transform = "translateY(-100%) translateY(-0.35rem)";
    const tipRect = tip.getBoundingClientRect();
    if (tipRect.top < 8) {
      tip.style.top = rect.bottom + "px";
      tip.style.transform = "translateY(0.35rem)";
    }
    const tipRect2 = tip.getBoundingClientRect();
    if (tipRect2.right > window.innerWidth - 8) {
      tip.style.left = Math.max(8, window.innerWidth - tipRect2.width - 8) + "px";
    }
  }

  function normalizeHistoryTipItems(labelItems) {
    return (labelItems || []).map((item) => (typeof item === "string" ? { text: item, carried: false } : item));
  }

  function createHistoryDweTooltipEl(items, typeName) {
    const tooltip = document.createElement("div");
    tooltip.className = "history-dwe-tooltip history-dwe-tooltip-" + typeName;
    tooltip.setAttribute("role", "tooltip");
    items.forEach((i) => {
      const bit = document.createElement("div");
      bit.className =
        "history-dwe-tooltip-item attendance-tooltip-" +
        typeName +
        (i.carried ? " history-dwe-tooltip-carried" : "");
      const base = String(i.text || "").replace(/\s*\(carried\)\s*$/i, "");
      bit.appendChild(document.createTextNode(base));
      if (i.carried) {
        const tag = document.createElement("span");
        tag.className = "history-dwe-tooltip-carried-tag";
        tag.textContent = " (carried)";
        bit.appendChild(tag);
      }
      tooltip.appendChild(bit);
    });
    return tooltip;
  }

  function ensureHistoryDweTooltip(wrap) {
    if (historyDweTooltipWrap === wrap && historyDweTooltipActive) return historyDweTooltipActive;
    let tip = wrap.querySelector(".history-dwe-tooltip");
    if (tip) return tip;
    const items = wrap._historyTipItems;
    if (!items || !items.length) return null;
    tip = createHistoryDweTooltipEl(items, wrap._historyTipType || "dailies");
    wrap.appendChild(tip);
    return tip;
  }

  function showHistoryDweTooltip(wrap) {
    const tip = ensureHistoryDweTooltip(wrap);
    if (!tip) return;
    if (historyDweTooltipActive && historyDweTooltipActive !== tip) hideHistoryDweTooltip();
    historyDweTooltipActive = tip;
    historyDweTooltipWrap = wrap;
    document.body.appendChild(tip);
    tip.classList.add("is-open");
    positionHistoryDweTooltip(wrap, tip);
  }

  function historyBarWrapFromEvent(root, target) {
    if (!target || !target.closest) return null;
    const wrap = target.closest(".history-dwe-bar-wrap");
    if (!wrap || !root.contains(wrap)) return null;
    if (!wrap._historyTipItems || !wrap._historyTipItems.length) return null;
    return wrap;
  }

  function bindHistoryDweTooltips(root) {
    if (!root) return;
    // H4: delegate so H3 grid swaps do not rebind every bar; tip DOM is built on first show.
    if (!root._historyDweTipDelegated) {
      root._historyDweTipDelegated = true;
      root.addEventListener("mouseover", (e) => {
        const wrap = historyBarWrapFromEvent(root, e.target);
        if (!wrap) return;
        if (historyDweTooltipWrap === wrap && historyDweTooltipActive) return;
        showHistoryDweTooltip(wrap);
      });
      root.addEventListener("mouseout", (e) => {
        const wrap = historyBarWrapFromEvent(root, e.target);
        if (!wrap) return;
        if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
        if (historyDweTooltipWrap === wrap) hideHistoryDweTooltip();
      });
      root.addEventListener("focusin", (e) => {
        const wrap = historyBarWrapFromEvent(root, e.target);
        if (!wrap) return;
        showHistoryDweTooltip(wrap);
      });
      root.addEventListener("focusout", (e) => {
        const wrap = historyBarWrapFromEvent(root, e.target);
        if (!wrap) return;
        if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
        if (historyDweTooltipWrap === wrap) hideHistoryDweTooltip();
      });
    }
    if (!root._historyDweScrollBound) {
      root._historyDweScrollBound = true;
      root.addEventListener("scroll", hideHistoryDweTooltip, { passive: true });
    }
    if (!bindHistoryDweTooltips._windowBound) {
      bindHistoryDweTooltips._windowBound = true;
      window.addEventListener("scroll", hideHistoryDweTooltip, true);
      window.addEventListener("resize", hideHistoryDweTooltip);
    }
  }

  const HISTORY_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function resolveHistoryMonthYear(now) {
    let month = state.historyMonth != null ? Number(state.historyMonth) : now.getMonth();
    let year = state.historyYear != null ? Number(state.historyYear) : now.getFullYear();
    if (!Number.isFinite(month) || month < 0 || month > 11) month = now.getMonth();
    if (!Number.isFinite(year) || year < 1970 || year > 2100) year = now.getFullYear();
    return { month, year };
  }

  function getHistoryYearOptions(now, selectedYear) {
    const years = new Set();
    const nowY = now.getFullYear();
    years.add(nowY);
    years.add(selectedYear);
    Object.keys(state.completionByDate || {}).forEach((ds) => {
      if (/^\d{4}-/.test(ds)) years.add(Number(ds.slice(0, 4)));
    });
    (state.completionTimestamps || []).forEach((t) => {
      if (t && isValidDateStr(t.dateStr)) years.add(Number(t.dateStr.slice(0, 4)));
    });
    for (let y = nowY - 1; y <= nowY + 2; y++) years.add(y);
    return [...years].filter((y) => Number.isFinite(y) && y >= 1970 && y <= 2100).sort((a, b) => a - b);
  }

  function buildHistoryDweBar(typeLetter, completed, total, labelItems, typeName) {
    const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
    const items = normalizeHistoryTipItems(labelItems);
    const wrap = document.createElement("div");
    wrap.className = "history-dwe-bar-wrap history-dwe-bar-wrap-" + typeName;
    const allCarried = items.length > 0 && items.every((i) => i.carried);
    if (allCarried) wrap.classList.add("history-dwe-bar-wrap-carried");
    else if (items.some((i) => i.carried)) wrap.classList.add("history-dwe-bar-wrap-mixed");
    const label = document.createElement("span");
    label.className = "history-dwe-label";
    label.textContent = typeLetter;
    wrap.appendChild(label);
    const barEl = document.createElement("div");
    barEl.className = "history-dwe-bar history-dwe-bar-" + typeLetter.toLowerCase();
    barEl.innerHTML = "<span class=\"history-dwe-fill\" style=\"width:" + pct + "%\"></span><span class=\"history-dwe-fraction\">" + escapeHtml(String(completed) + "/" + String(total)) + "</span>";
    wrap.appendChild(barEl);
    if (allCarried) {
      const mark = document.createElement("span");
      mark.className = "history-dwe-carried-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.title = "Carried from earlier in cycle";
      mark.textContent = "↻";
      wrap.appendChild(mark);
    }
    // H4: keep labels for aria / first hover; tip DOM is created in ensureHistoryDweTooltip.
    if (items.length > 0) {
      wrap._historyTipItems = items;
      wrap._historyTipType = typeName;
    }
    return wrap;
  }

  function historyDayAriaLabel(dateStr, dwe, taskLabels) {
    const dateLabel = typeof formatDate === "function" ? formatDate(dateStr) : dateStr;
    const parts = [
      "Dailies " + dwe.dCompleted + " of " + dwe.dTotal,
      "Weeklies " + dwe.wCompleted + " of " + dwe.wTotal,
      "Endgame " + dwe.eCompleted + " of " + dwe.eTotal,
    ];
    const finishedNames = []
      .concat(taskLabels.dailies || [])
      .concat(taskLabels.weeklies || [])
      .concat(taskLabels.endgame || [])
      .filter((i) => i && !i.carried)
      .map((i) => i.text);
    const carriedNames = []
      .concat(taskLabels.weeklies || [])
      .concat(taskLabels.endgame || [])
      .filter((i) => i && i.carried)
      .map((i) => i.text);
    if (finishedNames.length) parts.push("Finished: " + finishedNames.join(", "));
    if (carriedNames.length) parts.push("Carried: " + carriedNames.join(", "));
    return dateLabel + ". " + parts.join(". ") + ". Press Enter to edit.";
  }

  function buildHistoryCalendarGrid(year, month, todayStr, historyDayCacheStats) {
    const grid = document.createElement("div");
    grid.className = "history-calendar-grid";
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Completion history calendar");
    const frag = document.createDocumentFragment();
    const firstDay = state.firstDayOfWeek === 1 ? 1 : 0;
    const dayNamesOrdered = firstDay === 1 ? [...DAY_NAMES.slice(1), DAY_NAMES[0]] : DAY_NAMES;
    for (let i = 0; i < 7; i++) {
      const th = document.createElement("div");
      th.className = "history-calendar-weekday";
      th.textContent = dayNamesOrdered[i];
      frag.appendChild(th);
    }
    const recTz = getRecordingTimezone();
    const firstOfMonth = createDateInTimezone(year, month, 1, 12, 0, recTz);
    const firstParts = getDatePartsInTimezone(firstOfMonth, recTz);
    const startDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(firstParts.weekday);
    const lastOfMonth = createDateInTimezone(year, month + 1, 0, 12, 0, recTz);
    const lastParts = getDatePartsInTimezone(lastOfMonth, recTz);
    const daysInMonth = lastParts.day;
    const lastOfPrev = createDateInTimezone(year, month, 0, 12, 0, recTz);
    const lastPrevParts = getDatePartsInTimezone(lastOfPrev, recTz);
    const daysInPrevMonth = lastPrevParts.day;
    const leadingCount = (startDay - firstDay + 7) % 7;
    const totalCells = leadingCount + daysInMonth;
    const trailingCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const cellDates = [];
    for (let i = 0; i < leadingCount; i++) {
      const d = daysInPrevMonth - leadingCount + 1 + i;
      const date = createDateInTimezone(year, month - 1, d, 12, 0, recTz);
      cellDates.push({ date, dateStr: getDateStr(date), isCurrentMonth: false, dayNum: d });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = createDateInTimezone(year, month, day, 12, 0, recTz);
      cellDates.push({ date, dateStr: getDateStr(date), isCurrentMonth: true, dayNum: day });
    }
    for (let i = 0; i < trailingCount; i++) {
      const date = createDateInTimezone(year, month + 1, i + 1, 12, 0, recTz);
      cellDates.push({ date, dateStr: getDateStr(date), isCurrentMonth: false, dayNum: i + 1 });
    }
    const dayCells = [];
    cellDates.forEach(({ dateStr, isCurrentMonth, dayNum }, cellIndex) => {
      const cell = document.createElement("div");
      cell.className = "history-calendar-day";
      cell.setAttribute("role", "gridcell");
      if (!isCurrentMonth) cell.classList.add("history-calendar-day-other-month");
      if (dateStr === todayStr) cell.classList.add("history-calendar-day-today");
      if (dateStr > todayStr) cell.classList.add("history-calendar-day-future");
      const topRow = document.createElement("div");
      topRow.className = "history-calendar-day-top";
      const dayNumEl = document.createElement("div");
      dayNumEl.className = "history-calendar-day-num";
      dayNumEl.textContent = dayNum;
      topRow.appendChild(dayNumEl);
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-ghost btn-sm history-calendar-day-edit";
      editBtn.textContent = "Edit";
      editBtn.tabIndex = -1;
      editBtn.setAttribute("aria-label", "Edit " + (typeof formatDate === "function" ? formatDate(dateStr) : dateStr));
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openCalendarDayModal(dateStr);
      });
      topRow.appendChild(editBtn);
      cell.appendChild(topRow);
      const dayModel = getCachedHistoryDayModel(dateStr, historyDayCacheStats);
      const dwe = dayModel.dwe;
      const taskLabels = dayModel.labels;
      cell.appendChild(buildHistoryDweBar("D", dwe.dCompleted, dwe.dTotal, taskLabels.dailies, "dailies"));
      cell.appendChild(buildHistoryDweBar("W", dwe.wCompleted, dwe.wTotal, taskLabels.weeklies, "weeklies"));
      cell.appendChild(buildHistoryDweBar("E", dwe.eCompleted, dwe.eTotal, taskLabels.endgame, "endgame"));
      cell.setAttribute("aria-label", historyDayAriaLabel(dateStr, dwe, taskLabels));
      cell.tabIndex = -1;
      cell.dataset.cellIndex = String(cellIndex);
      cell.addEventListener("click", (e) => {
        if (e.target && e.target.closest && e.target.closest(".history-calendar-day-edit")) return;
        openCalendarDayModal(dateStr);
      });
      cell.addEventListener("keydown", (e) => {
        const cols = 7;
        let next = cellIndex;
        if (e.key === "ArrowRight") next = cellIndex + 1;
        else if (e.key === "ArrowLeft") next = cellIndex - 1;
        else if (e.key === "ArrowDown") next = cellIndex + cols;
        else if (e.key === "ArrowUp") next = cellIndex - cols;
        else if (e.key === "Home") next = cellIndex - (cellIndex % cols);
        else if (e.key === "End") next = cellIndex - (cellIndex % cols) + (cols - 1);
        else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openCalendarDayModal(dateStr);
          return;
        } else {
          return;
        }
        e.preventDefault();
        if (next < 0 || next >= dayCells.length) return;
        dayCells[cellIndex].tabIndex = -1;
        dayCells[next].tabIndex = 0;
        dayCells[next].focus();
      });
      dayCells.push(cell);
      frag.appendChild(cell);
    });
    const focusIdx = Math.max(
      0,
      dayCells.findIndex((c) => c.classList.contains("history-calendar-day-today"))
    );
    if (dayCells[focusIdx]) dayCells[focusIdx].tabIndex = 0;
    grid.appendChild(frag);
    return grid;
  }

  function mountHistoryCalendarGrid(grid, gridWrap, historyDayCacheStats) {
    const todayCell = grid.querySelector(".history-calendar-day-today");
    if (todayCell && gridWrap.scrollWidth > gridWrap.clientWidth) {
      requestAnimationFrame(function () {
        const scrollLeft = todayCell.offsetLeft - (gridWrap.clientWidth / 2) + (todayCell.offsetWidth / 2);
        gridWrap.scrollLeft = Math.max(0, scrollLeft);
      });
    }
    bindHistoryDweTooltips(gridWrap);
    if (
      typeof isPerfDebugEnabled === "function" &&
      isPerfDebugEnabled() &&
      historyDayCacheStats.hits + historyDayCacheStats.misses > 0
    ) {
      console.log(
        "[perf] historyDayModelCache: hits=" +
          historyDayCacheStats.hits +
          " misses=" +
          historyDayCacheStats.misses +
          " size=" +
          (historyDayModelCache && historyDayModelCache.models ? historyDayModelCache.models.size : 0)
      );
    }
  }

  function syncHistoryMonthChrome(container, month, year, now) {
    const monthLabel = container.querySelector(".history-month-label");
    if (monthLabel) monthLabel.textContent = HISTORY_MONTH_NAMES[month] + " " + year;
    const monthSelect = container.querySelector(".history-month-select");
    if (monthSelect) monthSelect.value = String(month);
    const yearSelect = container.querySelector(".history-year-select");
    if (yearSelect) {
      const wanted = String(year);
      if (![...yearSelect.options].some((o) => o.value === wanted)) {
        yearSelect.innerHTML = "";
        getHistoryYearOptions(now, year).forEach((y) => {
          const opt = document.createElement("option");
          opt.value = String(y);
          opt.textContent = String(y);
          yearSelect.appendChild(opt);
        });
      }
      yearSelect.value = wanted;
    }
  }

  function renderAttendanceHistory(container) {
    hideHistoryDweTooltip();
    const historyDayCacheStats = { hits: 0, misses: 0 };
    const now = getSimulatedNow();
    const { month, year } = resolveHistoryMonthYear(now);
    const todayStr = getDateStr();

    const existingShell = container.querySelector("[data-history-shell]");
    const existingWrap = container.querySelector(".history-calendar-scroll-wrap");
    if (existingShell && existingWrap) {
      syncHistoryMonthChrome(container, month, year, now);
      const grid = buildHistoryCalendarGrid(year, month, todayStr, historyDayCacheStats);
      const oldGrid = existingWrap.querySelector(".history-calendar-grid");
      if (oldGrid) oldGrid.replaceWith(grid);
      else existingWrap.appendChild(grid);
      mountHistoryCalendarGrid(grid, existingWrap, historyDayCacheStats);
      return;
    }

    container.innerHTML = "";

    const header = document.createElement("div");
    header.className = "history-header";
    header.setAttribute("data-history-shell", "1");
    const title = document.createElement("h3");
    title.className = "data-section-label";
    title.textContent = "Task history by day";
    header.appendChild(title);
    const controls = document.createElement("div");
    controls.className = "history-controls";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "btn btn-ghost";
    prevBtn.textContent = "‹ Prev";
    const monthWrap = document.createElement("div");
    monthWrap.className = "history-month-wrap";
    const monthLabel = document.createElement("button");
    monthLabel.type = "button";
    monthLabel.className = "history-month-label";
    monthLabel.textContent = HISTORY_MONTH_NAMES[month] + " " + year;
    monthLabel.setAttribute("aria-haspopup", "dialog");
    monthLabel.setAttribute("aria-expanded", "false");
    monthLabel.setAttribute("aria-label", "Choose month and year");
    monthLabel.title = "Click to choose month and year";
    const picker = document.createElement("div");
    picker.className = "history-month-year-picker";
    picker.hidden = true;
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Month and year");

    function closeHistoryMonthYearPicker() {
      picker.hidden = true;
      monthLabel.setAttribute("aria-expanded", "false");
      monthWrap.classList.remove("is-open");
      if (monthWrap._outsideClose) {
        document.removeEventListener("click", monthWrap._outsideClose);
        monthWrap._outsideClose = null;
      }
    }

    function openHistoryMonthYearPicker() {
      picker.hidden = false;
      monthLabel.setAttribute("aria-expanded", "true");
      monthWrap.classList.add("is-open");
      if (yearSelect) yearSelect.focus();
      if (monthWrap._outsideClose) document.removeEventListener("click", monthWrap._outsideClose);
      monthWrap._outsideClose = () => closeHistoryMonthYearPicker();
      setTimeout(() => document.addEventListener("click", monthWrap._outsideClose), 0);
    }

    prevBtn.addEventListener("click", () => {
      closeHistoryMonthYearPicker();
      const cur = resolveHistoryMonthYear(getSimulatedNow());
      if (cur.month === 0) {
        state.historyMonth = 11;
        state.historyYear = cur.year - 1;
      } else {
        state.historyMonth = cur.month - 1;
        state.historyYear = cur.year;
      }
      save();
      renderActiveTab();
    });

    const monthSelect = document.createElement("select");
    monthSelect.className = "history-month-select settings-select";
    monthSelect.setAttribute("aria-label", "Month");
    HISTORY_MONTH_NAMES.forEach((name, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = name;
      if (i === month) opt.selected = true;
      monthSelect.appendChild(opt);
    });
    const yearSelect = document.createElement("select");
    yearSelect.className = "history-year-select settings-select";
    yearSelect.setAttribute("aria-label", "Year");
    getHistoryYearOptions(now, year).forEach((y) => {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === year) opt.selected = true;
      yearSelect.appendChild(opt);
    });
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "btn btn-ghost btn-sm";
    applyBtn.textContent = "Go";
    function applyMonthYear() {
      const nextMonth = Number(monthSelect.value);
      const nextYear = Number(yearSelect.value);
      if (!Number.isFinite(nextMonth) || nextMonth < 0 || nextMonth > 11) return;
      if (!Number.isFinite(nextYear) || nextYear < 1970 || nextYear > 2100) return;
      state.historyMonth = nextMonth;
      state.historyYear = nextYear;
      closeHistoryMonthYearPicker();
      save();
      renderActiveTab();
    }
    applyBtn.addEventListener("click", applyMonthYear);
    monthSelect.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyMonthYear();
      }
    });
    yearSelect.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyMonthYear();
      }
    });
    picker.appendChild(monthSelect);
    picker.appendChild(yearSelect);
    picker.appendChild(applyBtn);
    monthLabel.addEventListener("click", (e) => {
      e.stopPropagation();
      if (picker.hidden) openHistoryMonthYearPicker();
      else closeHistoryMonthYearPicker();
    });
    picker.addEventListener("click", (e) => e.stopPropagation());
    monthWrap.appendChild(monthLabel);
    monthWrap.appendChild(picker);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn-ghost";
    nextBtn.textContent = "Next ›";
    nextBtn.addEventListener("click", () => {
      closeHistoryMonthYearPicker();
      const cur = resolveHistoryMonthYear(getSimulatedNow());
      if (cur.month === 11) {
        state.historyMonth = 0;
        state.historyYear = cur.year + 1;
      } else {
        state.historyMonth = cur.month + 1;
        state.historyYear = cur.year;
      }
      save();
      renderActiveTab();
    });
    controls.appendChild(prevBtn);
    controls.appendChild(monthWrap);
    controls.appendChild(nextBtn);
    header.appendChild(controls);
    const weeklyBtn = document.createElement("button");
    weeklyBtn.type = "button";
    weeklyBtn.className = "btn btn-ghost";
    weeklyBtn.textContent = "← Weekly";
    weeklyBtn.style.marginTop = "0.5rem";
    weeklyBtn.addEventListener("click", () => {
      state.attendanceView = "weekly";
      save();
      renderActiveTab();
    });
    const timestampsBtn = document.createElement("button");
    timestampsBtn.type = "button";
    timestampsBtn.className = "btn btn-ghost";
    timestampsBtn.textContent = "Time Trends";
    timestampsBtn.style.marginTop = "0.5rem";
    timestampsBtn.style.marginLeft = "0.5rem";
    timestampsBtn.addEventListener("click", () => {
      state.attendanceView = "timestamps";
      save();
      renderActiveTab();
    });
    header.appendChild(weeklyBtn);
    header.appendChild(timestampsBtn);
    container.appendChild(header);

    const gridWrap = document.createElement("div");
    gridWrap.className = "history-calendar-scroll-wrap";
    const grid = buildHistoryCalendarGrid(year, month, todayStr, historyDayCacheStats);
    gridWrap.appendChild(grid);
    container.appendChild(gridWrap);

    const legend = document.createElement("p");
    legend.className = "history-calendar-legend";
    legend.textContent = "Solid bars = finished that day. Muted bars = still marked complete from an earlier day in the same weekly/endgame cycle (fill-remaining).";
    container.appendChild(legend);

    mountHistoryCalendarGrid(grid, gridWrap, historyDayCacheStats);
  }

  let lastAttendanceViewKey = "";

  function getAttendanceViewKey() {
    return [
      state.dataVersion || 0,
      state.attendanceView,
      state.historyMonth,
      state.historyYear,
      state.dateFormat,
      state.firstDayOfWeek,
      JSON.stringify(state.attendancePieInclude || {}),
      JSON.stringify(state.timestampsSelectedGameIds || {}),
      JSON.stringify(state.timestampsSelectedEndgameTasks || {}),
      state.timestampsEndgamePickerGameId || "",
      getAllGames().map((g) => g.id).join(","),
    ].join("|");
  }

  function renderAttendance() {
    const container = document.getElementById("attendanceContainer");
    if (!container) return;
    const viewKey = getAttendanceViewKey();
    if (viewKey === lastAttendanceViewKey && container.childElementCount > 0) return;
    lastAttendanceViewKey = viewKey;
    hideHistoryDweTooltip();
    const games = getAllGames();
    if (games.length === 0) {
      container.innerHTML = '<p class="empty-state">No games yet. Add one in the Games tab.</p>';
      return;
    }
    if (state.attendanceView === "history") {
      // Keep History chrome when shell already exists; renderAttendanceHistory swaps the grid only.
      if (!container.querySelector("[data-history-shell]")) container.innerHTML = "";
      const run = () => renderAttendanceHistory(container);
      if (typeof isPerfDebugEnabled === "function" && isPerfDebugEnabled() && typeof perfMeasure === "function") {
        const m = (Number(state.historyMonth) || 0) + 1;
        const y = Number(state.historyYear) || 0;
        perfMeasure("historyRender:" + y + "-" + String(m).padStart(2, "0"), run);
      } else {
        run();
      }
      return;
    }
    container.innerHTML = "";
    if (state.attendanceView === "timestamps") {
      renderAttendanceTimestamps(container);
      return;
    }
    let dTotal = 0, dDone = 0, wTotal = 0, wDone = 0, eTotal = 0, eDone = 0;
    const rows = games.map((game) => {
      const dAttempted = game.dailies ? getAttemptedAmount(state.dailiesAttempted, game.id) : 0;
      const dCompleted = game.dailies ? getCompletedAmount(state.dailiesCompleted, game.id) : 0;
      const weeklies = game.weeklies || [];
      let wAttempted = 0, wCompleted = 0;
      weeklies.forEach((t) => {
        const key = game.id + "." + (t.id || t.label);
        wAttempted += getAttemptedAmount(state.weekliesAttempted, key);
        wCompleted += getCompletedAmount(state.weekliesCompleted, key);
      });
      const endgame = game.endgame || [];
      let eAttempted = 0, eCompleted = 0;
      endgame.forEach((t) => {
        const key = game.id + "." + (t.id || t.label);
        eAttempted += getAttemptedAmount(state.endgameAttempted, key);
        eCompleted += getCompletedAmount(state.endgameCompleted, key);
      });
      const includeInPie = state.attendancePieInclude[game.id] !== false;
      if (includeInPie) {
        dTotal += dAttempted;
        dDone += dCompleted;
        wTotal += wAttempted;
        wDone += wCompleted;
        eTotal += eAttempted;
        eDone += eCompleted;
      }
      return {
        gameId: game.id,
        name: game.name,
        dCompleted, dAttempted,
        wCompleted, wAttempted,
        eCompleted, eAttempted,
        includeInPie,
      };
    });
    const table = document.createElement("div");
    table.className = "attendance-table-wrap";
    const tableEl = document.createElement("table");
    tableEl.className = "attendance-table";
    const thead = tableEl.createTHead();
    const headerRow = thead.insertRow();
    headerRow.innerHTML = "<th>Game</th><th class=\"attendance-toggle-col\">Include</th><th>Dailies</th><th>Weeklies</th><th>Endgame</th>";
    const tbody = tableEl.createTBody();
    rows.forEach((r) => {
      const tr = tbody.insertRow();
      const nameTd = tr.insertCell();
      nameTd.innerHTML = escapeHtml(r.name);
      const toggleTd = tr.insertCell();
      toggleTd.className = "attendance-toggle-cell";
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.className = "attendance-pie-toggle";
      toggle.checked = r.includeInPie;
      toggle.title = "This toggle is for affecting pie charts below.";
      toggle.setAttribute("aria-label", "Include " + (r.name || "game") + " in pie charts");
      toggle.addEventListener("change", () => {
        state.attendancePieInclude[r.gameId] = toggle.checked;
        save();
        renderActiveTab();
      });
      toggleTd.appendChild(toggle);
      const dTd = tr.insertCell();
      dTd.textContent = r.dAttempted > 0 ? r.dCompleted + "/" + r.dAttempted : "—";
      const wTd = tr.insertCell();
      wTd.textContent = r.wAttempted > 0 ? r.wCompleted + "/" + r.wAttempted : "—";
      const eTd = tr.insertCell();
      eTd.textContent = r.eAttempted > 0 ? r.eCompleted + "/" + r.eAttempted : "—";
    });
    const totalRow = tbody.insertRow();
    totalRow.className = "attendance-total-row";
    const totalNameTd = totalRow.insertCell();
    totalNameTd.textContent = "Total";
    const totalToggleTd = totalRow.insertCell();
    totalToggleTd.className = "attendance-toggle-cell";
    totalToggleTd.innerHTML = "";
    const totalDTd = totalRow.insertCell();
    totalDTd.textContent = dDone + "/" + dTotal;
    const totalWTd = totalRow.insertCell();
    totalWTd.textContent = wDone + "/" + wTotal;
    const totalETd = totalRow.insertCell();
    totalETd.textContent = eDone + "/" + eTotal;
    table.appendChild(tableEl);
    container.appendChild(table);
    const pieRow = document.createElement("div");
    pieRow.className = "pie-row";
    const pctD = dTotal ? Math.round((dDone / dTotal) * 100) : 0;
    const pctW = wTotal ? Math.round((wDone / wTotal) * 100) : 0;
    const pctE = eTotal ? Math.round((eDone / eTotal) * 100) : 0;
    [
      { type: "dailies", title: "Dailies", done: dDone, total: dTotal, pct: pctD },
      { type: "weeklies", title: "Weeklies", done: wDone, total: wTotal, pct: pctW },
      { type: "endgame", title: "Endgame", done: eDone, total: eTotal, pct: pctE },
    ].forEach((pie) => {
      pieRow.appendChild(createAttendanceCategoryPieBox(pie.type, pie.title, pie.done, pie.total, pie.pct));
    });
    container.appendChild(pieRow);

    const calendarSection = document.createElement("div");
    calendarSection.className = "attendance-calendar-section";
    const calHeader = document.createElement("div");
    calHeader.className = "attendance-calendar-header";
    const calTitle = document.createElement("h4");
    calTitle.className = "data-section-label";
    calTitle.textContent = "Weekly calendar";
    calHeader.appendChild(calTitle);
    const historyBtn = document.createElement("button");
    historyBtn.type = "button";
    historyBtn.className = "btn btn-ghost";
    historyBtn.textContent = "History";
    historyBtn.addEventListener("click", () => {
      state.attendanceView = "history";
      const now = getSimulatedNow();
      if (state.historyMonth == null) state.historyMonth = now.getMonth();
      if (state.historyYear == null) state.historyYear = now.getFullYear();
      save();
      renderActiveTab();
    });
    const timestampsBtn = document.createElement("button");
    timestampsBtn.type = "button";
    timestampsBtn.className = "btn btn-ghost";
    timestampsBtn.textContent = "Time Trends";
    timestampsBtn.addEventListener("click", () => {
      state.attendanceView = "timestamps";
      save();
      renderActiveTab();
    });
    calHeader.appendChild(historyBtn);
    calHeader.appendChild(timestampsBtn);
    calendarSection.appendChild(calHeader);
    const calGrid = document.createElement("div");
    calGrid.className = "attendance-calendar-grid";
    const weekDates = getWeekDates();
    const todayStr = getDateStr();
    weekDates.forEach((d) => {
      const dateStr = getDateStr(d);
      const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
      const available = getTasksAvailableOnDate(dateStr);
      const wDone = (available.weeklies || []).filter((item) => (dayData.weeklies || []).includes(item.key)).length;
      const eDone = (available.endgame || []).filter((item) => (dayData.endgame || []).includes(item.key)).length;
      const completedCount = (dayData.dailies || []).length + wDone + eDone;
      const isFuture = dateStr > todayStr;
      const dayEl = document.createElement("div");
      dayEl.className = "attendance-calendar-day" + (dateStr === todayStr ? " today" : "") + (isFuture ? " future" : "");
      const dayHeader = document.createElement("div");
      dayHeader.className = "attendance-calendar-day-header";
      dayHeader.textContent = DAY_NAMES[d.getDay()] + " " + dateStr.slice(5);
      dayEl.appendChild(dayHeader);
      const summary = document.createElement("div");
      summary.className = "attendance-calendar-summary";
      summary.textContent = available.dailies.length + available.weeklies.length + available.endgame.length === 0
        ? "—"
        : completedCount + " completed";
      dayEl.appendChild(summary);
      if (completedCount > 0) {
        const tooltip = document.createElement("div");
        tooltip.className = "attendance-calendar-tooltip";
        const frag = document.createDocumentFragment();
        const addPart = (text, type) => {
          const span = document.createElement("span");
          span.className = "attendance-tooltip-item attendance-tooltip-" + type;
          span.textContent = text;
          if (frag.childNodes.length > 0) frag.appendChild(document.createElement("br"));
          frag.appendChild(span);
        };
        dayData.dailies.forEach((gameId) => {
          const game = getGame(gameId);
          addPart(game ? game.name : gameId, "dailies");
        });
        (available.weeklies || []).filter((item) => (dayData.weeklies || []).includes(item.key)).forEach((item) => {
          const dot = item.key.indexOf(".");
          const gId = dot >= 0 ? item.key.slice(0, dot) : item.key;
          const tId = dot >= 0 ? item.key.slice(dot + 1) : "";
          const game = getGame(gId);
          const task = (game?.weeklies || []).find((t) => (t.id || t.label) === tId);
          addPart(task ? task.label : tId, "weeklies");
        });
        (available.endgame || []).filter((item) => (dayData.endgame || []).includes(item.key)).forEach((item) => {
          const dot = item.key.indexOf(".");
          const gId = dot >= 0 ? item.key.slice(0, dot) : item.key;
          const tId = dot >= 0 ? item.key.slice(dot + 1) : "";
          const game = getGame(gId);
          const task = (game?.endgame || []).find((t) => (t.id || t.label) === tId);
          addPart(task ? task.label : tId, "endgame");
        });
        tooltip.appendChild(frag);
        dayEl.appendChild(tooltip);
      }
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-ghost btn-sm attendance-calendar-edit";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openCalendarDayModal(dateStr));
      dayEl.appendChild(editBtn);
      calGrid.appendChild(dayEl);
    });
    calendarSection.appendChild(calGrid);
    container.appendChild(calendarSection);
  }

  const TIMESTAMPS_NONE = "_none";

  function renderAttendanceTimestamps(container) {
    const games = getAllGames();
    const selected = state.timestampsSelectedGameIds || {};
    const showNone = !!selected[TIMESTAMPS_NONE];
    const gameIds = Object.keys(selected).filter((k) => k !== TIMESTAMPS_NONE);
    const showAll = !showNone && gameIds.length === 0;
    const timestamps = showNone ? [] : (state.completionTimestamps || []).filter((t) => showAll || selected[t.gameId]);

    const header = document.createElement("div");
    header.className = "history-header";
    const title = document.createElement("h3");
    title.className = "data-section-label";
    title.textContent = "Completion time trends";
    header.appendChild(title);
    const syncTrendsBtn = document.createElement("button");
    syncTrendsBtn.type = "button";
    syncTrendsBtn.className = "btn btn-ghost";
    syncTrendsBtn.textContent = "Sync with Calendar";
    syncTrendsBtn.title =
      "Fill missing Time Trends stamps from the calendar using your usual hours. Existing stamps stay unchanged.";
    syncTrendsBtn.style.marginLeft = "0.5rem";
    syncTrendsBtn.addEventListener("click", () => openClearTimeTrendsModal());
    header.appendChild(syncTrendsBtn);
    const weeklyBtn = document.createElement("button");
    weeklyBtn.type = "button";
    weeklyBtn.className = "btn btn-ghost";
    weeklyBtn.textContent = "← Weekly";
    weeklyBtn.style.marginLeft = "0.5rem";
    weeklyBtn.addEventListener("click", () => {
      state.attendanceView = "weekly";
      save();
      renderActiveTab();
    });
    header.appendChild(weeklyBtn);
    container.appendChild(header);

    const trendsNote = document.createElement("p");
    trendsNote.className = "timestamps-trends-note";
    trendsNote.textContent =
      "Charts use the day and hour you finished each weekly/endgame cycle (from completion timestamps). Days marked complete only by fill-remaining are not counted again.";
    container.appendChild(trendsNote);

    const gameLabelRow = document.createElement("div");
    gameLabelRow.style.display = "flex";
    gameLabelRow.style.alignItems = "center";
    gameLabelRow.style.gap = "0.5rem";
    gameLabelRow.style.marginTop = "1rem";
    const gameLabel = document.createElement("h4");
    gameLabel.className = "data-section-label";
    gameLabel.textContent = "Show games";
    gameLabel.style.margin = "0";
    gameLabelRow.appendChild(gameLabel);
    const selectAllBtn = document.createElement("button");
    selectAllBtn.type = "button";
    selectAllBtn.className = "btn btn-ghost";
    selectAllBtn.textContent = "Select all";
    selectAllBtn.title = "Select all games and tasks";
    selectAllBtn.addEventListener("click", () => {
      state.timestampsSelectedGameIds = {};
      state.timestampsSelectedEndgameTasks = {};
      save();
      renderActiveTab();
    });
    gameLabelRow.appendChild(selectAllBtn);
    const unselectAllBtn = document.createElement("button");
    unselectAllBtn.type = "button";
    unselectAllBtn.className = "btn btn-ghost";
    unselectAllBtn.textContent = "Unselect all";
    unselectAllBtn.title = "Deselect all games and tasks (show none)";
    unselectAllBtn.addEventListener("click", () => {
      state.timestampsSelectedGameIds = { [TIMESTAMPS_NONE]: true };
      state.timestampsSelectedEndgameTasks = { [TIMESTAMPS_NONE]: true };
      save();
      renderActiveTab();
    });
    gameLabelRow.appendChild(unselectAllBtn);
    container.appendChild(gameLabelRow);
    const gameWrap = document.createElement("div");
    gameWrap.className = "timestamps-game-selector";
    gameWrap.style.display = "flex";
    gameWrap.style.flexWrap = "wrap";
    gameWrap.style.gap = "0.5rem";
    gameWrap.style.marginBottom = "1rem";
    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timestamps-game-pill";
      btn.textContent = game.name;
      btn.setAttribute("aria-pressed", (showAll || selected[game.id]) ? "true" : "false");
      const isSelected = showAll || selected[game.id];
      if (isSelected) btn.classList.add("filled");
      btn.addEventListener("click", () => {
        delete state.timestampsSelectedGameIds[TIMESTAMPS_NONE];
        if (showAll || selected[game.id]) {
          if (showAll) {
            const others = games.filter((g) => g.id !== game.id).map((g) => g.id);
            state.timestampsSelectedGameIds = {};
            others.forEach((id) => { state.timestampsSelectedGameIds[id] = true; });
          } else {
            delete state.timestampsSelectedGameIds[game.id];
          }
          if (Object.keys(state.timestampsSelectedGameIds).filter((k) => k !== TIMESTAMPS_NONE).length === 0) state.timestampsSelectedGameIds = { [TIMESTAMPS_NONE]: true };
        } else {
          state.timestampsSelectedGameIds[game.id] = true;
          if (Object.keys(state.timestampsSelectedGameIds).filter((k) => k !== TIMESTAMPS_NONE).length === games.length) state.timestampsSelectedGameIds = {};
        }
        save();
        renderActiveTab();
      });
      gameWrap.appendChild(btn);
    });
    container.appendChild(gameWrap);

    const trendTimestamps =
      typeof getTimestampsForTimeTrends === "function" ? getTimestampsForTimeTrends(timestamps) : timestamps;
    const hourCountsByType = { dailies: Array(24).fill(0), weeklies: Array(24).fill(0), endgame: Array(24).fill(0) };
    const hourDetails = Array(24).fill(null).map(() => []);
    trendTimestamps.forEach((t) => {
      const h = Number(t.hour);
      if (h >= 0 && h <= 23 && hourCountsByType[t.taskType]) {
        hourCountsByType[t.taskType][h]++;
        const game = getGame(t.gameId);
        hourDetails[h].push({ gameName: game ? game.name : t.gameId, taskType: t.taskType, taskLabel: t.taskLabel, dateStr: t.dateStr });
      }
    });
    const hourTotals = Array(24).fill(0).map((_, h) =>
      hourCountsByType.dailies[h] + hourCountsByType.weeklies[h] + hourCountsByType.endgame[h]
    );
    const maxCount = Math.max(1, ...hourTotals);

    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
    trendTimestamps.forEach((t) => {
      if (!t.dateStr) return;
      const d = new Date(t.dateStr + "T12:00:00");
      const day = d.getDay();
      if (day >= 0 && day <= 6) dayOfWeekCounts[day]++;
    });
    const peakHour = hourTotals.reduce((best, n, h) => (n > hourTotals[best] ? h : best), 0);
    const peakDay = dayOfWeekCounts.reduce((best, n, d) => (n > dayOfWeekCounts[best] ? d : best), 0);
    const dayFullNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const trendsSummary = document.createElement("p");
    trendsSummary.className = "timestamps-a11y-summary";
    trendsSummary.setAttribute("role", "status");
    if (hourTotals[peakHour] <= 0) {
      trendsSummary.textContent = "No completion timestamps in the current selection.";
    } else {
      trendsSummary.textContent =
        "Most completions by hour: " +
        peakHour +
        ":00 (" +
        hourTotals[peakHour] +
        "). Busiest weekday: " +
        dayFullNames[peakDay] +
        " (" +
        dayOfWeekCounts[peakDay] +
        ").";
    }
    container.appendChild(trendsSummary);

    const barLabel = document.createElement("h4");
    barLabel.className = "data-section-label";
    barLabel.textContent = "Completions by hour (rounded)";
    barLabel.style.marginTop = "1.5rem";
    container.appendChild(barLabel);
    const hourLegend = document.createElement("div");
    hourLegend.className = "timestamps-hour-legend";
    hourLegend.style.display = "flex";
    hourLegend.style.gap = "1rem";
    hourLegend.style.marginBottom = "0.5rem";
    hourLegend.style.fontSize = "0.8rem";
    ["dailies", "weeklies", "endgame"].forEach((type) => {
      const item = document.createElement("span");
      item.style.display = "inline-flex";
      item.style.alignItems = "center";
      item.style.gap = "0.35rem";
      const dot = document.createElement("span");
      dot.style.width = "10px";
      dot.style.height = "10px";
      dot.style.borderRadius = "2px";
      dot.style.background = "var(--pie-" + type + ")";
      item.appendChild(dot);
      item.appendChild(document.createTextNode(type.charAt(0).toUpperCase() + type.slice(1)));
      hourLegend.appendChild(item);
    });
    container.appendChild(hourLegend);
    const barWrap = document.createElement("div");
    barWrap.className = "timestamps-bar-graph";
    barWrap.style.display = "grid";
    barWrap.style.gridTemplateColumns = "repeat(24, 1fr)";
    barWrap.style.gap = "2px";
    barWrap.style.marginBottom = "1.5rem";
    barWrap.style.minHeight = "120px";
    barWrap.style.alignItems = "end";
    for (let h = 0; h < 24; h++) {
      const col = document.createElement("div");
      col.className = "timestamps-bar-col timestamps-hour-stacked";
      col.style.display = "flex";
      col.style.flexDirection = "column";
      col.style.alignItems = "stretch";
      col.style.justifyContent = "flex-end";
      col.style.gap = "0";
      const stack = document.createElement("div");
      stack.className = "timestamps-hour-stack";
      stack.style.display = "flex";
      stack.style.flexDirection = "column-reverse";
      stack.style.flex = "1";
      stack.style.minHeight = "60px";
      ["dailies", "weeklies", "endgame"].forEach((type) => {
        const count = hourCountsByType[type][h];
        if (count > 0) {
          const seg = document.createElement("div");
          seg.className = "timestamps-bar-segment";
          seg.style.height = (count / maxCount) * 100 + "px";
          seg.style.minHeight = "2px";
          seg.style.background = "var(--pie-" + type + ")";
          seg.style.borderRadius = "1px";
          seg.title = type + ": " + count;
          stack.appendChild(seg);
        }
      });
      col.appendChild(stack);
      const lbl = document.createElement("span");
      lbl.className = "timestamps-bar-label";
      lbl.style.fontSize = "0.7rem";
      lbl.style.color = "var(--text-muted)";
      lbl.textContent = h;
      col.appendChild(lbl);
      const total = hourCountsByType.dailies[h] + hourCountsByType.weeklies[h] + hourCountsByType.endgame[h];
      col.title = h + ":00 – Dailies: " + hourCountsByType.dailies[h] + ", Weeklies: " + hourCountsByType.weeklies[h] + ", Endgame: " + hourCountsByType.endgame[h] + " — Total: " + total;
      col.style.cursor = "pointer";
      col.addEventListener("click", () => {
        openTimeTrendsDetailModal(h + ":00 completions", hourDetails[h] || []);
      });
      barWrap.appendChild(col);
      const tooltip = document.createElement("div");
      tooltip.className = "timestamps-hour-tooltip";
      tooltip.textContent = h + ":00 – Dailies: " + hourCountsByType.dailies[h] + ", Weeklies: " + hourCountsByType.weeklies[h] + ", Endgame: " + hourCountsByType.endgame[h] + " — Total: " + total;
      col.appendChild(tooltip);
    }
    container.appendChild(barWrap);

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    function appendDayOfWeekChart(taskType, titleText) {
      const typed = trendTimestamps.filter((t) => t.taskType === taskType);
      const dayCounts = [0, 0, 0, 0, 0, 0, 0];
      const dayDetails = [[], [], [], [], [], [], []];
      typed.forEach((t) => {
        if (!t.dateStr) return;
        const d = new Date(t.dateStr + "T12:00:00");
        const day = d.getDay();
        if (day < 0 || day > 6) return;
        dayCounts[day]++;
        const game = getGame(t.gameId);
        dayDetails[day].push({
          gameName: game ? game.name : t.gameId,
          taskType: t.taskType,
          taskLabel: t.taskLabel,
          dateStr: t.dateStr,
        });
      });

      const sectionLabel = document.createElement("h4");
      sectionLabel.className = "data-section-label";
      sectionLabel.textContent = titleText;
      sectionLabel.style.marginTop = "1.5rem";
      container.appendChild(sectionLabel);

      const maxDayCount = Math.max(1, ...dayCounts);
      const dowWrap = document.createElement("div");
      dowWrap.className = "timestamps-bar-graph timestamps-dow-bar-graph timestamps-" + taskType + "-dow-bar-graph";
      if (taskType === "weeklies") dowWrap.classList.add("timestamps-weeklies-bar-graph");
      dowWrap.style.gridTemplateColumns = "repeat(7, 1fr)";
      dowWrap.style.minHeight = "120px";
      dowWrap.style.alignItems = "end";
      for (let i = 0; i < 7; i++) {
        const col = document.createElement("div");
        col.className = "timestamps-bar-col";
        col.style.display = "flex";
        col.style.flexDirection = "column";
        col.style.justifyContent = "flex-end";
        col.style.alignItems = "center";
        col.style.gap = "2px";
        const spacer = document.createElement("div");
        spacer.style.flex = "1";
        spacer.style.minHeight = "0";
        col.appendChild(spacer);
        const bar = document.createElement("div");
        bar.className = "timestamps-bar";
        bar.style.height = maxDayCount > 0 ? (dayCounts[i] / maxDayCount) * 100 + "px" : "4px";
        bar.style.background = "var(--pie-" + taskType + ")";
        col.appendChild(bar);
        const lbl = document.createElement("span");
        lbl.className = "timestamps-bar-label";
        lbl.textContent = dayNames[i];
        col.appendChild(lbl);
        const countLbl = document.createElement("span");
        countLbl.className = "timestamps-bar-count";
        countLbl.textContent = String(dayCounts[i]);
        countLbl.style.fontSize = "0.75rem";
        countLbl.style.fontWeight = "600";
        countLbl.style.color = "var(--text)";
        col.appendChild(countLbl);
        col.title = dayNames[i] + " – " + dayCounts[i] + " " + taskType + " completion(s)";
        col.style.cursor = "pointer";
        col.addEventListener("click", () => {
          openTimeTrendsDetailModal(dayNames[i] + " " + taskType, dayDetails[i] || []);
        });
        dowWrap.appendChild(col);
      }
      container.appendChild(dowWrap);
    }

    appendDayOfWeekChart("dailies", "Dailies completed by day of week");
    appendDayOfWeekChart("weeklies", "Weeklies completed by day of week");
    appendDayOfWeekChart("endgame", "Endgame completed by day of week");

    const endgameOnly = timestamps.filter((t) => t.taskType === "endgame");
    const allEndgameTasks = [];
    games.forEach((game) => {
      if (!showAll && !selected[game.id]) return;
      (game.endgame || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        allEndgameTasks.push({ key, gameId: game.id, taskId: task.id || task.label, gameName: game.name, taskLabel: task.label || task.id });
      });
    });

    const endgameTaskSelected = state.timestampsSelectedEndgameTasks || {};
    const showNoneEndgame = !!endgameTaskSelected[TIMESTAMPS_NONE];
    const endgameTaskIds = Object.keys(endgameTaskSelected).filter((k) => k !== TIMESTAMPS_NONE);
    const showAllEndgameTasks = !showNoneEndgame && endgameTaskIds.length === 0;
    const allEndgameKeys = allEndgameTasks.map((et) => et.key);

    function isEndgameTaskSelected(key) {
      return showAllEndgameTasks || !!endgameTaskSelected[key];
    }

    function setEndgameTaskSelected(key, wantOn) {
      delete state.timestampsSelectedEndgameTasks[TIMESTAMPS_NONE];
      const currentlyOn = isEndgameTaskSelected(key);
      if (wantOn === currentlyOn) return;
      if (currentlyOn) {
        if (showAllEndgameTasks) {
          const others = allEndgameKeys.filter((k) => k !== key);
          state.timestampsSelectedEndgameTasks = {};
          others.forEach((k) => { state.timestampsSelectedEndgameTasks[k] = true; });
        } else {
          delete state.timestampsSelectedEndgameTasks[key];
        }
        if (Object.keys(state.timestampsSelectedEndgameTasks).filter((k) => k !== TIMESTAMPS_NONE).length === 0) {
          state.timestampsSelectedEndgameTasks = { [TIMESTAMPS_NONE]: true };
        }
      } else {
        state.timestampsSelectedEndgameTasks[key] = true;
        if (Object.keys(state.timestampsSelectedEndgameTasks).filter((k) => k !== TIMESTAMPS_NONE).length === allEndgameKeys.length) {
          state.timestampsSelectedEndgameTasks = {};
        }
      }
    }

    function setEndgameTasksForGame(gameId, wantOn) {
      const gameKeys = allEndgameTasks.filter((et) => et.gameId === gameId).map((et) => et.key);
      if (gameKeys.length === 0) return;
      if (wantOn) {
        if (showNoneEndgame) state.timestampsSelectedEndgameTasks = {};
        delete state.timestampsSelectedEndgameTasks[TIMESTAMPS_NONE];
        if (showAllEndgameTasks) return;
        gameKeys.forEach((k) => { state.timestampsSelectedEndgameTasks[k] = true; });
        if (Object.keys(state.timestampsSelectedEndgameTasks).filter((k) => k !== TIMESTAMPS_NONE).length === allEndgameKeys.length) {
          state.timestampsSelectedEndgameTasks = {};
        }
      } else {
        delete state.timestampsSelectedEndgameTasks[TIMESTAMPS_NONE];
        if (showAllEndgameTasks) {
          state.timestampsSelectedEndgameTasks = {};
          allEndgameKeys.filter((k) => !gameKeys.includes(k)).forEach((k) => {
            state.timestampsSelectedEndgameTasks[k] = true;
          });
        } else {
          gameKeys.forEach((k) => { delete state.timestampsSelectedEndgameTasks[k]; });
        }
        if (Object.keys(state.timestampsSelectedEndgameTasks).filter((k) => k !== TIMESTAMPS_NONE).length === 0) {
          state.timestampsSelectedEndgameTasks = { [TIMESTAMPS_NONE]: true };
        }
      }
    }

    const gamesWithEndgame = [];
    const seenGameIds = {};
    allEndgameTasks.forEach((et) => {
      if (seenGameIds[et.gameId]) return;
      seenGameIds[et.gameId] = true;
      gamesWithEndgame.push({ id: et.gameId, name: et.gameName });
    });

    let pickerGameId = state.timestampsEndgamePickerGameId;
    if (!pickerGameId || !seenGameIds[pickerGameId]) {
      pickerGameId = gamesWithEndgame[0] ? gamesWithEndgame[0].id : null;
      state.timestampsEndgamePickerGameId = pickerGameId;
    }
    const tasksForPickerGame = allEndgameTasks.filter((et) => et.gameId === pickerGameId);
    const selectedVisibleCount = allEndgameTasks.filter((et) => isEndgameTaskSelected(et.key)).length;

    const endgameTaskLabelRow = document.createElement("div");
    endgameTaskLabelRow.className = "timestamps-endgame-picker-header";
    const endgameTaskLabel = document.createElement("h4");
    endgameTaskLabel.className = "data-section-label";
    endgameTaskLabel.textContent = "Endgame tasks";
    endgameTaskLabel.style.margin = "0";
    endgameTaskLabelRow.appendChild(endgameTaskLabel);
    const selectAllEndgameBtn = document.createElement("button");
    selectAllEndgameBtn.type = "button";
    selectAllEndgameBtn.className = "btn btn-ghost";
    selectAllEndgameBtn.textContent = "Select all";
    selectAllEndgameBtn.title = "Select all endgame tasks";
    selectAllEndgameBtn.addEventListener("click", () => {
      state.timestampsSelectedEndgameTasks = {};
      save();
      renderActiveTab();
    });
    endgameTaskLabelRow.appendChild(selectAllEndgameBtn);
    const unselectAllEndgameBtn = document.createElement("button");
    unselectAllEndgameBtn.type = "button";
    unselectAllEndgameBtn.className = "btn btn-ghost";
    unselectAllEndgameBtn.textContent = "Unselect all";
    unselectAllEndgameBtn.title = "Deselect all endgame tasks (show none)";
    unselectAllEndgameBtn.addEventListener("click", () => {
      state.timestampsSelectedEndgameTasks = { [TIMESTAMPS_NONE]: true };
      save();
      renderActiveTab();
    });
    endgameTaskLabelRow.appendChild(unselectAllEndgameBtn);
    container.appendChild(endgameTaskLabelRow);

    const endgamePicker = document.createElement("div");
    endgamePicker.className = "timestamps-endgame-picker";

    if (gamesWithEndgame.length === 0) {
      const empty = document.createElement("p");
      empty.className = "timestamps-endgame-picker-empty";
      empty.textContent = "No endgame tasks in the current game selection.";
      endgamePicker.appendChild(empty);
    } else {
      const pickerControls = document.createElement("div");
      pickerControls.className = "timestamps-endgame-picker-controls";

      const gameField = document.createElement("label");
      gameField.className = "timestamps-endgame-picker-field";
      const gameFieldLabel = document.createElement("span");
      gameFieldLabel.textContent = "Game";
      gameField.appendChild(gameFieldLabel);
      const gameSelect = document.createElement("select");
      gameSelect.className = "timestamps-endgame-game-select";
      gameSelect.setAttribute("aria-label", "Endgame tasks game");
      gamesWithEndgame.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.name;
        if (g.id === pickerGameId) opt.selected = true;
        gameSelect.appendChild(opt);
      });
      gameSelect.addEventListener("change", () => {
        state.timestampsEndgamePickerGameId = gameSelect.value || null;
        save();
        renderActiveTab();
      });
      gameField.appendChild(gameSelect);
      pickerControls.appendChild(gameField);

      const gameActionRow = document.createElement("div");
      gameActionRow.className = "timestamps-endgame-picker-actions";
      const selectGameBtn = document.createElement("button");
      selectGameBtn.type = "button";
      selectGameBtn.className = "btn btn-ghost btn-sm";
      selectGameBtn.textContent = "Select all in game";
      selectGameBtn.addEventListener("click", () => {
        setEndgameTasksForGame(pickerGameId, true);
        save();
        renderActiveTab();
      });
      gameActionRow.appendChild(selectGameBtn);
      const clearGameBtn = document.createElement("button");
      clearGameBtn.type = "button";
      clearGameBtn.className = "btn btn-ghost btn-sm";
      clearGameBtn.textContent = "Clear game";
      clearGameBtn.addEventListener("click", () => {
        setEndgameTasksForGame(pickerGameId, false);
        save();
        renderActiveTab();
      });
      gameActionRow.appendChild(clearGameBtn);
      pickerControls.appendChild(gameActionRow);
      endgamePicker.appendChild(pickerControls);

      const summary = document.createElement("p");
      summary.className = "timestamps-endgame-picker-summary";
      summary.textContent =
        selectedVisibleCount +
        " of " +
        allEndgameTasks.length +
        " endgame task" +
        (allEndgameTasks.length === 1 ? "" : "s") +
        " shown";
      endgamePicker.appendChild(summary);

      const taskList = document.createElement("div");
      taskList.className = "timestamps-endgame-task-list";
      taskList.setAttribute("role", "group");
      taskList.setAttribute("aria-label", "Endgame tasks for selected game");

      if (tasksForPickerGame.length === 0) {
        const emptyTasks = document.createElement("p");
        emptyTasks.className = "timestamps-endgame-picker-empty";
        emptyTasks.textContent = "No endgame tasks for this game.";
        taskList.appendChild(emptyTasks);
      } else {
        tasksForPickerGame.forEach(({ key, taskLabel }) => {
          const row = document.createElement("label");
          row.className = "timestamps-endgame-task-row";
          const check = document.createElement("input");
          check.type = "checkbox";
          check.checked = isEndgameTaskSelected(key);
          check.addEventListener("change", () => {
            setEndgameTaskSelected(key, check.checked);
            save();
            renderActiveTab();
          });
          const name = document.createElement("span");
          name.className = "timestamps-endgame-task-name";
          name.textContent = taskLabel;
          row.appendChild(check);
          row.appendChild(name);
          taskList.appendChild(row);
        });
      }
      endgamePicker.appendChild(taskList);
    }

    container.appendChild(endgamePicker);

    const taskPoints = {};
    allEndgameTasks.forEach(({ key, gameId, taskId, gameName, taskLabel }) => {
      if (!showAllEndgameTasks && !endgameTaskSelected[key]) return;
      const events = getEndgameCompletionEventsForTrend(key);
      if (events.length === 0) return;
      const game = getGame(gameId);
      const task = (game?.endgame || []).find((et) => (et.id || et.label) === taskId);
      if (!game || !task) return;
      const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
      const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
      const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
      const byCycle = {};
      events.forEach((t) => {
        let cycleStartMs, cycleEndMs, cycleStartStr;
        if (t.cycleStartStr && t.cycleEndStr) {
          const startMom = getResetMomentForDateStr(task, game, t.cycleStartStr);
          const endMom = getResetMomentForDateStr(task, game, t.cycleEndStr);
          if (!startMom || !endMom || endMom.getTime() <= startMom.getTime()) return;
          cycleStartMs = startMom.getTime();
          cycleEndMs = endMom.getTime();
          cycleStartStr = t.cycleStartStr;
        } else {
          const cycleStart = getCycleStartForDate(task, t.dateStr, game);
          cycleStartMs = cycleStart.getTime();
          cycleEndMs = cycleStartMs + timeLimitMs;
          cycleStartStr = getDateStr(cycleStart);
        }
        let pct;
        let daysAfter = 0;
        let hoursAfter = 0;
        if (t.skipped) {
          pct = 0;
          daysAfter = null;
          hoursAfter = null;
        } else {
          const completionMs = new Date(t.dateStr + "T" + String(t.hour).padStart(2, "0") + ":00:00").getTime();
          const cycleLen = cycleEndMs - cycleStartMs;
          if (cycleLen <= 0) return;
          pct = ((cycleEndMs - completionMs) / cycleLen) * 100;
          pct = Math.max(0, Math.min(100, pct));
          const elapsedMs = Math.max(0, completionMs - cycleStartMs);
          const totalHours = Math.floor(elapsedMs / (60 * 60 * 1000));
          daysAfter = Math.floor(totalHours / 24);
          hoursAfter = totalHours % 24;
        }
        if (byCycle[cycleStartMs] == null || pct > byCycle[cycleStartMs].pct) {
          byCycle[cycleStartMs] = { pct, daysAfter, hoursAfter, skipped: !!t.skipped };
        }
      });
      const sortedCycles = Object.keys(byCycle).map(Number).sort((a, b) => a - b);
      if (sortedCycles.length > 0) {
        taskPoints[key] = { label: taskLabel, points: sortedCycles.map((ms) => byCycle[ms]) };
      }
    });

    const endgameLabel = document.createElement("h4");
    endgameLabel.className = "data-section-label";
    endgameLabel.textContent = "Endgame trend: completion # vs % time remaining (100% = start of cycle, 0% = deadline)";
    endgameLabel.style.marginTop = "1rem";
    container.appendChild(endgameLabel);
    const lineGraphWrap = document.createElement("div");
    lineGraphWrap.className = "timestamps-line-graph";
    const graphWidth = 400;
    const graphHeight = 220;
    const padding = { top: 28, right: 20, bottom: 40, left: 45 };
    const plotWidth = graphWidth - padding.left - padding.right;
    const plotHeight = graphHeight - padding.top - padding.bottom;
    const maxX = Math.max(1, ...Object.values(taskPoints).map((tp) => tp.points.length));
    const xDivisor = maxX > 1 ? maxX - 1 : 1;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + graphWidth + " " + graphHeight);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "auto");
    svg.style.maxWidth = graphWidth + "px";
    svg.style.display = "block";
    const colors = ["var(--pie-endgame)", "var(--pie-dailies)", "var(--pie-weeklies)", "#f472b6", "#fbbf24", "#a3e635", "#38bdf8", "#c084fc", "#fb923c", "#2dd4bf"];
    const pointTip = document.createElement("div");
    pointTip.className = "timestamps-trend-point-tooltip";
    pointTip.hidden = true;
    pointTip.setAttribute("role", "tooltip");

    function hideTrendPointTip() {
      pointTip.hidden = true;
      pointTip.textContent = "";
      pointTip.classList.remove("timestamps-trend-point-tooltip-below");
    }

    function formatTrendElapsedLabel(daysAfter, hoursAfter) {
      const parts = [];
      if (daysAfter > 0) parts.push(daysAfter + " day" + (daysAfter === 1 ? "" : "s"));
      if (hoursAfter > 0 || daysAfter === 0) {
        parts.push(hoursAfter + " hour" + (hoursAfter === 1 ? "" : "s"));
      }
      return "completed " + parts.join(" ") + " after cycle started";
    }

    function showTrendPointTip(circleEl, point, seriesLabel) {
      const pctStr = Math.round(point.pct) + "%";
      let detail;
      if (point.skipped || point.daysAfter == null) {
        detail = "Skipped (0% time remaining)";
      } else {
        detail = formatTrendElapsedLabel(point.daysAfter, point.hoursAfter || 0);
      }
      pointTip.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = seriesLabel;
      pointTip.appendChild(title);
      pointTip.appendChild(document.createElement("br"));
      pointTip.appendChild(document.createTextNode(pctStr + " time remaining"));
      pointTip.appendChild(document.createElement("br"));
      pointTip.appendChild(document.createTextNode(detail));
      pointTip.hidden = false;
      const wrapRect = lineGraphWrap.getBoundingClientRect();
      const cRect = circleEl.getBoundingClientRect();
      const left = cRect.left - wrapRect.left + cRect.width / 2;
      const top = cRect.top - wrapRect.top;
      pointTip.style.left = left + "px";
      pointTip.style.top = top + "px";
      requestAnimationFrame(() => {
        const tipRect = pointTip.getBoundingClientRect();
        let nextLeft = left;
        if (tipRect.right > wrapRect.right - 4) nextLeft -= tipRect.right - wrapRect.right + 4;
        if (nextLeft < 4) nextLeft = 4;
        pointTip.style.left = nextLeft + "px";
        if (tipRect.top < wrapRect.top + 4) {
          pointTip.style.top = top + cRect.height + 10 + "px";
          pointTip.classList.add("timestamps-trend-point-tooltip-below");
        } else {
          pointTip.classList.remove("timestamps-trend-point-tooltip-below");
        }
      });
    }

    Object.keys(taskPoints).forEach((key, idx) => {
      const tp = taskPoints[key];
      if (tp.points.length === 0) return;
      const color = colors[idx % colors.length];
      const seriesG = document.createElementNS("http://www.w3.org/2000/svg", "g");
      seriesG.classList.add("timestamps-trend-series");
      seriesG.setAttribute("data-series", key);

      const pathD = tp.points.map((point, i) => {
        const x = padding.left + (i / xDivisor) * plotWidth;
        const y = padding.top + plotHeight - (point.pct / 100) * plotHeight;
        return (i === 0 ? "M" : "L") + x + "," + y;
      }).join(" ");

      const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hitPath.setAttribute("d", pathD);
      hitPath.setAttribute("fill", "none");
      hitPath.setAttribute("stroke", "transparent");
      hitPath.setAttribute("stroke-width", "14");
      hitPath.setAttribute("stroke-linecap", "round");
      hitPath.setAttribute("stroke-linejoin", "round");
      hitPath.classList.add("timestamps-trend-hit");
      seriesG.appendChild(hitPath);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.classList.add("timestamps-trend-line");
      seriesG.appendChild(path);

      tp.points.forEach((point, i) => {
        const x = padding.left + (i / xDivisor) * plotWidth;
        const y = padding.top + plotHeight - (point.pct / 100) * plotHeight;
        const pctLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
        pctLabel.classList.add("timestamps-trend-pct-label");
        pctLabel.setAttribute("x", x);
        pctLabel.setAttribute("y", y - 8);
        pctLabel.setAttribute("text-anchor", "middle");
        pctLabel.setAttribute("fill", color);
        pctLabel.setAttribute("font-size", "9");
        pctLabel.setAttribute("font-weight", "700");
        pctLabel.textContent = Math.round(point.pct) + "%";
        seriesG.appendChild(pctLabel);

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", color);
        circle.setAttribute("stroke", "var(--bg)");
        circle.setAttribute("stroke-width", "1");
        circle.classList.add("timestamps-trend-point");
        circle.style.cursor = "pointer";
        circle.addEventListener("mouseenter", (e) => {
          e.stopPropagation();
          seriesG.classList.add("is-hovered");
          svg.classList.add("has-series-hover");
          showTrendPointTip(circle, point, tp.label);
        });
        circle.addEventListener("mouseleave", () => {
          hideTrendPointTip();
        });
        seriesG.appendChild(circle);
      });

      seriesG.addEventListener("mouseenter", () => {
        seriesG.classList.add("is-hovered");
        svg.classList.add("has-series-hover");
      });
      seriesG.addEventListener("mouseleave", () => {
        seriesG.classList.remove("is-hovered");
        if (!svg.querySelector(".timestamps-trend-series.is-hovered")) {
          svg.classList.remove("has-series-hover");
        }
        hideTrendPointTip();
      });
      svg.appendChild(seriesG);
    });
    const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    yAxis.setAttribute("x1", padding.left);
    yAxis.setAttribute("y1", padding.top);
    yAxis.setAttribute("x2", padding.left);
    yAxis.setAttribute("y2", padding.top + plotHeight);
    yAxis.setAttribute("stroke", "var(--border)");
    yAxis.setAttribute("stroke-width", "1");
    svg.insertBefore(yAxis, svg.firstChild);
    const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    xAxis.setAttribute("x1", padding.left);
    xAxis.setAttribute("y1", padding.top + plotHeight);
    xAxis.setAttribute("x2", padding.left + plotWidth);
    xAxis.setAttribute("y2", padding.top + plotHeight);
    xAxis.setAttribute("stroke", "var(--border)");
    xAxis.setAttribute("stroke-width", "1");
    svg.insertBefore(xAxis, svg.firstChild);
    for (let p = 0; p <= 100; p += 25) {
      const y = padding.top + plotHeight - (p / 100) * plotHeight;
      const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick.setAttribute("x1", padding.left - 4);
      tick.setAttribute("y1", y);
      tick.setAttribute("x2", padding.left);
      tick.setAttribute("y2", y);
      tick.setAttribute("stroke", "var(--border)");
      svg.insertBefore(tick, svg.firstChild);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", padding.left - 8);
      label.setAttribute("y", y + 4);
      label.setAttribute("text-anchor", "end");
      label.setAttribute("fill", "var(--text-muted)");
      label.setAttribute("font-size", "10");
      label.textContent = p + "%";
      svg.insertBefore(label, svg.firstChild);
    }
    for (let i = 1; i <= maxX; i += Math.max(1, Math.floor(maxX / 5))) {
      const x = padding.left + ((i - 1) / xDivisor) * plotWidth;
      const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick.setAttribute("x1", x);
      tick.setAttribute("y1", padding.top + plotHeight);
      tick.setAttribute("x2", x);
      tick.setAttribute("y2", padding.top + plotHeight + 4);
      tick.setAttribute("stroke", "var(--border)");
      svg.insertBefore(tick, svg.firstChild);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", x);
      label.setAttribute("y", padding.top + plotHeight + 16);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "var(--text-muted)");
      label.setAttribute("font-size", "10");
      label.textContent = i;
      svg.insertBefore(label, svg.firstChild);
    }
    const legendWrap = document.createElement("div");
    legendWrap.className = "timestamps-line-legend";
    legendWrap.style.display = "flex";
    legendWrap.style.flexWrap = "wrap";
    legendWrap.style.gap = "1rem";
    legendWrap.style.marginTop = "0.5rem";
    legendWrap.style.fontSize = "0.85rem";
    Object.keys(taskPoints).forEach((key, idx) => {
      const tp = taskPoints[key];
      if (tp.points.length === 0) return;
      const item = document.createElement("span");
      item.style.display = "inline-flex";
      item.style.alignItems = "center";
      item.style.gap = "0.35rem";
      const dot = document.createElement("span");
      dot.style.width = "10px";
      dot.style.height = "10px";
      dot.style.borderRadius = "50%";
      dot.style.background = colors[idx % colors.length];
      item.appendChild(dot);
      item.appendChild(document.createTextNode(tp.label));
      legendWrap.appendChild(item);
    });
    lineGraphWrap.appendChild(svg);
    lineGraphWrap.appendChild(pointTip);
    if (Object.keys(taskPoints).length > 0) lineGraphWrap.appendChild(legendWrap);
    if (Object.keys(taskPoints).length === 0) {
      const empty = document.createElement("p");
      empty.style.color = "var(--text-muted)";
      empty.style.fontSize = "0.9rem";
      empty.textContent = "No endgame completion data. Complete endgame tasks to see the trend.";
      lineGraphWrap.appendChild(empty);
    }
    container.appendChild(lineGraphWrap);
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  /**
   * Skipped = attempted − completed for included games.
   * Returns [{ gameId, gameName, tasks: [{ label, skipped, completed, attempted }] }].
   */
  function getAttendanceSkippedGroups(type) {
    const groups = [];
    (getAllGames() || []).forEach((game) => {
      if (state.attendancePieInclude && state.attendancePieInclude[game.id] === false) return;
      const tasks = [];
      if (type === "dailies") {
        if (!game.dailies) return;
        const attempted = getAttemptedAmount(state.dailiesAttempted, game.id);
        const completed = getCompletedAmount(state.dailiesCompleted, game.id);
        const skipped = Math.max(0, attempted - completed);
        if (skipped > 0) {
          tasks.push({ label: "Dailies", skipped, completed, attempted });
        }
      } else if (type === "weeklies") {
        (game.weeklies || []).forEach((t) => {
          const key = game.id + "." + (t.id || t.label);
          const attempted = getAttemptedAmount(state.weekliesAttempted, key);
          const completed = getCompletedAmount(state.weekliesCompleted, key);
          const skipped = Math.max(0, attempted - completed);
          if (skipped > 0) {
            tasks.push({ label: t.label || t.id || key, skipped, completed, attempted });
          }
        });
      } else if (type === "endgame") {
        (game.endgame || []).forEach((t) => {
          const key = game.id + "." + (t.id || t.label);
          const attempted = getAttemptedAmount(state.endgameAttempted, key);
          const completed = getCompletedAmount(state.endgameCompleted, key);
          const skipped = Math.max(0, attempted - completed);
          if (skipped > 0) {
            tasks.push({ label: t.label || t.id || key, skipped, completed, attempted });
          }
        });
      }
      if (tasks.length) {
        groups.push({ gameId: game.id, gameName: game.name || game.id, tasks });
      }
    });
    return groups;
  }

  function fillAttendanceSkippedList(container, groups, emptyMessage) {
    if (!container) return;
    container.innerHTML = "";
    container.classList.add("attendance-skipped-list");
    if (!groups || groups.length === 0) {
      const p = document.createElement("p");
      p.className = "attendance-skipped-empty";
      p.textContent = emptyMessage || "No skipped tasks.";
      container.appendChild(p);
      return;
    }
    groups.forEach((group) => {
      const block = document.createElement("div");
      block.className = "attendance-skipped-game";
      const title = document.createElement("h4");
      title.className = "attendance-skipped-game-title";
      title.textContent = group.gameName;
      block.appendChild(title);
      const ul = document.createElement("ul");
      ul.className = "attendance-skipped-task-list";
      (group.tasks || []).forEach((task) => {
        const li = document.createElement("li");
        li.className = "attendance-skipped-task";
        li.textContent =
          task.label +
          " — " +
          task.skipped +
          " skipped (" +
          task.completed +
          "/" +
          task.attempted +
          ")";
        ul.appendChild(li);
      });
      block.appendChild(ul);
      container.appendChild(block);
    });
  }

  function createAttendanceCategoryPieBox(type, title, done, total, pct) {
    const skipped = Math.max(0, total - done);
    const box = document.createElement("div");
    box.className = "pie-box pie-box-" + type + " attendance-pie-box";
    const h3 = document.createElement("h3");
    h3.textContent = title;
    box.appendChild(h3);
    const chart = document.createElement("div");
    chart.className = "pie-chart attendance-pie-chart";
    chart.style.setProperty("--pct", (pct / 100) * 360 + "deg");
    chart.tabIndex = 0;
    chart.setAttribute("role", "button");
    chart.setAttribute(
      "aria-label",
      title +
        " attendance: " +
        done +
        " of " +
        total +
        " completed, " +
        skipped +
        " skipped. Hover or activate to see skipped tasks by game."
    );
    box.appendChild(chart);
    const legend = document.createElement("div");
    legend.className = "pie-legend pie-legend-split";
    legend.innerHTML =
      "<span class=\"pie-legend-item completed\">Completed: " +
      done +
      " (" +
      (total ? Math.round((done / total) * 100) : 0) +
      "%)</span>" +
      "<span class=\"pie-legend-item skipped\">Skipped: " +
      skipped +
      " (" +
      (total ? Math.round((skipped / total) * 100) : 0) +
      "%)</span>";
    box.appendChild(legend);

    const table = document.createElement("table");
    table.className = "sr-only";
    const donePct = total ? Math.round((done / total) * 100) : 0;
    const skipPct = total ? Math.round((skipped / total) * 100) : 0;
    table.innerHTML =
      "<caption>" +
      escapeHtml(title) +
      " attendance</caption>" +
      "<thead><tr><th scope=\"col\">Status</th><th scope=\"col\">Count</th><th scope=\"col\">Percent</th></tr></thead>" +
      "<tbody>" +
      "<tr><th scope=\"row\">Completed</th><td>" +
      done +
      "</td><td>" +
      donePct +
      "%</td></tr>" +
      "<tr><th scope=\"row\">Skipped</th><td>" +
      skipped +
      "</td><td>" +
      skipPct +
      "%</td></tr>" +
      "</tbody>";
    box.appendChild(table);

    const tooltip = document.createElement("div");
    tooltip.className = "attendance-pie-skipped-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    const tooltipBody = document.createElement("div");
    tooltip.appendChild(tooltipBody);
    box.appendChild(tooltip);

    function refreshTooltip() {
      const groups = getAttendanceSkippedGroups(type);
      fillAttendanceSkippedList(
        tooltipBody,
        groups,
        skipped === 0 ? "No skipped tasks." : "No skipped tasks for included games."
      );
    }

    function showTooltip() {
      refreshTooltip();
      tooltip.hidden = false;
      box.classList.add("attendance-pie-box-tooltip-open");
    }

    function hideTooltip() {
      tooltip.hidden = true;
      box.classList.remove("attendance-pie-box-tooltip-open");
    }

    function openSkippedPopup() {
      hideTooltip();
      if (typeof chart.blur === "function") chart.blur();
      const groups = getAttendanceSkippedGroups(type);
      if (typeof openAttendanceSkippedModal === "function") {
        openAttendanceSkippedModal(title + " — skipped tasks", groups, skipped);
      }
    }

    box.addEventListener("mouseenter", showTooltip);
    box.addEventListener("mouseleave", hideTooltip);
    chart.addEventListener("focus", showTooltip);
    chart.addEventListener("blur", hideTooltip);
    chart.addEventListener("click", (e) => {
      e.preventDefault();
      openSkippedPopup();
    });
    chart.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openSkippedPopup();
      }
    });
    return box;
  }

  const CURRENCY_PIE_COLORS = ["#34d399", "#7c3aed", "#60a5fa", "#f472b6", "#fbbf24", "#22d3ee", "#a78bfa", "#fb923c"];

  function createCompletionPieBox(title, completed, total, useCleared, subtitle) {
    const skipped = total - completed;
    const pct = total ? (completed / total) * 360 : 0;
    const labelDone = useCleared ? "Cleared" : "Completed";
    const box = document.createElement("div");
    box.className = "pie-box";
    // Always reserve subtitle space so pie charts align across a row.
    const subHtml =
      "<p class=\"pie-box-subtitle" + (subtitle ? " task-counting-since-tag" : "") + "\">" +
      (subtitle ? escapeHtml(subtitle) : "&nbsp;") +
      "</p>";
    box.innerHTML =
      "<h3>" + escapeHtml(title) + "</h3>" +
      subHtml +
      "<div class=\"pie-chart\" style=\"--pct: " + pct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">" + labelDone + ": " + completed + " (" + (total ? Math.round((completed / total) * 100) : 0) + "%)</span>" +
      "<span class=\"pie-legend-item skipped\">Skipped: " + skipped + " (" + (total ? Math.round((skipped / total) * 100) : 0) + "%)</span>" +
      "</div>";
    return box;
  }

  function formatExtracurricularDateRangeLabel(task) {
    if (!task) return "";
    const start =
      task.startDate && isValidDateStr(task.startDate) ? formatDate(task.startDate) : "—";
    let end = "TBD";
    if (!task.endDateTBD && task.endDate && isValidDateStr(task.endDate)) {
      end = formatDate(task.endDate);
    }
    return start + " – " + end;
  }

  function createExtracurricularCurrencyPieBox(task, earned, potential, opts) {
    const pot = Math.max(0, Number(potential) || 0);
    const e = Math.max(0, Number(earned) || 0);
    const total = Math.max(pot, e, 1);
    const earnedPct = total ? (e / total) * 360 : 0;
    const box = document.createElement("div");
    box.className = "pie-box";
    const subtitle = (opts && opts.hideDates) ? "" : formatExtracurricularDateRangeLabel(task);
    const subHtml =
      "<p class=\"pie-box-subtitle" + (subtitle ? " task-counting-since-tag" : "") + "\">" +
      (subtitle ? escapeHtml(subtitle) : "&nbsp;") +
      "</p>";
    if (total === 0 || (e === 0 && pot === 0)) {
      box.innerHTML =
        "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
        subHtml +
        "<div class=\"pie-chart pie-chart-empty\"></div>" +
        "<div class=\"pie-legend\">No currency earned yet</div>";
      return box;
    }
    box.innerHTML =
      "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
      subHtml +
      "<div class=\"pie-chart\" style=\"--pct: " + earnedPct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">Earned: " + e + (total ? " (" + Math.round((e / total) * 100) + "%)" : "") + "</span>" +
      "<span class=\"pie-legend-item skipped\">Potential: " + pot + "</span>" +
      "</div>";
    return box;
  }

  function createEndgameCurrencyPieBox(task, earned, potential, subtitle) {
    const pot = Math.max(0, Number(potential) || 0);
    const total = Math.max(pot, earned, 1);
    const earnedPct = total ? (earned / total) * 360 : 0;
    const box = document.createElement("div");
    box.className = "pie-box";
    const subHtml =
      "<p class=\"pie-box-subtitle" + (subtitle ? " task-counting-since-tag" : "") + "\">" +
      (subtitle ? escapeHtml(subtitle) : "&nbsp;") +
      "</p>";
    if (total === 0 || (earned === 0 && pot === 0)) {
      box.innerHTML =
        "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
        subHtml +
        "<div class=\"pie-chart pie-chart-empty\"></div>" +
        "<div class=\"pie-legend\">No currency earned yet</div>";
      return box;
    }
    box.innerHTML =
      "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
      subHtml +
      "<div class=\"pie-chart\" style=\"--pct: " + earnedPct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">Earned: " + earned + (total ? " (" + Math.round((earned / total) * 100) + "%)" : "") + "</span>" +
      "<span class=\"pie-legend-item skipped\">Potential: " + pot + "</span>" +
      "</div>";
    return box;
  }

  function createCurrencyPieBox(title, segments, emptyMessage) {
    const total = segments.reduce((s, x) => s + x.value, 0);
    if (total === 0) {
      const box = document.createElement("div");
      box.className = "pie-box";
      box.innerHTML =
        "<h3>" + escapeHtml(title) + "</h3>" +
        "<div class=\"pie-chart pie-chart-empty\"></div>" +
        "<div class=\"pie-legend\">" + escapeHtml(emptyMessage || "No data") + "</div>";
      return box;
    }
    let gradientParts = [];
    let acc = 0;
    segments.forEach((seg, i) => {
      const deg = (seg.value / total) * 360;
      if (deg > 0) {
        gradientParts.push(seg.color + " " + acc + "deg " + (acc + deg) + "deg");
        acc += deg;
      }
    });
    const box = document.createElement("div");
    box.className = "pie-box";
    let legendHtml = "";
    segments.forEach((seg) => {
      const pct = total ? Math.round((seg.value / total) * 100) : 0;
      const valStr = typeof seg.value === "number" && !Number.isInteger(seg.value) ? Number(seg.value).toFixed(2) : String(seg.value);
      legendHtml += "<span class=\"pie-legend-item\" style=\"--dot-color:" + seg.color + "\">" + escapeHtml(seg.label) + ": " + valStr + " (" + pct + "%)</span>";
    });
    box.innerHTML =
      "<h3>" + escapeHtml(title) + "</h3>" +
      "<div class=\"pie-chart pie-chart-multi\" style=\"background: conic-gradient(" + gradientParts.join(", ") + ")\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" + legendHtml + "</div>";
    return box;
  }


  const EXTRACURRICULAR_ARCHIVE_MS = 24 * 60 * 60 * 1000;

  function isExtracurricularArchived(task) {
    const now = getSimulatedNow().getTime();
    const endMs = getExtracurricularEndMs(task);
    if (endMs != null && now > endMs) return true;
    const completed = state.extracurricularCompleted[task.id];
    if (!completed) return false;
    const at = state.extracurricularCompletedAt && state.extracurricularCompletedAt[task.id];
    if (!at) return true;
    const completedDate = new Date(at);
    return (now - completedDate.getTime()) > EXTRACURRICULAR_ARCHIVE_MS;
  }

  function sortExtracurricularByDueDate(tasks) {
    return [...tasks].sort((a, b) => {
      const aTbd = !!a.endDateTBD || !a.endDate;
      const bTbd = !!b.endDateTBD || !b.endDate;
      if (aTbd !== bTbd) return aTbd ? 1 : -1;
      if (aTbd) return 0;
      return (a.endDate || "").localeCompare(b.endDate || "");
    });
  }

  function getActiveExtracurricularTasks() {
    return sortExtracurricularByDueDate((state.extracurricularTasks || []).filter((t) => !isExtracurricularArchived(t)));
  }

  function getArchivedExtracurricularTasks() {
    // Keep array order — History should not be re-sorted on each render.
    return (state.extracurricularTasks || []).filter((t) => isExtracurricularArchived(t));
  }

  function setExtracurricularCompleted(taskId, completed) {
    if (completed) openExtracurricularCompleteModal(taskId);
    else clearExtracurricularCompletion(taskId);
  }

  /** Builds a card for the home page checklist, matching dailies/weeklies/endgame (same task-item hover). */
  function buildExtracurricularTaskItemForHome(task, tagName) {
    const completed = !!state.extracurricularCompleted[task.id];
    const el = document.createElement(tagName || "div");
    el.className = "task-item" + (completed ? " done" : "");

    const game = task.gameId ? getGame(task.gameId) : null;
    appendTaskCardMedia(el, task, game || { name: task.label || "Task" }, { surface: "home" });
    const body = appendTaskCardBody(el);

    const pot = Math.max(0, Number(task.currency) || 0);
    const top = document.createElement("div");
    top.className = "task-top task-card-title-row";
    const titleCol = document.createElement("div");
    titleCol.className = "task-game-heading-text";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label || "Task";
    span.addEventListener("click", () => {
      setExtracurricularCompleted(task.id, !completed);
    });
    titleCol.appendChild(span);
    if (pot > 0) {
      const potSpan = document.createElement("span");
      potSpan.className = "task-potential";
      potSpan.textContent = "Potential: " + pot;
      titleCol.appendChild(potSpan);
    }
    top.appendChild(titleCol);
    body.appendChild(top);

    const sub = document.createElement("div");
    sub.className = "task-subrows";
    const row1 = document.createElement("div");
    row1.className = "task-subrow";
    const left1 = document.createElement("div");
    left1.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    check.setAttribute("aria-label", completed ? "Mark incomplete" : "Mark complete");
    check.addEventListener("click", () => {
      setExtracurricularCompleted(task.id, !completed);
    });
    const label1 = document.createElement("span");
    label1.innerHTML = "<strong>Completion Status:</strong> " + (completed ? "Complete" : "Incomplete");
    left1.appendChild(check);
    left1.appendChild(label1);
    row1.appendChild(left1);
    sub.appendChild(row1);

    const remText = getExtracurricularTimeRemainingText(task, getSimulatedNow());
    if (remText) {
      const remainingRow = document.createElement("div");
      remainingRow.className = "task-subrow";
      const leftR = document.createElement("div");
      leftR.className = "left";
      const labelR = document.createElement("span");
      labelR.innerHTML = "<strong>Time remaining:</strong>";
      leftR.appendChild(labelR);
      remainingRow.appendChild(leftR);
      const remainingVal = document.createElement("span");
      remainingVal.className = "task-remaining";
      remainingVal.textContent = remText;
      remainingRow.appendChild(remainingVal);
      sub.appendChild(remainingRow);
    }

    body.appendChild(sub);
    return el;
  }

  function buildExtracurricularTaskItem(task, tagName, opts) {
    const completed = state.extracurricularCompleted[task.id];
    const li = document.createElement(tagName || "li");
    li.className = "task-item task-item-with-changer task-card-knot";
    if (completed) li.classList.add("done");

    const game = task.gameId ? getGame(task.gameId) : null;
    const surface = (opts && opts.surface) || "board";
    const media = appendTaskCardMedia(li, task, game || { name: task.gameId || "Task" }, { surface: surface });

    const actions = document.createElement("div");
    actions.className = "task-card-media-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "✎";
    editBtn.setAttribute("aria-label", "Edit task");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openExtracurricularTaskModal(task);
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", "Delete task");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteExtracurricularTask(task.id);
    });
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    if (media) media.appendChild(actions);

    const body = appendTaskCardBody(li);

    const top = document.createElement("div");
    top.className = "task-item-top task-card-title-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = !!completed;
    checkbox.addEventListener("change", () => {
      const want = checkbox.checked;
      if (want === !!state.extracurricularCompleted[task.id]) return;
      if (want) {
        checkbox.checked = false;
        openExtracurricularCompleteModal(task.id);
      } else {
        clearExtracurricularCompletion(task.id);
      }
    });
    top.appendChild(checkbox);
    const labelWrap = document.createElement("div");
    labelWrap.className = "task-item-info";
    const label = document.createElement("span");
    label.className = "task-label";
    label.textContent = task.label || "Task";
    labelWrap.appendChild(label);
    top.appendChild(labelWrap);
    body.appendChild(top);

    const startStr = task.startDate || "";
    const endStr = task.endDateTBD ? "TBD" : (task.endDate || "");
    const endDisplay = endStr + (task.endTime && !task.endDateTBD ? " " + task.endTime : "");
    const dateLine = startStr + (endDisplay ? " — " + endDisplay : "");
    const pot = Math.max(0, Number(task.currency) || 0);
    let earnedStr = "—";
    if (completed) {
      const rec = state.extracurricularCurrencyEarned && state.extracurricularCurrencyEarned[task.id];
      const e = rec !== undefined && rec !== null ? Math.max(0, Number(rec) || 0) : pot;
      earnedStr = String(e);
    }
    const remainingText = getExtracurricularTimeRemainingText(task, getSimulatedNow());
    const snippetParts = [];
    if (task.description) snippetParts.push(task.description);
    else if (dateLine) snippetParts.push(dateLine);
    snippetParts.push("Potential: " + pot + " · Earned: " + earnedStr);
    if (remainingText && remainingText !== "TBD") snippetParts.push(remainingText + " left");
    const snippet = document.createElement("p");
    snippet.className = "task-card-snippet";
    snippet.textContent = snippetParts.join(" · ");
    body.appendChild(snippet);

    const meta = document.createElement("div");
    meta.className = "task-subrows";
    if (dateLine) {
      const info = document.createElement("div");
      info.className = "task-subrow";
      const infoSpan = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = "Dates: ";
      infoSpan.appendChild(strong);
      infoSpan.appendChild(document.createTextNode(dateLine));
      info.appendChild(infoSpan);
      meta.appendChild(info);
    }
    const currencyRow = document.createElement("div");
    currencyRow.className = "task-subrow";
    const currencySpan = document.createElement("span");
    const currencyStrong = document.createElement("strong");
    currencyStrong.textContent = "Currency: ";
    currencySpan.appendChild(currencyStrong);
    currencySpan.appendChild(document.createTextNode("Potential " + pot + " · Earned " + earnedStr));
    currencyRow.appendChild(currencySpan);
    meta.appendChild(currencyRow);
    body.appendChild(meta);

    return li;
  }

  function renderExtracurricular() {
    const container = document.getElementById("extracurricularContent");
    if (!container) return;
    container.innerHTML = "";
    const viewMode = state.extracurricularViewMode || "tasks";

    const headerRow = document.createElement("div");
    headerRow.className = "extracurricular-header-row";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-add";
    addBtn.textContent = "+ Add task";
    addBtn.addEventListener("click", () => openExtracurricularTaskModal(null));
    headerRow.appendChild(addBtn);
    if (viewMode === "tasks") {
      const historyBtn = document.createElement("button");
      historyBtn.type = "button";
      historyBtn.className = "btn btn-ghost";
      historyBtn.textContent = "History";
      historyBtn.addEventListener("click", () => {
        state.extracurricularViewMode = "history";
        save();
        renderActiveTab();
      });
      headerRow.appendChild(historyBtn);
    } else {
      const tasksBtn = document.createElement("button");
      tasksBtn.type = "button";
      tasksBtn.className = "btn btn-ghost";
      tasksBtn.textContent = "← Tasks";
      tasksBtn.addEventListener("click", () => {
        state.extracurricularViewMode = "tasks";
        save();
        renderActiveTab();
      });
      headerRow.appendChild(tasksBtn);
    }
    container.appendChild(headerRow);

    const tasksRaw = viewMode === "history" ? getArchivedExtracurricularTasks() : getActiveExtracurricularTasks();
    const now = getSimulatedNow();
    // Active board: due-date / completion sort. History: leave in saved order (no re-sort).
    const tasks = viewMode === "history"
      ? tasksRaw
      : sortBoardTaskEntries(tasksRaw.map((task, taskOrder) => {
          const rem = getExtracurricularTimeRemainingMs(task, now);
          return {
            task,
            completed: !!state.extracurricularCompleted[task.id],
            dueMs: rem == null ? Number.POSITIVE_INFINITY : (now.getTime() + rem),
            gameOrder: 0,
            taskOrder,
          };
        })).map((entry) => entry.task);

    if (tasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = viewMode === "history"
        ? "No archived tasks. Tasks move here when their end date passes, or when completed 24+ hours ago."
        : "No extracurricular tasks yet. Add one to get started.";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "task-grid task-grid-knot";
    tasks.forEach((task) => list.appendChild(buildExtracurricularTaskItem(task, "div")));
    container.appendChild(list);
    scheduleTaskMasonry(list);
  }

  function updateExtracurricularTimeRemainingDisplay() {
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
    const endInput = document.getElementById("extracurricularTaskEndDate");
    const endTimeInput = document.getElementById("extracurricularTaskEndTime");
    const row = document.getElementById("extracurricularTimeRemainingRow");
    const input = document.getElementById("extracurricularTimeRemainingInput");
    if (!row || !input) return;
    const isTBD = endTBDInput && endTBDInput.checked;
    const endStr = endInput && endInput.value ? endInput.value.trim() : "";
    if (isTBD || !endStr) {
      input.value = "";
      input.placeholder = "e.g. 6d 7hr";
      return;
    }
    const m = endStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      input.value = "";
      return;
    }
    const timeStr = (endTimeInput && endTimeInput.value) ? endTimeInput.value.trim() : "23:59";
    const tParts = timeStr.split(":");
    const h = parseInt(tParts[0], 10) || 23;
    const min = parseInt(tParts[1], 10) || 59;
    const sec = parseInt(tParts[2], 10) || 0;
    const endMoment = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, min, sec);
    const now = getSimulatedNow();
    const ms = endMoment.getTime() - now.getTime();
    input.value = ms > 0 ? formatRemainingMs(ms) : "Not Available";
  }

  function applyExtracurricularTimeRemainingFromInput() {
    const input = document.getElementById("extracurricularTimeRemainingInput");
    const endInput = document.getElementById("extracurricularTaskEndDate");
    const endTimeInput = document.getElementById("extracurricularTaskEndTime");
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
    if (!input || !endInput) return;
    const remainingMs = parseTimeRemainingToMs(input.value.trim());
    if (remainingMs == null || remainingMs <= 0) return;
    const now = getSimulatedNow();
    const endDate = new Date(now.getTime() + remainingMs);
    const endStr = getDateStr(endDate);
    endInput.value = endStr;
    const h = endDate.getHours();
    const m = endDate.getMinutes();
    if (endTimeInput) endTimeInput.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    if (endTBDInput) {
      endTBDInput.checked = false;
      endInput.disabled = false;
    }
    const endRow = document.querySelector(".extracurricular-end-date-row");
    if (endRow) endRow.style.display = "";
    input.value = formatRemainingMs(remainingMs);
  }

  function initExtracurricularTimeRemainingInput() {
    const input = document.getElementById("extracurricularTimeRemainingInput");
    if (!input) return;
    input.addEventListener("blur", applyExtracurricularTimeRemainingFromInput);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyExtracurricularTimeRemainingFromInput();
      }
    });
  }

  function openExtracurricularTaskModal(task) {
    const modal = document.getElementById("extracurricularTaskModal");
    const title = document.getElementById("extracurricularTaskModalTitle");
    const form = document.getElementById("extracurricularTaskModalForm");
    const nameInput = document.getElementById("extracurricularTaskName");
    const startInput = document.getElementById("extracurricularTaskStartDate");
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
    const endInput = document.getElementById("extracurricularTaskEndDate");
    const endTimeInput = document.getElementById("extracurricularTaskEndTime");
    const descInput = document.getElementById("extracurricularTaskDescription");
    const gameSelect = document.getElementById("extracurricularTaskGame");

    if (title) title.textContent = task ? "Edit task" : "Add task";
    const currencyInput = document.getElementById("extracurricularTaskCurrency");
    const excludeFromDataInput = document.getElementById("extracurricularTaskExcludeFromData");
    if (nameInput) nameInput.value = task ? (task.label || "") : "";
    if (startInput) startInput.value = task && task.startDate ? task.startDate : getDateStr();
    if (endTBDInput) endTBDInput.checked = !!(task && task.endDateTBD);
    if (endInput) {
      endInput.value = task && task.endDate ? task.endDate : "";
      endInput.disabled = !!(task && task.endDateTBD);
    }
    if (endTimeInput) endTimeInput.value = (task && task.endTime) ? task.endTime : "23:59";
    if (descInput) descInput.value = task ? (task.description || "") : "";
    if (currencyInput) currencyInput.value = task && task.currency != null ? String(task.currency) : "";
    if (excludeFromDataInput) excludeFromDataInput.checked = !!(task && task.excludeFromData);
    if (gameSelect) {
      gameSelect.innerHTML = "<option value=\"\">— None —</option>";
      getAllGames().forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.name || g.id;
        if (task && task.gameId === g.id) opt.selected = true;
        gameSelect.appendChild(opt);
      });
    }

    const endRow = document.querySelector(".extracurricular-end-date-row");
    const endTimeRow = document.querySelector(".extracurricular-end-time-row");
    if (endRow) endRow.style.display = endTBDInput && endTBDInput.checked ? "none" : "";
    if (endTimeRow) endTimeRow.style.display = endTBDInput && endTBDInput.checked ? "none" : "";
    if (endTBDInput) {
      endTBDInput.onchange = () => {
        if (endInput) endInput.disabled = endTBDInput.checked;
        if (endRow) endRow.style.display = endTBDInput.checked ? "none" : "";
        if (endTimeRow) endTimeRow.style.display = endTBDInput.checked ? "none" : "";
        updateExtracurricularTimeRemainingDisplay();
      };
    }
    if (endInput) {
      endInput.onchange = updateExtracurricularTimeRemainingDisplay;
      endInput.oninput = updateExtracurricularTimeRemainingDisplay;
    }
    if (endTimeInput) {
      endTimeInput.onchange = updateExtracurricularTimeRemainingDisplay;
      endTimeInput.oninput = updateExtracurricularTimeRemainingDisplay;
    }

    updateExtracurricularTimeRemainingDisplay();
    setExtracurricularOcrStatus(
      "Reads event name and time left (e.g. 37d). When Skip description is on, description is left alone."
    );

    if (typeof setActiveBannerUi === "function") setActiveBannerUi("extra");
    taskModal.bannerTarget = "home";
    taskModal.gameId = (task && task.gameId) || null;
    const loaded = typeof loadTaskBannersFromTask === "function"
      ? loadTaskBannersFromTask(task)
      : { source: null, views: emptyTaskBannerViews() };
    taskModal.bannerSource = loaded.source;
    taskModal.bannerViews = loaded.views;
    taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    if (typeof resetTaskBannerCropState === "function") resetTaskBannerCropState();
    if (typeof syncTaskBannerTargetButtons === "function") syncTaskBannerTargetButtons();
    if (typeof syncTaskBannerPreview === "function") syncTaskBannerPreview();

    if (modal) {
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      if (typeof activateModalFocus === "function") activateModalFocus(modal);
    }
    extracurricularTaskModalState.task = task;
    requestAnimationFrame(() => {
      if (typeof setActiveBannerUi === "function") setActiveBannerUi("extra");
      if (typeof resizeTaskBannerCropStage === "function") resizeTaskBannerCropStage();
      if (typeof drawTaskBannerCrop === "function") drawTaskBannerCrop();
      if (taskModal.bannerSource && typeof loadTaskBannerSourceFromUrl === "function") {
        loadTaskBannerSourceFromUrl(taskModal.bannerSource, { keepViews: true }).catch(() => {});
      } else if (typeof syncTaskBannerEditorFrames === "function") {
        syncTaskBannerEditorFrames();
        if (typeof drawTaskBannerCrop === "function") drawTaskBannerCrop();
      }
    });
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function closeExtracurricularTaskModal() {
    const modal = document.getElementById("extracurricularTaskModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (typeof deactivateModalFocus === "function") deactivateModalFocus();
    }
    extracurricularTaskModalState.task = null;
    if (typeof setActiveBannerUi === "function") setActiveBannerUi("task");
    if (typeof resetTaskBannerCropState === "function") resetTaskBannerCropState();
    taskModal.bannerSource = null;
    taskModal.bannerViews = typeof emptyTaskBannerViews === "function" ? emptyTaskBannerViews() : { home: null, games: null, board: null };
    taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
  }

  function deleteExtracurricularTask(taskId) {
    const task = (state.extracurricularTasks || []).find((t) => t.id === taskId);
    if (!task) return;
    confirmTaskDelete(task.label || taskId, () => reallyDeleteExtracurricularTask(taskId));
  }

  function reallyDeleteExtracurricularTask(taskId) {
    if (!(state.extracurricularTasks || []).some((t) => t.id === taskId)) return;
    state.extracurricularTasks = (state.extracurricularTasks || []).filter((t) => t.id !== taskId);
    delete state.extracurricularCompleted[taskId];
    if (state.extracurricularCompletedAt) delete state.extracurricularCompletedAt[taskId];
    if (state.extracurricularCurrencyEarned) delete state.extracurricularCurrencyEarned[taskId];
    save();
    renderActiveTab();
  }

  const extracurricularTaskModalState = { task: null };

  const OCR_UI_NOISE = [
    "event demo",
    "event details",
    "outfit reward",
    "current revenue",
    "current phase",
    "time remaining",
    "ridu chronicles",
    "summer vibes",
    "select all",
    "unselect all",
    "fill from screenshot",
  ];

  function loadScriptOnce(src, globalName) {
    return new Promise((resolve, reject) => {
      if (globalName && typeof window[globalName] !== "undefined") {
        resolve(window[globalName]);
        return;
      }
      const existing = document.querySelector('script[data-ocr-src="' + src + '"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(globalName ? window[globalName] : true));
        existing.addEventListener("error", () => reject(new Error("Failed to load " + src)));
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.ocrSrc = src;
      s.onload = () => resolve(globalName ? window[globalName] : true);
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  function ensureTesseractLoaded() {
    if (typeof window.Tesseract !== "undefined") return Promise.resolve(window.Tesseract);
    return loadScriptOnce("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", "Tesseract");
  }

  function setExtracurricularOcrStatus(msg) {
    const el = document.getElementById("extracurricularOcrStatus");
    if (el) el.textContent = msg || "";
  }

  /** Soften common OCR confusions around event timers (37d, clock badges, etc.). */
  function normalizeOcrForTimers(text) {
    let s = String(text || "");
    // Only same-line digit confusions (do not let \s eat newlines into the next word).
    s = s.replace(/(\d)[ \t]*[OoQ](?=[ \t]*\d|[ \t]*[dD](?:ays?\b)?|[ \t]*$)/gm, "$10");
    s = s.replace(/(\d)[ \t]*[Il|!](?=[ \t]*[dD](?:ays?\b)?|[ \t]*$)/gm, "$11");
    // "37cl" / "37dl" / "37al" often = "37d"
    s = s.replace(/\b(\d{1,3})[ \t]*(?:cl|dl|al|ol|ci|di)\b/gi, "$1d");
    // "37 d ." / "37d." / "37·d"
    s = s.replace(/\b(\d{1,3})[ \t]*[·•.\-_]?[ \t]*[dD]\b/g, "$1d");
    return s;
  }

  /**
   * Pull event countdown from noisy OCR. Prefers 1–120 day values (typical event length).
   * Returns e.g. "37d" or "6d 7hr" or "".
   */
  function extractEventTimeRemainingFromOcr(text) {
    const normalized = normalizeOcrForTimers(text);
    const lines = normalized
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const haystacks = [normalized.replace(/\s+/g, " "), ...lines];

    const candidates = [];
    const push = (days, hours, mins, score, source) => {
      const d = Number(days);
      if (!Number.isFinite(d) || d < 1 || d > 120) return;
      const h = hours != null && hours !== "" ? Number(hours) : null;
      const m = mins != null && mins !== "" ? Number(mins) : null;
      if (h != null && (!Number.isFinite(h) || h > 23)) return;
      if (m != null && (!Number.isFinite(m) || m > 59)) return;
      let out = d + "d";
      if (h) out += " " + h + "hr";
      if (m) out += " " + m + "m";
      candidates.push({ out, days: d, score: score + (d >= 7 && d <= 60 ? 2 : 0), source });
    };

    haystacks.forEach((chunk, idx) => {
      const lineBonus = idx > 0 && chunk.length <= 12 ? 3 : 0;
      let m;
      const reFull =
        /\b(\d{1,3})\s*d(?:ays?)?(?:\s*(\d{1,2})\s*(?:h|hr|hrs|hours?))?(?:\s*(\d{1,2})\s*(?:m|min|mins|minutes?))?\b/gi;
      while ((m = reFull.exec(chunk)) !== null) {
        push(m[1], m[2], m[3], 10 + lineBonus, m[0]);
      }
      const reGlued = /\b(\d{1,3})d\b/gi;
      while ((m = reGlued.exec(chunk)) !== null) {
        push(m[1], null, null, 9 + lineBonus, m[0]);
      }
      // "37 days left", "Ends in 37 days"
      const reEnds = /(?:ends?\s+in|remaining|left)\s*:?\s*(\d{1,3})\s*d(?:ays?)?/gi;
      while ((m = reEnds.exec(chunk)) !== null) {
        push(m[1], null, null, 12 + lineBonus, m[0]);
      }
      // Short line that is only a plausible day count (clock badge OCR dropped the "d")
      if (idx > 0 && /^(\d{1,3})$/.test(chunk)) {
        const n = Number(chunk);
        if (n >= 2 && n <= 90) push(n, null, null, 4, chunk);
      }
      // "37" next to leftover junk from a clock icon: "O 37d", "* 37"
      const reBadge = /(?:^|[\s*•·▪︎○◯◉⏰⏱])(\d{1,3})\s*[dD]?(?:\s|$)/g;
      while ((m = reBadge.exec(chunk)) !== null) {
        if (/d/i.test(m[0])) push(m[1], null, null, 8 + lineBonus, m[0]);
      }
    });

    if (!candidates.length) return "";
    candidates.sort((a, b) => b.score - a.score || b.days - a.days);
    return candidates[0].out;
  }

  /**
   * Heuristic parse of event-banner OCR text → { label, timeRemaining, description, gameHint }.
   */
  function parseExtracurricularScreenshotText(text) {
    const raw = String(text || "").replace(/\r/g, "\n");
    const lines = raw
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const joined = lines.join(" ");
    const timeRemaining = extractEventTimeRemainingFromOcr(raw);

    const isNoise = (line) => {
      const low = line.toLowerCase();
      if (OCR_UI_NOISE.some((n) => low === n || low.includes(n))) return true;
      if (/^\d+([./,]\d+)*$/.test(line)) return true;
      if (/^\d+\s*\/\s*[\d,]+$/.test(line)) return true;
      if (!/[A-Za-z\u00C0-\u024F]/.test(line)) return true;
      if (line.length < 4) return true;
      return false;
    };

    const titleCandidates = lines
      .map((line, idx) => {
        let cleaned = line.replace(/\s*\(([ivx]+)\)\s*$/i, "").trim();
        cleaned = cleaned.replace(/^["'“”]+|["'“”]+$/g, "").trim();
        return { line: cleaned, idx };
      })
      .filter((c) => !isNoise(c.line) && c.line.length <= 80 && /[A-Za-z\u00C0-\u024F]{3,}/.test(c.line));

    let label = "";
    if (titleCandidates.length) {
      titleCandidates.sort((a, b) => {
        const score = (c) => {
          const words = c.line.split(/\s+/).length;
          const early = Math.max(0, 12 - c.idx);
          const mixed = /[a-z]/.test(c.line) && /[A-Z]/.test(c.line) ? 3 : 0;
          return early * 2 + Math.min(words, 6) + mixed;
        };
        return score(b) - score(a);
      });
      label = titleCandidates[0].line;
    }

    const descLines = lines.filter((line) => {
      if (isNoise(line)) return false;
      if (label && line.toLowerCase().includes(label.toLowerCase().slice(0, Math.min(12, label.length)))) return false;
      if (timeRemaining && line.toLowerCase().includes(timeRemaining.toLowerCase())) return false;
      return line.length >= 40 && /[a-z]/i.test(line);
    });
    const description = descLines.slice(0, 3).join(" ").trim();

    let gameHint = "";
    const lowAll = joined.toLowerCase();
    if (/\bzzz\b|zenless|ridu chronicles|hollow zero|new eridu/.test(lowAll)) gameHint = "zzz";
    else if (/\bhsr\b|honkai star rail|trailblaze|divergent universe/.test(lowAll)) gameHint = "hsr";
    else if (/\bhi3\b|honkai impact|superstring|memorial arena/.test(lowAll)) gameHint = "hi3";
    else if (/\bwuthering|whimpering wastes|tower of adversity/.test(lowAll)) gameHint = "ww";
    else if (/\bpgr\b|punishing gray|punishing grey|pain cage|warzone/.test(lowAll)) gameHint = "pgr";
    else if (/\bendfield|arknights/.test(lowAll)) gameHint = "akendfield";

    return { label, timeRemaining, description, gameHint, rawText: raw };
  }

  function guessExtracurricularGameId(hint) {
    if (!hint) return "";
    const games = typeof getAllGames === "function" ? getAllGames() : state.games || [];
    const byId = games.find((g) => String(g.id).toLowerCase() === hint);
    if (byId) return byId.id;
    const presets = {
      zzz: [/zenless/i, /\bzzz\b/i],
      hsr: [/star rail/i, /\bhsr\b/i],
      hi3: [/impact 3/i, /\bhi3\b/i],
      ww: [/wuthering/i],
      pgr: [/punishing/i, /\bpgr\b/i],
      akendfield: [/endfield/i, /arknights/i],
    };
    const reList = presets[hint] || [];
    const hit = games.find((g) => reList.some((re) => re.test(g.name || "") || re.test(g.id || "")));
    return hit ? hit.id : "";
  }

  function applyExtracurricularOcrResult(parsed, opts) {
    const o = opts || {};
    const skipDescription = !!o.skipDescription;
    if (!parsed) return;

    const nameInput = document.getElementById("extracurricularTaskName");
    const descInput = document.getElementById("extracurricularTaskDescription");
    const gameSelect = document.getElementById("extracurricularTaskGame");
    const remainingInput = document.getElementById("extracurricularTimeRemainingInput");
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");

    if (parsed.label && nameInput) nameInput.value = parsed.label;

    if (parsed.timeRemaining && remainingInput) {
      if (endTBDInput && endTBDInput.checked) {
        endTBDInput.checked = false;
        if (typeof endTBDInput.onchange === "function") endTBDInput.onchange();
        else endTBDInput.dispatchEvent(new Event("change"));
      }
      remainingInput.value = parsed.timeRemaining;
      applyExtracurricularTimeRemainingFromInput();
    }

    if (!skipDescription && parsed.description && descInput) {
      descInput.value = parsed.description;
    }

    if (parsed.gameHint && gameSelect && !gameSelect.value) {
      const gid = guessExtracurricularGameId(parsed.gameHint);
      if (gid) gameSelect.value = gid;
    }
  }

  function loadImageElement(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load image"));
      };
      img.src = url;
    });
  }

  /**
   * Upscale + contrast boost; optional top-band crop for event timers in the header.
   * Returns a canvas (Tesseract accepts canvas/HTMLImageElement).
   */
  function preprocessScreenshotForOcr(img, opts) {
    const o = opts || {};
    const topFraction = o.topFraction != null ? o.topFraction : 1;
    const scale = o.scale != null ? o.scale : 2;
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const cropH = Math.max(1, Math.round(srcH * Math.min(1, Math.max(0.15, topFraction))));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(cropH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, srcW, cropH, 0, 0, canvas.width, canvas.height);
    try {
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = frame.data;
      for (let i = 0; i < d.length; i += 4) {
        // luma + contrast stretch toward black/white (helps white outlined UI text)
        let y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        y = (y - 128) * 1.35 + 128;
        y = y < 0 ? 0 : y > 255 ? 255 : y;
        // Soft threshold: keep midtones but punch text
        const v = y > 170 ? 255 : y < 90 ? 0 : y;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(frame, 0, 0);
    } catch (_) {
      // tainted canvas / security — return unprocessed draw
    }
    return canvas;
  }

  async function recognizeScreenshotText(Tesseract, fileOrBlob) {
    const img = await loadImageElement(fileOrBlob);
    const full = preprocessScreenshotForOcr(img, { topFraction: 1, scale: 2 });
    const top = preprocessScreenshotForOcr(img, { topFraction: 0.42, scale: 2.5 });
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: () => {},
    });
    try {
      // Sparse UI text helps timers/titles on busy art
      if (worker.setParameters) {
        await worker.setParameters({
          tessedit_pageseg_mode: "11",
          preserve_interword_spaces: "1",
        });
      }
      const [fullRes, topRes] = await Promise.all([worker.recognize(full), worker.recognize(top)]);
      const a = (fullRes && fullRes.data && fullRes.data.text) || "";
      const b = (topRes && topRes.data && topRes.data.text) || "";
      return (a + "\n" + b).trim();
    } finally {
      await worker.terminate();
    }
  }

  async function runExtracurricularScreenshotOcr(fileOrBlob) {
    if (!fileOrBlob) return;
    const skipEl = document.getElementById("extracurricularOcrSkipDescription");
    const skipDescription = !!(skipEl && skipEl.checked);
    setExtracurricularOcrStatus("Loading OCR engine…");
    try {
      const Tesseract = await ensureTesseractLoaded();
      setExtracurricularOcrStatus("Reading screenshot (enhancing image)…");
      const text = await recognizeScreenshotText(Tesseract, fileOrBlob);
      const parsed = parseExtracurricularScreenshotText(text);
      if (!parsed.label && !parsed.timeRemaining && !parsed.description) {
        const preview = text.replace(/\s+/g, " ").trim().slice(0, 100);
        setExtracurricularOcrStatus(
          "Couldn’t read event details — try a tighter crop of the title and timer." +
            (preview ? " OCR saw: “" + preview + "…”" : "")
        );
        return;
      }
      applyExtracurricularOcrResult(parsed, { skipDescription });
      const bits = [];
      if (parsed.label) bits.push("name");
      if (parsed.timeRemaining) bits.push("time left (" + parsed.timeRemaining + ")");
      if (!skipDescription && parsed.description) bits.push("description");
      if (parsed.gameHint) bits.push("game hint");
      let status =
        "Filled: " + (bits.join(", ") || "nothing") + (skipDescription ? " (description skipped)" : "") + ". Review before saving.";
      if (!parsed.timeRemaining) {
        const preview = text.replace(/\s+/g, " ").trim().slice(0, 80);
        status +=
          " Timer not found — enter time remaining manually." +
          (preview ? " OCR snippet: “" + preview + "…”" : "");
      }
      setExtracurricularOcrStatus(status);
    } catch (err) {
      setExtracurricularOcrStatus("OCR failed: " + ((err && err.message) || "unknown error"));
    }
  }

  function initExtracurricularOcrFill() {
    const drop = document.getElementById("extracurricularOcrDrop");
    const fileInput = document.getElementById("extracurricularOcrFile");
    const chooseBtn = document.getElementById("extracurricularOcrChooseBtn");
    if (!drop || !fileInput) return;
    if (drop.dataset.bound === "1") return;
    drop.dataset.bound = "1";

    const onFiles = (files) => {
      const file = files && files[0];
      if (!file || !String(file.type || "").startsWith("image/")) {
        setExtracurricularOcrStatus("Please choose an image file.");
        return;
      }
      runExtracurricularScreenshotOcr(file);
    };

    if (chooseBtn) {
      chooseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        fileInput.click();
      });
    }
    fileInput.addEventListener("change", () => {
      onFiles(fileInput.files);
      fileInput.value = "";
    });
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("is-dragover");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("is-dragover");
      onFiles(e.dataTransfer && e.dataTransfer.files);
    });
    drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    document.addEventListener("paste", (e) => {
      const modal = document.getElementById("extracurricularTaskModal");
      if (!modal || modal.hidden) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.type && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            runExtracurricularScreenshotOcr(blob);
          }
          break;
        }
      }
    });
  }

  function initExtracurricularTaskModal() {
    const modal = document.getElementById("extracurricularTaskModal");
    const closeBtn = document.getElementById("extracurricularTaskModalClose");
    const cancelBtn = document.getElementById("extracurricularTaskModalCancel");
    const form = document.getElementById("extracurricularTaskModalForm");

    if (!modal || !form) return;
    initExtracurricularTimeRemainingInput();
    initExtracurricularOcrFill();

    modal.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeExtracurricularTaskModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeExtracurricularTaskModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeExtracurricularTaskModal);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.hidden) closeExtracurricularTaskModal();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("extracurricularTaskName");
      const startInput = document.getElementById("extracurricularTaskStartDate");
      const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
      const endInput = document.getElementById("extracurricularTaskEndDate");
      const descInput = document.getElementById("extracurricularTaskDescription");
      const gameSelect = document.getElementById("extracurricularTaskGame");
      const currencyInput = document.getElementById("extracurricularTaskCurrency");
      const excludeFromDataInput = document.getElementById("extracurricularTaskExcludeFromData");

      const label = (nameInput && nameInput.value || "").trim();
      if (!label) {
        if (nameInput) nameInput.focus();
        return;
      }

      const task = extracurricularTaskModalState.task;
      const currency = Math.max(0, Number(currencyInput && currencyInput.value) || 0);
      const endTimeInput = document.getElementById("extracurricularTaskEndTime");
      const endTimeVal = endTBDInput && endTBDInput.checked ? null : (endTimeInput && endTimeInput.value ? endTimeInput.value.trim() : null);
      const excludeFromData = !!(excludeFromDataInput && excludeFromDataInput.checked);
      const payload = {
        id: task ? task.id : "ex_" + Date.now(),
        label,
        startDate: startInput && startInput.value ? startInput.value : getDateStr(),
        endDateTBD: !!(endTBDInput && endTBDInput.checked),
        endDate: endTBDInput && endTBDInput.checked ? null : (endInput && endInput.value || null),
        endTime: endTimeVal || undefined,
        description: (descInput && descInput.value || "").trim() || null,
        gameId: (gameSelect && gameSelect.value) || null,
        currency: currency || undefined,
        excludeFromData: excludeFromData || undefined,
      };

      if (typeof setActiveBannerUi === "function") setActiveBannerUi("extra");
      if (typeof commitTaskBannerCrop === "function" && taskBannerCrop.sourceImg && !taskBannerCrop.clear) {
        commitTaskBannerCrop();
      }
      if (typeof applyTaskBannersToSavePayload === "function") applyTaskBannersToSavePayload(payload);
      // Extracurricular: Board crop is also used on the Games page (no separate Games crop).
      if (payload.bannerViews && payload.bannerViews.board && typeof cloneBannerView === "function") {
        payload.bannerViews.games = cloneBannerView(payload.bannerViews.board, payload.bannerViews.board.aspect);
      }

      if (task) {
        const idx = (state.extracurricularTasks || []).findIndex((t) => t.id === task.id);
        if (idx >= 0) {
          const merged = { ...state.extracurricularTasks[idx], ...payload };
          if (!excludeFromData) delete merged.excludeFromData;
          if (typeof clearTaskBannerFieldsFromMerged === "function") clearTaskBannerFieldsFromMerged(merged);
          state.extracurricularTasks[idx] = merged;
        }
      } else {
        state.extracurricularTasks = state.extracurricularTasks || [];
        state.extracurricularTasks.push(payload);
      }
      save();
      closeExtracurricularTaskModal();
      renderActiveTab();
    });

    const gameSelectLive = document.getElementById("extracurricularTaskGame");
    const currencyLive = document.getElementById("extracurricularTaskCurrency");
    const refreshPreview = () => {
      if (activeBannerUiKey !== "extra") return;
      if (taskModal.bannerSource && typeof syncTaskBannerPreview === "function") syncTaskBannerPreview();
    };
    if (gameSelectLive) {
      gameSelectLive.addEventListener("change", () => {
        taskModal.gameId = gameSelectLive.value || null;
        refreshPreview();
      });
    }
    if (currencyLive) currencyLive.addEventListener("input", refreshPreview);
  }

  function getDataExcludeInProgress(gameId) {
    const g = state.dataExcludeInProgress && state.dataExcludeInProgress[gameId];
    return g !== false;
  }

  function setDataExcludeInProgress(gameId, value) {
    if (!state.dataExcludeInProgress) state.dataExcludeInProgress = {};
    state.dataExcludeInProgress[gameId] = value;
  }

  function getDataHideDates(gameId) {
    return !!(state.dataHideDates && state.dataHideDates[gameId]);
  }

  function setDataHideDates(gameId, value) {
    if (!state.dataHideDates) state.dataHideDates = {};
    state.dataHideDates[gameId] = !!value;
  }

  function getDataPieInclude(gameId, category) {
    const g = state.dataPieInclude && state.dataPieInclude[gameId];
    return g && g[category] !== undefined ? g[category] : true;
  }

  function setDataPieInclude(gameId, category, value) {
    if (!state.dataPieInclude) state.dataPieInclude = {};
    if (!state.dataPieInclude[gameId]) state.dataPieInclude[gameId] = {};
    state.dataPieInclude[gameId][category] = value;
  }

  let lastDataViewKey = "";

  function getDataViewKey() {
    const game = getGame(state.dataSelectedGameId);
    if (!game) return "none";
    return [
      state.dataVersion || 0,
      game.id,
      state.dateFormat,
      JSON.stringify(state.dataPieInclude[game.id] || {}),
      getDataExcludeInProgress(game.id) ? "1" : "0",
      getDataHideDates(game.id) ? "1" : "0",
    ].join("|");
  }

  function renderData() {
    const container = document.getElementById("dataContainer");
    if (!container) return;
    const viewKey = getDataViewKey();
    if (viewKey === lastDataViewKey && container.childElementCount > 0) return;
    lastDataViewKey = viewKey;
    const game = getGame(state.dataSelectedGameId);
    if (!game) {
      container.innerHTML = "<p class=\"empty-state\">Select a game from the Data list in the sidebar to view its data.</p>";
      return;
    }
    container.innerHTML = "";
    const gameTitle = document.createElement("h3");
    gameTitle.className = "data-game-title";
    gameTitle.textContent = game.name;
    container.appendChild(gameTitle);

    const exclToggleWrap = document.createElement("div");
    exclToggleWrap.className = "data-excl-toggle-wrap";
    const exclToggle = document.createElement("label");
    exclToggle.className = "data-excl-toggle";
    const exclCheck = document.createElement("input");
    exclCheck.type = "checkbox";
    exclCheck.checked = getDataExcludeInProgress(game.id);
    exclCheck.setAttribute("aria-label", "Exclude unfinished current cycles from potential");
    exclCheck.addEventListener("change", () => {
      setDataExcludeInProgress(game.id, exclCheck.checked);
      save();
      renderActiveTab();
    });
    exclToggle.appendChild(exclCheck);
    const exclText = document.createElement("span");
    exclText.className = "data-excl-text";
    exclText.textContent = "Exclude unfinished current cycles from potential. Turn off to include theoretical potential for cycles not yet completed.";
    exclToggle.appendChild(exclText);
    exclToggleWrap.appendChild(exclToggle);
    container.appendChild(exclToggleWrap);

    const hideDatesWrap = document.createElement("div");
    hideDatesWrap.className = "data-excl-toggle-wrap";
    const hideDatesToggle = document.createElement("label");
    hideDatesToggle.className = "data-excl-toggle";
    const hideDatesCheck = document.createElement("input");
    hideDatesCheck.type = "checkbox";
    hideDatesCheck.checked = getDataHideDates(game.id);
    hideDatesCheck.setAttribute("aria-label", "Hide dates");
    hideDatesCheck.addEventListener("change", () => {
      setDataHideDates(game.id, hideDatesCheck.checked);
      save();
      renderActiveTab();
    });
    hideDatesToggle.appendChild(hideDatesCheck);
    const hideDatesText = document.createElement("span");
    hideDatesText.className = "data-excl-text";
    hideDatesText.textContent = "Hide dates";
    hideDatesToggle.appendChild(hideDatesText);
    hideDatesWrap.appendChild(hideDatesToggle);
    container.appendChild(hideDatesWrap);

    const hideDates = getDataHideDates(game.id);
    const sinceLabel = (type, key) => (hideDates ? null : formatCountingSinceLabel(game, type, key));

    const ep = getGameEarnedAndPotential(game);
    const cpp = Math.max(0, Number(game.currencyPerPull) || 0);

    const currencyLabel = getCurrencyLabel(game);
    const dE = ep ? ep.dailies.earned : 0, dP = ep ? ep.dailies.potential : 0;
    const wE = ep ? ep.weeklies.earned : 0, wP = ep ? ep.weeklies.potential : 0;
    const eE = ep ? ep.endgame.earned : 0, eP = ep ? ep.endgame.potential : 0;
    const xE = ep && ep.extracurricular ? ep.extracurricular.earned : 0;
    const xP = ep && ep.extracurricular ? ep.extracurricular.potential : 0;

    const incD = getDataPieInclude(game.id, "dailies");
    const incW = getDataPieInclude(game.id, "weeklies");
    const incE = getDataPieInclude(game.id, "endgame");
    const incX = getDataPieInclude(game.id, "extracurricular");

    const inclEarned = (incD ? dE : 0) + (incW ? wE : 0) + (incE ? eE : 0) + (incX ? xE : 0);
    const inclPotential = (incD ? dP : 0) + (incW ? wP : 0) + (incE ? eP : 0) + (incX ? xP : 0);
    const missed = Math.max(0, inclPotential - inclEarned);

    const toPullsStr = (n) => cpp > 0 ? (n / cpp).toFixed(2) : "—";
    const formatCurr = (earned, potential) => (earned === 0 && potential === 0) ? "—" : String(earned);
    const formatCurrPot = (earned, potential) => (earned === 0 && potential === 0) ? "—" : String(potential);
    const formatCurrMissed = (earned, potential) => (earned === 0 && potential === 0) ? "—" : String(Math.max(0, potential - earned));
    const formatPulls = (earned, potential) => (earned === 0 && potential === 0) ? "—" : toPullsStr(earned);
    const formatPullsPot = (earned, potential) => (earned === 0 && potential === 0) ? "—" : toPullsStr(potential);
    const formatPullsMissed = (earned, potential) => (earned === 0 && potential === 0) ? "—" : toPullsStr(Math.max(0, potential - earned));

    const makeToggle = (cat, checked) => {
      const t = document.createElement("input");
      t.type = "checkbox";
      t.className = "data-pie-toggle";
      t.checked = checked;
      t.title = "Include " + cat + " in earning total and pie charts";
      t.setAttribute("aria-label", "Include " + cat + " in total and pie charts");
      t.addEventListener("change", () => {
        setDataPieInclude(game.id, cat.toLowerCase(), t.checked);
        save();
        renderActiveTab();
      });
      return t;
    };

    const tablesSection = document.createElement("div");
    tablesSection.className = "data-pie-section data-tables-section";
    const currencyHeader = document.createElement("h4");
    currencyHeader.className = "data-section-label";
    currencyHeader.textContent = currencyLabel + " earned vs potential";
    tablesSection.appendChild(currencyHeader);

    const currencyTableWrap = document.createElement("div");
    currencyTableWrap.className = "data-table-wrap";
    const currencyTable = document.createElement("table");
    currencyTable.className = "data-summary-table";
    currencyTable.innerHTML = "<thead><tr><th>Category</th><th class=\"data-toggle-col\">Include</th><th>Earned</th><th>Potential</th><th>Missed</th></tr></thead>";
    const currencyTbody = currencyTable.createTBody();
    const pullsTable = document.createElement("table");
    pullsTable.className = "data-summary-table";
    pullsTable.innerHTML = "<thead><tr><th>Category</th><th class=\"data-toggle-col\">Include</th><th>Earned</th><th>Potential</th><th>Missed</th></tr></thead>";
    const pullsTbody = pullsTable.createTBody();
    [[ "Dailies", dE, dP, incD ], [ "Weeklies", wE, wP, incW ], [ "Endgame", eE, eP, incE ], [ "Extracurricular", xE, xP, incX ]].forEach(([ cat, earned, potential, inc ]) => {
      const tr = currencyTbody.insertRow();
      tr.insertCell().textContent = cat;
      const toggleCell = tr.insertCell();
      toggleCell.className = "data-toggle-cell";
      toggleCell.appendChild(makeToggle(cat, inc));
      tr.insertCell().textContent = formatCurr(earned, potential);
      tr.insertCell().textContent = formatCurrPot(earned, potential);
      tr.insertCell().textContent = formatCurrMissed(earned, potential);
      const pr = pullsTbody.insertRow();
      pr.insertCell().textContent = cat;
      const ptCell = pr.insertCell();
      ptCell.className = "data-toggle-cell";
      ptCell.appendChild(makeToggle(cat, inc));
      pr.insertCell().textContent = formatPulls(earned, potential);
      pr.insertCell().textContent = formatPullsPot(earned, potential);
      pr.insertCell().textContent = formatPullsMissed(earned, potential);
    });
    const totalCurr = currencyTbody.insertRow();
    totalCurr.className = "data-summary-total";
    totalCurr.insertCell().textContent = "Total";
    totalCurr.insertCell().className = "data-toggle-cell";
    totalCurr.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : String(inclEarned);
    totalCurr.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : String(inclPotential);
    totalCurr.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : String(missed);
    const totalPull = pullsTbody.insertRow();
    totalPull.className = "data-summary-total";
    totalPull.insertCell().textContent = "Total";
    totalPull.insertCell().className = "data-toggle-cell";
    totalPull.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : toPullsStr(inclEarned);
    totalPull.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : toPullsStr(inclPotential);
    totalPull.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : toPullsStr(missed);
    currencyTableWrap.appendChild(currencyTable);
    tablesSection.appendChild(currencyTableWrap);

    const currencyEarnedSegs = [];
    if (incD && dE > 0) currencyEarnedSegs.push({ label: "Dailies", value: dE, color: CURRENCY_PIE_COLORS[0] });
    if (incW && wE > 0) currencyEarnedSegs.push({ label: "Weeklies", value: wE, color: CURRENCY_PIE_COLORS[1] });
    if (incE && eE > 0) currencyEarnedSegs.push({ label: "Endgame", value: eE, color: CURRENCY_PIE_COLORS[2] });
    if (incX && xE > 0) currencyEarnedSegs.push({ label: "Extracurricular", value: xE, color: CURRENCY_PIE_COLORS[4] });
    const currencyPotentialSegs = [];
    if (incD && dP > 0) currencyPotentialSegs.push({ label: "Dailies", value: dP, color: CURRENCY_PIE_COLORS[0] });
    if (incW && wP > 0) currencyPotentialSegs.push({ label: "Weeklies", value: wP, color: CURRENCY_PIE_COLORS[1] });
    if (incE && eP > 0) currencyPotentialSegs.push({ label: "Endgame", value: eP, color: CURRENCY_PIE_COLORS[2] });
    if (incX && xP > 0) currencyPotentialSegs.push({ label: "Extracurricular", value: xP, color: CURRENCY_PIE_COLORS[4] });
    const currencyNetSegs = [];
    if (incD && dE > 0) currencyNetSegs.push({ label: "Dailies", value: dE, color: CURRENCY_PIE_COLORS[0] });
    if (incW && wE > 0) currencyNetSegs.push({ label: "Weeklies", value: wE, color: CURRENCY_PIE_COLORS[1] });
    if (incE && eE > 0) currencyNetSegs.push({ label: "Endgame", value: eE, color: CURRENCY_PIE_COLORS[2] });
    if (incX && xE > 0) currencyNetSegs.push({ label: "Extracurricular", value: xE, color: CURRENCY_PIE_COLORS[4] });
    if (missed > 0) currencyNetSegs.push({ label: "Missed", value: missed, color: CURRENCY_PIE_COLORS[3] });
    const piesRow = document.createElement("div");
    piesRow.className = "data-pies-row";
    piesRow.appendChild(createCurrencyPieBox("Earned", currencyEarnedSegs, "No currency earned yet"));
    piesRow.appendChild(createCurrencyPieBox("Net Earnings", currencyNetSegs, "No data"));
    piesRow.appendChild(createCurrencyPieBox("Potential", currencyPotentialSegs, "No potential yet"));
    tablesSection.appendChild(piesRow);

    const pullsHeader = document.createElement("h4");
    pullsHeader.className = "data-section-label";
    pullsHeader.textContent = "Pulls earned vs potential";
    pullsHeader.style.marginTop = "1.5rem";
    tablesSection.appendChild(pullsHeader);
    const pullsTableWrap = document.createElement("div");
    pullsTableWrap.className = "data-table-wrap";
    pullsTableWrap.appendChild(pullsTable);
    tablesSection.appendChild(pullsTableWrap);
    container.appendChild(tablesSection);

    const excl = getDataExcludeInProgress(game.id);
    const includeInProgress = !excl;
    const dCa = game.dailies ? getCalendarCompletedAttempted(game, "dailies", game.id, includeInProgress) : { completed: 0, attempted: 0 };
    const dCompleted = dCa.completed;
    const dAttempted = dCa.attempted;
    const dTotal = game.dailies ? (dAttempted > 0 ? dAttempted : Math.max(dCompleted, 1)) : 0;
    const weeklies = (game.weeklies || []).filter((t) => !isTaskHiddenInData(t));
    let wCompleted = 0, wAttempted = 0;
    weeklies.forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      const ca = getCalendarCompletedAttempted(game, "weeklies", key, includeInProgress);
      wCompleted += ca.completed;
      wAttempted += ca.attempted;
    });
    const wTotal = wAttempted > 0 ? wAttempted : Math.max(wCompleted, weeklies.length || 1);
    const endgame = (game.endgame || []).filter((t) => !isTaskHiddenInData(t));
    let eCompleted = 0, eAttempted = 0;
    endgame.forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      const ca = getCalendarCompletedAttempted(game, "endgame", key, includeInProgress);
      eCompleted += ca.completed;
      eAttempted += ca.attempted;
    });
    const eTotal = eAttempted > 0 ? eAttempted : Math.max(eCompleted, endgame.length || 1);

    const overallRow = document.createElement("div");
    overallRow.className = "data-pie-row";
    overallRow.innerHTML = "<h4 class=\"data-section-label\">Overall</h4>";
    const overallPies = document.createElement("div");
    overallPies.className = "pie-row";
    overallPies.appendChild(createCompletionPieBox(
      "Dailies",
      dCompleted,
      dTotal,
      false,
      game.dailies ? sinceLabel("dailies", game.id) : null
    ));
    overallPies.appendChild(createCompletionPieBox("Weeklies", wCompleted, wTotal, false));
    overallPies.appendChild(createCompletionPieBox("Endgame", eCompleted, eTotal, true));
    overallRow.appendChild(overallPies);
    container.appendChild(overallRow);

    if (weeklies.length > 0) {
      const weekliesSection = document.createElement("div");
      weekliesSection.className = "data-pie-section";
      const wh = document.createElement("h4");
      wh.className = "data-section-label";
      wh.textContent = "Weeklies";
      weekliesSection.appendChild(wh);
      const wPies = document.createElement("div");
      wPies.className = "pie-row";
      weeklies.forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const ca = getCalendarCompletedAttempted(game, "weeklies", key, includeInProgress);
        const total = ca.attempted > 0 ? ca.attempted : Math.max(ca.completed, 1);
        const taskLabel = (task.label || "Weekly") + (isTaskCycleEnded(task, getSimulatedNow(), game) ? " (Ended)" : "");
        wPies.appendChild(createCompletionPieBox(taskLabel, ca.completed, total, false, sinceLabel("weeklies", key)));
      });
      weekliesSection.appendChild(wPies);
      container.appendChild(weekliesSection);
    }

    if (endgame.length > 0) {
      const endgameSection = document.createElement("div");
      endgameSection.className = "data-pie-section";
      const eh = document.createElement("h4");
      eh.className = "data-section-label";
      eh.textContent = "Endgame";
      endgameSection.appendChild(eh);
      const ePies = document.createElement("div");
      ePies.className = "pie-row";
      endgame.forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const ca = getCalendarCompletedAttempted(game, "endgame", key, includeInProgress);
        const total = ca.attempted > 0 ? ca.attempted : Math.max(ca.completed, 1);
        const taskLabel = (task.label || "Endgame") + (isTaskCycleEnded(task, getSimulatedNow(), game) ? " (Ended)" : "");
        ePies.appendChild(createCompletionPieBox(taskLabel, ca.completed, total, true, sinceLabel("endgame", key)));
      });
      endgameSection.appendChild(ePies);
      container.appendChild(endgameSection);

      const currencySection = document.createElement("div");
      currencySection.className = "data-pie-section";
      const ch = document.createElement("h4");
      ch.className = "data-section-label";
      ch.textContent = "Endgame " + currencyLabel + " earned";
      currencySection.appendChild(ch);
      const currencyPies = document.createElement("div");
      currencyPies.className = "pie-row";
      endgame.forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const ca = getCalendarCompletedAttempted(game, "endgame", key, includeInProgress);
        const earned = getEndgameEarnedCompletedCyclesOnly(game.id, task.id || task.label, ca.completed);
        const potential = getEndgamePotentialSum(game.id, task.id || task.label, task, ca.attempted);
        currencyPies.appendChild(createEndgameCurrencyPieBox(task, earned, potential, sinceLabel("endgame", key)));
      });
      currencySection.appendChild(currencyPies);
      container.appendChild(currencySection);
    }

    const exTasks = (state.extracurricularTasks || []).filter((t) => t.gameId === game.id && !isTaskHiddenInData(t));
    const exPieTasks = [];
    exTasks.forEach((task) => {
      const pot = Math.max(0, Number(task.currency) || 0);
      let earned = 0;
      if (state.extracurricularCompleted[task.id]) {
        const rec = state.extracurricularCurrencyEarned && state.extracurricularCurrencyEarned[task.id];
        earned = rec !== undefined && rec !== null ? Math.max(0, Number(rec) || 0) : pot;
      }
      if (earned <= 0) return;
      exPieTasks.push({ task, earned, pot });
    });
    if (exPieTasks.length > 0) {
      const exSection = document.createElement("div");
      exSection.className = "data-pie-section";
      const exh = document.createElement("h4");
      exh.className = "data-section-label";
      exh.textContent = "Extracurricular " + currencyLabel + " earned";
      exSection.appendChild(exh);
      const exPies = document.createElement("div");
      exPies.className = "pie-row";
      exPieTasks.forEach(({ task, earned, pot }) => {
        exPies.appendChild(createExtracurricularCurrencyPieBox(task, earned, pot, { hideDates }));
      });
      exSection.appendChild(exPies);
      container.appendChild(exSection);
    }
  }

  function renderSidebarDataList() {
    const list = document.getElementById("sidebarDataList");
    if (!list) return;
    list.innerHTML = "";
    getAllGames().forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.draggable = true;
      btn.dataset.gameId = game.id;
      const active = state.tab === "data" && game.id === state.dataSelectedGameId;
      btn.className = "sidebar-data-item" + (active ? " active" : "");
      btn.textContent = game.name;
      btn.addEventListener("click", () => {
        state.tab = "data";
        state.dataSelectedGameId = game.id;
        state.gamesSelectedId = game.id;
        renderActiveTab();
      });
      btn.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", game.id);
        e.dataTransfer.effectAllowed = "move";
        btn.classList.add("sidebar-drag-source");
      });
      btn.addEventListener("dragend", () => btn.classList.remove("sidebar-drag-source"));
      btn.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.classList.add("sidebar-drag-over");
      });
      btn.addEventListener("dragleave", (e) => e.currentTarget.classList.remove("sidebar-drag-over"));
      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("sidebar-drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        const targetId = e.currentTarget.dataset.gameId;
        if (draggedId && targetId && draggedId !== targetId) reorderGame(draggedId, targetId);
      });
      list.appendChild(btn);
    });
  }

  function renderSidebarGamesList() {
    const list = document.getElementById("sidebarGamesList");
    if (!list) return;
    list.innerHTML = "";
    getAllGames().forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.draggable = true;
      btn.dataset.gameId = game.id;
      const active = state.tab === "games" && game.id === state.gamesSelectedId;
      btn.className = "sidebar-game-item" + (active ? " active" : "");
      btn.textContent = game.name;
      btn.addEventListener("click", () => {
        state.tab = "games";
        state.gamesSelectedId = game.id;
        state.dataSelectedGameId = game.id;
        renderActiveTab();
      });
      btn.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", game.id);
        e.dataTransfer.effectAllowed = "move";
        btn.classList.add("sidebar-drag-source");
      });
      btn.addEventListener("dragend", () => btn.classList.remove("sidebar-drag-source"));
      btn.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.classList.add("sidebar-drag-over");
      });
      btn.addEventListener("dragleave", (e) => e.currentTarget.classList.remove("sidebar-drag-over"));
      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("sidebar-drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        const targetId = e.currentTarget.dataset.gameId;
        if (draggedId && targetId && draggedId !== targetId) reorderGame(draggedId, targetId);
      });
      list.appendChild(btn);
    });
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "sidebar-game-item add-game";
    addBtn.textContent = "+ Add game";
    addBtn.addEventListener("click", () => {
      openGameModal();
    });
    list.appendChild(addBtn);
  }


  function appendCycleEndedBadge(parent, task, game) {
    if (!isTaskCycleEnded(task, getSimulatedNow(), game)) return;
    const bounds = getLastCycleBounds(task, game);
    const badge = document.createElement("span");
    badge.className = "task-cycle-ended-badge";
    badge.textContent = bounds
      ? "Ended · last cycle " + formatDate(new Date(bounds.endStr + "T12:00:00"))
      : "Ended";
    parent.appendChild(badge);
  }

  /** Tag showing when calendar tally counting began (first completion or dateStarted). */
  function appendCountingSinceTag(parent, game, type, key) {
    const startStr = getTaskTallyStartDate(game, type, key);
    const firstComplete = getTaskFirstCalendarCompletionDate(game, type, key);
    const tag = document.createElement("span");
    tag.className = "task-counting-since-tag";
    if (startStr) {
      tag.textContent = "Counting since: " + formatDate(new Date(startStr + "T12:00:00"));
      if (firstComplete && firstComplete === startStr) {
        tag.title = "First calendar completion (" + startStr + "). Completed/attempted tallies start from this date.";
      } else if (!firstComplete) {
        tag.title = "Counting from cycle start date (" + startStr + ") even without a completion that day.";
      } else {
        tag.title = "Counting from cycle start date (" + startStr + "). First completion was " + firstComplete + ".";
      }
    } else {
      tag.textContent = "Counting since: —";
      tag.title = "No calendar completions yet. Tallies start after the first completion, or enable “Count from cycle start date” on the task.";
    }
    parent.appendChild(tag);
    return tag;
  }

  /** Shell for Games weeklies/endgame cards: left media + right main column. */
  function createGamesManagedTaskCard(selected, t, taskType) {
    const key = selected.id + "." + (t.id || t.label);
    const li = document.createElement("li");
    li.className = "task-item task-item-with-changer games-task-card";
    appendGamesTaskSideMedia(li, t);

    const main = document.createElement("div");
    main.className = "games-task-main";

    const top = document.createElement("div");
    top.className = "task-item-top games-task-top";

    const header = document.createElement("div");
    header.className = "games-task-header";
    const titleLine = document.createElement("div");
    titleLine.className = "games-task-title-line";
    const label = document.createElement("span");
    label.className = "task-label";
    label.textContent = t.label || "";
    titleLine.appendChild(label);
    header.appendChild(titleLine);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "✎";
    editBtn.setAttribute("aria-label", "Edit task");
    editBtn.addEventListener("click", () => openTaskModal({ gameId: selected.id, taskType: taskType, task: t }));
    header.appendChild(editBtn);
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", "Delete task");
    deleteBtn.addEventListener("click", () => {
      deleteGameBoardTask(selected.id, taskType, t.id || t.label);
    });
    header.appendChild(deleteBtn);
    top.appendChild(header);

    const meta = document.createElement("div");
    meta.className = "games-task-meta";

    const metaLine = document.createElement("div");
    metaLine.className = "games-task-meta-line";
    const resetSpan = document.createElement("span");
    resetSpan.className = "games-task-reset";
    resetSpan.textContent = "Resets: " + (
      taskType === "endgame"
        ? getEndgameResetDisplay(t, getSimulatedNow(), selected)
        : getWeeklyResetDisplay(t, getSimulatedNow(), selected)
    );
    metaLine.appendChild(resetSpan);

    const dateStartSpan = document.createElement("span");
    dateStartSpan.className = taskType === "endgame" ? "games-endgame-date-start" : "games-weekly-date-start";
    const ds = isValidDateStr(t.dateStarted) ? t.dateStarted : getDateStr();
    const dsDate = new Date(ds + "T12:00:00");
    dateStartSpan.textContent = "Started: " + formatDate(dsDate);
    dateStartSpan.title = "Date started: " + ds;
    metaLine.appendChild(dateStartSpan);
    meta.appendChild(metaLine);

    appendCountingSinceTag(meta, selected, taskType, key);
    appendCycleEndedBadge(meta, t, selected);
    top.appendChild(meta);

    main.appendChild(top);
    li.appendChild(main);
    return { li, main, key };
  }

  function appendGamesTaskBottom(main, selected, t, taskType, potentialText) {
    const bottom = document.createElement("div");
    bottom.className = "games-task-bottom";
    const right = document.createElement("div");
    right.className = "games-task-bottom-right";
    const potSpan = document.createElement("span");
    potSpan.className = "games-task-potential";
    potSpan.textContent = potentialText;
    right.appendChild(potSpan);
    appendTaskCycleEndFooter(right, selected, t, taskType);
    bottom.appendChild(right);
    main.appendChild(bottom);
  }

  function formatCountingSinceLabel(game, type, key) {
    const startStr = getTaskTallyStartDate(game, type, key);
    if (!startStr) return "Counting since: —";
    return "Counting since: " + formatDate(new Date(startStr + "T12:00:00"));
  }

  /** Prevent number inputs from blurring (and firing change) when clicking Sync. */
  function bindSyncButton(btn, onSync) {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", onSync);
  }

  const gameIdentityModalState = {
    open: false,
    gameId: null,
    sourceImg: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    shape: "rounded",
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    panStartX: 0,
    panStartY: 0,
    clearIcon: false,
  };

  function setGameIdentityModalOpen(open) {
    const el = document.getElementById("gameIdentityModal");
    if (!el) return;
    gameIdentityModalState.open = !!open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function closeGameIdentityModal() {
    setGameIdentityModalOpen(false);
    gameIdentityModalState.gameId = null;
    gameIdentityModalState.sourceImg = null;
    gameIdentityModalState.clearIcon = false;
  }

  function syncGameIdentityShapeButtons() {
    document.querySelectorAll(".game-icon-shape-btn").forEach((btn) => {
      const active = btn.dataset.shape === gameIdentityModalState.shape;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const frame = document.getElementById("gameIdentityCropFrame");
    const wrap = document.getElementById("gameIdentityCropWrap");
    if (frame) {
      frame.className = "game-icon-crop-frame game-icon-crop-frame-" + gameIdentityModalState.shape;
    }
    if (wrap) {
      wrap.className = "game-icon-crop-wrap game-icon-crop-wrap-" + gameIdentityModalState.shape;
    }
  }

  function updateGameIdentityLivePreview() {
    const box = document.getElementById("gameIdentityLivePreview");
    if (!box) return;
    const nameInput = document.getElementById("gameIdentityName");
    const subInput = document.getElementById("gameIdentitySubtitle");
    const draft = {
      name: (nameInput && nameInput.value.trim()) || "Game",
      subtitle: (subInput && subInput.value.trim()) || "",
      iconShape: gameIdentityModalState.shape,
      iconImage: null,
    };
    if (!gameIdentityModalState.clearIcon) {
      if (gameIdentityModalState.sourceImg) {
        draft.iconImage = exportGameIdentityCropDataUrl(96) || null;
      } else {
        const game = getGame(gameIdentityModalState.gameId);
        if (game && game.iconImage) draft.iconImage = game.iconImage;
      }
    }
    box.innerHTML = "";
    const label = document.createElement("div");
    label.className = "game-identity-preview-label";
    label.textContent = "Preview";
    box.appendChild(label);
    box.appendChild(buildGameIdentityHeader(draft, { className: "games-selected-identity", showPlaceholder: true }));
  }

  function drawGameIdentityCrop() {
    const canvas = document.getElementById("gameIdentityCropCanvas");
    const empty = document.getElementById("gameIdentityCropEmpty");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    const img = gameIdentityModalState.sourceImg;
    if (!img) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    const base = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const scale = base * gameIdentityModalState.zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const x = (w - drawW) / 2 + gameIdentityModalState.panX;
    const y = (h - drawH) / 2 + gameIdentityModalState.panY;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, drawW, drawH);
  }

  function exportGameIdentityCropDataUrl(outSize) {
    const img = gameIdentityModalState.sourceImg;
    if (!img) return null;
    const stage = 280;
    const size = outSize || 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const base = Math.max(stage / img.naturalWidth, stage / img.naturalHeight);
    const scale = base * gameIdentityModalState.zoom;
    const drawW = img.naturalWidth * scale * (size / stage);
    const drawH = img.naturalHeight * scale * (size / stage);
    const x = (size - drawW) / 2 + gameIdentityModalState.panX * (size / stage);
    const y = (size - drawH) / 2 + gameIdentityModalState.panY * (size / stage);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, drawW, drawH);
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  function loadGameIdentitySourceFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        gameIdentityModalState.sourceImg = img;
        gameIdentityModalState.zoom = 1;
        gameIdentityModalState.panX = 0;
        gameIdentityModalState.panY = 0;
        gameIdentityModalState.clearIcon = false;
        const zoom = document.getElementById("gameIdentityZoom");
        if (zoom) zoom.value = "1";
        drawGameIdentityCrop();
        updateGameIdentityLivePreview();
        resolve();
      };
      img.onerror = () => reject(new Error("Could not load image."));
      img.src = url;
    });
  }

  async function openGameIdentityModal(gameId) {
    const game = getGame(gameId);
    if (!game) return;
    gameIdentityModalState.gameId = gameId;
    gameIdentityModalState.shape = (game.iconShape === "circle" || game.iconShape === "square") ? game.iconShape : "rounded";
    gameIdentityModalState.clearIcon = false;
    gameIdentityModalState.sourceImg = null;
    const nameInput = document.getElementById("gameIdentityName");
    const subInput = document.getElementById("gameIdentitySubtitle");
    if (nameInput) nameInput.value = game.name || "";
    if (subInput) subInput.value = game.subtitle || "";
    syncGameIdentityShapeButtons();
    drawGameIdentityCrop();
    if (game.iconImage) {
      try {
        await loadGameIdentitySourceFromUrl(game.iconImage);
      } catch (_) {
        updateGameIdentityLivePreview();
      }
    } else {
      const empty = document.getElementById("gameIdentityCropEmpty");
      if (empty) empty.hidden = false;
      updateGameIdentityLivePreview();
    }
    setGameIdentityModalOpen(true);
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function initGameIdentityModal() {
    const modalEl = document.getElementById("gameIdentityModal");
    const form = document.getElementById("gameIdentityForm");
    const closeBtn = document.getElementById("gameIdentityModalClose");
    const cancelBtn = document.getElementById("gameIdentityModalCancel");
    const chooseBtn = document.getElementById("gameIdentityChooseIconBtn");
    const clearBtn = document.getElementById("gameIdentityClearIconBtn");
    const fileInput = document.getElementById("gameIdentityIconFile");
    const zoom = document.getElementById("gameIdentityZoom");
    const canvas = document.getElementById("gameIdentityCropCanvas");
    const nameInput = document.getElementById("gameIdentityName");
    const subInput = document.getElementById("gameIdentitySubtitle");
    if (!modalEl || !form) return;

    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeGameIdentityModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeGameIdentityModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeGameIdentityModal);
    document.addEventListener("keydown", (e) => {
      if (!gameIdentityModalState.open) return;
      if (e.key === "Escape") closeGameIdentityModal();
    });

    document.querySelectorAll(".game-icon-shape-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        gameIdentityModalState.shape = btn.dataset.shape || "rounded";
        syncGameIdentityShapeButtons();
        updateGameIdentityLivePreview();
      });
    });

    if (chooseBtn && fileInput) {
      chooseBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        try {
          const dataUrl = await compressImageFileToDataUrl(file, { maxWidth: 1200, quality: 0.92 });
          await loadGameIdentitySourceFromUrl(dataUrl);
        } catch (err) {
          alert((err && err.message) || "Could not use that image.");
        }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        gameIdentityModalState.sourceImg = null;
        gameIdentityModalState.clearIcon = true;
        gameIdentityModalState.zoom = 1;
        gameIdentityModalState.panX = 0;
        gameIdentityModalState.panY = 0;
        if (zoom) zoom.value = "1";
        drawGameIdentityCrop();
        updateGameIdentityLivePreview();
      });
    }
    if (zoom) {
      zoom.addEventListener("input", () => {
        gameIdentityModalState.zoom = Number(zoom.value) || 1;
        drawGameIdentityCrop();
        updateGameIdentityLivePreview();
      });
    }
    if (nameInput) nameInput.addEventListener("input", updateGameIdentityLivePreview);
    if (subInput) subInput.addEventListener("input", updateGameIdentityLivePreview);

    if (canvas) {
      const onDown = (clientX, clientY) => {
        if (!gameIdentityModalState.sourceImg) return;
        gameIdentityModalState.dragging = true;
        gameIdentityModalState.dragStartX = clientX;
        gameIdentityModalState.dragStartY = clientY;
        gameIdentityModalState.panStartX = gameIdentityModalState.panX;
        gameIdentityModalState.panStartY = gameIdentityModalState.panY;
      };
      const onMove = (clientX, clientY) => {
        if (!gameIdentityModalState.dragging) return;
        gameIdentityModalState.panX = gameIdentityModalState.panStartX + (clientX - gameIdentityModalState.dragStartX);
        gameIdentityModalState.panY = gameIdentityModalState.panStartY + (clientY - gameIdentityModalState.dragStartY);
        drawGameIdentityCrop();
      };
      const onUp = () => {
        if (!gameIdentityModalState.dragging) return;
        gameIdentityModalState.dragging = false;
        updateGameIdentityLivePreview();
      };
      canvas.addEventListener("mousedown", (e) => {
        e.preventDefault();
        onDown(e.clientX, e.clientY);
      });
      window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
      window.addEventListener("mouseup", onUp);
      canvas.addEventListener("touchstart", (e) => {
        if (!e.touches || !e.touches[0]) return;
        onDown(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      canvas.addEventListener("touchmove", (e) => {
        if (!e.touches || !e.touches[0]) return;
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });
      canvas.addEventListener("touchend", onUp);
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const game = getGame(gameIdentityModalState.gameId);
      if (!game) return;
      const name = nameInput && nameInput.value.trim();
      if (!name) {
        if (nameInput) nameInput.focus();
        return;
      }
      game.name = name;
      const sub = subInput && subInput.value.trim();
      if (sub) game.subtitle = sub;
      else delete game.subtitle;
      game.iconShape = gameIdentityModalState.shape;
      if (gameIdentityModalState.clearIcon) {
        delete game.iconImage;
      } else if (gameIdentityModalState.sourceImg) {
        const cropped = exportGameIdentityCropDataUrl(256);
        if (cropped) game.iconImage = cropped;
      }
      save();
      closeGameIdentityModal();
      renderActiveTab();
    });
  }

  function renderGames() {
    const container = document.getElementById("gamesContainer");
    if (!container) return;
    container.innerHTML = "";
    const games = getAllGames();
    if (games.length === 0) {
      container.innerHTML = '<p class="empty-state">No games yet. Add one using "+ Add game" in the sidebar.</p>';
      return;
    }
    const selected = getGame(state.gamesSelectedId) || games[0];
    const titleRow = document.createElement("div");
    titleRow.className = "games-title-row";
    const identity = buildGameIdentityHeader(selected, {
      className: "games-selected-identity",
      showPlaceholder: true,
      interactive: true,
    });
    identity.addEventListener("click", () => openGameIdentityModal(selected.id));
    identity.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openGameIdentityModal(selected.id);
      }
    });
    titleRow.appendChild(identity);

    const actions = document.createElement("div");
    actions.className = "games-title-actions";
    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = "btn btn-ghost games-sync-btn";
    syncBtn.textContent = "Sync with Calendar";
    syncBtn.setAttribute("aria-label", "Sync all tasks from calendar history");
    syncBtn.title = "Update Completed/Attempted for all tasks from calendar history";
    bindSyncButton(syncBtn, () => {
      syncAllTasksForGame(selected);
    });
    actions.appendChild(syncBtn);
    const clearDataBtn = document.createElement("button");
    clearDataBtn.type = "button";
    clearDataBtn.className = "btn btn-ghost games-clear-data-btn";
    clearDataBtn.textContent = "Clear Data";
    clearDataBtn.setAttribute("aria-label", "Clear all attempts and completions for this game");
    clearDataBtn.title = "Reset all attempts and completions to zero";
    clearDataBtn.addEventListener("click", () => openClearGameDataModal(selected.id));
    actions.appendChild(clearDataBtn);
    const deleteGameBtn = document.createElement("button");
    deleteGameBtn.type = "button";
    deleteGameBtn.className = "btn btn-ghost games-delete-btn";
    deleteGameBtn.textContent = "Delete game";
    deleteGameBtn.addEventListener("click", () => deleteGame(selected.id));
    actions.appendChild(deleteGameBtn);
    titleRow.appendChild(actions);
    container.appendChild(titleRow);
    const titleSep = document.createElement("div");
    titleSep.className = "games-separator";
    container.appendChild(titleSep);
    const subTabs = document.createElement("div");
    subTabs.className = "games-sub-tabs";
    ["dailies", "weeklies", "endgame", "extracurricular", "currency"].forEach((sub) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "games-sub-tab" + (state.gamesSubTab === sub ? " active" : "");
      btn.textContent = sub === "currency" ? "Currency" : sub.charAt(0).toUpperCase() + sub.slice(1);
      btn.addEventListener("click", () => {
        state.gamesSubTab = sub;
        renderGames();
      });
      subTabs.appendChild(btn);
    });
    container.appendChild(subTabs);
    const content = document.createElement("div");
    content.className = "games-content";
    if (state.gamesSubTab === "dailies") {
      const serverRow = document.createElement("div");
      serverRow.className = "endgame-currency-row endgame-currency-row-with-desc";
      serverRow.innerHTML = "<label>Server</label>";
      const serverInner = document.createElement("div");
      serverInner.className = "endgame-currency-row-inner";
      const serverSelect = document.createElement("select");
      serverSelect.className = "settings-select";
      SERVER_OPTIONS.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.id;
        o.textContent = opt.label + " (" + (opt.offsetMinutes >= 0 ? "UTC+" : "UTC") + (opt.offsetMinutes / 60) + ")";
        serverSelect.appendChild(o);
      });
      serverSelect.value = selected.server && ["america", "asia", "europe"].includes(selected.server) ? selected.server : "america";
      serverSelect.addEventListener("change", () => {
        selected.server = serverSelect.value;
        save();
        renderActiveTab();
      });
      const serverDesc = document.createElement("span");
      serverDesc.className = "endgame-currency-desc";
      serverDesc.textContent = "Reset is 4am server time (3am when DST inactive). Your display timezone shifts the shown time.";
      serverInner.appendChild(serverSelect);
      serverInner.appendChild(serverDesc);
      serverRow.appendChild(serverInner);
      content.appendChild(serverRow);

      const resetRow = document.createElement("div");
      resetRow.className = "endgame-currency-row";
      resetRow.innerHTML = "<label>Daily reset time</label>";
      const resetInput = document.createElement("input");
      resetInput.type = "time";
      resetInput.step = "60";
      const h = Number.isFinite(selected.resetHour) ? selected.resetHour : 4;
      const m = Number.isFinite(selected.resetMinute) ? selected.resetMinute : 0;
      resetInput.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
      resetInput.addEventListener("change", () => {
        const [hh, mm] = (resetInput.value || "04:00").split(":").map(Number);
        selected.resetHour = hh;
        selected.resetMinute = mm;
        save();
        renderActiveTab();
      });
      resetRow.appendChild(resetInput);
      content.appendChild(resetRow);

      const dstRow = document.createElement("div");
      dstRow.className = "endgame-currency-row endgame-currency-row-with-desc";
      dstRow.innerHTML = "<label>Adjust for DST</label>";
      const dstInner = document.createElement("div");
      dstInner.className = "endgame-currency-row-inner";
      const dstToggle = document.createElement("input");
      dstToggle.type = "checkbox";
      dstToggle.className = "dst-toggle";
      dstToggle.checked = selected.adjustForDST !== false;
      dstToggle.setAttribute("aria-label", "Adjust reset time for daylight saving");
      dstToggle.addEventListener("change", () => {
        selected.adjustForDST = dstToggle.checked;
        save();
        renderActiveTab();
      });
      const dstDesc = document.createElement("span");
      dstDesc.className = "endgame-currency-desc";
      dstDesc.textContent = "When on, reset shifts from 4am to 3am when DST is inactive (after first Sunday of November).";
      dstInner.appendChild(dstToggle);
      dstInner.appendChild(dstDesc);
      dstRow.appendChild(dstInner);
      content.appendChild(dstRow);

      const row = document.createElement("div");
      row.className = "endgame-currency-row";
      row.innerHTML = "<label>Daily currency (potential)</label>";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.placeholder = "0";
      input.value = String(Math.max(0, Number(selected.dailyCurrency) || 0));
      input.addEventListener("change", () => {
        selected.dailyCurrency = Math.max(0, Number(input.value) || 0);
        save();
        renderActiveTab();
      });
      row.appendChild(input);
      content.appendChild(row);

      const changerRow = document.createElement("div");
      changerRow.className = "endgame-currency-row games-changer-row";
      changerRow.innerHTML = "<label>Completed amount:</label>";
      const changerInput = document.createElement("input");
      changerInput.type = "number";
      changerInput.min = "0";
      changerInput.placeholder = "0";
      changerInput.value = String(getCompletedAmount(state.dailiesCompleted, selected.id));
      changerInput.addEventListener("change", () => {
        const old = getCompletedAmount(state.dailiesCompleted, selected.id);
        const v = Math.max(0, Number(changerInput.value) || 0);
        if (v === old) return;
        state.dailiesCompleted[selected.id] = v;
        const dateStr = getDailyPeriodDateStr(selected, getSimulatedNow());
        // Tallies are set explicitly above; write path only syncs calendar/timestamp.
        if (v) applyTaskCompletion("dailies", selected.id, { dateStr, updateTallies: false });
        else removeTaskCompletion("dailies", selected.id, { dateStr, updateTallies: false });
      });
      changerRow.appendChild(changerInput);
      content.appendChild(changerRow);

      const attemptRow = document.createElement("div");
      attemptRow.className = "endgame-currency-row games-changer-row";
      attemptRow.innerHTML = "<label>Amount attempted:</label>";
      const attemptInput = document.createElement("input");
      attemptInput.type = "number";
      attemptInput.min = "0";
      attemptInput.placeholder = "0";
      attemptInput.value = String(getAttemptedAmount(state.dailiesAttempted, selected.id));
      attemptInput.addEventListener("change", () => setDailiesAttempted(selected.id, attemptInput.value));
      attemptRow.appendChild(attemptInput);
      content.appendChild(attemptRow);

      const countingRow = document.createElement("div");
      countingRow.className = "endgame-currency-row games-changer-row";
      appendCountingSinceTag(countingRow, selected, "dailies", selected.id);
      content.appendChild(countingRow);

      const syncRow = document.createElement("div");
      syncRow.className = "endgame-currency-row games-changer-row";
      const syncBtn = document.createElement("button");
      syncBtn.type = "button";
      syncBtn.className = "btn btn-ghost";
      syncBtn.textContent = "Sync with Calendar";
      syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
      bindSyncButton(syncBtn, () => syncTaskWithCalendar(selected, "dailies", selected.id));
      syncRow.appendChild(syncBtn);
      content.appendChild(syncRow);
    } else if (state.gamesSubTab === "extracurricular") {
      const gameTasks = (state.extracurricularTasks || []).filter((t) => t.gameId === selected.id);
      const activeTasks = sortExtracurricularByDueDate(gameTasks.filter((t) => !isExtracurricularArchived(t)));
      const archivedTasks = gameTasks.filter((t) => isExtracurricularArchived(t));
      if (gameTasks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No extracurricular tasks associated with this game. Add tasks in the Extracurricular section and link them to this game.";
        content.appendChild(empty);
      } else {
        const section = document.createElement("div");
        section.className = "games-extracurricular-section";
        if (activeTasks.length > 0) {
          const activeLabel = document.createElement("p");
          activeLabel.className = "games-extracurricular-section-label";
          activeLabel.textContent = "Active";
          section.appendChild(activeLabel);
          const activeList = document.createElement("div");
          activeList.className = "task-grid task-grid-knot";
          activeList.dataset.masonryMax = "3";
          activeTasks.forEach((task) => activeList.appendChild(buildExtracurricularTaskItem(task, "div", { surface: "board" })));
          section.appendChild(activeList);
          scheduleTaskMasonry(activeList);
        }
        if (archivedTasks.length > 0) {
          const archivedLabel = document.createElement("p");
          archivedLabel.className = "games-extracurricular-section-label";
          archivedLabel.textContent = "History";
          archivedLabel.style.marginTop = "1rem";
          section.appendChild(archivedLabel);
          const archivedList = document.createElement("div");
          archivedList.className = "task-grid task-grid-knot";
          archivedList.dataset.masonryMax = "3";
          archivedTasks.forEach((task) => archivedList.appendChild(buildExtracurricularTaskItem(task, "div", { surface: "board" })));
          section.appendChild(archivedList);
          scheduleTaskMasonry(archivedList);
        }
        content.appendChild(section);
      }
    } else if (state.gamesSubTab === "currency") {
      const nameRow = document.createElement("div");
      nameRow.className = "endgame-currency-row";
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Currency name";
      const infoIcon = document.createElement("span");
      infoIcon.className = "currency-info-icon";
      infoIcon.setAttribute("aria-label", "More information");
      infoIcon.title = "Currency name is used in the Data section. If left empty, \"Currency\" is used. Currency per pull converts earned amounts to pulls.";
      infoIcon.textContent = "ⓘ";
      nameLabel.appendChild(infoIcon);
      nameRow.appendChild(nameLabel);
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "e.g. Gems, Primogems (optional)";
      nameInput.value = String(selected.currencyName || "");
      nameInput.addEventListener("change", () => {
        selected.currencyName = (nameInput.value || "").trim();
        save();
        renderActiveTab();
      });
      nameRow.appendChild(nameInput);
      content.appendChild(nameRow);

      const pullRow = document.createElement("div");
      pullRow.className = "endgame-currency-row";
      pullRow.innerHTML = "<label>Currency per pull</label>";
      const pullInput = document.createElement("input");
      pullInput.type = "number";
      pullInput.min = "0";
      pullInput.placeholder = "0";
      pullInput.value = String(Math.max(0, Number(selected.currencyPerPull) || 0));
      pullInput.addEventListener("change", () => {
        selected.currencyPerPull = Math.max(0, Number(pullInput.value) || 0);
        save();
        renderActiveTab();
      });
      pullRow.appendChild(pullInput);
      content.appendChild(pullRow);

      const calcRow = document.createElement("div");
      calcRow.className = "endgame-currency-row";
      const calcLabel = document.createElement("label");
      calcLabel.textContent = "Pulls Calculator";
      const calcInfoIcon = document.createElement("span");
      calcInfoIcon.className = "currency-info-icon";
      calcInfoIcon.setAttribute("aria-label", "More information");
      calcInfoIcon.title = "This does not affect anything, it's just a simple calculator.";
      calcInfoIcon.textContent = "ⓘ";
      calcLabel.appendChild(calcInfoIcon);
      calcRow.appendChild(calcLabel);
      const calcWrap = document.createElement("div");
      calcWrap.className = "pulls-calc-wrap";
      const calcInput = document.createElement("input");
      calcInput.type = "number";
      calcInput.min = "0";
      calcInput.placeholder = "Currency amount";
      calcInput.className = "pulls-calc-input";
      const calcResult = document.createElement("span");
      calcResult.className = "pulls-calc-result";
      const updatePulls = () => {
        const cpp = Math.max(1, Number(selected.currencyPerPull) || 1);
        const amt = Math.max(0, Number(calcInput.value) || 0);
        const pulls = amt / cpp;
        calcResult.textContent = amt > 0 ? "≈ " + pulls.toFixed(1) + " pulls" : "—";
      };
      calcInput.addEventListener("input", updatePulls);
      pullInput.addEventListener("input", () => { updatePulls(); });
      calcWrap.appendChild(calcInput);
      calcWrap.appendChild(calcResult);
      calcRow.appendChild(calcWrap);
      content.appendChild(calcRow);
    } else if (state.gamesSubTab === "weeklies") {
      const list = selected.weeklies || [];
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-add";
      addBtn.textContent = "+ Add weekly task";
      addBtn.addEventListener("click", () => {
        openTaskModal({ gameId: selected.id, taskType: "weeklies", task: null });
      });
      content.appendChild(addBtn);
      const ul = document.createElement("ul");
      ul.className = "task-list";
      (list || []).forEach((t) => {
        const built = createGamesManagedTaskCard(selected, t, "weeklies");
        const li = built.li;
        const main = built.main;
        const key = built.key;

        const changerRow = document.createElement("div");
        changerRow.className = "games-changer-row";
        changerRow.innerHTML = "<label>Completed amount:</label>";
        const changerInput = document.createElement("input");
        changerInput.type = "number";
        changerInput.min = "0";
        changerInput.placeholder = "0";
        changerInput.value = String(getCompletedAmount(state.weekliesCompleted, key));
        changerInput.addEventListener("change", () => {
          const old = getCompletedAmount(state.weekliesCompleted, key);
          const v = Math.max(0, Number(changerInput.value) || 0);
          if (v === old) return;
          state.weekliesCompleted[key] = v;
          save();
          renderActiveTab();
        });
        changerRow.appendChild(changerInput);
        main.appendChild(changerRow);

        const attemptRow = document.createElement("div");
        attemptRow.className = "games-changer-row";
        attemptRow.innerHTML = "<label>Amount attempted:</label>";
        const attemptInput = document.createElement("input");
        attemptInput.type = "number";
        attemptInput.min = "0";
        attemptInput.placeholder = "0";
        attemptInput.value = String(getAttemptedAmount(state.weekliesAttempted, key));
        attemptInput.addEventListener("change", () => setWeekliesAttempted(selected.id, t.id || t.label, attemptInput.value));
        attemptRow.appendChild(attemptInput);
        main.appendChild(attemptRow);

        const historyRow = document.createElement("div");
        historyRow.className = "games-changer-row";
        const historyBtn = document.createElement("button");
        historyBtn.type = "button";
        historyBtn.className = "btn btn-ghost";
        historyBtn.textContent = "Completion History";
        historyBtn.addEventListener("click", () => openEarningsModal(selected.id, t, "weeklies"));
        historyRow.appendChild(historyBtn);
        main.appendChild(historyRow);

        const syncRow = document.createElement("div");
        syncRow.className = "games-changer-row";
        const syncBtn = document.createElement("button");
        syncBtn.type = "button";
        syncBtn.className = "btn btn-ghost";
        syncBtn.textContent = "Sync with Calendar";
        syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
        bindSyncButton(syncBtn, () => syncTaskWithCalendar(selected, "weeklies", key));
        syncRow.appendChild(syncBtn);
        main.appendChild(syncRow);

        appendGamesTaskBottom(main, selected, t, "weeklies", "Potential: " + getWeeklyPotential(t));
        ul.appendChild(li);
      });
      content.appendChild(ul);
    } else {
      const list = selected.endgame || [];
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-add";
      addBtn.textContent = "+ Add endgame task";
      addBtn.addEventListener("click", () => {
        openTaskModal({ gameId: selected.id, taskType: "endgame", task: null });
      });
      content.appendChild(addBtn);
      const ul = document.createElement("ul");
      ul.className = "task-list";
      (list || []).forEach((t) => {
        const built = createGamesManagedTaskCard(selected, t, "endgame");
        const li = built.li;
        const main = built.main;
        const key = built.key;

        const changerRow = document.createElement("div");
        changerRow.className = "games-changer-row";
        changerRow.innerHTML = "<label>Completed amount:</label>";
        const changerInput = document.createElement("input");
        changerInput.type = "number";
        changerInput.min = "0";
        changerInput.placeholder = "0";
        changerInput.value = String(getCompletedAmount(state.endgameCompleted, key));
        changerInput.addEventListener("change", () => {
          const old = getCompletedAmount(state.endgameCompleted, key);
          const v = Math.max(0, Number(changerInput.value) || 0);
          if (v === old) return;
          state.endgameCompleted[key] = v;
          ensureEndgameEarnedArrayLength(selected.id, t.id || t.label, v);
          if (v > old) {
            const pot = getEndgamePotential(t);
            for (let i = old; i < v; i++) snapshotEndgamePotentialAt(selected.id, t.id || t.label, i, pot, { skipSave: true, skipRender: true });
          } else if (v < old) {
            ensureEndgamePotentialArrayLength(selected.id, t.id || t.label, getAttemptedAmount(state.endgameAttempted, key));
          }
          save();
          renderActiveTab();
        });
        changerRow.appendChild(changerInput);
        main.appendChild(changerRow);

        const attemptRow = document.createElement("div");
        attemptRow.className = "games-changer-row";
        attemptRow.innerHTML = "<label>Amount attempted:</label>";
        const attemptInput = document.createElement("input");
        attemptInput.type = "number";
        attemptInput.min = "0";
        attemptInput.placeholder = "0";
        attemptInput.value = String(getAttemptedAmount(state.endgameAttempted, key));
        attemptInput.addEventListener("change", () => setEndgameAttempted(selected.id, t.id || t.label, attemptInput.value));
        attemptRow.appendChild(attemptInput);
        main.appendChild(attemptRow);

        const earningsRow = document.createElement("div");
        earningsRow.className = "games-changer-row";
        const earningsBtn = document.createElement("button");
        earningsBtn.type = "button";
        earningsBtn.className = "btn btn-ghost";
        earningsBtn.textContent = "Completion History";
        earningsBtn.addEventListener("click", () => openEarningsModal(selected.id, t, "endgame"));
        earningsRow.appendChild(earningsBtn);
        main.appendChild(earningsRow);

        const syncRow = document.createElement("div");
        syncRow.className = "games-changer-row";
        const syncBtn = document.createElement("button");
        syncBtn.type = "button";
        syncBtn.className = "btn btn-ghost";
        syncBtn.textContent = "Sync with Calendar";
        syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
        bindSyncButton(syncBtn, () => syncTaskWithCalendar(selected, "endgame", key));
        syncRow.appendChild(syncBtn);
        main.appendChild(syncRow);

        appendGamesTaskBottom(main, selected, t, "endgame", "Potential: " + getEndgamePotential(t));
        ul.appendChild(li);
      });
      content.appendChild(ul);
    }
    container.appendChild(content);
  }


  function renderHome() {
    const container = document.getElementById("homeContainer");
    if (!container) return;
    container.innerHTML = "";
    const games = getAllGames();
    const todayStr = getDateStr();
    const now = getSimulatedNow();
    const dDone = games.filter((g) => g.dailies && (state.completionByDate[getDailyPeriodDateStr(g, now)] || {}).dailies?.includes(g.id)).length;
    const available = getTasksAvailableOnDate(todayStr);
    const dTotal = Math.max(1, games.filter((g) => g.dailies).length);
    const weekliesList = available.weeklies || [];
    const wTotal = Math.max(1, weekliesList.length);
    const wDone = weekliesList.filter((item) => isWeeklyCompletedInCurrentCycle(item.key, todayStr)).length;
    const endgameList = available.endgame || [];
    const eTotal = Math.max(1, endgameList.length);
    const eDone = endgameList.filter((item) => isEndgameCompletedInCurrentCycle(item.key, todayStr)).length;

    const section = document.createElement("div");
    section.className = "home-dwe-progress";
    const heading = document.createElement("p");
    heading.className = "home-welcome";
    heading.textContent = "Today's progress";
    section.appendChild(heading);

    const barsWrap = document.createElement("div");
    barsWrap.className = "home-dwe-bars";

    function addBar(label, done, total) {
      const block = document.createElement("div");
      block.className = "home-dwe-bar-block";
      const title = document.createElement("div");
      title.className = "home-dwe-bar-label";
      title.textContent = label + " " + done + "/" + total;
      block.appendChild(title);
      const track = document.createElement("div");
      track.className = "home-dwe-bar-track";
      const fill = document.createElement("div");
      fill.className = "home-dwe-bar-fill";
      fill.style.width = total ? (100 * done / total) + "%" : "0%";
      track.appendChild(fill);
      block.appendChild(track);
      barsWrap.appendChild(block);
    }

    addBar("Dailies", dDone, dTotal);
    addBar("Weeklies", wDone, wTotal);
    addBar("Endgame", eDone, eTotal);

    section.appendChild(barsWrap);
    container.appendChild(section);

    // DWE checklist: incomplete first (by due date), completed at end
    const checklistItems = [];
    games.forEach((game, gameIdx) => {
      if (game.dailies) {
        const periodStr = getDailyPeriodDateStr(game, now);
        const completed = (state.completionByDate[periodStr] || {}).dailies?.includes(game.id);
        checklistItems.push({
          type: "dailies",
          key: game.id,
          gameId: game.id,
          taskId: null,
          label: (game.name || game.id),
          dueMs: now.getTime() + getDailyTimeRemainingMs(game, now),
          gameOrder: gameIdx,
          taskOrder: 0,
          completed
        });
      }
      (game.weeklies || []).forEach((task, taskIdx) => {
        if (isWeeklyAvailableOnDate(task, now, game)) {
          const key = game.id + "." + (task.id || task.label);
          checklistItems.push({
            type: "weeklies",
            key,
            gameId: game.id,
            taskId: task.id || task.label,
            label: (game.name || game.id) + " — " + (task.label || "Weekly"),
            dueMs: now.getTime() + getWeeklyTimeRemainingMs(task, now, game),
            gameOrder: gameIdx,
            taskOrder: taskIdx,
            completed: isWeeklyCompletedInCurrentCycle(key, todayStr)
          });
        }
      });
      (game.endgame || []).forEach((task, taskIdx) => {
        if (isEndgameAvailableOnDate(task, now, game)) {
          const key = game.id + "." + (task.id || task.label);
          checklistItems.push({
            type: "endgame",
            key,
            gameId: game.id,
            taskId: task.id || task.label,
            label: (game.name || game.id) + " — " + (task.label || "Endgame"),
            dueMs: now.getTime() + getEndgameTimeRemainingMs(task, now, game),
            gameOrder: gameIdx,
            taskOrder: taskIdx,
            completed: isEndgameCompletedInCurrentCycle(key, todayStr)
          });
        }
      });
    });
    const sortItems = (a, b) => {
      if (a.completed !== b.completed) return (a.completed ? 1 : 0) - (b.completed ? 1 : 0);
      if (a.dueMs !== b.dueMs) return a.dueMs - b.dueMs;
      if (a.gameOrder !== b.gameOrder) return a.gameOrder - b.gameOrder;
      return a.taskOrder - b.taskOrder;
    };
    const dailiesItems = checklistItems.filter((i) => i.type === "dailies").sort(sortItems);
    const weekliesItems = checklistItems.filter((i) => i.type === "weeklies").sort(sortItems);
    const endgameItems = checklistItems.filter((i) => i.type === "endgame").sort(sortItems);

    const extracurricularItems = (state.extracurricularTasks || []).filter((task) => {
      if (isExtracurricularArchived(task)) return false;
      if (!task.startDate) return false;
      if (todayStr < task.startDate) return false;
      if (task.endDateTBD) return true;
      if (!task.endDate) return true;
      return todayStr <= task.endDate;
    }).sort((a, b) => {
      const aTbd = !!a.endDateTBD || !a.endDate;
      const bTbd = !!b.endDateTBD || !b.endDate;
      if (aTbd !== bTbd) return aTbd ? 1 : -1;
      if (aTbd) return 0;
      const aEnd = (a.endDate || "").localeCompare(b.endDate || "");
      if (aEnd !== 0) return aEnd;
      return (state.extracurricularCompleted[a.id] ? 1 : 0) - (state.extracurricularCompleted[b.id] ? 1 : 0);
    });

    function renderChecklistGrid(items, typeLabel, type) {
      const section = document.createElement("div");
      section.className = "home-dwe-checklist-section";
      const heading = document.createElement("p");
      heading.className = "home-dwe-checklist-section-title";
      heading.textContent = typeLabel;
      section.appendChild(heading);
      const scroll = document.createElement("div");
      scroll.className = "home-dwe-checklist-scroll";
      const grid = document.createElement("div");
      grid.className = "task-grid";
      grid.setAttribute("data-type", type);

      if (type === "extracurricular") {
        items.forEach((task) => {
          const card = buildExtracurricularTaskItemForHome(task, "div");
          grid.appendChild(card);
        });
      } else if (type === "dailies") {
        items.forEach((item) => {
          const game = getGame(item.gameId);
          if (game) grid.appendChild(buildDailyTaskItem(game, "div"));
        });
        requestAnimationFrame(() => {
          syncHomeDailyCardSizes(grid);
          grid.querySelectorAll("img").forEach((img) => {
            if (img.complete) return;
            img.addEventListener("load", () => syncHomeDailyCardSizes(grid), { once: true });
          });
        });
        if (!window.__homeDailyResizeBound) {
          window.__homeDailyResizeBound = true;
          let resizeTimer = 0;
          window.addEventListener("resize", () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
              document.querySelectorAll(".home-dwe-checklist-scroll .task-grid[data-type=\"dailies\"]").forEach((g) => {
                syncHomeDailyCardSizes(g);
              });
            }, 100);
          });
        }
      } else if (type === "weeklies") {
        items.forEach((item) => {
          const game = getGame(item.gameId);
          const task = game && (game.weeklies || []).find((t) => (t.id || t.label) === item.taskId);
          if (game && task) {
            grid.appendChild(buildWeeklyTaskItem(game, task, "div", { surface: "home" }));
          }
        });
      } else if (type === "endgame") {
        items.forEach((item) => {
          const game = getGame(item.gameId);
          const task = game && (game.endgame || []).find((t) => (t.id || t.label) === item.taskId);
          if (game && task) {
            grid.appendChild(buildEndgameTaskItem(game, task, "div", { surface: "home" }));
          }
        });
      }

      if (grid.children.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.style.gridColumn = "1 / -1";
        empty.textContent = "No tasks in this category.";
        grid.appendChild(empty);
      }
      scroll.appendChild(grid);
      section.appendChild(scroll);
      return section;
    }

    const checklistWrap = document.createElement("div");
    checklistWrap.className = "home-dwe-checklist-wrap";
    const checklistHeading = document.createElement("div");
    checklistHeading.className = "home-checklist-heading";
    const checklistTitle = document.createElement("span");
    checklistTitle.className = "home-welcome";
    checklistTitle.textContent = "Checklist";
    checklistHeading.appendChild(checklistTitle);
    const infoIcon = document.createElement("span");
    infoIcon.className = "home-checklist-info-icon";
    infoIcon.setAttribute("aria-label", "Information");
    infoIcon.title = "Tasks are ordered by due date (earliest first). Completed tasks move to the end of each list.";
    infoIcon.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4M12 8h.01\"/></svg>";
    checklistHeading.appendChild(infoIcon);
    checklistWrap.appendChild(checklistHeading);
    checklistWrap.appendChild(renderChecklistGrid(extracurricularItems, "Extracurricular", "extracurricular"));
    checklistWrap.appendChild(renderChecklistGrid(dailiesItems, "Dailies", "dailies"));
    checklistWrap.appendChild(renderChecklistGrid(weekliesItems, "Weeklies", "weeklies"));
    checklistWrap.appendChild(renderChecklistGrid(endgameItems, "Endgame", "endgame"));
    container.appendChild(checklistWrap);
  }


  function renderSharedChrome() {
    setDateLabels();
    renderTabs();
    renderSidebarDataList();
    renderSidebarGamesList();
  }

  function renderActiveTabPanel() {
    switch (state.tab) {
      case "home":
        renderHome();
        break;
      case "dailies":
        renderDailies();
        break;
      case "weeklies":
        renderWeeklies();
        break;
      case "endgame":
        renderEndgame();
        break;
      case "attendance":
        renderAttendance();
        break;
      case "extracurricular":
        renderExtracurricular();
        break;
      case "data":
        renderData();
        break;
      case "games":
        renderGames();
        break;
      case "about":
      default:
        break;
    }
  }

  function renderActiveTab() {
    const run = () => {
      beginTallyCacheFrame();
      try {
        renderSharedChrome();
        renderActiveTabPanel();
      } finally {
        endTallyCacheFrame();
      }
    };
    if (typeof isPerfDebugEnabled === "function" && isPerfDebugEnabled()) {
      perfMeasure("renderActiveTab:" + state.tab, run);
    } else {
      run();
    }
  }

  function renderAll() {
    const run = () => {
      beginTallyCacheFrame();
      try {
        renderSharedChrome();
        renderHome();
        renderDailies();
        renderWeeklies();
        renderEndgame();
        renderAttendance();
        renderExtracurricular();
        renderData();
        renderGames();
      } finally {
        endTallyCacheFrame();
      }
    };
    if (typeof isPerfDebugEnabled === "function" && isPerfDebugEnabled()) {
      perfMeasure("renderAll", run);
    } else {
      run();
    }
  }

  function initTabs() {
    const titleEl = document.getElementById("aboutNavTitle");
    if (titleEl) {
      titleEl.style.cursor = "pointer";
      titleEl.setAttribute("role", "button");
      titleEl.setAttribute("tabindex", "0");
      titleEl.setAttribute("aria-label", "Go to About page");
      titleEl.addEventListener("click", () => {
        state.tab = "about";
        renderActiveTab();
      });
      titleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          state.tab = "about";
          renderActiveTab();
        }
      });
    }
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.dataset.tab;
        if (!t) return;
        state.tab = t;
        const view = btn.dataset.attendanceView;
        const exViewMode = btn.dataset.extracurricularViewMode;
        if (view === "history") {
          state.attendanceView = "history";
          const now = getSimulatedNow();
          if (state.historyMonth == null) state.historyMonth = now.getMonth();
          if (state.historyYear == null) state.historyYear = now.getFullYear();
        } else if (view === "timestamps") {
          state.attendanceView = "timestamps";
        } else if (t === "attendance") {
          state.attendanceView = "weekly";
        }
        if (exViewMode === "history") {
          state.extracurricularViewMode = "history";
        } else if (t === "extracurricular" && !exViewMode) {
          state.extracurricularViewMode = "tasks";
        }
        const runSwitch = () => renderActiveTab();
        if (typeof isPerfDebugEnabled === "function" && isPerfDebugEnabled()) {
          perfMeasure("tabSwitch:" + t, runSwitch);
        } else {
          runSwitch();
        }
      });
    });
  }

  function startApp() {
    if (typeof window.initFirebaseAuth === "function") window.initFirebaseAuth();
    processResets();
    if (state.defaultTab && state.defaultTab !== state.tab) {
      state.tab = state.defaultTab;
    }
    setDateLabels();
    initTabs();
    initTaskModal();
    initManualResetModal();
    initGameModal();
    initGameIdentityModal();
    initDeleteGameModal();
    initDeleteTaskModal();
    initClearGameDataModal();
    initCalendarDayModal();
    initEarningsModal();
    initEndgameCompleteModal();
    initExtracurricularCompleteModal();
    initTimeTrendsDetailModal();
    initAttendanceSkippedModal();
    initClearTimeTrendsModal();
    initSettingsModal();
    initExtracurricularTaskModal();
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== "z") return;
      if (e.altKey || e.shiftKey) return;
      const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable)) return;
      if (typeof canUndoCompletion !== "function" || !canUndoCompletion()) return;
      e.preventDefault();
      const result = undoLastCompletion();
      if (result && result.ok && typeof updateCompletionUndoUI === "function") updateCompletionUndoUI();
    });
    window.addEventListener("beforeunload", () => {
      if (typeof window.flushPendingSave === "function") window.flushPendingSave();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && typeof window.flushPendingSave === "function") {
        window.flushPendingSave();
      }
      // Phase 5: catch up sidebar clock as soon as the tab is focused again.
      if (document.visibilityState === "visible") {
        if (typeof updateSidebarTime === "function") updateSidebarTime();
        if (typeof checkManualResetExpiries === "function") checkManualResetExpiries();
      }
    });
    window.addEventListener("focus", () => {
      if (typeof checkManualResetExpiries === "function") checkManualResetExpiries();
    });
    setInterval(() => {
      const changed = processResets();
      updateTaskRemainingTexts();
      if (changed) renderActiveTab();
      if (typeof checkManualResetExpiries === "function") checkManualResetExpiries();
    }, 60000);
    // Pause sidebar clock while the page is in a background tab (saves work; resets timer unchanged).
    setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      updateSidebarTime();
    }, 1000);

    // Games banners switch home↔games crop at the hamburger breakpoint.
    try {
      const gamesBannerMq = window.matchMedia("(max-width: 768px)");
      const onGamesBannerModeChange = () => {
        if (state.tab === "games") renderActiveTab();
      };
      if (gamesBannerMq.addEventListener) gamesBannerMq.addEventListener("change", onGamesBannerModeChange);
      else if (gamesBannerMq.addListener) gamesBannerMq.addListener(onGamesBannerModeChange);
    } catch (_) {}

    // Cold start: active tab + chrome only. Full renderAll stays for import/repair/cloud/dev skips.
    renderActiveTab();
    if (typeof checkManualResetExpiries === "function") checkManualResetExpiries();

    // Opt-in live probe surface for localhost regression (URL: ?liveProbe=1).
    if (typeof location !== "undefined" && /(?:\?|&)liveProbe=1(?:&|$)/.test(String(location.search || ""))) {
      window.__gachaLiveProbe = {
        ready: true,
        getStateSnapshot() {
          return JSON.parse(
            JSON.stringify({
              games: state.games,
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
              simulatedDateOffset: state.simulatedDateOffset || 0,
              simulatedHourOffset: state.simulatedHourOffset || 0,
              tab: state.tab,
            })
          );
        },
        loadStateSnapshot(snap) {
          if (!snap || typeof snap !== "object") return false;
          [
            "games",
            "completionByDate",
            "completionTimestamps",
            "dailiesCompleted",
            "weekliesCompleted",
            "endgameCompleted",
            "dailiesAttempted",
            "weekliesAttempted",
            "endgameAttempted",
            "lastProcessedResets",
            "endgameCurrencyEarned",
            "endgameCurrencyPotential",
            "endgameCompletionDates",
          ].forEach((k) => {
            if (snap[k] !== undefined) state[k] = snap[k];
          });
          state.simulatedDateOffset = snap.simulatedDateOffset || 0;
          state.simulatedHourOffset = snap.simulatedHourOffset || 0;
          if (!state.lastProcessedResets || typeof state.lastProcessedResets !== "object") {
            state.lastProcessedResets = { dailies: {}, weeklies: {}, endgame: {} };
          } else {
            if (!state.lastProcessedResets.dailies) state.lastProcessedResets.dailies = {};
            if (!state.lastProcessedResets.weeklies) state.lastProcessedResets.weeklies = {};
            if (!state.lastProcessedResets.endgame) state.lastProcessedResets.endgame = {};
          }
          if (!state.completionByDate) state.completionByDate = {};
          if (!Array.isArray(state.completionTimestamps)) state.completionTimestamps = [];
          if (snap.tab) state.tab = snap.tab;
          if (typeof save === "function") save({ immediate: true });
          if (typeof renderAll === "function") renderAll();
          return true;
        },
        applyTaskCompletion,
        removeTaskCompletion,
        getRemainingDatesInCycleFrom,
        getCalendarDatesInCycleRange,
        getWeeklyCycleBoundsForMoment,
        getEndgameCycleBoundsForMoment,
        getTaskPeriodDateStr,
        getTasksAvailableOnDate,
        isWeeklyAvailableOnDate,
        isWeeklyAvailableOnCalendarDate,
        isEndgameAvailableOnCalendarDate,
        isCompletedInCycleForDate,
        isWeeklyCompletedInCurrentCycle,
        isEndgameCompletedInCurrentCycle,
        getGame,
        getAllGames,
        cleanupCycleBoundaryBleedMarks,
        processResets,
        scanDataConflicts,
        listBeforeUnlockConflicts,
        applyDebugBeforeUnlockEdits,
        listTimeDateFixQueue,
        applyDebugTimeDateFixes,
        getDateStr,
        getSimulatedNow,
        getPeriodDateStrForReset,
        getCycleMembershipMoment,
        toggleWeekly,
        toggleEndgame,
        completeEndgameWithCurrency,
        recordCompletion,
        unrecordCompletion,
      };
    }
  }

  function bootApp() {
    const finish = () => {
      try {
        startApp();
      } catch (err) {
        console.error(err);
      }
    };
    if (typeof initPersistentStorage === "function") {
      initPersistentStorage().then(finish).catch(() => {
        try { load(); } catch (_) {}
        finish();
      });
    } else {
      load();
      finish();
    }
  }

  bootApp();
})();

/**
 * Mobile / narrow layout integration.
 * - ≤1100px: right sidebar hidden → Settings clone in the top bar (CSS).
 * - ≤768px: off-canvas left nav + hamburger/overlay.
 */
(function () {
  "use strict";

  const MOBILE_BREAKPOINT = 768;
  const BODY_CLASS_OPEN = "mobile-sidebar-open";
  const BODY_CLASS_KEYBOARD = "mobile-keyboard-open";
  const KEYBOARD_THRESHOLD = 0.75;

  let hamburgerEl = null;
  let overlayEl = null;
  let mobileSettingsBtn = null;
  let navListenersAttached = false;
  let maxViewportHeight = 0;

  function isMobile() {
    return window.matchMedia("(max-width: " + MOBILE_BREAKPOINT + "px)").matches;
  }

  function updateVisualViewport() {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const h = vv.height;
    const t = vv.offsetTop;
    if (isMobile()) {
      maxViewportHeight = Math.max(maxViewportHeight, h);
      const keyboardOpen = h < maxViewportHeight * KEYBOARD_THRESHOLD;
      document.body.classList.toggle(BODY_CLASS_KEYBOARD, keyboardOpen);
    } else {
      document.body.classList.remove(BODY_CLASS_KEYBOARD);
      maxViewportHeight = 0;
    }
    document.documentElement.style.setProperty("--visual-viewport-height", h + "px");
    document.documentElement.style.setProperty("--visual-viewport-offset-top", t + "px");
  }

  function scrollFocusedIntoView() {
    const active = document.activeElement;
    if (!active || !active.closest || !active.closest(".modal")) return;
    const modal = active.closest(".modal-dialog");
    if (!modal) return;
    const scrollEl = modal.querySelector(".modal-body, .settings-content");
    if (!scrollEl || !scrollEl.contains(active)) return;
    function doScroll() {
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 350);
  }

  function openSidebar() {
    document.body.classList.add(BODY_CLASS_OPEN);
    if (hamburgerEl) hamburgerEl.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    document.body.classList.remove(BODY_CLASS_OPEN);
    if (hamburgerEl) hamburgerEl.setAttribute("aria-expanded", "false");
  }

  function toggleSidebar() {
    if (document.body.classList.contains(BODY_CLASS_OPEN)) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function createHamburgerButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mobile-hamburger icon-btn";
    btn.setAttribute("aria-label", "Open menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "sidebar-left");
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    btn.addEventListener("click", toggleSidebar);
    return btn;
  }

  function createOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "mobile-sidebar-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.addEventListener("click", closeSidebar);
    return overlay;
  }

  function createMobileSettingsButton() {
    const settingsBtn = document.getElementById("sidebarSettingsBtn");
    if (!settingsBtn) return null;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mobile-settings-btn icon-btn";
    btn.setAttribute("aria-label", "Settings");
    btn.setAttribute("title", "Settings");
    btn.innerHTML = settingsBtn.innerHTML;
    btn.addEventListener("click", function () {
      closeSidebar();
      settingsBtn.click();
    });
    return btn;
  }

  /** Always inject top-bar Settings; CSS shows it whenever .sidebar-right is hidden (≤1100px). */
  function ensureMobileSettingsButton() {
    if (mobileSettingsBtn) return;
    mobileSettingsBtn = createMobileSettingsButton();
    if (!mobileSettingsBtn) return;
    const topBarActions = document.querySelector(".top-bar-actions");
    if (topBarActions) {
      topBarActions.insertBefore(mobileSettingsBtn, topBarActions.firstChild);
    }
  }

  function closeSidebarOnNavClick() {
    const sidebar = document.querySelector(".sidebar-left");
    if (!sidebar || navListenersAttached) return;

    sidebar.addEventListener("click", function (e) {
      if (!isMobile()) return;
      const target = e.target.closest(".tab, .sidebar-data-item, .sidebar-game-item, .sidebar-brand, #aboutNavTitle, #sidebarSettingsBtn");
      if (target) closeSidebar();
    });
    navListenersAttached = true;
  }

  function closeSidebarWhenModalOpens() {
    document.addEventListener(
      "click",
      function (e) {
        if (!isMobile()) return;
        if (!document.body.classList.contains(BODY_CLASS_OPEN)) return;
        const opener = e.target.closest(
          "button, [role='button'], .history-calendar-day, .attendance-pie-chart, .timestamps-bar-col"
        );
        if (!opener) return;
        // Defer: modal open happens in same click handlers; close drawer so it never covers dialogs.
        setTimeout(function () {
          if (document.querySelector(".modal:not([hidden])")) closeSidebar();
        }, 0);
      },
      true
    );
  }

  function initMobileChrome() {
    const breadcrumbBar = document.querySelector(".breadcrumb-bar");
    if (!breadcrumbBar) return;

    if (!hamburgerEl) {
      hamburgerEl = createHamburgerButton();
      breadcrumbBar.insertBefore(hamburgerEl, breadcrumbBar.firstChild);
    }

    if (!overlayEl) {
      overlayEl = createOverlay();
      document.body.appendChild(overlayEl);
    }

    closeSidebarOnNavClick();
  }

  function init() {
    ensureMobileSettingsButton();

    if (!isMobile()) {
      closeSidebar();
      return;
    }

    initMobileChrome();
  }

  function handleResize() {
    ensureMobileSettingsButton();
    if (!isMobile()) {
      closeSidebar();
    } else {
      initMobileChrome();
    }
  }

  function onEscape(e) {
    if (e.key === "Escape" && document.body.classList.contains(BODY_CLASS_OPEN)) {
      closeSidebar();
    }
  }

  function run() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", onEscape);

    closeSidebarWhenModalOpens();

    if (window.visualViewport) {
      updateVisualViewport();
      window.visualViewport.addEventListener("resize", updateVisualViewport);
      window.visualViewport.addEventListener("scroll", updateVisualViewport);
    }
    document.addEventListener("focusin", scrollFocusedIntoView);
  }

  run();
})();
