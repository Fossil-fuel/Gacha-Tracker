"use strict";

const assert = require("../lib/assert");
const { listExtracurricularTimestampsForTimeTrends } = require("../lib/extracurricular-time-trends");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");

module.exports = {
  name: "extracurricular-time-trends",
  title: "Extracurricular Time Trends stamps",
  run() {
    function check(label, fn) {
      fn();
    }

    check("Includes completed tasks with filed ISO times", () => {
      const stamps = listExtracurricularTimestampsForTimeTrends({
        extracurricularTasks: [{ id: "x1", gameId: "hsr", label: "Event A" }],
        extracurricularCompleted: { x1: true },
        extracurricularCompletedAt: { x1: "2026-08-05T15:30:00.000Z" },
      }, {
        getDatePartsInTimezone: () => ({ year: 2026, month: 7, day: 5, hour: 10, minute: 30 }),
      });
      assert.equal(stamps.length, 1);
      assert.equal(stamps[0].taskType, "extracurricular");
      assert.equal(stamps[0].dateStr, "2026-08-05");
      assert.equal(stamps[0].hour, 10);
      assert.equal(stamps[0].minute, 30);
      assert.equal(stamps[0].gameId, "hsr");
      assert.equal(stamps[0].taskLabel, "Event A");
    });

    check("Skips completed tasks with no filed time", () => {
      const stamps = listExtracurricularTimestampsForTimeTrends({
        extracurricularTasks: [{ id: "x1", gameId: "hsr", label: "Event A" }],
        extracurricularCompleted: { x1: true },
        extracurricularCompletedAt: {},
      });
      assert.equal(stamps.length, 0);
    });

    check("Skips invalid filed time strings", () => {
      const stamps = listExtracurricularTimestampsForTimeTrends({
        extracurricularTasks: [{ id: "x1", gameId: "hsr", label: "Event A" }],
        extracurricularCompleted: { x1: true },
        extracurricularCompletedAt: { x1: "not-a-date" },
      });
      assert.equal(stamps.length, 0);
    });

    check("Skips incomplete tasks even if completedAt exists", () => {
      const stamps = listExtracurricularTimestampsForTimeTrends({
        extracurricularTasks: [{ id: "x1", gameId: "hsr", label: "Event A" }],
        extracurricularCompleted: {},
        extracurricularCompletedAt: { x1: "2026-08-05T15:30:00.000Z" },
      });
      assert.equal(stamps.length, 0);
    });

    check("Source wires extracurricular into Time Trends charts", () => {
      const core = fs.readFileSync(path.join(root, "src", "01-core.js"), "utf8");
      const attendance = fs.readFileSync(path.join(root, "src", "08-page-attendance.js"), "utf8");
      const extra = fs.readFileSync(path.join(root, "src", "08b-page-extracurricular.js"), "utf8");
      assert.ok(core.includes("function listExtracurricularTimestampsForTimeTrends"), "list helper in core");
      assert.ok(core.includes('type === "dailies" || type === "extracurricular"'), "getTimestampsForTimeTrends passes extracurricular");
      assert.ok(core.includes("function setExtracurricularCompletionMoment"), "completed moment writer");
      assert.ok(attendance.includes("listExtracurricularTimestampsForTimeTrends"), "attendance merges extracurricular stamps");
      assert.ok(attendance.includes('extracurricular: Array(24).fill(0)'), "hour stack includes extracurricular");
      assert.ok(attendance.includes('appendDayOfWeekChart("extracurricular"'), "DOW chart for extracurricular");
      assert.ok(extra.includes("extracurricular-completed-row"), "board card Completed editors");
      assert.ok(extra.includes("Dates/Currency live in dedicated rows below"), "no duplicated Dates/Currency snippet");
    });
  },
};
