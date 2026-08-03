"use strict";

/**
 * Simulations + diagnostics for shared reset-day bleed
 * (legacy Aug 3 calendar mark without post-reset time).
 */

const assert = require("../lib/assert");
const sim = require("../lib/sim-tracker");
const math = require("../lib/cycle-math");
const integrity = require("../lib/integrity-sim");

function check(name, fn) {
  try {
    fn();
    return { name, ok: true };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err && err.message ? err.message : String(err),
      actual: err && err.actual,
      expected: err && err.expected,
    };
  }
}

function afterResetAug3() {
  return new Date(2026, 7, 3, 10, 0, 0);
}

function beforeResetAug3() {
  return new Date(2026, 7, 3, 3, 0, 0);
}

function actionableScan(state) {
  const scan = integrity.scanDataConflicts(state);
  return (scan.counts.warn || 0) + (scan.counts.error || 0);
}

module.exports = {
  name: "reset-day-bleed",
  title: "Reset-day bleed simulation & diagnostic",
  run() {
    const checks = [];

    checks.push(
      check("Diagnostic: healthy post-fix weekly after reset has no bleed", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-28", 14);
        const remaining = math.getRemainingDatesFrom(game.weeklies[0], "2026-07-28");
        assert.ok(!remaining.includes("2026-08-03"), "new fill must omit Aug 3");
        const report = sim.diagnoseAllResetDays(state, afterResetAug3());
        assert.equal(report.bleedCount, 0, "no bleed after correct fill");
        assert.equal(
          sim.isCompletedInCurrentCycle(state, "weeklies", key, afterResetAug3()),
          false,
          "new week after Mon 4am is not complete"
        );
      })
    );

    checks.push(
      check("Simulation: legacy weekly Aug 3 mark without time looks done until cleanup", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markCompleteWithLegacyBoundaryBleed(state, "weeklies", key, "2026-07-28", 14);

        assert.ok(
          (state.completionByDate["2026-08-03"].weeklies || []).includes(key),
          "legacy data has Aug 3 mark"
        );
        assert.ok(
          !state.completionTimestamps.some((t) => t.dateStr === "2026-08-03" && t.taskId === "weekly_a"),
          "no timestamp on Aug 3"
        );

        assert.equal(
          sim.isCompletedInCurrentCycle(state, "weeklies", key, afterResetAug3()),
          false,
          "fixed logic: incomplete after reset despite Aug 3 mark"
        );

        const diag = sim.diagnoseTaskResetDay(state, "weeklies", key, afterResetAug3());
        assert.equal(diag.hadBleedMark, true, "diagnostic flags shared-day bleed");
        assert.ok(diag.issues.some((i) => i.kind === "shared-day-bleed"), "bleed issue listed");

        const cleaned = sim.cleanupCycleBoundaryBleedMarks(state, afterResetAug3());
        assert.equal(cleaned, true, "cleanup removed bleed");
        assert.ok(
          !(state.completionByDate["2026-08-03"].weeklies || []).includes(key),
          "Aug 3 mark removed"
        );
        assert.equal(
          sim.diagnoseTaskResetDay(state, "weeklies", key, afterResetAug3()).hadBleedMark,
          false,
          "diagnostic clean after cleanup"
        );
      })
    );

    checks.push(
      check("Simulation: Pure Fiction legacy bleed after Aug 3 4am reset", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const pf = game.endgame.find((t) => t.id === "pure_fiction");
        const key = sim.taskKey(game, pf);
        sim.markCompleteWithLegacyBoundaryBleed(state, "endgame", key, "2026-07-10", 16);

        assert.ok(
          (state.completionByDate["2026-08-03"].endgame || []).includes(key),
          "legacy Pure Fiction mark on Aug 3"
        );
        assert.equal(
          sim.isCompletedInCurrentCycle(state, "endgame", key, afterResetAug3()),
          false,
          "Pure Fiction not complete for new cycle"
        );
        assert.equal(
          sim.isCompletedInCurrentCycle(state, "endgame", key, beforeResetAug3()),
          true,
          "before 4am still in old cycle which was completed"
        );

        const report = sim.diagnoseAllResetDays(state, afterResetAug3());
        assert.ok(report.bleedCount >= 1, "diagnostic finds Pure Fiction bleed");
        sim.cleanupCycleBoundaryBleedMarks(state, afterResetAug3());
        assert.equal(
          sim.isCompletedInCurrentCycle(state, "endgame", key, afterResetAug3()),
          false,
          "still incomplete after cleanup"
        );
        assert.equal(actionableScan(state), 0, "integrity scan clean after cleanup path");
      })
    );

    checks.push(
      check("Simulation: legitimate same-day finish after reset counts via timestamp", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-08-03", 17);
        assert.equal(
          sim.isCompletedInCurrentCycle(state, "weeklies", key, new Date(2026, 7, 3, 18, 0, 0)),
          true,
          "post-reset complete at 5pm is done"
        );
        const diag = sim.diagnoseTaskResetDay(state, "weeklies", key, new Date(2026, 7, 3, 18, 0, 0));
        assert.equal(diag.hadBleedMark, false, "timestamped finish is not bleed");
        assert.equal(diag.ok, true, "diagnostic ok");
      })
    );

    checks.push(
      check("Simulation: all weeklies+Pure Fiction legacy bleed → cleanup → sync seamless", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const weeklyKey = sim.taskKey(game, game.weeklies[0]);
        const pf = game.endgame.find((t) => t.id === "pure_fiction");
        const pfKey = sim.taskKey(game, pf);
        const pain = game.endgame.find((t) => t.id === "pain_cage");
        const painKey = sim.taskKey(game, pain);

        sim.markCompleteWithLegacyBoundaryBleed(state, "weeklies", weeklyKey, "2026-07-28", 12);
        sim.markCompleteWithLegacyBoundaryBleed(state, "endgame", pfKey, "2026-07-10", 12);
        sim.markCompleteWithLegacyBoundaryBleed(state, "endgame", painKey, "2026-07-29", 12);

        const before = sim.diagnoseAllResetDays(state, afterResetAug3());
        assert.ok(before.bleedCount >= 2, "multiple bleeds detected: " + before.bleedCount);

        assert.equal(sim.isCompletedInCurrentCycle(state, "weeklies", weeklyKey, afterResetAug3()), false);
        assert.equal(sim.isCompletedInCurrentCycle(state, "endgame", pfKey, afterResetAug3()), false);
        assert.equal(sim.isCompletedInCurrentCycle(state, "endgame", painKey, afterResetAug3()), false);

        sim.cleanupCycleBoundaryBleedMarks(state, afterResetAug3());
        const after = sim.diagnoseAllResetDays(state, afterResetAug3());
        assert.equal(after.bleedCount, 0, "all bleeds cleaned");
        assert.equal(after.ok, true, "full diagnostic ok");

        sim.syncAllTallies(state);
        const store = sim.createSaveStore();
        sim.saveState(store, state);
        const loaded = sim.loadState(store);
        assert.equal(
          sim.diagnoseAllResetDays(loaded, afterResetAug3()).bleedCount,
          0,
          "bleed stays gone after save/load"
        );
        assert.equal(
          sim.isCompletedInCurrentCycle(loaded, "endgame", pfKey, afterResetAug3()),
          false,
          "Pure Fiction still incomplete after reload"
        );
      })
    );

    checks.push(
      check("Pre-reset membership: Aug 3 3am still previous cycle", () => {
        assert.equal(
          math.getPeriodDateStrForReset(beforeResetAug3(), 4, 0),
          "2026-08-02",
          "3am is still Aug 2 game day"
        );
        const state = sim.createFixture({ today: "2026-08-02" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-28", 12);
        assert.equal(
          sim.isCompletedInCurrentCycle(state, "weeklies", key, beforeResetAug3()),
          true,
          "3am Aug 3 still sees prior week as current and complete"
        );
      })
    );

    checks.push(
      check("History edit: CurWar/DivUni week of 7/13 — old gate blocks, fixed path clears", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const divTask = game.weeklies.find((t) => t.id === "divergent");
        const curTask = game.weeklies.find((t) => t.id === "currency");
        const divKey = sim.taskKey(game, divTask);
        const curKey = sim.taskKey(game, curTask);
        const now = afterResetAug3();

        sim.markComplete(state, "weeklies", divKey, "2026-07-15", 12);
        sim.markComplete(state, "weeklies", curKey, "2026-07-14", 12);
        sim.markComplete(state, "weeklies", divKey, "2026-07-28", 12);
        sim.markComplete(state, "weeklies", curKey, "2026-07-22", 12);

        // Later cycles mean "current" may look done; July cycle still has marks
        assert.equal(sim.isCompletedInCycleForDate(state, "weeklies", divKey, "2026-07-15"), true);
        assert.equal(sim.isCompletedInCycleForDate(state, "weeklies", curKey, "2026-07-13"), true);

        const oldDiv = sim.simulateCalendarDayUncheck(state, "weeklies", divKey, "2026-07-15", now, {
          oldBug: true,
        });
        // Snapshot for old-bug path: if current cycle is complete, old bug would allow but clear wrong
        // cycle via getWeeklyCompletionDateInCurrentCycle. Prefer: when current incomplete, old blocks.
        // With Jul 28 done, current DivUni cycle (from Aug 3) starts Jul 27 — IS complete.
        // So oldBug canEdit=true. Reproduce the worse failure: uncheck using only current-cycle
        // completion date would clear Jul 28 cycle instead of Jul 15.
        assert.equal(oldDiv.blocked, false, "with later cycle done, old current-cycle gate opens");

        // Reset state and apply FIXED uncheck on July day
        const state2 = sim.createFixture({ today: "2026-08-03" });
        const g2 = sim.getGame(state2);
        const dKey = sim.taskKey(g2, g2.weeklies.find((t) => t.id === "divergent"));
        const cKey = sim.taskKey(g2, g2.weeklies.find((t) => t.id === "currency"));
        sim.markComplete(state2, "weeklies", dKey, "2026-07-15", 12);
        sim.markComplete(state2, "weeklies", cKey, "2026-07-14", 12);
        sim.markComplete(state2, "weeklies", dKey, "2026-07-28", 12);
        sim.markComplete(state2, "weeklies", cKey, "2026-07-22", 12);

        const fixedDiv = sim.simulateCalendarDayUncheck(state2, "weeklies", dKey, "2026-07-15", now);
        const fixedCur = sim.simulateCalendarDayUncheck(state2, "weeklies", cKey, "2026-07-13", now);
        assert.equal(fixedDiv.ok, true, "fixed DivUni uncheck on 7/15");
        assert.equal(fixedCur.ok, true, "fixed CurWar uncheck on 7/13");

        assert.equal(sim.isCompletedInCycleForDate(state2, "weeklies", dKey, "2026-07-15"), false);
        assert.equal(sim.isCompletedInCycleForDate(state2, "weeklies", cKey, "2026-07-13"), false);
        assert.equal(
          sim.isCompletedInCycleForDate(state2, "weeklies", dKey, "2026-07-28"),
          true,
          "later DivUni cycle kept"
        );
        assert.equal(
          sim.isCompletedInCycleForDate(state2, "weeklies", cKey, "2026-07-22"),
          true,
          "later CurWar cycle kept"
        );
        assert.ok(
          state2.completionTimestamps.some((t) => t.taskId === "divergent" && t.dateStr === "2026-07-28"),
          "later DivUni timestamp kept"
        );
        assert.ok(
          !state2.completionTimestamps.some((t) => t.taskId === "divergent" && t.dateStr === "2026-07-15"),
          "July DivUni timestamp removed"
        );

        // Availability on week of 7/13
        assert.equal(math.getDatesInCycle(divTask, "2026-07-13")[0], "2026-07-13");
        assert.equal(math.getDatesInCycle(curTask, "2026-07-13")[0], "2026-07-06");

        // When ONLY July is complete (current incomplete), old gate blocks history edit
        const state3 = sim.createFixture({ today: "2026-08-03" });
        const g3 = sim.getGame(state3);
        const d3 = sim.taskKey(g3, g3.weeklies.find((t) => t.id === "divergent"));
        sim.markComplete(state3, "weeklies", d3, "2026-07-15", 12);
        assert.equal(sim.isCompletedInCurrentCycle(state3, "weeklies", d3, now), false);
        const blocked = sim.simulateCalendarDayUncheck(state3, "weeklies", d3, "2026-07-15", now, {
          oldBug: true,
        });
        assert.equal(blocked.blocked, true, "old bug blocks Jul edit when current cycle incomplete");
        const allowed = sim.simulateCalendarDayUncheck(state3, "weeklies", d3, "2026-07-15", now);
        assert.equal(allowed.ok, true, "fixed path allows Jul edit when current incomplete");
        assert.equal(sim.isCompletedInCycleForDate(state3, "weeklies", d3, "2026-07-15"), false);
      })
    );

    const failed = checks.filter((c) => !c.ok);
    return {
      ok: failed.length === 0,
      title: "Reset-day bleed simulation & diagnostic",
      checks,
    };
  },
};
