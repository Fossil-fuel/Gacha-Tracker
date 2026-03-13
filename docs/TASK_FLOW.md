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

---

## Editing Prior Endgame Completions

When you edit the start/end dates of a **past** endgame completion in the Earnings modal:

- Only the **display dates** are updated (`endgameCompletionDates`).
- **Current-cycle completion logic** uses `completionByDate` only.
- Editing prior completion dates **cannot** make the current cycle show as complete.
