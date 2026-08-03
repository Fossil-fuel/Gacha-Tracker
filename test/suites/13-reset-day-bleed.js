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

    const failed = checks.filter((c) => !c.ok);
    return {
      ok: failed.length === 0,
      title: "Reset-day bleed simulation & diagnostic",
      checks,
    };
  },
};
