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
