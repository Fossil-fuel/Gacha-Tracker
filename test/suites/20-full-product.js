"use strict";

/**
 * Product-wide regression: every website surface, every user write path,
 * and the invariant that Home / boards / History / Time Trends / Data / Games
 * stay consistent after any mutation. Not scoped to the last patch.
 */

const fs = require("fs");
const path = require("path");
const assert = require("../lib/assert");
const sim = require("../lib/sim-tracker");
const map = require("../lib/product-map");

const ROOT = path.join(__dirname, "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

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

function calendarMarked(state, type, key) {
  return Object.keys(state.completionByDate || {})
    .sort()
    .filter((ds) => (state.completionByDate[ds][type] || []).includes(key));
}

function hourOf(state, type, taskId, dateStr) {
  const hit = (state.completionTimestamps || []).find(
    (t) => t.taskType === type && t.taskId === taskId && t.dateStr === dateStr
  );
  return hit ? hit.hour : null;
}

/** After a write, Home + Games + Data + History + Trends must describe the same fact. */
function assertSurfacesAgree(state, type, key, cycleRef, expectComplete) {
  const snap = sim.getProductSnapshot(state);
  const cycleDone = sim.isCompletedInCycleForDate(state, type, key, cycleRef);
  assert.equal(cycleDone, expectComplete, type + " cycle @ " + cycleRef + " complete=" + expectComplete);

  if (type === "dailies") {
    if (cycleRef === state.today) {
      assert.equal(snap.home.dailies, expectComplete, "Home daily checkbox");
      assert.equal(snap.attendanceToday.dailies.includes(key), expectComplete, "Attendance today daily");
    }
    const stamps = (state.completionTimestamps || []).filter(
      (t) => t.taskType === "dailies" && t.gameId === key && t.dateStr === cycleRef
    );
    const marked = !!(state.completionByDate[cycleRef] && (state.completionByDate[cycleRef].dailies || []).includes(key));
    assert.equal(marked, expectComplete, "calendar daily mark");
    assert.equal(stamps.length >= 1, expectComplete, "Time Trends daily stamp");
    if (expectComplete) {
      assert.ok(snap.games.dailiesCompleted >= 1, "Games daily tally");
      assert.ok(snap.data.dailies.earned > 0, "Data daily earned");
    }
    return snap;
  }

  const homeRow =
    type === "weeklies"
      ? snap.home.weeklies.find((x) => x.key === key)
      : snap.home.endgame.find((x) => x.key === key);
  if (cycleRef === state.today && homeRow) {
    assert.equal(!!homeRow.completed, expectComplete, "Home " + type + " checkbox");
  }

  const events = sim.getTrendEvents(state, type, key);
  const marks = calendarMarked(state, type, key);
  const tally =
    type === "weeklies" ? Number(state.weekliesCompleted[key]) || 0 : Number(state.endgameCompleted[key]) || 0;
  const dataBucket = snap.data[type];

  if (expectComplete) {
    assert.ok(events.length >= 1, type + " Time Trends has a finish event");
    assert.ok(marks.length >= 1, type + " Attendance History has calendar marks");
    if (type !== "dailies" && marks.length > 1) {
      assert.ok(marks.length >= events.length, "fill-remaining paints History days; Trends counts finishes only");
    }
    assert.ok(tally >= 1, "Games tally bumped");
    assert.ok(dataBucket.earned > 0, "Data " + type + " earned");
  } else {
    const stillInThisCycle = marks.filter((ds) => {
      return sim.isCompletedInCycleForDate(state, type, key, ds);
    });
    if (tally === 0) {
      assert.equal(events.length, 0, type + " Trends empty when tally 0");
      assert.equal(marks.length, 0, type + " History empty when tally 0");
      assert.equal(dataBucket.earned, 0, "Data " + type + " earned 0");
    }
    void stillInThisCycle;
  }
  return snap;
}

module.exports = {
  name: "full-product",
  title: "Full product · every surface + write path stays consistent",
  run() {
    const checks = [];
    const html = read("index.html");
    const core = read("src/01-core.js");
    const main = read("src/12-main.js");
    const extracted = map.extractFromHtml(html);

    checks.push(
      check("Product map: sidebar tabs match index.html", () => {
        assert.equal(extracted.tabs, map.expectedSidebarTabs(), "data-tab set");
      })
    );

    checks.push(
      check("Product map: panels match index.html", () => {
        assert.equal(extracted.panels, map.expectedPanels(), "panel-* set");
      })
    );

    checks.push(
      check("Product map: modals match index.html", () => {
        assert.equal(extracted.modals, map.expectedModals(), "modal id set");
      })
    );

    checks.push(
      check("Product map: subviews (Extra History, Attendance History, Time Trends)", () => {
        map.SUBVIEWS.forEach((v) => {
          assert.ok(html.includes(v.needle), "missing " + v.id);
        });
      })
    );

    checks.push(
      check("Product map: every tab has a renderer dispatched by renderActiveTab + renderAll", () => {
        map.expectedRenders().forEach((fn) => {
          assert.ok(main.includes(fn + "()"), "12-main.js must call " + fn);
          assert.ok(main.includes("case \"" + map.TABS.find((t) => t.render === fn).id + "\""), "switch case for " + fn);
        });
      })
    );

    checks.push(
      check("Product map: every write path still exists in source", () => {
        map.WRITE_PATHS.forEach((w) => {
          const src = w.file === "src/01-core.js" ? core : read(w.file);
          assert.ok(src.includes(w.name), w.file + " must contain " + w.name);
        });
      })
    );

    checks.push(
      check("Playthrough: daily → weekly → endgame → extra agree on Home, History, Trends, Data, Games", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        const eKey = sim.taskKey(game, game.endgame[0]);
        state.extracurricularTasks = [
          {
            id: "evt_stage",
            gameId: game.id,
            label: "Stage event",
            startDate: "2026-07-01",
            endDate: "2026-08-31",
            currency: 40,
          },
        ];

        let snap = sim.getProductSnapshot(state);
        assert.equal(snap.home.dailies, false, "Home daily starts incomplete");
        assert.equal(snap.games.dailiesCompleted, 0, "Games daily tally 0");
        assert.equal(snap.data.total.earned, 0, "Data earned 0");
        assert.equal(snap.trends.dailyStamps, 0, "Trends no daily stamps");

        sim.markComplete(state, "dailies", game.id, "2026-08-03", 14, 5);
        snap = assertSurfacesAgree(state, "dailies", game.id, "2026-08-03", true);
        assert.equal(hourOf(state, "dailies", "", "2026-08-03"), 14, "Trends daily hour 14");

        const wFinish = sim.markComplete(state, "weeklies", wKey, "2026-08-03", 19, 0);
        snap = assertSurfacesAgree(state, "weeklies", wKey, "2026-08-03", true);
        const wMarks = calendarMarked(state, "weeklies", wKey);
        assert.ok(wMarks.length > 1, "weekly fill-remaining on Attendance History");
        assert.equal(sim.getTrendEvents(state, "weeklies", wKey).length, 1, "Trends counts one weekly finish");
        assert.equal(sim.historyCompletionDayInCycle(state, "weeklies", wKey, wFinish), wFinish);
        assert.ok(snap.home.weeklies.find((x) => x.key === wKey).completed, "Home weekly done");

        const eFinish = sim.markComplete(state, "endgame", eKey, "2026-08-03", 21, 30);
        snap = assertSurfacesAgree(state, "endgame", eKey, "2026-08-03", true);
        assert.ok(calendarMarked(state, "endgame", eKey).length >= 1, "endgame History marks");
        assert.equal(sim.getTrendEvents(state, "endgame", eKey).length, 1, "Trends one endgame finish");
        assert.ok(snap.home.endgame.find((x) => x.key === eKey).completed, "Home endgame done");

        const extra = sim.completeExtracurricular(state, "evt_stage", "2026-08-03", 16, 45);
        assert.equal(extra.ok, true, "extra complete");
        snap = sim.getProductSnapshot(state);
        assert.equal(snap.home.extracurricular[0], true, "Home extra done");
        assert.equal(snap.trends.extraStamps, 1, "Time Trends extra stamp");
        assert.equal(hourOf(state, "extracurricular", "evt_stage", "2026-08-03"), 16);

        // Incomplete weekly from the board/calendar must unwind History + Trends + Data + Home
        sim.markIncomplete(state, "weeklies", wKey, "2026-08-03");
        assertSurfacesAgree(state, "weeklies", wKey, "2026-08-03", false);
        snap = sim.getProductSnapshot(state);
        assert.equal(snap.home.weeklies.find((x) => x.key === wKey).completed, false, "Home weekly undone");
        assert.ok(snap.home.dailies, "daily still done after weekly undo");
        assert.ok(snap.home.endgame.find((x) => x.key === eKey).completed, "endgame still done");

        const undone = sim.undoLast(state);
        assert.ok(undone && undone.ok, "undo restores weekly");
        assertSurfacesAgree(state, "weeklies", wKey, "2026-08-03", true);

        // History finish-day move: calendar + Trends hour/DOW move; Games tally and Data stay
        const tallyBefore = Number(state.weekliesCompleted[wKey]) || 0;
        const dataBefore = sim.getDataTotals(state).weeklies.earned;
        const moved = sim.setCycleCompletionMoment(state, "weeklies", wKey, "2026-08-03", "2026-08-05", 11, 0);
        assert.equal(moved.ok, true, "finish move ok");
        assert.equal(moved.dateStr, "2026-08-05");
        assert.equal(Number(state.weekliesCompleted[wKey]) || 0, tallyBefore, "Games tally unchanged");
        assert.equal(sim.getDataTotals(state).weeklies.earned, dataBefore, "Data earned unchanged");
        assert.ok(!calendarMarked(state, "weeklies", wKey).includes("2026-08-03"), "History old finish day cleared");
        assert.ok(calendarMarked(state, "weeklies", wKey).includes("2026-08-05"), "History new finish day");
        assert.equal(hourOf(state, "weeklies", "weekly_a", "2026-08-05"), 11, "Trends hour follows finish");
        assert.equal(sim.getTrendEvents(state, "weeklies", wKey).length, 1, "still one Trends event");

        // Save → load must restore every surface
        const store = sim.createSaveStore();
        sim.saveState(store, state);
        const loaded = sim.loadState(store);
        loaded.today = "2026-08-03";
        const beforeSnap = sim.getProductSnapshot(state);
        const afterSnap = sim.getProductSnapshot(loaded);
        assert.equal(afterSnap.home.dailies, beforeSnap.home.dailies, "load Home daily");
        assert.equal(afterSnap.games.dailiesCompleted, beforeSnap.games.dailiesCompleted, "load Games daily");
        assert.equal(afterSnap.data.total.earned, beforeSnap.data.total.earned, "load Data total");
        assert.equal(afterSnap.trends.weeklies[wKey], beforeSnap.trends.weeklies[wKey], "load Trends weekly");
        assert.equal(afterSnap.trends.endgame[eKey], beforeSnap.trends.endgame[eKey], "load Trends endgame");
        assert.equal(afterSnap.home.extracurricular[0], true, "load Home extra");
        assert.equal(afterSnap.trends.extraStamps, 1, "load extra Trends");

        void eFinish;
      })
    );

    checks.push(
      check("Playthrough: History skip → Mark completed restores History + Trends + Data + Games", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        const res = sim.commitScheduledSkipToComplete(state, "weeklies", wKey, {
          finishDateStr: "2026-07-22",
          hour: 13,
          minute: 0,
        });
        assert.equal(res.ok, true);
        assertSurfacesAgree(state, "weeklies", wKey, "2026-07-22", true);
        assert.equal(hourOf(state, "weeklies", "weekly_a", "2026-07-22"), 13);
        assert.ok(calendarMarked(state, "weeklies", wKey).length > 1, "fill after Mark completed");
      })
    );

    checks.push(
      check("Playthrough: overdue manual endgame complete/uncomplete from today hits every surface", () => {
        const state = sim.createFixture({ today: "2026-08-18" });
        const game = sim.getGame(state);
        const umbral = {
          id: "umbral_board",
          label: "Umbral Monument",
          weekStartHour: 4,
          weekStartMinute: 0,
          dateStarted: "2026-07-17",
          manualReset: true,
          manualDueDateStr: "2026-08-01",
          manualDueHour: 4,
          manualDueMinute: 0,
          currency: 1200,
          manualClosedCycles: [],
        };
        game.endgame.push(umbral);
        const key = sim.taskKey(game, umbral);
        state.endgameCompleted[key] = 0;

        const finish = sim.markComplete(state, "endgame", key, "2026-08-18", 15, 0);
        assert.ok(finish <= "2026-08-01", "board complete clamps off today onto last owned day");
        const snap = sim.getProductSnapshot(state);
        assert.equal(
          snap.home.endgame.find((x) => x.key === key).completed,
          true,
          "Home still lists overdue manual as complete"
        );
        assert.ok((Number(state.endgameCompleted[key]) || 0) === 1, "Games tally");
        assert.ok(sim.getDataTotals(state).endgame.earned >= 1200, "Data earned");
        assert.ok(calendarMarked(state, "endgame", key).length >= 1, "Attendance History fill");
        assert.equal(sim.getTrendEvents(state, "endgame", key).length, 1, "Time Trends one event");
        assert.ok(
          !calendarMarked(state, "endgame", key).includes("2026-08-18"),
          "today itself is not a History mark outside the window"
        );

        sim.markIncomplete(state, "endgame", key, "2026-08-18");
        const after = sim.getProductSnapshot(state);
        assert.equal(after.home.endgame.find((x) => x.key === key).completed, false, "Home incomplete");
        assert.equal(Number(state.endgameCompleted[key]) || 0, 0, "Games tally 0");
        assert.equal(calendarMarked(state, "endgame", key).length, 0, "History cleared");
        assert.equal(sim.getTrendEvents(state, "endgame", key).length, 0, "Trends cleared");
      })
    );

    checks.push(
      check("Playthrough: History Delete + Skip keep Games/Data/History/Trends in lockstep", () => {
        const state = sim.createFixture({ today: "2026-08-18" });
        const game = sim.getGame(state);
        const task = {
          id: "history_manual",
          label: "History Manual",
          manualReset: true,
          dateStarted: "2026-07-17",
          manualDueDateStr: "2026-08-01",
          weekStartHour: 4,
          weekStartMinute: 0,
          currency: 500,
          manualClosedCycles: [
            { start: "2026-02-08", end: "2026-02-26", completed: 1 },
            { start: "2026-02-11", end: "2026-02-26", completed: 1 },
          ],
        };
        game.endgame.push(task);
        const key = sim.taskKey(game, task);
        state.endgameCompleted[key] = 2;
        state.endgameCurrencyEarned[game.id] = { history_manual: [500, 500] };
        ["2026-02-11", "2026-02-20", "2026-02-26"].forEach((ds) => {
          const day = state.completionByDate[ds] || { dailies: [], weeklies: [], endgame: [] };
          if (!day.endgame.includes(key)) day.endgame.push(key);
          state.completionByDate[ds] = day;
        });
        state.completionTimestamps.push({
          dateStr: "2026-02-11",
          hour: 12,
          minute: 0,
          gameId: game.id,
          taskType: "endgame",
          taskId: "history_manual",
          taskLabel: "History Manual",
        });

        const skipped = sim.commitEarningsHistoryDraft(state, game.id, "history_manual", [
          {
            origStatus: "completed",
            status: "skipped",
            origStartStr: "2026-02-08",
            origEndStr: "2026-02-26",
            startStr: "2026-02-10",
            endStr: "2026-02-26",
            origFinishDateStr: "2026-02-11",
            finishDateStr: "2026-02-11",
            hour: 12,
            minute: 0,
            origHour: 12,
            origMinute: 0,
            earned: 500,
            origEarned: 500,
          },
        ]);
        assert.equal(skipped.ok, true, "Skip Save ok");
        const sibling = task.manualClosedCycles.find((c) => c.start === "2026-02-11" && c.end === "2026-02-26");
        assert.ok(sibling && sibling.completed === 1, "overlapping sibling cycle stays completed");
        const skippedRow = task.manualClosedCycles.find((c) => c.start === "2026-02-08");
        assert.ok(skippedRow && skippedRow.completed === 0, "target cycle skipped");
        assert.equal(Number(state.endgameCompleted[key]) || 0, 1, "Games tally after one skip");
        assert.ok(
          !task.manualClosedCycles.some((c) => c.start === "2026-02-10" && !c.completed),
          "no drifted skipped twin"
        );

        const deleted = sim.commitEarningsHistoryDraft(state, game.id, "history_manual", [
          {
            origStatus: "completed",
            status: "deleted",
            origStartStr: "2026-02-11",
            origEndStr: "2026-02-26",
            startStr: "2026-02-11",
            endStr: "2026-02-26",
            origFinishDateStr: "2026-02-11",
            finishDateStr: "2026-02-11",
            hour: 12,
            minute: 0,
            origHour: 12,
            origMinute: 0,
            earned: 500,
            origEarned: 500,
          },
        ]);
        assert.equal(deleted.ok, true, "Delete Save ok");
        assert.ok(
          !task.manualClosedCycles.some((c) => c.start === "2026-02-11" && c.completed),
          "deleted cycle gone from archive"
        );
        assert.equal(calendarMarked(state, "endgame", key).length, 0, "History marks cleared after Delete");
        assert.equal(sim.getTrendEvents(state, "endgame", key).length, 0, "Trends cleared after Delete");
      })
    );

    checks.push(
      check("Playthrough: sync tallies from calendar does not desync Data vs Games vs History", () => {
        const state = sim.createFixture({ today: "2026-08-03" });
        const game = sim.getGame(state);
        const wKey = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "dailies", game.id, "2026-08-03", 9, 0);
        sim.markComplete(state, "weeklies", wKey, "2026-07-22", 10, 0);
        const before = sim.getProductSnapshot(state);
        sim.syncAllTallies(state);
        const after = sim.getProductSnapshot(state);
        assert.equal(after.games.dailiesCompleted, before.games.dailiesCompleted, "daily tally stable");
        assert.equal(after.trends.weeklies[wKey], before.trends.weeklies[wKey], "weekly trends stable");
        assert.ok(after.data.weeklies.earned > 0, "Data still has weekly earned");
        assert.ok(calendarMarked(state, "weeklies", wKey).length > 1, "History fill intact");
      })
    );

    const failed = checks.filter((c) => !c.ok);
    return {
      ok: failed.length === 0,
      title: "Full product · every surface + write path stays consistent",
      checks,
    };
  },
};
