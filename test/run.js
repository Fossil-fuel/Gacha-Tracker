#!/usr/bin/env node
"use strict";

/**
 * Regression runner for Gacha Tracker.
 *
 * Usage:
 *   npm test
 *   node test/run.js
 *   node test/run.js --list
 *
 * Optional HTTP smoke (suite 05):
 *   npm run dev   # in another terminal
 *   npm test
 *
 * Restore benchmark if a refactor goes wrong:
 *   git switch --detach benchmark/2026-07-31-pre-refactor
 *   # or reset main (destructive): git reset --hard benchmark/2026-07-31-pre-refactor
 */

const path = require("path");
const fs = require("fs");

const SUITES_DIR = path.join(__dirname, "suites");

function loadSuites() {
  return fs
    .readdirSync(SUITES_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => {
      const mod = require(path.join(SUITES_DIR, f));
      return { file: f, name: mod.name || f, run: mod.run };
    });
}

async function runSuite(suite) {
  const start = Date.now();
  try {
    await Promise.resolve(suite.run());
    return { name: suite.name, ok: true, ms: Date.now() - start };
  } catch (err) {
    if (err && err.skip) {
      return { name: suite.name, ok: true, skipped: true, ms: Date.now() - start, reason: err.message };
    }
    return {
      name: suite.name,
      ok: false,
      ms: Date.now() - start,
      error: err && err.message ? err.message : String(err),
      actual: err && err.actual,
      expected: err && err.expected,
    };
  }
}

async function main() {
  const suites = loadSuites();
  if (process.argv.includes("--list")) {
    suites.forEach((s) => console.log("-", s.name, "(" + s.file + ")"));
    console.log("\nBenchmark tag: benchmark/2026-07-31-pre-refactor");
    return;
  }

  console.log("Gacha Tracker regression tests");
  console.log("Benchmark tag: benchmark/2026-07-31-pre-refactor");
  console.log("");

  const results = [];
  for (const suite of suites) {
    process.stdout.write("• " + suite.name + " ... ");
    const result = await runSuite(suite);
    results.push(result);
    if (result.skipped) {
      console.log("SKIP (" + result.ms + "ms)");
      console.log("  " + result.reason);
    } else if (result.ok) {
      console.log("OK (" + result.ms + "ms)");
    } else {
      console.log("FAIL (" + result.ms + "ms)");
      console.log("  " + result.error);
      if (result.expected !== undefined) {
        console.log("  expected:", JSON.stringify(result.expected));
        console.log("  actual:  ", JSON.stringify(result.actual));
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped);
  console.log("");
  console.log(
    "Done:",
    results.length - failed.length - skipped.length,
    "passed,",
    failed.length,
    "failed,",
    skipped.length,
    "skipped"
  );

  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
