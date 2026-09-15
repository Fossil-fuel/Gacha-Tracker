"use strict";

/**
 * Pure cycle helpers that mirror src/01-core.js calendar / reset math.
 * Regression baseline so refactors can be checked without the DOM.
 */

function isValidDateStr(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatLocalDate(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return formatLocalDate(d);
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

function getIntervalMs(every, unit) {
  return getIntervalDays(every, unit) * 24 * 60 * 60 * 1000;
}

function getCycleParams(task) {
  const freqUnit = task && task.frequencyUnit === "day" ? "day" : "week";
  const intervalDays = getIntervalDays(task && task.frequencyEvery, freqUnit);
  const limitUnit = task && task.timeLimitUnit === "day" ? "day" : "week";
  const hasExplicit = task && (task.timeLimitEvery != null || task.timeLimitUnit != null);
  const timeLimitDays = hasExplicit ? getIntervalDays(task.timeLimitEvery, limitUnit) : intervalDays;
  return {
    intervalDays,
    timeLimitDays,
    intervalMs: intervalDays * 86400000,
    timeLimitMs: timeLimitDays * 86400000,
  };
}

function getAnchorDateStr(task) {
  const ds = isValidDateStr(task && task.dateStarted) ? task.dateStarted : null;
  if (!ds) return null;
  const weekStartDay = Number.isFinite(task.weekStartDay) ? task.weekStartDay : 1;
  const d = new Date(ds + "T12:00:00");
  const daysBack = (d.getDay() - weekStartDay + 7) % 7;
  return addDays(ds, -daysBack);
}

/**
 * Mirror of getPeriodDateStrForReset (local-time approximation for tests).
 * Before today's reset hour → previous calendar dateStr.
 */
function getPeriodDateStrForReset(now, hour, minute) {
  const n = now instanceof Date ? now : new Date(now);
  const h = Number.isFinite(hour) ? hour : 4;
  const m = Number.isFinite(minute) ? minute : 0;
  const todayReset = new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m, 0, 0);
  if (n < todayReset) {
    const yest = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
    return formatLocalDate(yest);
  }
  return formatLocalDate(n);
}

/** Mirror of getCycleMembershipMoment (local-time). */
function getCycleMembershipMoment(now, hour, minute) {
  const n = now instanceof Date ? now : new Date(now);
  const h = Number.isFinite(hour) ? hour : 4;
  const m = Number.isFinite(minute) ? minute : 0;
  const todayReset = new Date(n.getFullYear(), n.getMonth(), n.getDate(), h, m, 0, 0);
  return n < todayReset ? new Date(todayReset.getTime() - 1) : n;
}

/**
 * Mirror of getCalendarDatesInCycleRange.
 * Shared boundary day (when nextCycleStart === cycleEnd) belongs to the next cycle only.
 */
function getCalendarDatesInCycleRange(cycleStart, cycleEnd, nextCycleStart) {
  const dates = [];
  if (!(cycleStart instanceof Date) || !(cycleEnd instanceof Date) || isNaN(cycleStart.getTime()) || isNaN(cycleEnd.getTime())) {
    return dates;
  }
  const startDay = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate());
  const endDay = new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), cycleEnd.getDate());
  const nextMs = nextCycleStart instanceof Date ? nextCycleStart.getTime() : null;
  const shareBoundaryWithNext = nextMs != null && nextMs === cycleEnd.getTime();
  const boundaryDateStr = shareBoundaryWithNext ? formatLocalDate(cycleEnd) : null;

  for (let day = new Date(startDay); day <= endDay; day.setDate(day.getDate() + 1)) {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const overlapStart = Math.max(dayStart.getTime(), cycleStart.getTime());
    const overlapEnd = Math.min(dayEnd.getTime(), cycleEnd.getTime());
    if (overlapStart >= overlapEnd) continue;
    const ds = formatLocalDate(day);
    if (boundaryDateStr && ds === boundaryDateStr) continue;
    dates.push(ds);
  }
  return dates;
}

function getCycleBoundsForMoment(task, moment) {
  const anchorStr = getAnchorDateStr(task);
  if (!anchorStr) return null;
  const resetHour = Number.isFinite(task && task.weekStartHour)
    ? task.weekStartHour
    : Number.isFinite(task && task.resetHour)
      ? task.resetHour
      : 4;
  const resetMinute = Number.isFinite(task && task.weekStartMinute)
    ? task.weekStartMinute
    : Number.isFinite(task && task.resetMinute)
      ? task.resetMinute
      : 0;
  const anchorDay = new Date(anchorStr + "T12:00:00");
  const anchor = new Date(anchorDay.getFullYear(), anchorDay.getMonth(), anchorDay.getDate(), resetHour, resetMinute, 0, 0);
  const { intervalMs, timeLimitMs } = getCycleParams(task);
  const d = moment instanceof Date ? moment : new Date(moment);
  if (d.getTime() < anchor.getTime()) return null;
  const k = Math.floor((d.getTime() - anchor.getTime()) / intervalMs);
  const cycleStartMs = anchor.getTime() + k * intervalMs;
  return {
    cycleStart: new Date(cycleStartMs),
    cycleEnd: new Date(cycleStartMs + timeLimitMs),
    nextCycleStart: new Date(cycleStartMs + intervalMs),
  };
}

function getCycleStartDateStr(task, dateStr) {
  const bounds = getCycleBoundsForMoment(task, new Date(dateStr + "T12:00:00"));
  if (bounds) {
    const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
    return dates[0] || formatLocalDate(bounds.cycleStart);
  }
  const anchor = getAnchorDateStr(task);
  if (!anchor || dateStr < anchor) return null;
  const { intervalDays } = getCycleParams(task);
  const offset = daysBetween(anchor, dateStr);
  const k = Math.floor(offset / intervalDays);
  return addDays(anchor, k * intervalDays);
}

function getDatesInCycle(task, dateStr) {
  const bounds = getCycleBoundsForMoment(task, new Date(dateStr + "T12:00:00"));
  if (bounds) {
    return getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
  }
  const start = getCycleStartDateStr(task, dateStr);
  if (!start) return [dateStr];
  const { timeLimitDays } = getCycleParams(task);
  const dates = [];
  for (let i = 0; i < timeLimitDays; i++) dates.push(addDays(start, i));
  return dates;
}

function getRemainingDatesInCycleFrom(bounds, fromDateStr) {
  if (!bounds) return isValidDateStr(fromDateStr) ? [fromDateStr] : [];
  const all = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
  const filtered = all.filter((ds) => ds >= fromDateStr);
  if (filtered.length) return filtered;
  if (all.length) {
    const last = all[all.length - 1];
    return last >= fromDateStr ? [last] : [];
  }
  return [];
}

function getRemainingDatesFrom(task, fromDateStr) {
  const bounds = getCycleBoundsForMoment(task, new Date(fromDateStr + "T12:00:00"));
  if (bounds) return getRemainingDatesInCycleFrom(bounds, fromDateStr);
  const all = getDatesInCycle(task, fromDateStr);
  const filtered = all.filter((ds) => ds >= fromDateStr);
  if (filtered.length) return filtered;
  if (all.length) {
    const last = all[all.length - 1];
    return last >= fromDateStr ? [last] : [];
  }
  return [];
}

/**
 * Mirror of findCompletionDateInBounds calendar half:
 * adjacent periods skip bare marks on the shared reset calendar day.
 */
function findCalendarCompletionInBounds(marksByDate, key, bounds) {
  if (!bounds) return null;
  const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
  const adjacent = bounds.nextCycleStart instanceof Date && bounds.nextCycleStart.getTime() === bounds.cycleEnd.getTime();
  const startDateStr = formatLocalDate(bounds.cycleStart);
  const firstOwned = dates[0];
  for (const ds of dates) {
    if (firstOwned && ds === firstOwned) continue;
    if (adjacent && ds === startDateStr) continue;
    if ((marksByDate[ds] || []).includes(key)) return ds;
  }
  return null;
}

/** Timestamp proves cycle completion (mirrors app: ignore exact reset instant on shared day). */
function timestampProvesCycleCompletion(t, bounds, firstOwned) {
  if (!bounds || !t || t.dateStr == null) return false;
  const startMs = bounds.cycleStart.getTime();
  const endMs = bounds.cycleEnd.getTime();
  const h = Number.isFinite(t.hour) ? t.hour : 12;
  const m = Number.isFinite(t.minute) ? t.minute : 0;
  const ms = new Date(t.dateStr + "T" + pad2(h) + ":" + pad2(m) + ":00").getTime();
  if (!Number.isFinite(ms) || ms < startMs || ms >= endMs) return false;
  const adjacent = bounds.nextCycleStart instanceof Date && bounds.nextCycleStart.getTime() === endMs;
  const startDateStr = formatLocalDate(bounds.cycleStart);
  const onBoundaryDay =
    (firstOwned && t.dateStr === firstOwned) || (adjacent && t.dateStr === startDateStr);
  if (onBoundaryDay && ms <= startMs) return false;
  return true;
}

function cycleLooksCompleteAfterBleed(task, completeOnDateStr, now) {
  const key = "task";
  const finishBounds = getCycleBoundsForMoment(task, new Date(completeOnDateStr + "T12:00:00"));
  const marks = {};
  getRemainingDatesFrom(task, completeOnDateStr).forEach((ds) => {
    marks[ds] = [key];
  });
  // Also simulate old bug: force-mark shared boundary day
  if (finishBounds) {
    const boundary = formatLocalDate(finishBounds.cycleEnd);
    if (!marks[boundary]) marks[boundary] = [key];
  }
  const membership = getCycleMembershipMoment(now, task.weekStartHour != null ? task.weekStartHour : 4, 0);
  const currentBounds = getCycleBoundsForMoment(task, membership);
  return {
    marks,
    finishBounds,
    currentBounds,
    completionInCurrent: findCalendarCompletionInBounds(marks, key, currentBounds),
    remainingWithoutBoundary: finishBounds
      ? getCalendarDatesInCycleRange(finishBounds.cycleStart, finishBounds.cycleEnd, finishBounds.nextCycleStart)
      : [],
  };
}

/**
 * Diagnose shared-reset-day health for one task at `now`.
 * Returns { ok, issues[], currentComplete, hadBleedMark, cleaned }.
 */
function diagnoseSharedResetDay(task, marksByDate, timestamps, key, now) {
  const issues = [];
  const hour = Number.isFinite(task.weekStartHour) ? task.weekStartHour : 4;
  const membership = getCycleMembershipMoment(now, hour, 0);
  const bounds = getCycleBoundsForMoment(task, membership);
  if (!bounds) {
    return { ok: true, issues: [], currentComplete: false, hadBleedMark: false };
  }
  const adjacent = bounds.nextCycleStart.getTime() === bounds.cycleEnd.getTime();
  const startDateStr = formatLocalDate(bounds.cycleStart);
  const hasMarkOnStart = adjacent && (marksByDate[startDateStr] || []).includes(key);
  const startMs = bounds.cycleStart.getTime();
  const endMs = bounds.cycleEnd.getTime();
  const dates = getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
  const firstOwned = dates[0];
  const hasInCycleTs = (timestamps || []).some((t) => timestampProvesCycleCompletion(t, bounds, firstOwned));
  const currentComplete = findCalendarCompletionInBounds(marksByDate, key, bounds) != null || hasInCycleTs;
  // findCalendarCompletionInBounds already skips start day; combine with ts:
  const reallyComplete = hasInCycleTs
    ? true
    : findCalendarCompletionInBounds(marksByDate, key, bounds) != null;

  if (adjacent && hasMarkOnStart && !hasInCycleTs) {
    issues.push({
      kind: "shared-day-bleed",
      dateStr: startDateStr,
      message: "Calendar mark on shared reset day without post-reset timestamp (legacy bleed)",
    });
  }
  if (adjacent && hasMarkOnStart && hasInCycleTs) {
    // legitimate same-day finish — fine
  }
  // Fill should never have written boundary on previous cycle
  const prevMoment = new Date(bounds.cycleStart.getTime() - 1);
  const prevBounds = getCycleBoundsForMoment(task, prevMoment);
  if (prevBounds) {
    const prevDates = getCalendarDatesInCycleRange(prevBounds.cycleStart, prevBounds.cycleEnd, prevBounds.nextCycleStart);
    if (prevDates.includes(startDateStr)) {
      issues.push({
        kind: "fill-owns-shared-day",
        dateStr: startDateStr,
        message: "Previous cycle date list still includes shared reset day",
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    currentComplete: reallyComplete,
    hadBleedMark: !!(adjacent && hasMarkOnStart && !hasInCycleTs),
    bounds,
    startDateStr,
  };
}

function cleanupSharedDayBleedMark(marksByDate, key, startDateStr) {
  const arr = marksByDate[startDateStr];
  if (!arr) return false;
  const idx = arr.indexOf(key);
  if (idx < 0) return false;
  arr.splice(idx, 1);
  return true;
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
  getRemainingDatesInCycleFrom,
  getEarliestCompleteDateStr,
  clampCompletionToUnlock,
  isPainCageLike,
  painCageMinCompletion,
  getPeriodDateStrForReset,
  getCycleMembershipMoment,
  getCalendarDatesInCycleRange,
  getCycleBoundsForMoment,
  findCalendarCompletionInBounds,
  timestampProvesCycleCompletion,
  cycleLooksCompleteAfterBleed,
  diagnoseSharedResetDay,
  cleanupSharedDayBleedMark,
  getIntervalMs,
};
