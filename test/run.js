#!/usr/bin/env node
"use strict";

/**
 * Regression runner for Gacha Tracker.
 *
 *   npm test
 *   node test/run.js
 *   node test/run.js --list
 *
 * HTTP smoke needs the dev server (npm run dev).
 * Benchmark restore: npm run benchmark:info
 */

const path = require("path");
const fs = require("fs");

const SUITES_DIR = path.join(__dirname, "suites");
const WIDTH = 78;

function line(char) {
  return char.repeat(WIDTH);
}

function pad(text, width) {
  const s = String(text);
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

function row(left, right) {
  const gap = 2;
  const rightStr = String(right);
  const leftWidth = WIDTH - rightStr.length - gap;
  return "  " + pad(left, Math.max(8, leftWidth)) + " ".repeat(gap) + rightStr;
}

function loadSuites() {
  return fs
    .readdirSync(SUITES_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => {
      const mod = require(path.join(SUITES_DIR, f));
      return {
        file: f,
        name: mod.name || f,
        title: mod.title || mod.name || f,
        run: mod.run,
      };
    });
}

async function runSuite(suite) {
  const start = Date.now();
  try {
    const out = await Promise.resolve(suite.run());
    const ms = Date.now() - start;
    if (out && typeof out === "object" && Array.isArray(out.checks)) {
      return {
        name: suite.name,
        title: out.title || suite.title,
        ok: !!out.ok,
        ms,
        checks: out.checks,
      };
    }
    return { name: suite.name, title: suite.title, ok: true, ms, checks: [] };
  } catch (err) {
    const ms = Date.now() - start;
    if (err && err.skip) {
      return {
        name: suite.name,
        title: suite.title,
        ok: true,
        skipped: true,
        ms,
        reason: err.message,
        checks: [],
      };
    }
    return {
      name: suite.name,
      title: suite.title,
      ok: false,
      ms,
      error: err && err.message ? err.message : String(err),
      actual: err && err.actual,
      expected: err && err.expected,
      checks: [],
    };
  }
}

function statusLabel(result) {
  if (result.skipped) return "SKIP";
  return result.ok ? "PASS" : "FAIL";
}

function printReport(results) {
  console.log("");
  console.log(line("═"));
  console.log(pad("  Gacha Tracker — Regression Report", WIDTH));
  console.log(pad("  Benchmark: benchmark/2026-07-31-pre-refactor", WIDTH));
  console.log(line("═"));
  console.log("");

  results.forEach((result) => {
    const headline = result.title || result.name;
    console.log(row(headline, statusLabel(result) + "  " + result.ms + "ms"));

    if (result.skipped) {
      console.log("      ↳ " + result.reason);
    }
    if (!result.ok && result.error) {
      console.log("      ✗ " + result.error);
      if (result.expected !== undefined) {
        console.log("        expected: " + JSON.stringify(result.expected));
        console.log("        actual:   " + JSON.stringify(result.actual));
      }
    }
    if (result.checks && result.checks.length) {
      result.checks.forEach((c) => {
        const mark = c.ok ? "✓" : "✗";
        console.log("      " + mark + " " + c.name);
        if (!c.ok) {
          if (c.error) console.log("        " + c.error);
          if (c.expected !== undefined) {
            console.log("        expected: " + JSON.stringify(c.expected));
            console.log("        actual:   " + JSON.stringify(c.actual));
          }
        }
      });
    }
    console.log("");
  });

  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped);
  const passed = results.length - failed.length - skipped.length;
  const checkTotal = results.reduce((n, r) => n + (r.checks ? r.checks.length : 0), 0);
  const checkFail = results.reduce((n, r) => n + (r.checks ? r.checks.filter((c) => !c.ok).length : 0), 0);
  const checkPass = checkTotal - checkFail;

  console.log(line("─"));
  console.log(row("Suites", passed + " passed · " + failed.length + " failed · " + skipped.length + " skipped"));
  if (checkTotal) {
    console.log(row("Checks", checkPass + " passed · " + checkFail + " failed · " + checkTotal + " total"));
  }
  console.log(line("═"));
  console.log("");
  if (failed.length === 0) {
    console.log("  All good — safe to keep your changes.");
  } else {
    console.log("  Something broke — see ✗ lines above.");
    console.log("  Roll back: npm run benchmark:info");
  }
  console.log("");
}

async function main() {
  const suites = loadSuites();
  if (process.argv.includes("--list")) {
    console.log("Suites:");
    suites.forEach((s) => console.log("  - " + s.name + "  (" + s.file + ")"));
    console.log("\nBenchmark tag: benchmark/2026-07-31-pre-refactor");
    return;
  }

  const results = [];
  for (const suite of suites) {
    results.push(await runSuite(suite));
  }
  printReport(results);
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
