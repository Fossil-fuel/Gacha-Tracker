"use strict";

/**
 * Focused Games-tab date/time → calendar → Time Trends simulation.
 * Covers Completion History finish edits, Add-attempt-style completes,
 * extracurricular Completed editors, and simulated-clock date placement.
 */

const assert = require("../lib/assert");
const sim = require("../lib/sim-tracker");
const { listExtracurricularTimestampsForTimeTrends } = require("../lib/extracurricular-time-trends");

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

/** Attendance-style hour stack from stamp pool (mirrors Time Trends collector). */
function hourStackByType(stamps) {
  const out = {
    dailies: Array(24).fill(0),
    weeklies: Array(24).fill(0),
    endgame: Array(24).fill(0),
    extracurricular: Array(24).fill(0),
  };
  (stamps || []).forEach((t) => {
    const bucket = out[t.taskType];
    if (!bucket) return;
    const h = Math.max(0, Math.min(23, Number(t.hour)));
    if (Number.isFinite(h)) bucket[h]++;
  });
  return out;
}

function attendanceDayMarks(state, dateStr) {
  const day = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
  return {
    dailies: (day.dailies || []).slice(),
    weeklies: (day.weeklies || []).slice(),
    endgame: (day.endgame || []).slice(),
  };
}

module.exports = {
  name: "games-datetime-calendar-trends",
  title: "Games date/time edits → calendar · Time Trends",
  run() {
    const checks = [];

    checks.push(
      check("Games History finish: weekly remaps calendar + hour + DOW, not fill days", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);

        // Games → Completion History path: seed then edit Finished
        sim.markComplete(state, "weeklies", key, "2026-07-22", 10, 0);
        assert.ok(attendanceDayMarks(state, "2026-07-22").weeklies.includes(key), "seeded finish day");
        assert.ok(attendanceDayMarks(state, "2026-07-26").weeklies.includes(key), "seeded fill Sunday");

        const moved = sim.setCycleCompletionMoment(state, "weeklies", key, "2026-07-20", "2026-07-24", 21, 15);
        assert.equal(moved.ok, true);
        assert.equal(moved.dateStr, "2026-07-24");

        const old = attendanceDayMarks(state, "2026-07-22");
        const neu = attendanceDayMarks(state, "2026-07-24");
        assert.ok(!old.weeklies.includes(key), "old calendar finish cleared");
        assert.ok(neu.weeklies.includes(key), "new calendar finish marked");
        assert.ok(attendanceDayMarks(state, "2026-07-26").weeklies.includes(key), "fill from new finish remains");

        const events = sim.getTrendEvents(state, "weeklies", key);
        assert.equal(events.length, 1, "one Trends event");
        assert.equal(events[0].dateStr, "2026-07-24");
        assert.equal(events[0].hour, 21);
        const hours = sim.trendHourCounts(events);
        assert.equal(hours[21], 1);
        assert.equal(hours[10], 0, "old hour vacated");
        const dow = sim.trendDayOfWeekCounts(events);
        // 2026-07-24 = Friday
        assert.equal(dow[5], 1, "DOW Friday");
        assert.equal(dow[3], 0, "old Wednesday not counted");
        // Fill Sunday must not inflate DOW
        assert.equal(dow[0], 0, "Sunday fill not in Trends DOW");
      })
    );

    checks.push(
      check("Games Add-attempt style: endgame complete at chosen day/time hits Trends stack", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const eg = game.endgame.find((t) => t.id === "endgame_a");
        const key = sim.taskKey(game, eg);

        sim.markComplete(state, "endgame", key, "2026-07-10", 16, 45);
        assert.ok(attendanceDayMarks(state, "2026-07-10").endgame.includes(key), "calendar finish");

        const pool = state.completionTimestamps.filter(
          (t) => t.taskType === "endgame" && t.taskId === "endgame_a"
        );
        const stack = hourStackByType(pool);
        assert.equal(stack.endgame[16], 1, "hour stack 16");
        const events = sim.getTrendEvents(state, "endgame", key);
        assert.equal(sim.trendDayOfWeekCounts(events)[new Date("2026-07-10T12:00:00").getDay()], 1);
      })
    );

    checks.push(
      check("Simulated clock: offset day used as completion date lands calendar + Trends", () => {
        // Node mirror of Settings → Simulated time: pick "today" as real+offset.
        const state = sim.createFixture({ today: "2026-08-03" });
        state.simulatedDateOffset = 4;
        const simToday = "2026-08-07"; // today + 4 in this fixture narrative
        const game = sim.getGame(state);

        sim.markComplete(state, "dailies", game.id, simToday, 9, 20);
        assert.ok(attendanceDayMarks(state, simToday).dailies.includes(game.id), "calendar on sim day");
        assert.ok(
          !attendanceDayMarks(state, "2026-08-03").dailies.includes(game.id),
          "not stuck on unadvanced today"
        );
        const stamp = state.completionTimestamps.find(
          (t) => t.taskType === "dailies" && t.dateStr === simToday && t.hour === 9
        );
        assert.ok(stamp, "Trends stamp on simulated day");
        const stack = hourStackByType(state.completionTimestamps);
        assert.equal(stack.dailies[9], 1);
      })
    );

    checks.push(
      check("Rewind finish then re-advance: calendar + Trends follow latest edit", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 12, 0);
        sim.setCycleCompletionMoment(state, "weeklies", key, "2026-07-20", "2026-07-21", 8, 0);
        assert.equal(sim.historyCompletionDayInCycle(state, "weeklies", key, "2026-07-22"), "2026-07-21");
        sim.setCycleCompletionMoment(state, "weeklies", key, "2026-07-20", "2026-07-25", 22, 30);
        assert.equal(sim.historyCompletionDayInCycle(state, "weeklies", key, "2026-07-21"), "2026-07-25");
        assert.ok(!attendanceDayMarks(state, "2026-07-21").weeklies.includes(key), "mid edit cleared");
        assert.ok(attendanceDayMarks(state, "2026-07-25").weeklies.includes(key), "final finish marked");
        const events = sim.getTrendEvents(state, "weeklies", key);
        assert.equal(events.length, 1);
        assert.equal(events[0].dateStr, "2026-07-25");
        assert.equal(events[0].hour, 22);
        assert.equal(sim.trendHourCounts(events)[8], 0);
        assert.equal(sim.trendHourCounts(events)[22], 1);
      })
    );

    checks.push(
      check("Extracurricular Completed edit feeds Trends collector (filed times only)", () => {
        const state = sim.createFixture({ today: "2026-08-07" });
        state.extracurricularTasks = [
          {
            id: "evt_games",
            gameId: "g_sim",
            label: "Games Event",
            startDate: "2026-04-01",
            endDate: "2026-04-14",
            currency: 0,
          },
        ];
        state.extracurricularCompleted = { evt_games: true };
        state.extracurricularCompletedAt = { evt_games: "2026-04-10T15:00:00.000Z" };

        sim.setExtracurricularCompletionMoment(state, "evt_games", "2026-04-12", 18, 40);
        const trends = listExtracurricularTimestampsForTimeTrends(state, {
          getDatePartsInTimezone: () => ({ year: 2026, month: 3, day: 12, hour: 18, minute: 40 }),
        });
        assert.equal(trends.length, 1);
        assert.equal(trends[0].dateStr, "2026-04-12");
        assert.equal(trends[0].hour, 18);
        const stamp = state.completionTimestamps.find(
          (t) => t.taskType === "extracurricular" && t.taskId === "evt_games"
        );
        assert.ok(stamp && stamp.hour === 18 && stamp.dateStr === "2026-04-12");
        const stack = hourStackByType([stamp]);
        assert.equal(stack.extracurricular[18], 1);
      })
    );

    const failed = checks.filter((c) => !c.ok);
    return {
      ok: failed.length === 0,
      title: "Games date/time edits → calendar · Time Trends",
      checks,
    };
  },
};
