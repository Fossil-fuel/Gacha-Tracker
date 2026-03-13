  function buildEndgameTaskItem(game, task, tagName) {
    const key = game.id + "." + (task.id || task.label);
    const doneToday = isEndgameCompletedInCurrentCycle(key, getDateStr());
    const el = document.createElement(tagName || "li");
    el.className = "task-item" + (doneToday ? " done" : "");

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
    check.addEventListener("click", () => toggleEndgame(game.id, task.id || task.label));
    const label1 = document.createElement("span");
    label1.innerHTML = "<strong>Completion Status:</strong> " + (doneToday ? "Complete" : "Incomplete");
    span.addEventListener("click", () => toggleEndgame(game.id, task.id || task.label));
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
    remainingVal.textContent = getEndgameTimeRemainingText(task, getSimulatedNow(), game);
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
    const currentIdx = completedCount > 0 ? completedCount - 1 : 0;
    inp.value = completedCount > 0 ? String(earnedArr[currentIdx] || 0) : "";
    inp.title = "Amount earned for the current cycle";
    inp.addEventListener("change", () => setEndgameEarnedAt(game.id, task.id || task.label, currentIdx, inp.value));
    row2.appendChild(inp);
    sub.appendChild(row2);

    el.appendChild(sub);
    return el;
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
        (game.endgame || []).forEach((task) => {
          hasAny = true;
          const card = buildEndgameTaskItem(game, task, "div");
          const gameLabel = document.createElement("div");
          gameLabel.className = "task-grid-game-label";
          gameLabel.textContent = game.name;
          card.insertBefore(gameLabel, card.firstChild);
          list.appendChild(card);
        });
      });
      if (!hasAny) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.style.gridColumn = "1 / -1";
        empty.textContent = "No tasks yet. Add tasks in the Games tab.";
        list.appendChild(empty);
      }
      content.appendChild(list);
    } else {
      let hasAny = false;
      const container = document.createElement("div");
      container.id = "list-endgame";
      container.className = "game-sections-container";
      container.setAttribute("data-type", "endgame");
      games.forEach((game) => {
        const tasks = game.endgame || [];
        if (tasks.length === 0) return;
        hasAny = true;
        const section = document.createElement("div");
        section.className = "game-section";
        const heading = document.createElement("h3");
        heading.className = "game-section-title";
        heading.textContent = game.name;
        section.appendChild(heading);
        const ul = document.createElement("ul");
        ul.className = "task-list";
        tasks.forEach((task) => {
          ul.appendChild(buildEndgameTaskItem(game, task, "li"));
        });
        section.appendChild(ul);
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

