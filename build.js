#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "src");
const outFile = path.join(__dirname, "app.js");

const files = [
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

const parts = files.map((f) => {
  const p = path.join(srcDir, f);
  if (!fs.existsSync(p)) {
    console.error("Missing file:", p);
    process.exit(1);
  }
  return fs.readFileSync(p, "utf8");
});

const output = parts.join("\n");
fs.writeFileSync(outFile, output);
console.log("Built app.js from", files.length, "source files.");
