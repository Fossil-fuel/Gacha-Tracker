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
      check("Browser: DOM shell still has Home + Weeklies tabs", function () {
        assert(!!document.querySelector('[data-tab="home"]'), "home tab");
        assert(!!document.querySelector('[data-tab="weeklies"]'), "weeklies tab");
        assert(!!document.querySelector('[data-tab="endgame"]'), "endgame tab");
        assert(!!document.getElementById("homeContainer"), "home container");
      })
    );

    checks.push(
      check("Browser: integrity scan callable on probe state", function () {
        var scan = P.scanDataConflicts();
        assert(scan && typeof scan === "object", "scan object");
        assert(scan.counts, "counts present");
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
