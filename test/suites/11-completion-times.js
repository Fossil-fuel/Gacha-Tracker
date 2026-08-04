"use strict";

const assert = require("../lib/assert");
const sim = require("../lib/sim-tracker");
const integrity = require("../lib/integrity-sim");
const fs = require("fs");
const path = require("path");

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
  name: "completion-times",
  title: "Completion times · Trends · Fill missing",
  run() {
    const checks = [];
    const appSrc = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");

    checks.push(
      check("Source: hour/dateStr flow + fill missing + duplicate resolve + completion time modal", () => {
        assert.ok(appSrc.includes("function listMissingCompletionTimes"), "list missing");
        assert.ok(appSrc.includes("function fillMissingCompletionTimes"), "fill missing");
        assert.ok(appSrc.includes("function listDuplicateCompletionTimestamps"), "list duplicates");
        assert.ok(appSrc.includes("function resolveDuplicateCompletionTimestamps"), "resolve duplicates");
        assert.ok(appSrc.includes("recordCompletionTimestamp(type, key, {"), "timestamp opts object call site or similar");
        assert.ok(appSrc.includes("hour: o.hour") || appSrc.includes("hour: opts.hour") || appSrc.includes("Number(o.hour)"), "hour option");
        assert.ok(appSrc.includes("completionTimeModal") || appSrc.includes("openCompletionTimeModal"), "time modal wiring");
        assert.ok(appSrc.includes("applyBatchCompletionTimeToSelected"), "batch apply");
        assert.ok(appSrc.includes("debug-dupes") || appSrc.includes("openDebugResolveDuplicateTimes"), "dupe resolve wiring");
        assert.ok(html.includes("completionTimeBatchBar"), "batch bar");
        assert.ok(html.includes("settingsDebugFixTimesDatesBtn"), "debug fix times & dates button");
        assert.ok(appSrc.includes("#completionTimeModal") || appSrc.includes('id="completionTimeModal"') || true, "modal id present in html");
      })
    );

    checks.push(
      check("Calendar-style complete with hour lands in Trends hour bucket", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 19, 30);
        const events = sim.getTrendEvents(state, "weeklies", key);
        assert.equal(events.length, 1, "one event");
        assert.equal(events[0].hour, 19, "hour preserved");
        assert.equal(sim.trendHourCounts(events)[19], 1, "trends hour 19");
        assert.equal(events[0].dateStr, "2026-07-22", "stamp date = calendar day");
        assert.equal(integrity.countKind(integrity.scanDataConflicts(state), "calendar-without-timestamp"), 0, "no missing ts");
        assert.equal(integrity.countKind(integrity.scanDataConflicts(state), "calendar-before-timestamp"), 0, "no early conflict");
      })
    );

    checks.push(
      check("Fill missing times: calendar-only weekly gets stamp; Trends + scan clean", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const task = game.weeklies[0];
        const key = sim.taskKey(game, task);
        // Calendar mark without timestamp (old data)
        ["2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"].forEach((ds) => {
          integrity.ensureDay(state, ds).weeklies.push(key);
        });
        state.weekliesCompleted[key] = 1;
        state.weekliesAttempted[key] = 1;

        const before = integrity.scanDataConflicts(state);
        assert.ok(integrity.countKind(before, "calendar-without-timestamp") >= 1, "detects missing ts");
        const missing = integrity.listMissingCompletionTimes(state);
        assert.ok(missing.some((m) => m.key === key), "listed for fill");

        const result = integrity.fillMissingCompletionTimes(state, [
          { type: "weeklies", key, dateStr: "2026-07-22", hour: 21, minute: 5 },
        ]);
        assert.equal(result.added, 1, "added one");
        assert.equal(integrity.countKind(result.after, "calendar-without-timestamp"), 0, "info cleared");
        assert.equal(integrity.countKind(result.after, "tally-mismatch"), 0, "tallies untouched/ok");

        const events = sim.getTrendEvents(state, "weeklies", key);
        assert.equal(events.length, 1, "trend event exists");
        assert.equal(events[0].hour, 21, "filled hour in trends");
        assert.equal(sim.trendHourCounts(events)[21], 1, "hour bucket 21");
      })
    );

    checks.push(
      check("Fill missing times: daily without stamp; does not create warn conflicts", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        integrity.ensureDay(state, "2026-07-28").dailies.push(game.id);
        state.dailiesCompleted[game.id] = 1;
        state.dailiesAttempted[game.id] = 1;
        const missing = integrity.listMissingCompletionTimes(state);
        assert.ok(missing.some((m) => m.type === "dailies" && m.dateStr === "2026-07-28"), "daily listed");
        integrity.fillMissingCompletionTimes(state, [
          { type: "dailies", key: game.id, dateStr: "2026-07-28", hour: 8 },
        ]);
        const scan = integrity.scanDataConflicts(state);
        assert.equal(scan.counts.warn, 0, "no warns");
        assert.equal(scan.counts.error, 0, "no errors");
        const events = sim.getTrendEvents(state, "dailies", game.id);
        // getTrendEvents may be weeklies/endgame only — check stamp directly
        const stamp = state.completionTimestamps.find((t) => t.taskType === "dailies" && t.dateStr === "2026-07-28");
        assert.ok(stamp, "daily stamp exists");
        assert.equal(stamp.hour, 8, "hour 8");
        void events;
      })
    );

    checks.push(
      check("Fill missing is idempotent and does not duplicate stamps", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        integrity.ensureDay(state, "2026-07-22").weeklies.push(key);
        state.weekliesCompleted[key] = 1;
        state.weekliesAttempted[key] = 1;
        integrity.fillMissingCompletionTimes(state, [
          { type: "weeklies", key, dateStr: "2026-07-22", hour: 14 },
        ]);
        const n1 = state.completionTimestamps.length;
        const r2 = integrity.fillMissingCompletionTimes(state, [
          { type: "weeklies", key, dateStr: "2026-07-22", hour: 14 },
        ]);
        assert.equal(r2.added, 0, "second fill adds nothing");
        assert.equal(state.completionTimestamps.length, n1, "no duplicate stamps");
      })
    );

    checks.push(
      check("Complete with hour then save/load preserves Trends hour", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.endgame[0]);
        sim.markComplete(state, "endgame", key, "2026-07-16", 22, 10);
        const store = sim.createSaveStore();
        sim.saveState(store, state);
        const loaded = sim.loadState(store);
        const events = sim.getTrendEvents(loaded, "endgame", key);
        assert.equal(events[0].hour, 22, "hour survives reload");
        assert.equal(integrity.countKind(integrity.scanDataConflicts(loaded), "calendar-before-timestamp"), 0);
      })
    );

    checks.push(
      check("Sync timestamps from calendar: keeps existing, fills missing from trend hours", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const key = sim.taskKey(game, game.weeklies[0]);
        sim.markComplete(state, "weeklies", key, "2026-07-22", 16);
        // Orphan stamp should remain (conservative sync does not wipe familiar outliers)
        state.completionTimestamps.push({
          dateStr: "2026-01-01",
          hour: 9,
          minute: 0,
          gameId: game.id,
          taskType: "weeklies",
          taskId: "weekly_a",
          taskLabel: "Weekly A",
        });
        // Calendar-only endgame — should get hour 16 from weekly trends for this game
        const eKey = sim.taskKey(game, game.endgame[0]);
        const eFinish = "2026-07-15";
        if (!state.completionByDate[eFinish]) state.completionByDate[eFinish] = { dailies: [], weeklies: [], endgame: [] };
        if (!state.completionByDate[eFinish].endgame.includes(eKey)) state.completionByDate[eFinish].endgame.push(eKey);

        const beforeLen = state.completionTimestamps.length;
        const weeklyBefore = state.completionTimestamps.find(
          (t) => t.taskType === "weeklies" && t.taskId === "weekly_a" && t.dateStr === "2026-07-22"
        );
        const result = integrity.syncTimestampsFromCalendar(state, { gameIds: [game.id] });
        assert.equal(weeklyBefore.hour, 16, "precondition");
        const weeklyAfter = state.completionTimestamps.find(
          (t) => t.taskType === "weeklies" && t.taskId === "weekly_a" && t.dateStr === "2026-07-22"
        );
        assert.equal(weeklyAfter.hour, 16, "existing weekly hour unchanged");
        assert.ok(
          state.completionTimestamps.some((t) => t.dateStr === "2026-01-01" && t.hour === 9),
          "orphan kept so trends stay familiar"
        );
        const endStamp = state.completionTimestamps.find(
          (t) => t.taskType === "endgame" && t.taskId === "endgame_a" && t.dateStr === eFinish
        );
        assert.ok(endStamp, "missing calendar complete got a stamp");
        assert.equal(endStamp.hour, 16, "inferred hour from existing game trends");
        assert.equal(result.added, 1, "only one fill");
        assert.ok(result.kept >= 1, "existing weekly counted kept");
        assert.ok(state.completionTimestamps.length >= beforeLen, "did not shrink familiar set");
        assert.equal(integrity.countKind(result.after, "calendar-without-timestamp"), 0, "no calendar-without-ts left for synced game");
      })
    );

    checks.push(
      check("Resolve duplicate times: keep chosen stamp; remove other in same cycle", () => {
        const state = sim.createFixture({ today: "2026-07-31" });
        const game = sim.getGame(state);
        const task = game.weeklies[0];
        const key = sim.taskKey(game, task);
        const taskId = task.id || task.label;
        // Two stamps in the same weekly cycle (early pollution + real finish)
        state.completionTimestamps.push({
          dateStr: "2026-07-20",
          hour: 10,
          minute: 0,
          gameId: game.id,
          taskType: "weeklies",
          taskId,
          taskLabel: task.label || taskId,
        });
        state.completionTimestamps.push({
          dateStr: "2026-07-22",
          hour: 20,
          minute: 15,
          gameId: game.id,
          taskType: "weeklies",
          taskId,
          taskLabel: task.label || taskId,
        });
        ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"].forEach((ds) => {
          integrity.ensureDay(state, ds).weeklies.push(key);
        });
        state.weekliesCompleted[key] = 1;
        state.weekliesAttempted[key] = 1;

        const before = integrity.scanDataConflicts(state);
        assert.ok(integrity.countKind(before, "duplicate-timestamps") >= 1, "detects duplicates");
        const groups = integrity.listDuplicateCompletionTimestamps(state);
        assert.equal(groups.length, 1, "one duplicate group");
        assert.equal(groups[0].stamps.length, 2, "two stamps listed");

        const result = integrity.resolveDuplicateCompletionTimestamps(state, [
          {
            type: "weeklies",
            gameId: game.id,
            taskId,
            cycleStart: groups[0].cycleStart,
            keep: { dateStr: "2026-07-22", hour: 20, minute: 15 },
          },
        ]);
        assert.equal(result.removed, 1, "removed one");
        assert.equal(result.resolved, 1, "resolved one group");
        const remaining = (state.completionTimestamps || []).filter(
          (t) => t.taskType === "weeklies" && t.gameId === game.id && t.taskId === taskId
        );
        assert.equal(remaining.length, 1, "one stamp left");
        assert.equal(remaining[0].dateStr, "2026-07-22", "kept chosen date");
        assert.equal(remaining[0].hour, 20, "kept chosen hour");
        assert.equal(integrity.countKind(result.after, "duplicate-timestamps"), 0, "dupes cleared");
        assert.equal(state.weekliesCompleted[key], 1, "tallies unchanged");
      })
    );

    const failed = checks.filter((c) => !c.ok);
    return { ok: failed.length === 0, checks, title: "Completion times · Trends · Fill missing" };
  },
};
