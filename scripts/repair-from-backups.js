#!/usr/bin/env node
"use strict";

/**
 * Rebuild attendance/history markers from Gacha Tracker backup JSON files.
 * - Dedupes completionTimestamps (fixes inflated weeklies day-of-week chart)
 * - Rebuilds weeklies calendar marks as: earliest day in cycle + fill remaining
 * - Rebuilds endgame marks from timestamps when available (not polluted day-1 calendar)
 * - Pain Cage: earliest completion is day 3 of each cycle; clamps earlier marks/timestamps
 * - Writes an importable backup next to the source backups
 */

const fs = require("fs");
const path = require("path");

const BACKUP_DIR = "E:\\Gacha Tracker Back-ups";
const OUT_FILE = path.join(BACKUP_DIR, "gacha-tracker-repaired-from-backups.json");

function loadBackup(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const inner = raw["gacha-tracker"];
  return typeof inner === "string" ? JSON.parse(inner) : inner;
}

function listBackups() {
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("gacha-tracker-backup-") && f.endsWith(".json"))
    .filter((f) => !f.includes("repaired"))
    .map((f) => path.join(BACKUP_DIR, f))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
}

function isValidDateStr(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function daysBetween(a, b) {
  const da = new Date(a + "T12:00:00").getTime();
  const db = new Date(b + "T12:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

function getIntervalDays(every, unit) {
  const n = Math.max(1, Number(every) || 1);
  return unit === "day" ? n : n * 7;
}

function getCycleParams(task) {
  const freqUnit = task && task.frequencyUnit === "day" ? "day" : "week";
  const intervalDays = getIntervalDays(task && task.frequencyEvery, freqUnit);
  const limitUnit = task && task.timeLimitUnit === "day" ? "day" : "week";
  const hasExplicit = task && (task.timeLimitEvery != null || task.timeLimitUnit != null);
  const timeLimitDays = hasExplicit ? getIntervalDays(task.timeLimitEvery, limitUnit) : intervalDays;
  return { intervalDays, timeLimitDays };
}

/** Approximate anchor date string (calendar day), aligned back to weekStartDay. */
function getAnchorDateStr(task) {
  const ds = isValidDateStr(task && task.dateStarted) ? task.dateStarted : null;
  if (!ds) return null;
  const weekStartDay = Number.isFinite(task.weekStartDay) ? task.weekStartDay : 1;
  const d = new Date(ds + "T12:00:00");
  const dayOfWeek = d.getDay();
  const daysBack = (dayOfWeek - weekStartDay + 7) % 7;
  return addDays(ds, -daysBack);
}

function getCycleStartDateStr(task, dateStr) {
  const anchor = getAnchorDateStr(task);
  if (!anchor || dateStr < anchor) return null;
  const { intervalDays } = getCycleParams(task);
  const offset = daysBetween(anchor, dateStr);
  const k = Math.floor(offset / intervalDays);
  return addDays(anchor, k * intervalDays);
}

function getDatesInCycle(task, dateStr) {
  const start = getCycleStartDateStr(task, dateStr);
  if (!start) return [dateStr];
  const { timeLimitDays } = getCycleParams(task);
  const dates = [];
  for (let i = 0; i < timeLimitDays; i++) dates.push(addDays(start, i));
  return dates;
}

function getRemainingDatesFrom(task, fromDateStr) {
  const all = getDatesInCycle(task, fromDateStr);
  return all.filter((ds) => ds >= fromDateStr);
}

function timestampKey(t) {
  const taskId = t.taskType === "dailies" ? "" : t.taskId || "";
  return [t.taskType || "", t.gameId || "", taskId, t.dateStr || ""].join("|");
}

function dowCounts(timestamps, type) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  timestamps
    .filter((t) => t.taskType === type)
    .forEach((t) => {
      if (!isValidDateStr(t.dateStr)) return;
      c[new Date(t.dateStr + "T12:00:00").getDay()]++;
    });
  return c;
}

function findTask(games, type, key) {
  const dot = key.indexOf(".");
  if (dot <= 0) return null;
  const gameId = key.slice(0, dot);
  const taskId = key.slice(dot + 1);
  const game = (games || []).find((g) => g.id === gameId);
  if (!game) return null;
  const list = type === "weeklies" ? game.weeklies : game.endgame;
  const task = (list || []).find((t) => (t.id || t.label) === taskId);
  return task ? { game, task } : null;
}

function isPainCageTask(task) {
  if (!task) return false;
  const id = String(task.id || "").toLowerCase();
  const label = String(task.label || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return id === "pain_cage" || id.includes("pain_cage") || label === "pain cage";
}

function rebuildCycleMarks(games, completionByDate, type) {
  // Collect all marked dates per key
  const byKey = {};
  Object.keys(completionByDate || {})
    .sort()
    .forEach((ds) => {
      (completionByDate[ds][type] || []).forEach((key) => {
        if (!byKey[key]) byKey[key] = [];
        byKey[key].push(ds);
      });
    });

  // Clear existing marks of this type
  Object.keys(completionByDate || {}).forEach((ds) => {
    if (completionByDate[ds][type]) completionByDate[ds][type] = [];
  });

  Object.keys(byKey).forEach((key) => {
    const found = findTask(games, type, key);
    const dates = byKey[key].slice().sort();
    if (!found) {
      // Keep earliest only if we can't resolve cycles
      const keep = dates[0];
      if (!completionByDate[keep]) completionByDate[keep] = { dailies: [], weeklies: [], endgame: [] };
      if (!completionByDate[keep][type].includes(key)) completionByDate[keep][type].push(key);
      return;
    }
    const { task } = found;
    // Ensure dateStarted for cycle math
    if (!isValidDateStr(task.dateStarted) && dates[0]) task.dateStarted = dates[0];

    const used = new Set();
    dates.forEach((ds) => {
      if (used.has(ds)) return;
      const cycleDates = getDatesInCycle(task, ds);
      const markedInCycle = cycleDates.filter((d) => dates.includes(d));
      if (markedInCycle.length === 0) return;
      let earliest = markedInCycle[0];
      if (type === "endgame" && isPainCageTask(task) && cycleDates.length >= 3) {
        const minDay = cycleDates[2]; // day 3 of cycle
        if (earliest < minDay) earliest = minDay;
      }
      cycleDates.forEach((d) => used.add(d));
      getRemainingDatesFrom(task, earliest).forEach((fillDs) => {
        if (!completionByDate[fillDs]) completionByDate[fillDs] = { dailies: [], weeklies: [], endgame: [] };
        if (!completionByDate[fillDs][type].includes(key)) completionByDate[fillDs][type].push(key);
      });
    });
  });
}

/**
 * Rebuild endgame calendar from timestamps (preferred) else earliest calendar mark.
 * Clamps Pain Cage to day 3+ and rewrites too-early timestamps.
 */
function rebuildEndgameFromTimestamps(games, completionByDate, timestamps) {
  const byKeyCal = {};
  Object.keys(completionByDate || {})
    .sort()
    .forEach((ds) => {
      (completionByDate[ds].endgame || []).forEach((key) => {
        if (!byKeyCal[key]) byKeyCal[key] = [];
        byKeyCal[key].push(ds);
      });
    });

  const byKeyTs = {};
  (timestamps || []).forEach((t) => {
    if (!t || t.taskType !== "endgame" || !isValidDateStr(t.dateStr) || !t.gameId) return;
    const key = t.gameId + "." + (t.taskId || "");
    if (!byKeyTs[key]) byKeyTs[key] = [];
    byKeyTs[key].push(t);
  });

  Object.keys(completionByDate || {}).forEach((ds) => {
    if (completionByDate[ds].endgame) completionByDate[ds].endgame = [];
  });

  const allKeys = new Set([...Object.keys(byKeyCal), ...Object.keys(byKeyTs)]);
  let painCageFixed = 0;
  let cyclesRebuilt = 0;

  allKeys.forEach((key) => {
    const found = findTask(games, "endgame", key);
    const calDates = (byKeyCal[key] || []).slice().sort();
    const tsEntries = (byKeyTs[key] || []).slice().sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    if (!found) {
      const keep = (tsEntries[0] && tsEntries[0].dateStr) || calDates[0];
      if (!keep) return;
      if (!completionByDate[keep]) completionByDate[keep] = { dailies: [], weeklies: [], endgame: [] };
      if (!completionByDate[keep].endgame.includes(key)) completionByDate[keep].endgame.push(key);
      return;
    }
    const { task } = found;
    if (!isValidDateStr(task.dateStarted)) {
      const seed = (tsEntries[0] && tsEntries[0].dateStr) || calDates[0];
      if (seed) task.dateStarted = seed;
    }
    const painCage = isPainCageTask(task);
    const used = new Set();
    const seedDates = [
      ...calDates,
      ...tsEntries.map((t) => t.dateStr),
    ].sort();

    seedDates.forEach((ds) => {
      if (used.has(ds)) return;
      const cycleDates = getDatesInCycle(task, ds);
      if (cycleDates.length === 0) return;
      cycleDates.forEach((d) => used.add(d));
      const cycleEnd = cycleDates[cycleDates.length - 1];
      const minCompletion = painCage && cycleDates.length >= 3 ? cycleDates[2] : cycleDates[0];

      const tsInCycle = tsEntries.filter((t) => t.dateStr >= cycleDates[0] && t.dateStr <= cycleEnd);
      const calInCycle = calDates.filter((d) => d >= cycleDates[0] && d <= cycleEnd);
      if (tsInCycle.length === 0 && calInCycle.length === 0) return;

      let completion = tsInCycle.length ? tsInCycle[0].dateStr : calInCycle[0];
      if (completion < minCompletion) {
        if (painCage) painCageFixed++;
        completion = minCompletion;
      }
      if (completion > cycleEnd) completion = cycleEnd;

      tsInCycle.forEach((t) => {
        if (t.dateStr >= completion) return;
        const dup = tsEntries.some((other) => other !== t && other.dateStr === completion);
        if (dup) {
          const idx = timestamps.indexOf(t);
          if (idx >= 0) timestamps.splice(idx, 1);
        } else {
          t.dateStr = completion;
        }
      });

      getRemainingDatesFrom(task, completion).forEach((fillDs) => {
        if (!completionByDate[fillDs]) completionByDate[fillDs] = { dailies: [], weeklies: [], endgame: [] };
        if (!completionByDate[fillDs].endgame.includes(key)) completionByDate[fillDs].endgame.push(key);
      });
      cyclesRebuilt++;
    });
  });

  return { painCageFixed, cyclesRebuilt };
}

function mergeCompletionByDate(target, source) {
  Object.keys(source || {}).forEach((ds) => {
    if (!target[ds]) target[ds] = { dailies: [], weeklies: [], endgame: [] };
    ["dailies", "weeklies", "endgame"].forEach((type) => {
      const arr = source[ds][type] || [];
      arr.forEach((key) => {
        if (!target[ds][type].includes(key)) target[ds][type].push(key);
      });
    });
  });
}

function main() {
  const files = listBackups();
  if (files.length === 0) {
    console.error("No backups found in", BACKUP_DIR);
    process.exit(1);
  }

  // Prefer structural/latest non-BETTER as base for games/settings; still merge marks from all.
  const preferred =
    files.find((f) => path.basename(f) === "gacha-tracker-backup-2026-07-31.json") ||
    files[files.length - 1];

  console.log("Base file:", path.basename(preferred));
  console.log(
    "Merging",
    files.length,
    "backups:",
    files.map((f) => path.basename(f)).join(", ")
  );

  const base = loadBackup(preferred);
  const mergedTimestamps = [];
  const seenTs = new Map(); // key -> index in mergedTimestamps
  const mergedCal = {};

  // Timestamps: seed from the clean preferred backup first (matches the known-good DOW chart),
  // then add missing entries from older backups. Skip the corrupted "(BETTER)" flood.
  const preferredBaseName = path.basename(preferred);
  function considerTimestamp(t, allowDuplicatesFromPreferred) {
    if (!t || !isValidDateStr(t.dateStr) || !t.taskType || !t.gameId) return;
    const k = timestampKey(t);
    if (seenTs.has(k)) {
      const prev = mergedTimestamps[seenTs.get(k)];
      if (!Number.isFinite(prev.hour) && Number.isFinite(t.hour)) prev.hour = t.hour;
      return;
    }
    if (allowDuplicatesFromPreferred) {
      // Preferred file may contain a few historical duplicate stamps; keep them for chart fidelity.
    }
    seenTs.set(k, mergedTimestamps.length);
    mergedTimestamps.push({
      dateStr: t.dateStr,
      hour: Number.isFinite(t.hour) ? t.hour : 12,
      gameId: t.gameId,
      taskType: t.taskType,
      taskId: t.taskId || "",
      taskLabel: t.taskLabel || t.taskId || "",
    });
  }

  // 1) Preferred timestamps — keep as-is (including mild historical dupes)
  (base.completionTimestamps || []).forEach((t) => {
    if (!t || !isValidDateStr(t.dateStr) || !t.taskType || !t.gameId) return;
    mergedTimestamps.push({
      dateStr: t.dateStr,
      hour: Number.isFinite(t.hour) ? t.hour : 12,
      gameId: t.gameId,
      taskType: t.taskType,
      taskId: t.taskId || "",
      taskLabel: t.taskLabel || t.taskId || "",
    });
    seenTs.set(timestampKey(t), mergedTimestamps.length - 1);
  });

  files.forEach((f) => {
    const baseName = path.basename(f);
    const data = loadBackup(f);
    mergeCompletionByDate(mergedCal, data.completionByDate);

    // Prefer the earliest known dateStarted for each weekly/endgame task (newer saves sometimes drifted).
    (data.games || []).forEach((g) => {
      const baseGame = (base.games || []).find((bg) => bg.id === g.id) || (base.games || []).find((bg) => bg.name === g.name);
      if (!baseGame) return;
      ["weeklies", "endgame"].forEach((type) => {
        (g[type] || []).forEach((t) => {
          if (!isValidDateStr(t.dateStarted)) return;
          const bt = (baseGame[type] || []).find((x) => (x.id || x.label) === (t.id || t.label) || x.label === t.label);
          if (!bt) return;
          if (!isValidDateStr(bt.dateStarted) || t.dateStarted < bt.dateStarted) bt.dateStarted = t.dateStarted;
        });
      });
    });

    if (baseName === preferredBaseName) return;
    if (baseName.includes("(BETTER)")) return; // corrupted duplicate flood

    (data.completionTimestamps || []).forEach((t) => considerTimestamp(t, false));
  });

  mergedTimestamps.sort((a, b) => {
    const ka = a.dateStr + "T" + String(a.hour).padStart(2, "0") + "|" + a.taskType + "|" + a.gameId + "|" + a.taskId;
    const kb = b.dateStr + "T" + String(b.hour).padStart(2, "0") + "|" + b.taskType + "|" + b.gameId + "|" + b.taskId;
    return ka.localeCompare(kb);
  });

  // Rebuild weeklies/endgame fills from earliest mark per cycle using base game configs.
  // First ensure missing dateStarted from earliest calendar mark.
  (base.games || []).forEach((game) => {
    ["weeklies", "endgame"].forEach((type) => {
      (game[type] || []).forEach((task) => {
        if (isValidDateStr(task.dateStarted)) return;
        const key = game.id + "." + (task.id || task.label);
        let earliest = null;
        Object.keys(mergedCal)
          .sort()
          .forEach((ds) => {
            if ((mergedCal[ds][type] || []).includes(key) && (!earliest || ds < earliest)) earliest = ds;
          });
        if (earliest) task.dateStarted = earliest;
      });
    });
  });

  rebuildCycleMarks(base.games, mergedCal, "weeklies");
  const endgameStats = rebuildEndgameFromTimestamps(base.games, mergedCal, mergedTimestamps);

  // Keep dailies from merge (already in mergedCal); rebuild cleared only weeklies/endgame arrays
  // but dailies were preserved in mergeCompletionByDate before rebuild cleared weeklies/endgame only.
  // rebuildCycleMarks clears type arrays then re-adds — dailies untouched. Good.

  const beforeWeeklyTs = (base.completionTimestamps || []).filter((t) => t.taskType === "weeklies").length;
  const afterWeeklyTs = mergedTimestamps.filter((t) => t.taskType === "weeklies").length;

  base.completionTimestamps = mergedTimestamps;
  base.completionByDate = mergedCal;
  // Reset endgame task filter so Time Trends shows data
  if (base.timestampsSelectedEndgameTasks && base.timestampsSelectedEndgameTasks._none) {
    base.timestampsSelectedEndgameTasks = {};
  }

  const weeklyDow = dowCounts(mergedTimestamps, "weeklies");
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const out = { "gacha-tracker": JSON.stringify(base) };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

  console.log("\nWeekly timestamps: base had", beforeWeeklyTs, "-> repaired", afterWeeklyTs);
  console.log("Weeklies DOW (should resemble image ~1,44,73,54,17,53,18):");
  dayNames.forEach((n, i) => console.log(" ", n + ":", weeklyDow[i]));
  console.log("\nEndgame cycles rebuilt:", endgameStats.cyclesRebuilt);
  console.log("Pain Cage early completions clamped to day 3:", endgameStats.painCageFixed);
  console.log("\nWrote", OUT_FILE);
}

main();
