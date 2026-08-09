"use strict";

const assert = require("../lib/assert");
const fs = require("fs");
const path = require("path");
const { splitAutoHistoryForManualConvert } = require("../lib/reset-mode-convert");

const ROOT = path.join(__dirname, "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

module.exports = {
  name: "reset-mode-convert",
  title: "Auto ↔ manual reset conversion",
  run() {
    const now = new Date("2026-08-07T15:00:00");
    const history = [
      {
        periodStart: new Date("2026-02-11T04:00:00"),
        periodEnd: new Date("2026-03-25T04:00:00"),
        completed: 1,
      },
      {
        periodStart: new Date("2026-03-25T04:00:00"),
        periodEnd: new Date("2026-05-06T04:00:00"),
        completed: 1,
      },
      {
        periodStart: new Date("2026-05-06T04:00:00"),
        periodEnd: new Date("2026-06-17T04:00:00"),
        completed: 0,
      },
      {
        periodStart: new Date("2026-06-17T04:00:00"),
        periodEnd: new Date("2026-07-29T04:00:00"),
        completed: 1,
      },
      {
        periodStart: new Date("2026-07-29T04:00:00"),
        periodEnd: new Date("2026-09-09T04:00:00"),
        completed: 1,
      },
    ];

    const { closed, current } = splitAutoHistoryForManualConvert(history, now);
    assert.equal(closed.length, 4, "past cycles archive to closed (4 finished windows)");
    assert.ok(current, "in-progress cycle stays as live manual window");
    assert.equal(current.periodStart.getTime(), history[4].periodStart.getTime(), "current is latest open window");
    assert.equal(closed.filter((c) => c.completed === 1).length, 3, "completed flags preserved on closed rows");
    assert.equal(closed.filter((c) => c.completed === 0).length, 1, "skipped cycle preserved as completed:0");
    assert.equal(closed[0].start, "2026-02-11", "closed start date formatted");
    assert.equal(closed[0].end, "2026-03-25", "closed end date formatted");

    const empty = splitAutoHistoryForManualConvert([], now);
    assert.equal(empty.closed.length, 0, "empty history → no closed");
    assert.equal(empty.current, null, "empty history → no current");

    const core = read("src/01-core.js");
    assert.ok(core.includes("Does NOT open a new window, bump attempts, or clear calendar marks"), "convert-to-manual must avoid Start-window side effects");
    assert.ok(core.includes("task.countFromDateStarted = true"), "convert-to-auto anchors skip grid via countFromDateStarted");
    assert.ok(
      core.includes("getEndgameCycleDatesForDate used to return only the live window"),
      "completed periods must not collapse onto the live manual window"
    );
    assert.ok(
      core.includes("does NOT snap back to weekStartDay"),
      "closed-cycle moments must not snap to live weekStartDay"
    );
    assert.ok(core.includes("repairManualResetHistoryCollapse"), "schema migration recovers collapsed manual history");
    assert.ok(core.includes("SCHEMA_VERSION = 3"), "schema v3 runs manual history collapse repair");

    const games = read("src/03-games.js");
    assert.ok(games.includes("convertingToManual"), "task save detects scheduled→manual convert");
    assert.ok(games.includes("convertingToAuto"), "task save detects manual→scheduled convert");
    assert.ok(games.includes("convertScheduledTaskToManualReset"), "task save calls convertScheduledTaskToManualReset");
    assert.ok(games.includes("convertManualResetTaskToScheduled"), "task save calls convertManualResetTaskToScheduled");
    assert.ok(core.includes("rehomeManualEndgameCompletionRange"), "history date edits must rehome manual closed cycles");
    assert.ok(core.includes("function setCycleCompletionMoment"), "finish day/time edits for cycle tasks");
    assert.ok(core.includes("Only applies for manual-reset endgame"), "cycle Start/End edits locked to manual-reset");
    assert.ok(core.includes("function setExtracurricularCompletionMoment"), "extracurricular completed moment edits");
    assert.ok(core.includes("function getManualPeriodBoundsForDateStr"), "manual finish edits use closed-cycle bounds");
    assert.ok(core.includes("function getTaskDefaultEndTimeParts"), "Cycle end time seeds Manual Reset due clock");

    const modals = read("src/02-modals.js");
    assert.ok(modals.includes("appendEarningsFinishEditors"), "Completion History exposes Finished editors");
    assert.ok(modals.includes("Cycle Start/End edits are manual-reset only"), "scheduled tasks hide Start/End editors");
    assert.ok(modals.includes("function saveEarningsModal"), "Completion History defers writes until Save");
    assert.ok(modals.includes("flushEarningsModalDraftFromDom"), "Save flushes focused editors into draft");
    assert.ok(modals.includes("setCycleCompletionMoment("), "history Save wires finish edits");
    assert.ok(core.includes("function getManualResetEndMomentOnDate"), "closed cycles use end clock not start clock");
    assert.ok(modals.includes("Mark skipped") && modals.includes("Mark completed"), "manual completed↔skipped toggle");
    assert.ok(
      modals.includes("getTaskDefaultEndTimeParts"),
      "Manual Reset Start menu seeds Due time from Cycle end time default"
    );
    assert.ok(
      (() => {
        const openFn = modals.slice(
          modals.indexOf("function openManualResetModal"),
          modals.indexOf("function closeManualResetModal")
        );
        return !/dueTime\.value =[\s\S]{0,120}now\.getHours\(\)/.test(openFn);
      })(),
      "Manual Reset Due time default must not be wall-clock now"
    );

    const extra = read("src/08b-page-extracurricular.js");
    assert.ok(extra.includes("extracurricular-completed-row"), "extracurricular cards show Completed row");
    assert.ok(extra.includes("setExtracurricularCompletionMoment"), "extracurricular Completed editors wired");
    assert.ok(
      extra.includes("Dates/Currency live in dedicated rows below"),
      "extracurricular snippet must not repeat Dates/Currency"
    );

    assert.ok(
      core.includes("Uses the exact dateStarted day — does NOT snap to weekStartDay"),
      "live manual bounds must not snap dateStarted via getEndgameAnchorDate"
    );
    assert.ok(core.includes("function applyManualResetSkip"), "manual Add Attempt can skip a window");
    assert.ok(core.includes("function applyScheduledCycleSkip"), "scheduled Add Attempt can skip a cycle");
    assert.ok(modals.includes("syncManualCompletionOutcomeUI"), "Add Attempt modal toggles Completed/Skipped fields");
    assert.ok(modals.includes('getManualCompletionOutcome() === "skipped"'), "confirm path handles skipped attempts");

    const gamesPage = read("src/10-page-games.js");
    assert.ok(gamesPage.includes('textContent = "Add Attempt"'), "Games weeklies/endgame button says Add Attempt");
    assert.ok(gamesPage.includes('textContent = "Add completion"'), "Games dailies keep Add completion");

    assert.ok(
      /Restore live window[\s\S]*syncEndgameCompletionDatesFromCalendar/.test(core),
      "past manual completions sync stored dates after restoring the live window"
    );

    // Pure scenario: skipped closed row + live completion rehome → earned becomes past range, not skipped.
    {
      const closed = [
        { start: "2026-03-20", end: "2026-04-24", completed: 0 },
      ];
      // Simulate rehome destination absorb + completed flag
      const dest = { start: "2026-03-20", end: "2026-04-24", completed: 0 };
      const fromLive = { start: "2026-07-17", end: "2026-08-19" };
      // Absorb skip
      for (let i = closed.length - 1; i >= 0; i--) {
        if (closed[i].start === dest.start && closed[i].end === dest.end) closed.splice(i, 1);
      }
      closed.push({ start: dest.start, end: dest.end, completed: 1 });
      assert.equal(closed.length, 1, "destination skip absorbed into one completed closed row");
      assert.equal(closed[0].completed, 1, "entered past window is completed, not skipped");
      assert.ok(
        !(fromLive.start === closed[0].start && fromLive.end === closed[0].end),
        "live open cycle must not be the stored completion bounds"
      );
    }

    assert.ok(
      games.includes("const openManual = manualReset && existingIdx < 0"),
      "converted existing tasks must not open Start modal (only brand-new manual tasks)"
    );
  },
};
