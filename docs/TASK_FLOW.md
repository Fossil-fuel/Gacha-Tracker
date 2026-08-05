# Task Attempts & Completions Flow

## How Attempts Are Counted

**Attempts are counted when a cycle/period starts**, not when it ends. This means:

- **Dailies**: 1 attempt is counted as soon as the daily period begins (e.g. at 4am reset).
- **Weeklies**: 1 attempt is counted when the weekly cycle starts (e.g. Monday 4am).
- **Endgame**: 1 attempt is counted when the endgame cycle starts.

**Completions** are still counted when you mark a task done (during or after the cycle).

---

## Example: Adding a Preset and Task Flow

### 1. Add a new game preset (e.g. Honkai Star Rail)

When you add HSR from presets:

- **Dailies**: As soon as today's reset has passed (e.g. 4am), you get **1 attempt** for today. Completions stay 0 until you check the box.
- **Weeklies** (e.g. Divergent Universe, 2-week cycle): As soon as the current cycle has started, you get **1 attempt**. If you complete it on Wednesday, you get **1 completion**.
- **Endgame** (e.g. Memory of Chaos, 6-week cycle): Same—**1 attempt** when the cycle starts, **1 completion** when you mark it done.

### 2. Timeline example (weekly task)

| Event | Attempts | Completions |
|-------|----------|-------------|
| Mon 4am – Cycle 1 starts | 1 | 0 |
| Wed – You complete the task | 1 | 1 |
| Mon 4am – Cycle 2 starts | 2 | 1 |
| (You don't complete Cycle 2) | 2 | 1 |
| Mon 4am – Cycle 3 starts | 3 | 1 |
| Fri – You complete Cycle 3 | 3 | 2 |

### 3. Adding a new task to an existing game

When you add a new weekly/endgame task to a game you already use:

- The app finds the first cycle that has started (from `dateStarted` or today).
- It counts **1 attempt** for the current cycle immediately.
- Completions stay 0 until you mark it done.

### 4. Sync with Calendar

"Sync with Calendar" recomputes attempts and completions from `completionByDate`:

- **Attempts** = number of cycles/periods that have started (from first completion to now).
- **Completions** = number of cycles with at least one marked day.

Manual repair tools live under **Settings → Data** and **Settings → Debug** (scan conflicts, safe repair, prefer timestamps, tallies only). Load does not silently rewrite calendar history.

**Export summary** (Settings → Data): Markdown rates/currency report and CSV of completion events — not a full backup (use Export data for that).

**Undo:** Complete/incomplete from the write path push a session undo stack (Settings → Data → Undo last completion, or Ctrl+Z). Import clears the stack.

---

## Fill-remaining & Time Trends

When you complete a **weekly** or **endgame** task:

- The completion day and remaining days in that cycle are marked in `completionByDate` (History shows them as complete).
- Fill-remaining **does not** claim the next cycle’s shared reset calendar day (that date belongs to the new cycle).
- A single completion timestamp records the finish day/hour.
- **Time Trends** counts that finish (one event per cycle), not every fill-remaining day.
- History tooltips label later cycle days as “(carried)” when they are fill-only.
- Marking complete again in an already-complete cycle does not add another completion tally.

Home toggles for weeklies/endgame use the same **game-day** date as period membership (pre-reset still writes to the previous period), matching dailies.

---

## Calendar history edits

Editing a past day in the calendar day modal applies to the **cycle that contains that date**, not only “today’s” cycle. You can clear an older week even if a newer week is already marked done. For tasks that have stopped repeating (`cycleEndEnabled`), you can still restore/clear marks inside their former cycles; you cannot complete cycles after the final end.

---

## Cycle end time

In the task create/edit modal, cycle end defaults to the same clock as cycle begin (reset). You can turn off “Same as cycle begin (reset) time” and set a different end hour/minute. That end instant bounds availability and remaining-time displays.

---

## Unlock window (`earliestComplete*`)

Weeklies/endgame tasks may set:

- `earliestCompleteDays` — 0-based day index in the cycle before you can mark complete (e.g. `2` = Wednesday for a Monday-start week).
- Optional `earliestCompleteHour` / `earliestCompleteMinute`.

The UI disables complete until unlocked. Completing early via calendar is blocked with a hint.

---

## Manual Reset/Start

Weeklies/endgame can opt out of fixed frequency timers (`manualReset`). Then:

- **Start / Reset** opens a modal for start date/time and due date/time (or **TBD** for due).
- **Edit current** changes the live window without archiving it or opening a new cycle.
- When the due window ends, the task can stay on **Home** with remaining shown as **Cycle Ended** until you start the next cycle.
- Past windows you finished late can be logged with **Add completion** (Games card). Completions inside a still-live window use the normal write path; past manual windows archive into closed-cycle history without overwriting the live window.
- While Manual Reset is on, scheduled fields (day-of-week grid, frequency, time limit, etc.) are hidden in the task create/edit modal.

---

## Add completion (Games)

From a Games task card, **Add completion** records a finish with date/time (and window fields for manual-reset tasks). It uses the same `applyTaskCompletion` path as calendar completes, so History, tallies (completed + attempted), Data, and Time Trends update together. If the chosen day already has a completion for that cycle, the UI warns and can replace it.

---

## My Images (personal library)

Settings → **My Images** stores banners and profile pictures you reuse. Choosing an image for a task banner saves it into the library and the task keeps a short `userimg:<id>` reference (same idea as stock `assets/…` paths). The Image library picker shows My Images above bundled stock. Full **Export** includes library data URLs once; the slim daily localStorage backup strips image bytes.

Game icons can be picked from the library/stock, then cropped; the saved icon remains a small cropped embed (not a second full-size copy of a banner).

---

## Editing Prior Endgame Completions

When you edit the start/end dates of a **past** endgame completion in the Earnings modal:

- Only the **display dates** are updated (`endgameCompletionDates`).
- **Current-cycle completion logic** uses `completionByDate` only.
- Editing prior completion dates **cannot** make the current cycle show as complete.
