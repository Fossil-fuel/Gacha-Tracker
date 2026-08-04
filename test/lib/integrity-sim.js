"use strict";

/**
 * Integrity scan/repair simulation for regression tests.
 * Mirrors src/01-core.js conflict kinds and repair behavior against sim-tracker state.
 */

const math = require("./cycle-math");

function emptyDay() {
  return { dailies: [], weeklies: [], endgame: [] };
}

function ensureDay(state, ds) {
  if (!state.completionByDate[ds]) state.completionByDate[ds] = emptyDay();
  return state.completionByDate[ds];
}

function cycleDatesFor(task, dateStr) {
  return math.getDatesInCycle(task, dateStr);
}

function scanDataConflicts(state) {
  const conflicts = [];
  const push = (c) => conflicts.push(c);
  (state.games || []).forEach((game) => {
    [["weeklies", game.weeklies], ["endgame", game.endgame]].forEach(([type, list]) => {
      (list || []).forEach((task) => {
        const taskId = task.id || task.label;
        const key = game.id + "." + taskId;
        const unlockDays = Number(task.earliestCompleteDays) || 0;

        const calDates = [];
        Object.keys(state.completionByDate || {})
          .sort()
          .forEach((ds) => {
            const day = state.completionByDate[ds];
            if (!day) return;
            if ((day[type] || []).includes(key)) calDates.push(ds);
          });
        const stamps = (state.completionTimestamps || []).filter(
          (t) => t.taskType === type && t.gameId === game.id && t.taskId === taskId
        );

        const cycleMap = new Map();
        const ensureCycle = (ds) => {
          const dates = cycleDatesFor(task, ds);
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
          const unlockDate = math.addDays(start, unlockDays);
          if (cyc.tsEarliest && !cyc.calEarliest) {
            push({
              severity: "warn",
              kind: "timestamp-without-calendar",
              game: game.name,
              task: task.label || taskId,
              type,
              cycleStart: start,
              message: "Timestamp on " + cyc.tsEarliest + " but no calendar mark in cycle starting " + start,
            });
          }
          if (cyc.calEarliest && !cyc.tsEarliest) {
            push({
              severity: "info",
              kind: "calendar-without-timestamp",
              game: game.name,
              task: task.label || taskId,
              type,
              cycleStart: start,
              message: "Calendar mark from " + cyc.calEarliest + " with no timestamp (cycle " + start + ")",
            });
          }
          if (cyc.calEarliest && cyc.tsEarliest && cyc.calEarliest < cyc.tsEarliest) {
            push({
              severity: "warn",
              kind: "calendar-before-timestamp",
              game: game.name,
              task: task.label || taskId,
              type,
              cycleStart: start,
              message:
                "Calendar starts " + cyc.calEarliest + " but timestamp is " + cyc.tsEarliest + " (cycle " + start + ")",
            });
          }
          if (cyc.stamps.length > 1) {
            const uniq = new Set(cyc.stamps.map((s) => s.dateStr));
            if (uniq.size > 1 || cyc.stamps.length > uniq.size) {
              push({
                severity: "warn",
                kind: "duplicate-timestamps",
                game: game.name,
                task: task.label || taskId,
                type,
                cycleStart: start,
                message: cyc.stamps.length + " timestamps in cycle " + start,
              });
            }
          }
          const early = cyc.tsEarliest || cyc.calEarliest;
          const hasUnlockWindow =
            unlockDays > 0 ||
            Number.isFinite(task.earliestCompleteHour) ||
            Number.isFinite(task.earliestCompleteMinute);
          if (hasUnlockWindow && early && early < unlockDate) {
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
              dateStr: early,
              unlockDate,
              suggestedDateStr: unlockDate,
              message: "Completion " + early + " is before unlock day " + unlockDate,
            });
          }
        });

        const completedKey = type === "weeklies" ? "weekliesCompleted" : "endgameCompleted";
        const calCycles = new Set();
        calDates.forEach((ds) => {
          const dates = cycleDatesFor(task, ds);
          if (dates.length) calCycles.add(dates[0]);
        });
        const tallied = Number(state[completedKey] && state[completedKey][key]) || 0;
        if (calCycles.size !== tallied && (calCycles.size > 0 || tallied > 0)) {
          push({
            severity: "warn",
            kind: "tally-mismatch",
            type,
            message: "tally " + tallied + " vs calendar cycles " + calCycles.size,
          });
        }
      });
    });
  });

  const byKind = {};
  conflicts.forEach((c) => {
    byKind[c.kind] = (byKind[c.kind] || 0) + 1;
  });
  return {
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

function repairTiming(state, types) {
  (state.games || []).forEach((game) => {
    types.forEach((type) => {
      const list = type === "weeklies" ? game.weeklies : game.endgame;
      (list || []).forEach((task) => {
        const taskId = task.id || task.label;
        const key = game.id + "." + taskId;
        const unlockDays = Number(task.earliestCompleteDays) || 0;
        const cycleStarts = new Set();
        Object.keys(state.completionByDate || {}).forEach((ds) => {
          const day = state.completionByDate[ds];
          if (!day || !(day[type] || []).includes(key)) return;
          const dates = cycleDatesFor(task, ds);
          if (dates.length) cycleStarts.add(dates[0]);
        });
        (state.completionTimestamps || []).forEach((t) => {
          if (t.taskType !== type || t.gameId !== game.id || t.taskId !== taskId) return;
          const dates = cycleDatesFor(task, t.dateStr);
          if (dates.length) cycleStarts.add(dates[0]);
        });

        [...cycleStarts].sort().forEach((start) => {
          const cycleDates = cycleDatesFor(task, start);
          if (!cycleDates.length) return;
          const cycleEnd = cycleDates[cycleDates.length - 1];
          let minCompletion = math.addDays(start, unlockDays);
          const tsInCycle = (state.completionTimestamps || [])
            .filter(
              (t) =>
                t.taskType === type &&
                t.gameId === game.id &&
                t.taskId === taskId &&
                t.dateStr >= start &&
                t.dateStr <= cycleEnd
            )
            .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
          let calEarliest = null;
          for (const ds of cycleDates) {
            const day = state.completionByDate[ds];
            if (day && (day[type] || []).includes(key)) {
              calEarliest = ds;
              break;
            }
          }
          let completion = tsInCycle.length ? tsInCycle[0].dateStr : calEarliest;
          if (!completion) return;
          if (completion < minCompletion) completion = minCompletion;
          if (completion > cycleEnd) completion = cycleEnd;

          let keptOne = false;
          tsInCycle.forEach((t) => {
            if (!keptOne) {
              t.dateStr = completion;
              keptOne = true;
            } else {
              const idx = state.completionTimestamps.indexOf(t);
              if (idx >= 0) state.completionTimestamps.splice(idx, 1);
            }
          });

          cycleDates.forEach((ds) => {
            const day = state.completionByDate[ds];
            const arr = day && day[type];
            if (!arr) return;
            const idx = arr.indexOf(key);
            if (idx >= 0 && ds < completion) arr.splice(idx, 1);
          });
          math.getRemainingDatesFrom(task, completion).forEach((ds) => {
            const day = ensureDay(state, ds);
            if (!day[type].includes(key)) day[type].push(key);
          });
        });
      });
    });
  });
}

function fillFromTimestamps(state) {
  (state.games || []).forEach((game) => {
    [["weeklies", game.weeklies], ["endgame", game.endgame]].forEach(([type, list]) => {
      (list || []).forEach((task) => {
        const taskId = task.id || task.label;
        const key = game.id + "." + taskId;
        const unlockDays = Number(task.earliestCompleteDays) || 0;
        (state.completionTimestamps || []).forEach((t) => {
          if (t.taskType !== type || t.gameId !== game.id || t.taskId !== taskId) return;
          const dates = cycleDatesFor(task, t.dateStr);
          if (!dates.length) return;
          let completion = t.dateStr;
          const min = math.addDays(dates[0], unlockDays);
          if (completion < min) completion = min;
          math.getRemainingDatesFrom(task, completion).forEach((ds) => {
            const day = ensureDay(state, ds);
            if (!day[type].includes(key)) day[type].push(key);
          });
        });
      });
    });
  });
}

function syncTallies(state) {
  (state.games || []).forEach((game) => {
    if (game.dailies) {
      let n = 0;
      Object.keys(state.completionByDate || {}).forEach((ds) => {
        const day = state.completionByDate[ds];
        if (day && (day.dailies || []).includes(game.id)) n++;
      });
      state.dailiesCompleted[game.id] = n;
      state.dailiesAttempted[game.id] = n;
    }
    (game.weeklies || []).forEach((task) => {
      const key = game.id + "." + (task.id || task.label);
      const starts = new Set();
      Object.keys(state.completionByDate || {}).forEach((ds) => {
        const day = state.completionByDate[ds];
        if (!day || !(day.weeklies || []).includes(key)) return;
        const dates = cycleDatesFor(task, ds);
        if (dates.length) starts.add(dates[0]);
      });
      state.weekliesCompleted[key] = starts.size;
      state.weekliesAttempted[key] = starts.size;
    });
    (game.endgame || []).forEach((task) => {
      const key = game.id + "." + (task.id || task.label);
      const starts = new Set();
      Object.keys(state.completionByDate || {}).forEach((ds) => {
        const day = state.completionByDate[ds];
        if (!day || !(day.endgame || []).includes(key)) return;
        const dates = cycleDatesFor(task, ds);
        if (dates.length) starts.add(dates[0]);
      });
      state.endgameCompleted[key] = starts.size;
      state.endgameAttempted[key] = starts.size;
    });
  });
}

function dedupeTimestamps(state) {
  const seen = new Set();
  const next = [];
  let removed = 0;
  (state.completionTimestamps || []).forEach((t) => {
    const k = [t.taskType, t.gameId, t.taskId || "", t.dateStr].join("|");
    if (seen.has(k)) {
      removed++;
      return;
    }
    seen.add(k);
    next.push(t);
  });
  state.completionTimestamps = next;
  return removed;
}

/**
 * mode: safe | prefer-timestamps | tallies-only
 */
function runIntegrityRepair(state, mode) {
  const m = mode || "safe";
  const before = scanDataConflicts(state);
  if (m === "tallies-only") {
    syncTallies(state);
  } else {
    dedupeTimestamps(state);
    if (m === "prefer-timestamps") repairTiming(state, ["weeklies", "endgame"]);
    else repairTiming(state, ["endgame"]);
    fillFromTimestamps(state);
    // Prefer timestamp finish day when filling remaining (weeklies + endgame)
    repairTiming(state, m === "prefer-timestamps" ? ["weeklies", "endgame"] : ["weeklies", "endgame"]);
    syncTallies(state);
  }
  const after = scanDataConflicts(state);
  return { before, after, mode: m };
}

function countKind(scan, kind) {
  return (scan.counts.byKind && scan.counts.byKind[kind]) || 0;
}

function listMissingCompletionTimes(state) {
  const missing = [];
  const scan = scanDataConflicts(state);
  (scan.conflicts || []).forEach((c) => {
    if (c.kind !== "calendar-without-timestamp") return;
    const game = (state.games || []).find((g) => g.name === c.game);
    if (!game) return;
    const list = c.type === "weeklies" ? game.weeklies : game.endgame;
    const task = (list || []).find((t) => (t.label || t.id) === c.task || t.id === c.task);
    if (!task) return;
    const key = game.id + "." + (task.id || task.label);
    let dateStr = c.cycleStart;
    const m = String(c.message || "").match(/Calendar mark from (\d{4}-\d{2}-\d{2})/);
    if (m) dateStr = m[1];
    missing.push({ type: c.type, key, dateStr, label: c.task });
  });
  Object.keys(state.completionByDate || {}).forEach((ds) => {
    ((state.completionByDate[ds].dailies || [])).forEach((gameId) => {
      const has = (state.completionTimestamps || []).some(
        (t) => t.taskType === "dailies" && t.gameId === gameId && t.dateStr === ds
      );
      if (!has) missing.push({ type: "dailies", key: gameId, dateStr: ds, label: "Dailies" });
    });
  });
  return missing;
}

function fillMissingCompletionTimes(state, entries) {
  let added = 0;
  (entries || []).forEach((row) => {
    if (!row || !row.type || !row.key || !row.dateStr) return;
    const gameId = row.type === "dailies" ? row.key : row.key.slice(0, row.key.indexOf("."));
    const taskId = row.type === "dailies" ? "" : row.key.slice(row.key.indexOf(".") + 1);
    const exists = (state.completionTimestamps || []).some(
      (t) =>
        t.taskType === row.type &&
        t.gameId === gameId &&
        t.dateStr === row.dateStr &&
        (row.type === "dailies" || t.taskId === taskId)
    );
    if (exists) return;
    state.completionTimestamps.push({
      dateStr: row.dateStr,
      hour: Number.isFinite(row.hour) ? row.hour : 12,
      minute: Number.isFinite(row.minute) ? row.minute : 0,
      gameId,
      taskType: row.type,
      taskId,
      taskLabel: taskId || gameId,
    });
    added++;
  });
  return { ok: true, added, after: scanDataConflicts(state) };
}

function listDuplicateCompletionTimestamps(state) {
  const groups = [];
  (state.games || []).forEach((game) => {
    [["weeklies", game.weeklies], ["endgame", game.endgame]].forEach(([type, list]) => {
      (list || []).forEach((task) => {
        const taskId = task.id || task.label;
        const key = game.id + "." + taskId;
        const stamps = (state.completionTimestamps || []).filter(
          (t) => t.taskType === type && t.gameId === game.id && t.taskId === taskId
        );
        const cycleMap = new Map();
        stamps.forEach((t) => {
          const dates = cycleDatesFor(task, t.dateStr);
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
          if (cycleStamps.length < 2) return;
          groups.push({
            type,
            key,
            gameId: game.id,
            taskId,
            label: (game.name || game.id) + " — " + (task.label || taskId),
            cycleStart: start,
            stamps: cycleStamps.slice().sort((a, b) => String(a.dateStr).localeCompare(String(b.dateStr))),
          });
        });
      });
    });
  });
  return groups;
}

function resolveDuplicateCompletionTimestamps(state, choices) {
  let removed = 0;
  let resolved = 0;
  (choices || []).forEach((choice) => {
    if (!choice || !choice.type || !choice.gameId || !choice.keep || !choice.cycleStart) return;
    const taskId = choice.taskId || "";
    const game = (state.games || []).find((g) => g.id === choice.gameId);
    const taskList = game ? (choice.type === "weeklies" ? game.weeklies : game.endgame) : [];
    const task = (taskList || []).find((t) => (t.id || t.label) === taskId);
    if (!game || !task) return;
    const inGroup = (state.completionTimestamps || []).filter((t) => {
      if (!t || t.taskType !== choice.type || t.gameId !== choice.gameId || t.taskId !== taskId) return false;
      const dates = cycleDatesFor(task, t.dateStr);
      return dates.length && dates[0] === choice.cycleStart;
    });
    if (inGroup.length < 2) return;
    let keepRef = inGroup.find(
      (t) =>
        t.dateStr === choice.keep.dateStr &&
        (Number(t.hour) || 0) === (Number(choice.keep.hour) || 0) &&
        (Number(t.minute) || 0) === (Number(choice.keep.minute) || 0)
    );
    if (!keepRef) keepRef = inGroup[inGroup.length - 1];
    const drop = new Set(inGroup.filter((t) => t !== keepRef));
    if (!drop.size) return;
    state.completionTimestamps = (state.completionTimestamps || []).filter((t) => !drop.has(t));
    removed += drop.size;
    resolved++;
  });
  return { ok: true, removed, resolved, after: scanDataConflicts(state) };
}

/**
 * Conservative sync: keep existing in-cycle stamps; fill missing from trend hour mode.
 * Does not remove orphans or move existing stamp dates.
 */
function syncTimestampsFromCalendar(state, opts) {
  const o = opts || {};
  const filter = Array.isArray(o.gameIds) && o.gameIds.length ? new Set(o.gameIds) : null;
  const old = (state.completionTimestamps || []).slice();
  const required = [];
  const seen = new Set();

  function modeHour(stamps) {
    const list = (stamps || []).filter((t) => t && Number.isFinite(Number(t.hour)));
    if (!list.length) return { hour: 12, minute: 0 };
    const recentFirst = list.slice().sort((a, b) => (a.dateStr < b.dateStr ? 1 : a.dateStr > b.dateStr ? -1 : 0));
    const sample = recentFirst.slice(0, Math.min(12, recentFirst.length));
    const counts = {};
    sample.forEach((t) => {
      const h = Math.round(Number(t.hour));
      counts[h] = (counts[h] || 0) + 1;
    });
    const recentHour = Math.round(Number(sample[0].hour));
    let bestH = recentHour;
    let bestC = -1;
    Object.keys(counts).forEach((h) => {
      const n = counts[h];
      const hi = Number(h);
      if (n > bestC || (n === bestC && hi === recentHour)) {
        bestC = n;
        bestH = hi;
      }
    });
    return { hour: bestH, minute: 0 };
  }

  function infer(type, gameId, taskId) {
    const tiers = [
      old.filter((t) => t.taskType === type && t.gameId === gameId && (type === "dailies" || t.taskId === taskId)),
      old.filter((t) => t.taskType === type && t.gameId === gameId),
      old.filter((t) => t.gameId === gameId),
      old,
    ];
    for (let i = 0; i < tiers.length; i++) {
      if (tiers[i].length) return modeHour(tiers[i]);
    }
    return { hour: 12, minute: 0 };
  }

  Object.keys(state.completionByDate || {})
    .sort()
    .forEach((ds) => {
      const day = state.completionByDate[ds] || {};
      ["weeklies", "endgame"].forEach((type) => {
        (day[type] || []).forEach((key) => {
          const gameId = key.slice(0, key.indexOf("."));
          const taskId = key.slice(key.indexOf(".") + 1);
          if (filter && !filter.has(gameId)) return;
          const task = findTask(state, type, key);
          if (!task) return;
          const cycle = math.getDatesInCycle(task, ds);
          const cycleKey = type + "|" + key + "|" + cycle[0];
          if (seen.has(cycleKey)) return;
          seen.add(cycleKey);
          let earliest = null;
          for (const d of cycle) {
            if ((state.completionByDate[d] && state.completionByDate[d][type] || []).includes(key)) {
              earliest = d;
              break;
            }
          }
          if (!earliest) return;
          required.push({
            type,
            key,
            gameId,
            taskId,
            dateStr: earliest,
            cycleStart: cycle[0],
            cycleEnd: cycle[cycle.length - 1],
          });
        });
      });
    });

  let kept = 0;
  let added = 0;
  required.forEach((req) => {
    const inCycle = old.filter(
      (t) =>
        t.taskType === req.type &&
        t.gameId === req.gameId &&
        t.taskId === req.taskId &&
        t.dateStr >= req.cycleStart &&
        t.dateStr <= req.cycleEnd
    );
    if (inCycle.length) {
      kept++;
      return;
    }
    const inferred = infer(req.type, req.gameId, req.taskId);
    state.completionTimestamps.push({
      dateStr: req.dateStr,
      hour: inferred.hour,
      minute: inferred.minute,
      gameId: req.gameId,
      taskType: req.type,
      taskId: req.taskId,
      taskLabel: req.taskId,
    });
    added++;
  });

  return {
    ok: true,
    kept,
    added,
    moved: 0,
    removed: 0,
    collapsed: 0,
    missing: [],
    after: scanDataConflicts(state),
  };
}

function findTask(state, type, key) {
  const gameId = key.slice(0, key.indexOf("."));
  const taskId = key.slice(key.indexOf(".") + 1);
  const game = (state.games || []).find((g) => g.id === gameId);
  if (!game) return null;
  const list = type === "weeklies" ? game.weeklies : game.endgame;
  return (list || []).find((t) => (t.id || t.label) === taskId) || null;
}

module.exports = {
  scanDataConflicts,
  runIntegrityRepair,
  countKind,
  ensureDay,
  listMissingCompletionTimes,
  fillMissingCompletionTimes,
  listDuplicateCompletionTimestamps,
  resolveDuplicateCompletionTimestamps,
  syncTimestampsFromCalendar,
};
