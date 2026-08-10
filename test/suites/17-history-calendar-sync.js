"use strict";

/**
 * Behavioral sims for Completion History finish edits, manual-only Start/End,
 * extracurricular Completed editors, and calendar / Trends sync.
 */

const assert = require("../lib/assert");
const sim = require("../lib/sim-tracker");
const { listExtracurricularTimestampsForTimeTrends } = require("../lib/extracurricular-time-trends");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

module.exports = {
  name: "history-calendar-sync",
  title: "History finish edits · manual bounds · extracurricular · calendar sync",
  run() {
    const checks = [];

    checks.push(
      check("Sim: moving weekly Finished day remaps fill + stamp; tally unchanged", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 10, 0);
        const tallyBefore = Number(state.weekliesCompleted[key]) || 0;
        assert.equal(sim.historyCompletionDayInCycle(state, "weeklies", key, "2026-07-22"), "2026-07-22");
        assert.ok(
          (state.completionByDate["2026-07-22"].weeklies || []).includes(key),
          "original finish marked"
        );

        const moved = sim.setCycleCompletionMoment(state, "weeklies", key, "2026-07-20", "2026-07-24", 15, 30);
        assert.equal(moved.ok, true, "move ok");
        assert.equal(moved.dateStr, "2026-07-24", "finish day");
        assert.equal(Number(state.weekliesCompleted[key]) || 0, tallyBefore, "no tally bump");
        assert.equal(sim.historyCompletionDayInCycle(state, "weeklies", key, "2026-07-22"), "2026-07-24");
        assert.ok(
          !(state.completionByDate["2026-07-22"] && (state.completionByDate["2026-07-22"].weeklies || []).includes(key)),
          "old finish cleared"
        );
        assert.ok(
          (state.completionByDate["2026-07-24"].weeklies || []).includes(key),
          "new finish marked"
        );
        const stamp = state.completionTimestamps.find(
          (t) => t.taskType === "weeklies" && t.taskId === "weekly_a" && t.dateStr === "2026-07-24"
        );
        assert.ok(stamp, "timestamp on new day");
        assert.equal(stamp.hour, 15);
        assert.equal(stamp.minute, 30);
      })
    );

    checks.push(
      check("Sim: finish day outside cycle clamps into owned window", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 12, 0);
        const early = sim.setCycleCompletionMoment(state, "weeklies", key, "2026-07-20", "2026-07-01", 9, 0);
        assert.equal(early.ok, true);
        assert.equal(early.dateStr, "2026-07-20", "clamp to cycle start Mon");
        const late = sim.setCycleCompletionMoment(state, "weeklies", key, "2026-07-20", "2026-08-15", 9, 0);
        assert.equal(late.ok, true);
        assert.equal(late.dateStr, "2026-07-26", "clamp to last owned day before shared Mon");
      })
    );

    checks.push(
      check("Sim: scheduled End/Start date edit is locked (no-op)", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const eg = game.endgame.find((t) => t.id === "endgame_a");
        const key = sim.taskKey(game, eg);
        sim.markComplete(state, "endgame", key, "2026-07-08", 12, 0);
        const before = JSON.stringify(state.completionByDate);
        const res = sim.setEndgameCompletionDate(state, game.id, eg.id, 0, "2026-01-01", "2026-01-14");
        assert.equal(res.applied, false, "scheduled locked");
        assert.equal(JSON.stringify(state.completionByDate), before, "calendar untouched");
        assert.ok(!eg.manualReset, "fixture endgame is scheduled");
      })
    );

    checks.push(
      check("Sim: manual-reset Start/End rewrite applies to closed cycles", () => {
        const state = sim.createFixture({ today: "2026-08-07" });
        const game = sim.getGame(state);
        const task = {
          id: "anomaly",
          label: "Anomaly Arbitration",
          manualReset: true,
          dateStarted: "2026-07-17",
          manualDueDateStr: "2026-08-19",
          weekStartHour: 4,
          weekStartMinute: 0,
          currency: 800,
          manualClosedCycles: [{ start: "2026-02-06", end: "2026-03-20", completed: 1 }],
        };
        game.endgame.push(task);
        state.endgameCompletionDates[game.id + ".anomaly"] = [{ start: "2026-02-06", end: "2026-03-20" }];
        const res = sim.setEndgameCompletionDate(state, game.id, "anomaly", 0, "2026-02-10", "2026-03-24");
        assert.equal(res.ok, true);
        assert.equal(res.applied, true);
        assert.equal(task.manualClosedCycles[0].start, "2026-02-10");
        assert.equal(task.manualClosedCycles[0].end, "2026-03-24");
        assert.equal(task.manualClosedCycles[0].completed, 1);
      })
    );

    checks.push(
      check("Sim: manual closed-cycle Finished uses that window, not live", () => {
        const state = sim.createFixture({ today: "2026-08-07" });
        const game = sim.getGame(state);
        const task = {
          id: "manual_eg",
          label: "Manual EG",
          manualReset: true,
          dateStarted: "2026-07-17",
          manualDueDateStr: "2026-08-19",
          weekStartHour: 4,
          weekStartMinute: 0,
          currency: 100,
          manualClosedCycles: [{ start: "2026-03-01", end: "2026-04-01", completed: 1 }],
        };
        game.endgame.push(task);
        const key = sim.taskKey(game, task);
        // plant marks in the closed window
        ["2026-03-05", "2026-03-06", "2026-03-07"].forEach((ds) => {
          const day = state.completionByDate[ds] || { dailies: [], weeklies: [], endgame: [] };
          day.endgame.push(key);
          state.completionByDate[ds] = day;
        });
        state.completionTimestamps.push({
          dateStr: "2026-03-05",
          hour: 11,
          minute: 0,
          gameId: game.id,
          taskType: "endgame",
          taskId: "manual_eg",
        });
        state.endgameCompleted[key] = 1;

        const bounds = sim.getManualPeriodBoundsForDateStr(task, "endgame", "2026-03-01");
        assert.ok(bounds, "closed bounds resolved");
        assert.equal(
          bounds.cycleStart.getFullYear() + "-" + String(bounds.cycleStart.getMonth() + 1).padStart(2, "0") + "-" + String(bounds.cycleStart.getDate()).padStart(2, "0"),
          "2026-03-01"
        );

        const moved = sim.setCycleCompletionMoment(state, "endgame", key, "2026-03-01", "2026-03-10", 18, 0);
        assert.equal(moved.ok, true, "finish move ok");
        assert.equal(moved.dateStr, "2026-03-10");
        assert.ok(
          !(state.completionByDate["2026-03-05"] && (state.completionByDate["2026-03-05"].endgame || []).includes(key)),
          "old closed-window mark cleared"
        );
        assert.ok(
          (state.completionByDate["2026-03-10"].endgame || []).includes(key),
          "new finish in closed window"
        );
        // live window must not be planted
        assert.ok(
          !(state.completionByDate["2026-07-17"] && (state.completionByDate["2026-07-17"].endgame || []).includes(key)),
          "live window not polluted"
        );
      })
    );

    checks.push(
      check("Sim: extracurricular Completed edit updates Trends stamps", () => {
        const state = sim.createFixture({ today: "2026-08-07" });
        state.extracurricularTasks = [
          {
            id: "evt1",
            gameId: "g_sim",
            label: "Cosmicon, Roll On",
            startDate: "2026-03-14",
            endDate: "2026-03-23",
            endTime: "23:59",
            currency: 0,
          },
        ];
        state.extracurricularCompleted = { evt1: true };
        state.extracurricularCompletedAt = { evt1: "2026-03-20T12:00:00.000Z" };

        const before = listExtracurricularTimestampsForTimeTrends(state, {
          getDatePartsInTimezone: () => ({ year: 2026, month: 2, day: 20, hour: 12, minute: 0 }),
        });
        assert.equal(before.length, 1);
        assert.equal(before[0].dateStr, "2026-03-20");

        const res = sim.setExtracurricularCompletionMoment(state, "evt1", "2026-03-18", 21, 15);
        assert.equal(res.ok, true);
        assert.equal(state.extracurricularCompletedAt.evt1.slice(0, 16), "2026-03-18T21:15");
        const after = listExtracurricularTimestampsForTimeTrends(state, {
          getDatePartsInTimezone: () => ({ year: 2026, month: 2, day: 18, hour: 21, minute: 15 }),
        });
        assert.equal(after[0].dateStr, "2026-03-18");
        assert.equal(after[0].hour, 21);
        assert.equal(after[0].minute, 15);
        const stamp = state.completionTimestamps.find((t) => t.taskType === "extracurricular" && t.taskId === "evt1");
        assert.ok(stamp && stamp.dateStr === "2026-03-18" && stamp.hour === 21);
      })
    );

    checks.push(
      check("Sim: History true day follows finish edit after Trends sync path", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const eg = game.endgame.find((t) => t.id === "endgame_a");
        const key = sim.taskKey(game, eg);
        sim.markComplete(state, "endgame", key, "2026-07-08", 9, 0);
        sim.setCycleCompletionMoment(state, "endgame", key, "2026-07-06", "2026-07-12", 20, 0);
        assert.equal(sim.historyCompletionDayInCycle(state, "endgame", key, "2026-07-08"), "2026-07-12");
        const events = sim.getTrendEvents(state, "endgame", key);
        const hit = events.find((e) => e.dateStr === "2026-07-12");
        assert.ok(hit, "Trends event on new finish day");
        const hours = sim.trendHourCounts(
          state.completionTimestamps
            .filter((t) => t.taskType === "endgame" && t.taskId === "endgame_a")
            .map((t) => ({ dateStr: t.dateStr, hour: t.hour }))
        );
        assert.equal(hours[20], 1, "Trends hour uses edited finish time");
      })
    );

    checks.push(
      check("Invariant: History Save draft commit persists finish/earned/skip (Anomaly-style end clock)", () => {
        const state = sim.createFixture({ today: "2026-08-07" });
        const game = sim.getGame(state);
        const anomaly = {
          id: "anomaly",
          label: "Anomaly Arbitration",
          weekStartDay: 5,
          weekStartHour: 4,
          weekStartMinute: 0,
          dateStarted: "2026-05-31",
          frequencyEvery: 6,
          frequencyUnit: "week",
          timeLimitEvery: 6,
          timeLimitUnit: "week",
          currency: 100,
          cycleEndTimeSameAsBegin: false,
          cycleEndHour: 17,
          cycleEndMinute: 0,
          manualReset: true,
          manualDueTbd: true,
          manualDueDateStr: null,
          manualClosedCycles: [
            { start: "2026-02-11", end: "2026-03-25", completed: 1 },
            { start: "2026-03-25", end: "2026-05-06", completed: 1 },
          ],
        };
        game.endgame.push(anomaly);
        const key = sim.taskKey(game, anomaly);
        const gameId = game.id;
        // Seed completions on/near cycle end afternoon (would fall outside a 4am end-day window).
        state.endgameCompleted[key] = 2;
        state.endgameCurrencyEarned[gameId] = state.endgameCurrencyEarned[gameId] || {};
        state.endgameCurrencyEarned[gameId].anomaly = [10, 20];
        state.completionByDate["2026-03-25"] = { dailies: [], weeklies: [], endgame: [key] };
        state.completionByDate["2026-05-06"] = { dailies: [], weeklies: [], endgame: [key] };
        state.completionTimestamps.push(
          {
            dateStr: "2026-03-25",
            hour: 15,
            minute: 30,
            gameId,
            taskType: "endgame",
            taskId: "anomaly",
            taskLabel: "Anomaly Arbitration",
          },
          {
            dateStr: "2026-05-06",
            hour: 16,
            minute: 0,
            gameId,
            taskType: "endgame",
            taskId: "anomaly",
            taskLabel: "Anomaly Arbitration",
          }
        );

        // Bounds must include end-day afternoon via cycleEndHour 17.
        const bounds = sim.getManualPeriodBoundsForDateStr(anomaly, "endgame", "2026-02-11");
        assert.ok(bounds, "closed cycle bounds resolve");
        assert.ok(bounds.cycleEnd.getHours() === 17, "end clock is 17:00 not start 4:00");
        const endMs = new Date("2026-03-25T15:30:00").getTime();
        assert.ok(
          endMs >= bounds.cycleStart.getTime() && endMs < bounds.cycleEnd.getTime(),
          "finish stamp on end day @15:30 is inside reconstructed window"
        );

        const draft = [
          {
            origStatus: "completed",
            status: "skipped",
            origStartStr: "2026-02-11",
            startStr: "2026-02-11",
            origEndStr: "2026-03-25",
            endStr: "2026-03-25",
            origFinishDateStr: "2026-03-25",
            finishDateStr: "2026-03-25",
            origHour: 15,
            hour: 15,
            origMinute: 30,
            minute: 30,
            origEarned: 10,
            earned: 10,
          },
          {
            origStatus: "completed",
            status: "completed",
            origStartStr: "2026-03-25",
            startStr: "2026-03-25",
            origEndStr: "2026-05-06",
            endStr: "2026-05-06",
            origFinishDateStr: "2026-05-06",
            finishDateStr: "2026-05-01",
            origHour: 16,
            hour: 14,
            origMinute: 0,
            minute: 45,
            origEarned: 20,
            earned: 77,
          },
        ];
        const committed = sim.commitEarningsHistoryDraft(state, gameId, "anomaly", draft);
        assert.ok(committed.ok, "commit ok: " + (committed.errors || []).join("; "));

        const closed0 = anomaly.manualClosedCycles.find((c) => c.start === "2026-02-11");
        assert.ok(closed0 && closed0.completed === 0, "first cycle marked skipped in closed rows");
        assert.equal(Number(state.endgameCompleted[key]) || 0, 1, "completed tally after skip");
        assert.equal(
          (state.completionTimestamps || []).some(
            (t) => t.taskId === "anomaly" && t.dateStr === "2026-03-25" && t.hour === 15
          ),
          false,
          "skipped cycle end-day afternoon stamp cleared"
        );

        const stamp = (state.completionTimestamps || []).find(
          (t) => t.taskId === "anomaly" && t.dateStr === "2026-05-01"
        );
        assert.ok(stamp, "finish day remapped to draft date");
        assert.equal(stamp.hour, 14, "finish hour persisted (not reverted)");
        assert.equal(stamp.minute, 45, "finish minute persisted");
        assert.equal(
          (state.endgameCurrencyEarned[gameId].anomaly || [])[0],
          77,
          "earned amount persisted after Save"
        );

        // Re-read via bounds (same path History refresh uses) — stamp still inside window.
        const bounds2 = sim.getManualPeriodBoundsForDateStr(anomaly, "endgame", "2026-03-25");
        const stampMs = new Date("2026-05-01T14:45:00").getTime();
        assert.ok(
          bounds2 && stampMs >= bounds2.cycleStart.getTime() && stampMs < bounds2.cycleEnd.getTime(),
          "after Save rebuild, edited finish remains inside cycle window"
        );
      })
    );

    checks.push(
      check("Invariant: Mark skipped Save clears end-day stamp (not still completed)", () => {
        const state = sim.createFixture({ today: "2026-08-07" });
        const game = sim.getGame(state);
        const anomaly = {
          id: "anomaly_skip",
          label: "Anomaly Skip",
          weekStartDay: 5,
          weekStartHour: 4,
          weekStartMinute: 0,
          dateStarted: "2026-05-31",
          frequencyEvery: 6,
          frequencyUnit: "week",
          timeLimitEvery: 6,
          timeLimitUnit: "week",
          currency: 100,
          cycleEndTimeSameAsBegin: false,
          cycleEndHour: 17,
          cycleEndMinute: 0,
          manualReset: true,
          manualDueTbd: true,
          manualDueDateStr: null,
          manualClosedCycles: [
            { start: "2026-02-11", end: "2026-03-25", completed: 1 },
            { start: "2026-03-25", end: "2026-05-06", completed: 1 },
          ],
        };
        game.endgame.push(anomaly);
        const key = sim.taskKey(game, anomaly);
        const gameId = game.id;
        state.endgameCompleted[key] = 2;
        state.endgameCurrencyEarned[gameId] = state.endgameCurrencyEarned[gameId] || {};
        state.endgameCurrencyEarned[gameId].anomaly_skip = [10, 20];
        // Finish on shared boundary afternoon — owned fill dates exclude this day.
        state.completionTimestamps.push(
          {
            dateStr: "2026-03-25",
            hour: 15,
            minute: 30,
            gameId,
            taskType: "endgame",
            taskId: "anomaly_skip",
            taskLabel: "Anomaly Skip",
          },
          {
            dateStr: "2026-05-06",
            hour: 16,
            minute: 0,
            gameId,
            taskType: "endgame",
            taskId: "anomaly_skip",
            taskLabel: "Anomaly Skip",
          }
        );
        state.completionByDate["2026-05-06"] = { dailies: [], weeklies: [], endgame: [key] };

        const committed = sim.commitEarningsHistoryDraft(state, gameId, "anomaly_skip", [
          {
            origStatus: "completed",
            status: "skipped",
            origStartStr: "2026-02-11",
            startStr: "2026-02-11",
            origEndStr: "2026-03-25",
            endStr: "2026-03-25",
            origFinishDateStr: "2026-03-25",
            finishDateStr: "2026-03-25",
            origHour: 15,
            hour: 15,
            origMinute: 30,
            minute: 30,
            origEarned: 10,
            earned: 10,
          },
          {
            origStatus: "completed",
            status: "completed",
            origStartStr: "2026-03-25",
            startStr: "2026-03-25",
            origEndStr: "2026-05-06",
            endStr: "2026-05-06",
            origFinishDateStr: "2026-05-06",
            finishDateStr: "2026-05-06",
            origHour: 16,
            hour: 16,
            origMinute: 0,
            minute: 0,
            origEarned: 20,
            earned: 20,
          },
        ]);
        assert.ok(committed.ok, "skip commit ok: " + (committed.errors || []).join("; "));

        const closed0 = anomaly.manualClosedCycles.find((c) => c.start === "2026-02-11");
        assert.ok(closed0 && closed0.completed === 0, "first cycle marked skipped in closed rows");
        assert.ok(
          anomaly.manualClosedCycles.some((c) => c.start === "2026-03-25" && c.completed === 1),
          "sibling adjoining cycle stays completed"
        );
        assert.equal(Number(state.endgameCompleted[key]) || 0, 1, "completed tally decremented after skip");
        assert.equal(
          (state.completionTimestamps || []).some(
            (t) => t.taskId === "anomaly_skip" && t.dateStr === "2026-03-25"
          ),
          false,
          "shared-boundary finish timestamp cleared (Mark skipped stays skipped on refresh)"
        );
        assert.ok(
          (state.completionTimestamps || []).some(
            (t) => t.taskId === "anomaly_skip" && t.dateStr === "2026-05-06"
          ),
          "sibling cycle finish stamp preserved"
        );
      })
    );

    checks.push(
      check("Invariant: History Save delete drops closed cycle (not skip)", () => {
        const state = sim.createFixture({ today: "2026-08-07" });
        const game = sim.getGame(state);
        const anomaly = {
          id: "anomaly_del",
          label: "Anomaly Delete",
          weekStartDay: 5,
          weekStartHour: 4,
          weekStartMinute: 0,
          dateStarted: "2026-05-31",
          frequencyEvery: 6,
          frequencyUnit: "week",
          timeLimitEvery: 6,
          timeLimitUnit: "week",
          currency: 100,
          cycleEndTimeSameAsBegin: false,
          cycleEndHour: 17,
          cycleEndMinute: 0,
          manualReset: true,
          manualDueTbd: true,
          manualDueDateStr: null,
          manualClosedCycles: [
            { start: "2026-02-11", end: "2026-03-25", completed: 1 },
            { start: "2026-03-25", end: "2026-05-06", completed: 1 },
          ],
        };
        game.endgame.push(anomaly);
        const key = sim.taskKey(game, anomaly);
        const gameId = game.id;
        state.endgameCompleted[key] = 2;
        state.endgameCurrencyEarned[gameId] = state.endgameCurrencyEarned[gameId] || {};
        state.endgameCurrencyEarned[gameId].anomaly_del = [10, 20];
        // Finish inside the first window (not on shared end/start boundary day).
        state.completionByDate["2026-03-20"] = { dailies: [], weeklies: [], endgame: [key] };
        state.completionByDate["2026-05-06"] = { dailies: [], weeklies: [], endgame: [key] };
        state.completionTimestamps.push(
          {
            dateStr: "2026-03-20",
            hour: 15,
            minute: 30,
            gameId,
            taskType: "endgame",
            taskId: "anomaly_del",
            taskLabel: "Anomaly Delete",
          },
          {
            dateStr: "2026-05-06",
            hour: 16,
            minute: 0,
            gameId,
            taskType: "endgame",
            taskId: "anomaly_del",
            taskLabel: "Anomaly Delete",
          }
        );

        const draft = [
          {
            origStatus: "completed",
            status: "deleted",
            origStartStr: "2026-02-11",
            startStr: "2026-02-11",
            origEndStr: "2026-03-25",
            endStr: "2026-03-25",
            origFinishDateStr: "2026-03-20",
            finishDateStr: "2026-03-20",
            origHour: 15,
            hour: 15,
            origMinute: 30,
            minute: 30,
            origEarned: 10,
            earned: 10,
          },
          {
            origStatus: "completed",
            status: "completed",
            origStartStr: "2026-03-25",
            startStr: "2026-03-25",
            origEndStr: "2026-05-06",
            endStr: "2026-05-06",
            origFinishDateStr: "2026-05-06",
            finishDateStr: "2026-05-06",
            origHour: 16,
            hour: 16,
            origMinute: 0,
            minute: 0,
            origEarned: 20,
            earned: 20,
          },
        ];
        const committed = sim.commitEarningsHistoryDraft(state, gameId, "anomaly_del", draft);
        assert.ok(committed.ok, "delete commit ok: " + (committed.errors || []).join("; "));

        assert.equal(
          anomaly.manualClosedCycles.some((c) => c.start === "2026-02-11"),
          false,
          "deleted cycle removed from manualClosedCycles (not archived as skipped)"
        );
        assert.ok(
          anomaly.manualClosedCycles.some((c) => c.start === "2026-03-25" && c.completed === 1),
          "untouched cycle remains completed"
        );
        assert.equal(Number(state.endgameCompleted[key]) || 0, 1, "completed tally after delete");
        assert.equal(
          !!(state.completionByDate["2026-03-20"] && (state.completionByDate["2026-03-20"].endgame || []).includes(key)),
          false,
          "calendar marks cleared for deleted cycle"
        );
        assert.equal(
          (state.completionTimestamps || []).some((t) => t.taskId === "anomaly_del" && t.dateStr === "2026-03-20"),
          false,
          "timestamp cleared for deleted cycle"
        );
        assert.equal(
          (state.endgameCurrencyEarned[gameId].anomaly_del || [])[0],
          20,
          "remaining earned kept after delete"
        );
      })
    );

    checks.push(
      check("Invariant: Delete Save removes archive when draft dates drifted from closed strings", () => {
        // Mimics TZ display drift: History draft shows shifted start/end, but archive keeps
        // the real window strings. Finish day must still locate + drop the closed row.
        const state = sim.createFixture({ today: "2026-08-10" });
        const game = sim.getGame(state);
        const umbral = {
          id: "umbral_del",
          label: "Umbral Monument",
          weekStartDay: 3,
          weekStartHour: 4,
          weekStartMinute: 0,
          dateStarted: "2026-03-01",
          frequencyEvery: 2,
          frequencyUnit: "week",
          timeLimitEvery: 2,
          timeLimitUnit: "week",
          currency: 1200,
          manualReset: true,
          manualDueTbd: false,
          manualDueDateStr: "2026-03-15",
          manualDueHour: 4,
          manualDueMinute: 0,
          manualClosedCycles: [{ start: "2026-02-11", end: "2026-02-26", completed: 1 }],
        };
        game.endgame.push(umbral);
        const key = sim.taskKey(game, umbral);
        state.endgameCompleted[key] = 1;
        state.endgameCurrencyEarned[game.id] = { umbral_del: [0] };
        state.completionByDate["2026-02-11"] = { dailies: [], weeklies: [], endgame: [key] };
        state.completionTimestamps.push({
          dateStr: "2026-02-11",
          hour: 12,
          minute: 0,
          gameId: game.id,
          taskType: "endgame",
          taskId: "umbral_del",
          taskLabel: "Umbral Monument",
        });

        const committed = sim.commitEarningsHistoryDraft(state, game.id, "umbral_del", [
          {
            origStatus: "completed",
            status: "deleted",
            origStartStr: "2026-02-10",
            startStr: "2026-02-10",
            origEndStr: "2026-02-25",
            endStr: "2026-02-25",
            origFinishDateStr: "2026-02-11",
            finishDateStr: "2026-02-11",
            origHour: 12,
            hour: 12,
            origMinute: 0,
            minute: 0,
            origEarned: 0,
            earned: 0,
          },
        ]);
        assert.ok(committed.ok, "delete commit ok: " + (committed.errors || []).join("; "));
        assert.equal(
          (umbral.manualClosedCycles || []).length,
          0,
          "closed archive dropped via finish-day match"
        );
        assert.equal(
          !!(state.completionByDate["2026-02-11"] && (state.completionByDate["2026-02-11"].endgame || []).includes(key)),
          false,
          "calendar finish mark cleared"
        );
        assert.equal(Number(state.endgameCompleted[key]) || 0, 0, "tally decremented");
      })
    );

    checks.push(
      check("Invariant: Mark skipped Save flips archive when draft dates drifted (no twin skip row)", () => {
        // Reproduces Umbral screenshot: Save used drifted dates and created a second skipped
        // window while the original completed archive stayed completed.
        const state = sim.createFixture({ today: "2026-08-10" });
        const game = sim.getGame(state);
        const umbral = {
          id: "umbral_skip",
          label: "Umbral Monument",
          weekStartDay: 3,
          weekStartHour: 4,
          weekStartMinute: 0,
          dateStarted: "2026-03-01",
          frequencyEvery: 2,
          frequencyUnit: "week",
          timeLimitEvery: 2,
          timeLimitUnit: "week",
          currency: 1200,
          manualReset: true,
          manualDueTbd: false,
          manualDueDateStr: "2026-03-15",
          manualDueHour: 4,
          manualDueMinute: 0,
          manualClosedCycles: [
            { start: "2026-02-11", end: "2026-02-26", completed: 1 },
            { start: "2026-02-08", end: "2026-02-26", completed: 1 },
          ],
        };
        game.endgame.push(umbral);
        const key = sim.taskKey(game, umbral);
        state.endgameCompleted[key] = 2;
        state.endgameCurrencyEarned[game.id] = { umbral_skip: [0, 0] };
        state.completionByDate["2026-02-11"] = { dailies: [], weeklies: [], endgame: [key] };
        state.completionByDate["2026-02-08"] = { dailies: [], weeklies: [], endgame: [key] };
        state.completionTimestamps.push(
          {
            dateStr: "2026-02-11",
            hour: 12,
            minute: 0,
            gameId: game.id,
            taskType: "endgame",
            taskId: "umbral_skip",
          },
          {
            dateStr: "2026-02-08",
            hour: 12,
            minute: 0,
            gameId: game.id,
            taskType: "endgame",
            taskId: "umbral_skip",
          }
        );

        const committed = sim.commitEarningsHistoryDraft(state, game.id, "umbral_skip", [
          {
            origStatus: "completed",
            status: "skipped",
            // Drifted labels (would previously upsert a twin skipped row).
            origStartStr: "2026-02-10",
            startStr: "2026-02-10",
            origEndStr: "2026-02-25",
            endStr: "2026-02-25",
            origFinishDateStr: "2026-02-11",
            finishDateStr: "2026-02-11",
            origHour: 12,
            hour: 12,
            origMinute: 0,
            minute: 0,
            origEarned: 0,
            earned: 0,
          },
          {
            origStatus: "completed",
            status: "completed",
            origStartStr: "2026-02-08",
            startStr: "2026-02-08",
            origEndStr: "2026-02-26",
            endStr: "2026-02-26",
            origFinishDateStr: "2026-02-08",
            finishDateStr: "2026-02-08",
            origHour: 12,
            hour: 12,
            origMinute: 0,
            minute: 0,
            origEarned: 0,
            earned: 0,
          },
        ]);
        assert.ok(committed.ok, "skip commit ok: " + (committed.errors || []).join("; "));

        const closed = umbral.manualClosedCycles || [];
        const skipped = closed.filter((c) => c && !c.completed);
        const completed = closed.filter((c) => c && c.completed);
        assert.equal(skipped.length, 1, "exactly one skipped archive row");
        assert.equal(skipped[0].start, "2026-02-11", "keeps real archive start (not drifted 02-10)");
        assert.equal(skipped[0].end, "2026-02-26", "keeps real archive end");
        assert.equal(completed.length, 1, "sibling completion preserved");
        assert.equal(completed[0].start, "2026-02-08");
        assert.equal(
          closed.some((c) => c.start === "2026-02-10"),
          false,
          "no drifted twin skipped row"
        );
        assert.equal(
          !!(state.completionByDate["2026-02-11"] && (state.completionByDate["2026-02-11"].endgame || []).includes(key)),
          false,
          "skipped finish day cleared from calendar"
        );
        assert.equal(Number(state.endgameCompleted[key]) || 0, 1, "tally after one skip");
      })
    );

    checks.push(
      check("Sim: past Add (skipped→completed Save) paints finish + fill; visible past current live", () => {
        const state = sim.createFixture({ today: "2026-08-07" });
        const game = sim.getGame(state);
        const task = {
          id: "past_add_eg",
          label: "Past Add EG",
          manualReset: true,
          dateStarted: "2026-07-17",
          manualDueDateStr: "2026-08-19",
          weekStartHour: 4,
          weekStartMinute: 0,
          currency: 100,
          // Older closed window was skipped (no marks); live window also open.
          manualClosedCycles: [{ start: "2026-03-01", end: "2026-04-01", completed: 0 }],
        };
        game.endgame.push(task);
        const key = sim.taskKey(game, task);
        state.endgameCompleted[key] = 0;

        const res = sim.commitEarningsHistoryDraft(state, game.id, "past_add_eg", [
          {
            origStatus: "skipped",
            status: "completed",
            startStr: "2026-03-01",
            endStr: "2026-04-01",
            origStartStr: "2026-03-01",
            origEndStr: "2026-04-01",
            finishDateStr: "2026-03-10",
            origFinishDateStr: "2026-03-01",
            hour: 14,
            minute: 30,
            origHour: 12,
            origMinute: 0,
            earned: 100,
            origEarned: 100,
          },
        ]);
        assert.equal(res.ok, true, "draft Save ok");
        assert.ok(
          (state.completionByDate["2026-03-10"].endgame || []).includes(key),
          "finish day marked after past Add"
        );
        // Fill-remaining through cycle end (exclusive of shared end day when applicable).
        assert.ok(
          (state.completionByDate["2026-03-15"].endgame || []).includes(key),
          "fill day inside past window"
        );
        assert.ok(
          (state.completionTimestamps || []).some(
            (t) => t.taskId === "past_add_eg" && t.dateStr === "2026-03-10" && t.hour === 14
          ),
          "timestamp on past finish day"
        );
        // Attendance History only paints tasks available that day — closed window must resolve.
        const pastBounds = sim.getManualPeriodBoundsForDateStr(task, "endgame", "2026-03-10");
        assert.ok(pastBounds, "past finish day resolves as in-cycle for calendar availability");
        const liveBounds = sim.getManualPeriodBoundsForDateStr(task, "endgame", "2026-08-01");
        assert.ok(liveBounds, "live window still resolves");
        assert.ok(
          pastBounds.cycleStart.getTime() !== liveBounds.cycleStart.getTime(),
          "past Add does not collapse onto live window"
        );
      })
    );

    checks.push(
      check("Sim: Edit Finished on past cycle remaps calendar; Delete Save clears marks", () => {
        const state = sim.createFixture({ today: "2026-08-07" });
        const game = sim.getGame(state);
        const task = {
          id: "edit_past_eg",
          label: "Edit Past EG",
          manualReset: true,
          dateStarted: "2026-07-17",
          manualDueDateStr: "2026-08-19",
          weekStartHour: 4,
          weekStartMinute: 0,
          currency: 50,
          manualClosedCycles: [{ start: "2026-02-01", end: "2026-03-01", completed: 1 }],
        };
        game.endgame.push(task);
        const key = sim.taskKey(game, task);
        const gameId = game.id;
        state.endgameCompleted[key] = 1;
        state.endgameCurrencyEarned[gameId] = { edit_past_eg: [50] };
        ["2026-02-10", "2026-02-11", "2026-02-12"].forEach((ds) => {
          const day = state.completionByDate[ds] || { dailies: [], weeklies: [], endgame: [] };
          day.endgame.push(key);
          state.completionByDate[ds] = day;
        });
        state.completionTimestamps.push({
          dateStr: "2026-02-10",
          hour: 10,
          minute: 0,
          gameId,
          taskType: "endgame",
          taskId: "edit_past_eg",
        });

        const moved = sim.setCycleCompletionMoment(state, "endgame", key, "2026-02-01", "2026-02-20", 16, 45);
        assert.equal(moved.ok, true);
        assert.equal(moved.dateStr, "2026-02-20");
        assert.equal(
          !!(state.completionByDate["2026-02-10"] && (state.completionByDate["2026-02-10"].endgame || []).includes(key)),
          false,
          "old finish cleared on Edit Finished"
        );
        assert.ok(
          (state.completionByDate["2026-02-20"].endgame || []).includes(key),
          "new finish painted"
        );
        assert.ok(
          (state.completionByDate["2026-02-25"].endgame || []).includes(key),
          "fill days after edited finish"
        );

        const del = sim.commitEarningsHistoryDraft(state, gameId, "edit_past_eg", [
          {
            origStatus: "completed",
            status: "deleted",
            startStr: "2026-02-01",
            endStr: "2026-03-01",
            origStartStr: "2026-02-01",
            origEndStr: "2026-03-01",
            finishDateStr: "2026-02-20",
            origFinishDateStr: "2026-02-20",
            hour: 16,
            minute: 45,
            origHour: 16,
            origMinute: 45,
            earned: 50,
            origEarned: 50,
          },
        ]);
        assert.equal(del.ok, true);
        assert.equal(
          (task.manualClosedCycles || []).some((c) => c && c.start === "2026-02-01"),
          false,
          "deleted cycle removed"
        );
        assert.equal(
          Object.keys(state.completionByDate).some((ds) =>
            (state.completionByDate[ds].endgame || []).includes(key)
          ),
          false,
          "all calendar marks cleared on Delete"
        );
      })
    );

    checks.push(
      check("Sim: scheduled weekly Add past + Edit Finished keep prior cycle marks", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        // Two prior weeks completed.
        sim.markComplete(state, "weeklies", key, "2026-07-15", 11, 0);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 12, 0);
        assert.ok((state.completionByDate["2026-07-15"].weeklies || []).includes(key));
        assert.ok((state.completionByDate["2026-07-22"].weeklies || []).includes(key));

        const moved = sim.setCycleCompletionMoment(state, "weeklies", key, "2026-07-20", "2026-07-24", 18, 0);
        assert.equal(moved.ok, true);
        assert.equal(moved.dateStr, "2026-07-24");
        // Older cycle untouched.
        assert.ok(
          (state.completionByDate["2026-07-15"].weeklies || []).includes(key),
          "prior week marks remain after editing later complete"
        );
        assert.equal(
          !!(state.completionByDate["2026-07-22"] && (state.completionByDate["2026-07-22"].weeklies || []).includes(key)),
          false,
          "edited cycle old finish cleared"
        );
        assert.ok((state.completionByDate["2026-07-24"].weeklies || []).includes(key));
      })
    );

    // ── Source contracts for Game-tab → calendar sync surface ──
    checks.push(
      check("Source: Completion History wires Finished + manual-only Start/End", () => {
        const modals = read("src/02-modals.js");
        const core = read("src/01-core.js");
        const html = read("index.html");
        assert.ok(modals.includes("appendEarningsFinishEditors"));
        assert.ok(modals.includes("Cycle Start/End edits are manual-only") || modals.includes("Cycle Start/End edits are manual-reset only"));
        assert.ok(modals.includes("function saveEarningsModal"));
        assert.ok(modals.includes("flushEarningsModalDraftFromDom"));
        assert.ok(modals.includes("setCycleCompletionMoment("));
        assert.ok(modals.includes("applyManualResetCompletion("));
        assert.ok(modals.includes("Mark skipped"));
        assert.ok(modals.includes("Mark completed"));
        assert.ok(modals.includes("function deleteEarningsDraftItem"));
        assert.ok(modals.includes('deleteBtn.textContent = "Delete"'));
        assert.ok(modals.includes('item.status !== "deleted"'));
        assert.ok(html.includes('id="earningsModalSave"'));
        assert.ok(core.includes("if (!game || !task || !isManualResetTask(task)) return;"));
        assert.ok(core.includes("function getManualPeriodBoundsForDateStr"));
        assert.ok(core.includes("function getManualResetEndMomentOnDate"));
        assert.ok(core.includes("function clearManualResetMarksInRange"));
        assert.ok(
          core.includes("Time-window match: catches end-afternoon stamps") ||
            core.includes("end-afternoon stamps on the shared boundary day"),
          "skip/delete clear stamps by time window (shared boundary day)"
        );
        assert.ok(modals.includes("blockedCycleStarts") || modals.includes('status !== "skipped"'));
        assert.ok(core.includes("function applyManualResetDelete"));
        assert.ok(core.includes("function findManualClosedCycleIndex"));
        assert.ok(core.includes("function pruneDriftedManualClosedDuplicates"));
        assert.ok(core.includes("timezone-drifted History dates"));
        // Past closed windows must resolve via period bounds (not live-only).
        assert.ok(
          /function getWeeklyCycleBoundsForMoment[\s\S]*?getManualPeriodBoundsForDateStr\(task,\s*game,\s*"weeklies"/.test(core),
          "weekly bounds consult closed/live period by date"
        );
        assert.ok(
          /function getEndgameCycleBoundsForMoment[\s\S]*?getManualPeriodBoundsForDateStr\(task,\s*game,\s*"endgame"/.test(core),
          "endgame bounds consult closed/live period by date"
        );
        assert.ok(core.includes("function rehomeManualEndgameCompletionRange"));
        assert.ok(modals.includes("Phase 4: finish day/time"));
        assert.ok(
          read("src/08-page-attendance.js").includes("getTasksAvailableOnDate"),
          "History calendar paints via availability (bounds must include closed windows)"
        );
      })
    );

    checks.push(
      check("Source: extracurricular card Completes without repeating Dates/Currency", () => {
        const extra = read("src/08b-page-extracurricular.js");
        assert.ok(extra.includes("extracurricular-completed-row"));
        assert.ok(extra.includes("Dates/Currency live in dedicated rows below"));
        assert.ok(extra.includes("setExtracurricularCompletionMoment"));
        assert.ok(!/snippetParts\.push\(dateLine\)/.test(extra), "snippet no longer pushes dateLine");
        assert.ok(
          !/snippetParts\.push\("Potential: " \+ pot/.test(extra),
          "snippet no longer pushes Potential/Earned"
        );
      })
    );

    checks.push(
      check("Source: live probe + CSS expose finish/completed editors", () => {
        const main = read("src/12-main.js");
        const css = read("styles.css");
      assert.ok(main.includes("applyManualResetDelete"));
        assert.ok(main.includes("setCycleCompletionMoment"));
        assert.ok(main.includes("setExtracurricularCompletionMoment"));
        assert.ok(css.includes(".earnings-modal-finish-row"));
        assert.ok(css.includes(".earnings-modal-row-actions"));
        assert.ok(css.includes(".extracurricular-completed-row"));
      })
    );

    const failed = checks.filter((c) => !c.ok);
    return {
      ok: failed.length === 0,
      title: "History finish edits · manual bounds · extracurricular · calendar sync",
      checks,
    };
  },
};
