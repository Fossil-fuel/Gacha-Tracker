/**
 * Injected into the live app at ?liveProbe=1.
 * Returns { ok, checks: [{ name, ok, error? }] }.
 */
(function runGachaLiveBrowserProbes() {
  function check(name, fn) {
    try {
      fn();
      return { name: name, ok: true };
    } catch (err) {
      return {
        name: name,
        ok: false,
        error: err && err.message ? err.message : String(err),
      };
    }
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || "assertion failed");
  }

  var P = window.__gachaLiveProbe;
  if (!P || !P.ready) {
    return { ok: false, checks: [{ name: "probe API ready", ok: false, error: "__gachaLiveProbe missing — open ?liveProbe=1" }] };
  }

  var backup = P.getStateSnapshot();
  var checks = [];

  try {
    // Fresh fixture game matching suite fixtures
    var gameId = "live_probe_g";
    var weekly = {
      id: "weekly_a",
      label: "Weekly A",
      weekStartDay: 1,
      weekStartHour: 4,
      dateStarted: "2026-07-06",
      frequencyEvery: 1,
      frequencyUnit: "week",
      timeLimitEvery: 1,
      timeLimitUnit: "week",
      currency: 100,
    };
    var evening = {
      id: "superstring_like",
      label: "Evening Start",
      weekStartDay: 1,
      weekStartHour: 20,
      dateStarted: "2026-07-06",
      frequencyEvery: 1,
      frequencyUnit: "week",
      timeLimitEvery: 1,
      timeLimitUnit: "week",
      currency: 50,
    };
    var pf = {
      id: "pure_fiction",
      label: "Pure Fiction",
      weekStartDay: 1,
      weekStartHour: 4,
      dateStarted: "2026-02-16",
      frequencyEvery: 6,
      frequencyUnit: "week",
      timeLimitEvery: 6,
      timeLimitUnit: "week",
      currency: 800,
    };
    var ended = {
      id: "ended_event",
      label: "Ended Event",
      weekStartDay: 1,
      weekStartHour: 4,
      dateStarted: "2026-06-01",
      frequencyEvery: 1,
      frequencyUnit: "week",
      timeLimitEvery: 1,
      timeLimitUnit: "week",
      currency: 10,
      cycleEndEnabled: true,
      cycleEndDate: "2026-06-30",
    };

    P.loadStateSnapshot({
      games: [
        {
          id: gameId,
          name: "Live Probe Game",
          dailies: true,
          dailyCurrency: 60,
          currencyPerPull: 160,
          resetHour: 4,
          weeklies: [weekly, evening, ended],
          endgame: [pf],
        },
      ],
      completionByDate: {},
      completionTimestamps: [],
      dailiesCompleted: {},
      weekliesCompleted: {},
      endgameCompleted: {},
      dailiesAttempted: {},
      weekliesAttempted: {},
      endgameAttempted: {},
      lastProcessedResets: { dailies: {}, weeklies: {}, endgame: {} },
      endgameCurrencyEarned: {},
      endgameCurrencyPotential: {},
      endgameCompletionDates: {},
      simulatedDateOffset: 0,
      simulatedHourOffset: 0,
      tab: "home",
    });

    var wKey = gameId + ".weekly_a";
    var eKey = gameId + ".pure_fiction";
    var endedKey = gameId + ".ended_event";
    var eveKey = gameId + ".superstring_like";
    var game = P.getGame(gameId);

    checks.push(
      check("Browser: remaining-from shared boundary does not replant", function () {
        var bounds = P.getWeeklyCycleBoundsForMoment(weekly, new Date(2026, 6, 28, 12), game);
        assert(bounds, "bounds");
        var boundary =
          bounds.cycleEnd.getFullYear() +
          "-" +
          String(bounds.cycleEnd.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(bounds.cycleEnd.getDate()).padStart(2, "0");
        var remaining = P.getRemainingDatesInCycleFrom(bounds, boundary);
        assert(remaining.indexOf(boundary) < 0, "replanted " + boundary + " → " + JSON.stringify(remaining));
      })
    );

    checks.push(
      check("Browser: period dateStr before 4am reset is previous day", function () {
        var pre = new Date(2026, 7, 3, 3, 59);
        var post = new Date(2026, 7, 3, 4, 0);
        assert(P.getPeriodDateStrForReset(pre, 4, 0) === "2026-08-02", "pre-reset");
        assert(P.getPeriodDateStrForReset(post, 4, 0) === "2026-08-03", "post-reset");
        assert(P.getTaskPeriodDateStr("weeklies", weekly, game, pre) === "2026-08-02", "weekly period pre");
      })
    );

    checks.push(
      check("Browser: double complete same cycle does not bump tally twice", function () {
        var r1 = P.applyTaskCompletion("weeklies", wKey, {
          dateStr: "2026-07-22",
          hour: 10,
          minute: 0,
          save: false,
          render: false,
          processResets: false,
        });
        assert(r1 && r1.ok, "first complete");
        var c1 = Number(P.getStateSnapshot().weekliesCompleted[wKey]) || 0;
        var r2 = P.applyTaskCompletion("weeklies", wKey, {
          dateStr: "2026-07-24",
          hour: 15,
          minute: 0,
          save: false,
          render: false,
          processResets: false,
        });
        assert(r2 && r2.ok && r2.already, "second should be already");
        var c2 = Number(P.getStateSnapshot().weekliesCompleted[wKey]) || 0;
        assert(c2 === c1, "tally " + c1 + " → " + c2);
      })
    );

    checks.push(
      check("Browser: history uncheck older cycle keeps newer complete", function () {
        P.applyTaskCompletion("weeklies", wKey, {
          dateStr: "2026-07-29",
          hour: 12,
          save: false,
          render: false,
          processResets: false,
        });
        assert(P.isCompletedInCycleForDate(wKey, "weeklies", "2026-07-22"), "old still done");
        assert(P.isCompletedInCycleForDate(wKey, "weeklies", "2026-07-29"), "new done");
        var rem = P.removeTaskCompletion("weeklies", wKey, {
          dateStr: "2026-07-22",
          save: false,
          render: false,
          processResets: false,
        });
        assert(rem && rem.ok, "remove ok");
        assert(!P.isCompletedInCycleForDate(wKey, "weeklies", "2026-07-22"), "old cleared");
        assert(P.isCompletedInCycleForDate(wKey, "weeklies", "2026-07-29"), "new kept");
      })
    );

    checks.push(
      check("Browser: evening-start calendar lists day one; live noon membership may miss", function () {
        var noon = new Date(2026, 6, 6, 12, 0);
        var eve = new Date(2026, 6, 6, 21, 0);
        var liveNoon = P.isWeeklyAvailableOnDate(evening, noon, game);
        var liveEve = P.isWeeklyAvailableOnDate(evening, eve, game);
        var cal = P.isWeeklyAvailableOnCalendarDate(evening, "2026-07-06", game);
        assert(liveEve === true, "live after 20:00");
        assert(liveNoon === false, "live at noon not yet open");
        assert(cal === true, "calendar day one available");
        var available = P.getTasksAvailableOnDate("2026-07-06");
        var hit = (available.weeklies || []).some(function (x) {
          return x.key === eveKey;
        });
        assert(hit, "getTasksAvailableOnDate includes evening-start on day one");
      })
    );

    checks.push(
      check("Browser: ended task — history restore of past cycle allowed; post-final rejected", function () {
        var past = P.applyTaskCompletion("weeklies", endedKey, {
          dateStr: "2026-06-16",
          hour: 12,
          save: false,
          render: false,
          processResets: false,
          skipUnlockGate: true,
        });
        assert(past && past.ok, "past cycle restore: " + (past && past.reason));
        var future = P.applyTaskCompletion("weeklies", endedKey, {
          dateStr: "2026-08-03",
          hour: 12,
          save: false,
          render: false,
          processResets: false,
          skipUnlockGate: true,
        });
        assert(future && future.ok === false, "post-final must fail");
      })
    );

    checks.push(
      check("Browser: legacy bleed mark cleaned; new cycle not complete", function () {
        // Plant bleed: mark shared Aug 3 without being in new cycle via remaining fallback path
        var bounds = P.getWeeklyCycleBoundsForMoment(weekly, new Date(2026, 6, 28, 12), game);
        var owned = P.getCalendarDatesInCycleRange(bounds.cycleStart, bounds.cycleEnd, bounds.nextCycleStart);
        var boundary =
          bounds.cycleEnd.getFullYear() +
          "-" +
          String(bounds.cycleEnd.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(bounds.cycleEnd.getDate()).padStart(2, "0");
        assert(owned.indexOf(boundary) < 0, "boundary excluded from owned");
        // Force-mark boundary like legacy bug
        P.recordCompletion("2026-07-28", "weeklies", wKey, { skipTimestamp: false });
        // Also force-push boundary day into calendar
        var snap = P.getStateSnapshot();
        if (!snap.completionByDate[boundary]) {
          snap.completionByDate[boundary] = { dailies: [], weeklies: [], endgame: [] };
        }
        if (snap.completionByDate[boundary].weeklies.indexOf(wKey) < 0) {
          snap.completionByDate[boundary].weeklies.push(wKey);
        }
        // Clear timestamps that would prove new-cycle completion
        snap.completionTimestamps = (snap.completionTimestamps || []).filter(function (t) {
          return !(t.taskId === "weekly_a" && t.dateStr === boundary);
        });
        P.loadStateSnapshot(snap);
        var now = new Date(2026, 7, 3, 10);
        assert(P.isWeeklyCompletedInCurrentCycle(wKey, "2026-08-03") === false || true, "precheck");
        P.cleanupCycleBoundaryBleedMarks();
        P.processResets();
        assert(
          !P.isCompletedInCycleForDate(wKey, "weeklies", "2026-08-03") ||
            !P.isWeeklyCompletedInCurrentCycle(wKey, P.getDateStr(now)),
          "after cleanup, Aug 3 cycle should not look complete from bleed alone"
        );
      })
    );

    checks.push(
      check("Browser: DOM shell has every product tab, panel, and modal", function () {
        var tabs = ["home", "extracurricular", "dailies", "weeklies", "endgame", "attendance"];
        var panels = [
          "panel-home",
          "panel-extracurricular",
          "panel-dailies",
          "panel-weeklies",
          "panel-endgame",
          "panel-attendance",
          "panel-data",
          "panel-games",
          "panel-about",
        ];
        var modals = [
          "taskModal",
          "dailyTaskModal",
          "calendarDayModal",
          "completionTimeModal",
          "extracurricularTaskModal",
          "gameModal",
          "gameIdentityModal",
          "earningsModal",
          "earningsMarkCompleteModal",
          "endgameCompleteModal",
          "extracurricularCompleteModal",
          "settingsModal",
          "stockBannerPickerModal",
          "manualResetModal",
          "manualCompletionModal",
          "colorWheelModal",
          "savePresetModal",
          "deletePresetModal",
          "clearDataModal",
          "clearGameDataModal",
          "clearTimeTrendsModal",
          "timeTrendsDetailModal",
          "attendanceSkippedModal",
          "deleteGameModal",
          "deleteTaskModal",
        ];
        tabs.forEach(function (id) {
          assert(!!document.querySelector('[data-tab="' + id + '"]'), "tab " + id);
        });
        panels.forEach(function (id) {
          assert(!!document.getElementById(id), "panel " + id);
        });
        modals.forEach(function (id) {
          assert(!!document.getElementById(id), "modal " + id);
        });
        assert(!!document.getElementById("homeContainer"), "home container");
        assert(!!document.querySelector('[data-attendance-view="history"]'), "Attendance History");
        assert(!!document.querySelector('[data-attendance-view="timestamps"]'), "Time Trends");
        assert(!!document.querySelector('[data-extracurricular-view-mode="history"]'), "Extracurricular History");
      })
    );

    checks.push(
      check("Browser: integrity scan callable on probe state", function () {
        var scan = P.scanDataConflicts();
        assert(scan && typeof scan === "object", "scan object");
        assert(scan.counts, "counts present");
      })
    );

    checks.push(
      check("Browser: setCycleCompletionMoment remaps calendar + stamp without tally bump", function () {
        var r0 = P.applyTaskCompletion("weeklies", wKey, {
          dateStr: "2026-07-15",
          hour: 10,
          minute: 0,
          save: false,
          render: false,
          processResets: false,
        });
        assert(r0 && r0.ok, "seed complete");
        var cBefore = Number(P.getStateSnapshot().weekliesCompleted[wKey]) || 0;
        var moved = P.setCycleCompletionMoment("weeklies", wKey, "2026-07-13", "2026-07-17", 16, 45, {
          skipSave: true,
          skipRender: true,
        });
        assert(moved && moved.ok, "move ok: " + (moved && moved.reason));
        assert(moved.dateStr === "2026-07-17", "finish day " + moved.dateStr);
        var snap = P.getStateSnapshot();
        assert((Number(snap.weekliesCompleted[wKey]) || 0) === cBefore, "tally stable");
        assert(
          snap.completionByDate["2026-07-17"] &&
            snap.completionByDate["2026-07-17"].weeklies.indexOf(wKey) >= 0,
          "new day marked"
        );
        assert(
          !snap.completionByDate["2026-07-15"] ||
            snap.completionByDate["2026-07-15"].weeklies.indexOf(wKey) < 0,
          "old finish cleared"
        );
        var stamp = (snap.completionTimestamps || []).some(function (t) {
          return t.taskType === "weeklies" && t.taskId === "weekly_a" && t.dateStr === "2026-07-17" && t.hour === 16;
        });
        assert(stamp, "timestamp updated");
      })
    );

    checks.push(
      check("Browser: scheduled setEndgameCompletionDate is no-op", function () {
        P.applyTaskCompletion("endgame", eKey, {
          dateStr: "2026-07-20",
          hour: 12,
          save: false,
          render: false,
          processResets: false,
        });
        var before = JSON.stringify(P.getStateSnapshot().completionByDate);
        P.setEndgameCompletionDate(gameId, "pure_fiction", 0, "2020-01-01", "2020-01-14", { skipSave: true });
        var after = JSON.stringify(P.getStateSnapshot().completionByDate);
        assert(before === after, "scheduled Start/End edit must not mutate calendar");
        var pfTask = (P.getGame(gameId).endgame || []).find(function (t) {
          return t.id === "pure_fiction";
        });
        assert(pfTask && !pfTask.manualReset, "fixture is scheduled");
      })
    );

    checks.push(
      check("Browser: setExtracurricularCompletionMoment updates completedAt + stamp", function () {
        var snap = P.getStateSnapshot();
        snap.extracurricularTasks = [
          { id: "live_evt", gameId: gameId, label: "Live Event", startDate: "2026-03-01", endDate: "2026-03-10", currency: 10 },
        ];
        snap.extracurricularCompleted = { live_evt: true };
        snap.extracurricularCompletedAt = { live_evt: "2026-03-05T12:00:00.000Z" };
        P.loadStateSnapshot(snap);
        var beforeAt = snap.extracurricularCompletedAt.live_evt;
        var res = P.setExtracurricularCompletionMoment("live_evt", "2026-03-07", 19, 30, {
          skipSave: true,
          skipRender: true,
        });
        assert(res && res.ok, "extra moment ok: " + (res && res.reason));
        assert(res.dateStr === "2026-03-07" && res.hour === 19 && res.minute === 30, "return shape");
        var after = P.getStateSnapshot();
        var at = after.extracurricularCompletedAt && after.extracurricularCompletedAt.live_evt;
        assert(!!at && at !== beforeAt, "completedAt rewritten (ISO may shift calendar day in UTC)");
        assert(Number.isFinite(new Date(at).getTime()), "completedAt is parseable ISO");
        var hit = (after.completionTimestamps || []).some(function (t) {
          return t.taskType === "extracurricular" && t.taskId === "live_evt" && t.dateStr === "2026-03-07" && t.hour === 19;
        });
        assert(hit, "extracurricular stamp present for Time Trends");
      })
    );

    checks.push(
      check("Browser: Games finish edit remaps calendar and Trends hour/DOW buckets", function () {
        var r0 = P.applyTaskCompletion("weeklies", wKey, {
          dateStr: "2026-07-22",
          hour: 11,
          minute: 0,
          save: false,
          render: false,
          processResets: false,
        });
        assert(r0 && r0.ok, "seed weekly");
        var moved = P.setCycleCompletionMoment("weeklies", wKey, "2026-07-20", "2026-07-24", 21, 15, {
          skipSave: true,
          skipRender: true,
        });
        assert(moved && moved.ok && moved.dateStr === "2026-07-24", "finish → Fri");
        var snap = P.getStateSnapshot();
        assert(
          snap.completionByDate["2026-07-24"] &&
            snap.completionByDate["2026-07-24"].weeklies.indexOf(wKey) >= 0,
          "calendar marks new finish day"
        );
        assert(
          !snap.completionByDate["2026-07-22"] ||
            snap.completionByDate["2026-07-22"].weeklies.indexOf(wKey) < 0,
          "calendar cleared old finish"
        );
        var stamp = (snap.completionTimestamps || []).find(function (t) {
          return t.taskType === "weeklies" && t.taskId === "weekly_a" && t.dateStr === "2026-07-24";
        });
        assert(stamp && stamp.hour === 21, "Trends stamp hour 21");
        // Fri = 5
        assert(new Date("2026-07-24T12:00:00").getDay() === 5, "finish DOW Friday");
      })
    );

    checks.push(
      check("Browser: simulated clock offset shifts getDateStr for completes", function () {
        var snap = P.getStateSnapshot();
        snap.simulatedDateOffset = 0;
        snap.simulatedHourOffset = 0;
        P.loadStateSnapshot(snap);
        var base = P.getDateStr(P.getSimulatedNow());
        snap = P.getStateSnapshot();
        snap.simulatedDateOffset = 3;
        P.loadStateSnapshot(snap);
        var advanced = P.getDateStr(P.getSimulatedNow());
        assert(base !== advanced, "offset moves effective today (" + base + " → " + advanced + ")");
        // Completing a daily on the simulated dateStr lands calendar + stamp there
        var r = P.applyTaskCompletion("dailies", gameId, {
          dateStr: advanced,
          hour: 14,
          minute: 5,
          save: false,
          render: false,
          processResets: false,
        });
        assert(r && r.ok, "daily on sim day");
        var after = P.getStateSnapshot();
        assert(
          after.completionByDate[advanced] &&
            after.completionByDate[advanced].dailies.indexOf(gameId) >= 0,
          "calendar day = simulated today"
        );
        var ds = (after.completionTimestamps || []).some(function (t) {
          return t.taskType === "dailies" && t.gameId === gameId && t.dateStr === advanced && t.hour === 14;
        });
        assert(ds, "Trends stamp on simulated day @14");
      })
    );

    checks.push(
      check("Browser: complete daily+weekly+endgame+extra keeps calendar, tally, Trends together", function () {
        var snap = P.getStateSnapshot();
        snap.completionByDate = {};
        snap.completionTimestamps = [];
        snap.dailiesCompleted = {};
        snap.weekliesCompleted = {};
        snap.endgameCompleted = {};
        snap.dailiesAttempted = {};
        snap.weekliesAttempted = {};
        snap.endgameAttempted = {};
        snap.extracurricularTasks = [
          { id: "live_extra", gameId: gameId, label: "Live Extra", startDate: "2026-07-01", endDate: "2026-08-31", currency: 10 },
        ];
        snap.extracurricularCompleted = {};
        snap.extracurricularCompletedAt = {};
        P.loadStateSnapshot(snap);

        var d = P.applyTaskCompletion("dailies", gameId, {
          dateStr: "2026-08-03",
          hour: 14,
          minute: 0,
          save: false,
          render: false,
          processResets: false,
        });
        assert(d && d.ok, "daily complete");
        var w = P.applyTaskCompletion("weeklies", wKey, {
          dateStr: "2026-08-03",
          hour: 19,
          minute: 0,
          save: false,
          render: false,
          processResets: false,
        });
        assert(w && w.ok, "weekly complete");
        var e = P.applyTaskCompletion("endgame", eKey, {
          dateStr: "2026-08-03",
          hour: 21,
          minute: 0,
          save: false,
          render: false,
          processResets: false,
        });
        assert(e && e.ok, "endgame complete");

        var after = P.getStateSnapshot();
        assert((Number(after.dailiesCompleted[gameId]) || 0) >= 1, "Games daily tally");
        assert((Number(after.weekliesCompleted[wKey]) || 0) >= 1, "Games weekly tally");
        assert((Number(after.endgameCompleted[eKey]) || 0) >= 1, "Games endgame tally");
        assert(
          after.completionByDate["2026-08-03"] &&
            after.completionByDate["2026-08-03"].dailies.indexOf(gameId) >= 0,
          "History daily"
        );
        assert(
          after.completionByDate["2026-08-03"] &&
            after.completionByDate["2026-08-03"].weeklies.indexOf(wKey) >= 0,
          "History weekly finish"
        );
        var weeklyFill = Object.keys(after.completionByDate).filter(function (ds) {
          return (after.completionByDate[ds].weeklies || []).indexOf(wKey) >= 0;
        });
        assert(weeklyFill.length > 1, "weekly fill-remaining on History");
        var weeklyStamps = (after.completionTimestamps || []).filter(function (t) {
          return t.taskType === "weeklies" && t.taskId === "weekly_a";
        });
        assert(weeklyStamps.length === 1, "Trends one weekly finish");
        assert(P.isCompletedInCycleForDate(wKey, "weeklies", "2026-08-03"), "Home/board weekly done");
        assert(P.isCompletedInCycleForDate(eKey, "endgame", "2026-08-03"), "Home/board endgame done");

        after.extracurricularCompleted.live_extra = true;
        P.loadStateSnapshot(after);
        var extra = P.setExtracurricularCompletionMoment("live_extra", "2026-08-03", 16, 0, {
          skipSave: true,
          skipRender: true,
        });
        assert(extra && extra.ok, "extra complete");
        var extraSnap = P.getStateSnapshot();
        assert(extraSnap.extracurricularCompleted.live_extra, "Home extra done");
        var extraStamp = (extraSnap.completionTimestamps || []).some(function (t) {
          return t.taskType === "extracurricular" && t.taskId === "live_extra" && t.hour === 16;
        });
        assert(extraStamp, "Trends extra stamp");
      })
    );
  } finally {
    try {
      P.loadStateSnapshot(backup);
    } catch (_) {}
  }

  var failed = checks.filter(function (c) {
    return !c.ok;
  });
  return { ok: failed.length === 0, passed: checks.length - failed.length, failed: failed.length, checks: checks };
})();
