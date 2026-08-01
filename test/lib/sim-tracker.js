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
        dateStarted: "2026-07-06",
        frequencyEvery: 1,
        frequencyUnit: "week",
        timeLimitEvery: 1,
        timeLimitUnit: "week",
        currency: 50,
        earliestCompleteDays: 2,
      },
    ],
  };

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
function markComplete(state, type, key, dateStr, hour) {
  const game = getGame(state);
  let completion = dateStr;

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
    (t) => t.taskType === type && t.gameId === (type === "dailies" ? key : key.split(".")[0]) && t.dateStr === completion && (type === "dailies" || t.taskId === key.split(".").slice(1).join("."))
  );
  if (!already) {
    const gameId = type === "dailies" ? key : key.slice(0, key.indexOf("."));
    const taskId = type === "dailies" ? "" : key.slice(key.indexOf(".") + 1);
    state.completionTimestamps.push({
      dateStr: completion,
      hour: Number.isFinite(hour) ? hour : 12,
      gameId,
      taskType: type,
      taskId,
      taskLabel: taskId || game.name,
    });
  }
  return completion;
}

function markIncomplete(state, type, key, dateStr) {
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

/** Calendar sync: recompute completed/attempted from marks up to today. */
function syncTalliesFromCalendar(state, type, key) {
  const game = getGame(state);
  const today = state.today;

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
    if (type === "weeklies") {
      state.weekliesCompleted[key] = 0;
      state.weekliesAttempted[key] = 0;
    } else {
      state.endgameCompleted[key] = 0;
      state.endgameAttempted[key] = 0;
    }
    return { completed: 0, attempted: 0 };
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

module.exports = {
  createFixture,
  getGame,
  taskKey,
  markComplete,
  markIncomplete,
  historyMarksInMonth,
  historyCompletionDayInCycle,
  getTrendEvents,
  trendDayOfWeekCounts,
  trendHourCounts,
  syncTalliesFromCalendar,
  getDataTotals,
};
