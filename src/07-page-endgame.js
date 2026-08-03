  function buildEndgameTaskItem(game, task, tagName, opts) {
    const key = game.id + "." + (task.id || task.label);
    const now = getSimulatedNow();
    const ended = isTaskCycleEnded(task, now, game);
    const doneToday = !ended && isEndgameCompletedInCurrentCycle(key, getDateStr());
    const locked = !ended && !doneToday && !isTaskCompletionUnlocked("endgame", task, game, now);
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
    span.textContent = task.label || "Endgame";
    const potSpan = document.createElement("span");
    potSpan.className = "task-potential";
    potSpan.textContent = "Potential: " + getEndgamePotential(task);
    titleCol.appendChild(span);
    titleCol.appendChild(potSpan);
    top.appendChild(titleCol);
    body.appendChild(top);

    const remainingText = ended ? "Ended" : getEndgameTimeRemainingText(task, now, game);
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
    const unlockHint = locked ? getTaskUnlockHint("endgame", task, game, now) : "";
    const statusId = "endgame-status-" + String(key).replace(/[^a-zA-Z0-9_-]/g, "_");
    check.setAttribute("aria-label", doneToday ? "Mark incomplete" : (locked ? "Locked. " + unlockHint : "Mark complete"));
    if (ended || locked) check.disabled = true;
    if (locked) {
      check.setAttribute("aria-disabled", "true");
      check.setAttribute("aria-describedby", statusId);
      check.title = unlockHint;
    }
    check.addEventListener("click", () => requestToggleEndgame(game.id, task.id || task.label));
    const label1 = document.createElement("span");
    label1.id = statusId;
    label1.innerHTML = "<strong>Status:</strong> " + (ended ? "Ended" : (doneToday ? "Complete" : (locked ? ("Locked — " + unlockHint) : "Incomplete")));
    if (!ended && !locked) span.addEventListener("click", () => requestToggleEndgame(game.id, task.id || task.label));
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
    remainingVal.dataset.type = "endgame";
    remainingVal.dataset.gameId = game.id;
    remainingVal.dataset.taskId = (task.id || task.label);
    remainingVal.textContent = remainingText;
    remainingRow.appendChild(remainingVal);
    sub.appendChild(remainingRow);

    const completedCount = getCompletedAmount(state.endgameCompleted, key);
    ensureEndgameEarnedArrayLength(game.id, task.id || task.label, completedCount);
    const earnedArr = getEndgameEarnedPerCompletion(game.id, task.id || task.label);
    const row2 = document.createElement("div");
    row2.className = "task-subrow";
    const left2 = document.createElement("div");
    left2.className = "left";
    const label2 = document.createElement("span");
    label2.innerHTML = "<strong>Earned this cycle:</strong>";
    left2.appendChild(label2);
    row2.appendChild(left2);
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.placeholder = "0";
    let currentIdx;
    if (doneToday) {
      currentIdx = completedCount > 0 ? completedCount - 1 : 0;
      inp.value = completedCount > 0 ? String(earnedArr[currentIdx] || 0) : "";
    } else {
      currentIdx = completedCount;
      const pending = getEndgamePendingAmount(key, game, task);
      inp.value = pending > 0 ? String(pending) : "";
    }
    inp.title = "Amount earned for the current cycle";
    inp.addEventListener("change", () => {
      if (doneToday) {
        setEndgameEarnedAt(game.id, task.id || task.label, currentIdx, inp.value);
      } else {
        setEndgamePendingAmount(key, game, task, inp.value);
      }
    });
    row2.appendChild(inp);
    sub.appendChild(row2);

    body.appendChild(sub);
    return el;
  }

  function collectEndgameBoardEntries() {
    const now = getSimulatedNow();
    const todayStr = getDateStr();
    const entries = [];
    getAllGames().forEach((game, gameIdx) => {
      (game.endgame || []).forEach((task, taskIdx) => {
        if (isTaskCycleEnded(task, now, game)) return;
        const key = game.id + "." + (task.id || task.label);
        entries.push({
          game,
          task,
          completed: isEndgameCompletedInCurrentCycle(key, todayStr),
          dueMs: now.getTime() + getEndgameTimeRemainingMs(task, now, game),
          gameOrder: gameIdx,
          taskOrder: taskIdx,
        });
      });
    });
    return sortBoardTaskEntries(entries);
  }

  function renderEndgame() {
    const content = document.getElementById("endgame-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const entries = collectEndgameBoardEntries();

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
      p.textContent = "No active endgame tasks. Add tasks in the Games tab.";
      content.appendChild(p);
      return;
    }

    const list = document.createElement("div");
    list.id = "list-endgame";
    list.className = "task-grid task-grid-knot";
    list.setAttribute("data-type", "endgame");
    entries.forEach((entry) => {
      list.appendChild(buildEndgameTaskItem(entry.game, entry.task, "div"));
    });
    content.appendChild(list);
    scheduleTaskMasonry(list);
  }

  function updateTaskRemainingTexts() {
    const tab = state.tab;
    if (tab !== "dailies" && tab !== "weeklies" && tab !== "endgame" && tab !== "home") return;
    const now = getSimulatedNow();
    document.querySelectorAll(".task-remaining").forEach((el) => {
      const type = el.dataset.type;
      const gameId = el.dataset.gameId;
      const taskId = el.dataset.taskId;
      if (!gameId) return;
      const game = getGame(gameId);
      if (!game) return;
      if (type === "daily") {
        el.textContent = getDailyTimeRemainingText(game, now);
      } else if (type === "weekly" && taskId) {
        const task = (game.weeklies || []).find((t) => (t.id || t.label) === taskId);
        if (task) el.textContent = getWeeklyTimeRemainingText(task, now, game);
      } else if (type === "endgame" && taskId) {
        const task = (game.endgame || []).find((t) => (t.id || t.label) === taskId);
        if (task) el.textContent = getEndgameTimeRemainingText(task, now, game);
      }
    });
  }

