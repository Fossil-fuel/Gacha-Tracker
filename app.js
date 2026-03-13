/**
 * Firebase Auth + Firestore for cloud sync.
 * Requires: Firebase SDK scripts + firebase-config.js loaded before app.js.
 * When FIREBASE_CONFIG is not set or placeholder, cloud features are disabled.
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

  const GAME_PRESETS = [
    {
      id: "hsr",
      name: "Honkai Star Rail",
      server: "america",
      resetHour: 4,
      dailies: true,
      dailyCurrency: 60,
      currencyPerPull: 160,
      currencyName: "Stellar Jade",
      weeklies: [
        { id: "divergent", label: "Divergent Universe", weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, currency: 225, frequencyEvery: 2, frequencyUnit: "week", timeLimitEvery: 2, timeLimitUnit: "week" },
        { id: "currency", label: "Currency Wars", weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, currency: 225, frequencyEvery: 2, frequencyUnit: "week", timeLimitEvery: 2, timeLimitUnit: "week" },
      ],
      endgame: [
        { id: "apocalyptic", label: "Apocalyptic Shadow", currency: 800, weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-02-02", frequencyEvery: 6, frequencyUnit: "week", timeLimitEvery: 6, timeLimitUnit: "week" },
        { id: "anomaly", label: "Anomaly Arbitration", currency: 0, weekStartDay: 3, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-02-11", frequencyEvery: 6, frequencyUnit: "week", timeLimitEvery: 6, timeLimitUnit: "week" },
        { id: "moc", label: "Memory of Chaos", currency: 800, weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-03-02", frequencyEvery: 6, frequencyUnit: "week", timeLimitEvery: 6, timeLimitUnit: "week" },
        { id: "purefiction", label: "Pure Fiction", currency: 800, weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-02-16", frequencyEvery: 6, frequencyUnit: "week", timeLimitEvery: 6, timeLimitUnit: "week" },
      ],
    },
    {
      id: "zzz",
      name: "Zenless Zone Zero",
      server: "america",
      resetHour: 4,
      dailies: true,
      dailyCurrency: 60,
      currencyPerPull: 160,
      currencyName: "Polychrome",
      weeklies: [
        { id: "weekly_ridu", label: "Weekly Ridu", weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, currency: 60 },
        { id: "hallow_zero", label: "Hallow Zero", weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, currency: 160 },
      ],
      endgame: [
        { id: "deadly_assault", label: "Deadly Assault", currency: 300, weekStartDay: 5, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-02-13", frequencyEvery: 2, frequencyUnit: "week", timeLimitEvery: 2, timeLimitUnit: "week" },
        { id: "shiyu_defense", label: "Shiyu Defense", currency: 780, weekStartDay: 5, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-02-06", frequencyEvery: 2, frequencyUnit: "week", timeLimitEvery: 2, timeLimitUnit: "week" },
      ],
    },
    {
      id: "hi3",
      name: "Honkai Impact 3rd",
      server: "america",
      resetHour: 4,
      resetMinute: 0,
      dailies: true,
      dailyCurrency: 40,
      currencyPerPull: 280,
      currencyName: "Crystals",
      weeklies: [
        { id: "weekly_share", label: "Weekly Share", weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, currency: 30, frequencyEvery: 1, frequencyUnit: "week", timeLimitEvery: 1, timeLimitUnit: "week", dateStarted: "2026-03-10" },
        { id: "elysian_realm", label: "Elysian Realm", weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, currency: 500, frequencyEvery: 1, frequencyUnit: "week", timeLimitEvery: 1, timeLimitUnit: "week", dateStarted: "2026-03-10" },
        { id: "armata_contribution", label: "Armata Contribution", weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, currency: 25, frequencyEvery: 1, frequencyUnit: "week", timeLimitEvery: 1, timeLimitUnit: "week", dateStarted: "2026-03-10" },
      ],
      endgame: [
        { id: "memorial_arena", label: "Memorial Arena", currency: 140, weekStartDay: 2, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-03-10", frequencyEvery: 1, frequencyUnit: "week", timeLimitEvery: 6, timeLimitUnit: "day" },
        { id: "superstring_p1", label: "Superstring Dimension P1", currency: 520, weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-03-10", frequencyEvery: 1, frequencyUnit: "week", timeLimitEvery: 2, timeLimitUnit: "day" },
        { id: "superstring_p2", label: "Superstring Dimension P2", currency: 520, weekStartDay: 5, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-03-06", frequencyEvery: 1, frequencyUnit: "week", timeLimitEvery: 2, timeLimitUnit: "day" },
      ],
    },
    {
      id: "ww",
      name: "Wuthering Waves",
      server: "america",
      resetHour: 4,
      resetMinute: 0,
      dailies: true,
      dailyCurrency: 60,
      currencyPerPull: 160,
      currencyName: "Astrite",
      weeklies: [
        { id: "thousand_gateways", label: "Thousand Gateways", weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, currency: 160, frequencyEvery: 1, frequencyUnit: "week", timeLimitEvery: 1, timeLimitUnit: "week", dateStarted: "2026-03-10" },
      ],
      endgame: [
        { id: "tower_of_adversity", label: "Tower of Adversity", currency: 800, weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-03-02", frequencyEvery: 4, frequencyUnit: "week", timeLimitEvery: 4, timeLimitUnit: "week" },
        { id: "whimpering_wastes", label: "Whimpering Wastes", currency: 800, weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, dateStarted: "2026-02-16", frequencyEvery: 4, frequencyUnit: "week", timeLimitEvery: 4, timeLimitUnit: "week" },
      ],
      extracurricular: [
        { label: "Doubled Pawns Matrix", description: "This is a Placeholder for the Doubled Pawns Matrix gamemode (GM). Starting date does not matter for this task, just change the End date. Feel free to remove this if you don't wish to track this GM. For a new rotation of this GM, a new task will have to be created for the respective rotation.", endDateTBD: true },
      ],
    },
    {
      id: "akendfield",
      name: "Arknights: Endfield",
      server: "america",
      resetHour: 4,
      resetMinute: 0,
      dailies: true,
      dailyCurrency: 200,
      currencyPerPull: 500,
      currencyName: "Oroberyls",
      weeklies: [
        { id: "weekly_routine", label: "Weekly Routine", weekStartDay: 1, weekStartHour: 4, weekStartMinute: 0, currency: 500, frequencyEvery: 1, frequencyUnit: "week", timeLimitEvery: 1, timeLimitUnit: "week", dateStarted: "2026-03-10" },
      ],
    },
  ];

  const taskModal = {
    open: false,
    gameId: null,
    taskType: null, // "weeklies" | "endgame"
    taskId: null, // existing task id if editing
    selectedDay: 0,
    frequencyUnit: "week",
    timeLimitUnit: "week",
  };

  const gameModal = {
    open: false,
    selectedPresetId: "custom",
  };

  const deleteGameModalState = {
    open: false,
    gameId: null,
  };

  let state = {
    tab: "about",
    dataSelectedGameId: null,
    gamesSelectedId: null,
    gamesSubTab: "dailies",
    dailiesView: "list",
    weekliesView: "list",
    endgameView: "list",
    games: [],
    dailiesCompleted: {},
    weekliesCompleted: {},
    endgameCompleted: {},
    dailiesAttempted: {},
    weekliesAttempted: {},
    endgameAttempted: {},
    endgameCurrencyEarned: {},
    endgameCompletionDates: {}, // { "gameId.taskId": [{ start: "YYYY-MM-DD", end: "YYYY-MM-DD" }, ...] }
    completionByDate: {}, // { "YYYY-MM-DD": { dailies: [gameId], weeklies: ["gameId.taskId"], endgame: ["gameId.taskId"] } }
    completionTimestamps: [], // [{ dateStr, hour, gameId, taskType, taskId, taskLabel }] - when tasks were completed (for trend)
    lastProcessedResets: { dailies: {}, weeklies: {}, endgame: {} }, // last period we processed for each task
    attendancePieInclude: {},
    dataPieInclude: {}, // { gameId: { dailies, weeklies, endgame, extracurricular } } - true = include in total/pie
    attendanceView: "weekly", // "weekly" | "history" | "timestamps"
    timestampsSelectedGameIds: {}, // { gameId: true } - which games to show in timestamps page; empty = all
    timestampsSelectedEndgameTasks: {}, // { "gameId.taskId": true } - which endgame tasks to show; empty = all
    historyMonth: null,
    historyYear: null,
    extracurricularTasks: [],
    extracurricularCompleted: {},
    extracurricularCompletedAt: {}, // { taskId: "ISO date string" } - when marked complete, for 24h visibility then archive
    extracurricularView: "list",
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
    return new Date();
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
    bg: "#170f24",
    bgElevated: "#241638",
    bgPanel: "#1b1230",
    text: "#e8e8f0",
    textMuted: "#a0a0b8",
    accent: "#7c3aed",
    accentHover: "#8b5cf6",
    accentActive: "#6d28d9",
    border: "#34264d",
    success: "#34d399",
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
      const raw = localStorage.getItem(STORAGE_KEY);
      const isFirstLoad = !raw;
      if (raw) {
        const parsed = JSON.parse(raw);
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
        if (parsed.lastProcessedResets) state.lastProcessedResets = parsed.lastProcessedResets;
        if (parsed.dataSelectedGameId != null) state.dataSelectedGameId = parsed.dataSelectedGameId;
        if (parsed.gamesSelectedId != null) state.gamesSelectedId = parsed.gamesSelectedId;
        if (parsed.dailiesView === "grid" || parsed.dailiesView === "list") state.dailiesView = parsed.dailiesView;
        if (parsed.weekliesView === "grid" || parsed.weekliesView === "list") state.weekliesView = parsed.weekliesView;
        if (parsed.endgameView === "grid" || parsed.endgameView === "list") state.endgameView = parsed.endgameView;
        if (parsed.attendancePieInclude && typeof parsed.attendancePieInclude === "object") state.attendancePieInclude = parsed.attendancePieInclude;
        if (parsed.dataPieInclude && typeof parsed.dataPieInclude === "object") state.dataPieInclude = parsed.dataPieInclude;
        if (parsed.attendanceView === "weekly" || parsed.attendanceView === "history" || parsed.attendanceView === "timestamps") state.attendanceView = parsed.attendanceView;
        if (parsed.historyMonth != null && parsed.historyMonth >= 0 && parsed.historyMonth <= 11) state.historyMonth = parsed.historyMonth;
        if (parsed.historyYear != null && Number.isFinite(parsed.historyYear)) state.historyYear = parsed.historyYear;
        if (Array.isArray(parsed.extracurricularTasks)) state.extracurricularTasks = parsed.extracurricularTasks;
        if (parsed.extracurricularCompleted && typeof parsed.extracurricularCompleted === "object") state.extracurricularCompleted = parsed.extracurricularCompleted;
        if (parsed.extracurricularCompletedAt && typeof parsed.extracurricularCompletedAt === "object") state.extracurricularCompletedAt = parsed.extracurricularCompletedAt;
        if (parsed.extracurricularView === "grid" || parsed.extracurricularView === "list") state.extracurricularView = parsed.extracurricularView;
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
    if (!state.lastProcessedResets) state.lastProcessedResets = { dailies: {}, weeklies: {}, endgame: {} };
    if (!state.extracurricularCompletedAt) state.extracurricularCompletedAt = {};
    if (!state.extracurricularViewMode) state.extracurricularViewMode = "tasks";
    const taskIds = new Set((state.extracurricularTasks || []).map((t) => t.id));
    Object.keys(state.extracurricularCompletedAt || {}).forEach((id) => {
      if (!taskIds.has(id)) delete state.extracurricularCompletedAt[id];
    });
    Object.keys(state.extracurricularCompleted || {}).forEach((id) => {
      if (!taskIds.has(id)) delete state.extracurricularCompleted[id];
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

  function buildSavePayload() {
    return {
      games: state.games,
      dailiesCompleted: state.dailiesCompleted,
      weekliesCompleted: state.weekliesCompleted,
      endgameCompleted: state.endgameCompleted,
      dailiesAttempted: state.dailiesAttempted,
      weekliesAttempted: state.weekliesAttempted,
      endgameAttempted: state.endgameAttempted,
      endgameCurrencyEarned: state.endgameCurrencyEarned,
      endgameCompletionDates: state.endgameCompletionDates,
      completionByDate: state.completionByDate,
      lastProcessedResets: state.lastProcessedResets,
      dataSelectedGameId: state.dataSelectedGameId,
      gamesSelectedId: state.gamesSelectedId,
      dailiesView: state.dailiesView,
      weekliesView: state.weekliesView,
      endgameView: state.endgameView,
      attendancePieInclude: state.attendancePieInclude,
      dataPieInclude: state.dataPieInclude,
      attendanceView: state.attendanceView,
      timestampsSelectedGameIds: state.timestampsSelectedGameIds,
      timestampsSelectedEndgameTasks: state.timestampsSelectedEndgameTasks,
      completionTimestamps: state.completionTimestamps,
      historyMonth: state.historyMonth,
      historyYear: state.historyYear,
      extracurricularTasks: state.extracurricularTasks,
      extracurricularCompleted: state.extracurricularCompleted,
      extracurricularCompletedAt: state.extracurricularCompletedAt,
      extracurricularView: state.extracurricularView,
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
      defaultAdjustForDST: state.defaultAdjustForDST,
      primaryServer: state.primaryServer || "america",
    };
  }

  function save() {
    try {
      const payload = buildSavePayload();
      const jsonStr = JSON.stringify(payload);
      localStorage.setItem(STORAGE_KEY, jsonStr);
      if (typeof window.__cloudSave === "function") window.__cloudSave(jsonStr);
    } catch (_) {}
  }

  window.__applyCloudData = function (jsonStr) {
    try {
      localStorage.setItem(STORAGE_KEY, jsonStr);
      load();
      renderAll();
    } catch (_) {}
  };

  window.__uploadLocalToCloud = save;

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
    renderAll();
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

  function getDateStr(d) {
    const date = d || new Date();
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

  /** Same time logic as getWeeklyTimeRemainingMs: use weekStartHour/weekStartMinute, server timezone when game has server. */
  function getEndgameAnchorDate(task, game) {
    const ds = isValidDateStr(task && task.dateStarted) ? task.dateStarted : getDateStr();
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
    const n = now || new Date();
    const freqUnit = task && task.frequencyUnit === "day" ? "day" : "week";
    const intervalMs = getIntervalMs(task && task.frequencyEvery, freqUnit);
    const anchor = getEndgameAnchorDate(task, game);
    const anchorMs = anchor.getTime();
    const nowMs = n.getTime();

    let cycleStartMs = anchorMs;
    if (nowMs > anchorMs) {
      const k = Math.floor((nowMs - anchorMs) / intervalMs);
      cycleStartMs = anchorMs + k * intervalMs;
    }

    const limitUnit = task && task.timeLimitUnit === "day" ? "day" : "week";
    const hasExplicitLimit = task && (task.timeLimitEvery != null || task.timeLimitUnit != null);
    const timeLimitMs = hasExplicitLimit ? getIntervalMs(task && task.timeLimitEvery, limitUnit) : intervalMs;
    const deadlineMs = cycleStartMs + timeLimitMs;
    return deadlineMs - nowMs;
  }

  function getEndgameTimeRemainingText(task, now, game) {
    return formatRemainingMs(getEndgameTimeRemainingMs(task, now, game));
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

  function getEndgameCompletionDates(gameId, taskId) {
    const key = gameId + "." + taskId;
    return state.endgameCompletionDates[key] || [];
  }

  function setEndgameCompletionDate(gameId, taskId, index, start, end) {
    const key = gameId + "." + taskId;
    if (!state.endgameCompletionDates[key]) state.endgameCompletionDates[key] = [];
    while (state.endgameCompletionDates[key].length <= index) {
      state.endgameCompletionDates[key].push({ start: "", end: "" });
    }
    state.endgameCompletionDates[key][index] = { start: start || "", end: end || "" };
    save();
  }

  /** Returns the dateStr for the daily period that contains `now`. The reset time marks the start of that day:
   * e.g. reset 3am → 2:59am March 8 is still March 7's task; 3:00am March 8 starts March 8's task. */
  function getDailyPeriodDateStr(game, now) {
    const n = now || new Date();
    const baseTz = getResetTimezoneForGame(game);
    const tz = getTimezoneForTaskDst(game, baseTz);
    const parts = getDatePartsInTimezone(n, tz);
    const hour = getResetHour(game, "resetHour", getDefaultResetHour(), game, n);
    const minute = Number.isFinite(game && game.resetMinute) ? game.resetMinute : 0;
    const offsetRef = getOffsetRefDateForTask(game, tz);
    const todayReset = createDateInTimezone(parts.year, parts.month, parts.day, hour, minute, tz, offsetRef);
    if (n < todayReset) {
      const todayStart = createDateInTimezone(parts.year, parts.month, parts.day, 0, 0, tz, offsetRef);
      const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
      const prevParts = getDatePartsInTimezone(yesterdayStart, tz);
      return prevParts.year + "-" + String(prevParts.month + 1).padStart(2, "0") + "-" + String(prevParts.day).padStart(2, "0");
    }
    return getDateStr(n);
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
    const n = now || new Date();
    const baseTz = game ? getResetTimezoneForGame(game) : getRecordingTimezone();
    const tz = getTimezoneForTaskDst(task, baseTz);
    const parts = getDatePartsInTimezone(n, tz);
    const weekStartDay = Number.isFinite(task && task.weekStartDay) ? task.weekStartDay : 0;
    const weekStartHour = getResetHour(task, "weekStartHour", getDefaultResetHour(), game, n);
    const weekStartMinute = Number.isFinite(task && task.weekStartMinute) ? task.weekStartMinute : 0;
    const offsetRef = getOffsetRefDateForTask(task, tz);
    const resetMoment = createDateInTimezone(parts.year, parts.month, parts.day, weekStartHour, weekStartMinute, tz, offsetRef);
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    const daysBack = (dayOfWeek - weekStartDay + 7) % 7;
    const weekStart = new Date(resetMoment.getTime() - daysBack * 24 * 60 * 60 * 1000);
    if (n < weekStart) weekStart.setTime(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    return weekEnd.getTime() - n.getTime();
  }

  function getWeeklyTimeRemainingText(task, now, game) {
    return formatRemainingMs(getWeeklyTimeRemainingMs(task, now, game));
  }

  function getWeekDates() {
    const now = new Date();
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

  /** Get date strings from dateStr (inclusive) to end of period for weeklies/endgame. Used when marking complete.
   * Uses calendar dates only: period = 7 days for weeklies, so last day is weekStart+6 (excludes next period's first day). */
  function getRemainingDatesInPeriod(type, key, dateStr) {
    const dates = [];
    const dot = key.indexOf(".");
    if (dot <= 0) return [dateStr];
    const gameId = key.slice(0, dot);
    const taskId = key.slice(dot + 1);
    const game = getGame(gameId);
    if (!game) return [dateStr];
    const d = isValidDateStr(dateStr) ? new Date(dateStr + "T12:00:00") : new Date();
    if (type === "weeklies") {
      const task = (game.weeklies || []).find((t) => (t.id || t.label) === taskId);
      if (!task) return [dateStr];
      const weekStart = getWeekStartForDate(task, dateStr, game);
      const lastDayOfWeek = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
      for (let day = new Date(d.getFullYear(), d.getMonth(), d.getDate()); day.getTime() <= lastDayOfWeek.getTime(); day.setDate(day.getDate() + 1)) {
        dates.push(getDateStr(day));
      }
    } else if (type === "endgame") {
      const task = (game.endgame || []).find((t) => (t.id || t.label) === taskId);
      if (!task) return [dateStr];
      const cycleStart = getCycleStartForDate(task, dateStr, game);
      const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
      const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
      const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
      const cycleDays = Math.ceil(timeLimitMs / (24 * 60 * 60 * 1000));
      const lastDayOfCycle = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate() + cycleDays - 1);
      for (let day = new Date(d.getFullYear(), d.getMonth(), d.getDate()); day.getTime() <= lastDayOfCycle.getTime(); day.setDate(day.getDate() + 1)) {
        dates.push(getDateStr(day));
      }
    } else {
      return [dateStr];
    }
    return dates.length ? dates : [dateStr];
  }

  /** Get all date strings in the period containing dateStr. Used when unmarking.
   * Uses calendar dates only to avoid including the first day of the next period. */
  function getAllDatesInPeriod(type, key, dateStr) {
    const dates = [];
    const dot = key.indexOf(".");
    if (dot <= 0) return [dateStr];
    const gameId = key.slice(0, dot);
    const taskId = key.slice(dot + 1);
    const game = getGame(gameId);
    if (!game) return [dateStr];
    if (type === "weeklies") {
      const task = (game.weeklies || []).find((t) => (t.id || t.label) === taskId);
      if (!task) return [dateStr];
      const weekStart = getWeekStartForDate(task, dateStr, game);
      const lastDayOfWeek = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
      for (let day = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()); day.getTime() <= lastDayOfWeek.getTime(); day.setDate(day.getDate() + 1)) {
        dates.push(getDateStr(day));
      }
    } else if (type === "endgame") {
      const task = (game.endgame || []).find((t) => (t.id || t.label) === taskId);
      if (!task) return [dateStr];
      const cycleStart = getCycleStartForDate(task, dateStr, game);
      const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
      const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
      const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
      const cycleDays = Math.ceil(timeLimitMs / (24 * 60 * 60 * 1000));
      const lastDayOfCycle = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate() + cycleDays - 1);
      for (let day = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate()); day.getTime() <= lastDayOfCycle.getTime(); day.setDate(day.getDate() + 1)) {
        dates.push(getDateStr(day));
      }
    } else {
      return [dateStr];
    }
    return dates.length ? dates : [dateStr];
  }

  function recordCompletion(dateStr, type, key, skipTimestamp) {
    const datesToRecord = (type === "weeklies" || type === "endgame") ? getRemainingDatesInPeriod(type, key, dateStr) : [dateStr];
    datesToRecord.forEach((ds) => {
      if (!state.completionByDate[ds]) state.completionByDate[ds] = { dailies: [], weeklies: [], endgame: [] };
      const arr = state.completionByDate[ds][type];
      if (!arr.includes(key)) arr.push(key);
    });
    if (!skipTimestamp) recordCompletionTimestamp(type, key);
  }

  function recordCompletionTimestamp(type, key) {
    if (!state.completionTimestamps) state.completionTimestamps = [];
    const now = new Date();
    const tz = getAppTimezone ? getAppTimezone() : Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parts = getDatePartsInTimezone ? getDatePartsInTimezone(now, tz) : { year: now.getFullYear(), month: now.getMonth(), day: now.getDate(), weekday: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][now.getDay()], hour: now.getHours(), minute: now.getMinutes() };
    const dateStr = String(parts.year) + "-" + String(parts.month + 1).padStart(2, "0") + "-" + String(parts.day).padStart(2, "0");
    let gameId = key, taskId = "", taskLabel = "";
    if (type !== "dailies") {
      const dot = key.indexOf(".");
      gameId = dot >= 0 ? key.slice(0, dot) : key;
      taskId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gameId);
      const task = type === "weeklies" ? (game?.weeklies || []).find((t) => (t.id || t.label) === taskId) : (game?.endgame || []).find((t) => (t.id || t.label) === taskId);
      taskLabel = task ? (task.label || taskId) : taskId;
    } else {
      const game = getGame(gameId);
      taskLabel = game ? game.name : gameId;
    }
    state.completionTimestamps.push({ dateStr, hour: parts.hour, gameId, taskType: type, taskId, taskLabel });
  }

  function unrecordCompletionTimestamp(type, key) {
    if (!state.completionTimestamps || state.completionTimestamps.length === 0) return;
    let gameId = key, taskId = "";
    if (type !== "dailies") {
      const dot = key.indexOf(".");
      gameId = dot >= 0 ? key.slice(0, dot) : key;
      taskId = dot >= 0 ? key.slice(dot + 1) : "";
    }
    for (let i = state.completionTimestamps.length - 1; i >= 0; i--) {
      const t = state.completionTimestamps[i];
      if (t.gameId === gameId && t.taskType === type && (type === "dailies" || t.taskId === taskId)) {
        state.completionTimestamps.splice(i, 1);
        return;
      }
    }
  }

  function unrecordCompletion(dateStr, type, key, skipTimestamp) {
    const datesToRemove = (type === "weeklies" || type === "endgame") ? getAllDatesInPeriod(type, key, dateStr) : [dateStr];
    datesToRemove.forEach((ds) => {
      if (!state.completionByDate[ds]) return;
      const arr = state.completionByDate[ds][type];
      const idx = arr.indexOf(key);
      if (idx >= 0) arr.splice(idx, 1);
    });
    if (!skipTimestamp) unrecordCompletionTimestamp(type, key);
  }

  function freezeTalliesOnTimezoneChange() {
    const now = new Date();
    const todayStr = getDateStr();
    getAllGames().forEach((game) => {
      if (game.dailies) {
        state.lastProcessedResets.dailies[game.id] = todayStr;
      }
      (game.weeklies || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const nextReset = new Date(now.getTime() + getWeeklyTimeRemainingMs(task, now, game));
        if (!state.lastProcessedResets.weeklies) state.lastProcessedResets.weeklies = {};
        state.lastProcessedResets.weeklies[key] = getDateStr(new Date(nextReset.getTime() + 24 * 60 * 60 * 1000));
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

  function processResets() {
    const now = new Date();
    const todayStr = getDateStr();
    let didChange = false;

    getAllGames().forEach((game) => {
      if (game.dailies) {
        const gameId = game.id;
        const hour = getResetHour(game, "resetHour", getDefaultResetHour(), game, now);
        const minute = Number.isFinite(game.resetMinute) ? game.resetMinute : 0;
        let lastStr = state.lastProcessedResets.dailies[gameId] || todayStr;
        let d = new Date(lastStr + "T12:00:00");
        d.setDate(d.getDate() + 1);
        let lastProcessed = lastStr;
        while (getDateStr(d) <= todayStr) {
          const dateStr = getDateStr(d);
          const periodEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hour, minute, 0, 0);
          if (now >= periodEnd) {
            didChange = true;
            state.dailiesAttempted[gameId] = getAttemptedAmount(state.dailiesAttempted, gameId) + 1;
            const dayData = state.completionByDate[dateStr] || { dailies: [] };
            if ((dayData.dailies || []).includes(gameId)) {
              state.dailiesCompleted[gameId] = getCompletedAmount(state.dailiesCompleted, gameId) + 1;
            }
            lastProcessed = dateStr;
          }
          d.setDate(d.getDate() + 1);
        }
        state.lastProcessedResets.dailies[gameId] = lastProcessed;
      }

      (game.weeklies || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const weekStartDay = Number.isFinite(task.weekStartDay) ? task.weekStartDay : 0;
        const weekStartHour = getResetHour(task, "weekStartHour", 4, game, now);
        const weekStartMinute = Number.isFinite(task.weekStartMinute) ? task.weekStartMinute : 0;
        let lastStr = state.lastProcessedResets.weeklies[key] || todayStr;
        const last = new Date(lastStr + "T12:00:00");
        const weekStart = new Date(last.getFullYear(), last.getMonth(), last.getDate(), weekStartHour, weekStartMinute, 0, 0);
        const daysBack = (last.getDay() - weekStartDay + 7) % 7;
        weekStart.setDate(weekStart.getDate() - daysBack);
        if (last < weekStart) weekStart.setDate(weekStart.getDate() - 7);
        let iter = new Date(weekStart);
        const nowWeekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), weekStartHour, weekStartMinute, 0, 0);
        const nowDaysBack = (now.getDay() - weekStartDay + 7) % 7;
        nowWeekEnd.setDate(nowWeekEnd.getDate() - nowDaysBack);
        if (now < nowWeekEnd) nowWeekEnd.setDate(nowWeekEnd.getDate() - 7);
        const thisWeekEnd = new Date(nowWeekEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
        let lastProcessed = lastStr;
        while (iter < nowWeekEnd) {
          const weekEnd = new Date(iter.getTime() + 7 * 24 * 60 * 60 * 1000);
          if (now >= weekEnd) {
            didChange = true;
            state.weekliesAttempted[key] = getAttemptedAmount(state.weekliesAttempted, key) + 1;
            let completed = false;
            for (let i = 0; i < 7; i++) {
              const checkDate = new Date(iter);
              checkDate.setDate(checkDate.getDate() + i);
              const dateStr = getDateStr(checkDate);
              const dayData = state.completionByDate[dateStr] || { weeklies: [] };
              if ((dayData.weeklies || []).includes(key)) { completed = true; break; }
            }
            if (completed) state.weekliesCompleted[key] = getCompletedAmount(state.weekliesCompleted, key) + 1;
            iter.setDate(iter.getDate() + 7);
            lastProcessed = getDateStr(iter);
          } else {
            break;
          }
        }
        state.lastProcessedResets.weeklies[key] = lastProcessed;
      });

      (game.endgame || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const anchor = getEndgameAnchorDate(task, game);
        const intervalMs = getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
        const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
        const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
        const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : intervalMs;
        let lastMs = state.lastProcessedResets.endgame[key];
        if (!lastMs) {
          let earliestStr = null;
          Object.keys(state.completionByDate || {}).forEach((dateStr) => {
            const dayData = state.completionByDate[dateStr] || { endgame: [] };
            if ((dayData.endgame || []).includes(key) && (!earliestStr || dateStr < earliestStr)) earliestStr = dateStr;
          });
          if (earliestStr) {
            lastMs = getCycleStartForDate(task, earliestStr, game).getTime();
          } else {
            lastMs = getCycleStartForDate(task, todayStr, game).getTime() + timeLimitMs;
          }
        }
        const nowMs = now.getTime();
        let cycleEndMs = lastMs;
        while (cycleEndMs + timeLimitMs <= nowMs) {
          cycleEndMs += timeLimitMs;
          didChange = true;
          state.endgameAttempted[key] = getAttemptedAmount(state.endgameAttempted, key) + 1;
          const cycleStart = new Date(cycleEndMs - timeLimitMs);
          const cycleEnd = new Date(cycleEndMs);
          let completed = false;
          for (let d = new Date(cycleStart); d < cycleEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = getDateStr(d);
            const dayData = state.completionByDate[dateStr] || { endgame: [] };
            if ((dayData.endgame || []).includes(key)) { completed = true; break; }
          }
          if (completed) state.endgameCompleted[key] = getCompletedAmount(state.endgameCompleted, key) + 1;
        }
        ensureEndgameEarnedArrayLength(game.id, task.id || task.label, getCompletedAmount(state.endgameCompleted, key));
        state.lastProcessedResets.endgame[key] = cycleEndMs;
      });
    });

    if (didChange) save();
    return didChange;
  }

  function isWeeklyAvailableOnDate(task, date, game) {
    const d = new Date(date);
    const weekStart = getWeekStartForDate(task, getDateStr(d), game);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    return d.getTime() >= weekStart.getTime() && d.getTime() < weekEnd.getTime();
  }

  function isEndgameAvailableOnDate(task, date, game) {
    const d = new Date(date);
    const anchor = getEndgameAnchorDate(task, game);
    const intervalMs = getIntervalMs(task && task.frequencyEvery, (task && task.frequencyUnit === "day") ? "day" : "week");
    const limitUnit = task && task.timeLimitUnit === "day" ? "day" : "week";
    const hasExplicitLimit = task && (task.timeLimitEvery != null || task.timeLimitUnit != null);
    const timeLimitMs = hasExplicitLimit ? getIntervalMs(task && task.timeLimitEvery, limitUnit) : intervalMs;
    let cycleStart = new Date(anchor);
    const anchorMs = anchor.getTime();
    const dateMs = d.getTime();
    if (dateMs < anchorMs) return false;
    const k = Math.floor((dateMs - anchorMs) / intervalMs);
    cycleStart = new Date(anchorMs + k * intervalMs);
    const cycleEnd = new Date(cycleStart.getTime() + timeLimitMs);
    return dateMs >= cycleStart.getTime() && dateMs < cycleEnd.getTime();
  }

  function labelAfterDash(str) {
    if (!str || typeof str !== "string") return str || "";
    const i = str.indexOf(" — ");
    return i >= 0 ? str.slice(i + 3).trim() : str;
  }

  function getTasksAvailableOnDate(dateStr) {
    const d = isValidDateStr(dateStr) ? new Date(dateStr + "T12:00:00") : new Date();
    const result = { dailies: [], weeklies: [], endgame: [] };
    getAllGames().forEach((game) => {
      if (game.dailies) result.dailies.push({ key: game.id, label: game.name || game.id });
      (game.weeklies || []).forEach((task) => {
        if (isWeeklyAvailableOnDate(task, d, game)) {
          const key = game.id + "." + (task.id || task.label);
          result.weeklies.push({ key, label: (game.name || game.id) + " — " + (task.label || "Weekly") });
        }
      });
      (game.endgame || []).forEach((task) => {
        if (isEndgameAvailableOnDate(task, d, game)) {
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

  /** Returns the dateStr where this weekly was completed in the current cycle, or null. */
  function getWeeklyCompletionDateInCurrentCycle(key, todayStr) {
    const dot = key.indexOf(".");
    if (dot <= 0) return null;
    const gameId = key.slice(0, dot);
    const taskId = key.slice(dot + 1);
    const game = getGame(gameId);
    const task = (game && game.weeklies || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return null;
    const d = isValidDateStr(todayStr) ? new Date(todayStr + "T12:00:00") : new Date();
    const weekStartDay = Number.isFinite(task.weekStartDay) ? task.weekStartDay : 0;
    const weekStartHour = getResetHour(task, "weekStartHour", 4, game);
    const weekStartMinute = Number.isFinite(task.weekStartMinute) ? task.weekStartMinute : 0;
    const resetMoment = new Date(d.getFullYear(), d.getMonth(), d.getDate(), weekStartHour, weekStartMinute, 0, 0);
    const daysBack = (d.getDay() - weekStartDay + 7) % 7;
    const weekStart = new Date(resetMoment);
    weekStart.setDate(weekStart.getDate() - daysBack);
    if (d < weekStart) weekStart.setDate(weekStart.getDate() - 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    for (let day = new Date(weekStart); day < weekEnd; day.setDate(day.getDate() + 1)) {
      const dateStr = getDateStr(day);
      const dayData = state.completionByDate[dateStr] || { weeklies: [] };
      if ((dayData.weeklies || []).includes(key)) return dateStr;
    }
    return null;
  }

  /** Whether this endgame task was completed on any day within its current cycle. */
  function isEndgameCompletedInCurrentCycle(key, todayStr) {
    return getEndgameCompletionDateInCurrentCycle(key, todayStr) != null;
  }

  /** Returns the dateStr where this endgame was completed in the current cycle, or null. */
  function getEndgameCompletionDateInCurrentCycle(key, todayStr) {
    const dot = key.indexOf(".");
    if (dot <= 0) return null;
    const gameId = key.slice(0, dot);
    const taskId = key.slice(dot + 1);
    const game = getGame(gameId);
    const task = (game && game.endgame || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return null;
    const d = isValidDateStr(todayStr) ? new Date(todayStr + "T12:00:00") : new Date();
    const anchor = getEndgameAnchorDate(task, game);
    const intervalMs = getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
    const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
    const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
    const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : intervalMs;
    const anchorMs = anchor.getTime();
    const dateMs = d.getTime();
    if (dateMs < anchorMs) return null;
    const k = Math.floor((dateMs - anchorMs) / intervalMs);
    const cycleStartMs = anchorMs + k * intervalMs;
    const cycleEndMs = cycleStartMs + timeLimitMs;
    const cycleStart = new Date(cycleStartMs);
    const cycleEnd = new Date(cycleEndMs);
    for (let day = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate()); day < cycleEnd; day.setDate(day.getDate() + 1)) {
      const dateStr = getDateStr(day);
      const dayData = state.completionByDate[dateStr] || { endgame: [] };
      if ((dayData.endgame || []).includes(key)) return dateStr;
    }
    return null;
  }

  function toggleCalendarCompletion(dateStr, type, key, checked) {
    if (checked) recordCompletion(dateStr, type, key);
    else unrecordCompletion(dateStr, type, key);
    const todayStr = getDateStr();
    if (dateStr === todayStr) {
      if (type === "dailies") state.dailiesCompleted[key] = checked ? 1 : 0;
      else if (type === "weeklies" || type === "endgame") {
        const obj = type === "weeklies" ? state.weekliesCompleted : state.endgameCompleted;
        obj[key] = checked ? 1 : 0;
      }
    }
    save();
    renderAll();
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

  /** Get cycle start for an endgame task given a date. Allows cycles before anchor (for tally). */
  function getCycleStartForDate(task, dateStr, game) {
    const d = isValidDateStr(dateStr) ? new Date(dateStr + "T12:00:00") : new Date();
    const anchor = getEndgameAnchorDate(task, game);
    const intervalMs = getIntervalMs(task && task.frequencyEvery, (task && task.frequencyUnit === "day") ? "day" : "week");
    const anchorMs = anchor.getTime();
    const dateMs = d.getTime();
    const k = Math.floor((dateMs - anchorMs) / intervalMs);
    return new Date(anchorMs + k * intervalMs);
  }

  /**
   * Get tally history for a task. Each period = 1 attempt; 1 complete if any mark in that period.
   * Returns array of { periodStart, periodEnd, completed }.
   * Starts at earliest period with a completion (dateStarted is only a cycle marker, does not affect tally).
   * Toggling multiple times within a period = 1 complete (not multiple). Attempts come from create/reset only.
   */
  function getTaskTallyHistory(game, type, key) {
    const now = new Date();
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
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      while (d <= today) {
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
      let earliestWeekStart = null;
      Object.keys(state.completionByDate || {}).forEach((dateStr) => {
        const dayData = state.completionByDate[dateStr] || { weeklies: [] };
        if ((dayData.weeklies || []).includes(key)) {
          const ws = getWeekStartForDate(task, dateStr, game);
          if (!earliestWeekStart || ws < earliestWeekStart) earliestWeekStart = new Date(ws);
        }
      });
      if (!earliestWeekStart) return result;
      let iter = new Date(earliestWeekStart);
      const nowWeekStart = getWeekStartForDate(task, todayStr, game);
      while (iter <= nowWeekStart) {
        const weekEnd = new Date(iter.getTime() + 7 * 24 * 60 * 60 * 1000);
        let completed = 0;
        for (let day = new Date(iter); day < weekEnd; day.setDate(day.getDate() + 1)) {
          const dateStr = getDateStr(day);
          const dayData = state.completionByDate[dateStr] || { weeklies: [] };
          if ((dayData.weeklies || []).includes(key)) { completed = 1; break; }
        }
        result.push({ periodStart: new Date(iter), periodEnd: weekEnd, completed });
        iter.setDate(iter.getDate() + 7);
      }
    } else if (type === "endgame") {
      const task = (game.endgame || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
      if (!task) return result;
      const intervalMs = getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
      const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
      const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
      const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : intervalMs;
      let earliestStr = null;
      Object.keys(state.completionByDate || {}).forEach((dateStr) => {
        const dayData = state.completionByDate[dateStr] || { endgame: [] };
        if ((dayData.endgame || []).includes(key) && (!earliestStr || dateStr < earliestStr)) earliestStr = dateStr;
      });
      if (!earliestStr) return result;
      let cycleStartMs = getCycleStartForDate(task, earliestStr, game).getTime();
      const nowMs = now.getTime();
      while (cycleStartMs <= nowMs) {
        const cycleStart = new Date(cycleStartMs);
        const cycleEnd = new Date(cycleStartMs + timeLimitMs);
        let completed = 0;
        for (let day = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate()); day < cycleEnd; day.setDate(day.getDate() + 1)) {
          const dateStr = getDateStr(day);
          const dayData = state.completionByDate[dateStr] || { endgame: [] };
          if ((dayData.endgame || []).includes(key)) { completed = 1; break; }
        }
        result.push({ periodStart: cycleStart, periodEnd: cycleEnd, completed });
        cycleStartMs += intervalMs;
      }
    }
    return result;
  }

  /**
   * Sync Completed amount and Amount attempted from calendar history (tally).
   * Updates state.xxxCompleted and state.xxxAttempted to match completionByDate.
   */
  function syncTaskWithCalendar(game, type, key) {
    const history = getTaskTallyHistory(game, type, key);
    const attempted = history.length;
    const completed = history.reduce((sum, p) => sum + p.completed, 0);

    const todayStr = getDateStr();

    if (type === "dailies") {
      state.dailiesCompleted[key] = completed;
      state.dailiesAttempted[key] = attempted;
      state.lastProcessedResets.dailies[key] = todayStr;
    } else if (type === "weeklies") {
      state.weekliesCompleted[key] = completed;
      state.weekliesAttempted[key] = attempted;
      const task = (game.weeklies || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
      if (task) {
        const last = history.length > 0 ? history[history.length - 1] : null;
        state.lastProcessedResets.weeklies[key] = last ? getDateStr(last.periodStart) : getDateStr(getWeekStartForDate(task, todayStr, game));
      }
    } else if (type === "endgame") {
      state.endgameCompleted[key] = completed;
      state.endgameAttempted[key] = attempted;
      const task = (game.endgame || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
      if (task) {
        ensureEndgameEarnedArrayLength(game.id, task.id || task.label, completed);
        const last = history.length > 0 ? history[history.length - 1] : null;
        if (last) {
          state.lastProcessedResets.endgame[key] = last.periodEnd.getTime();
        } else {
          const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
          const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
          const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
          state.lastProcessedResets.endgame[key] = getCycleStartForDate(task, todayStr, game).getTime() + timeLimitMs;
        }
      }
    }

    save();
    renderAll();
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
    renderAll();
  }

  /** Sync all tasks (dailies, weeklies, endgame) for a game from calendar history. */
  function syncAllTasksForGame(game) {
    if (!game) return;
    if (game.dailies) syncTaskWithCalendar(game, "dailies", game.id);
    (game.weeklies || []).forEach((task) => {
      const key = game.id + "." + (task.id || task.label);
      syncTaskWithCalendar(game, "weeklies", key);
    });
    (game.endgame || []).forEach((task) => {
      const key = game.id + "." + (task.id || task.label);
      syncTaskWithCalendar(game, "endgame", key);
    });
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
      if (game.dailies) syncTaskWithCalendar(game, "dailies", game.id);
      (game.weeklies || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        syncTaskWithCalendar(game, "weeklies", key);
      });
      (game.endgame || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        syncTaskWithCalendar(game, "endgame", key);
      });
    });

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
    state.endgameCompletionDates = snap.endgameCompletionDates || {};
    state.lastSimulationSnapshot = null;
    save();
    renderAll();
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function setModalOpen(open) {
    const el = qs("taskModal");
    if (!el) return;
    taskModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
  }

  function setGameModalOpen(open) {
    const el = qs("gameModal");
    if (!el) return;
    gameModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
  }

  function setDeleteGameModalOpen(open) {
    const el = qs("deleteGameModal");
    if (!el) return;
    deleteGameModalState.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
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
  }
  function closeClearGameDataModal() {
    const modal = qs("clearGameDataModal");
    if (modal) {
      clearGameDataModalGameId = null;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
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
  }
  function closeClearDataModal() {
    const modal = qs("clearDataModal");
    if (modal) {
      clearDataModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen) document.body.style.overflow = "";
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
    state.endgameCompletionDates = {};
    state.completionByDate = {};
    state.completionTimestamps = [];
    state.lastProcessedResets = { dailies: {}, weeklies: {}, endgame: {} };
    state.lastSimulationSnapshot = null;
    state.attendancePieInclude = {};
    state.dataPieInclude = {};
    state.extracurricularTasks = [];
    state.extracurricularCompleted = {};
    state.extracurricularCompletedAt = {};
    state.tab = state.defaultTab || "about";
    save();
    renderAll();
    closeClearDataModal();
    closeSettingsModal();
  }

  let calendarDayModal = { open: false, dateStr: null };

  function setCalendarDayModalOpen(open) {
    const el = qs("calendarDayModal");
    if (!el) return;
    calendarDayModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
  }

  function openCalendarDayModal(dateStr) {
    calendarDayModal.dateStr = dateStr;
    const titleEl = qs("calendarDayModalTitle");
    if (titleEl) titleEl.textContent = "Edit " + dateStr;
    const container = qs("calendarDayModalTasks");
    if (!container) return;
    container.innerHTML = "";
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const available = getTasksAvailableOnDate(dateStr);
    const checkboxes = [];
    const addTask = (item, type) => {
      const isCompleted = type === "dailies"
        ? dayData.dailies.includes(item.key)
        : type === "weeklies"
          ? dayData.weeklies.includes(item.key)
          : dayData.endgame.includes(item.key);
      const label = document.createElement("label");
      label.className = "calendar-day-modal-task calendar-day-modal-task-" + type;
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = isCompleted;
      check.dataset.type = type;
      check.dataset.key = item.key;
      label.appendChild(check);
      const span = document.createElement("span");
      span.textContent = labelAfterDash(item.label);
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
    }
    calendarDayModal.checkboxes = checkboxes;
    setCalendarDayModalOpen(true);
  }

  let earningsModal = { gameId: null, task: null };

  function openEarningsModal(gameId, task) {
    earningsModal.gameId = gameId;
    earningsModal.task = task;
    const key = gameId + "." + (task.id || task.label);
    const completedCount = getCompletedAmount(state.endgameCompleted, key);
    ensureEndgameEarnedArrayLength(gameId, task.id || task.label, completedCount);
    const earnedArr = getEndgameEarnedPerCompletion(gameId, task.id || task.label);
    const datesArr = getEndgameCompletionDates(gameId, task.id || task.label);

    const titleEl = qs("earningsModalTitle");
    if (titleEl) titleEl.textContent = "Completion History — " + (task.label || "Task");

    const listEl = qs("earningsModalList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (completedCount === 0 && earnedArr.length === 0) {
      const empty = document.createElement("p");
      empty.className = "earnings-modal-empty";
      empty.textContent = "No completions yet. Complete this task to add earnings.";
      listEl.appendChild(empty);
    } else {
    const itemCount = Math.max(earnedArr.length, completedCount, 1);
    for (let i = 0; i < itemCount; i++) {
      const cycleDates = getEndgameCycleDates(task, i);
      const stored = datesArr[i] || {};
      const startVal = stored.start || "";
      const endVal = stored.end || "";
      const dateLabel = startVal && endVal ? startVal + " — " + endVal : "(Start - End)";

      const item = document.createElement("div");
      item.className = "earnings-modal-item";
      const dateRow = document.createElement("div");
      dateRow.className = "earnings-modal-date-row";
      const dateDisplay = document.createElement("span");
      dateDisplay.className = "earnings-modal-date-display";
      dateDisplay.textContent = "Completion " + (i + 1) + ": " + dateLabel;
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
        dateDisplay.textContent = "Completion " + (i + 1) + ": " + (s && e ? s + " — " + e : "(Start - End)");
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
      item.appendChild(earnRow);
      listEl.appendChild(item);
    }
    }

    const modalEl = qs("earningsModal");
    if (modalEl) {
      modalEl.hidden = false;
      modalEl.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
  }

  function closeEarningsModal() {
    earningsModal.gameId = null;
    earningsModal.task = null;
    const modalEl = qs("earningsModal");
    if (modalEl) {
      modalEl.hidden = true;
      modalEl.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
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
    checkboxes.forEach(({ check, type, key }) => {
      const wasCompleted = (dayData[type] || []).includes(key);
      const nowCompleted = check.checked;
      if (nowCompleted) recordCompletion(dateStr, type, key);
      else unrecordCompletion(dateStr, type, key);
      if (wasCompleted !== nowCompleted) {
        if (type === "dailies") {
          const amt = getCompletedAmount(state.dailiesCompleted, key);
          state.dailiesCompleted[key] = nowCompleted ? amt + 1 : Math.max(0, amt - 1);
        } else if (type === "weeklies" || type === "endgame") {
          const completedObj = type === "weeklies" ? state.weekliesCompleted : state.endgameCompleted;
          const amt = getCompletedAmount(completedObj, key);
          completedObj[key] = nowCompleted ? amt + 1 : Math.max(0, amt - 1);
          if (type === "endgame") {
            const dot = key.indexOf(".");
            const gameId = dot >= 0 ? key.slice(0, dot) : key;
            const taskId = dot >= 0 ? key.slice(dot + 1) : "";
            ensureEndgameEarnedArrayLength(gameId, taskId, nowCompleted ? amt + 1 : Math.max(0, amt - 1));
          }
        }
      }
    });
    processResets();
    save();
    renderAll();
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
    const tempTask = {
      dateStarted,
      weekStartDay: taskModal.selectedDay,
      weekStartHour: hour,
      weekStartMinute: minute,
      frequencyEvery,
      frequencyUnit: taskModal.frequencyUnit || "week",
      timeLimitEvery,
      timeLimitUnit: taskModal.timeLimitUnit || "week",
    };
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
    const now = new Date();
    const cycleStart = new Date(now.getTime() - elapsedMs);
    const tz = getRecordingTimezone();
    const parts = getDatePartsInTimezone(cycleStart, tz);
    const dateStr = parts.year + "-" + String(parts.month + 1).padStart(2, "0") + "-" + String(parts.day).padStart(2, "0");
    const timeStr = timeToStr(parts.hour, parts.minute);
    dateInput.value = dateStr;
    resetTime.value = timeStr;
    input.value = formatRemainingMs(remainingMs);
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    if (dayOfWeek >= 0) updateDaySelection(dayOfWeek);
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
    }
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

    const dstToggle = qs("taskAdjustForDST");
    if (dstToggle) dstToggle.checked = task && task.adjustForDST !== false;

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
    setModalOpen(true);
    updateTaskTimeRemainingDisplay();

    // focus name input for quick typing
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function closeTaskModal() {
    setModalOpen(false);
    taskModal.gameId = null;
    taskModal.taskType = null;
    taskModal.taskId = null;
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
    if (!modal || !container) return;
    clearTimeTrendsModalOpen = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    container.innerHTML = "";
    container.className = "clear-time-trends-games timestamps-game-selector";
    container.style.display = "flex";
    container.style.flexWrap = "wrap";
    container.style.gap = "0.5rem";
    const games = getAllGames();
    const gameIdsWithData = new Set((state.completionTimestamps || []).map((t) => t.gameId));
    const selected = new Set(gameIdsWithData);
    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timestamps-game-pill clear-time-trends-pill";
      btn.textContent = game.name + (gameIdsWithData.has(game.id) ? " (" + (state.completionTimestamps || []).filter((t) => t.gameId === game.id).length + ")" : "");
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
      p.textContent = "No games to clear.";
      container.appendChild(p);
    }
  }
  function closeClearTimeTrendsModal() {
    const modal = qs("clearTimeTrendsModal");
    if (modal) {
      clearTimeTrendsModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen && !clearDataModalOpen && !timeTrendsDetailModalOpen) document.body.style.overflow = "";
    }
  }
  function confirmClearTimeTrends() {
    const container = qs("clearTimeTrendsModalGames");
    if (!container) return;
    const selectedIds = new Set();
    container.querySelectorAll('.clear-time-trends-pill.filled, .clear-time-trends-pill[aria-pressed="true"]').forEach((btn) => {
      selectedIds.add(btn.dataset.gameId);
    });
    if (selectedIds.size > 0 && state.completionTimestamps) {
      state.completionTimestamps = state.completionTimestamps.filter((t) => !selectedIds.has(t.gameId));
      const selected = state.timestampsSelectedGameIds || {};
      selectedIds.forEach((id) => delete selected[id]);
      if (Object.keys(selected).length === 0) state.timestampsSelectedGameIds = {};
      const endgameSelected = state.timestampsSelectedEndgameTasks || {};
      Object.keys(endgameSelected).forEach((k) => {
        if (selectedIds.has(k.split(".")[0])) delete endgameSelected[k];
      });
      if (Object.keys(endgameSelected).length === 0) state.timestampsSelectedEndgameTasks = {};
    }
    save();
    renderAll();
    closeClearTimeTrendsModal();
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
  }
  function closeTimeTrendsDetailModal() {
    const modal = qs("timeTrendsDetailModal");
    if (modal) {
      timeTrendsDetailModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen && !clearDataModalOpen) document.body.style.overflow = "";
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

  function initClearTimeTrendsModal() {
    const modalEl = qs("clearTimeTrendsModal");
    const closeBtn = qs("clearTimeTrendsModalClose");
    const cancelBtn = qs("clearTimeTrendsCancel");
    const confirmBtn = qs("clearTimeTrendsConfirm");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "clearTimeTrendsModal") closeClearTimeTrendsModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeClearTimeTrendsModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeClearTimeTrendsModal);
    if (confirmBtn) confirmBtn.addEventListener("click", confirmClearTimeTrends);
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
  }

  function closeSettingsModal() {
    const modalEl = qs("settingsModal");
    if (!modalEl) return;
    settingsModalOpen = false;
    modalEl.hidden = true;
    modalEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
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
    const rgb = hexToRgb(hex || "#7c3aed");
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
      swatch.style.background = preset.colors?.accent || "#7c3aed";
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
    setTimeout(() => input.focus(), 0);
  }

  function closeSavePresetModal() {
    const modal = qs("savePresetModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
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
  }

  function closeDeletePresetModal() {
    const modal = qs("deletePresetModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
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


    document.querySelectorAll(".settings-nav-item[data-settings-section]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.getAttribute("data-settings-section");
        document.querySelectorAll(".settings-nav-item[data-settings-section]").forEach((b) => {
          b.classList.remove("active");
          b.removeAttribute("aria-current");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-current", "page");
        document.querySelectorAll(".settings-section").forEach((sectionEl) => {
          sectionEl.classList.remove("active");
        });
        const target = document.getElementById("settings-section-" + section);
        if (target) target.classList.add("active");
      });
    });

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
      renderAll();
    });
    const dateFormatEl = qs("settingsDateFormat");
    if (dateFormatEl) dateFormatEl.addEventListener("change", () => {
      state.dateFormat = dateFormatEl.value || "mdy";
      save();
      renderAll();
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
      renderAll();
    });
    const firstDayEl = qs("settingsFirstDayOfWeek");
    if (firstDayEl) firstDayEl.addEventListener("change", () => {
      state.firstDayOfWeek = parseInt(firstDayEl.value, 10) || 0;
      save();
      renderAll();
    });
    const compactEl = qs("settingsCompactMode");
    if (compactEl) compactEl.addEventListener("change", () => {
      state.compactMode = compactEl.checked;
      applyCompactMode();
      save();
      renderAll();
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
      const payload = JSON.stringify({ [STORAGE_KEY]: localStorage.getItem(STORAGE_KEY) }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gacha-tracker-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    const importInput = qs("settingsImportInput");
    if (importInput) importInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const raw = parsed ? parsed[STORAGE_KEY] : null;
          if (!raw) throw new Error("Invalid backup file");
          const data = JSON.parse(raw);
          if (!data || !data.games) throw new Error("Invalid backup file");
          const keys = Object.keys(data);
          keys.forEach((k) => {
            if (state[k] !== undefined && k !== "lastSimulationSnapshot") state[k] = data[k];
          });
          state.lastSimulationSnapshot = null;
          save();
          load();
          renderAll();
          closeSettingsModal();
        } catch (err) {
          alert("Failed to import: " + (err.message || "Invalid file"));
        }
        importInput.value = "";
      };
      reader.readAsText(file);
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
    if (freqDay) freqDay.addEventListener("click", () => updateUnitToggles("frequency", "day"));
    if (freqWeek) freqWeek.addEventListener("click", () => updateUnitToggles("frequency", "week"));
    if (limDay) limDay.addEventListener("click", () => updateUnitToggles("timeLimit", "day"));
    if (limWeek) limWeek.addEventListener("click", () => updateUnitToggles("timeLimit", "week"));

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
      const frequencyEvery = Math.max(1, Number(freqEvery && freqEvery.value) || 1);
      const timeLimitEvery = Math.max(1, Number(limEvery && limEvery.value) || 1);
      const currency = Math.max(0, Number(currencyInput && currencyInput.value) || 0);
      const dateStarted = isValidDateStr(dateStartedInput && dateStartedInput.value) ? dateStartedInput.value : getDateStr();

      if (taskModal.taskType === "weeklies") {
        game.weeklies = game.weeklies || [];
        const existingIdx = taskModal.taskId ? game.weeklies.findIndex((t) => t.id === taskModal.taskId) : -1;
        const dstToggle = qs("taskAdjustForDST");
        const adjustForDST = dstToggle ? dstToggle.checked : true;
        const next = {
          id: taskModal.taskId || ("w_" + Date.now()),
          label,
          weekStartDay: taskModal.selectedDay,
          weekStartHour: hour,
          weekStartMinute: minute,
          currency,
          dateStarted,
          frequencyEvery,
          frequencyUnit: taskModal.frequencyUnit,
          timeLimitEvery,
          timeLimitUnit: taskModal.timeLimitUnit,
          adjustForDST,
        };
        if (existingIdx >= 0) game.weeklies[existingIdx] = { ...game.weeklies[existingIdx], ...next };
        else game.weeklies.push(next);
      } else if (taskModal.taskType === "endgame") {
        game.endgame = game.endgame || [];
        const existingIdx = taskModal.taskId ? game.endgame.findIndex((t) => t.id === taskModal.taskId) : -1;
        const dstToggle = qs("taskAdjustForDST");
        const adjustForDST = dstToggle ? dstToggle.checked : true;
        const next = {
          id: taskModal.taskId || ("e_" + Date.now()),
          label,
          currency,
          weekStartDay: taskModal.selectedDay,
          weekStartHour: hour,
          weekStartMinute: minute,
          dateStarted,
          frequencyEvery,
          frequencyUnit: taskModal.frequencyUnit,
          timeLimitEvery,
          timeLimitUnit: taskModal.timeLimitUnit,
          adjustForDST,
        };
        if (existingIdx >= 0) game.endgame[existingIdx] = { ...game.endgame[existingIdx], ...next };
        else game.endgame.push(next);
      } else {
        return;
      }

      save();
      closeTaskModal();
      renderAll();
    });
  }

  function addGame(name, opts) {
    const o = opts || {};
    const id = "g_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const weeklies = Array.isArray(o.weeklies) ? o.weeklies.map((t) => ({ ...t })) : [];
    const endgame = Array.isArray(o.endgame) ? o.endgame.map((t) => ({ ...t })) : [];
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
    if (game && o.presetId && (weeklies.length || endgame.length)) {
      const now = new Date();
      const todayStr = getDateStr();
      (game.weeklies || []).forEach((task) => {
        const key = id + "." + (task.id || task.label);
        const nextReset = new Date(now.getTime() + getWeeklyTimeRemainingMs(task, now, game));
        state.lastProcessedResets.weeklies = state.lastProcessedResets.weeklies || {};
        state.lastProcessedResets.weeklies[key] = getDateStr(new Date(nextReset.getTime() + 24 * 60 * 60 * 1000));
      });
      (game.endgame || []).forEach((task) => {
        const key = id + "." + (task.id || task.label);
        const cycleStart = getCycleStartForDate(task, todayStr, game);
        const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
        const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
        const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
        state.lastProcessedResets.endgame = state.lastProcessedResets.endgame || {};
        state.lastProcessedResets.endgame[key] = cycleStart.getTime() + timeLimitMs;
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
    renderAll();
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
    Object.keys(state.endgameCompletionDates || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgameCompletionDates[k];
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
    });
    state.extracurricularTasks = (state.extracurricularTasks || []).filter((t) => t.gameId !== gameId);

    if (state.dataSelectedGameId === gameId || state.gamesSelectedId === gameId) {
      const remaining = getAllGames();
      const nextId = remaining.length ? remaining[0].id : null;
      state.dataSelectedGameId = nextId;
      state.gamesSelectedId = nextId;
    }

    save();
    renderAll();
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
    renderAll();
  }

  function setWeekliesAttempted(gameId, taskId, value) {
    const key = gameId + "." + taskId;
    state.weekliesAttempted[key] = Math.max(0, Number(value) || 0);
    save();
    renderAll();
  }

  function setEndgameAttempted(gameId, taskId, value) {
    const key = gameId + "." + taskId;
    state.endgameAttempted[key] = Math.max(0, Number(value) || 0);
    save();
    renderAll();
  }

  function isCompletedToday(type, key) {
    const dateStr = type === "dailies"
      ? (() => { const g = getGame(key); return g ? getDailyPeriodDateStr(g, new Date()) : getDateStr(); })()
      : getDateStr();
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    return (dayData[type] || []).includes(key);
  }

  function toggleDaily(gameId) {
    const game = getGame(gameId);
    const dateStr = game ? getDailyPeriodDateStr(game, new Date()) : getDateStr();
    const amt = getCompletedAmount(state.dailiesCompleted, gameId);
    const isMarkingComplete = !isCompletedToday("dailies", gameId);
    if (isMarkingComplete) {
      state.dailiesCompleted[gameId] = amt + 1;
      recordCompletion(dateStr, "dailies", gameId);
    } else {
      state.dailiesCompleted[gameId] = Math.max(0, amt - 1);
      unrecordCompletion(dateStr, "dailies", gameId);
    }
    processResets();
    save();
    renderAll();
  }

  function toggleWeekly(gameId, taskId) {
    const key = gameId + "." + taskId;
    const dateStr = getDateStr();
    const amt = getCompletedAmount(state.weekliesCompleted, key);
    const isMarkingComplete = !isWeeklyCompletedInCurrentCycle(key, dateStr);
    if (isMarkingComplete) {
      state.weekliesCompleted[key] = amt + 1;
      recordCompletion(dateStr, "weeklies", key);
    } else {
      const completedDateStr = getWeeklyCompletionDateInCurrentCycle(key, dateStr);
      if (completedDateStr) unrecordCompletion(completedDateStr, "weeklies", key);
      state.weekliesCompleted[key] = Math.max(0, amt - 1);
    }
    processResets();
    save();
    renderAll();
  }

  function toggleEndgame(gameId, taskId) {
    const key = gameId + "." + taskId;
    const dateStr = getDateStr();
    const amt = getCompletedAmount(state.endgameCompleted, key);
    const isMarkingComplete = !isEndgameCompletedInCurrentCycle(key, dateStr);
    if (isMarkingComplete) {
      state.endgameCompleted[key] = amt + 1;
      recordCompletion(dateStr, "endgame", key);
      ensureEndgameEarnedArrayLength(gameId, taskId, amt + 1);
    } else {
      const completedDateStr = getEndgameCompletionDateInCurrentCycle(key, dateStr);
      if (completedDateStr) unrecordCompletion(completedDateStr, "endgame", key);
      state.endgameCompleted[key] = Math.max(0, amt - 1);
      ensureEndgameEarnedArrayLength(gameId, taskId, Math.max(0, amt - 1));
    }
    processResets();
    save();
    renderAll();
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

  function setEndgameEarnedAt(gameId, taskId, index, value) {
    if (!state.endgameCurrencyEarned[gameId]) state.endgameCurrencyEarned[gameId] = {};
    let arr = state.endgameCurrencyEarned[gameId][taskId];
    if (!Array.isArray(arr)) arr = [];
    while (arr.length <= index) arr.push(0);
    arr[index] = Math.max(0, Number(value) || 0);
    state.endgameCurrencyEarned[gameId][taskId] = arr;
    save();
    renderAll();
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
    renderAll();
  }

  function getEndgameEarned(gameId, taskId) {
    const arr = getEndgameEarnedPerCompletion(gameId, taskId);
    return arr.reduce((s, x) => s + (Number(x) || 0), 0);
  }

  function getEndgamePotential(task) {
    return Math.max(0, Number(task && task.currency) || 0);
  }

  function getCurrencyLabel(game) {
    const name = game && game.currencyName && String(game.currencyName).trim();
    return name || "Currency";
  }

  function getGameEarnedAndPotential(game) {
    if (!game) return null;
    const dEarned = game.dailies ? getCompletedAmount(state.dailiesCompleted, game.id) * getDailyPotential(game) : 0;
    const dPotential = game.dailies ? getAttemptedAmount(state.dailiesAttempted, game.id) * getDailyPotential(game) : 0;
    let wEarned = 0, wPotential = 0;
    (game.weeklies || []).forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      const pot = getWeeklyPotential(t);
      wEarned += getCompletedAmount(state.weekliesCompleted, key) * pot;
      wPotential += getAttemptedAmount(state.weekliesAttempted, key) * pot;
    });
    let eEarned = 0, ePotential = 0;
    (game.endgame || []).forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      const pot = getEndgamePotential(t);
      eEarned += getEndgameEarned(game.id, t.id || t.label);
      ePotential += getAttemptedAmount(state.endgameAttempted, key) * pot;
    });
    let xEarned = 0, xPotential = 0;
    (state.extracurricularTasks || []).forEach((t) => {
      if (t.gameId !== game.id) return;
      const cur = Math.max(0, Number(t.currency) || 0);
      if (cur <= 0) return;
      xPotential += cur;
      if (state.extracurricularCompleted[t.id]) xEarned += cur;
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
    return getEffectiveResetHour ? getEffectiveResetHour(server, new Date()) : getDefaultResetHour();
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
    const offsetRef = new Date();
    return getNextResetDateInTimezone(now, hour, minute, tz, offsetRef);
  }

  function updateSidebarTime() {
    const now = new Date();
    const tz = getAppTimezone();
    const recTz = getRecordingTimezone();
    const parts = getDatePartsInTimezone(now, tz);
    const dateEl = document.getElementById("currentDate");
    if (dateEl) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = monthNames[parts.month];
      dateEl.textContent = parts.weekday + ", " + month + " " + parts.day + ", " + parts.year;
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
    updateFormatButtons();
  }

  function updateFormatButtons() {
    ["dailies", "weeklies", "endgame", "extracurricular"].forEach((panel) => {
      const view = state[panel + "View"] || "list";
      const wrap = document.getElementById("format-toggle-" + panel);
      if (!wrap) return;
      wrap.querySelectorAll(".format-btn").forEach((btn) => {
        const isActive = btn.dataset.format === view;
        btn.classList.toggle("active", isActive);
      });
    });
  }

  function initFormatToggles() {
    document.querySelectorAll(".format-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.dataset.panel;
        const format = btn.dataset.format;
        if (!panel || !format) return;
        const key = panel + "View";
        if (state[key] !== format) {
          state[key] = format;
          save();
          renderAll();
        }
      });
    });
  }


  function buildDailyTaskItem(game, tagName) {
    const doneToday = isCompletedToday("dailies", game.id);
    const el = document.createElement(tagName || "li");
    el.className = "task-item" + (doneToday ? " done" : "");

    const top = document.createElement("div");
    top.className = "task-top";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = game.name || game.id;
    const potSpan = document.createElement("span");
    potSpan.className = "task-potential";
    potSpan.textContent = "Potential: " + getDailyPotential(game);
    top.appendChild(span);
    top.appendChild(potSpan);
    el.appendChild(top);

    const sub = document.createElement("div");
    sub.className = "task-subrows";
    const row1 = document.createElement("div");
    row1.className = "task-subrow";
    const left1 = document.createElement("div");
    left1.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    check.setAttribute("aria-label", doneToday ? "Mark incomplete" : "Mark complete");
    check.addEventListener("click", () => toggleDaily(game.id));
    const label1 = document.createElement("span");
    label1.innerHTML = "<strong>Completion Status:</strong> " + (doneToday ? "Complete" : "Incomplete");
    span.addEventListener("click", () => toggleDaily(game.id));
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
    remainingVal.dataset.type = "daily";
    remainingVal.dataset.gameId = game.id;
    remainingVal.textContent = getDailyTimeRemainingText(game, new Date());
    remainingRow.appendChild(remainingVal);
    sub.appendChild(remainingRow);

    el.appendChild(sub);
    return el;
  }

  function renderDailies() {
    const content = document.getElementById("dailies-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const isGrid = state.dailiesView === "grid";
    const tag = isGrid ? "div" : "li";
    const list = document.createElement(isGrid ? "div" : "ul");
    list.id = "list-dailies";
    list.className = isGrid ? "task-grid" : "task-list";
    list.setAttribute("data-type", "dailies");

    let hasAny = false;
    games.forEach((game) => {
      if (!game.dailies) return;
      hasAny = true;
      list.appendChild(buildDailyTaskItem(game, tag));
    });
    if (!hasAny) {
      const empty = document.createElement(tag);
      empty.className = "empty-state";
      if (!isGrid) empty.setAttribute("data-list-empty", "1");
      empty.textContent = "No games yet. Add one in the Games tab.";
      if (isGrid) {
        empty.style.gridColumn = "1 / -1";
      }
      list.appendChild(empty);
    }
    content.appendChild(list);
  }


  function buildWeeklyTaskItem(game, task, tagName) {
    const key = game.id + "." + (task.id || task.label);
    const doneToday = isWeeklyCompletedInCurrentCycle(key, getDateStr());
    const el = document.createElement(tagName || "li");
    el.className = "task-item" + (doneToday ? " done" : "");

    const top = document.createElement("div");
    top.className = "task-top";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label || "Weekly";
    const potSpan = document.createElement("span");
    potSpan.className = "task-potential";
    potSpan.textContent = "Potential: " + getWeeklyPotential(task);
    top.appendChild(span);
    top.appendChild(potSpan);
    el.appendChild(top);

    const sub = document.createElement("div");
    sub.className = "task-subrows";
    const row1 = document.createElement("div");
    row1.className = "task-subrow";
    const left1 = document.createElement("div");
    left1.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    check.setAttribute("aria-label", doneToday ? "Mark incomplete" : "Mark complete");
    check.addEventListener("click", () => toggleWeekly(game.id, task.id || task.label));
    const label1 = document.createElement("span");
    label1.innerHTML = "<strong>Completion Status:</strong> " + (doneToday ? "Complete" : "Incomplete");
    span.addEventListener("click", () => toggleWeekly(game.id, task.id || task.label));
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
    remainingVal.dataset.type = "weekly";
    remainingVal.dataset.gameId = game.id;
    remainingVal.dataset.taskId = (task.id || task.label);
    remainingVal.textContent = getWeeklyTimeRemainingText(task, new Date(), game);
    remainingRow.appendChild(remainingVal);
    sub.appendChild(remainingRow);

    el.appendChild(sub);
    return el;
  }

  function renderWeeklies() {
    const content = document.getElementById("weeklies-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const isGrid = state.weekliesView === "grid";

    if (games.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No tasks yet. Add one above.";
      content.appendChild(p);
      return;
    }

    if (isGrid) {
      const list = document.createElement("div");
      list.id = "list-weeklies";
      list.className = "task-grid";
      list.setAttribute("data-type", "weeklies");
      let hasAny = false;
      games.forEach((game) => {
        (game.weeklies || []).forEach((task) => {
          hasAny = true;
          const card = buildWeeklyTaskItem(game, task, "div");
          const gameLabel = document.createElement("div");
          gameLabel.className = "task-grid-game-label";
          gameLabel.textContent = game.name;
          card.insertBefore(gameLabel, card.firstChild);
          list.appendChild(card);
        });
      });
      if (!hasAny) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.style.gridColumn = "1 / -1";
        empty.textContent = "No tasks yet. Add tasks in the Games tab.";
        list.appendChild(empty);
      }
      content.appendChild(list);
    } else {
      let hasAny = false;
      const container = document.createElement("div");
      container.id = "list-weeklies";
      container.className = "game-sections-container";
      container.setAttribute("data-type", "weeklies");
      games.forEach((game) => {
        const tasks = game.weeklies || [];
        if (tasks.length === 0) return;
        hasAny = true;
        const section = document.createElement("div");
        section.className = "game-section";
        const heading = document.createElement("h3");
        heading.className = "game-section-title";
        heading.textContent = game.name;
        section.appendChild(heading);
        const ul = document.createElement("ul");
        ul.className = "task-list";
        tasks.forEach((task) => {
          ul.appendChild(buildWeeklyTaskItem(game, task, "li"));
        });
        section.appendChild(ul);
        container.appendChild(section);
      });
      if (!hasAny) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.textContent = "No tasks yet. Add tasks in the Games tab.";
        container.appendChild(p);
      }
      content.appendChild(container);
    }
  }


  function buildEndgameTaskItem(game, task, tagName) {
    const key = game.id + "." + (task.id || task.label);
    const doneToday = isEndgameCompletedInCurrentCycle(key, getDateStr());
    const el = document.createElement(tagName || "li");
    el.className = "task-item" + (doneToday ? " done" : "");

    const top = document.createElement("div");
    top.className = "task-top";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label || "Endgame";
    const potSpan = document.createElement("span");
    potSpan.className = "task-potential";
    potSpan.textContent = "Potential: " + getEndgamePotential(task);
    top.appendChild(span);
    top.appendChild(potSpan);
    el.appendChild(top);

    const sub = document.createElement("div");
    sub.className = "task-subrows";

    const row1 = document.createElement("div");
    row1.className = "task-subrow";
    const left1 = document.createElement("div");
    left1.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    check.setAttribute("aria-label", doneToday ? "Mark incomplete" : "Mark complete");
    check.addEventListener("click", () => toggleEndgame(game.id, task.id || task.label));
    const label1 = document.createElement("span");
    label1.innerHTML = "<strong>Completion Status:</strong> " + (doneToday ? "Complete" : "Incomplete");
    span.addEventListener("click", () => toggleEndgame(game.id, task.id || task.label));
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
    remainingVal.textContent = getEndgameTimeRemainingText(task, new Date(), game);
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
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.placeholder = "0";
    const currentIdx = completedCount > 0 ? completedCount - 1 : 0;
    inp.value = completedCount > 0 ? String(earnedArr[currentIdx] || 0) : "";
    inp.title = "Amount earned for the current cycle";
    inp.addEventListener("change", () => setEndgameEarnedAt(game.id, task.id || task.label, currentIdx, inp.value));
    row2.appendChild(inp);
    sub.appendChild(row2);

    el.appendChild(sub);
    return el;
  }

  function renderEndgame() {
    const content = document.getElementById("endgame-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const isGrid = state.endgameView === "grid";

    if (games.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No tasks yet. Add one above.";
      content.appendChild(p);
      return;
    }

    if (isGrid) {
      const list = document.createElement("div");
      list.id = "list-endgame";
      list.className = "task-grid";
      list.setAttribute("data-type", "endgame");
      let hasAny = false;
      games.forEach((game) => {
        (game.endgame || []).forEach((task) => {
          hasAny = true;
          const card = buildEndgameTaskItem(game, task, "div");
          const gameLabel = document.createElement("div");
          gameLabel.className = "task-grid-game-label";
          gameLabel.textContent = game.name;
          card.insertBefore(gameLabel, card.firstChild);
          list.appendChild(card);
        });
      });
      if (!hasAny) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.style.gridColumn = "1 / -1";
        empty.textContent = "No tasks yet. Add tasks in the Games tab.";
        list.appendChild(empty);
      }
      content.appendChild(list);
    } else {
      let hasAny = false;
      const container = document.createElement("div");
      container.id = "list-endgame";
      container.className = "game-sections-container";
      container.setAttribute("data-type", "endgame");
      games.forEach((game) => {
        const tasks = game.endgame || [];
        if (tasks.length === 0) return;
        hasAny = true;
        const section = document.createElement("div");
        section.className = "game-section";
        const heading = document.createElement("h3");
        heading.className = "game-section-title";
        heading.textContent = game.name;
        section.appendChild(heading);
        const ul = document.createElement("ul");
        ul.className = "task-list";
        tasks.forEach((task) => {
          ul.appendChild(buildEndgameTaskItem(game, task, "li"));
        });
        section.appendChild(ul);
        container.appendChild(section);
      });
      if (!hasAny) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.textContent = "No tasks yet. Add tasks in the Games tab.";
        container.appendChild(p);
      }
      content.appendChild(container);
    }
  }

  function updateTaskRemainingTexts() {
    const tab = state.tab;
    if (tab !== "dailies" && tab !== "weeklies" && tab !== "endgame" && tab !== "home") return;
    const now = new Date();
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


  function getHistoryDWEForDate(dateStr) {
    const available = getTasksAvailableOnDate(dateStr);
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    return {
      dCompleted: (dayData.dailies || []).length,
      dTotal: (available.dailies || []).length,
      wCompleted: (dayData.weeklies || []).length,
      wTotal: (available.weeklies || []).length,
      eCompleted: (dayData.endgame || []).length,
      eTotal: (available.endgame || []).length,
    };
  }

  function getHistoryCompletedTaskLabels(dateStr) {
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const labels = { dailies: [], weeklies: [], endgame: [] };
    (dayData.dailies || []).forEach((gameId) => {
      const game = getGame(gameId);
      labels.dailies.push(game ? game.name : gameId);
    });
    (dayData.weeklies || []).forEach((key) => {
      const dot = key.indexOf(".");
      const gId = dot >= 0 ? key.slice(0, dot) : key;
      const tId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gId);
      const task = (game?.weeklies || []).find((t) => (t.id || t.label) === tId);
      labels.weeklies.push(task ? task.label : tId);
    });
    (dayData.endgame || []).forEach((key) => {
      const dot = key.indexOf(".");
      const gId = dot >= 0 ? key.slice(0, dot) : key;
      const tId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gId);
      const task = (game?.endgame || []).find((t) => (t.id || t.label) === tId);
      labels.endgame.push(task ? task.label : tId);
    });
    return labels;
  }

  function renderAttendanceHistory(container) {
    const now = new Date();
    let month = state.historyMonth != null ? Number(state.historyMonth) : now.getMonth();
    let year = state.historyYear != null ? Number(state.historyYear) : now.getFullYear();
    if (!Number.isFinite(month) || month < 0 || month > 11) month = now.getMonth();
    if (!Number.isFinite(year) || year < 1970 || year > 2100) year = now.getFullYear();
    const todayStr = getDateStr();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const header = document.createElement("div");
    header.className = "history-header";
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
    prevBtn.addEventListener("click", () => {
      if (month === 0) {
        state.historyMonth = 11;
        state.historyYear = (state.historyYear != null ? state.historyYear : now.getFullYear()) - 1;
      } else {
        state.historyMonth = month - 1;
      }
      save();
      renderAll();
    });
    const monthLabel = document.createElement("span");
    monthLabel.className = "history-month-label";
    monthLabel.textContent = monthNames[month] + " " + year;
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn-ghost";
    nextBtn.textContent = "Next ›";
    nextBtn.addEventListener("click", () => {
      if (month === 11) {
        state.historyMonth = 0;
        state.historyYear = (state.historyYear != null ? state.historyYear : now.getFullYear()) + 1;
      } else {
        state.historyMonth = month + 1;
      }
      save();
      renderAll();
    });
    controls.appendChild(prevBtn);
    controls.appendChild(monthLabel);
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
      renderAll();
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
      renderAll();
    });
    header.appendChild(weeklyBtn);
    header.appendChild(timestampsBtn);
    container.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "history-calendar-grid";
    const firstDay = state.firstDayOfWeek === 1 ? 1 : 0;
    const dayNamesOrdered = firstDay === 1 ? [...DAY_NAMES.slice(1), DAY_NAMES[0]] : DAY_NAMES;
    for (let i = 0; i < 7; i++) {
      const th = document.createElement("div");
      th.className = "history-calendar-weekday";
      th.textContent = dayNamesOrdered[i];
      grid.appendChild(th);
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
    function bar(typeLetter, completed, total, labels, typeName) {
      const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
      const wrap = document.createElement("div");
      wrap.className = "history-dwe-bar-wrap history-dwe-bar-wrap-" + typeName;
      const label = document.createElement("span");
      label.className = "history-dwe-label";
      label.textContent = typeLetter;
      wrap.appendChild(label);
      const barEl = document.createElement("div");
      barEl.className = "history-dwe-bar history-dwe-bar-" + typeLetter.toLowerCase();
      barEl.innerHTML = "<span class=\"history-dwe-fill\" style=\"width:" + pct + "%\"></span><span class=\"history-dwe-fraction\">" + escapeHtml(String(completed) + "/" + String(total)) + "</span>";
      wrap.appendChild(barEl);
      if (labels && labels.length > 0) {
        const tooltip = document.createElement("div");
        tooltip.className = "history-dwe-tooltip history-dwe-tooltip-" + typeName;
        tooltip.setAttribute("role", "tooltip");
        const span = document.createElement("span");
        span.className = "history-dwe-tooltip-item attendance-tooltip-" + typeName;
        span.textContent = labels.join(", ");
        tooltip.appendChild(span);
        wrap.appendChild(tooltip);
      }
      return wrap;
    }
    cellDates.forEach(({ date, dateStr, isCurrentMonth, dayNum }) => {
      const cell = document.createElement("div");
      cell.className = "history-calendar-day";
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
      editBtn.setAttribute("aria-label", "Edit " + dateStr);
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openCalendarDayModal(dateStr);
      });
      topRow.appendChild(editBtn);
      cell.appendChild(topRow);
      const dwe = getHistoryDWEForDate(dateStr);
      const taskLabels = getHistoryCompletedTaskLabels(dateStr);
      cell.appendChild(bar("D", dwe.dCompleted, dwe.dTotal, taskLabels.dailies, "dailies"));
      cell.appendChild(bar("W", dwe.wCompleted, dwe.wTotal, taskLabels.weeklies, "weeklies"));
      cell.appendChild(bar("E", dwe.eCompleted, dwe.eTotal, taskLabels.endgame, "endgame"));
      grid.appendChild(cell);
    });
    container.appendChild(grid);
  }

  function renderAttendance() {
    const container = document.getElementById("attendanceContainer");
    if (!container) return;
    container.innerHTML = "";
    const games = getAllGames();
    if (games.length === 0) {
      container.innerHTML = '<p class="empty-state">No games yet. Add one in the Games tab.</p>';
      return;
    }
    if (state.attendanceView === "history") {
      renderAttendanceHistory(container);
      return;
    }
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
        renderAll();
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
    pieRow.innerHTML =
      "<div class=\"pie-box\"><h3>Dailies</h3><div class=\"pie-chart\" style=\"--pct: " + (pctD / 100 * 360) + "deg\"></div><div class=\"pie-legend\">" + dDone + "/" + dTotal + " (" + pctD + "%)</div></div>" +
      "<div class=\"pie-box\"><h3>Weeklies</h3><div class=\"pie-chart\" style=\"--pct: " + (pctW / 100 * 360) + "deg\"></div><div class=\"pie-legend\">" + wDone + "/" + wTotal + " (" + pctW + "%)</div></div>" +
      "<div class=\"pie-box\"><h3>Endgame</h3><div class=\"pie-chart\" style=\"--pct: " + (pctE / 100 * 360) + "deg\"></div><div class=\"pie-legend\">" + eDone + "/" + eTotal + " (" + pctE + "%)</div></div>";
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
      const now = new Date();
      if (state.historyMonth == null) state.historyMonth = now.getMonth();
      if (state.historyYear == null) state.historyYear = now.getFullYear();
      save();
      renderAll();
    });
    const timestampsBtn = document.createElement("button");
    timestampsBtn.type = "button";
    timestampsBtn.className = "btn btn-ghost";
    timestampsBtn.textContent = "Time Trends";
    timestampsBtn.addEventListener("click", () => {
      state.attendanceView = "timestamps";
      save();
      renderAll();
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
      const completedCount = dayData.dailies.length + dayData.weeklies.length + dayData.endgame.length;
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
        dayData.weeklies.forEach((key) => {
          const dot = key.indexOf(".");
          const gId = dot >= 0 ? key.slice(0, dot) : key;
          const tId = dot >= 0 ? key.slice(dot + 1) : "";
          const game = getGame(gId);
          const task = (game?.weeklies || []).find((t) => (t.id || t.label) === tId);
          addPart(task ? task.label : tId, "weeklies");
        });
        dayData.endgame.forEach((key) => {
          const dot = key.indexOf(".");
          const gId = dot >= 0 ? key.slice(0, dot) : key;
          const tId = dot >= 0 ? key.slice(dot + 1) : "";
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

  function renderAttendanceTimestamps(container) {
    const games = getAllGames();
    const selected = state.timestampsSelectedGameIds || {};
    const showAll = Object.keys(selected).length === 0;
    const timestamps = (state.completionTimestamps || []).filter((t) => showAll || selected[t.gameId]);

    const header = document.createElement("div");
    header.className = "history-header";
    const title = document.createElement("h3");
    title.className = "data-section-label";
    title.textContent = "Completion time trends";
    header.appendChild(title);
    const clearTrendsBtn = document.createElement("button");
    clearTrendsBtn.type = "button";
    clearTrendsBtn.className = "btn btn-ghost";
    clearTrendsBtn.textContent = "Clear Time Trends data";
    clearTrendsBtn.title = "Remove all completion timestamps (keeps other data)";
    clearTrendsBtn.style.marginLeft = "0.5rem";
    clearTrendsBtn.addEventListener("click", () => openClearTimeTrendsModal());
    header.appendChild(clearTrendsBtn);
    const weeklyBtn = document.createElement("button");
    weeklyBtn.type = "button";
    weeklyBtn.className = "btn btn-ghost";
    weeklyBtn.textContent = "← Weekly";
    weeklyBtn.style.marginLeft = "0.5rem";
    weeklyBtn.addEventListener("click", () => {
      state.attendanceView = "weekly";
      save();
      renderAll();
    });
    header.appendChild(weeklyBtn);
    container.appendChild(header);

    const gameLabel = document.createElement("h4");
    gameLabel.className = "data-section-label";
    gameLabel.textContent = "Show games";
    gameLabel.style.marginTop = "1rem";
    container.appendChild(gameLabel);
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
        if (showAll || selected[game.id]) {
          if (showAll) {
            const others = games.filter((g) => g.id !== game.id).map((g) => g.id);
            state.timestampsSelectedGameIds = {};
            others.forEach((id) => { state.timestampsSelectedGameIds[id] = true; });
          } else {
            delete state.timestampsSelectedGameIds[game.id];
          }
          if (Object.keys(state.timestampsSelectedGameIds).length === 0) state.timestampsSelectedGameIds = {};
        } else {
          state.timestampsSelectedGameIds[game.id] = true;
          if (Object.keys(state.timestampsSelectedGameIds).length === games.length) state.timestampsSelectedGameIds = {};
        }
        save();
        renderAll();
      });
      gameWrap.appendChild(btn);
    });
    container.appendChild(gameWrap);

    const hourCountsByType = { dailies: Array(24).fill(0), weeklies: Array(24).fill(0), endgame: Array(24).fill(0) };
    const hourDetails = Array(24).fill(null).map(() => []);
    timestamps.forEach((t) => {
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
      col.title = h + ":00 – Dailies: " + hourCountsByType.dailies[h] + ", Weeklies: " + hourCountsByType.weeklies[h] + ", Endgame: " + hourCountsByType.endgame[h];
      col.style.cursor = "pointer";
      col.addEventListener("click", () => {
        openTimeTrendsDetailModal(h + ":00 completions", hourDetails[h] || []);
      });
      barWrap.appendChild(col);
      const tooltip = document.createElement("div");
      tooltip.className = "timestamps-hour-tooltip";
      tooltip.textContent = h + ":00 – Dailies: " + hourCountsByType.dailies[h] + ", Weeklies: " + hourCountsByType.weeklies[h] + ", Endgame: " + hourCountsByType.endgame[h];
      col.appendChild(tooltip);
    }
    container.appendChild(barWrap);

    const weekliesOnly = timestamps.filter((t) => t.taskType === "weeklies");
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const dayDetails = [[], [], [], [], [], [], []];
    weekliesOnly.forEach((t) => {
      const d = new Date(t.dateStr + "T12:00:00");
      const day = d.getDay();
      dayCounts[day]++;
      const game = getGame(t.gameId);
      dayDetails[day].push({ gameName: game ? game.name : t.gameId, taskLabel: t.taskLabel, dateStr: t.dateStr });
    });

    const weekliesLabel = document.createElement("h4");
    weekliesLabel.className = "data-section-label";
    weekliesLabel.textContent = "Weeklies completed by day of week";
    weekliesLabel.style.marginTop = "1.5rem";
    container.appendChild(weekliesLabel);
    const maxDayCount = Math.max(1, ...dayCounts);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekliesBarWrap = document.createElement("div");
    weekliesBarWrap.className = "timestamps-bar-graph timestamps-weeklies-bar-graph";
    weekliesBarWrap.style.gridTemplateColumns = "repeat(7, 1fr)";
    weekliesBarWrap.style.minHeight = "120px";
    weekliesBarWrap.style.alignItems = "end";
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
      bar.style.background = "var(--pie-weeklies)";
      col.appendChild(bar);
      const lbl = document.createElement("span");
      lbl.className = "timestamps-bar-label";
      lbl.textContent = dayNames[i];
      col.appendChild(lbl);
      const countLbl = document.createElement("span");
      countLbl.className = "timestamps-bar-count";
      countLbl.textContent = dayCounts[i];
      countLbl.style.fontSize = "0.75rem";
      countLbl.style.fontWeight = "600";
      countLbl.style.color = "var(--text)";
      col.appendChild(countLbl);
      col.title = dayNames[i] + " – " + dayCounts[i] + " completion(s)";
      col.style.cursor = "pointer";
      col.addEventListener("click", () => {
        openTimeTrendsDetailModal(dayNames[i] + " completions", dayDetails[i] || []);
      });
      weekliesBarWrap.appendChild(col);
    }
    container.appendChild(weekliesBarWrap);

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
    const showAllEndgameTasks = Object.keys(endgameTaskSelected).length === 0;

    const endgameTaskLabel = document.createElement("h4");
    endgameTaskLabel.className = "data-section-label";
    endgameTaskLabel.textContent = "Endgame tasks";
    endgameTaskLabel.style.marginTop = "1.5rem";
    container.appendChild(endgameTaskLabel);
    const endgameTaskWrap = document.createElement("div");
    endgameTaskWrap.className = "timestamps-game-selector";
    endgameTaskWrap.style.display = "flex";
    endgameTaskWrap.style.flexWrap = "wrap";
    endgameTaskWrap.style.gap = "0.5rem";
    endgameTaskWrap.style.marginBottom = "0.75rem";
    allEndgameTasks.forEach(({ key, gameName, taskLabel }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timestamps-game-pill timestamps-endgame-pill";
      btn.textContent = taskLabel + (games.length > 1 ? " (" + gameName + ")" : "");
      btn.setAttribute("aria-pressed", (showAllEndgameTasks || endgameTaskSelected[key]) ? "true" : "false");
      if (showAllEndgameTasks || endgameTaskSelected[key]) btn.classList.add("filled");
      btn.addEventListener("click", () => {
        if (showAllEndgameTasks || endgameTaskSelected[key]) {
          if (showAllEndgameTasks) {
            const others = allEndgameTasks.filter((et) => et.key !== key).map((et) => et.key);
            state.timestampsSelectedEndgameTasks = {};
            others.forEach((k) => { state.timestampsSelectedEndgameTasks[k] = true; });
          } else {
            delete state.timestampsSelectedEndgameTasks[key];
          }
          if (Object.keys(state.timestampsSelectedEndgameTasks).length === 0) state.timestampsSelectedEndgameTasks = {};
        } else {
          state.timestampsSelectedEndgameTasks[key] = true;
          if (Object.keys(state.timestampsSelectedEndgameTasks).length === allEndgameTasks.length) state.timestampsSelectedEndgameTasks = {};
        }
        save();
        renderAll();
      });
      endgameTaskWrap.appendChild(btn);
    });
    container.appendChild(endgameTaskWrap);

    const filteredEndgame = endgameOnly.filter((t) => {
      const key = t.gameId + "." + t.taskId;
      return showAllEndgameTasks || endgameTaskSelected[key];
    });
    const taskPoints = {};
    [...filteredEndgame].sort((a, b) => {
      const da = a.dateStr + "T" + String(a.hour).padStart(2, "0") + ":00";
      const db = b.dateStr + "T" + String(b.hour).padStart(2, "0") + ":00";
      return da.localeCompare(db);
    }).forEach((t) => {
      const key = t.gameId + "." + t.taskId;
      const game = getGame(t.gameId);
      const task = (game?.endgame || []).find((et) => (et.id || et.label) === t.taskId);
      if (!game || !task) return;
      const cycleStart = getCycleStartForDate(task, t.dateStr, game);
      const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
      const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
      const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
      const cycleEndMs = cycleStart.getTime() + timeLimitMs;
      const completionMs = new Date(t.dateStr + "T" + String(t.hour).padStart(2, "0") + ":00:00").getTime();
      const cycleLen = cycleEndMs - cycleStart.getTime();
      if (cycleLen <= 0) return;
      let pct = ((cycleEndMs - completionMs) / cycleLen) * 100;
      pct = Math.max(0, Math.min(100, pct));
      if (!taskPoints[key]) taskPoints[key] = { label: t.taskLabel, points: [] };
      taskPoints[key].points.push(pct);
    });

    const endgameLabel = document.createElement("h4");
    endgameLabel.className = "data-section-label";
    endgameLabel.textContent = "Endgame trend: completion # vs % time remaining (100% = start of cycle, 0% = deadline)";
    endgameLabel.style.marginTop = "1rem";
    container.appendChild(endgameLabel);
    const lineGraphWrap = document.createElement("div");
    lineGraphWrap.className = "timestamps-line-graph";
    const graphWidth = 400;
    const graphHeight = 200;
    const padding = { top: 20, right: 20, bottom: 40, left: 45 };
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
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const colors = ["var(--pie-endgame)", "var(--pie-dailies)", "var(--pie-weeklies)", "#f472b6", "#fbbf24"];
    Object.keys(taskPoints).forEach((key, idx) => {
      const tp = taskPoints[key];
      if (tp.points.length === 0) return;
      const pathD = tp.points.map((pct, i) => {
        const x = padding.left + (i / xDivisor) * plotWidth;
        const y = padding.top + plotHeight - (pct / 100) * plotHeight;
        return (i === 0 ? "M" : "L") + x + "," + y;
      }).join(" ");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", colors[idx % colors.length]);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
      tp.points.forEach((pct, i) => {
        const x = padding.left + (i / xDivisor) * plotWidth;
        const y = padding.top + plotHeight - (pct / 100) * plotHeight;
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", "4");
        circle.setAttribute("fill", colors[idx % colors.length]);
        circle.setAttribute("stroke", "var(--bg)");
        circle.setAttribute("stroke-width", "1");
        svg.appendChild(circle);
      });
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
      item.appendChild(document.createTextNode(escapeHtml(tp.label)));
      legendWrap.appendChild(item);
    });
    lineGraphWrap.appendChild(svg);
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

  const CURRENCY_PIE_COLORS = ["#34d399", "#7c3aed", "#60a5fa", "#f472b6", "#fbbf24", "#22d3ee", "#a78bfa", "#fb923c"];

  function createCompletionPieBox(title, completed, total, useCleared) {
    const skipped = total - completed;
    const pct = total ? (completed / total) * 360 : 0;
    const labelDone = useCleared ? "Cleared" : "Completed";
    const box = document.createElement("div");
    box.className = "pie-box";
    box.innerHTML =
      "<h3>" + escapeHtml(title) + "</h3>" +
      "<div class=\"pie-chart\" style=\"--pct: " + pct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">" + labelDone + ": " + completed + " (" + (total ? Math.round((completed / total) * 100) : 0) + "%)</span>" +
      "<span class=\"pie-legend-item skipped\">Skipped: " + skipped + " (" + (total ? Math.round((skipped / total) * 100) : 0) + "%)</span>" +
      "</div>";
    return box;
  }

  function createEndgameCurrencyPieBox(task, earned, attempted) {
    const potential = Math.max(0, Number(task && task.currency) || 0) * Math.max(0, attempted);
    const total = Math.max(potential, earned, 1);
    const earnedPct = total ? (earned / total) * 360 : 0;
    const box = document.createElement("div");
    box.className = "pie-box";
    if (total === 0 || (earned === 0 && potential === 0)) {
      box.innerHTML =
        "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
        "<div class=\"pie-chart pie-chart-empty\"></div>" +
        "<div class=\"pie-legend\">No currency earned yet</div>";
      return box;
    }
    box.innerHTML =
      "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
      "<div class=\"pie-chart\" style=\"--pct: " + earnedPct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">Earned: " + earned + (total ? " (" + Math.round((earned / total) * 100) + "%)" : "") + "</span>" +
      "<span class=\"pie-legend-item skipped\">Potential: " + potential + "</span>" +
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
    const completed = state.extracurricularCompleted[task.id];
    if (!completed) return false;
    const at = state.extracurricularCompletedAt && state.extracurricularCompletedAt[task.id];
    if (!at) return true;
    const completedDate = new Date(at);
    return (Date.now() - completedDate.getTime()) > EXTRACURRICULAR_ARCHIVE_MS;
  }

  function getActiveExtracurricularTasks() {
    return (state.extracurricularTasks || []).filter((t) => !isExtracurricularArchived(t));
  }

  function getArchivedExtracurricularTasks() {
    return (state.extracurricularTasks || []).filter((t) => isExtracurricularArchived(t));
  }

  function setExtracurricularCompleted(taskId, completed) {
    state.extracurricularCompleted[taskId] = completed;
    if (completed) {
      if (!state.extracurricularCompletedAt) state.extracurricularCompletedAt = {};
      state.extracurricularCompletedAt[taskId] = new Date().toISOString();
    } else {
      if (state.extracurricularCompletedAt) delete state.extracurricularCompletedAt[taskId];
    }
  }

  function buildExtracurricularTaskItem(task, listOrGrid) {
    const completed = state.extracurricularCompleted[task.id];
    const li = document.createElement("li");
    li.className = "task-item task-item-with-changer";
    if (completed) li.classList.add("done");

    const top = document.createElement("div");
    top.className = "task-item-top";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = !!completed;
    checkbox.addEventListener("change", () => {
      setExtracurricularCompleted(task.id, checkbox.checked);
      save();
      renderAll();
    });
    top.appendChild(checkbox);
    const labelWrap = document.createElement("div");
    labelWrap.className = "task-item-info";
    const label = document.createElement("span");
    label.className = "task-label";
    label.textContent = task.label || "Task";
    const info = document.createElement("span");
    info.className = "extracurricular-task-info";
    const startStr = task.startDate || "";
    const endStr = task.endDateTBD ? "TBD" : (task.endDate || "");
    info.textContent = startStr + (endStr ? " — " + endStr : "");
    if (task.gameId) {
      const game = getGame(task.gameId);
      if (game) info.textContent += " (" + (game.name || task.gameId) + ")";
    }
    labelWrap.appendChild(label);
    labelWrap.appendChild(info);
    top.appendChild(labelWrap);
    const actions = document.createElement("div");
    actions.className = "task-item-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "✎";
    editBtn.setAttribute("aria-label", "Edit task");
    editBtn.addEventListener("click", () => openExtracurricularTaskModal(task));
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", "Delete task");
    deleteBtn.addEventListener("click", () => deleteExtracurricularTask(task.id));
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    top.appendChild(actions);
    li.appendChild(top);
    if (task.description) {
      const desc = document.createElement("p");
      desc.className = "extracurricular-task-desc";
      desc.textContent = task.description;
      li.appendChild(desc);
    }
    return li;
  }

  function renderExtracurricular() {
    const container = document.getElementById("extracurricularContent");
    if (!container) return;
    container.innerHTML = "";
    const viewMode = state.extracurricularViewMode || "tasks";
    const view = state.extracurricularView || "list";

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
        renderAll();
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
        renderAll();
      });
      headerRow.appendChild(tasksBtn);
    }
    container.appendChild(headerRow);

    const tasks = viewMode === "history" ? getArchivedExtracurricularTasks() : getActiveExtracurricularTasks();

    if (tasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = viewMode === "history"
        ? "No archived tasks. Completed tasks stay in the list for 24 hours, then move here."
        : "No extracurricular tasks yet. Add one to get started.";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("ul");
    list.className = "task-list" + (view === "grid" ? " task-list-grid" : "");
    tasks.forEach((task) => list.appendChild(buildExtracurricularTaskItem(task)));
    container.appendChild(list);
  }

  function updateExtracurricularTimeRemainingDisplay() {
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
    const endInput = document.getElementById("extracurricularTaskEndDate");
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
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const endOfDay = new Date(y, mo, d, 23, 59, 59);
    const now = new Date();
    const ms = endOfDay.getTime() - now.getTime();
    input.value = ms > 0 ? formatRemainingMs(ms) : "Not Available";
  }

  function applyExtracurricularTimeRemainingFromInput() {
    const input = document.getElementById("extracurricularTimeRemainingInput");
    const endInput = document.getElementById("extracurricularTaskEndDate");
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
    if (!input || !endInput) return;
    const remainingMs = parseTimeRemainingToMs(input.value.trim());
    if (remainingMs == null || remainingMs <= 0) return;
    const now = new Date();
    const endDate = new Date(now.getTime() + remainingMs);
    const endStr = getDateStr(endDate);
    endInput.value = endStr;
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
    const descInput = document.getElementById("extracurricularTaskDescription");
    const gameSelect = document.getElementById("extracurricularTaskGame");

    if (title) title.textContent = task ? "Edit task" : "Add task";
    const currencyInput = document.getElementById("extracurricularTaskCurrency");
    if (nameInput) nameInput.value = task ? (task.label || "") : "";
    if (startInput) startInput.value = task && task.startDate ? task.startDate : getDateStr();
    if (endTBDInput) endTBDInput.checked = !!(task && task.endDateTBD);
    if (endInput) {
      endInput.value = task && task.endDate ? task.endDate : "";
      endInput.disabled = !!(task && task.endDateTBD);
    }
    if (descInput) descInput.value = task ? (task.description || "") : "";
    if (currencyInput) currencyInput.value = task && task.currency != null ? String(task.currency) : "";
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
    if (endRow) endRow.style.display = endTBDInput && endTBDInput.checked ? "none" : "";
    if (endTBDInput) {
      endTBDInput.onchange = () => {
        if (endInput) endInput.disabled = endTBDInput.checked;
        if (endRow) endRow.style.display = endTBDInput.checked ? "none" : "";
        updateExtracurricularTimeRemainingDisplay();
      };
    }
    if (endInput) {
      endInput.onchange = updateExtracurricularTimeRemainingDisplay;
      endInput.oninput = updateExtracurricularTimeRemainingDisplay;
    }

    updateExtracurricularTimeRemainingDisplay();

    if (modal) {
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
    extracurricularTaskModalState.task = task;
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function closeExtracurricularTaskModal() {
    const modal = document.getElementById("extracurricularTaskModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
    extracurricularTaskModalState.task = null;
  }

  function deleteExtracurricularTask(taskId) {
    state.extracurricularTasks = (state.extracurricularTasks || []).filter((t) => t.id !== taskId);
    delete state.extracurricularCompleted[taskId];
    if (state.extracurricularCompletedAt) delete state.extracurricularCompletedAt[taskId];
    save();
    renderAll();
  }

  const extracurricularTaskModalState = { task: null };

  function initExtracurricularTaskModal() {
    const modal = document.getElementById("extracurricularTaskModal");
    const closeBtn = document.getElementById("extracurricularTaskModalClose");
    const cancelBtn = document.getElementById("extracurricularTaskModalCancel");
    const form = document.getElementById("extracurricularTaskModalForm");

    if (!modal || !form) return;
    initExtracurricularTimeRemainingInput();

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

      const label = (nameInput && nameInput.value || "").trim();
      if (!label) {
        if (nameInput) nameInput.focus();
        return;
      }

      const task = extracurricularTaskModalState.task;
      const currency = Math.max(0, Number(currencyInput && currencyInput.value) || 0);
      const payload = {
        id: task ? task.id : "ex_" + Date.now(),
        label,
        startDate: startInput && startInput.value ? startInput.value : getDateStr(),
        endDateTBD: !!(endTBDInput && endTBDInput.checked),
        endDate: endTBDInput && endTBDInput.checked ? null : (endInput && endInput.value || null),
        description: (descInput && descInput.value || "").trim() || null,
        gameId: (gameSelect && gameSelect.value) || null,
        currency: currency || undefined,
      };

      if (task) {
        const idx = (state.extracurricularTasks || []).findIndex((t) => t.id === task.id);
        if (idx >= 0) state.extracurricularTasks[idx] = { ...state.extracurricularTasks[idx], ...payload };
      } else {
        state.extracurricularTasks = state.extracurricularTasks || [];
        state.extracurricularTasks.push(payload);
      }
      save();
      closeExtracurricularTaskModal();
      renderAll();
    });
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

  function renderData() {
    const container = document.getElementById("dataContainer");
    if (!container) return;
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
    const formatPulls = (earned, potential) => (earned === 0 && potential === 0) ? "—" : toPullsStr(earned);
    const formatPullsPot = (earned, potential) => (earned === 0 && potential === 0) ? "—" : toPullsStr(potential);

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
        renderAll();
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
    currencyTable.innerHTML = "<thead><tr><th>Category</th><th class=\"data-toggle-col\">Include</th><th>Earned</th><th>Potential</th></tr></thead>";
    const currencyTbody = currencyTable.createTBody();
    const pullsTable = document.createElement("table");
    pullsTable.className = "data-summary-table";
    pullsTable.innerHTML = "<thead><tr><th>Category</th><th class=\"data-toggle-col\">Include</th><th>Earned</th><th>Potential</th></tr></thead>";
    const pullsTbody = pullsTable.createTBody();
    [[ "Dailies", dE, dP, incD ], [ "Weeklies", wE, wP, incW ], [ "Endgame", eE, eP, incE ], [ "Extracurricular", xE, xP, incX ]].forEach(([ cat, earned, potential, inc ]) => {
      const tr = currencyTbody.insertRow();
      tr.insertCell().textContent = cat;
      const toggleCell = tr.insertCell();
      toggleCell.className = "data-toggle-cell";
      toggleCell.appendChild(makeToggle(cat, inc));
      tr.insertCell().textContent = formatCurr(earned, potential);
      tr.insertCell().textContent = formatCurrPot(earned, potential);
      const pr = pullsTbody.insertRow();
      pr.insertCell().textContent = cat;
      const ptCell = pr.insertCell();
      ptCell.className = "data-toggle-cell";
      ptCell.appendChild(makeToggle(cat, inc));
      pr.insertCell().textContent = formatPulls(earned, potential);
      pr.insertCell().textContent = formatPullsPot(earned, potential);
    });
    const totalCurr = currencyTbody.insertRow();
    totalCurr.className = "data-summary-total";
    totalCurr.insertCell().textContent = "Total";
    totalCurr.insertCell().className = "data-toggle-cell";
    totalCurr.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : String(inclEarned);
    totalCurr.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : String(inclPotential);
    const totalPull = pullsTbody.insertRow();
    totalPull.className = "data-summary-total";
    totalPull.insertCell().textContent = "Total";
    totalPull.insertCell().className = "data-toggle-cell";
    totalPull.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : toPullsStr(inclEarned);
    totalPull.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : toPullsStr(inclPotential);
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

    const dCompleted = game.dailies ? getCompletedAmount(state.dailiesCompleted, game.id) : 0;
    const dAttempted = game.dailies ? getAttemptedAmount(state.dailiesAttempted, game.id) : 0;
    const dTotal = game.dailies ? (dAttempted > 0 ? dAttempted : Math.max(dCompleted, 1)) : 0;
    const weeklies = game.weeklies || [];
    let wCompleted = 0, wAttempted = 0;
    weeklies.forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      wCompleted += getCompletedAmount(state.weekliesCompleted, key);
      wAttempted += getAttemptedAmount(state.weekliesAttempted, key);
    });
    const wTotal = wAttempted > 0 ? wAttempted : Math.max(wCompleted, weeklies.length || 1);
    const endgame = game.endgame || [];
    let eCompleted = 0, eAttempted = 0;
    endgame.forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      eCompleted += getCompletedAmount(state.endgameCompleted, key);
      eAttempted += getAttemptedAmount(state.endgameAttempted, key);
    });
    const eTotal = eAttempted > 0 ? eAttempted : Math.max(eCompleted, endgame.length || 1);

    const overallRow = document.createElement("div");
    overallRow.className = "data-pie-row";
    overallRow.innerHTML = "<h4 class=\"data-section-label\">Overall</h4>";
    const overallPies = document.createElement("div");
    overallPies.className = "pie-row";
    overallPies.appendChild(createCompletionPieBox("Dailies", dCompleted, dTotal, false));
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
        const completed = getCompletedAmount(state.weekliesCompleted, key);
        const attempted = getAttemptedAmount(state.weekliesAttempted, key);
        const total = attempted > 0 ? attempted : Math.max(completed, 1);
        wPies.appendChild(createCompletionPieBox(task.label || "Weekly", completed, total, false));
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
        const completed = getCompletedAmount(state.endgameCompleted, key);
        const attempted = getAttemptedAmount(state.endgameAttempted, key);
        const total = attempted > 0 ? attempted : Math.max(completed, 1);
        ePies.appendChild(createCompletionPieBox(task.label || "Endgame", completed, total, true));
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
        const earned = Number(getEndgameEarned(game.id, task.id || task.label)) || 0;
        const attempted = getAttemptedAmount(state.endgameAttempted, key);
        currencyPies.appendChild(createEndgameCurrencyPieBox(task, earned, attempted));
      });
      currencySection.appendChild(currencyPies);
      container.appendChild(currencySection);
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
        save();
        renderAll();
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
        save();
        renderAll();
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
    const gameTitle = document.createElement("h3");
    gameTitle.className = "games-selected-title";
    gameTitle.textContent = selected.name;
    titleRow.appendChild(gameTitle);
    const editNameBtn = document.createElement("button");
    editNameBtn.type = "button";
    editNameBtn.className = "btn btn-ghost games-edit-name-btn";
    editNameBtn.textContent = "Edit name";
    editNameBtn.setAttribute("aria-label", "Edit game name");
    editNameBtn.addEventListener("click", () => {
      const newName = prompt("Game name", selected.name || "");
      if (newName != null && String(newName).trim()) {
        selected.name = String(newName).trim();
        save();
        renderAll();
      }
    });
    titleRow.appendChild(editNameBtn);
    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = "btn btn-ghost games-sync-btn";
    syncBtn.textContent = "Sync with Calendar";
    syncBtn.setAttribute("aria-label", "Sync all tasks from calendar history");
    syncBtn.title = "Update Completed/Attempted for all tasks from calendar history";
    syncBtn.addEventListener("click", () => {
      syncAllTasksForGame(selected);
    });
    titleRow.appendChild(syncBtn);
    const clearDataBtn = document.createElement("button");
    clearDataBtn.type = "button";
    clearDataBtn.className = "btn btn-ghost games-clear-data-btn";
    clearDataBtn.textContent = "Clear Data";
    clearDataBtn.setAttribute("aria-label", "Clear all attempts and completions for this game");
    clearDataBtn.title = "Reset all attempts and completions to zero";
    clearDataBtn.addEventListener("click", () => openClearGameDataModal(selected.id));
    titleRow.appendChild(clearDataBtn);
    const deleteGameBtn = document.createElement("button");
    deleteGameBtn.type = "button";
    deleteGameBtn.className = "btn btn-ghost games-delete-btn";
    deleteGameBtn.textContent = "Delete game";
    deleteGameBtn.addEventListener("click", () => deleteGame(selected.id));
    titleRow.appendChild(deleteGameBtn);
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
        save();
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
        renderAll();
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
        renderAll();
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
        renderAll();
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
        renderAll();
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
        const v = Math.max(0, Number(changerInput.value) || 0);
        state.dailiesCompleted[selected.id] = v;
        const dateStr = getDailyPeriodDateStr(selected, new Date());
        if (v) recordCompletion(dateStr, "dailies", selected.id);
        else unrecordCompletion(dateStr, "dailies", selected.id);
        save();
        renderAll();
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

      const syncRow = document.createElement("div");
      syncRow.className = "endgame-currency-row games-changer-row";
      const syncBtn = document.createElement("button");
      syncBtn.type = "button";
      syncBtn.className = "btn btn-ghost";
      syncBtn.textContent = "Sync with Calendar";
      syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
      syncBtn.addEventListener("click", () => syncTaskWithCalendar(selected, "dailies", selected.id));
      syncRow.appendChild(syncBtn);
      content.appendChild(syncRow);
    } else if (state.gamesSubTab === "extracurricular") {
      const gameTasks = (state.extracurricularTasks || []).filter((t) => t.gameId === selected.id);
      const activeTasks = gameTasks.filter((t) => !isExtracurricularArchived(t));
      const archivedTasks = gameTasks.filter((t) => isExtracurricularArchived(t));
      if (gameTasks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No extracurricular tasks associated with this game. Add tasks in the Extracurricular section and link them to this game.";
        content.appendChild(empty);
      } else {
        if (activeTasks.length > 0) {
          const activeLabel = document.createElement("p");
          activeLabel.className = "games-extracurricular-section-label";
          activeLabel.textContent = "Active";
          content.appendChild(activeLabel);
          const activeList = document.createElement("ul");
          activeList.className = "task-list";
          activeTasks.forEach((task) => activeList.appendChild(buildExtracurricularTaskItem(task)));
          content.appendChild(activeList);
        }
        if (archivedTasks.length > 0) {
          const archivedLabel = document.createElement("p");
          archivedLabel.className = "games-extracurricular-section-label";
          archivedLabel.textContent = "History";
          archivedLabel.style.marginTop = "1rem";
          content.appendChild(archivedLabel);
          const archivedList = document.createElement("ul");
          archivedList.className = "task-list";
          archivedTasks.forEach((task) => archivedList.appendChild(buildExtracurricularTaskItem(task)));
          content.appendChild(archivedList);
        }
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
        renderAll();
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
        renderAll();
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
        const li = document.createElement("li");
        li.className = "task-item task-item-with-changer";
        const top = document.createElement("div");
        top.className = "task-item-top";
        const info = document.createElement("div");
        info.className = "task-item-info";
        const label = document.createElement("span");
        label.className = "task-label";
        label.textContent = t.label || "";
        const potSpan = document.createElement("span");
        potSpan.className = "games-task-potential";
        potSpan.textContent = "Potential: " + getWeeklyPotential(t);
        const resetSpan = document.createElement("span");
        resetSpan.className = "games-task-reset";
        resetSpan.textContent = "Resets: " + getWeeklyResetDisplay(t, new Date(), selected);
        const dateStartSpan = document.createElement("span");
        dateStartSpan.className = "games-weekly-date-start";
        const ds = isValidDateStr(t.dateStarted) ? t.dateStarted : getDateStr();
        const dsDate = new Date(ds + "T12:00:00");
        dateStartSpan.textContent = "Started: " + formatDate(dsDate);
        dateStartSpan.title = "Date started: " + ds;
        info.appendChild(label);
        info.appendChild(potSpan);
        info.appendChild(resetSpan);
        info.appendChild(dateStartSpan);
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "icon-btn";
        editBtn.textContent = "✎";
        editBtn.setAttribute("aria-label", "Edit task");
        editBtn.addEventListener("click", () => openTaskModal({ gameId: selected.id, taskType: "weeklies", task: t }));
        top.appendChild(info);
        top.appendChild(editBtn);
        li.appendChild(top);
        const changerRow = document.createElement("div");
        changerRow.className = "games-changer-row";
        changerRow.innerHTML = "<label>Completed amount:</label>";
        const key = selected.id + "." + (t.id || t.label);
        const changerInput = document.createElement("input");
        changerInput.type = "number";
        changerInput.min = "0";
        changerInput.placeholder = "0";
        changerInput.value = String(getCompletedAmount(state.weekliesCompleted, key));
        changerInput.addEventListener("change", () => {
          const v = Math.max(0, Number(changerInput.value) || 0);
          state.weekliesCompleted[key] = v;
          if (v) recordCompletion(getDateStr(), "weeklies", key);
          else unrecordCompletion(getDateStr(), "weeklies", key);
          save();
          renderAll();
        });
        changerRow.appendChild(changerInput);
        li.appendChild(changerRow);

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
        li.appendChild(attemptRow);

        const syncRow = document.createElement("div");
        syncRow.className = "games-changer-row";
        const syncBtn = document.createElement("button");
        syncBtn.type = "button";
        syncBtn.className = "btn btn-ghost";
        syncBtn.textContent = "Sync with Calendar";
        syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
        syncBtn.addEventListener("click", () => syncTaskWithCalendar(selected, "weeklies", key));
        syncRow.appendChild(syncBtn);
        li.appendChild(syncRow);

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
        const li = document.createElement("li");
        li.className = "task-item task-item-with-changer";
        const top = document.createElement("div");
        top.className = "task-item-top";
        const info = document.createElement("div");
        info.className = "task-item-info";
        const label = document.createElement("span");
        label.className = "task-label";
        label.textContent = t.label || "";
        const potSpan = document.createElement("span");
        potSpan.className = "games-task-potential";
        potSpan.textContent = "Potential: " + getEndgamePotential(t);
        const resetSpan = document.createElement("span");
        resetSpan.className = "games-task-reset";
        resetSpan.textContent = "Resets: " + getEndgameResetDisplay(t, new Date(), selected);
        const dateStartSpan = document.createElement("span");
        dateStartSpan.className = "games-endgame-date-start";
        const ds = isValidDateStr(t.dateStarted) ? t.dateStarted : getDateStr();
        const dsDate = new Date(ds + "T12:00:00");
        dateStartSpan.textContent = "Started: " + formatDate(dsDate);
        dateStartSpan.title = "Date started: " + ds;
        info.appendChild(label);
        info.appendChild(potSpan);
        info.appendChild(resetSpan);
        info.appendChild(dateStartSpan);
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "icon-btn";
        editBtn.textContent = "✎";
        editBtn.setAttribute("aria-label", "Edit task");
        editBtn.addEventListener("click", () => openTaskModal({ gameId: selected.id, taskType: "endgame", task: t }));
        top.appendChild(info);
        top.appendChild(editBtn);
        li.appendChild(top);
        const changerRow = document.createElement("div");
        changerRow.className = "games-changer-row";
        changerRow.innerHTML = "<label>Completed amount:</label>";
        const key = selected.id + "." + (t.id || t.label);
        const changerInput = document.createElement("input");
        changerInput.type = "number";
        changerInput.min = "0";
        changerInput.placeholder = "0";
        changerInput.value = String(getCompletedAmount(state.endgameCompleted, key));
        changerInput.addEventListener("change", () => {
          const v = Math.max(0, Number(changerInput.value) || 0);
          state.endgameCompleted[key] = v;
          if (v) recordCompletion(getDateStr(), "endgame", key);
          else unrecordCompletion(getDateStr(), "endgame", key);
          ensureEndgameEarnedArrayLength(selected.id, t.id || t.label, v);
          save();
          renderAll();
        });
        changerRow.appendChild(changerInput);
        li.appendChild(changerRow);

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
        li.appendChild(attemptRow);

        const earningsRow = document.createElement("div");
        earningsRow.className = "games-changer-row";
        const earningsBtn = document.createElement("button");
        earningsBtn.type = "button";
        earningsBtn.className = "btn btn-ghost";
        earningsBtn.textContent = "Completion History";
        earningsBtn.addEventListener("click", () => openEarningsModal(selected.id, t));
        earningsRow.appendChild(earningsBtn);
        li.appendChild(earningsRow);

        const syncRow = document.createElement("div");
        syncRow.className = "games-changer-row";
        const syncBtn = document.createElement("button");
        syncBtn.type = "button";
        syncBtn.className = "btn btn-ghost";
        syncBtn.textContent = "Sync with Calendar";
        syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
        syncBtn.addEventListener("click", () => syncTaskWithCalendar(selected, "endgame", key));
        syncRow.appendChild(syncBtn);
        li.appendChild(syncRow);

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
    const now = new Date();
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

    // DWE checklist: tasks due earliest to latest, same order as game list for ties
    const checklistItems = [];
    games.forEach((game, gameIdx) => {
      if (game.dailies) {
        checklistItems.push({
          type: "dailies",
          key: game.id,
          gameId: game.id,
          taskId: null,
          label: (game.name || game.id),
          dueMs: now.getTime() + getDailyTimeRemainingMs(game, now),
          gameOrder: gameIdx,
          taskOrder: 0
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
            taskOrder: taskIdx
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
            taskOrder: taskIdx
          });
        }
      });
    });
    const sortItems = (a, b) => {
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
          const card = document.createElement("div");
          card.className = "task-item home-dwe-checklist-item home-dwe-checklist-item-extracurricular" + (state.extracurricularCompleted[task.id] ? " done" : "");
          const label = document.createElement("span");
          label.className = "task-label home-dwe-checklist-label";
          label.textContent = task.label || "Task";
          const check = document.createElement("input");
          check.type = "checkbox";
          check.className = "task-checkbox";
          check.checked = !!state.extracurricularCompleted[task.id];
          check.addEventListener("change", () => {
            setExtracurricularCompleted(task.id, check.checked);
            save();
            renderAll();
          });
          const info = document.createElement("span");
          info.className = "home-extracurricular-info";
          const endStr = task.endDateTBD ? "TBD" : (task.endDate || "");
          info.textContent = (task.startDate || "") + (endStr ? " — " + endStr : "");
          card.appendChild(label);
          card.appendChild(check);
          card.appendChild(info);
          grid.appendChild(card);
        });
      } else if (type === "dailies") {
        items.forEach((item) => {
          const game = getGame(item.gameId);
          if (game) grid.appendChild(buildDailyTaskItem(game, "div"));
        });
      } else if (type === "weeklies") {
        items.forEach((item) => {
          const game = getGame(item.gameId);
          const task = game && (game.weeklies || []).find((t) => (t.id || t.label) === item.taskId);
          if (game && task) {
            const card = buildWeeklyTaskItem(game, task, "div");
            const gameLabel = document.createElement("div");
            gameLabel.className = "task-grid-game-label";
            gameLabel.textContent = game.name;
            card.insertBefore(gameLabel, card.firstChild);
            grid.appendChild(card);
          }
        });
      } else if (type === "endgame") {
        items.forEach((item) => {
          const game = getGame(item.gameId);
          const task = game && (game.endgame || []).find((t) => (t.id || t.label) === item.taskId);
          if (game && task) {
            const card = buildEndgameTaskItem(game, task, "div");
            const gameLabel = document.createElement("div");
            gameLabel.className = "task-grid-game-label";
            gameLabel.textContent = game.name;
            card.insertBefore(gameLabel, card.firstChild);
            grid.appendChild(card);
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
    infoIcon.title = "This checklist will show the tasks by earliest to latest \"due date,\" followed by order of the Games.";
    infoIcon.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4M12 8h.01\"/></svg>";
    checklistHeading.appendChild(infoIcon);
    checklistWrap.appendChild(checklistHeading);
    checklistWrap.appendChild(renderChecklistGrid(extracurricularItems, "Extracurricular", "extracurricular"));
    checklistWrap.appendChild(renderChecklistGrid(dailiesItems, "Dailies", "dailies"));
    checklistWrap.appendChild(renderChecklistGrid(weekliesItems, "Weeklies", "weeklies"));
    checklistWrap.appendChild(renderChecklistGrid(endgameItems, "Endgame", "endgame"));
    container.appendChild(checklistWrap);
  }


  function renderAll() {
    setDateLabels();
    renderTabs();
    renderHome();
    renderDailies();
    renderWeeklies();
    renderEndgame();
    renderSidebarDataList();
    renderSidebarGamesList();
    renderAttendance();
    renderExtracurricular();
    renderData();
    renderGames();
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
        save();
        renderAll();
      });
      titleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          state.tab = "about";
          save();
          renderAll();
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
          const now = new Date();
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
        save();
        renderAll();
      });
    });
  }

  load();
  if (typeof window.initFirebaseAuth === "function") window.initFirebaseAuth();
  processResets();
  if (state.defaultTab && state.defaultTab !== state.tab) {
    state.tab = state.defaultTab;
  }
  setDateLabels();
  initTabs();
  initFormatToggles();
  initTaskModal();
  initGameModal();
  initDeleteGameModal();
  initClearGameDataModal();
  initCalendarDayModal();
  initEarningsModal();
  initTimeTrendsDetailModal();
  initClearTimeTrendsModal();
  initSettingsModal();
  initExtracurricularTaskModal();
  setInterval(() => {
    const changed = processResets();
    updateTaskRemainingTexts();
    if (changed) renderAll();
  }, 60000);
  setInterval(updateSidebarTime, 1000);
  renderAll();
})();

/**
 * Mobile integration - layout and behavior for viewports <= 768px.
 * All changes are scoped to mobile via CSS media queries and viewport checks.
 * PC display/format is unaffected.
 */
(function () {
  "use strict";

  const MOBILE_BREAKPOINT = 768;
  const BODY_CLASS_OPEN = "mobile-sidebar-open";

  let hamburgerEl = null;
  let overlayEl = null;
  let mobileSettingsBtn = null;
  let navListenersAttached = false;

  function isMobile() {
    return window.matchMedia("(max-width: " + MOBILE_BREAKPOINT + "px)").matches;
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
      settingsBtn.click();
    });
    return btn;
  }

  function closeSidebarOnNavClick() {
    const sidebar = document.querySelector(".sidebar-left");
    if (!sidebar) return;

    sidebar.querySelectorAll(".tab, .sidebar-data-item, .sidebar-game-item").forEach(function (el) {
      el.addEventListener("click", function () {
        if (isMobile()) {
          closeSidebar();
        }
      });
    });
  }

  function init() {
    if (!isMobile()) {
      closeSidebar();
      return;
    }

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

    if (!mobileSettingsBtn) {
      mobileSettingsBtn = createMobileSettingsButton();
      if (mobileSettingsBtn) {
        const topBarActions = document.querySelector(".top-bar-actions");
        if (topBarActions) {
          topBarActions.insertBefore(mobileSettingsBtn, topBarActions.firstChild);
        }
      }
    }

    if (!navListenersAttached) {
      closeSidebarOnNavClick();
      navListenersAttached = true;
    }
  }

  function handleResize() {
    if (!isMobile()) {
      closeSidebar();
    } else {
      init();
    }
  }

  function run() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
    window.addEventListener("resize", handleResize);
  }

  run();
})();
