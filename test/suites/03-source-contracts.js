"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("../lib/assert");

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "src");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

module.exports = {
  name: "source-contracts",
  title: "Source & HTML contracts",
  run() {
    const requiredSrc = [
      "00-firebase.js",
      "01-core.js",
      "02-modals.js",
      "03-games.js",
      "04-shared.js",
      "05-page-dailies.js",
      "06-page-weeklies.js",
      "07-page-endgame.js",
      "08-page-attendance.js",
      "08b-page-extracurricular.js",
      "09-page-data.js",
      "10-page-games.js",
      "11-page-home.js",
      "12-main.js",
      "mobile-integration.js",
    ];
    requiredSrc.forEach((f) => {
      assert.ok(fs.existsSync(path.join(SRC, f)), "missing src/" + f);
    });

    const core = read("src/01-core.js");
    [
      "function recordCompletion",
      "function unrecordCompletion",
      "function getTaskTallyHistory",
      "function ensureCycleCompletionMarksFillRemainingDays",
      "function repairEndgameCompletionTiming",
      "function getEndgameCompletionEventsForTrend",
      "function processResets",
      "STORAGE_KEY",
    ].forEach((needle) => {
      assert.ok(core.includes(needle), "01-core.js must contain " + needle);
    });

    const main = read("src/12-main.js");
    ["renderHome", "renderDailies", "renderWeeklies", "renderEndgame", "renderAttendance", "renderData", "renderGames"].forEach(
      (fn) => {
        assert.ok(main.includes(fn), "12-main.js must dispatch " + fn);
      }
    );

    const html = read("index.html");
    [
      'data-tab="home"',
      'data-tab="dailies"',
      'data-tab="weeklies"',
      'data-tab="endgame"',
      'data-tab="attendance"',
      'data-tab="extracurricular"',
      'id="panel-home"',
      'id="panel-dailies"',
      'id="panel-weeklies"',
      'id="panel-endgame"',
      'id="panel-attendance"',
      'id="panel-data"',
      'id="panel-games"',
      'id="panel-about"',
      "app.js",
    ].forEach((needle) => {
      assert.ok(html.includes(needle), "index.html must include " + needle);
    });

    const build = read("build.js");
    assert.ok(build.includes("08b-page-extracurricular.js"), "build.js must include extracurricular module");
    assert.ok(build.includes("mobile-integration.js"), "build.js must include mobile module");
  },
};
