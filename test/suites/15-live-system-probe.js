"use strict";

/**
 * Live probe against the served app on localhost.
 * Requires: npm run dev (http://localhost:4000)
 *
 * Checks:
 * 1) HTTP smoke on the live server
 * 2) FIND source contracts against the *served* app.js (not just src/)
 * 3) Behavioral probe invariants via sim (parity with suite 14)
 */

const assert = require("../lib/assert");
const sim = require("../lib/sim-tracker");
const math = require("../lib/cycle-math");
const integrity = require("../lib/integrity-sim");

const BASE = process.env.GATCHA_TEST_URL || "http://localhost:4000";

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

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return res.text();
}

module.exports = {
  name: "live-system-probe",
  title: "Live system probe (served app.js + localhost)",
  async run() {
    const checks = [];
    let appJs = "";
    let html = "";

    try {
      html = await fetchText(BASE + "/");
      appJs = await fetchText(BASE + "/app.js");
      await fetchText(BASE + "/styles.css");
    } catch (err) {
      const skip = new Error(
        "SKIP: live server not reachable at " + BASE + " (" + err.message + "). Start with npm run dev."
      );
      skip.skip = true;
      throw skip;
    }

    checks.push(
      check("Live smoke: home brand + D/W/E tabs + app.js ref", () => {
        assert.ok(html.includes("Gacha Tracker"), "brand");
        assert.ok(html.includes('data-tab="dailies"'), "dailies");
        assert.ok(html.includes('data-tab="weeklies"'), "weeklies");
        assert.ok(html.includes('data-tab="endgame"'), "endgame");
        assert.ok(html.includes("app.js"), "app.js ref");
      })
    );

    checks.push(
      check("Live smoke: served app.js has completion + home", () => {
        assert.ok(appJs.includes("function recordCompletion"), "recordCompletion");
        assert.ok(appJs.includes("function renderHome"), "renderHome");
        assert.ok(appJs.includes("function applyTaskCompletion"), "applyTaskCompletion");
        assert.ok(appJs.includes("__gachaLiveProbe") || appJs.includes("liveProbe=1"), "liveProbe surface present in bundle");
      })
    );

    // ── Served-bundle FIND contracts (what the browser actually loads) ──
    checks.push(
      check("LIVE FIND #1/#7: remaining-from empty fallback does not replant boundary", () => {
        assert.ok(appJs.includes("Do not replant an excluded shared-boundary day"), "fix comment in served bundle");
        const fn = appJs.slice(
          appJs.indexOf("function getRemainingDatesInCycleFrom"),
          appJs.indexOf("function getCalendarDatesForBounds")
        );
        assert.ok(fn.includes("getRemainingDatesInCycleFrom"), "function present");
        assert.ok(!/filtered\.length \? filtered : \[fromDateStr\]/.test(fn), "old replant fallback gone");
        assert.ok(/return \[\]/.test(fn), "can return empty list");
      })
    );

    checks.push(
      check("LIVE FIND #2: toggleWeekly uses getTaskPeriodDateStr", () => {
        const usesPeriod = /function toggleWeekly[\s\S]{0,600}getTaskPeriodDateStr/.test(appJs);
        const usesRaw = /function toggleWeekly[\s\S]{0,400}const dateStr = getDateStr\(\)/.test(appJs);
        assert.ok(usesPeriod && !usesRaw, "toggleWeekly period dateStr");
      })
    );

    checks.push(
      check("LIVE FIND #3: endgame writes use getTaskPeriodDateStr", () => {
        const rawComplete = /function completeEndgameWithCurrency[\s\S]{0,300}const dateStr = getDateStr\(\)/.test(appJs);
        const rawToggle = /function toggleEndgame[\s\S]{0,300}const dateStr = getDateStr\(\)/.test(appJs);
        assert.ok(!rawComplete && !rawToggle, "endgame not raw getDateStr");
        assert.ok(/function completeEndgameWithCurrency[\s\S]{0,500}getTaskPeriodDateStr/.test(appJs), "complete uses period");
      })
    );

    checks.push(
      check("LIVE FIND #5: calendar availability uses owned dates helper", () => {
        assert.ok(appJs.includes("isWeeklyAvailableOnCalendarDate"), "calendar helper");
        assert.ok(
          /function getTasksAvailableOnDate[\s\S]{0,600}isWeeklyAvailableOnCalendarDate/.test(appJs),
          "getTasksAvailableOnDate wired"
        );
      })
    );

    checks.push(
      check("LIVE FIND #6: apply does not blanket isTaskCycleEnded", () => {
        const applyBlock = appJs.slice(
          appJs.indexOf("function applyTaskCompletion"),
          appJs.indexOf("function removeTaskCompletion")
        );
        assert.ok(!/isTaskCycleEnded/.test(applyBlock), "no blanket ended block");
        assert.ok(/getLastCycleBounds/.test(applyBlock), "gates via last cycle");
      })
    );

    // ── Behavioral probes (same fixtures as suite 14) ──
    checks.push(
      check("LIVE behavior: remaining-from-shared-day must not replant boundary", () => {
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
        const boundary =
          bounds.cycleEnd.getFullYear() +
          "-" +
          String(bounds.cycleEnd.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(bounds.cycleEnd.getDate()).padStart(2, "0");
        const remaining = math.getRemainingDatesInCycleFrom(bounds, boundary);
        assert.ok(!remaining.includes(boundary), "no boundary replant");
      })
    );

    checks.push(
      check("LIVE behavior: second complete same cycle does not bump tally", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 10);
        const c1 = Number(state.weekliesCompleted[key]) || 0;
        sim.markComplete(state, "weeklies", key, "2026-07-24", 15);
        assert.equal(Number(state.weekliesCompleted[key]) || 0, c1, "tally stable");
      })
    );

    checks.push(
      check("LIVE behavior: bleed → cleanup → sync → save/load clean", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markCompleteWithLegacyBoundaryBleed(state, "weeklies", key, "2026-07-28", 12);
        const now = new Date(2026, 7, 3, 10);
        assert.ok(sim.diagnoseAllResetDays(state, now).bleedCount >= 1, "bleed present");
        sim.cleanupCycleBoundaryBleedMarks(state, now);
        sim.syncAllTallies(state);
        const store = sim.createSaveStore();
        sim.saveState(store, state);
        const loaded = sim.loadState(store);
        assert.equal(sim.diagnoseAllResetDays(loaded, now).bleedCount, 0, "bleed cleared");
        assert.equal(
          (integrity.scanDataConflicts(loaded).counts.warn || 0) +
            (integrity.scanDataConflicts(loaded).counts.error || 0),
          0,
          "integrity clean"
        );
      })
    );

    checks.push(
      check("LIVE behavior: history uncheck while later cycle done", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const now = new Date(2026, 7, 3, 10);
        const task = game.weeklies[0];
        const key = sim.taskKey(game, task);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 12);
        sim.markComplete(state, "weeklies", key, "2026-07-29", 12);
        const res = sim.simulateCalendarDayUncheck(state, "weeklies", key, "2026-07-22", now);
        assert.equal(res.ok, true, "uncheck ok");
        assert.equal(sim.isCompletedInCycleForDate(state, "weeklies", key, "2026-07-22"), false);
        assert.equal(sim.isCompletedInCycleForDate(state, "weeklies", key, "2026-07-29"), true);
      })
    );

    checks.push(
      check("LIVE behavior: evening-start day one owned for calendar", () => {
        const task = {
          weekStartDay: 1,
          weekStartHour: 20,
          dateStarted: "2026-07-06",
          frequencyEvery: 1,
          frequencyUnit: "week",
          timeLimitEvery: 1,
          timeLimitUnit: "week",
        };
        const boundsEve = math.getCycleBoundsForMoment(task, new Date(2026, 6, 6, 21, 0));
        const owned = math.getCalendarDatesInCycleRange(
          boundsEve.cycleStart,
          boundsEve.cycleEnd,
          boundsEve.nextCycleStart
        );
        assert.ok(owned.includes("2026-07-06"), "owns start day");
      })
    );

    const failed = checks.filter((c) => !c.ok);
    return {
      ok: failed.length === 0,
      title: "Live system probe (served app.js + localhost)",
      checks,
    };
  },
};
