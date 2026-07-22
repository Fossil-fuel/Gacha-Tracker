#!/usr/bin/env node
/**
 * Simulation to verify daily reset and calendar logic.
 * Run: node simulate-reset.js
 */

function getDateStr(d) {
  const date = d || new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function getDailyPeriodDateStr(game, now) {
  const n = now || new Date();
  const hour = Number.isFinite(game?.resetHour) ? game.resetHour : 3;
  const minute = Number.isFinite(game?.resetMinute) ? game.resetMinute : 0;
  const todayReset = new Date(n.getFullYear(), n.getMonth(), n.getDate(), hour, minute, 0, 0);
  if (n < todayReset) {
    const yesterday = new Date(n);
    yesterday.setDate(yesterday.getDate() - 1);
    return getDateStr(yesterday);
  }
  return getDateStr(n);
}

function getCompletedAmount(obj, key) {
  const v = obj?.[key];
  if (v === undefined || v === null) return 0;
  return Math.max(0, Number(v) || 0);
}

function getAttemptedAmount(obj, key) {
  return getCompletedAmount(obj, key);
}

function runSimulation() {
  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) {
      passed++;
      console.log("  ✓", msg);
    } else {
      failed++;
      console.log("  ✗", msg);
    }
  }

  console.log("\n=== Daily Period Date (getDailyPeriodDateStr) ===\n");

  const game3am = { resetHour: 3, resetMinute: 0 };
  const game11pm = { resetHour: 23, resetMinute: 0 };

  // 3am reset
  const march8_259 = new Date(2025, 2, 8, 2, 59, 0, 0);
  const march8_300 = new Date(2025, 2, 8, 3, 0, 0, 0);
  const march8_301 = new Date(2025, 2, 8, 3, 1, 0, 0);

  assert(getDailyPeriodDateStr(game3am, march8_259) === "2025-03-07", "2:59am Mar 8 (3am reset) → Mar 7");
  assert(getDailyPeriodDateStr(game3am, march8_300) === "2025-03-08", "3:00am Mar 8 (3am reset) → Mar 8");
  assert(getDailyPeriodDateStr(game3am, march8_301) === "2025-03-08", "3:01am Mar 8 (3am reset) → Mar 8");

  // 11pm reset
  const march8_2259 = new Date(2025, 2, 8, 22, 59, 0, 0);
  const march8_2300 = new Date(2025, 2, 8, 23, 0, 0, 0);
  const march8_2301 = new Date(2025, 2, 8, 23, 1, 0, 0);

  assert(getDailyPeriodDateStr(game11pm, march8_2259) === "2025-03-07", "10:59pm Mar 8 (11pm reset) → Mar 7");
  assert(getDailyPeriodDateStr(game11pm, march8_2300) === "2025-03-08", "11:00pm Mar 8 (11pm reset) → Mar 8");
  assert(getDailyPeriodDateStr(game11pm, march8_2301) === "2025-03-08", "11:01pm Mar 8 (11pm reset) → Mar 8");

  console.log("\n=== ProcessResets + Calendar Flow ===\n");

  // Simulate: user completes daily at 2:59am Mar 8, then at 10am Mar 9 we run processResets
  const state = {
    completionByDate: {},
    dailiesCompleted: {},
    dailiesAttempted: {},
    lastProcessedResets: { dailies: {} },
  };

  const game = { id: "test", dailies: true, resetHour: 3, resetMinute: 0 };
  const gameId = "test";

  // 1. User completes at 2:59am Mar 8 → should record for Mar 7
  const completeTime = new Date(2025, 2, 8, 2, 59, 0, 0);
  const periodDate = getDailyPeriodDateStr(game, completeTime);
  if (!state.completionByDate[periodDate]) state.completionByDate[periodDate] = { dailies: [], weeklies: [], endgame: [] };
  state.completionByDate[periodDate].dailies.push(gameId);

  assert(periodDate === "2025-03-07", "Completion at 2:59am Mar 8 records for Mar 7");
  assert((state.completionByDate["2025-03-07"]?.dailies || []).includes(gameId), "Mar 7 calendar has completion");

  // 2. Simulate processResets at 10am Mar 9 (last processed was Mar 6, so we roll up Mar 7 and Mar 8)
  state.lastProcessedResets.dailies[gameId] = "2025-03-06";

  const now = new Date(2025, 2, 9, 10, 0, 0, 0);
  const todayStr = getDateStr(now);
  const hour = 3;
  const minute = 0;
  let lastStr = state.lastProcessedResets.dailies[gameId];
  let d = new Date(lastStr + "T12:00:00");
  d.setDate(d.getDate() + 1);

  while (getDateStr(d) <= todayStr) {
    const dateStr = getDateStr(d);
    const periodEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hour, minute, 0, 0);
    if (now >= periodEnd) {
      state.dailiesAttempted[gameId] = getAttemptedAmount(state.dailiesAttempted, gameId) + 1;
      const dayData = state.completionByDate[dateStr] || { dailies: [] };
      if ((dayData.dailies || []).includes(gameId)) {
        state.dailiesCompleted[gameId] = getCompletedAmount(state.dailiesCompleted, gameId) + 1;
      }
      lastStr = dateStr;
    }
    d.setDate(d.getDate() + 1);
  }
  state.lastProcessedResets.dailies[gameId] = lastStr;

  // Mar 7's period ended at Mar 8 3am. At 10am Mar 9, we should have processed Mar 7 and Mar 8
  assert(state.dailiesAttempted[gameId] >= 2, "ProcessResets: Mar 7 and Mar 8 periods processed (attempted ≥ 2)");
  assert(state.dailiesCompleted[gameId] >= 1, "ProcessResets: Mar 7 completion counted in tally");
  assert(state.completionByDate["2025-03-07"]?.dailies?.includes(gameId), "Calendar: Mar 7 still shows completion");

  console.log("\n=== Cross-check: Calendar date matches period ===\n");

  // If user views calendar for March 2025, Mar 7 cell should show 1/1 dailies
  const march7Data = state.completionByDate["2025-03-07"] || { dailies: [] };
  const dCompleted = march7Data.dailies.length;
  assert(dCompleted === 1, "Calendar Mar 7 cell: 1 daily completed");

  console.log("\n=== 11pm reset: completion at 10:59pm records for previous day ===\n");

  const state11pm = {
    completionByDate: {},
    dailiesCompleted: {},
    dailiesAttempted: {},
    lastProcessedResets: { dailies: {} },
  };
  const game11pmTest = { id: "test11pm", dailies: true, resetHour: 23, resetMinute: 0 };
  const complete11pm = new Date(2025, 2, 8, 22, 59, 0, 0); // 10:59pm Mar 8
  const period11pm = getDailyPeriodDateStr(game11pmTest, complete11pm);
  if (!state11pm.completionByDate[period11pm]) state11pm.completionByDate[period11pm] = { dailies: [], weeklies: [], endgame: [] };
  state11pm.completionByDate[period11pm].dailies.push("test11pm");

  assert(period11pm === "2025-03-07", "11pm reset: 10:59pm Mar 8 → Mar 7");
  assert((state11pm.completionByDate["2025-03-07"]?.dailies || []).includes("test11pm"), "11pm reset: Mar 7 calendar has completion");

  console.log("\n=== Summary ===\n");
  console.log(`Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log("\nAll simulations passed.\n");
}

function run20DaySimulation() {
  let rng = 12345;
  function seededRandom() {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  const game = { id: "test", dailies: true, resetHour: 3, resetMinute: 0 };
  const gameId = "test";
  const state = {
    completionByDate: {},
    dailiesCompleted: {},
    dailiesAttempted: {},
    lastProcessedResets: { dailies: {} },
  };

  const startDate = new Date(2025, 2, 1); // Mar 1
  const days = 20;
  const completions = []; // { completeTime, periodDate, note }

  console.log("\n=== 20-Day Random Completion Simulation ===\n");
  console.log("Reset: 3:00 AM | Simulating Mar 1 - Mar 20, 2025\n");

  for (let i = 0; i < days; i++) {
    const completeDate = new Date(startDate);
    completeDate.setDate(completeDate.getDate() + i);

    // ~60% chance to complete each day
    if (seededRandom() > 0.4) {
      // 20% chance late night (1-2:59am) → maps to previous day; 80% normal hours
      const isLateNight = seededRandom() < 0.2;
      const hour = isLateNight
        ? 1 + Math.floor(seededRandom() * 2)  // 1 or 2
        : Math.floor(seededRandom() * 24);
      const minute = Math.floor(seededRandom() * 60);
      completeDate.setHours(hour, minute, 0, 0);

      const periodDate = getDailyPeriodDateStr(game, completeDate);
      if (!state.completionByDate[periodDate]) state.completionByDate[periodDate] = { dailies: [], weeklies: [], endgame: [] };
      if (!state.completionByDate[periodDate].dailies.includes(gameId)) {
        state.completionByDate[periodDate].dailies.push(gameId);
      }

      const timeStr = completeDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      const note = hour < 3 ? "before reset" : "after reset";
      completions.push({
        completeTime: new Date(completeDate),
        periodDate,
        timeStr,
        note,
      });
    }
  }

  // Run processResets as of end of day 20
  state.lastProcessedResets.dailies[gameId] = "2025-02-28"; // Start before Mar 1
  const now = new Date(2025, 2, 20, 20, 0, 0, 0); // 8pm Mar 20
  const todayStr = getDateStr(now);
  const hour = 3;
  const minute = 0;
  let lastStr = state.lastProcessedResets.dailies[gameId];
  let d = new Date(lastStr + "T12:00:00");
  d.setDate(d.getDate() + 1);

  while (getDateStr(d) <= todayStr) {
    const dateStr = getDateStr(d);
    const periodEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hour, minute, 0, 0);
    if (now >= periodEnd) {
      state.dailiesAttempted[gameId] = getAttemptedAmount(state.dailiesAttempted, gameId) + 1;
      const dayData = state.completionByDate[dateStr] || { dailies: [] };
      if ((dayData.dailies || []).includes(gameId)) {
        state.dailiesCompleted[gameId] = getCompletedAmount(state.dailiesCompleted, gameId) + 1;
      }
      lastStr = dateStr;
    }
    d.setDate(d.getDate() + 1);
  }
  state.lastProcessedResets.dailies[gameId] = lastStr;

  // Print results
  console.log("Completions (when user clicked, → which calendar date):");
  console.log("-".repeat(60));
  completions.forEach((c) => {
    const d = c.completeTime.getDate();
    const m = c.completeTime.getMonth() + 1;
    const dateStr = `${m}/${d}`;
    console.log(`  ${dateStr} at ${c.timeStr.padEnd(8)} (${c.note}) → ${c.periodDate}`);
  });

  console.log("\nCalendar view (Mar 1–20):");
  console.log("-".repeat(60));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const header = weekdays.join(" ");
  console.log("     " + header);
  const first = new Date(2025, 2, 1);
  let line = "     ";
  const pad = (n) => String(n).padStart(2, "0");
  for (let i = 0; i < first.getDay(); i++) line += "   ";
  for (let day = 1; day <= 20; day++) {
    const dateStr = `2025-03-${pad(day)}`;
    const has = (state.completionByDate[dateStr]?.dailies || []).includes(gameId);
    line += has ? " ✓ " : " · ";
    if ((first.getDay() + day) % 7 === 0) {
      console.log(line);
      line = "     ";
    }
  }
  if (line.trim()) console.log(line);
  console.log("\n  ✓ = completed that day");

  console.log("\nTally (after processResets):");
  console.log("-".repeat(60));
  console.log(`  Completed: ${state.dailiesCompleted[gameId]}`);
  console.log(`  Attempted: ${state.dailiesAttempted[gameId]}`);
  console.log(`  Rate: ${state.dailiesAttempted[gameId] > 0 ? Math.round(100 * state.dailiesCompleted[gameId] / state.dailiesAttempted[gameId]) : 0}%`);

  console.log("\n");
}

function runMonthSimulation() {
  let rng = 98765;
  function seededRandom() {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  const game = { id: "test", dailies: true, resetHour: 3, resetMinute: 0 };
  const gameId = "test";
  const state = {
    completionByDate: {},
    dailiesCompleted: {},
    dailiesAttempted: {},
    lastProcessedResets: { dailies: {} },
  };

  const startDate = new Date(2025, 2, 1); // Mar 1
  const daysInMonth = 31;
  const completions = [];
  const expectedDates = new Set(); // dates we expect to have completions

  console.log("\n=== Full Month Simulation (March 2025) ===\n");
  console.log("Reset: 3:00 AM | 31 days\n");

  for (let i = 0; i < daysInMonth; i++) {
    const completeDate = new Date(startDate);
    completeDate.setDate(completeDate.getDate() + i);

    if (seededRandom() > 0.45) {
      const isLateNight = seededRandom() < 0.18;
      const hour = isLateNight ? 1 + Math.floor(seededRandom() * 2) : 6 + Math.floor(seededRandom() * 18);
      const minute = Math.floor(seededRandom() * 60);
      completeDate.setHours(hour, minute, 0, 0);

      const periodDate = getDailyPeriodDateStr(game, completeDate);
      expectedDates.add(periodDate);
      if (!state.completionByDate[periodDate]) state.completionByDate[periodDate] = { dailies: [], weeklies: [], endgame: [] };
      if (!state.completionByDate[periodDate].dailies.includes(gameId)) {
        state.completionByDate[periodDate].dailies.push(gameId);
      }
      completions.push({
        completeTime: new Date(completeDate.getTime()),
        periodDate,
        timeStr: completeDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        note: hour < 3 ? "before reset" : "after reset",
      });
    }
  }

  // Run processResets as of 10pm Mar 31
  state.lastProcessedResets.dailies[gameId] = "2025-02-28";
  const now = new Date(2025, 2, 31, 22, 0, 0, 0);
  const todayStr = getDateStr(now);
  const hour = 3;
  const minute = 0;
  let lastStr = state.lastProcessedResets.dailies[gameId];
  let d = new Date(lastStr + "T12:00:00");
  d.setDate(d.getDate() + 1);

  while (getDateStr(d) <= todayStr) {
    const dateStr = getDateStr(d);
    const periodEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, hour, minute, 0, 0);
    if (now >= periodEnd) {
      state.dailiesAttempted[gameId] = getAttemptedAmount(state.dailiesAttempted, gameId) + 1;
      const dayData = state.completionByDate[dateStr] || { dailies: [] };
      if ((dayData.dailies || []).includes(gameId)) {
        state.dailiesCompleted[gameId] = getCompletedAmount(state.dailiesCompleted, gameId) + 1;
      }
      lastStr = dateStr;
    }
    d.setDate(d.getDate() + 1);
  }
  state.lastProcessedResets.dailies[gameId] = lastStr;

  // Expected vs Actual
  // As of 10pm Mar 31: Mar 31's period ends Apr 1 3am, so only Mar 1–30 have ended
  const lastProcessedDate = "2025-03-30";
  const expectedAttempted = 30;
  const expectedCompleted = [...expectedDates].filter((d) => d <= lastProcessedDate).length;
  const actualCompleted = state.dailiesCompleted[gameId];
  const actualAttempted = state.dailiesAttempted[gameId];

  const actualCalendarDates = new Set();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `2025-03-${String(day).padStart(2, "0")}`;
    if ((state.completionByDate[dateStr]?.dailies || []).includes(gameId)) {
      actualCalendarDates.add(dateStr);
    }
  }

  const pad = (n) => String(n).padStart(2, "0");

  console.log("EXPECTED vs ACTUAL");
  console.log("=".repeat(60));
  console.log("\n(Expected: 30 attempted = Mar 1–30 periods ended by 10pm Mar 31; Mar 31 ends Apr 1 3am)");
  console.log("\nTally:");
  console.log("  " + "Metric".padEnd(16) + "Expected".padEnd(14) + "Actual".padEnd(12) + "Match");
  console.log("  " + "-".repeat(50));
  const tallyMatch = expectedCompleted === actualCompleted && expectedAttempted === actualAttempted;
  console.log("  " + "Completed".padEnd(16) + String(expectedCompleted).padEnd(14) + String(actualCompleted).padEnd(12) + (expectedCompleted === actualCompleted ? "✓" : "✗"));
  console.log("  " + "Attempted".padEnd(16) + String(expectedAttempted).padEnd(14) + String(actualAttempted).padEnd(12) + (expectedAttempted === actualAttempted ? "✓" : "✗"));

  const calendarMatch = expectedDates.size === actualCalendarDates.size &&
    [...expectedDates].every((d) => actualCalendarDates.has(d));
  const missing = [...expectedDates].filter((d) => !actualCalendarDates.has(d));
  const extra = [...actualCalendarDates].filter((d) => !expectedDates.has(d));

  console.log("\nCalendar (dates with completions):");
  console.log("  Expected count: " + expectedDates.size);
  console.log("  Actual count:   " + actualCalendarDates.size + (expectedDates.size === actualCalendarDates.size ? " ✓" : " ✗"));
  if (missing.length) console.log("  Missing in actual: " + missing.sort().join(", "));
  if (extra.length) console.log("  Extra in actual:   " + extra.sort().join(", "));

  console.log("\nSample completions (first 8):");
  console.log("-".repeat(60));
  completions.slice(0, 8).forEach((c) => {
    const d = c.completeTime.getDate();
    const m = c.completeTime.getMonth() + 1;
    console.log(`  ${m}/${d} at ${c.timeStr.padEnd(8)} (${c.note}) → ${c.periodDate}`);
  });
  if (completions.length > 8) console.log(`  ... and ${completions.length - 8} more`);

  console.log("\nCalendar view (March 2025):");
  console.log("-".repeat(60));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  console.log("     " + weekdays.join(" "));
  const first = new Date(2025, 2, 1);
  let line = "     ";
  for (let i = 0; i < first.getDay(); i++) line += "   ";
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `2025-03-${pad(day)}`;
    const has = (state.completionByDate[dateStr]?.dailies || []).includes(gameId);
    line += has ? " ✓ " : " · ";
    if ((first.getDay() + day) % 7 === 0) {
      console.log(line);
      line = "     ";
    }
  }
  if (line.trim()) console.log(line);

  console.log("\nSUMMARY");
  console.log("=".repeat(60));
  const allMatch = tallyMatch && calendarMatch;
  console.log("  Tally match:   " + (tallyMatch ? "✓ PASS" : "✗ FAIL"));
  console.log("  Calendar match: " + (calendarMatch ? "✓ PASS" : "✗ FAIL"));
  console.log("  Overall:       " + (allMatch ? "✓ ALL CHECKS PASSED" : "✗ MISMATCH DETECTED"));
  console.log("\n");
}

function runDWESimulation() {
  let rng = 11111;
  function seededRandom() {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const games = {
    dailies: [
      { id: "d1", dailies: true, resetHour: 3, resetMinute: 0 },
      { id: "d2", dailies: true, resetHour: 3, resetMinute: 0 },
      { id: "d3", dailies: true, resetHour: 3, resetMinute: 0 },
    ],
    weeklies: [
      { id: "w1", weeklies: [{ id: "w1", weekStartDay: 0, weekStartHour: 3 }] },
      { id: "w2", weeklies: [{ id: "w2", weekStartDay: 0, weekStartHour: 3 }] },
      { id: "w3", weeklies: [{ id: "w3", weekStartDay: 0, weekStartHour: 3 }] },
    ],
    endgame: [
      { id: "e1", endgame: [{ id: "e1", dateStarted: "2025-03-02", frequencyEvery: 1, frequencyUnit: "week" }] },
      { id: "e2", endgame: [{ id: "e2", dateStarted: "2025-03-02", frequencyEvery: 1, frequencyUnit: "week" }] },
      { id: "e3", endgame: [{ id: "e3", dateStarted: "2025-03-02", frequencyEvery: 1, frequencyUnit: "week" }] },
    ],
  };

  const state = {
    completionByDate: {},
    dailiesCompleted: {}, dailiesAttempted: {},
    weekliesCompleted: {}, weekliesAttempted: {},
    endgameCompleted: {}, endgameAttempted: {},
    lastProcessedResets: { dailies: {}, weeklies: {}, endgame: {} },
  };

  const startDate = new Date(2025, 2, 1);
  const days = 30;
  const now = new Date(2025, 2, 30, 20, 0, 0, 0);
  const todayStr = getDateStr(now);

  const expected = { d: { completed: [0, 0, 0], attempted: [0, 0, 0], dates: [new Set(), new Set(), new Set()] }, w: { completed: [0, 0, 0], attempted: [0, 0, 0], weeks: [new Set(), new Set(), new Set()] }, e: { completed: [0, 0, 0], attempted: [0, 0, 0], cycles: [new Set(), new Set(), new Set()] } };

  function record(type, key, dateStr) {
    if (!state.completionByDate[dateStr]) state.completionByDate[dateStr] = { dailies: [], weeklies: [], endgame: [] };
    if (!state.completionByDate[dateStr][type].includes(key)) state.completionByDate[dateStr][type].push(key);
  }

  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);

    for (let t = 0; t < 3; t++) {
      if (seededRandom() > 0.5) {
        const hour = seededRandom() < 0.15 ? 1 + Math.floor(seededRandom() * 2) : 8 + Math.floor(seededRandom() * 12);
        d.setHours(hour, Math.floor(seededRandom() * 60), 0, 0);
        const game = games.dailies[t];
        const periodDate = getDailyPeriodDateStr(game, d);
        record("dailies", game.id, periodDate);
        expected.d.dates[t].add(periodDate);
      }
      if (seededRandom() > 0.55) {
        d.setHours(10 + Math.floor(seededRandom() * 10), Math.floor(seededRandom() * 60), 0, 0);
        const key = "w" + (t + 1) + ".w" + (t + 1);
        const dateStr = getDateStr(d);
        record("weeklies", key, dateStr);
        const weekStart = new Date(d);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        expected.w.weeks[t].add(getDateStr(weekStart));
      }
      if (seededRandom() > 0.6) {
        d.setHours(14 + Math.floor(seededRandom() * 6), Math.floor(seededRandom() * 60), 0, 0);
        const key = "e" + (t + 1) + ".e" + (t + 1);
        const dateStr = getDateStr(d);
        record("endgame", key, dateStr);
        const anchor = new Date(2025, 2, 2, 3, 0, 0, 0);
        const cycleIdx = Math.floor((d.getTime() - anchor.getTime()) / WEEK_MS);
        const cycleStart = new Date(anchor.getTime() + cycleIdx * WEEK_MS);
        expected.e.cycles[t].add(getDateStr(cycleStart));
      }
    }
  }

  const lastProcessedDaily = "2025-03-29";
  games.dailies.forEach((game, t) => {
    state.lastProcessedResets.dailies[game.id] = "2025-02-28";
    let lastStr = "2025-02-28";
    let iter = new Date(lastStr + "T12:00:00");
    iter.setDate(iter.getDate() + 1);
    const hour = 3;
    while (getDateStr(iter) <= todayStr) {
      const dateStr = getDateStr(iter);
      const periodEnd = new Date(iter.getFullYear(), iter.getMonth(), iter.getDate() + 1, hour, 0, 0, 0);
      if (now >= periodEnd) {
        state.dailiesAttempted[game.id] = getAttemptedAmount(state.dailiesAttempted, game.id) + 1;
        const dayData = state.completionByDate[dateStr] || { dailies: [] };
        if ((dayData.dailies || []).includes(game.id)) state.dailiesCompleted[game.id] = getCompletedAmount(state.dailiesCompleted, game.id) + 1;
        lastStr = dateStr;
      }
      iter.setDate(iter.getDate() + 1);
    }
    state.lastProcessedResets.dailies[game.id] = lastStr;
    expected.d.attempted[t] = 29;
    expected.d.completed[t] = [...expected.d.dates[t]].filter((x) => x <= lastProcessedDaily).length;
  });

  const weekStartDay = 0, weekStartHour = 3;
  games.weeklies.forEach((g, gi) => {
    const task = g.weeklies[0];
    const key = g.id + "." + task.id;
    state.lastProcessedResets.weeklies[key] = "2025-02-23";
    let last = new Date("2025-02-23T12:00:00");
    let weekStart = new Date(last.getFullYear(), last.getMonth(), last.getDate(), weekStartHour, 0, 0, 0);
    const daysBack = (last.getDay() - weekStartDay + 7) % 7;
    weekStart.setDate(weekStart.getDate() - daysBack);
    if (last < weekStart) weekStart.setDate(weekStart.getDate() - 7);
    let iter = new Date(weekStart);
    const nowWeekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), weekStartHour, 0, 0, 0);
    const nowDaysBack = (now.getDay() - weekStartDay + 7) % 7;
    nowWeekEnd.setDate(nowWeekEnd.getDate() - nowDaysBack);
    if (now < nowWeekEnd) nowWeekEnd.setDate(nowWeekEnd.getDate() - 7);
    while (iter < nowWeekEnd) {
      const weekEnd = new Date(iter.getTime() + WEEK_MS);
      if (now >= weekEnd) {
        state.weekliesAttempted[key] = getAttemptedAmount(state.weekliesAttempted, key) + 1;
        let completed = false;
        for (let i = 0; i < 7; i++) {
          const cd = new Date(iter);
          cd.setDate(cd.getDate() + i);
          const ds = getDateStr(cd);
          if ((state.completionByDate[ds]?.weeklies || []).includes(key)) { completed = true; break; }
        }
        if (completed) state.weekliesCompleted[key] = getCompletedAmount(state.weekliesCompleted, key) + 1;
        iter.setDate(iter.getDate() + 7);
      } else break;
    }
    const processedWeeks = ["2025-02-23", "2025-03-02", "2025-03-09", "2025-03-16", "2025-03-23"];
    expected.w.attempted[gi] = 5;
    expected.w.completed[gi] = [...expected.w.weeks[gi]].filter((ws) => processedWeeks.includes(ws)).length;
  });

  const anchor = new Date(2025, 2, 2, 3, 0, 0, 0);
  games.endgame.forEach((g, gi) => {
    const task = g.endgame[0];
    const key = g.id + "." + task.id;
    state.lastProcessedResets.endgame[key] = anchor.getTime();
    let cycleEndMs = anchor.getTime();
    while (cycleEndMs + WEEK_MS <= now.getTime()) {
      state.endgameAttempted[key] = getAttemptedAmount(state.endgameAttempted, key) + 1;
      const cycleStart = new Date(cycleEndMs - WEEK_MS);
      const cycleEnd = new Date(cycleEndMs);
      let completed = false;
      for (let dd = new Date(cycleStart); dd < cycleEnd; dd.setDate(dd.getDate() + 1)) {
        const ds = getDateStr(dd);
        if ((state.completionByDate[ds]?.endgame || []).includes(key)) { completed = true; break; }
      }
      if (completed) state.endgameCompleted[key] = getCompletedAmount(state.endgameCompleted, key) + 1;
      cycleEndMs += WEEK_MS;
    }
    state.lastProcessedResets.endgame[key] = cycleEndMs;
    expected.e.attempted[gi] = 4;
    expected.e.completed[gi] = state.endgameCompleted[key] || 0;
  });

  console.log("\n=== DWE Simulation (3 D + 3 W + 3 E, 30 days) ===\n");
  console.log("Reset: 3am | Mar 1–30, 2025 | Check at 8pm Mar 30\n");

  console.log("EXPECTED vs ACTUAL");
  console.log("=".repeat(70));
  console.log("\nTally:");
  console.log("  " + "Task".padEnd(10) + "Type".padEnd(10) + "Exp Compl".padEnd(12) + "Act Compl".padEnd(12) + "Exp Att".padEnd(10) + "Act Att".padEnd(10) + "Match");
  console.log("  " + "-".repeat(68));
  let allMatch = true;
  ["d1", "d2", "d3"].forEach((id, i) => {
    const expC = expected.d.completed[i], actC = state.dailiesCompleted[id] || 0;
    const expA = expected.d.attempted[i], actA = state.dailiesAttempted[id] || 0;
    const m = expC === actC && expA === actA ? "✓" : "✗";
    if (m === "✗") allMatch = false;
    console.log("  " + id.padEnd(10) + "Daily".padEnd(10) + String(expC).padEnd(12) + String(actC).padEnd(12) + String(expA).padEnd(10) + String(actA).padEnd(10) + m);
  });
  ["w1.w1", "w2.w2", "w3.w3"].forEach((key, i) => {
    const expC = expected.w.completed[i], actC = state.weekliesCompleted[key] || 0;
    const expA = expected.w.attempted[i], actA = state.weekliesAttempted[key] || 0;
    const m = expC === actC && expA === actA ? "✓" : "✗";
    if (m === "✗") allMatch = false;
    console.log("  " + ("w" + (i + 1)).padEnd(10) + "Weekly".padEnd(10) + String(expC).padEnd(12) + String(actC).padEnd(12) + String(expA).padEnd(10) + String(actA).padEnd(10) + m);
  });
  ["e1.e1", "e2.e2", "e3.e3"].forEach((key, i) => {
    const expC = expected.e.completed[i], actC = state.endgameCompleted[key] || 0;
    const expA = expected.e.attempted[i], actA = state.endgameAttempted[key] || 0;
    const m = expC === actC && expA === actA ? "✓" : "✗";
    if (m === "✗") allMatch = false;
    console.log("  " + ("e" + (i + 1)).padEnd(10) + "Endgame".padEnd(10) + String(expC).padEnd(12) + String(actC).padEnd(12) + String(expA).padEnd(10) + String(actA).padEnd(10) + m);
  });

  console.log("\nMOCK CALENDAR (March 2025)");
  console.log("=".repeat(70));
  console.log("  D = Dailies (any of d1,d2,d3) | W = Weeklies | E = Endgame");
  console.log("  ✓ = at least one completion that day\n");
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  console.log("     " + weekdays.join(" "));
  const first = new Date(2025, 2, 1);
  let line = "     ";
  for (let i = 0; i < first.getDay(); i++) line += "   ";
  for (let day = 1; day <= 30; day++) {
    const dateStr = `2025-03-${pad(day)}`;
    const hasD = games.dailies.some((g) => (state.completionByDate[dateStr]?.dailies || []).includes(g.id));
    const hasW = games.weeklies.some((g) => (state.completionByDate[dateStr]?.weeklies || []).includes(g.id + "." + g.weeklies[0].id));
    const hasE = games.endgame.some((g) => (state.completionByDate[dateStr]?.endgame || []).includes(g.id + "." + g.endgame[0].id));
    let cell = " · ";
    if (hasD && hasW && hasE) cell = "DWE";
    else if (hasD && hasW) cell = "DW ";
    else if (hasD && hasE) cell = "D E";
    else if (hasW && hasE) cell = " WE";
    else if (hasD) cell = " D ";
    else if (hasW) cell = " W ";
    else if (hasE) cell = " E ";
    line += cell;
    if ((first.getDay() + day) % 7 === 0) {
      console.log(line);
      line = "     ";
    }
  }
  if (line.trim()) console.log(line);

  console.log("\nSUMMARY: " + (allMatch ? "✓ ALL CHECKS PASSED" : "✗ MISMATCH DETECTED"));
  console.log("\n");
}

runSimulation();
run20DaySimulation();
runMonthSimulation();
runDWESimulation();
