"use strict";

const assert = require("../lib/assert");
const sim = require("../lib/sim-tracker");
const integrity = require("../lib/integrity-sim");
const math = require("../lib/cycle-math");
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

function actionable(scan) {
  return (scan.counts.warn || 0) + (scan.counts.error || 0);
}

function rescan(state) {
  return integrity.scanDataConflicts(state);
}

function polluteWeeklyEarlyCalendar(state) {
  const game = sim.getGame(state);
  const task = game.weeklies[0];
  const key = sim.taskKey(game, task);
  ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"].forEach((ds) => {
    integrity.ensureDay(state, ds).weeklies.push(key);
  });
  state.completionTimestamps.push({
    taskType: "weeklies",
    gameId: game.id,
    taskId: task.id,
    dateStr: "2026-07-22",
    hour: 12,
  });
  state.weekliesCompleted[key] = 1;
  state.weekliesAttempted[key] = 1;
  return { game, task, key };
}

function polluteEndgameEarlyCalendar(state) {
  const game = sim.getGame(state);
  const task = game.endgame[0];
  const key = sim.taskKey(game, task);
  math.getDatesInCycle(task, "2026-07-13").forEach((ds) => {
    integrity.ensureDay(state, ds).endgame.push(key);
  });
  state.completionTimestamps.push({
    taskType: "endgame",
    gameId: game.id,
    taskId: task.id,
    dateStr: "2026-07-16",
    hour: 18,
  });
  state.endgameCompleted[key] = 1;
  state.endgameAttempted[key] = 1;
  return { game, task, key };
}

function polluteTallies(state) {
  const game = sim.getGame(state);
  const key = sim.taskKey(game, game.weeklies[0]);
  integrity.ensureDay(state, "2026-07-22").weeklies.push(key);
  state.weekliesCompleted[key] = 9;
  state.weekliesAttempted[key] = 9;
  return { game, key };
}

function polluteKitchenSink(state) {
  const w = polluteWeeklyEarlyCalendar(state);
  const e = polluteEndgameEarlyCalendar(state);
  // duplicate stamps on weekly
  state.completionTimestamps.push({
    taskType: "weeklies",
    gameId: w.game.id,
    taskId: w.task.id,
    dateStr: "2026-07-24",
    hour: 9,
  });
  // wrong tallies
  state.weekliesCompleted[w.key] = 99;
  state.endgameCompleted[e.key] = 99;
  // calendar-only info on pain cage
  const pain = w.game.endgame[1];
  const pKey = sim.taskKey(w.game, pain);
  integrity.ensureDay(state, "2026-07-20").endgame.push(pKey);
  state.endgameCompleted[pKey] = 1;
  state.endgameAttempted[pKey] = 1;
  return { w, e, pKey };
}

module.exports = {
  name: "integrity-repair",
  title: "Debug integrity scan & repair (simulated)",
  run() {
    const checks = [];
    const appPath = path.join(__dirname, "..", "..", "app.js");
    const appSrc = fs.readFileSync(appPath, "utf8");

    checks.push(
      check("Source: three distinct repair modes wired", () => {
        assert.ok(appSrc.includes("function repairCompletionTimingFromTimestamps"), "shared timing repair");
        assert.ok(appSrc.includes('repairCompletionTimingFromTimestamps(["weeklies", "endgame"])'), "prefer weeklies+endgame");
        assert.ok(appSrc.includes('repairCompletionTimingFromTimestamps(["endgame"])'), "safe endgame-first");
        assert.ok(appSrc.includes('m === "tallies-only"'), "tallies-only branch");
        assert.ok(appSrc.includes('runIntegrityRepair("safe")'), "UI safe");
        assert.ok(appSrc.includes('runIntegrityRepair("prefer-timestamps")'), "UI prefer");
        assert.ok(appSrc.includes('runIntegrityRepair("tallies-only")'), "UI tallies");
        assert.ok(appSrc.includes("function listBeforeUnlockConflicts"), "list before-unlock");
        assert.ok(appSrc.includes("function applyDebugBeforeUnlockEdits"), "apply unlock-date edits");
        assert.ok(appSrc.includes("function listTimeDateFixQueue"), "list time/date fix queue");
        assert.ok(appSrc.includes("function applyDebugTimeDateFixes"), "apply time/date fixes");
        assert.ok(appSrc.includes("settingsDebugFixTimesDatesBtn"), "fix times & dates button wired");
      })
    );

    // ── Prefer timestamps: before → after → rescan ───────────
    checks.push(
      check("Prefer timestamps: weekly early calendar cleared; post-rescan actionable=0", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const { key } = polluteWeeklyEarlyCalendar(state);
        const before = integrity.scanDataConflicts(state);
        assert.ok(integrity.countKind(before, "calendar-before-timestamp") >= 1, "before detects");

        const result = integrity.runIntegrityRepair(state, "prefer-timestamps");
        assert.equal(result.after.counts.warn, 0, "after.warn=0");
        assert.equal(result.after.counts.error, 0, "after.error=0");
        assert.equal(integrity.countKind(result.after, "calendar-before-timestamp"), 0, "kind cleared in after");

        const again = rescan(state);
        assert.equal(actionable(again), 0, "fresh rescan actionable=0");
        assert.equal(integrity.countKind(again, "calendar-before-timestamp"), 0, "rescan kind gone");
        assert.ok(!(state.completionByDate["2026-07-20"].weeklies || []).includes(key), "Mon stripped");
        assert.ok((state.completionByDate["2026-07-22"].weeklies || []).includes(key), "Wed kept");
      })
    );

    checks.push(
      check("Prefer timestamps: collapses duplicate stamps; post-rescan clean", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const task = game.weeklies[0];
        state.completionTimestamps.push(
          { taskType: "weeklies", gameId: game.id, taskId: task.id, dateStr: "2026-07-21", hour: 10 },
          { taskType: "weeklies", gameId: game.id, taskId: task.id, dateStr: "2026-07-23", hour: 10 }
        );
        const before = integrity.scanDataConflicts(state);
        assert.ok(integrity.countKind(before, "duplicate-timestamps") >= 1, "before dupes");
        const result = integrity.runIntegrityRepair(state, "prefer-timestamps");
        assert.equal(integrity.countKind(result.after, "duplicate-timestamps"), 0, "after no dupes");
        assert.equal(actionable(rescan(state)), 0, "rescan actionable=0");
        assert.equal(state.completionTimestamps.filter((t) => t.taskId === task.id).length, 1, "one stamp left");
      })
    );

    // ── Safe: before → after → rescan ────────────────────────
    checks.push(
      check("Safe: endgame early calendar cleared; post-rescan actionable=0 for that kind", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        polluteEndgameEarlyCalendar(state);
        const before = integrity.scanDataConflicts(state);
        assert.ok(integrity.countKind(before, "calendar-before-timestamp") >= 1, "before detects");
        const result = integrity.runIntegrityRepair(state, "safe");
        assert.equal(integrity.countKind(result.after, "calendar-before-timestamp"), 0, "after cleared");
        assert.equal(integrity.countKind(rescan(state), "calendar-before-timestamp"), 0, "rescan cleared");
        assert.ok(!(state.completionByDate["2026-07-13"].endgame || []).includes(sim.taskKey(sim.getGame(state), sim.getGame(state).endgame[0])), "day-1 gone");
      })
    );

    checks.push(
      check("Safe: fills timestamp-without-calendar; info cal-without-ts remains after rescan", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const weekly = game.weeklies[0];
        const end = game.endgame[0];
        const eKey = sim.taskKey(game, end);
        state.completionTimestamps.push({
          taskType: "weeklies",
          gameId: game.id,
          taskId: weekly.id,
          dateStr: "2026-07-22",
          hour: 12,
        });
        integrity.ensureDay(state, "2026-07-15").endgame.push(eKey);
        state.endgameCompleted[eKey] = 1;
        state.endgameAttempted[eKey] = 1;

        const result = integrity.runIntegrityRepair(state, "safe");
        assert.equal(integrity.countKind(result.after, "timestamp-without-calendar"), 0, "after filled");
        const again = rescan(state);
        assert.equal(integrity.countKind(again, "timestamp-without-calendar"), 0, "rescan filled");
        assert.ok(integrity.countKind(again, "calendar-without-timestamp") >= 1, "info remains on purpose");
        assert.equal(again.counts.warn, 0, "no warnings left");
        assert.equal(again.counts.error, 0, "no errors left");
      })
    );

    checks.push(
      check("Safe alone does not leave endgame calendar-before-timestamp after rescan", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        polluteEndgameEarlyCalendar(state);
        integrity.runIntegrityRepair(state, "safe");
        assert.equal(actionable(rescan(state)), 0, "endgame pollution fully cleaned");
      })
    );

    // ── Tallies-only: before → after → rescan ────────────────
    checks.push(
      check("Tallies-only: fixes tally-mismatch; calendar unchanged; post-rescan no mismatch", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const { key } = polluteTallies(state);
        const calBefore = JSON.stringify(state.completionByDate);
        const before = integrity.scanDataConflicts(state);
        assert.ok(integrity.countKind(before, "tally-mismatch") >= 1, "before mismatch");

        const result = integrity.runIntegrityRepair(state, "tallies-only");
        assert.equal(integrity.countKind(result.after, "tally-mismatch"), 0, "after fixed");
        assert.equal(JSON.stringify(state.completionByDate), calBefore, "calendar untouched");
        assert.equal(state.weekliesCompleted[key], 1, "tally=1");
        assert.equal(integrity.countKind(rescan(state), "tally-mismatch"), 0, "rescan still fixed");
      })
    );

    checks.push(
      check("Tallies-only: does NOT clear calendar-before-timestamp (scope check)", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        polluteWeeklyEarlyCalendar(state);
        const before = integrity.countKind(integrity.scanDataConflicts(state), "calendar-before-timestamp");
        assert.ok(before >= 1, "pollution present");
        integrity.runIntegrityRepair(state, "tallies-only");
        const afterKind = integrity.countKind(rescan(state), "calendar-before-timestamp");
        assert.ok(afterKind >= 1, "tallies-only leaves timing conflicts");
      })
    );

    // ── Full matrix on kitchen-sink pollution ────────────────
    checks.push(
      check("Matrix kitchen-sink: tallies-only only clears tally-mismatch", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        polluteKitchenSink(state);
        const before = integrity.scanDataConflicts(state);
        assert.ok(actionable(before) >= 2, "messy before");
        const result = integrity.runIntegrityRepair(state, "tallies-only");
        assert.equal(integrity.countKind(result.after, "tally-mismatch"), 0, "mismatch gone");
        assert.ok(actionable(rescan(state)) >= 1, "timing conflicts still present after tallies-only");
      })
    );

    checks.push(
      check("Matrix kitchen-sink: safe clears endgame timing + tallies; rescan check", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        polluteKitchenSink(state);
        const result = integrity.runIntegrityRepair(state, "safe");
        const again = rescan(state);
        assert.equal(integrity.countKind(again, "tally-mismatch"), 0, "tallies synced");
        // Endgame early calendar should be gone
        assert.ok(
          !(state.completionByDate["2026-07-13"] && (state.completionByDate["2026-07-13"].endgame || []).length) ||
            !(state.completionByDate["2026-07-13"].endgame || []).includes(
              sim.taskKey(sim.getGame(state), sim.getGame(state).endgame[0])
            ),
          "endgame day-1 cleaned"
        );
        // Info pain-cage calendar-without-timestamp may remain
        assert.equal(again.counts.error, 0, "no errors after safe");
        // Prefer may still be needed for weekly early calendar / dupes depending on sim parity
        void result;
      })
    );

    checks.push(
      check("Matrix kitchen-sink: prefer-timestamps → rescan actionable=0 (info ok)", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        polluteKitchenSink(state);
        const before = integrity.scanDataConflicts(state);
        assert.ok(actionable(before) >= 2, "actionable before");

        const result = integrity.runIntegrityRepair(state, "prefer-timestamps");
        assert.equal(result.after.counts.warn, 0, "after.warn=0");
        assert.equal(result.after.counts.error, 0, "after.error=0");

        const again = rescan(state);
        assert.equal(again.counts.warn, 0, "rescan.warn=0");
        assert.equal(again.counts.error, 0, "rescan.error=0");
        assert.equal(actionable(again), 0, "rescan actionable=0");
        // info-only calendar-without-timestamp is allowed
        assert.ok((again.counts.info || 0) >= 0, "info may remain");
        assert.equal(integrity.countKind(again, "calendar-before-timestamp"), 0, "no early cal");
        assert.equal(integrity.countKind(again, "duplicate-timestamps"), 0, "no dupes");
        assert.equal(integrity.countKind(again, "tally-mismatch"), 0, "no tally mismatch");
        assert.equal(integrity.countKind(again, "timestamp-without-calendar"), 0, "no orphan stamps");
      })
    );

    checks.push(
      check("Idempotent: prefer-timestamps twice stays clean on rescan", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        polluteKitchenSink(state);
        integrity.runIntegrityRepair(state, "prefer-timestamps");
        const mid = rescan(state);
        assert.equal(actionable(mid), 0, "clean after first");
        integrity.runIntegrityRepair(state, "prefer-timestamps");
        assert.equal(actionable(rescan(state)), 0, "still clean after second");
      })
    );

    checks.push(
      check("Idempotent: safe twice on endgame pollution stays clean", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        polluteEndgameEarlyCalendar(state);
        integrity.runIntegrityRepair(state, "safe");
        integrity.runIntegrityRepair(state, "safe");
        assert.equal(actionable(rescan(state)), 0, "stable");
      })
    );

    checks.push(
      check("Idempotent: tallies-only twice keeps calendar identical", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        polluteTallies(state);
        integrity.runIntegrityRepair(state, "tallies-only");
        const cal = JSON.stringify(state.completionByDate);
        integrity.runIntegrityRepair(state, "tallies-only");
        assert.equal(JSON.stringify(state.completionByDate), cal, "calendar stable");
        assert.equal(integrity.countKind(rescan(state), "tally-mismatch"), 0, "still matched");
      })
    );

    checks.push(
      check("before-unlock: no unlock window → cycle-start finish is not an error", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const task = game.weeklies[0];
        delete task.earliestCompleteDays;
        delete task.earliestCompleteHour;
        delete task.earliestCompleteMinute;
        const key = sim.taskKey(game, task);
        integrity.ensureDay(state, "2026-07-20").weeklies.push(key);
        state.completionTimestamps.push({
          taskType: "weeklies",
          gameId: game.id,
          taskId: task.id || task.label,
          dateStr: "2026-07-20",
          hour: 14,
          minute: 0,
        });
        assert.equal(integrity.countKind(rescan(state), "before-unlock"), 0, "no unlock gate");
      })
    );

    checks.push(
      check("before-unlock: earliestCompleteDays=1 flags day-0 finish", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const task = game.weeklies[0];
        task.earliestCompleteDays = 1;
        const key = sim.taskKey(game, task);
        integrity.ensureDay(state, "2026-07-20").weeklies.push(key);
        state.completionTimestamps.push({
          taskType: "weeklies",
          gameId: game.id,
          taskId: task.id || task.label,
          dateStr: "2026-07-20",
          hour: 14,
          minute: 0,
        });
        assert.ok(integrity.countKind(rescan(state), "before-unlock") >= 1, "day-0 before unlock");
      })
    );

    const failed = checks.filter((c) => !c.ok);
    return {
      ok: failed.length === 0,
      checks,
      title: "Debug integrity scan & repair (simulated)",
    };
  },
};
