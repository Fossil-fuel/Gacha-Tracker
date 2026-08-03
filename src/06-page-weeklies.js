  function buildWeeklyTaskItem(game, task, tagName, opts) {
    const key = game.id + "." + (task.id || task.label);
    const now = getSimulatedNow();
    const ended = isTaskCycleEnded(task, now, game);
    const doneToday = !ended && isWeeklyCompletedInCurrentCycle(key, getDateStr());
    const locked = !ended && !doneToday && !isTaskCompletionUnlocked("weeklies", task, game, now);
    const el = document.createElement(tagName || "li");
    el.className = "task-item" + (doneToday ? " done" : "") + (ended ? " task-item-ended" : "") + (locked ? " task-item-locked" : "");

    appendTaskCardMedia(el, task, game, opts);
    const body = appendTaskCardBody(el);

    const top = document.createElement("div");
    top.className = "task-top task-card-title-row";
    const titleCol = document.createElement("div");
    titleCol.className = "task-game-heading-text";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label || "Weekly";
    const potSpan = document.createElement("span");
    potSpan.className = "task-potential";
    potSpan.textContent = "Potential: " + getWeeklyPotential(task);
    titleCol.appendChild(span);
    titleCol.appendChild(potSpan);
    top.appendChild(titleCol);
    body.appendChild(top);

    const remainingText = ended ? "Ended" : getWeeklyTimeRemainingText(task, now, game);
    const statusText = ended ? "Ended" : (doneToday ? "Complete" : (locked ? "Locked" : "Incomplete"));
    const snippet = document.createElement("p");
    snippet.className = "task-card-snippet";
    snippet.textContent = statusText + " · " + remainingText;
    body.appendChild(snippet);

    const sub = document.createElement("div");
    sub.className = "task-subrows";
    const row1 = document.createElement("div");
    row1.className = "task-subrow";
    const left1 = document.createElement("div");
    left1.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    const unlockHint = locked ? getTaskUnlockHint("weeklies", task, game, now) : "";
    const statusId = "weekly-status-" + String(key).replace(/[^a-zA-Z0-9_-]/g, "_");
    check.setAttribute("aria-label", doneToday ? "Mark incomplete" : (locked ? "Locked. " + unlockHint : "Mark complete"));
    if (ended || locked) check.disabled = true;
    if (locked) {
      check.setAttribute("aria-disabled", "true");
      check.setAttribute("aria-describedby", statusId);
      check.title = unlockHint;
    }
    check.addEventListener("click", () => toggleWeekly(game.id, task.id || task.label));
    const label1 = document.createElement("span");
    label1.id = statusId;
    label1.innerHTML = "<strong>Status:</strong> " + (ended ? "Ended" : (doneToday ? "Complete" : (locked ? ("Locked — " + unlockHint) : "Incomplete")));
    if (!ended && !locked) span.addEventListener("click", () => toggleWeekly(game.id, task.id || task.label));
    left1.appendChild(check);
    left1.appendChild(label1);
    row1.appendChild(left1);
    sub.appendChild(row1);

    const remainingRow = document.createElement("div");
    remainingRow.className = "task-subrow";
    const leftR = document.createElement("div");
    leftR.className = "left";
    const labelR = document.createElement("span");
    labelR.innerHTML = "<strong>Time remaining:</strong>";
    leftR.appendChild(labelR);
    remainingRow.appendChild(leftR);
    const remainingVal = document.createElement("span");
    remainingVal.className = "task-remaining";
    remainingVal.dataset.type = "weekly";
    remainingVal.dataset.gameId = game.id;
    remainingVal.dataset.taskId = (task.id || task.label);
    remainingVal.textContent = remainingText;
    remainingRow.appendChild(remainingVal);
    sub.appendChild(remainingRow);

    body.appendChild(sub);
    return el;
  }

  function collectWeeklyBoardEntries() {
    const now = getSimulatedNow();
    const todayStr = getDateStr();
    const entries = [];
    getAllGames().forEach((game, gameIdx) => {
      (game.weeklies || []).forEach((task, taskIdx) => {
        if (isTaskCycleEnded(task, now, game)) return;
        const key = game.id + "." + (task.id || task.label);
        entries.push({
          game,
          task,
          completed: isWeeklyCompletedInCurrentCycle(key, todayStr),
          dueMs: now.getTime() + getWeeklyTimeRemainingMs(task, now, game),
          gameOrder: gameIdx,
          taskOrder: taskIdx,
        });
      });
    });
    return sortBoardTaskEntries(entries);
  }

  function renderWeeklies() {
    const content = document.getElementById("weeklies-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const entries = collectWeeklyBoardEntries();

    if (games.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No tasks yet. Add one above.";
      content.appendChild(p);
      return;
    }

    if (entries.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No active weekly tasks. Add tasks in the Games tab.";
      content.appendChild(p);
      return;
    }

    const list = document.createElement("div");
    list.id = "list-weeklies";
    list.className = "task-grid task-grid-knot";
    list.setAttribute("data-type", "weeklies");
    entries.forEach((entry) => {
      list.appendChild(buildWeeklyTaskItem(entry.game, entry.task, "div"));
    });
    content.appendChild(list);
    scheduleTaskMasonry(list);
  }
