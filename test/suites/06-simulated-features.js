"use strict";

const assert = require("../lib/assert");
const sim = require("../lib/sim-tracker");
const math = require("../lib/cycle-math");

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

module.exports = {
  name: "simulated-features",
  title: "History · Time Trends · Data · Calendar Sync",
  run() {
    const checks = [];

    // ── History ─────────────────────────────────────────────
    checks.push(
      check("History: mid-week complete fills remaining days in month view", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        // Week of Jul 20 (Mon) — complete on Wed Jul 22
        sim.markComplete(state, "weeklies", key, "2026-07-22", 18);
        const marks = sim.historyMarksInMonth(state, "weeklies", key, 2026, 7);
        assert.ok(marks.includes("2026-07-22"), "completion day present");
        assert.ok(marks.includes("2026-07-26"), "Sunday still marked (fill-remaining)");
        assert.ok(!marks.includes("2026-07-20"), "Monday before completion not marked");
        assert.ok(!marks.includes("2026-07-21"), "Tuesday before completion not marked");
      })
    );

    checks.push(
      check("History: true completion day prefers timestamp over early calendar fill", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.endgame[0]);
        // Complete on day 5 of a cycle; fill remaining after
        const completion = sim.markComplete(state, "endgame", key, "2026-07-03", 21);
        // Pollute calendar with an earlier day (simulates old bug)
        const cycle = math.getDatesInCycle(game.endgame[0], completion);
        const day = state.completionByDate[cycle[0]] || { dailies: [], weeklies: [], endgame: [] };
        if (!day.endgame.includes(key)) day.endgame.push(key);
        state.completionByDate[cycle[0]] = day;

        const trueDay = sim.historyCompletionDayInCycle(state, "endgame", key, completion);
        assert.equal(trueDay, completion, "timestamp day wins over polluted earliest calendar day");
        assert.ok(trueDay !== cycle[0], "does not report cycle start as completion day");
      })
    );

    checks.push(
      check("History: incomplete clears fill-remaining marks for that cycle", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 12);
        sim.markIncomplete(state, "weeklies", key, "2026-07-22");
        const marks = sim.historyMarksInMonth(state, "weeklies", key, 2026, 7);
        assert.equal(marks.length, 0, "no history marks left after incomplete");
      })
    );

    // ── Time Trends ─────────────────────────────────────────
    checks.push(
      check("Time Trends: one event per cycle; DOW follows completion day not fill days", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        // Wed Jul 8, Wed Jul 22
        sim.markComplete(state, "weeklies", key, "2026-07-08", 20);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 20);
        const events = sim.getTrendEvents(state, "weeklies", key);
        assert.equal(events.length, 2, "two cycles → two trend events");
        const dow = sim.trendDayOfWeekCounts(events);
        // Wednesday = 3
        assert.equal(dow[3], 2, "both completions count as Wednesday");
        assert.equal(dow[0] + dow[1] + dow[2] + dow[4] + dow[5] + dow[6], 0, "fill days do not inflate other DOWs");
      })
    );

    checks.push(
      check("Time Trends: hour-of-day uses recorded hour", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.endgame[0]);
        sim.markComplete(state, "endgame", key, "2026-07-10", 9);
        const events = sim.getTrendEvents(state, "endgame", key);
        const hours = sim.trendHourCounts(events);
        assert.ok(events.length >= 1, "has trend events");
        assert.equal(hours[9], events.length, "all events land in hour 9 bucket");
      })
    );

    checks.push(
      check("Time Trends: ignores polluted day-1 calendar when timestamp is later", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.endgame[0]);
        const completion = sim.markComplete(state, "endgame", key, "2026-07-08", 15);
        const cycle = math.getDatesInCycle(game.endgame[0], completion);
        // Force early calendar mark
        if (!state.completionByDate[cycle[0]]) state.completionByDate[cycle[0]] = { dailies: [], weeklies: [], endgame: [] };
        if (!state.completionByDate[cycle[0]].endgame.includes(key)) state.completionByDate[cycle[0]].endgame.push(key);

        const events = sim.getTrendEvents(state, "endgame", key);
        const match = events.find((e) => e.cycleStart === cycle[0]);
        assert.ok(match, "event exists for cycle");
        assert.equal(match.dateStr, completion, "trend date is timestamp completion, not day 1");
        assert.equal(match.source, "timestamp", "source tagged as timestamp");
      })
    );

    // ── Calendar Sync ───────────────────────────────────────
    checks.push(
      check("Calendar Sync: wrong tallies are rebuilt from calendar marks", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-08", 12);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 12);
        // Corrupt tallies (what Sync is for)
        state.weekliesCompleted[key] = 99;
        state.weekliesAttempted[key] = 1;
        const synced = sim.syncTalliesFromCalendar(state, "weeklies", key);
        assert.equal(synced.completed, 2, "completed cycles = 2");
        assert.ok(synced.attempted >= 2, "attempted at least completed count");
        assert.equal(state.weekliesCompleted[key], 2, "state.weekliesCompleted updated");
        assert.equal(state.weekliesAttempted[key], synced.attempted, "state.weekliesAttempted updated");
      })
    );

    checks.push(
      check("Calendar Sync: endgame completed count matches cycles with marks", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.endgame[0]);
        sim.markComplete(state, "endgame", key, "2026-07-05", 12); // in 2-week cycle from Jun 29
        state.endgameCompleted[key] = 0;
        state.endgameAttempted[key] = 0;
        const synced = sim.syncTalliesFromCalendar(state, "endgame", key);
        assert.ok(synced.completed >= 1, "at least one completed endgame cycle");
        assert.equal(state.endgameCompleted[key], synced.completed, "endgameCompleted synced");
      })
    );

    checks.push(
      check("Calendar Sync: after incomplete, sync drops that cycle's completion", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 12);
        sim.syncTalliesFromCalendar(state, "weeklies", key);
        assert.equal(state.weekliesCompleted[key], 1, "one completion before undo");
        sim.markIncomplete(state, "weeklies", key, "2026-07-22");
        const synced = sim.syncTalliesFromCalendar(state, "weeklies", key);
        assert.equal(synced.completed, 0, "sync sees zero completions after incomplete");
      })
    );

    // ── Data ────────────────────────────────────────────────
    checks.push(
      check("Data: earned/potential update after simulated completes + sync", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        const eKey = sim.taskKey(game, game.endgame[0]);

        sim.markComplete(state, "dailies", game.id, "2026-07-30", 8);
        sim.markComplete(state, "dailies", game.id, "2026-07-31", 8);
        sim.markComplete(state, "weeklies", wKey, "2026-07-22", 12);
        sim.markComplete(state, "endgame", eKey, "2026-07-10", 12);

        sim.syncTalliesFromCalendar(state, "dailies", game.id);
        sim.syncTalliesFromCalendar(state, "weeklies", wKey);
        sim.syncTalliesFromCalendar(state, "endgame", eKey);

        const data = sim.getDataTotals(state, game);
        assert.equal(data.dailies.earned, 2 * 60, "2 dailies × 60 currency");
        assert.ok(data.dailies.potential >= data.dailies.earned, "daily potential ≥ earned");
        assert.equal(data.weeklies.earned, 100, "1 weekly × 100");
        assert.equal(data.endgame.earned, 800, "1 endgame × 800");
        assert.equal(data.total.earned, 2 * 60 + 100 + 800, "total earned sums categories");
        assert.ok(data.total.potential >= data.total.earned, "total potential ≥ earned");
      })
    );

    checks.push(
      check("Data: per-cycle endgame earned array overrides flat currency × count", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const task = game.endgame[0];
        const key = sim.taskKey(game, task);
        sim.markComplete(state, "endgame", key, "2026-07-10", 12);
        sim.syncTalliesFromCalendar(state, "endgame", key);
        state.endgameCurrencyEarned[game.id] = { [task.id]: [500] };
        const data = sim.getDataTotals(state, game);
        assert.equal(data.endgame.earned, 500, "uses recorded 500 instead of default 800");
      })
    );

    // ── Pain Cage unlock in simulated pipeline ──────────────
    checks.push(
      check("Unlock: Pain Cage early complete clamps to day 3 before history/trends", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const task = game.endgame[1]; // Pain Cage
        const key = sim.taskKey(game, task);
        // Week starting Mon Jul 20 — try complete on Monday (day 1)
        const stored = sim.markComplete(state, "endgame", key, "2026-07-20", 10);
        assert.equal(stored, "2026-07-22", "clamped to Wednesday (day 3)");
        const marks = sim.historyMarksInMonth(state, "endgame", key, 2026, 7);
        assert.ok(!marks.includes("2026-07-20"), "day 1 not in history");
        assert.ok(marks.includes("2026-07-22"), "day 3 in history");
        const events = sim.getTrendEvents(state, "endgame", key);
        assert.equal(events[0].dateStr, "2026-07-22", "trends use day 3");
      })
    );

    const failed = checks.filter((c) => !c.ok);
    return {
      title: "History · Time Trends · Data · Calendar Sync (simulated data)",
      checks,
      ok: failed.length === 0,
    };
  },
};
