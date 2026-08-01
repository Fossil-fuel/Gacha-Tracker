"use strict";

/**
 * Pure cycle helpers that mirror the app/repair calendar math.
 * Used as a regression baseline so refactors can be checked without the DOM.
 */

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
  const daysBack = (d.getDay() - weekStartDay + 7) % 7;
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

/** Days after reset before complete is allowed (0 = day 1). */
function getEarliestCompleteDateStr(task, cycleStartStr) {
  const days = Math.max(0, Number(task && task.earliestCompleteDays) || 0);
  return addDays(cycleStartStr, days);
}

function clampCompletionToUnlock(task, cycleDates, completionDateStr) {
  if (!cycleDates.length) return completionDateStr;
  const unlock = getEarliestCompleteDateStr(task, cycleDates[0]);
  let out = completionDateStr < unlock ? unlock : completionDateStr;
  const end = cycleDates[cycleDates.length - 1];
  if (out > end) out = end;
  return out;
}

function isPainCageLike(task) {
  if (!task) return false;
  const id = String(task.id || "").toLowerCase();
  const label = String(task.label || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return id === "pain_cage" || id.includes("pain_cage") || label === "pain cage";
}

/** Legacy Pain Cage rule: earliest = day 3 of cycle (2 days after reset). */
function painCageMinCompletion(cycleDates) {
  if (cycleDates.length < 3) return cycleDates[cycleDates.length - 1] || null;
  return cycleDates[2];
}

module.exports = {
  isValidDateStr,
  addDays,
  daysBetween,
  getCycleParams,
  getAnchorDateStr,
  getCycleStartDateStr,
  getDatesInCycle,
  getRemainingDatesFrom,
  getEarliestCompleteDateStr,
  clampCompletionToUnlock,
  isPainCageLike,
  painCageMinCompletion,
};
