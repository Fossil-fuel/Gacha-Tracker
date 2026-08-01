"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const assert = require("../lib/assert");

const ROOT = path.join(__dirname, "..", "..");

module.exports = {
  name: "build",
  title: "Build (app.js bundle)",
  run() {
    const result = spawnSync(process.execPath, ["build.js"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, "build.js should exit 0: " + (result.stderr || result.stdout || ""));
    const appPath = path.join(ROOT, "app.js");
    assert.ok(fs.existsSync(appPath), "app.js should exist after build");
    const app = fs.readFileSync(appPath, "utf8");
    assert.ok(app.length > 50000, "app.js should be a substantial bundle");
    assert.ok(app.includes("function recordCompletion"), "app.js must include recordCompletion");
    assert.ok(app.includes("function unrecordCompletion"), "app.js must include unrecordCompletion");
    assert.ok(app.includes("function renderActiveTab"), "app.js must include renderActiveTab");
    assert.ok(app.includes("function load(") || app.includes("function load ()"), "app.js must include load");
    assert.ok(app.includes("function save(") || app.includes("function save ("), "app.js must include save");
  },
};
