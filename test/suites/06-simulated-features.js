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

    checks.push(
      check("History: carried days are after true completion day", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 18);
        assert.equal(sim.historyIsCarried(state, "weeklies", key, "2026-07-22"), false, "finish day is not carried");
        assert.equal(sim.historyIsCarried(state, "weeklies", key, "2026-07-26"), true, "Sunday fill is carried");
        assert.equal(sim.historyIsCarried(state, "weeklies", key, "2026-07-21"), false, "unmarked day is not carried");
      })
    );

    checks.push(
      check("History: D/W/E day count is on-day marks only (carried count, pre-finish days do not)", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        const eKey = sim.taskKey(game, game.endgame[0]);
        // Finish weekly Wed; endgame on Friday of same week
        sim.markComplete(state, "weeklies", wKey, "2026-07-22", 12);
        sim.markComplete(state, "endgame", eKey, "2026-07-24", 12);

        function dayHas(type, key, ds) {
          return !!(state.completionByDate[ds] && (state.completionByDate[ds][type] || []).includes(key));
        }
        // Pre-finish day: cycle is complete later, but no mark yet — bar must not count it
        assert.equal(dayHas("weeklies", wKey, "2026-07-21"), false, "Tue before weekly finish unmarked");
        assert.equal(dayHas("endgame", eKey, "2026-07-22"), false, "Wed before endgame finish unmarked");
        // Finish day + carried fill days count
        assert.equal(dayHas("weeklies", wKey, "2026-07-22"), true, "weekly finish day marked");
        assert.equal(dayHas("weeklies", wKey, "2026-07-26"), true, "weekly carried Sunday marked");
        assert.equal(dayHas("endgame", eKey, "2026-07-24"), true, "endgame finish day marked");
        assert.equal(sim.historyIsCarried(state, "weeklies", wKey, "2026-07-26"), true, "Sunday weekly is carried");
        assert.equal(sim.historyIsCarried(state, "endgame", eKey, "2026-07-26"), true, "Sunday endgame is carried");
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

    checks.push(
      check("Write path: complete then incomplete restores empty cycle marks", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 14);
        assert.ok(sim.historyMarksInMonth(state, "weeklies", key, 2026, 7).length > 0, "marks after complete");
        sim.markIncomplete(state, "weeklies", key, "2026-07-22");
        assert.equal(sim.historyMarksInMonth(state, "weeklies", key, 2026, 7).length, 0, "marks cleared after incomplete");
        assert.equal(
          state.completionTimestamps.filter((t) => t.taskType === "weeklies" && t.taskId === "weekly_a").length,
          0,
          "timestamp removed on incomplete"
        );
      })
    );

    checks.push(
      check("Undo: restores calendar, timestamp, and tallies after complete", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 14);
        assert.ok(sim.historyMarksInMonth(state, "weeklies", key, 2026, 7).length > 0, "marked after complete");
        assert.equal(state.weekliesCompleted[key], 1, "tally after complete");
        const undone = sim.undoLast(state);
        assert.equal(undone.ok, true, "undo ok");
        assert.equal(sim.historyMarksInMonth(state, "weeklies", key, 2026, 7).length, 0, "marks restored empty");
        assert.equal(state.weekliesCompleted[key], 0, "tally restored");
        assert.equal(
          state.completionTimestamps.filter((t) => t.taskType === "weeklies" && t.taskId === "weekly_a").length,
          0,
          "timestamp restored away"
        );
      })
    );

    checks.push(
      check("Undo: undoing incomplete re-applies the prior completion", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 14);
        sim.markIncomplete(state, "weeklies", key, "2026-07-22");
        assert.equal(sim.historyMarksInMonth(state, "weeklies", key, 2026, 7).length, 0, "cleared");
        const undone = sim.undoLast(state);
        assert.equal(undone.ok, true, "undo incomplete");
        assert.ok(sim.historyMarksInMonth(state, "weeklies", key, 2026, 7).includes("2026-07-22"), "completion day back");
        assert.equal(state.weekliesCompleted[key], 1, "tally back to 1");
      })
    );

    checks.push(
      check("Export summary: markdown and CSV include game and completions", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "dailies", game.id, "2026-07-30", 8);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 20);
        const md = sim.buildExportSummaryMarkdown(state, { days: 90 });
        assert.ok(md.indexOf("# Gacha Tracker summary") === 0, "markdown title");
        assert.ok(md.includes(game.name), "includes game name");
        assert.ok(md.includes("Currency"), "includes currency section");
        const csv = sim.buildExportSummaryCsv(state, { days: 90 });
        assert.ok(csv.indexOf("game,taskType,task,completedOn,hour,dayOfWeek") === 0, "csv header");
        assert.ok(csv.includes("2026-07-22"), "csv has weekly completion day");
        assert.ok(csv.includes("weeklies"), "csv has weeklies row");
      })
    );

    checks.push(
      check("Share card model: selected game lists dailies/weeklies/endgame tasks", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "dailies", game.id, "2026-07-30", 8);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 20);
        const empty = sim.buildShareCardModel(state, { days: 90, gameIds: ["nope"] });
        assert.equal(empty.ok, false, "unknown game id fails");
        const model = sim.buildShareCardModel(state, { days: 90, gameIds: [game.id] });
        assert.ok(model.ok, "model ok");
        assert.equal(model.title, game.name, "single-game title is game name");
        assert.equal(model.games.length, 1, "one game block");
        assert.ok(model.games[0].dailies.length >= 1, "dailies task row");
        assert.ok(model.games[0].weeklies.some((t) => t.label === game.weeklies[0].label), "weekly task listed");
        assert.ok(model.games[0].endgame.some((t) => t.label === game.endgame[0].label), "endgame task listed");
        assert.ok(model.currency, "includes currency earned/potential summary");
        assert.equal(typeof model.currency.earned, "number", "currency.earned is a number");
        assert.equal(typeof model.currency.potential, "number", "currency.potential is a number");
        assert.equal(
          model.games[0].weeklies[0].done,
          Number(state.weekliesCompleted[key]) || 0,
          "share card weekly done matches Games tally"
        );
        assert.equal(
          model.games[0].weeklies[0].possible,
          Number(state.weekliesAttempted[key]) || 0,
          "share card weekly possible matches Games attempted"
        );
      })
    );

    checks.push(
      check("Legacy historyCompact baselines still count in Sync", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 12);
        assert.equal(state.weekliesCompleted[key], 1, "one live cycle");
        state.historyCompact = {
          cutoffDateStr: "2026-07-14",
          baselines: {
            weekliesCompleted: { [key]: 1 },
            weekliesAttempted: { [key]: 1 },
          },
        };
        const synced = sim.syncTalliesFromCalendar(state, "weeklies", key);
        assert.equal(synced.completed, 2, "Sync adds legacy archived baseline");
      })
    );

    checks.push(
      check("Attendance pie: skipped groups list tasks under each game", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        const eKey = sim.taskKey(game, game.endgame[0]);
        state.weekliesAttempted[wKey] = 4;
        state.weekliesCompleted[wKey] = 2;
        state.endgameAttempted[eKey] = 3;
        state.endgameCompleted[eKey] = 3;
        state.dailiesAttempted[game.id] = 10;
        state.dailiesCompleted[game.id] = 7;

        const dGroups = sim.getAttendanceSkippedGroups(state, "dailies");
        assert.equal(dGroups.length, 1, "one game with daily skips");
        assert.equal(dGroups[0].gameName, game.name, "game title present");
        assert.equal(dGroups[0].tasks[0].label, "Dailies", "dailies under game");
        assert.equal(dGroups[0].tasks[0].skipped, 3, "3 daily skips");

        const wGroups = sim.getAttendanceSkippedGroups(state, "weeklies");
        assert.equal(wGroups[0].tasks[0].label, "Weekly A", "weekly task under game");
        assert.equal(wGroups[0].tasks[0].skipped, 2, "2 weekly skips");

        const eGroups = sim.getAttendanceSkippedGroups(state, "endgame");
        assert.equal(eGroups.length, 0, "fully completed endgame omitted");

        const excluded = sim.getAttendanceSkippedGroups(state, "dailies", { [game.id]: false });
        assert.equal(excluded.length, 0, "excluded games omitted from pie skip list");
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
