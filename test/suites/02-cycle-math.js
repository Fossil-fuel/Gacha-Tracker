"use strict";

const assert = require("../lib/assert");
const math = require("../lib/cycle-math");

module.exports = {
  name: "cycle-math",
  title: "Cycle math & unlock rules",
  run() {
    const painCage = {
      id: "e_pain",
      label: "Pain Cage",
      weekStartDay: 1,
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
    assert.equal(cycle.length, 7, "weekly cycle has 7 calendar days");
    assert.equal(math.painCageMinCompletion(cycle), "2026-04-29", "Pain Cage earliest is day 3");

    const early = "2026-04-27";
    const clamped = math.painCageMinCompletion(cycle);
    assert.ok(early < clamped, "day-1 completion is before unlock");
    const remaining = math.getRemainingDatesFrom(painCage, clamped);
    assert.equal(remaining[0], "2026-04-29", "fill-remaining starts at unlock/completion day");
    assert.ok(remaining.includes("2026-05-03"), "fill-remaining includes later days in cycle");
    assert.ok(!remaining.includes("2026-04-27"), "fill-remaining does not include pre-completion days");

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
      dateStarted: "2026-03-02",
      frequencyEvery: 6,
      frequencyUnit: "week",
      timeLimitEvery: 6,
      timeLimitUnit: "week",
    };
    const mocCycle = math.getDatesInCycle(moc, "2026-03-10");
    assert.equal(mocCycle.length, 42, "6-week endgame window is 42 days");
    assert.equal(mocCycle[0], "2026-03-02", "MoC cycle start from dateStarted Monday");
  },
};
