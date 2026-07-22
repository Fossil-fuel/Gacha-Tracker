  function buildEndgameTaskItem(game, task, tagName) {
    const key = game.id + "." + (task.id || task.label);
    const now = getSimulatedNow();
    const ended = isTaskCycleEnded(task, now, game);
    const doneToday = !ended && isEndgameCompletedInCurrentCycle(key, getDateStr());
    const el = document.createElement(tagName || "li");
    el.className = "task-item" + (doneToday ? " done" : "") + (ended ? " task-item-ended" : "");

    const top = document.createElement("div");
    top.className = "task-top";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label || "Endgame";
    const potSpan = document.createElement("span");
    potSpan.className = "task-potential";
    potSpan.textContent = "Potential: " + getEndgamePotential(task);
    top.appendChild(span);
    top.appendChild(potSpan);
    el.appendChild(top);

    const sub = document.createElement("div");
    sub.className = "task-subrows";

    const row1 = document.createElement("div");
    row1.className = "task-subrow";
    const left1 = document.createElement("div");
    left1.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    check.setAttribute("aria-label", doneToday ? "Mark incomplete" : "Mark complete");
    if (ended) check.disabled = true;
    check.addEventListener("click", () => requestToggleEndgame(game.id, task.id || task.label));
    const label1 = document.createElement("span");
    label1.innerHTML = "<strong>Completion Status:</strong> " + (ended ? "Ended" : (doneToday ? "Complete" : "Incomplete"));
    if (!ended) span.addEventListener("click", () => requestToggleEndgame(game.id, task.id || task.label));
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
    remainingVal.textContent = ended ? "Ended" : getEndgameTimeRemainingText(task, now, game);
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

    el.appendChild(sub);
    return el;
  }

  function appendEndgameTasksForGame(container, game, tagName, endedOnly) {
    const now = getSimulatedNow();
    const tasks = (game.endgame || []).filter((task) => isTaskCycleEnded(task, now, game) === !!endedOnly);
    tasks.forEach((task) => {
      const item = buildEndgameTaskItem(game, task, tagName);
      if (tagName === "div") {
        const gameLabel = document.createElement("div");
        gameLabel.className = "task-grid-game-label";
        gameLabel.textContent = game.name;
        item.insertBefore(gameLabel, item.firstChild);
      }
      container.appendChild(item);
    });
    return tasks.length;
  }

  function renderEndgame() {
    const content = document.getElementById("endgame-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const isGrid = state.endgameView === "grid";

    if (games.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No tasks yet. Add one above.";
      content.appendChild(p);
      return;
    }

    if (isGrid) {
      const list = document.createElement("div");
      list.id = "list-endgame";
      list.className = "task-grid";
      list.setAttribute("data-type", "endgame");
      let hasAny = false;
      games.forEach((game) => {
        hasAny = appendEndgameTasksForGame(list, game, "div", false) > 0 || hasAny;
      });
      if (!hasAny) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.style.gridColumn = "1 / -1";
        empty.textContent = "No active endgame tasks. Add tasks in the Games tab.";
        list.appendChild(empty);
      }
      content.appendChild(list);
      const endedGrid = document.createElement("div");
      endedGrid.className = "task-grid task-grid-ended";
      let hasEnded = false;
      games.forEach((game) => {
        hasEnded = appendEndgameTasksForGame(endedGrid, game, "div", true) > 0 || hasEnded;
      });
      if (hasEnded) {
        const endedHeading = document.createElement("h3");
        endedHeading.className = "games-cycle-ended-section-label";
        endedHeading.textContent = "Ended";
        content.appendChild(endedHeading);
        content.appendChild(endedGrid);
      }
    } else {
      let hasAny = false;
      const container = document.createElement("div");
      container.id = "list-endgame";
      container.className = "game-sections-container";
      container.setAttribute("data-type", "endgame");
      games.forEach((game) => {
        const now = getSimulatedNow();
        const activeTasks = (game.endgame || []).filter((t) => !isTaskCycleEnded(t, now, game));
        const endedTasks = (game.endgame || []).filter((t) => isTaskCycleEnded(t, now, game));
        if (activeTasks.length === 0 && endedTasks.length === 0) return;
        hasAny = true;
        const section = document.createElement("div");
        section.className = "game-section";
        const heading = document.createElement("h3");
        heading.className = "game-section-title";
        heading.textContent = game.name;
        section.appendChild(heading);
        if (activeTasks.length > 0) {
          const ul = document.createElement("ul");
          ul.className = "task-list";
          activeTasks.forEach((task) => {
            ul.appendChild(buildEndgameTaskItem(game, task, "li"));
          });
          section.appendChild(ul);
        }
        if (endedTasks.length > 0) {
          const endedLabel = document.createElement("p");
          endedLabel.className = "games-cycle-ended-section-label";
          endedLabel.textContent = "Ended";
          section.appendChild(endedLabel);
          const endedUl = document.createElement("ul");
          endedUl.className = "task-list task-list-ended";
          endedTasks.forEach((task) => {
            endedUl.appendChild(buildEndgameTaskItem(game, task, "li"));
          });
          section.appendChild(endedUl);
        }
        container.appendChild(section);
      });
      if (!hasAny) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.textContent = "No tasks yet. Add tasks in the Games tab.";
        container.appendChild(p);
      }
      content.appendChild(container);
    }
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

