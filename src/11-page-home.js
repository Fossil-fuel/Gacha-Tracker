  function renderHome() {
    const container = document.getElementById("homeContainer");
    if (!container) return;
    container.innerHTML = "";
    const games = getAllGames();
    const todayStr = getDateStr();
    const now = new Date();
    const dDone = games.filter((g) => g.dailies && (state.completionByDate[getDailyPeriodDateStr(g, now)] || {}).dailies?.includes(g.id)).length;
    const available = getTasksAvailableOnDate(todayStr);
    const dTotal = Math.max(1, games.filter((g) => g.dailies).length);
    const weekliesList = available.weeklies || [];
    const wTotal = Math.max(1, weekliesList.length);
    const wDone = weekliesList.filter((item) => isWeeklyCompletedInCurrentCycle(item.key, todayStr)).length;
    const endgameList = available.endgame || [];
    const eTotal = Math.max(1, endgameList.length);
    const eDone = endgameList.filter((item) => isEndgameCompletedInCurrentCycle(item.key, todayStr)).length;

    const section = document.createElement("div");
    section.className = "home-dwe-progress";
    const heading = document.createElement("p");
    heading.className = "home-welcome";
    heading.textContent = "Today's progress";
    section.appendChild(heading);

    const barsWrap = document.createElement("div");
    barsWrap.className = "home-dwe-bars";

    function addBar(label, done, total) {
      const block = document.createElement("div");
      block.className = "home-dwe-bar-block";
      const title = document.createElement("div");
      title.className = "home-dwe-bar-label";
      title.textContent = label + " " + done + "/" + total;
      block.appendChild(title);
      const track = document.createElement("div");
      track.className = "home-dwe-bar-track";
      const fill = document.createElement("div");
      fill.className = "home-dwe-bar-fill";
      fill.style.width = total ? (100 * done / total) + "%" : "0%";
      track.appendChild(fill);
      block.appendChild(track);
      barsWrap.appendChild(block);
    }

    addBar("Dailies", dDone, dTotal);
    addBar("Weeklies", wDone, wTotal);
    addBar("Endgame", eDone, eTotal);

    section.appendChild(barsWrap);
    container.appendChild(section);

    // DWE checklist: tasks due earliest to latest, same order as game list for ties
    const checklistItems = [];
    games.forEach((game, gameIdx) => {
      if (game.dailies) {
        checklistItems.push({
          type: "dailies",
          key: game.id,
          gameId: game.id,
          taskId: null,
          label: (game.name || game.id),
          dueMs: now.getTime() + getDailyTimeRemainingMs(game, now),
          gameOrder: gameIdx,
          taskOrder: 0
        });
      }
      (game.weeklies || []).forEach((task, taskIdx) => {
        if (isWeeklyAvailableOnDate(task, now, game)) {
          const key = game.id + "." + (task.id || task.label);
          checklistItems.push({
            type: "weeklies",
            key,
            gameId: game.id,
            taskId: task.id || task.label,
            label: (game.name || game.id) + " — " + (task.label || "Weekly"),
            dueMs: now.getTime() + getWeeklyTimeRemainingMs(task, now, game),
            gameOrder: gameIdx,
            taskOrder: taskIdx
          });
        }
      });
      (game.endgame || []).forEach((task, taskIdx) => {
        if (isEndgameAvailableOnDate(task, now, game)) {
          const key = game.id + "." + (task.id || task.label);
          checklistItems.push({
            type: "endgame",
            key,
            gameId: game.id,
            taskId: task.id || task.label,
            label: (game.name || game.id) + " — " + (task.label || "Endgame"),
            dueMs: now.getTime() + getEndgameTimeRemainingMs(task, now, game),
            gameOrder: gameIdx,
            taskOrder: taskIdx
          });
        }
      });
    });
    const sortItems = (a, b) => {
      if (a.dueMs !== b.dueMs) return a.dueMs - b.dueMs;
      if (a.gameOrder !== b.gameOrder) return a.gameOrder - b.gameOrder;
      return a.taskOrder - b.taskOrder;
    };
    const dailiesItems = checklistItems.filter((i) => i.type === "dailies").sort(sortItems);
    const weekliesItems = checklistItems.filter((i) => i.type === "weeklies").sort(sortItems);
    const endgameItems = checklistItems.filter((i) => i.type === "endgame").sort(sortItems);

    const extracurricularItems = (state.extracurricularTasks || []).filter((task) => {
      if (isExtracurricularArchived(task)) return false;
      if (!task.startDate) return false;
      if (todayStr < task.startDate) return false;
      if (task.endDateTBD) return true;
      if (!task.endDate) return true;
      return todayStr <= task.endDate;
    });

    function renderChecklistGrid(items, typeLabel, type) {
      const section = document.createElement("div");
      section.className = "home-dwe-checklist-section";
      const heading = document.createElement("p");
      heading.className = "home-dwe-checklist-section-title";
      heading.textContent = typeLabel;
      section.appendChild(heading);
      const scroll = document.createElement("div");
      scroll.className = "home-dwe-checklist-scroll";
      const grid = document.createElement("div");
      grid.className = "task-grid";
      grid.setAttribute("data-type", type);

      if (type === "extracurricular") {
        items.forEach((task) => {
          const card = document.createElement("div");
          card.className = "task-item home-dwe-checklist-item home-dwe-checklist-item-extracurricular" + (state.extracurricularCompleted[task.id] ? " done" : "");
          const label = document.createElement("span");
          label.className = "task-label home-dwe-checklist-label";
          label.textContent = task.label || "Task";
          const check = document.createElement("input");
          check.type = "checkbox";
          check.className = "task-checkbox";
          check.checked = !!state.extracurricularCompleted[task.id];
          check.addEventListener("change", () => {
            setExtracurricularCompleted(task.id, check.checked);
            save();
            renderAll();
          });
          const info = document.createElement("span");
          info.className = "home-extracurricular-info";
          const endStr = task.endDateTBD ? "TBD" : (task.endDate || "");
          info.textContent = (task.startDate || "") + (endStr ? " — " + endStr : "");
          card.appendChild(label);
          card.appendChild(check);
          card.appendChild(info);
          grid.appendChild(card);
        });
      } else if (type === "dailies") {
        items.forEach((item) => {
          const game = getGame(item.gameId);
          if (game) grid.appendChild(buildDailyTaskItem(game, "div"));
        });
      } else if (type === "weeklies") {
        items.forEach((item) => {
          const game = getGame(item.gameId);
          const task = game && (game.weeklies || []).find((t) => (t.id || t.label) === item.taskId);
          if (game && task) {
            const card = buildWeeklyTaskItem(game, task, "div");
            const gameLabel = document.createElement("div");
            gameLabel.className = "task-grid-game-label";
            gameLabel.textContent = game.name;
            card.insertBefore(gameLabel, card.firstChild);
            grid.appendChild(card);
          }
        });
      } else if (type === "endgame") {
        items.forEach((item) => {
          const game = getGame(item.gameId);
          const task = game && (game.endgame || []).find((t) => (t.id || t.label) === item.taskId);
          if (game && task) {
            const card = buildEndgameTaskItem(game, task, "div");
            const gameLabel = document.createElement("div");
            gameLabel.className = "task-grid-game-label";
            gameLabel.textContent = game.name;
            card.insertBefore(gameLabel, card.firstChild);
            grid.appendChild(card);
          }
        });
      }

      if (grid.children.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.style.gridColumn = "1 / -1";
        empty.textContent = "No tasks in this category.";
        grid.appendChild(empty);
      }
      scroll.appendChild(grid);
      section.appendChild(scroll);
      return section;
    }

    const checklistWrap = document.createElement("div");
    checklistWrap.className = "home-dwe-checklist-wrap";
    const checklistHeading = document.createElement("div");
    checklistHeading.className = "home-checklist-heading";
    const checklistTitle = document.createElement("span");
    checklistTitle.className = "home-welcome";
    checklistTitle.textContent = "Checklist";
    checklistHeading.appendChild(checklistTitle);
    const infoIcon = document.createElement("span");
    infoIcon.className = "home-checklist-info-icon";
    infoIcon.setAttribute("aria-label", "Information");
    infoIcon.title = "This checklist will show the tasks by earliest to latest \"due date,\" followed by order of the Games.";
    infoIcon.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4M12 8h.01\"/></svg>";
    checklistHeading.appendChild(infoIcon);
    checklistWrap.appendChild(checklistHeading);
    checklistWrap.appendChild(renderChecklistGrid(extracurricularItems, "Extracurricular", "extracurricular"));
    checklistWrap.appendChild(renderChecklistGrid(dailiesItems, "Dailies", "dailies"));
    checklistWrap.appendChild(renderChecklistGrid(weekliesItems, "Weeklies", "weeklies"));
    checklistWrap.appendChild(renderChecklistGrid(endgameItems, "Endgame", "endgame"));
    container.appendChild(checklistWrap);
  }

