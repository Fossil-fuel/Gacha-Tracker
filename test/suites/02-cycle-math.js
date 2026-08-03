"use strict";

const assert = require("../lib/assert");
const math = require("../lib/cycle-math");

module.exports = {
  name: "cycle-math",
  title: "Cycle math, reset-day & unlock rules",
  run() {
    const painCage = {
      id: "e_pain",
      label: "Pain Cage",
      weekStartDay: 1,
      weekStartHour: 4,
      dateStarted: "2026-03-17",
      frequencyEvery: 1,
      frequencyUnit: "week",
      timeLimitEvery: 1,
      timeLimitUnit: "week",
    };

    assert.ok(math.isPainCageLike(painCage), "Pain Cage label should match helper");
    assert.ok(math.isPainCageLike({ id: "pain_cage", label: "X" }), "pain_cage id should match");
    assert.ok(!math.isPainCageLike({ id: "war_zone", label: "WarZone" }), "WarZone is not Pain Cage");

    const anchor = math.getAnchorDateStr(painCage);
    assert.equal(anchor, "2026-03-16", "dateStarted Tue aligns back to Monday weekStartDay=1");

    const cycle = math.getDatesInCycle(painCage, "2026-04-29");
    assert.equal(cycle[0], "2026-04-27", "cycle containing Apr 29 starts Monday Apr 27");
    assert.equal(cycle.length, 7, "weekly cycle has 7 calendar days (Mon–Sun; next Mon is next cycle)");
    assert.equal(math.painCageMinCompletion(cycle), "2026-04-29", "Pain Cage earliest is day 3");

    const early = "2026-04-27";
    const clamped = math.painCageMinCompletion(cycle);
    assert.ok(early < clamped, "day-1 completion is before unlock");
    const remaining = math.getRemainingDatesFrom(painCage, clamped);
    assert.equal(remaining[0], "2026-04-29", "fill-remaining starts at unlock/completion day");
    assert.ok(remaining.includes("2026-05-03"), "fill-remaining includes later days in cycle");
    assert.ok(!remaining.includes("2026-04-27"), "fill-remaining does not include pre-completion days");
    assert.ok(!remaining.includes("2026-05-04"), "fill-remaining must not mark next cycle's Monday");

    // Future unlock field shape (days after reset): day 3 == earliestCompleteDays: 2
    const withUnlock = Object.assign({}, painCage, { earliestCompleteDays: 2 });
    assert.equal(
      math.getEarliestCompleteDateStr(withUnlock, cycle[0]),
      "2026-04-29",
      "earliestCompleteDays:2 matches Pain Cage day 3"
    );
    assert.equal(
      math.clampCompletionToUnlock(withUnlock, cycle, "2026-04-27"),
      "2026-04-29",
      "clamp moves early completion to unlock day"
    );
    assert.equal(
      math.clampCompletionToUnlock(withUnlock, cycle, "2026-05-01"),
      "2026-05-01",
      "completion after unlock stays put"
    );

    const moc = {
      label: "Memory of Chaos",
      weekStartDay: 1,
      weekStartHour: 4,
      dateStarted: "2026-03-02",
      frequencyEvery: 6,
      frequencyUnit: "week",
      timeLimitEvery: 6,
      timeLimitUnit: "week",
    };
    const mocCycle = math.getDatesInCycle(moc, "2026-03-10");
    assert.equal(mocCycle.length, 42, "6-week endgame window is 42 calendar days");
    assert.equal(mocCycle[0], "2026-03-02", "MoC cycle start from dateStarted Monday");
    assert.ok(!mocCycle.includes("2026-04-13"), "MoC must not claim next-cycle Monday Apr 13");

    // --- Core: non-midnight reset → previous game day ---
    assert.equal(
      math.getPeriodDateStrForReset(new Date(2026, 7, 3, 3, 59, 0), 4, 0),
      "2026-08-02",
      "03:59 before 4am reset is still previous game day"
    );
    assert.equal(
      math.getPeriodDateStrForReset(new Date(2026, 7, 3, 4, 0, 0), 4, 0),
      "2026-08-03",
      "04:00 on reset day starts the new game day"
    );
    assert.equal(
      math.getPeriodDateStrForReset(new Date(2026, 7, 3, 12, 0, 0), 4, 0),
      "2026-08-03",
      "noon after reset stays on calendar day"
    );

    const beforeReset = math.getCycleMembershipMoment(new Date(2026, 7, 3, 3, 0, 0), 4, 0);
    const afterReset = math.getCycleMembershipMoment(new Date(2026, 7, 3, 5, 0, 0), 4, 0);
    assert.ok(beforeReset.getTime() < new Date(2026, 7, 3, 4, 0, 0).getTime(), "pre-reset membership is before 4am");
    assert.ok(afterReset.getTime() >= new Date(2026, 7, 3, 4, 0, 0).getTime(), "post-reset membership is after 4am");

    // --- Core: Pure Fiction-like adjacent 6-week period — shared Aug 3 ---
    const pureFiction = {
      label: "Pure Fiction",
      weekStartDay: 1,
      weekStartHour: 4,
      dateStarted: "2026-02-16",
      frequencyEvery: 6,
      frequencyUnit: "week",
      timeLimitEvery: 6,
      timeLimitUnit: "week",
    };
    const pfOld = math.getCycleBoundsForMoment(pureFiction, new Date(2026, 6, 1, 12, 0, 0));
    assert.ok(pfOld, "Pure Fiction has bounds in July");
    const pfOldDates = math.getCalendarDatesInCycleRange(pfOld.cycleStart, pfOld.cycleEnd, pfOld.nextCycleStart);
    assert.ok(!pfOldDates.includes("2026-08-03"), "ending Pure Fiction cycle must not own Aug 3");
    assert.equal(pfOldDates[pfOldDates.length - 1], "2026-08-02", "last owned day of ending cycle is Aug 2");

    const pfNew = math.getCycleBoundsForMoment(pureFiction, new Date(2026, 7, 3, 5, 0, 0));
    const pfNewDates = math.getCalendarDatesInCycleRange(pfNew.cycleStart, pfNew.cycleEnd, pfNew.nextCycleStart);
    assert.equal(pfNewDates[0], "2026-08-03", "new Pure Fiction cycle owns Aug 3");

    // Bleed simulation: complete mid-cycle, force-mark boundary day (old bug), after reset must NOT look complete
    const bleed = math.cycleLooksCompleteAfterBleed(
      pureFiction,
      "2026-07-10",
      new Date(2026, 7, 3, 10, 0, 0)
    );
    assert.ok(
      (bleed.marks["2026-08-03"] || []).includes("task"),
      "fixture places bleed mark on Aug 3"
    );
    assert.equal(
      bleed.completionInCurrent,
      null,
      "after reset, bleed mark on shared day must not count as current-cycle complete"
    );
    assert.ok(
      !bleed.remainingWithoutBoundary.includes("2026-08-03"),
      "correct fill-remaining must not write the shared boundary day"
    );

    // Weekly Monday reset: same rule
    const weekly = {
      weekStartDay: 1,
      weekStartHour: 4,
      dateStarted: "2026-07-06",
      frequencyEvery: 1,
      frequencyUnit: "week",
      timeLimitEvery: 1,
      timeLimitUnit: "week",
    };
    const wBleed = math.cycleLooksCompleteAfterBleed(
      weekly,
      "2026-07-28",
      new Date(2026, 7, 3, 10, 0, 0)
    );
    assert.equal(
      wBleed.completionInCurrent,
      null,
      "weekly after Monday 4am reset must ignore prior-cycle boundary bleed"
    );
  },
};
