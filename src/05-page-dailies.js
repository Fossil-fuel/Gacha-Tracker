  function buildDailyTaskItem(game, tagName) {
    const doneToday = isCompletedToday("dailies", game.id);
    const el = document.createElement(tagName || "li");
    el.className = "task-item" + (doneToday ? " done" : "");

    const top = document.createElement("div");
    top.className = "task-top";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = game.name || game.id;
    const potSpan = document.createElement("span");
    potSpan.className = "task-potential";
    potSpan.textContent = "Potential: " + getDailyPotential(game);
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
    check.addEventListener("click", () => toggleDaily(game.id));
    const label1 = document.createElement("span");
    label1.innerHTML = "<strong>Completion Status:</strong> " + (doneToday ? "Complete" : "Incomplete");
    span.addEventListener("click", () => toggleDaily(game.id));
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
    remainingVal.dataset.type = "daily";
    remainingVal.dataset.gameId = game.id;
    remainingVal.textContent = getDailyTimeRemainingText(game, getSimulatedNow());
    remainingRow.appendChild(remainingVal);
    sub.appendChild(remainingRow);

    el.appendChild(sub);
    return el;
  }

  function renderDailies() {
    const content = document.getElementById("dailies-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const isGrid = state.dailiesView === "grid";
    const tag = isGrid ? "div" : "li";
    const list = document.createElement(isGrid ? "div" : "ul");
    list.id = "list-dailies";
    list.className = isGrid ? "task-grid" : "task-list";
    list.setAttribute("data-type", "dailies");

    let hasAny = false;
    games.forEach((game) => {
      if (!game.dailies) return;
      hasAny = true;
      list.appendChild(buildDailyTaskItem(game, tag));
    });
    if (!hasAny) {
      const empty = document.createElement(tag);
      empty.className = "empty-state";
      if (!isGrid) empty.setAttribute("data-list-empty", "1");
      empty.textContent = "No games yet. Add one in the Games tab.";
      if (isGrid) {
        empty.style.gridColumn = "1 / -1";
      }
      list.appendChild(empty);
    }
    content.appendChild(list);
  }

