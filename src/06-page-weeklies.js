  function buildWeeklyTaskItem(game, task, tagName) {
    const key = game.id + "." + (task.id || task.label);
    const doneToday = isWeeklyCompletedInCurrentCycle(key, getDateStr());
    const el = document.createElement(tagName || "li");
    el.className = "task-item" + (doneToday ? " done" : "");

    const top = document.createElement("div");
    top.className = "task-top";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label || "Weekly";
    const potSpan = document.createElement("span");
    potSpan.className = "task-potential";
    potSpan.textContent = "Potential: " + getWeeklyPotential(task);
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
    check.addEventListener("click", () => toggleWeekly(game.id, task.id || task.label));
    const label1 = document.createElement("span");
    label1.innerHTML = "<strong>Completion Status:</strong> " + (doneToday ? "Complete" : "Incomplete");
    span.addEventListener("click", () => toggleWeekly(game.id, task.id || task.label));
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
    remainingVal.textContent = getWeeklyTimeRemainingText(task, new Date(), game);
    remainingRow.appendChild(remainingVal);
    sub.appendChild(remainingRow);

    el.appendChild(sub);
    return el;
  }

  function renderWeeklies() {
    const content = document.getElementById("weeklies-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const isGrid = state.weekliesView === "grid";

    if (games.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No tasks yet. Add one above.";
      content.appendChild(p);
      return;
    }

    if (isGrid) {
      const list = document.createElement("div");
      list.id = "list-weeklies";
      list.className = "task-grid";
      list.setAttribute("data-type", "weeklies");
      let hasAny = false;
      games.forEach((game) => {
        (game.weeklies || []).forEach((task) => {
          hasAny = true;
          const card = buildWeeklyTaskItem(game, task, "div");
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
      container.id = "list-weeklies";
      container.className = "game-sections-container";
      container.setAttribute("data-type", "weeklies");
      games.forEach((game) => {
        const tasks = game.weeklies || [];
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
          ul.appendChild(buildWeeklyTaskItem(game, task, "li"));
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

