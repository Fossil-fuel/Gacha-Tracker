"use strict";

const assert = require("../lib/assert");
const math = require("../lib/cycle-math");

/**
 * Simulates the calendar side of complete → incomplete without the DOM,
 * so write-path refactors can be checked against fill-remaining behavior.
 */
function applyComplete(calendar, key, task, completionDateStr) {
  const dates = math.getRemainingDatesFrom(task, completionDateStr);
  dates.forEach((ds) => {
    if (!calendar[ds]) calendar[ds] = { weeklies: [], endgame: [] };
    const type = "endgame";
    if (!calendar[ds][type].includes(key)) calendar[ds][type].push(key);
  });
  return dates;
}

function applyIncomplete(calendar, key, task, completionDateStr) {
  const dates = math.getRemainingDatesFrom(task, completionDateStr);
  dates.forEach((ds) => {
    const arr = calendar[ds] && calendar[ds].endgame;
    if (!arr) return;
    const idx = arr.indexOf(key);
    if (idx >= 0) arr.splice(idx, 1);
  });
  return dates;
}

function isMarked(calendar, key, dateStr) {
  return !!(calendar[dateStr] && (calendar[dateStr].endgame || []).includes(key));
}

module.exports = {
  name: "completion-roundtrip",
  title: "Complete ↔ incomplete round-trip",
  run() {
    const task = {
      label: "WarZone",
      weekStartDay: 1,
      dateStarted: "2026-03-17",
      frequencyEvery: 1,
      frequencyUnit: "week",
      timeLimitEvery: 1,
      timeLimitUnit: "week",
    };
    const key = "game.war_zone";
    const calendar = {};
    const completion = "2026-03-19"; // Thu of week starting Mon 16

    const filled = applyComplete(calendar, key, task, completion);
    assert.ok(filled.length >= 4, "completing mid-week fills remaining days");
    assert.ok(isMarked(calendar, key, "2026-03-19"), "completion day marked");
    assert.ok(isMarked(calendar, key, "2026-03-22"), "later day in cycle marked");
    assert.ok(!isMarked(calendar, key, "2026-03-16"), "days before completion stay unmarked");

    applyIncomplete(calendar, key, task, completion);
    assert.ok(!isMarked(calendar, key, "2026-03-19"), "incomplete clears completion day");
    assert.ok(!isMarked(calendar, key, "2026-03-22"), "incomplete clears filled days");

    // Pain Cage early stamp should be clamped before fill
    const pain = {
      label: "Pain Cage",
      weekStartDay: 1,
      dateStarted: "2026-03-17",
      frequencyEvery: 1,
      frequencyUnit: "week",
      timeLimitEvery: 1,
      timeLimitUnit: "week",
      earliestCompleteDays: 2,
    };
    const cycle = math.getDatesInCycle(pain, "2026-04-27");
    const raw = "2026-04-27";
    const clamped = math.clampCompletionToUnlock(pain, cycle, raw);
    const cal2 = {};
    applyComplete(cal2, "g.pain", pain, clamped);
    assert.ok(!isMarked(cal2, "g.pain", "2026-04-27"), "day 1 not marked after unlock clamp");
    assert.ok(isMarked(cal2, "g.pain", "2026-04-29"), "day 3 marked after unlock clamp");
  },
};
