#!/usr/bin/env node
"use strict";

/**
 * Repair ZZZ + WuWa endgame completion dates using older backup calendars.
 *
 * Local (current) data often has day-1-of-cycle stamps/fills. Older backups more often
 * recorded the real finish day as the earliest calendar mark in that cycle.
 *
 * - Reads base from the newest Aug 1 backup
 * - For Deadly Assault / Shiyu Defense / Tower of Adversity / Whimpering Wastes:
 *   set finish day from the earliest non-day-1 calendar mark found in older backups
 * - Rebuilds fill-remaining from that finish day
 * - Drops future endgame marks/stamps for those tasks (after today)
 * - Writes an importable backup next to the others
 */

const fs = require("fs");
const path = require("path");

const BACKUP_DIR = "E:\\Gacha Tracker Back-ups";
const TODAY = "2026-08-01";
const OUT_FILE = path.join(BACKUP_DIR, "gacha-tracker-zzz-ww-endgame-dates-repaired.json");

const TARGET_TASK_IDS = new Set([
  "deadly_assault",
  "shiyu_defense",
  "tower_of_adversity",
  "whimpering_wastes",
]);

function loadBackup(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const inner = raw["gacha-tracker"];
  return typeof inner === "string" ? JSON.parse(inner) : inner;
}

function listBackupFiles() {
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("gacha-tracker-backup-") && f.endsWith(".json"))
    .filter((f) => !/repaired|BETTER/i.test(f))
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
  if (!start) return [];
  const { timeLimitDays } = getCycleParams(task);
  const dates = [];
  for (let i = 0; i < timeLimitDays; i++) dates.push(addDays(start, i));
  return dates;
}

function findTargetTasks(games) {
  const out = [];
  (games || []).forEach((game) => {
    (game.endgame || []).forEach((task) => {
      const tid = task.id || task.label;
      if (!TARGET_TASK_IDS.has(tid)) return;
      out.push({
        game,
        task,
        key: game.id + "." + tid,
        taskId: tid,
        label: task.label || tid,
      });
    });
  });
  return out;
}

/** cycleStart -> earliest calendar mark dateStr */
function earliestCalByCycle(data, key, task) {
  const map = new Map();
  Object.keys(data.completionByDate || {})
    .sort()
    .forEach((ds) => {
      if (!((data.completionByDate[ds].endgame || []).includes(key))) return;
      const dates = getDatesInCycle(task, ds);
      if (!dates.length) return;
      const start = dates[0];
      if (!map.has(start) || ds < map.get(start)) map.set(start, ds);
    });
  return map;
}

function ensureDay(completionByDate, ds) {
  if (!completionByDate[ds]) completionByDate[ds] = { dailies: [], weeklies: [], endgame: [] };
  if (!completionByDate[ds].endgame) completionByDate[ds].endgame = [];
  return completionByDate[ds];
}

function clearKeyFromCycle(completionByDate, key, cycleDates) {
  cycleDates.forEach((ds) => {
    const day = completionByDate[ds];
    if (!day || !day.endgame) return;
    day.endgame = day.endgame.filter((k) => k !== key);
  });
}

function fillRemaining(completionByDate, key, task, completion) {
  const dates = getDatesInCycle(task, completion);
  dates
    .filter((ds) => ds >= completion)
    .forEach((ds) => {
      const day = ensureDay(completionByDate, ds);
      if (!day.endgame.includes(key)) day.endgame.push(key);
    });
}

function main() {
  const files = listBackupFiles();
  if (!files.length) {
    console.error("No backups in", BACKUP_DIR);
    process.exit(1);
  }

  const baseNamePreferred = files
    .map((f) => path.basename(f))
    .reverse()
    .find((n) => /2026-08-01 \(updated\)/.test(n) || /2026-08-01\.json$/.test(n));
  const basePath =
    files.find((f) => path.basename(f) === baseNamePreferred) ||
    files.find((f) => /2026-08-01 \(updated\)/.test(path.basename(f))) ||
    files[files.length - 1];

  const oldPaths = files.filter((f) => f !== basePath && !/2026-08-01/.test(path.basename(f)));

  console.log("Base (local):", path.basename(basePath));
  console.log(
    "Old calendars:",
    oldPaths.map((f) => path.basename(f)).join(", ")
  );

  const base = loadBackup(basePath);
  const targets = findTargetTasks(base.games);
  if (!targets.length) {
    console.error("No ZZZ/WuWa endgame tasks found in base save.");
    process.exit(1);
  }
  console.log(
    "Targets:",
    targets.map((t) => t.label + " (" + t.key + ")").join("; ")
  );

  const oldDatas = oldPaths.map((f) => ({ file: path.basename(f), data: loadBackup(f) }));

  if (!Array.isArray(base.completionTimestamps)) base.completionTimestamps = [];
  if (!base.completionByDate) base.completionByDate = {};

  const changes = [];
  let futureRemovedMarks = 0;
  let futureRemovedStamps = 0;

  targets.forEach(({ game, task, key, taskId, label }) => {
    // Finish-day picks from old calendars (prefer non-day-1)
    const pickByCycle = new Map(); // start -> { dateStr, from }
    oldDatas.forEach(({ file, data }) => {
      // Resolve task config from that backup if present (dateStarted may differ slightly)
      const g = (data.games || []).find((x) => x.id === game.id);
      const t = g && (g.endgame || []).find((x) => (x.id || x.label) === taskId);
      const useTask = t || task;
      const map = earliestCalByCycle(data, key, useTask);
      map.forEach((ds, start) => {
        const existing = pickByCycle.get(start);
        const isNonDay1 = ds > start;
        if (!existing) {
          pickByCycle.set(start, { dateStr: ds, from: file, nonDay1: isNonDay1 });
          return;
        }
        // Prefer a non-day-1 mark; among those, prefer earlier finish (first real clear)
        if (!existing.nonDay1 && isNonDay1) {
          pickByCycle.set(start, { dateStr: ds, from: file, nonDay1: true });
        } else if (existing.nonDay1 && isNonDay1 && ds < existing.dateStr) {
          pickByCycle.set(start, { dateStr: ds, from: file, nonDay1: true });
        } else if (!existing.nonDay1 && !isNonDay1 && ds < existing.dateStr) {
          pickByCycle.set(start, { dateStr: ds, from: file, nonDay1: false });
        }
      });
    });

    const localMap = earliestCalByCycle(base, key, task);
    const cycleStarts = new Set([...localMap.keys(), ...pickByCycle.keys()]);

    // Also include cycle starts from local timestamps
    base.completionTimestamps.forEach((t) => {
      if (!t || t.taskType !== "endgame" || t.gameId !== game.id || t.taskId !== taskId) return;
      if (!isValidDateStr(t.dateStr)) return;
      const dates = getDatesInCycle(task, t.dateStr);
      if (dates.length) cycleStarts.add(dates[0]);
    });

    [...cycleStarts].sort().forEach((start) => {
      const dates = getDatesInCycle(task, start);
      if (!dates.length) return;
      const cycleEnd = dates[dates.length - 1];

      // Drop wholly-future cycles for these tasks
      if (start > TODAY) {
        clearKeyFromCycle(base.completionByDate, key, dates);
        const before = base.completionTimestamps.length;
        base.completionTimestamps = base.completionTimestamps.filter((t) => {
          if (!t || t.taskType !== "endgame" || t.gameId !== game.id || t.taskId !== taskId) return true;
          if (!isValidDateStr(t.dateStr)) return true;
          const cyc = getDatesInCycle(task, t.dateStr);
          return !(cyc.length && cyc[0] === start);
        });
        futureRemovedStamps += before - base.completionTimestamps.length;
        futureRemovedMarks++;
        changes.push({
          task: label,
          cycle: start,
          action: "removed-future-cycle",
        });
        return;
      }

      const pick = pickByCycle.get(start);
      if (!pick || !pick.nonDay1) return; // only rewrite when old calendar shows a real mid-cycle finish

      let completion = pick.dateStr;
      if (completion < start) completion = start;
      if (completion > cycleEnd) completion = cycleEnd;
      // Don't invent completion after today for in-progress cycle
      if (completion > TODAY) completion = TODAY < start ? start : TODAY;

      const localEarliest = localMap.get(start);
      const stampsInCycle = base.completionTimestamps.filter((t) => {
        if (!t || t.taskType !== "endgame" || t.gameId !== game.id || t.taskId !== taskId) return false;
        if (!isValidDateStr(t.dateStr)) return false;
        return t.dateStr >= start && t.dateStr <= cycleEnd;
      });
      const localTs = stampsInCycle.map((t) => t.dateStr).sort()[0];

      if (localTs === completion && localEarliest === completion) return;

      // Rewrite calendar for this cycle
      clearKeyFromCycle(base.completionByDate, key, dates);
      fillRemaining(base.completionByDate, key, task, completion);

      // Collapse / move timestamps onto completion day
      let keepHour = 12;
      if (stampsInCycle.length) {
        const sorted = stampsInCycle.slice().sort((a, b) => a.dateStr.localeCompare(b.dateStr));
        keepHour = Number.isFinite(Number(sorted[0].hour)) ? Number(sorted[0].hour) : 12;
        const drop = new Set(stampsInCycle.slice(1));
        stampsInCycle[0].dateStr = completion;
        stampsInCycle[0].hour = keepHour;
        base.completionTimestamps = base.completionTimestamps.filter((t) => !drop.has(t));
      } else {
        base.completionTimestamps.push({
          dateStr: completion,
          hour: keepHour,
          minute: 0,
          gameId: game.id,
          taskType: "endgame",
          taskId,
          taskLabel: label,
        });
      }

      changes.push({
        task: label,
        cycle: start,
        action: "updated-finish-day",
        fromLocalTs: localTs || null,
        fromLocalCal: localEarliest || null,
        to: completion,
        fromBackup: pick.from,
      });
    });

    // Strip any remaining future marks/stamps for this key (partial future fill)
    Object.keys(base.completionByDate)
      .sort()
      .forEach((ds) => {
        if (ds <= TODAY) return;
        const day = base.completionByDate[ds];
        if (!day || !day.endgame) return;
        const before = day.endgame.length;
        day.endgame = day.endgame.filter((k) => k !== key);
        futureRemovedMarks += before - day.endgame.length;
      });
    const beforeTs = base.completionTimestamps.length;
    base.completionTimestamps = base.completionTimestamps.filter((t) => {
      if (!t || t.taskType !== "endgame" || t.gameId !== game.id || t.taskId !== taskId) return true;
      return !(isValidDateStr(t.dateStr) && t.dateStr > TODAY);
    });
    futureRemovedStamps += beforeTs - base.completionTimestamps.length;
  });

  const out = { "gacha-tracker": JSON.stringify(base) };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));

  console.log("\nUpdates:");
  changes
    .filter((c) => c.action === "updated-finish-day")
    .forEach((c) => {
      console.log(
        " -",
        c.task,
        "cycle",
        c.cycle,
        ":",
        c.fromLocalTs || c.fromLocalCal || "(none)",
        "->",
        c.to,
        "(" + c.fromBackup + ")"
      );
    });
  const removedFuture = changes.filter((c) => c.action === "removed-future-cycle").length;
  console.log("\nFuture cycles removed:", removedFuture);
  console.log("Extra future marks cleared:", futureRemovedMarks);
  console.log("Future stamps cleared:", futureRemovedStamps);
  console.log("Finish-day rewrites:", changes.filter((c) => c.action === "updated-finish-day").length);
  console.log("\nWrote", OUT_FILE);
  console.log("Import this file in the app: Settings → Data → Import data");
}

main();
