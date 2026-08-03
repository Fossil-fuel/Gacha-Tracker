"use strict";

/**
 * Lightweight in-memory tracker used by regression tests.
 * Mirrors app behavior for History, Time Trends, Data, and Sync — without the DOM.
 */

const math = require("./cycle-math");

function emptyDay() {
  return { dailies: [], weeklies: [], endgame: [] };
}

function createFixture(opts) {
  const options = opts || {};
  const today = options.today || "2026-07-31";
  const gameId = "g_sim";
  const game = {
    id: gameId,
    name: "Sim Game",
    dailies: true,
    dailyCurrency: 60,
    currencyPerPull: 160,
    weeklies: [
      {
        id: "weekly_a",
        label: "Weekly A",
        weekStartDay: 1,
        weekStartHour: 4,
        dateStarted: "2026-07-06",
        frequencyEvery: 1,
        frequencyUnit: "week",
        timeLimitEvery: 1,
        timeLimitUnit: "week",
        currency: 100,
      },
    ],
    endgame: [
      {
        id: "endgame_a",
        label: "Endgame A",
        weekStartDay: 1,
        weekStartHour: 4,
        dateStarted: "2026-06-29",
        frequencyEvery: 2,
        frequencyUnit: "week",
        timeLimitEvery: 2,
        timeLimitUnit: "week",
        currency: 800,
      },
      {
        id: "pain_cage",
        label: "Pain Cage",
        weekStartDay: 1,
        weekStartHour: 4,
        dateStarted: "2026-07-06",
        frequencyEvery: 1,
        frequencyUnit: "week",
        timeLimitEvery: 1,
        timeLimitUnit: "week",
        currency: 50,
        earliestCompleteDays: 2,
      },
      {
        id: "pure_fiction",
        label: "Pure Fiction",
        weekStartDay: 1,
        weekStartHour: 4,
        dateStarted: "2026-02-16",
        frequencyEvery: 6,
        frequencyUnit: "week",
        timeLimitEvery: 6,
        timeLimitUnit: "week",
        currency: 800,
      },
    ],
  };

  // HSR-like 2-week weeklies (Divergent / Currency Wars offset by one week)
  game.weeklies.push(
    {
      id: "divergent",
      label: "Divergent Universe",
      weekStartDay: 1,
      weekStartHour: 4,
      dateStarted: "2026-03-09",
      frequencyEvery: 2,
      frequencyUnit: "week",
      timeLimitEvery: 2,
      timeLimitUnit: "week",
      currency: 225,
    },
    {
      id: "currency",
      label: "Currency Wars",
      weekStartDay: 1,
      weekStartHour: 4,
      dateStarted: "2026-03-02",
      frequencyEvery: 2,
      frequencyUnit: "week",
      timeLimitEvery: 2,
      timeLimitUnit: "week",
      currency: 225,
    }
  );

  return {
    today,
    games: [game],
    completionByDate: {},
    completionTimestamps: [],
    dailiesCompleted: { [gameId]: 0 },
    dailiesAttempted: { [gameId]: 0 },
    weekliesCompleted: {},
    weekliesAttempted: {},
    endgameCompleted: {},
    endgameAttempted: {},
    endgameCurrencyEarned: {},
    endgameCurrencyPotential: {},
    weekliesCurrencyEarned: {},
  };
}

function getGame(state) {
  return state.games[0];
}

function taskKey(game, task) {
  return game.id + "." + (task.id || task.label);
}

function findTask(game, type, key) {
  const list = type === "weeklies" ? game.weeklies : game.endgame;
  return (list || []).find((t) => game.id + "." + (t.id || t.label) === key) || null;
}

function ensureDay(state, dateStr) {
  if (!state.completionByDate[dateStr]) state.completionByDate[dateStr] = emptyDay();
  return state.completionByDate[dateStr];
}

/** Mark complete: dailies = that day only; weeklies/endgame = fill remaining (+ unlock clamp). */
function markComplete(state, type, key, dateStr, hour, minute) {
  const before = captureUndoSlice(state, type, key);
  const game = getGame(state);
  let completion = dateStr;

  // Match applyTaskCompletion: no tally bump if already complete in this cycle (or day for dailies).
  if (type === "dailies") {
    const day = ensureDay(state, dateStr);
    if (day.dailies.includes(key)) return completion;
  } else if (isCompletedInCycleForDate(state, type, key, dateStr)) {
    return completion;
  }

  if (type === "dailies") {
    const day = ensureDay(state, dateStr);
    if (!day.dailies.includes(key)) day.dailies.push(key);
  } else {
    const task = findTask(game, type, key);
    if (!task) throw new Error("Unknown task " + key);
    const cycle = math.getDatesInCycle(task, dateStr);
    if (type === "endgame") {
      completion = math.clampCompletionToUnlock(task, cycle, dateStr);
    }
    math.getRemainingDatesFrom(task, completion).forEach((ds) => {
      const day = ensureDay(state, ds);
      if (!day[type].includes(key)) day[type].push(key);
    });
  }

  const already = state.completionTimestamps.some(
    (t) =>
      t.taskType === type &&
      t.gameId === (type === "dailies" ? key : key.split(".")[0]) &&
      t.dateStr === completion &&
      (type === "dailies" || t.taskId === key.split(".").slice(1).join("."))
  );
  if (!already) {
    const gameId = type === "dailies" ? key : key.slice(0, key.indexOf("."));
    const taskId = type === "dailies" ? "" : key.slice(key.indexOf(".") + 1);
    state.completionTimestamps.push({
      dateStr: completion,
      hour: Number.isFinite(hour) ? hour : 12,
      minute: Number.isFinite(minute) ? minute : 0,
      gameId,
      taskType: type,
      taskId,
      taskLabel: taskId || game.name,
    });
  }
  if (type === "dailies") {
    state.dailiesCompleted[key] = (Number(state.dailiesCompleted[key]) || 0) + 1;
    state.dailiesAttempted[key] = Math.max(Number(state.dailiesAttempted[key]) || 0, state.dailiesCompleted[key]);
  } else if (type === "weeklies") {
    state.weekliesCompleted[key] = (Number(state.weekliesCompleted[key]) || 0) + 1;
    state.weekliesAttempted[key] = Math.max(Number(state.weekliesAttempted[key]) || 0, state.weekliesCompleted[key]);
  } else {
    state.endgameCompleted[key] = (Number(state.endgameCompleted[key]) || 0) + 1;
    state.endgameAttempted[key] = Math.max(Number(state.endgameAttempted[key]) || 0, state.endgameCompleted[key]);
  }
  pushUndo(state, "Complete " + key, before);
  return completion;
}

/**
 * Legacy pre-fix complete: fill remaining days AND force-mark the shared reset calendar day
 * (the Aug 3 without-time bug). Timestamp stays on the real finish day only.
 */
function markCompleteWithLegacyBoundaryBleed(state, type, key, dateStr, hour, minute) {
  const completion = markComplete(state, type, key, dateStr, hour, minute);
  const game = getGame(state);
  const task = findTask(game, type, key);
  const bounds = math.getCycleBoundsForMoment(task, new Date(completion + "T12:00:00"));
  if (!bounds) return completion;
  const boundaryStr =
    bounds.cycleEnd.getFullYear() +
    "-" +
    String(bounds.cycleEnd.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(bounds.cycleEnd.getDate()).padStart(2, "0");
  const correct = math.getRemainingDatesFrom(task, completion);
  if (!correct.includes(boundaryStr)) {
    const day = ensureDay(state, boundaryStr);
    if (!day[type].includes(key)) day[type].push(key);
  }
  return completion;
}

function marksByDateForKey(state, type, key) {
  const out = {};
  Object.keys(state.completionByDate || {}).forEach((ds) => {
    if ((state.completionByDate[ds][type] || []).includes(key)) out[ds] = [key];
  });
  return out;
}

function timestampsForKey(state, type, key) {
  const gameId = key.slice(0, key.indexOf("."));
  const taskId = key.slice(key.indexOf(".") + 1);
  return (state.completionTimestamps || []).filter(
    (t) => t.taskType === type && t.gameId === gameId && t.taskId === taskId
  );
}

/** Whether the cycle containing refDateStr is complete (mirror getCompletionDateInCycle). */
function isCompletedInCycleForDate(state, type, key, refDateStr) {
  if (type === "dailies") {
    return !!(state.completionByDate[refDateStr] && (state.completionByDate[refDateStr].dailies || []).includes(key));
  }
  const game = getGame(state);
  const task = findTask(game, type, key);
  if (!task) return false;
  const bounds = math.getCycleBoundsForMoment(task, new Date(refDateStr + "T12:00:00"));
  if (!bounds) return false;
  const marks = marksByDateForKey(state, type, key);
  const stamps = timestampsForKey(state, type, key);
  const startMs = bounds.cycleStart.getTime();
  const endMs = bounds.cycleEnd.getTime();
  const hasTs = stamps.some((t) => {
    const h = Number.isFinite(t.hour) ? t.hour : 12;
    const m = Number.isFinite(t.minute) ? t.minute : 0;
    const ms = new Date(
      t.dateStr + "T" + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00"
    ).getTime();
    return ms >= startMs && ms < endMs;
  });
  if (hasTs) return true;
  return math.findCalendarCompletionInBounds(marks, key, bounds) != null;
}

/**
 * Mirror calendar-day uncheck save path.
 * oldBug: refuse unless *current* cycle (at `now`) looks complete — the pre-fix failure mode.
 * fixed: allow when the cycle containing dateStr is complete.
 */
function simulateCalendarDayUncheck(state, type, key, dateStr, now, opts) {
  const o = opts || {};
  const useOldBug = !!o.oldBug;
  const canEdit = useOldBug
    ? isCompletedInCurrentCycle(state, type, key, now)
    : isCompletedInCycleForDate(state, type, key, dateStr);
  if (!canEdit) {
    return { ok: false, blocked: true, reason: useOldBug ? "current-cycle-gate" : "cycle-not-complete" };
  }
  markIncomplete(state, type, key, dateStr);
  return { ok: true, blocked: false };
}

/** Current-cycle complete using shared-day-aware math (mirror of app). */
function isCompletedInCurrentCycle(state, type, key, now) {
  const game = getGame(state);
  const task = findTask(game, type, key);
  if (!task) return false;
  const hour = Number.isFinite(task.weekStartHour) ? task.weekStartHour : 4;
  const membership = math.getCycleMembershipMoment(now, hour, 0);
  const bounds = math.getCycleBoundsForMoment(task, membership);
  const marks = marksByDateForKey(state, type, key);
  const stamps = timestampsForKey(state, type, key);
  if (!bounds) return false;
  const startMs = bounds.cycleStart.getTime();
  const endMs = bounds.cycleEnd.getTime();
  const hasTs = stamps.some((t) => {
    const h = Number.isFinite(t.hour) ? t.hour : 12;
    const m = Number.isFinite(t.minute) ? t.minute : 0;
    const ms = new Date(
      t.dateStr + "T" + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00"
    ).getTime();
    return ms >= startMs && ms < endMs;
  });
  if (hasTs) return true;
  return math.findCalendarCompletionInBounds(marks, key, bounds) != null;
}

function diagnoseTaskResetDay(state, type, key, now) {
  const game = getGame(state);
  const task = findTask(game, type, key);
  if (!task) return { ok: false, issues: [{ kind: "missing-task" }] };
  return math.diagnoseSharedResetDay(
    task,
    marksByDateForKey(state, type, key),
    timestampsForKey(state, type, key),
    key,
    now
  );
}

/** Strip shared-day bleed marks for all weeklies/endgame (mirror cleanupCycleBoundaryBleedMarks). */
function cleanupCycleBoundaryBleedMarks(state, now) {
  let changed = false;
  const game = getGame(state);
  ["weeklies", "endgame"].forEach((type) => {
    (game[type] || []).forEach((task) => {
      const key = taskKey(game, task);
      const diag = diagnoseTaskResetDay(state, type, key, now);
      if (!diag.hadBleedMark) return;
      const day = state.completionByDate[diag.startDateStr];
      if (!day || !day[type]) return;
      const idx = day[type].indexOf(key);
      if (idx < 0) return;
      day[type].splice(idx, 1);
      changed = true;
    });
  });
  return changed;
}

function diagnoseAllResetDays(state, now) {
  const game = getGame(state);
  const results = [];
  ["weeklies", "endgame"].forEach((type) => {
    (game[type] || []).forEach((task) => {
      const key = taskKey(game, task);
      const diag = diagnoseTaskResetDay(state, type, key, now);
      results.push({ type, key, label: task.label || task.id, ...diag });
    });
  });
  return {
    ok: results.every((r) => r.ok),
    results,
    bleedCount: results.filter((r) => r.hadBleedMark).length,
  };
}

function markIncomplete(state, type, key, dateStr) {
  const before = captureUndoSlice(state, type, key);
  const game = getGame(state);
  let dates = [dateStr];
  if (type !== "dailies") {
    const task = findTask(game, type, key);
    if (!task) return;
    // Clear from earliest marked day in cycle (or provided date) through end
    const cycle = math.getDatesInCycle(task, dateStr);
    let first = null;
    for (const ds of cycle) {
      if ((state.completionByDate[ds] && state.completionByDate[ds][type] || []).includes(key)) {
        first = ds;
        break;
      }
    }
    if (!first) first = dateStr;
    dates = math.getRemainingDatesFrom(task, first);
  }
  dates.forEach((ds) => {
    const day = state.completionByDate[ds];
    if (!day) return;
    const arr = day[type] || [];
    const idx = arr.indexOf(key);
    if (idx >= 0) arr.splice(idx, 1);
  });

  const gameId = type === "dailies" ? key : key.slice(0, key.indexOf("."));
  const taskId = type === "dailies" ? "" : key.slice(key.indexOf(".") + 1);
  for (let i = state.completionTimestamps.length - 1; i >= 0; i--) {
    const t = state.completionTimestamps[i];
    if (t.taskType !== type || t.gameId !== gameId) continue;
    if (type !== "dailies" && t.taskId !== taskId) continue;
    if (dates.includes(t.dateStr) || t.dateStr === dateStr) {
      state.completionTimestamps.splice(i, 1);
      // remove one matching stamp (latest for that cycle range)
      break;
    }
  }
  if (type === "dailies") {
    state.dailiesCompleted[key] = Math.max(0, (Number(state.dailiesCompleted[key]) || 0) - 1);
  } else if (type === "weeklies") {
    state.weekliesCompleted[key] = Math.max(0, (Number(state.weekliesCompleted[key]) || 0) - 1);
  } else {
    state.endgameCompleted[key] = Math.max(0, (Number(state.endgameCompleted[key]) || 0) - 1);
  }
  pushUndo(state, "Incomplete " + key, before);
}

/** History: which dates in a month show a mark for a task (fill-remaining included). */
function historyMarksInMonth(state, type, key, year, month /* 1-12 */) {
  const prefix = year + "-" + String(month).padStart(2, "0");
  const out = [];
  Object.keys(state.completionByDate)
    .sort()
    .forEach((ds) => {
      if (!ds.startsWith(prefix)) return;
      if ((state.completionByDate[ds][type] || []).includes(key)) out.push(ds);
    });
  return out;
}

/** History: true when dateStr is fill-remaining after an earlier finish in the same cycle. */
function historyIsCarried(state, type, key, dateStr) {
  if (type === "dailies") return false;
  if (!(state.completionByDate[dateStr] && state.completionByDate[dateStr][type] || []).includes(key)) return false;
  const completion = historyCompletionDayInCycle(state, type, key, dateStr);
  return !!(completion && completion < dateStr);
}

/** History: true completion day for a cycle = timestamp if any, else earliest calendar mark. */
function historyCompletionDayInCycle(state, type, key, dateInCycle) {
  const game = getGame(state);
  const task = type === "dailies" ? null : findTask(game, type, key);
  if (type === "dailies") {
    return (state.completionByDate[dateInCycle] && state.completionByDate[dateInCycle].dailies || []).includes(key)
      ? dateInCycle
      : null;
  }
  const cycle = math.getDatesInCycle(task, dateInCycle);
  const end = cycle[cycle.length - 1];
  const gameId = key.slice(0, key.indexOf("."));
  const taskId = key.slice(key.indexOf(".") + 1);
  const ts = state.completionTimestamps
    .filter(
      (t) =>
        t.taskType === type &&
        t.gameId === gameId &&
        t.taskId === taskId &&
        t.dateStr >= cycle[0] &&
        t.dateStr <= end
    )
    .map((t) => t.dateStr)
    .sort();
  if (ts.length) return ts[0];
  for (const ds of cycle) {
    if ((state.completionByDate[ds] && state.completionByDate[ds][type] || []).includes(key)) return ds;
  }
  return null;
}

/**
 * Time Trends events for one endgame/weekly key.
 * Prefers timestamp date inside a cycle over earliest calendar fill day.
 */
function getTrendEvents(state, type, key) {
  const game = getGame(state);
  const task = findTask(game, type, key);
  if (!task) return [];
  const gameId = key.slice(0, key.indexOf("."));
  const taskId = key.slice(key.indexOf(".") + 1);

  const stamped = {};
  state.completionTimestamps.forEach((t) => {
    if (t.taskType === type && t.gameId === gameId && t.taskId === taskId) {
      stamped[t.dateStr] = Number.isFinite(t.hour) ? t.hour : 12;
    }
  });

  const cyclesDone = new Set();
  const events = [];

  Object.keys(stamped)
    .sort()
    .forEach((ds) => {
      const start = math.getCycleStartDateStr(task, ds);
      if (!start || cyclesDone.has(start)) return;
      cyclesDone.add(start);
      events.push({ dateStr: ds, hour: stamped[ds], source: "timestamp", cycleStart: start });
    });

  // Calendar-only cycles (no timestamp)
  Object.keys(state.completionByDate)
    .sort()
    .forEach((ds) => {
      if (!(state.completionByDate[ds][type] || []).includes(key)) return;
      const start = math.getCycleStartDateStr(task, ds);
      if (!start || cyclesDone.has(start)) return;
      const completion = historyCompletionDayInCycle(state, type, key, ds);
      if (!completion) return;
      cyclesDone.add(start);
      events.push({ dateStr: completion, hour: 12, source: "calendar", cycleStart: start });
    });

  return events.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
}

function trendDayOfWeekCounts(events) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  events.forEach((e) => {
    c[new Date(e.dateStr + "T12:00:00").getDay()]++;
  });
  return c;
}

function trendHourCounts(events) {
  const c = Array.from({ length: 24 }, () => 0);
  events.forEach((e) => {
    const h = Math.max(0, Math.min(23, Number(e.hour) || 0));
    c[h]++;
  });
  return c;
}

/** Calendar sync: recompute completed/attempted from marks up to today (+ compact baselines). */
function syncTalliesFromCalendar(state, type, key) {
  const game = getGame(state);
  const today = state.today;
  const baselines = (state.historyCompact && state.historyCompact.baselines) || {};
  const base = (bucket) => Number((baselines[bucket] && baselines[bucket][key]) || 0) || 0;

  if (type === "dailies") {
    let completed = 0;
    let attempted = 0;
    Object.keys(state.completionByDate)
      .sort()
      .forEach((ds) => {
        if (ds > today) return;
        attempted++;
        if ((state.completionByDate[ds].dailies || []).includes(key)) completed++;
      });
    // For dailies in this sim, attempted = days from first mark through today that we care about:
    // use only days that appear in completionByDate OR count consecutive from first mark.
    // Simpler contract for tests: completed = marked days; attempted = max(completed, wrong tally we fix to marked span).
    const marked = Object.keys(state.completionByDate)
      .filter((ds) => ds <= today && (state.completionByDate[ds].dailies || []).includes(key))
      .sort();
    completed = marked.length;
    if (marked.length) {
      attempted = math.daysBetween(marked[0], today) + 1;
    } else {
      attempted = 0;
    }
    completed += base("dailiesCompleted");
    attempted += base("dailiesAttempted");
    state.dailiesCompleted[key] = completed;
    state.dailiesAttempted[key] = attempted;
    return { completed, attempted };
  }

  const task = findTask(game, type, key);
  if (!task) return { completed: 0, attempted: 0 };

  const { intervalDays, timeLimitDays } = math.getCycleParams(task);
  const anchor = math.getAnchorDateStr(task);
  let earliest = null;
  Object.keys(state.completionByDate)
    .sort()
    .forEach((ds) => {
      if ((state.completionByDate[ds][type] || []).includes(key) && (!earliest || ds < earliest)) earliest = ds;
    });
  if (!earliest || !anchor) {
    const completed = base(type === "weeklies" ? "weekliesCompleted" : "endgameCompleted");
    const attempted = base(type === "weeklies" ? "weekliesAttempted" : "endgameAttempted");
    if (type === "weeklies") {
      state.weekliesCompleted[key] = completed;
      state.weekliesAttempted[key] = attempted;
    } else {
      state.endgameCompleted[key] = completed;
      state.endgameAttempted[key] = attempted;
    }
    return { completed, attempted };
  }

  let completed = 0;
  let attempted = 0;
  let start = math.getCycleStartDateStr(task, earliest);
  while (start && start <= today) {
    const cycleDates = [];
    for (let i = 0; i < timeLimitDays; i++) cycleDates.push(math.addDays(start, i));
    const end = cycleDates[cycleDates.length - 1];
    const hasMark = cycleDates.some((ds) => (state.completionByDate[ds] && state.completionByDate[ds][type] || []).includes(key));
    const cycleEnded = end < today || end === today;
    // Count attempt if cycle has started
    attempted++;
    if (hasMark) completed++;
    // stop after current open cycle
    if (start <= today && math.addDays(start, intervalDays) > today && !cycleEnded) {
      // still include current
    }
    start = math.addDays(start, intervalDays);
    if (start > today) break;
    // safety
    if (attempted > 500) break;
  }

  completed += base(type === "weeklies" ? "weekliesCompleted" : "endgameCompleted");
  attempted += base(type === "weeklies" ? "weekliesAttempted" : "endgameAttempted");

  if (type === "weeklies") {
    state.weekliesCompleted[key] = completed;
    state.weekliesAttempted[key] = attempted;
  } else {
    state.endgameCompleted[key] = completed;
    state.endgameAttempted[key] = attempted;
  }
  return { completed, attempted };
}

/** Data page: earned vs potential from tallies + task currency (simplified). */
function getDataTotals(state, game) {
  const g = game || getGame(state);
  let dEarned = 0;
  let dPotential = 0;
  if (g.dailies) {
    const c = Number(state.dailiesCompleted[g.id]) || 0;
    const a = Number(state.dailiesAttempted[g.id]) || 0;
    const pot = Number(g.dailyCurrency) || 0;
    dEarned = c * pot;
    dPotential = a * pot;
  }

  let wEarned = 0;
  let wPotential = 0;
  (g.weeklies || []).forEach((t) => {
    const key = taskKey(g, t);
    const pot = Number(t.currency) || 0;
    wEarned += (Number(state.weekliesCompleted[key]) || 0) * pot;
    wPotential += (Number(state.weekliesAttempted[key]) || 0) * pot;
  });

  let eEarned = 0;
  let ePotential = 0;
  (g.endgame || []).forEach((t) => {
    const key = taskKey(g, t);
    const pot = Number(t.currency) || 0;
    const c = Number(state.endgameCompleted[key]) || 0;
    const a = Number(state.endgameAttempted[key]) || 0;
    // Prefer per-cycle earned array when present
    const earnedArr = (state.endgameCurrencyEarned[g.id] && state.endgameCurrencyEarned[g.id][t.id || t.label]) || [];
    if (earnedArr.length) {
      eEarned += earnedArr.slice(0, c).reduce((s, n) => s + (Number(n) || 0), 0);
    } else {
      eEarned += c * pot;
    }
    ePotential += a * pot;
  });

  return {
    dailies: { earned: dEarned, potential: dPotential },
    weeklies: { earned: wEarned, potential: wPotential },
    endgame: { earned: eEarned, potential: ePotential },
    total: {
      earned: dEarned + wEarned + eEarned,
      potential: dPotential + wPotential + ePotential,
    },
  };
}

function cloneJson(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

function captureUndoSlice(state, type, key) {
  const markedDates = [];
  Object.keys(state.completionByDate || {})
    .sort()
    .forEach((ds) => {
      if ((state.completionByDate[ds][type] || []).includes(key)) markedDates.push(ds);
    });
  const gameId = type === "dailies" ? key : key.slice(0, key.indexOf("."));
  const taskId = type === "dailies" ? "" : key.slice(key.indexOf(".") + 1);
  const timestamps = (state.completionTimestamps || [])
    .filter((t) => t.taskType === type && t.gameId === gameId && (type === "dailies" || t.taskId === taskId))
    .map(cloneJson);
  const completedMap =
    type === "dailies" ? state.dailiesCompleted : type === "weeklies" ? state.weekliesCompleted : state.endgameCompleted;
  const attemptedMap =
    type === "dailies" ? state.dailiesAttempted : type === "weeklies" ? state.weekliesAttempted : state.endgameAttempted;
  return {
    type,
    key,
    markedDates,
    timestamps,
    completed: Number(completedMap[key]) || 0,
    attempted: Number(attemptedMap[key]) || 0,
  };
}

function restoreUndoSlice(state, slice) {
  const { type, key } = slice;
  const gameId = type === "dailies" ? key : key.slice(0, key.indexOf("."));
  const taskId = type === "dailies" ? "" : key.slice(key.indexOf(".") + 1);
  Object.keys(state.completionByDate || {}).forEach((ds) => {
    const arr = state.completionByDate[ds][type];
    if (!arr) return;
    const i = arr.indexOf(key);
    if (i >= 0) arr.splice(i, 1);
  });
  (slice.markedDates || []).forEach((ds) => {
    const day = ensureDay(state, ds);
    if (!day[type].includes(key)) day[type].push(key);
  });
  state.completionTimestamps = (state.completionTimestamps || []).filter(
    (t) => !(t.taskType === type && t.gameId === gameId && (type === "dailies" || t.taskId === taskId))
  );
  (slice.timestamps || []).forEach((t) => state.completionTimestamps.push(cloneJson(t)));
  if (type === "dailies") {
    state.dailiesCompleted[key] = slice.completed;
    state.dailiesAttempted[key] = slice.attempted;
  } else if (type === "weeklies") {
    state.weekliesCompleted[key] = slice.completed;
    state.weekliesAttempted[key] = slice.attempted;
  } else {
    state.endgameCompleted[key] = slice.completed;
    state.endgameAttempted[key] = slice.attempted;
  }
}

function pushUndo(state, label, before) {
  if (!state._undoStack) state._undoStack = [];
  state._undoStack.push({ label, before });
  while (state._undoStack.length > 40) state._undoStack.shift();
}

function undoLast(state) {
  if (!state._undoStack || !state._undoStack.length) return { ok: false, reason: "Nothing to undo" };
  const entry = state._undoStack.pop();
  restoreUndoSlice(state, entry.before);
  return { ok: true, label: entry.label };
}

/**
 * Lightweight share-card model for tests (mirrors buildShareCardModel: Games tallies for rates).
 */
function buildShareCardModel(state, opts) {
  const o = opts || {};
  const today = state.today;
  const days = Math.max(1, Number(o.days) || 90);
  const endStr = today;
  const startStr = math.addDays(today, -(days - 1));
  const game = getGame(state);
  const games = o.gameIds && o.gameIds.length
    ? [game].filter((g) => o.gameIds.includes(g.id))
    : [game];
  if (!games.length) return { ok: false, reason: "Select at least one game" };
  const rateParts = (done, possible) => {
    const d = Math.max(0, Number(done) || 0);
    const p = Math.max(0, Number(possible) || 0);
    return { done: d, possible: p, pct: p > 0 ? Math.round((d / p) * 100) : null };
  };
  const blocks = games.map((g) => {
    const wKey = taskKey(g, g.weeklies[0]);
    const eKey = taskKey(g, g.endgame[0]);
    const dDone = Number(state.dailiesCompleted[g.id]) || 0;
    const dPossible = Number(state.dailiesAttempted[g.id]) || 0;
    const wDone = Number(state.weekliesCompleted[wKey]) || 0;
    const wPossible = Number(state.weekliesAttempted[wKey]) || 0;
    const eDone = Number(state.endgameCompleted[eKey]) || 0;
    const ePossible = Number(state.endgameAttempted[eKey]) || 0;
    const dPot = Number(g.dailyCurrency) || 0;
    const wPot = Number(g.weeklies[0].currency) || 0;
    const ePot = Number(g.endgame[0].currency) || 0;
    const earned =
      dDone * dPot + wDone * wPot + eDone * ePot;
    const potential =
      dPossible * dPot + wPossible * wPot + ePossible * ePot;
    return {
      id: g.id,
      name: g.name,
      dailies: [{ label: "Dailies", ...rateParts(dDone, dPossible) }],
      weeklies: [{ label: g.weeklies[0].label, ...rateParts(wDone, wPossible) }],
      endgame: [{ label: g.endgame[0].label, ...rateParts(eDone, ePossible) }],
      currency: { earned, potential, currencyName: g.currencyName || "" },
    };
  });
  const currency = blocks.reduce(
    (acc, b) => ({
      earned: acc.earned + b.currency.earned,
      potential: acc.potential + b.currency.potential,
      currencyName: blocks.length === 1 ? b.currency.currencyName : "",
    }),
    { earned: 0, potential: 0, currencyName: "" }
  );
  return {
    ok: true,
    title: blocks.length === 1 ? blocks[0].name : "Last " + days + " days",
    subtitle: "Games tallies · finish days Last " + days + " days",
    startStr,
    endStr,
    days,
    games: blocks,
    finishDays: [0, 0, 0, 0, 0, 0, 0],
    currency,
  };
}
function dropCalendarMarksOnOrBefore(state, cutoffDateStr) {
  Object.keys(state.completionByDate || {}).forEach((ds) => {
    if (ds <= cutoffDateStr) delete state.completionByDate[ds];
  });
  state.completionTimestamps = (state.completionTimestamps || []).filter((t) => t.dateStr > cutoffDateStr);
}

/**
 * Sync-safe compact: archive marks on/before cutoff into baselines so Sync keeps tallies.
 */
function applyHistoryCompactSafe(state, cutoffDateStr) {
  const game = getGame(state);
  const keys = {
    dailies: game.dailies ? [game.id] : [],
    weeklies: (game.weeklies || []).map((t) => taskKey(game, t)),
    endgame: (game.endgame || []).map((t) => taskKey(game, t)),
  };
  keys.dailies.forEach((k) => syncTalliesFromCalendar(state, "dailies", k));
  keys.weeklies.forEach((k) => syncTalliesFromCalendar(state, "weeklies", k));
  keys.endgame.forEach((k) => syncTalliesFromCalendar(state, "endgame", k));

  const full = {
    dailiesCompleted: Object.assign({}, state.dailiesCompleted),
    dailiesAttempted: Object.assign({}, state.dailiesAttempted),
    weekliesCompleted: Object.assign({}, state.weekliesCompleted),
    weekliesAttempted: Object.assign({}, state.weekliesAttempted),
    endgameCompleted: Object.assign({}, state.endgameCompleted),
    endgameAttempted: Object.assign({}, state.endgameAttempted),
  };

  const saved = state.completionByDate;
  const filtered = {};
  Object.keys(saved || {}).forEach((ds) => {
    if (ds > cutoffDateStr) filtered[ds] = saved[ds];
  });
  const prev = state.historyCompact;
  state.completionByDate = filtered;
  state.historyCompact = null;
  keys.dailies.forEach((k) => syncTalliesFromCalendar(state, "dailies", k));
  keys.weeklies.forEach((k) => syncTalliesFromCalendar(state, "weeklies", k));
  keys.endgame.forEach((k) => syncTalliesFromCalendar(state, "endgame", k));
  const after = {
    dailiesCompleted: Object.assign({}, state.dailiesCompleted),
    dailiesAttempted: Object.assign({}, state.dailiesAttempted),
    weekliesCompleted: Object.assign({}, state.weekliesCompleted),
    weekliesAttempted: Object.assign({}, state.weekliesAttempted),
    endgameCompleted: Object.assign({}, state.endgameCompleted),
    endgameAttempted: Object.assign({}, state.endgameAttempted),
  };

  function sub(a, b) {
    const out = {};
    new Set([].concat(Object.keys(a || {}), Object.keys(b || {}))).forEach((k) => {
      const n = (Number(a[k]) || 0) - (Number(b[k]) || 0);
      if (n > 0) out[k] = n;
    });
    return out;
  }

  state.completionByDate = saved;
  state.historyCompact = prev;
  dropCalendarMarksOnOrBefore(state, cutoffDateStr);
  state.historyCompact = {
    cutoffDateStr,
    baselines: {
      dailiesCompleted: sub(full.dailiesCompleted, after.dailiesCompleted),
      dailiesAttempted: sub(full.dailiesAttempted, after.dailiesAttempted),
      weekliesCompleted: sub(full.weekliesCompleted, after.weekliesCompleted),
      weekliesAttempted: sub(full.weekliesAttempted, after.weekliesAttempted),
      endgameCompleted: sub(full.endgameCompleted, after.endgameCompleted),
      endgameAttempted: sub(full.endgameAttempted, after.endgameAttempted),
    },
  };
  state.dailiesCompleted = full.dailiesCompleted;
  state.dailiesAttempted = full.dailiesAttempted;
  state.weekliesCompleted = full.weekliesCompleted;
  state.weekliesAttempted = full.weekliesAttempted;
  state.endgameCompleted = full.endgameCompleted;
  state.endgameAttempted = full.endgameAttempted;
  return state.historyCompact;
}

function buildExportSummaryMarkdown(state, opts) {
  const o = opts || {};
  const days = Math.max(1, Number(o.days) || 90);
  const today = state.today;
  const start = math.addDays(today, -(days - 1));
  const game = getGame(state);
  const lines = [];
  lines.push("# Gacha Tracker summary");
  lines.push("Exported: " + today);
  lines.push("");
  lines.push("## Completion rates (last " + days + " days)");
  let dailyDone = 0;
  for (let i = 0; i < days; i++) {
    const ds = math.addDays(start, i);
    if ((state.completionByDate[ds] && state.completionByDate[ds].dailies || []).includes(game.id)) dailyDone++;
  }
  const wKey = taskKey(game, game.weeklies[0]);
  const events = getTrendEvents(state, "weeklies", wKey).filter((e) => e.dateStr >= start && e.dateStr <= today);
  lines.push(
    "| " +
      game.name +
      " | " +
      dailyDone +
      "/" +
      days +
      " | weeklies " +
      events.length +
      " events | — |"
  );
  lines.push("");
  lines.push("## Currency (lifetime tallies)");
  const totals = getDataTotals(state, game);
  lines.push(game.name + ": earned " + totals.total.earned + " / potential " + totals.total.potential);
  return lines.join("\n");
}

function buildExportSummaryCsv(state, opts) {
  const o = opts || {};
  const today = state.today;
  const days = o.days != null ? Math.max(1, Number(o.days) || 90) : null;
  const start = days != null ? math.addDays(today, -(days - 1)) : null;
  const rows = ["game,taskType,task,completedOn,hour,dayOfWeek"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const game = getGame(state);
  (state.completionTimestamps || [])
    .filter((t) => !start || (t.dateStr >= start && t.dateStr <= today))
    .forEach((t) => {
      const dow = dayNames[new Date(t.dateStr + "T12:00:00").getDay()];
      rows.push(
        '"' +
          game.name +
          '",' +
          t.taskType +
          ',"' +
          (t.taskLabel || t.taskId || "") +
          '",' +
          t.dateStr +
          "," +
          t.hour +
          "," +
          dow
      );
    });
  return rows.join("\n");
}

/**
 * Attendance pie skipped breakdown: games with tasks where attempted > completed.
 * includeMap: { gameId: false } to exclude (default include).
 */
function getAttendanceSkippedGroups(state, type, includeMap) {
  const include = includeMap || {};
  const groups = [];
  (state.games || []).forEach((game) => {
    if (include[game.id] === false) return;
    const tasks = [];
    if (type === "dailies") {
      if (!game.dailies) return;
      const attempted = Number(state.dailiesAttempted[game.id]) || 0;
      const completed = Number(state.dailiesCompleted[game.id]) || 0;
      const skipped = Math.max(0, attempted - completed);
      if (skipped > 0) tasks.push({ label: "Dailies", skipped, completed, attempted });
    } else if (type === "weeklies") {
      (game.weeklies || []).forEach((t) => {
        const key = taskKey(game, t);
        const attempted = Number(state.weekliesAttempted[key]) || 0;
        const completed = Number(state.weekliesCompleted[key]) || 0;
        const skipped = Math.max(0, attempted - completed);
        if (skipped > 0) tasks.push({ label: t.label || t.id, skipped, completed, attempted });
      });
    } else if (type === "endgame") {
      (game.endgame || []).forEach((t) => {
        const key = taskKey(game, t);
        const attempted = Number(state.endgameAttempted[key]) || 0;
        const completed = Number(state.endgameCompleted[key]) || 0;
        const skipped = Math.max(0, attempted - completed);
        if (skipped > 0) tasks.push({ label: t.label || t.id, skipped, completed, attempted });
      });
    }
    if (tasks.length) groups.push({ gameId: game.id, gameName: game.name, tasks });
  });
  return groups;
}

/** Persistable subset mirroring app buildSavePayload fields used by core features. */
function buildSavePayload(state) {
  return {
    games: state.games,
    completionByDate: state.completionByDate,
    completionTimestamps: state.completionTimestamps,
    dailiesCompleted: state.dailiesCompleted,
    dailiesAttempted: state.dailiesAttempted,
    weekliesCompleted: state.weekliesCompleted,
    weekliesAttempted: state.weekliesAttempted,
    endgameCompleted: state.endgameCompleted,
    endgameAttempted: state.endgameAttempted,
    endgameCurrencyEarned: state.endgameCurrencyEarned,
    endgameCurrencyPotential: state.endgameCurrencyPotential,
    historyCompact: state.historyCompact || null,
    dataVersion: state.dataVersion || 0,
    schemaVersion: state.schemaVersion || 0,
  };
}

/** In-memory localStorage stand-in + save/load round-trip. */
function createSaveStore() {
  const bag = Object.create(null);
  return {
    setItem(key, value) {
      bag[key] = String(value);
    },
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null;
    },
    removeItem(key) {
      delete bag[key];
    },
    _bag: bag,
  };
}

function saveState(store, state, key) {
  const k = key || "gacha-tracker";
  const payload = buildSavePayload(state);
  payload.dataVersion = (Number(payload.dataVersion) || 0) + 1;
  state.dataVersion = payload.dataVersion;
  store.setItem(k, JSON.stringify(payload));
  return payload;
}

function loadState(store, key) {
  const k = key || "gacha-tracker";
  const raw = store.getItem(k);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  const state = createFixture({ today: "2026-07-31" });
  if (parsed.games) state.games = parsed.games;
  if (parsed.completionByDate) state.completionByDate = parsed.completionByDate;
  if (Array.isArray(parsed.completionTimestamps)) state.completionTimestamps = parsed.completionTimestamps;
  ["dailiesCompleted", "dailiesAttempted", "weekliesCompleted", "weekliesAttempted", "endgameCompleted", "endgameAttempted"].forEach(
    (field) => {
      if (parsed[field]) state[field] = parsed[field];
    }
  );
  if (parsed.endgameCurrencyEarned) state.endgameCurrencyEarned = parsed.endgameCurrencyEarned;
  if (parsed.endgameCurrencyPotential) state.endgameCurrencyPotential = parsed.endgameCurrencyPotential;
  if (parsed.historyCompact) state.historyCompact = parsed.historyCompact;
  state.dataVersion = Number(parsed.dataVersion) || 0;
  state.schemaVersion = Number(parsed.schemaVersion) || 0;
  return state;
}

function syncAllTallies(state) {
  const game = getGame(state);
  if (game.dailies) syncTalliesFromCalendar(state, "dailies", game.id);
  (game.weeklies || []).forEach((t) => syncTalliesFromCalendar(state, "weeklies", taskKey(game, t)));
  (game.endgame || []).forEach((t) => syncTalliesFromCalendar(state, "endgame", taskKey(game, t)));
}

module.exports = {
  createFixture,
  getGame,
  taskKey,
  markComplete,
  markCompleteWithLegacyBoundaryBleed,
  markIncomplete,
  isCompletedInCurrentCycle,
  isCompletedInCycleForDate,
  simulateCalendarDayUncheck,
  diagnoseTaskResetDay,
  diagnoseAllResetDays,
  cleanupCycleBoundaryBleedMarks,
  historyMarksInMonth,
  historyCompletionDayInCycle,
  historyIsCarried,
  getTrendEvents,
  trendDayOfWeekCounts,
  trendHourCounts,
  syncTalliesFromCalendar,
  syncAllTallies,
  getDataTotals,
  captureUndoSlice,
  pushUndo,
  undoLast,
  dropCalendarMarksOnOrBefore,
  applyHistoryCompactSafe,
  buildShareCardModel,
  buildExportSummaryMarkdown,
  buildExportSummaryCsv,
  getAttendanceSkippedGroups,
  buildSavePayload,
  createSaveStore,
  saveState,
  loadState,
};
