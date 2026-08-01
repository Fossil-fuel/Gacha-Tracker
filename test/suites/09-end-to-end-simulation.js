"use strict";

const assert = require("../lib/assert");
const sim = require("../lib/sim-tracker");
const integrity = require("../lib/integrity-sim");
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

function addDays(dateStr, n) {
  return math.addDays(dateStr, n);
}

/** Deterministic PRNG so simulations are repeatable across runs. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = {
  name: "end-to-end-simulation",
  title: "End-to-end pipeline · Data · History · Trends · Debug · Saves",
  run() {
    const checks = [];

    checks.push(
      check("Pipeline: daily → weekly → endgame → incomplete → undo restores all", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        const eKey = sim.taskKey(game, game.endgame[0]);

        sim.markComplete(state, "dailies", game.id, "2026-07-30", 8);
        sim.markComplete(state, "weeklies", wKey, "2026-07-22", 19);
        const endDay = sim.markComplete(state, "endgame", eKey, "2026-07-10", 21);

        assert.equal(state.dailiesCompleted[game.id], 1, "daily tally");
        assert.equal(state.weekliesCompleted[wKey], 1, "weekly tally");
        assert.equal(state.endgameCompleted[eKey], 1, "endgame tally");
        assert.ok(sim.historyMarksInMonth(state, "weeklies", wKey, 2026, 7).length >= 4, "weekly fill present");
        assert.equal(sim.getTrendEvents(state, "endgame", eKey).length, 1, "one endgame trend event");

        sim.markIncomplete(state, "weeklies", wKey, "2026-07-22");
        assert.equal(sim.historyMarksInMonth(state, "weeklies", wKey, 2026, 7).length, 0, "weekly cleared");
        assert.equal(state.weekliesCompleted[wKey], 0, "weekly tally cleared");

        const undone = sim.undoLast(state);
        assert.ok(undone && undone.ok, "undo incomplete");
        assert.ok(sim.historyMarksInMonth(state, "weeklies", wKey, 2026, 7).includes("2026-07-22"), "weekly restored");
        assert.equal(state.weekliesCompleted[wKey], 1, "weekly tally restored");

        // Endgame finish day still intact after weekly undo
        assert.equal(sim.historyCompletionDayInCycle(state, "endgame", eKey, endDay), endDay, "endgame finish unchanged");
      })
    );

    checks.push(
      check("Data: sync after multi-cycle play matches earned/potential currency", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        const eKey = sim.taskKey(game, game.endgame[0]);

        for (let i = 0; i < 5; i++) sim.markComplete(state, "dailies", game.id, addDays("2026-07-20", i), 9);
        sim.markComplete(state, "weeklies", wKey, "2026-07-08", 18);
        sim.markComplete(state, "weeklies", wKey, "2026-07-22", 18);
        sim.markComplete(state, "endgame", eKey, "2026-07-03", 20);
        state.endgameCurrencyEarned[game.id] = { [game.endgame[0].id]: [750] };

        // Corrupt tallies, then sync
        state.dailiesCompleted[game.id] = 99;
        state.weekliesCompleted[wKey] = 99;
        state.endgameCompleted[eKey] = 99;
        sim.syncAllTallies(state);

        assert.equal(state.dailiesCompleted[game.id], 5, "dailies synced");
        assert.equal(state.weekliesCompleted[wKey], 2, "weeklies synced");
        assert.equal(state.endgameCompleted[eKey], 1, "endgame synced");

        const totals = sim.getDataTotals(state, game);
        assert.equal(totals.dailies.earned, 5 * 60, "daily currency");
        assert.equal(totals.weeklies.earned, 2 * 100, "weekly currency");
        assert.equal(totals.endgame.earned, 750, "endgame uses earned array");
        assert.ok(totals.total.potential >= totals.total.earned, "potential >= earned");
      })
    );

    checks.push(
      check("History + Trends: 4-week simulation keeps finish-day semantics", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        const finishes = ["2026-07-08", "2026-07-15", "2026-07-22", "2026-07-29"];
        finishes.forEach((ds, i) => sim.markComplete(state, "weeklies", wKey, ds, 12 + i));

        const events = sim.getTrendEvents(state, "weeklies", wKey);
        assert.equal(events.length, 4, "one event per weekly cycle");
        const dow = sim.trendDayOfWeekCounts(events);
        // All Wednesdays (day 3) for those dates
        assert.equal(dow[3], 4, "all finish on Wednesday");
        const hours = sim.trendHourCounts(events);
        assert.equal(hours[12] + hours[13] + hours[14] + hours[15], 4, "hours follow recorded stamps");

        finishes.forEach((ds) => {
          assert.equal(sim.historyIsCarried(state, "weeklies", wKey, ds), false, ds + " is finish day");
          const later = addDays(ds, 2);
          const marks = sim.historyMarksInMonth(state, "weeklies", wKey, 2026, 7);
          if (marks.includes(later)) {
            assert.equal(sim.historyIsCarried(state, "weeklies", wKey, later), true, later + " carried");
          }
        });
      })
    );

    checks.push(
      check("Debug: polluted multi-issue state → prefer-timestamps clears warn/errors", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const weekly = game.weeklies[0];
        const end = game.endgame[0];
        const wKey = sim.taskKey(game, weekly);
        const eKey = sim.taskKey(game, end);

        // Weekly: early calendar + late timestamp + duplicate stamps
        ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"].forEach((ds) => {
          integrity.ensureDay(state, ds).weeklies.push(wKey);
        });
        state.completionTimestamps.push(
          { taskType: "weeklies", gameId: game.id, taskId: weekly.id, dateStr: "2026-07-21", hour: 10 },
          { taskType: "weeklies", gameId: game.id, taskId: weekly.id, dateStr: "2026-07-23", hour: 11 }
        );
        state.weekliesCompleted[wKey] = 7;
        state.weekliesAttempted[wKey] = 7;

        // Endgame: day-1 pollution
        const eDays = math.getDatesInCycle(end, "2026-07-13");
        eDays.forEach((ds) => integrity.ensureDay(state, ds).endgame.push(eKey));
        state.completionTimestamps.push({
          taskType: "endgame",
          gameId: game.id,
          taskId: end.id,
          dateStr: "2026-07-16",
          hour: 20,
        });
        state.endgameCompleted[eKey] = 3;
        state.endgameAttempted[eKey] = 3;

        const before = integrity.scanDataConflicts(state);
        assert.ok(before.counts.warn + before.counts.error >= 2, "has actionable conflicts before repair");

        const result = integrity.runIntegrityRepair(state, "prefer-timestamps");
        assert.equal(result.after.counts.warn, 0, "no warnings after prefer-timestamps");
        assert.equal(result.after.counts.error, 0, "no errors after prefer-timestamps");
        assert.ok(!(state.completionByDate["2026-07-20"].weeklies || []).includes(wKey), "weekly early fill stripped");
        assert.ok(!(state.completionByDate["2026-07-13"].endgame || []).includes(eKey), "endgame day-1 stripped");

        // Tallies consistent after repair
        assert.equal(state.weekliesCompleted[wKey], 1, "weekly tally corrected");
        assert.equal(state.endgameCompleted[eKey], 1, "endgame tally corrected");
      })
    );

    checks.push(
      check("Saves: serialize → load restores calendar, timestamps, tallies, trends", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "dailies", game.id, "2026-07-28", 7);
        sim.markComplete(state, "weeklies", wKey, "2026-07-22", 16);
        state.dataVersion = 3;

        const store = sim.createSaveStore();
        const saved = sim.saveState(store, state);
        assert.ok(store.getItem("gacha-tracker"), "payload written");
        assert.equal(saved.dataVersion, 4, "save bumps dataVersion");

        const loaded = sim.loadState(store);
        assert.ok(loaded, "load returns state");
        assert.equal(loaded.dataVersion, 4, "dataVersion restored");
        assert.ok((loaded.completionByDate["2026-07-28"].dailies || []).includes(game.id), "daily mark restored");
        assert.ok((loaded.completionByDate["2026-07-22"].weeklies || []).includes(wKey), "weekly mark restored");
        assert.equal(loaded.weekliesCompleted[wKey], 1, "weekly tally restored");
        assert.equal(sim.getTrendEvents(loaded, "weeklies", wKey).length, 1, "trends work after load");
        assert.equal(sim.trendHourCounts(sim.getTrendEvents(loaded, "weeklies", wKey))[16], 1, "hour preserved");

        const totals = sim.getDataTotals(loaded, game);
        assert.equal(totals.dailies.earned, 60, "data currency after load");
        assert.equal(totals.weeklies.earned, 100, "weekly currency after load");
      })
    );

    checks.push(
      check("Saves: second save overwrites; missing key loads null", () => {
        const store = sim.createSaveStore();
        const a = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(a);
        sim.markComplete(a, "dailies", game.id, "2026-07-01", 8);
        sim.saveState(store, a);

        const b = sim.createFixture({ today: "2026-07-31" });
        sim.markComplete(b, "dailies", game.id, "2026-07-15", 8);
        sim.markComplete(b, "dailies", game.id, "2026-07-16", 8);
        sim.saveState(store, b);

        const loaded = sim.loadState(store);
        assert.equal(loaded.dailiesCompleted[game.id], 2, "latest save wins");
        assert.ok(!(loaded.completionByDate["2026-07-01"] && (loaded.completionByDate["2026-07-01"].dailies || []).includes(game.id)), "old daily gone");
        assert.equal(sim.loadState(sim.createSaveStore()), null, "empty store → null");
      })
    );

    checks.push(
      check("Share card + export stay coherent after 30-day play simulation", () => {
        const rand = mulberry32(20260731);
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        const eKey = sim.taskKey(game, game.endgame[0]);

        let dailyCount = 0;
        for (let i = 0; i < 30; i++) {
          const ds = addDays("2026-07-02", i);
          if (rand() < 0.7) {
            sim.markComplete(state, "dailies", game.id, ds, 8 + Math.floor(rand() * 6));
            dailyCount++;
          }
        }
        // Two weekly cycles
        sim.markComplete(state, "weeklies", wKey, "2026-07-08", 20);
        sim.markComplete(state, "weeklies", wKey, "2026-07-22", 21);
        sim.markComplete(state, "endgame", eKey, "2026-07-10", 22);
        sim.syncAllTallies(state);

        assert.equal(state.dailiesCompleted[game.id], dailyCount, "daily tallies match sim");
        assert.equal(sim.getTrendEvents(state, "weeklies", wKey).length, 2, "weekly trends");
        assert.equal(sim.getTrendEvents(state, "endgame", eKey).length, 1, "endgame trends");

        const model = sim.buildShareCardModel(state, { days: 90, gameIds: [game.id] });
        assert.ok(model.ok, "share model ok");
        assert.equal(model.games.length, 1, "one game on card");
        assert.ok(model.currency && typeof model.currency.earned === "number", "share currency present");

        const md = sim.buildExportSummaryMarkdown(state, { days: 90 });
        assert.ok(md.includes(game.name), "markdown has game");
        const csv = sim.buildExportSummaryCsv(state, {});
        assert.ok(csv.split("\n").length > 2, "csv has completion rows");

        // Clean write path should not create warn/error conflicts
        const scan = integrity.scanDataConflicts(state);
        assert.equal(scan.counts.warn, 0, "no warn conflicts after clean play");
        assert.equal(scan.counts.error, 0, "no error conflicts after clean play");
      })
    );

    checks.push(
      check("Compact + Sync + Save: archived baselines survive reload", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", wKey, "2026-07-08", 12);
        sim.markComplete(state, "weeklies", wKey, "2026-07-22", 12);
        sim.applyHistoryCompactSafe(state, "2026-07-14");

        assert.ok(state.historyCompact && state.historyCompact.cutoffDateStr === "2026-07-14", "compact set");
        assert.ok(!state.completionByDate["2026-07-08"], "old calendar dropped");
        const synced = sim.syncTalliesFromCalendar(state, "weeklies", wKey);
        assert.equal(synced.completed, 2, "sync keeps archived cycle");

        const store = sim.createSaveStore();
        sim.saveState(store, state);
        const loaded = sim.loadState(store);
        assert.ok(loaded.historyCompact, "compact restored");
        const again = sim.syncTalliesFromCalendar(loaded, "weeklies", wKey);
        assert.equal(again.completed, 2, "reload + sync still keeps archive");
      })
    );

    // Repeat randomized invariant check with different seeds (stability)
    [1, 42, 99].forEach((seed) => {
      checks.push(
        check("Stability seed " + seed + ": play → sync → save → load → scan clean", () => {
          const rand = mulberry32(seed);
          const state = sim.createFixture({ today: "2026-07-31" });
          const game = sim.getGame(state);
          const wKey = sim.taskKey(game, game.weeklies[0]);
          for (let i = 0; i < 14; i++) {
            if (rand() < 0.6) sim.markComplete(state, "dailies", game.id, addDays("2026-07-10", i), 10);
          }
          if (rand() < 0.9) sim.markComplete(state, "weeklies", wKey, "2026-07-15", 15);
          sim.syncAllTallies(state);
          const store = sim.createSaveStore();
          sim.saveState(store, state);
          const loaded = sim.loadState(store);
          sim.syncAllTallies(loaded);
          const scan = integrity.scanDataConflicts(loaded);
          assert.equal(scan.counts.error, 0, "no errors");
          assert.equal(scan.counts.warn, 0, "no warnings");
          assert.equal(
            loaded.dailiesCompleted[game.id],
            Object.keys(loaded.completionByDate).filter((ds) => (loaded.completionByDate[ds].dailies || []).includes(game.id))
              .length,
            "daily tally matches calendar after reload"
          );
        })
      );
    });

    const failed = checks.filter((c) => !c.ok);
    return {
      ok: failed.length === 0,
      checks,
      title: "End-to-end pipeline · Data · History · Trends · Debug · Saves",
    };
  },
};
