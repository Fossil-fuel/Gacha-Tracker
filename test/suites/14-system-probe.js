"use strict";

/**
 * System probe — hunt regressions across reset-day / cycle / calendar / tally changes.
 * These checks assert invariants. Failures are FINDINGS (problems), not setup for a known fix.
 */

const assert = require("../lib/assert");
const sim = require("../lib/sim-tracker");
const math = require("../lib/cycle-math");
const integrity = require("../lib/integrity-sim");
const fs = require("fs");
const path = require("path");

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

function sourceIncludes(needle) {
  const core = fs.readFileSync(path.join(__dirname, "..", "..", "src", "01-core.js"), "utf8");
  const games = fs.readFileSync(path.join(__dirname, "..", "..", "src", "03-games.js"), "utf8");
  return { core, games, hitCore: core.includes(needle), hitGames: games.includes(needle) };
}

module.exports = {
  name: "system-probe",
  title: "System probe (find problems across changed cycle logic)",
  run() {
    const checks = [];

    // ── A. Shared-day / fill-remaining integrity ─────────────
    checks.push(
      check("FIND: remaining-from-shared-day must not replant excluded boundary", () => {
        const task = {
          weekStartDay: 1,
          weekStartHour: 4,
          dateStarted: "2026-07-06",
          frequencyEvery: 1,
          frequencyUnit: "week",
          timeLimitEvery: 1,
          timeLimitUnit: "week",
        };
        const bounds = math.getCycleBoundsForMoment(task, new Date(2026, 6, 28, 12));
        assert.ok(bounds, "bounds");
        const owned = math.getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
        const boundary =
          bounds.cycleEnd.getFullYear() +
          "-" +
          String(bounds.cycleEnd.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(bounds.cycleEnd.getDate()).padStart(2, "0");
        assert.ok(!owned.includes(boundary), "owned list excludes shared day " + boundary);
        const remaining = math.getRemainingDatesInCycleFrom(bounds, boundary);
        assert.ok(
          !remaining.includes(boundary),
          "getRemainingDatesInCycleFrom fallback re-plants shared day when fromDateStr is boundary"
        );
      })
    );

    checks.push(
      check("FIND: complete-on-shared-day via remaining fallback would bleed into next cycle", () => {
        const task = {
          weekStartDay: 1,
          weekStartHour: 4,
          dateStarted: "2026-07-06",
          frequencyEvery: 1,
          frequencyUnit: "week",
          timeLimitEvery: 1,
          timeLimitUnit: "week",
        };
        const bounds = math.getCycleBoundsForMoment(task, new Date(2026, 6, 28, 12));
        const from = "2026-08-03";
        const planted = math.getRemainingDatesInCycleFrom(bounds, from);
        const nextBounds = math.getCycleBoundsForMoment(task, new Date(2026, 7, 3, 10));
        const nextOwned = math.getCalendarDatesInCycleRange(
          nextBounds.cycleStart,
          nextBounds.cycleEnd,
          nextBounds.nextCycleStart
        );
        assert.ok(nextOwned.includes(from), "next cycle owns Aug 3");
        assert.ok(
          !planted.includes(from),
          "ending-cycle remaining must not plant a day owned by the next cycle"
        );
      })
    );

    // ── B. UI write path vs membership (source contract probes) ─
    checks.push(
      check("FIND: weeklies toggle must pass period dateStr, not raw getDateStr()", () => {
        const games = fs.readFileSync(path.join(__dirname, "..", "..", "src", "03-games.js"), "utf8");
        // toggleWeekly should not use bare getDateStr for the write when period helpers exist
        const toggleBlock = games.slice(games.indexOf("function toggleWeekly"), games.indexOf("function requestToggleEndgame"));
        assert.ok(toggleBlock.includes("toggleWeekly") || games.includes("function toggleWeekly"), "toggleWeekly exists");
        const usesPeriod =
          /toggleWeekly[\s\S]{0,800}getTaskPeriodDateStr/.test(games) ||
          /function toggleWeekly[\s\S]{0,600}getTaskPeriodDateStr/.test(games);
        const usesRawDateStr = /function toggleWeekly[\s\S]{0,400}const dateStr = getDateStr\(\)/.test(games);
        assert.ok(
          usesPeriod && !usesRawDateStr,
          "toggleWeekly still writes with getDateStr() — pre-reset completes hit wrong cycle (UI membership ≠ write date)"
        );
      })
    );

    checks.push(
      check("FIND: endgame complete/toggle must pass period dateStr, not raw getDateStr()", () => {
        const games = fs.readFileSync(path.join(__dirname, "..", "..", "src", "03-games.js"), "utf8");
        const rawComplete = /function completeEndgameWithCurrency[\s\S]{0,300}const dateStr = getDateStr\(\)/.test(games);
        const rawToggle = /function toggleEndgame[\s\S]{0,300}const dateStr = getDateStr\(\)/.test(games);
        assert.ok(
          !rawComplete && !rawToggle,
          "endgame write path still uses getDateStr() before reset (dailies already use getDailyPeriodDateStr)"
        );
      })
    );

    // ── C. Cross-task / cross-cycle isolation ────────────────
    checks.push(
      check("Invariant: editing one 2-week weekly cycle must not disturb the offset sibling", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const div = game.weeklies.find((t) => t.id === "divergent");
        const cur = game.weeklies.find((t) => t.id === "currency");
        const dKey = sim.taskKey(game, div);
        const cKey = sim.taskKey(game, cur);
        sim.markComplete(state, "weeklies", dKey, "2026-07-15", 12);
        sim.markComplete(state, "weeklies", cKey, "2026-07-14", 12);
        sim.markIncomplete(state, "weeklies", dKey, "2026-07-15");
        assert.equal(sim.isCompletedInCycleForDate(state, "weeklies", dKey, "2026-07-15"), false);
        assert.equal(
          sim.isCompletedInCycleForDate(state, "weeklies", cKey, "2026-07-14"),
          true,
          "Currency Wars must stay complete when Divergent is cleared"
        );
        assert.ok(
          state.completionTimestamps.some((t) => t.taskId === "currency" && t.dateStr === "2026-07-14"),
          "CurWar timestamp must survive DivUni clear"
        );
      })
    );

    checks.push(
      check("Invariant: clearing older endgame cycle keeps newer Pure Fiction cycle", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const pf = game.endgame.find((t) => t.id === "pure_fiction");
        const key = sim.taskKey(game, pf);
        // Two PF cycles: finish early in Jun–Aug window and again after Aug 3
        sim.markComplete(state, "endgame", key, "2026-07-01", 12);
        sim.markComplete(state, "endgame", key, "2026-08-05", 12);
        assert.equal(sim.isCompletedInCycleForDate(state, "endgame", key, "2026-07-01"), true);
        assert.equal(sim.isCompletedInCycleForDate(state, "endgame", key, "2026-08-05"), true);
        sim.markIncomplete(state, "endgame", key, "2026-07-01");
        assert.equal(sim.isCompletedInCycleForDate(state, "endgame", key, "2026-07-01"), false);
        assert.equal(
          sim.isCompletedInCycleForDate(state, "endgame", key, "2026-08-05"),
          true,
          "newer PF cycle must remain after clearing older cycle"
        );
      })
    );

    checks.push(
      check("Invariant: history re-complete of already-done cycle must not invent a second trend event", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 10);
        const before = sim.getTrendEvents(state, "weeklies", key).length;
        // Second complete same cycle (sim allows double push today — probe whether trends stay 1)
        sim.markComplete(state, "weeklies", key, "2026-07-24", 15);
        const after = sim.getTrendEvents(state, "weeklies", key);
        const uniq = new Set(after.map((e) => e.dateStr));
        assert.equal(uniq.size, 1, "trends must stay one event per cycle; got " + uniq.size);
        assert.ok(before >= 1 && after.length >= 1, "events exist");
      })
    );

    checks.push(
      check("FIND: sim/app tally double-count on second complete in same cycle", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 10);
        const c1 = Number(state.weekliesCompleted[key]) || 0;
        sim.markComplete(state, "weeklies", key, "2026-07-24", 15);
        const c2 = Number(state.weekliesCompleted[key]) || 0;
        assert.equal(
          c2,
          c1,
          "second complete in same cycle bumped completed tally " + c1 + " → " + c2 + " (should no-op like applyTaskCompletion already)"
        );
      })
    );

    // ── D. Reset membership vs calendar day ──────────────────
    checks.push(
      check("Invariant: pre-4am game day is previous dateStr for 4am reset", () => {
        assert.equal(math.getPeriodDateStrForReset(new Date(2026, 7, 3, 3, 59), 4, 0), "2026-08-02");
        assert.equal(math.getPeriodDateStrForReset(new Date(2026, 7, 3, 4, 0), 4, 0), "2026-08-03");
      })
    );

    checks.push(
      check("FIND: evening-start (20:00) task has no cycle membership at noon on start day", () => {
        const task = {
          weekStartDay: 1,
          weekStartHour: 20,
          dateStarted: "2026-07-06",
          frequencyEvery: 1,
          frequencyUnit: "week",
          timeLimitEvery: 1,
          timeLimitUnit: "week",
        };
        const boundsNoon = math.getCycleBoundsForMoment(task, new Date(2026, 6, 6, 12, 0));
        const boundsEve = math.getCycleBoundsForMoment(task, new Date(2026, 6, 6, 21, 0));
        assert.ok(boundsEve, "after 20:00, cycle exists");
        // Live membership at noon may be null/prior; calendar owned dates must still include day one.
        assert.ok(
          boundsNoon == null || boundsNoon.cycleStart.getTime() !== boundsEve.cycleStart.getTime(),
          "precondition: noon is not yet in the evening-start cycle"
        );
        const owned = math.getCalendarDatesInCycleRange(
          boundsEve.cycleStart,
          boundsEve.cycleEnd,
          boundsEve.nextCycleStart
        );
        assert.ok(
          owned.includes("2026-07-06"),
          "multi-day cycle must own start calendar day for day-modal listing"
        );
        const core = fs.readFileSync(path.join(__dirname, "..", "..", "src", "01-core.js"), "utf8");
        assert.ok(
          core.includes("isWeeklyAvailableOnCalendarDate") &&
            /function getTasksAvailableOnDate[\s\S]{0,600}isWeeklyAvailableOnCalendarDate/.test(core),
          "getTasksAvailableOnDate must use calendar-day availability (not noon membership alone)"
        );
      })
    );

    // ── E. Bleed + cleanup + trends + sync chain ─────────────
    checks.push(
      check("Invariant: legacy bleed → cleanup → sync → save/load stays incomplete for new cycle", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const keys = [
          sim.taskKey(game, game.weeklies[0]),
          sim.taskKey(game, game.weeklies.find((t) => t.id === "divergent")),
          sim.taskKey(game, game.weeklies.find((t) => t.id === "currency")),
          sim.taskKey(game, game.endgame.find((t) => t.id === "pure_fiction")),
        ];
        const types = ["weeklies", "weeklies", "weeklies", "endgame"];
        const finish = ["2026-07-28", "2026-07-15", "2026-07-14", "2026-07-10"];
        keys.forEach((key, i) => {
          sim.markCompleteWithLegacyBoundaryBleed(state, types[i], key, finish[i], 12);
        });
        const now = new Date(2026, 7, 3, 10);
        const before = sim.diagnoseAllResetDays(state, now);
        assert.ok(before.bleedCount >= 1, "expected bleed fixtures");
        keys.forEach((key, i) => {
          assert.equal(
            sim.isCompletedInCurrentCycle(state, types[i], key, now),
            false,
            key + " must not look complete after reset with only bleed"
          );
        });
        sim.cleanupCycleBoundaryBleedMarks(state, now);
        sim.syncAllTallies(state);
        const store = sim.createSaveStore();
        sim.saveState(store, state);
        const loaded = sim.loadState(store);
        assert.equal(sim.diagnoseAllResetDays(loaded, now).bleedCount, 0, "bleed gone after reload");
        keys.forEach((key, i) => {
          assert.equal(sim.isCompletedInCurrentCycle(loaded, types[i], key, now), false, key + " still incomplete");
        });
        assert.equal(
          (integrity.scanDataConflicts(loaded).counts.warn || 0) + (integrity.scanDataConflicts(loaded).counts.error || 0),
          0,
          "integrity actionable after chain"
        );
      })
    );

    // ── F. History edit while current done (all weeklies+endgame types) ─
    checks.push(
      check("Invariant: history uncheck works for weekly/2-week/endgame while a later cycle is done", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const now = new Date(2026, 7, 3, 10);
        const cases = [
          { type: "weeklies", task: game.weeklies[0], old: "2026-07-22", neu: "2026-07-29" },
          {
            type: "weeklies",
            task: game.weeklies.find((t) => t.id === "divergent"),
            old: "2026-07-15",
            neu: "2026-07-28",
          },
          {
            type: "endgame",
            task: game.endgame.find((t) => t.id === "pure_fiction"),
            old: "2026-07-01",
            neu: "2026-08-05",
          },
        ];
        cases.forEach((c) => {
          const key = sim.taskKey(game, c.task);
          sim.markComplete(state, c.type, key, c.old, 12);
          sim.markComplete(state, c.type, key, c.neu, 12);
          const res = sim.simulateCalendarDayUncheck(state, c.type, key, c.old, now);
          assert.equal(res.ok, true, c.task.id + " history uncheck ok");
          assert.equal(sim.isCompletedInCycleForDate(state, c.type, key, c.old), false, c.task.id + " old cleared");
          assert.equal(sim.isCompletedInCycleForDate(state, c.type, key, c.neu), true, c.task.id + " new kept");
        });
      })
    );

    checks.push(
      check("Invariant: finish-moment edit syncs History day and keeps sibling cycles", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        const dKey = sim.taskKey(game, game.weeklies.find((t) => t.id === "divergent"));
        sim.markComplete(state, "weeklies", key, "2026-07-22", 10);
        sim.markComplete(state, "weeklies", dKey, "2026-07-15", 12);
        const tally = Number(state.weekliesCompleted[key]) || 0;
        const moved = sim.setCycleCompletionMoment(state, "weeklies", key, "2026-07-20", "2026-07-24", 14, 0);
        assert.equal(moved.ok, true, "finish move");
        assert.equal(sim.historyCompletionDayInCycle(state, "weeklies", key, "2026-07-22"), "2026-07-24");
        assert.equal(Number(state.weekliesCompleted[key]) || 0, tally, "no tally bump");
        assert.equal(
          sim.isCompletedInCycleForDate(state, "weeklies", dKey, "2026-07-15"),
          true,
          "sibling DivUni cycle undisturbed"
        );
      })
    );

    checks.push(
      check("FIND: scheduled endgame Start/End edits must stay locked in source + sim", () => {
        const core = fs.readFileSync(path.join(__dirname, "..", "..", "src", "01-core.js"), "utf8");
        assert.ok(
          /function setEndgameCompletionDate[\s\S]{0,400}!isManualResetTask\(task\)\) return;/.test(core),
          "setEndgameCompletionDate must early-return for scheduled tasks"
        );
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const eg = game.endgame.find((t) => t.id === "endgame_a");
        const before = JSON.stringify(state.completionByDate);
        const res = sim.setEndgameCompletionDate(state, game.id, eg.id, 0, "2019-01-01", "2019-02-01");
        assert.equal(res.applied, false);
        assert.equal(JSON.stringify(state.completionByDate), before);
      })
    );

    // ── G. Source: ended-task history edit asymmetry ─────────
    checks.push(
      check("FIND: apply blocks ended tasks but remove does not (history restore impossible)", () => {
        const core = fs.readFileSync(path.join(__dirname, "..", "..", "src", "01-core.js"), "utf8");
        const applyBlock = core.slice(
          core.indexOf("function applyTaskCompletion"),
          core.indexOf("function removeTaskCompletion")
        );
        // Must not blanket-reject via isTaskCycleEnded (blocks history restore of past cycles).
        assert.ok(
          !/isTaskCycleEnded/.test(applyBlock),
          "applyTaskCompletion rejects ended tasks; removeTaskCompletion does not — can clear past cycles of stopped events but not restore them"
        );
        // Still must reject writes into cycles after the final cycle.
        assert.ok(
          /getLastCycleBounds/.test(applyBlock),
          "applyTaskCompletion must still gate post-final cycles via getLastCycleBounds"
        );
      })
    );

    const failed = checks.filter((c) => !c.ok);
    return {
      ok: failed.length === 0,
      title: "System probe (find problems across changed cycle logic)",
      checks,
    };
  },
};
