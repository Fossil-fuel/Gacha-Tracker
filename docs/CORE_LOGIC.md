# Gacha Tracker — Core Logic Inventory

> Draft for correction. This is a product/logic contract, not a how-to guide and not a restatement of attempt/fill-remaining docs.

Correct anything wrong. Prefer “wrong because X; should be Y” over vague disagreement.

---

## 1. What this site is for

A **manual multi-game gacha attendance tracker**. You tell it when you did (or skipped) game tasks; it keeps history, rates, and pull/currency estimates. It does **not** scrape game APIs or auto-detect clears.

Primary jobs:

1. Track **dailies / weeklies / endgame** across several games with each game’s reset clock and cycle length.
2. Show **what is due now** vs already done for the current period.
3. Keep a **calendar history** of marks (and optional completion timestamps).
4. Derive **tallies** (attempted / completed / missed), **currency/pull estimates**, and **time-of-day trends**.
5. Support **presets**, local persistence, optional **cloud sync**, and **repair/debug** when history is inconsistent.

Out of scope unless you say otherwise: live game integration, auto-complete from screenshots (except optional extracurricular OCR tools), social features beyond share-card export.

---

## 2. Domain model (what must stay true)

| Concept | Meaning |
|--------|---------|
| **Game** | A title with reset timezone/hour, optional dailies, lists of weekly & endgame tasks, currency/pull rates. |
| **Game day** | Not always midnight→midnight. If reset is 4:00, wall-clock 03:59 still belongs to the **previous** game day. |
| **Cycle / period** | One attempt window for a weekly or endgame task: `[cycleStart, cycleEnd)` anchored from `dateStarted` + frequency. |
| **Shared reset day** | When one cycle ends and the next starts on the **same calendar date** (e.g. ends 7:59pm, restarts 8:00pm; or ends 3:59am, restarts 4:00am), that calendar date is split by the reset clock. Time **before** reset belongs to the ending cycle; time **at/after** reset belongs to the new cycle (treated as the start of the next game period — “closer to the next day” than the old one). |
| **Completion mark** | Entry in `completionByDate[dateStr][type]` for a task key. Weeklies/endgame may **fill remaining** days in the cycle after the finish day. |
| **Completion timestamp** | Optional `{ dateStr, hour, minute, … }` for the real finish instant (trends / conflict repair). Needed to tell “finished before reset” from “finished after reset” when both share one calendar date. |
| **Current-cycle done** | “Is this task complete for the period that contains *now*?” — must use membership-by-reset, not raw calendar midnight. |

---

## 3. Core logic functions (required for correct behavior)

Grouped by responsibility. Names match `src/01-core.js` (and mirrors in `test/lib/cycle-math.js` where noted).

### 3.1 Time & game-day identity

| Function | Role |
|----------|------|
| `getPeriodDateStrForReset` | **Core.** Wall time → game-day `YYYY-MM-DD` for a reset hour. Before reset → previous date. |
| `getDailyPeriodDateStr` | Daily wrapper around the above using the game’s reset. |
| `getTaskResetClock` | Resolve tz / hour / minute / offset ref for a task or game. |
| `getTaskPeriodDateStr` | Game-day dateStr for dailies **or** weeklies/endgame when recording “today”. |
| `getCycleMembershipMoment` | **Core.** Instant used to choose which weekly/endgame cycle `now` is in (pre-reset → still previous cycle). |
| `getDateStr` / timezone helpers | Wall/recording timezone formatting; not a substitute for reset-aware period identity. |

### 3.2 Cycle geometry

| Function | Role |
|----------|------|
| `getEndgameAnchorDate` / cycle param helpers | Anchor + interval / time-limit lengths. |
| `getWeeklyCycleBoundsForMoment` / `getEndgameCycleBoundsForMoment` | `{ cycleStart, cycleEnd, nextCycleStart }` for a moment. |
| `getCalendarDatesInCycleRange` | **Core.** Calendar dates owned by `[cycleStart, cycleEnd)`. On a **shared reset day** (cycle end and next start same calendar date), that date is owned by the **new** cycle only for fill/list purposes. |
| `getCalendarDatesForBounds` / `getRemainingDatesInCycleFrom` | Fill-remaining / unmark date lists (must pass `nextCycleStart`). |
| `getTaskUnlockDateStr` / `isTaskCompletionUnlocked` | Optional earliest-complete gate inside a cycle. |

### 3.3 Completion read/write

| Function | Role |
|----------|------|
| `applyTaskCompletion` / `removeTaskCompletion` | Single write path; default date must use `getTaskPeriodDateStr`, not midnight calendar day. |
| `recordCompletion` / `unrecordCompletion` | Mutate `completionByDate` (+ timestamps); weeklies/endgame fill remaining **without** claiming the next cycle’s boundary day. |
| `findCompletionDateInBounds` | **Core.** Is this cycle complete? Prefer timestamp inside `[cycleStart, cycleEnd)`. On the shared reset calendar day, a bare mark alone does not prove the **new** cycle is done (see §6.3). |
| `isWeeklyCompletedInCurrentCycle` / `isEndgameCompletedInCurrentCycle` | UI “done” for current period (membership moment + `findCompletionDateInBounds`). |
| `getCycleCompletionDateStr` / `isCarriedCompletionMark` | True finish day vs fill-only later days (history / trends). |
| `cleanupCycleBoundaryBleedMarks` | Strip leftover shared-day marks after reset when the new cycle is not actually done. |

### 3.4 Resets & tallies

| Function | Role |
|----------|------|
| `processResets` | Advance attempts when periods start; count completions for closed periods; run boundary cleanup. |
| `getTaskTallyHistory` | Period list with completed flag (must use boundary-aware completion). |
| Calendar-based attempted / skipped / in-progress helpers | Align Data page counts with history rules (including exclude unfinished current cycle when configured). |

### 3.5 Integrity & trends (supporting, but correctness-sensitive)

| Function | Role |
|----------|------|
| `scanDataConflicts` / `runIntegrityRepair` / timestamp sync helpers | Fix calendar↔timestamp mismatches. |
| `ensureCycleCompletionMarksFillRemainingDays` | Backfill fill marks **without** reintroducing boundary bleed. |
| `getTimestampsForTimeTrends` / `getEndgameCompletionEventsForTrend` | One finish per cycle for charts. |

### 3.6 Persistence & shell (needed to run, not period math)

| Area | Role |
|------|------|
| `load` / `save` / schema migrate | Local state. |
| Firebase / cloud apply hooks | Optional sync. |
| Page renderers + modals | Present state; must call the write path above, not fork completion rules. |

---

## 4. Invariants that tests must protect

1. **Pre-reset game day:** `getPeriodDateStrForReset` at 03:59 with 4:00 reset → previous `dateStr`; at 04:00 → today.
2. **Cycle membership:** same clock rule via `getCycleMembershipMoment`.
3. **Shared reset-day ownership:** the calendar date of a same-day end→restart belongs to the **new** cycle for fill lists; the ending cycle stops on the previous calendar date.
4. **Fill-remaining:** must not write the next cycle’s first calendar day when that day is the shared reset day.
5. **Bleed immunity:** a mark left on the shared day from a prior fill must **not** make the new cycle read as complete after reset (unless a timestamp proves finish **after** that reset).
6. **Unlock:** earliest-complete still clamps / blocks early marks inside a cycle.
7. **Dailies vs weeklies:** same reset-day identity rule; different storage (one day vs fill range).

Regression mirrors: `test/lib/cycle-math.js`, `test/lib/sim-tracker.js`. Suites: `02-cycle-math.js`, `13-reset-day-bleed.js` (+ source contracts for function presence).

Non-core features (share cards, extracurricular OCR, export, undo, cloud sync, etc.) are **not** excused from bugs: they must keep using the write path / tallies above and stay covered by integration suites so they stay seamless with one another.

---

## 5. Pages (what the UI is supposed to do)

| Page | Job |
|------|-----|
| Home | Overview / entry. |
| Dailies / Weeklies / Endgame | Check off current periods; show remaining time. |
| Attendance | Calendar of marks. |
| Extracurricular | Side tracking / OCR helpers (not period-math core; still must not corrupt completion state). |
| Data | Tallies, pies, currency/pulls, missed. |
| Games | Configure games/tasks/presets. |
| Settings | Formats, data export/import, debug/repair, undo. |

---

## 6. Decisions (your answers)

### 6.1 Attempts when a period starts — **Agree**

Attempts increment when the period/cycle **starts**, not when it ends. Completions still when you mark done.

### 6.2 Earnings date edits vs current-cycle done — **Agree**

Editing endgame earnings start/end ranges updates display only. It must **never** flip whether the current cycle shows complete.

### 6.3 Same-day mark after reset — **expanded (please confirm)**

**What the question was trying to ask**

One calendar date can sit on both sides of a reset. Example:

- Pure Fiction (or a weekly) **ends** Mon Aug 3 at 4:00am and **starts** the next cycle at that same 4:00am.
- Last cycle you finished weeks earlier; fill-remaining (old bug) also stamped calendar **Aug 3**.
- After 4:00am Aug 3, the UI asks: “is the *new* cycle done?”
- The only mark on disk for Aug 3 is that leftover stamp — you did **not** clear Pure Fiction again after reset.

We must treat that as **not done**.

**Separate case — you really finish after reset, same calendar day**

- It is now Mon Aug 3, 5:00pm. New cycle has been open since 4:00am. You clear Pure Fiction today.
- Calendar mark is still `2026-08-03` — same string as the bleed mark above.
- The only way to tell “leftover from last cycle” vs “I finished at 5pm today” is a **completion timestamp** whose time falls **after** 4:00am (inside the new cycle window).

**Current code behavior**

- On that shared calendar day, for the **new** cycle: a bare calendar mark alone does **not** count as complete.
- A timestamp in `[cycleStart, cycleEnd)` **does** count.
- Normal complete via the app always writes a timestamp, so “I checked it off at 5pm” still works.
- Legacy Aug 3 marks without time (pre-fix fill bleed) are ignored for current-cycle done and stripped by `cleanupCycleBoundaryBleedMarks` on reset processing.
- Covered by `test/suites/13-reset-day-bleed.js` (legacy inject → diagnostic → cleanup → save/load).

**Status:** Treated as confirmed by simulation (Aug 3-without-time = pre-fix data). Reply **change to …** only if you want different handling.

### 6.4 Shared-day rule scope — **reframed to your wording**

Not “only full-length weeklies.” The rule is for **same-day end → restart**:

- If a task window **ends** at 7:59pm and **restarts** at 8:00pm the same calendar date, 8:00pm onward is the **next** period (closer to the next day than the ending window).
- Same idea as 3:59am / 4:00am on a daily or weekly reset day.
- Windows that end on one calendar day and next start on a **later** calendar day (e.g. Wed 8pm end, next Mon 8pm) do not share a reset day; no split needed on one date.

### 6.5 Other features — **not core math, still must be seamless**

Share cards, extracurricular OCR, exports, undo, cloud sync, debug repair, etc. are supporting features, but they must:

- Not invent a second completion write path that ignores reset/shared-day rules.
- Stay covered by regression/integration tests so pages stay consistent with Data / History / Trends after completes, sync, repair, and save/load.

---

## 7. Still open

None from the prior list — §6.3 handled as legacy pre-fix data + cleanup/ignore. Add new items here if you disagree.