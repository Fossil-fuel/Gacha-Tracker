  function getHistoryDWEForDate(dateStr) {
    const available = getTasksAvailableOnDate(dateStr);
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const wCompleted = (available.weeklies || []).filter((item) => (dayData.weeklies || []).includes(item.key)).length;
    const eCompleted = (available.endgame || []).filter((item) => (dayData.endgame || []).includes(item.key)).length;
    return {
      dCompleted: (dayData.dailies || []).length,
      dTotal: (available.dailies || []).length,
      wCompleted,
      wTotal: (available.weeklies || []).length,
      eCompleted,
      eTotal: (available.endgame || []).length,
    };
  }

  function getHistoryCompletedTaskLabels(dateStr) {
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const available = getTasksAvailableOnDate(dateStr);
    const labels = { dailies: [], weeklies: [], endgame: [] };
    (dayData.dailies || []).forEach((gameId) => {
      const game = getGame(gameId);
      labels.dailies.push(game ? game.name : gameId);
    });
    (available.weeklies || []).filter((item) => (dayData.weeklies || []).includes(item.key)).forEach((item) => {
      const key = item.key;
      const dot = key.indexOf(".");
      const gId = dot >= 0 ? key.slice(0, dot) : key;
      const tId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gId);
      const task = (game?.weeklies || []).find((t) => (t.id || t.label) === tId);
      labels.weeklies.push(task ? task.label : tId);
    });
    (available.endgame || []).filter((item) => (dayData.endgame || []).includes(item.key)).forEach((item) => {
      const key = item.key;
      const dot = key.indexOf(".");
      const gId = dot >= 0 ? key.slice(0, dot) : key;
      const tId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gId);
      const task = (game?.endgame || []).find((t) => (t.id || t.label) === tId);
      labels.endgame.push(task ? task.label : tId);
    });
    return labels;
  }

  function renderAttendanceHistory(container) {
    const now = getSimulatedNow();
    let month = state.historyMonth != null ? Number(state.historyMonth) : now.getMonth();
    let year = state.historyYear != null ? Number(state.historyYear) : now.getFullYear();
    if (!Number.isFinite(month) || month < 0 || month > 11) month = now.getMonth();
    if (!Number.isFinite(year) || year < 1970 || year > 2100) year = now.getFullYear();
    const todayStr = getDateStr();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const header = document.createElement("div");
    header.className = "history-header";
    const title = document.createElement("h3");
    title.className = "data-section-label";
    title.textContent = "Task history by day";
    header.appendChild(title);
    const controls = document.createElement("div");
    controls.className = "history-controls";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "btn btn-ghost";
    prevBtn.textContent = "‹ Prev";
    prevBtn.addEventListener("click", () => {
      if (month === 0) {
        state.historyMonth = 11;
        state.historyYear = (state.historyYear != null ? state.historyYear : now.getFullYear()) - 1;
      } else {
        state.historyMonth = month - 1;
      }
      save();
      renderAll();
    });
    const monthLabel = document.createElement("span");
    monthLabel.className = "history-month-label";
    monthLabel.textContent = monthNames[month] + " " + year;
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn-ghost";
    nextBtn.textContent = "Next ›";
    nextBtn.addEventListener("click", () => {
      if (month === 11) {
        state.historyMonth = 0;
        state.historyYear = (state.historyYear != null ? state.historyYear : now.getFullYear()) + 1;
      } else {
        state.historyMonth = month + 1;
      }
      save();
      renderAll();
    });
    controls.appendChild(prevBtn);
    controls.appendChild(monthLabel);
    controls.appendChild(nextBtn);
    header.appendChild(controls);
    const weeklyBtn = document.createElement("button");
    weeklyBtn.type = "button";
    weeklyBtn.className = "btn btn-ghost";
    weeklyBtn.textContent = "← Weekly";
    weeklyBtn.style.marginTop = "0.5rem";
    weeklyBtn.addEventListener("click", () => {
      state.attendanceView = "weekly";
      save();
      renderAll();
    });
    const timestampsBtn = document.createElement("button");
    timestampsBtn.type = "button";
    timestampsBtn.className = "btn btn-ghost";
    timestampsBtn.textContent = "Time Trends";
    timestampsBtn.style.marginTop = "0.5rem";
    timestampsBtn.style.marginLeft = "0.5rem";
    timestampsBtn.addEventListener("click", () => {
      state.attendanceView = "timestamps";
      save();
      renderAll();
    });
    header.appendChild(weeklyBtn);
    header.appendChild(timestampsBtn);
    container.appendChild(header);

    const gridWrap = document.createElement("div");
    gridWrap.className = "history-calendar-scroll-wrap";
    const grid = document.createElement("div");
    grid.className = "history-calendar-grid";
    const firstDay = state.firstDayOfWeek === 1 ? 1 : 0;
    const dayNamesOrdered = firstDay === 1 ? [...DAY_NAMES.slice(1), DAY_NAMES[0]] : DAY_NAMES;
    for (let i = 0; i < 7; i++) {
      const th = document.createElement("div");
      th.className = "history-calendar-weekday";
      th.textContent = dayNamesOrdered[i];
      grid.appendChild(th);
    }
    const recTz = getRecordingTimezone();
    const firstOfMonth = createDateInTimezone(year, month, 1, 12, 0, recTz);
    const firstParts = getDatePartsInTimezone(firstOfMonth, recTz);
    const startDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(firstParts.weekday);
    const lastOfMonth = createDateInTimezone(year, month + 1, 0, 12, 0, recTz);
    const lastParts = getDatePartsInTimezone(lastOfMonth, recTz);
    const daysInMonth = lastParts.day;
    const lastOfPrev = createDateInTimezone(year, month, 0, 12, 0, recTz);
    const lastPrevParts = getDatePartsInTimezone(lastOfPrev, recTz);
    const daysInPrevMonth = lastPrevParts.day;
    const leadingCount = (startDay - firstDay + 7) % 7;
    const totalCells = leadingCount + daysInMonth;
    const trailingCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const cellDates = [];
    for (let i = 0; i < leadingCount; i++) {
      const d = daysInPrevMonth - leadingCount + 1 + i;
      const date = createDateInTimezone(year, month - 1, d, 12, 0, recTz);
      cellDates.push({ date, dateStr: getDateStr(date), isCurrentMonth: false, dayNum: d });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = createDateInTimezone(year, month, day, 12, 0, recTz);
      cellDates.push({ date, dateStr: getDateStr(date), isCurrentMonth: true, dayNum: day });
    }
    for (let i = 0; i < trailingCount; i++) {
      const date = createDateInTimezone(year, month + 1, i + 1, 12, 0, recTz);
      cellDates.push({ date, dateStr: getDateStr(date), isCurrentMonth: false, dayNum: i + 1 });
    }
    function bar(typeLetter, completed, total, labels, typeName) {
      const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
      const wrap = document.createElement("div");
      wrap.className = "history-dwe-bar-wrap history-dwe-bar-wrap-" + typeName;
      const label = document.createElement("span");
      label.className = "history-dwe-label";
      label.textContent = typeLetter;
      wrap.appendChild(label);
      const barEl = document.createElement("div");
      barEl.className = "history-dwe-bar history-dwe-bar-" + typeLetter.toLowerCase();
      barEl.innerHTML = "<span class=\"history-dwe-fill\" style=\"width:" + pct + "%\"></span><span class=\"history-dwe-fraction\">" + escapeHtml(String(completed) + "/" + String(total)) + "</span>";
      wrap.appendChild(barEl);
      if (labels && labels.length > 0) {
        const tooltip = document.createElement("div");
        tooltip.className = "history-dwe-tooltip history-dwe-tooltip-" + typeName;
        tooltip.setAttribute("role", "tooltip");
        const span = document.createElement("span");
        span.className = "history-dwe-tooltip-item attendance-tooltip-" + typeName;
        span.textContent = labels.join(", ");
        tooltip.appendChild(span);
        wrap.appendChild(tooltip);
      }
      return wrap;
    }
    cellDates.forEach(({ date, dateStr, isCurrentMonth, dayNum }) => {
      const cell = document.createElement("div");
      cell.className = "history-calendar-day";
      if (!isCurrentMonth) cell.classList.add("history-calendar-day-other-month");
      if (dateStr === todayStr) cell.classList.add("history-calendar-day-today");
      if (dateStr > todayStr) cell.classList.add("history-calendar-day-future");
      const topRow = document.createElement("div");
      topRow.className = "history-calendar-day-top";
      const dayNumEl = document.createElement("div");
      dayNumEl.className = "history-calendar-day-num";
      dayNumEl.textContent = dayNum;
      topRow.appendChild(dayNumEl);
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-ghost btn-sm history-calendar-day-edit";
      editBtn.textContent = "Edit";
      editBtn.setAttribute("aria-label", "Edit " + dateStr);
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openCalendarDayModal(dateStr);
      });
      topRow.appendChild(editBtn);
      cell.appendChild(topRow);
      const dwe = getHistoryDWEForDate(dateStr);
      const taskLabels = getHistoryCompletedTaskLabels(dateStr);
      cell.appendChild(bar("D", dwe.dCompleted, dwe.dTotal, taskLabels.dailies, "dailies"));
      cell.appendChild(bar("W", dwe.wCompleted, dwe.wTotal, taskLabels.weeklies, "weeklies"));
      cell.appendChild(bar("E", dwe.eCompleted, dwe.eTotal, taskLabels.endgame, "endgame"));
      grid.appendChild(cell);
    });
    gridWrap.appendChild(grid);
    container.appendChild(gridWrap);

    const todayCell = grid.querySelector(".history-calendar-day-today");
    if (todayCell && gridWrap.scrollWidth > gridWrap.clientWidth) {
      requestAnimationFrame(function () {
        const scrollLeft = todayCell.offsetLeft - (gridWrap.clientWidth / 2) + (todayCell.offsetWidth / 2);
        gridWrap.scrollLeft = Math.max(0, scrollLeft);
      });
    }
  }

  function renderAttendance() {
    const container = document.getElementById("attendanceContainer");
    if (!container) return;
    container.innerHTML = "";
    const games = getAllGames();
    if (games.length === 0) {
      container.innerHTML = '<p class="empty-state">No games yet. Add one in the Games tab.</p>';
      return;
    }
    if (state.attendanceView === "history") {
      renderAttendanceHistory(container);
      return;
    }
    if (state.attendanceView === "timestamps") {
      renderAttendanceTimestamps(container);
      return;
    }
    let dTotal = 0, dDone = 0, wTotal = 0, wDone = 0, eTotal = 0, eDone = 0;
    const rows = games.map((game) => {
      const dAttempted = game.dailies ? getAttemptedAmount(state.dailiesAttempted, game.id) : 0;
      const dCompleted = game.dailies ? getCompletedAmount(state.dailiesCompleted, game.id) : 0;
      const weeklies = game.weeklies || [];
      let wAttempted = 0, wCompleted = 0;
      weeklies.forEach((t) => {
        const key = game.id + "." + (t.id || t.label);
        wAttempted += getAttemptedAmount(state.weekliesAttempted, key);
        wCompleted += getCompletedAmount(state.weekliesCompleted, key);
      });
      const endgame = game.endgame || [];
      let eAttempted = 0, eCompleted = 0;
      endgame.forEach((t) => {
        const key = game.id + "." + (t.id || t.label);
        eAttempted += getAttemptedAmount(state.endgameAttempted, key);
        eCompleted += getCompletedAmount(state.endgameCompleted, key);
      });
      const includeInPie = state.attendancePieInclude[game.id] !== false;
      if (includeInPie) {
        dTotal += dAttempted;
        dDone += dCompleted;
        wTotal += wAttempted;
        wDone += wCompleted;
        eTotal += eAttempted;
        eDone += eCompleted;
      }
      return {
        gameId: game.id,
        name: game.name,
        dCompleted, dAttempted,
        wCompleted, wAttempted,
        eCompleted, eAttempted,
        includeInPie,
      };
    });
    const table = document.createElement("div");
    table.className = "attendance-table-wrap";
    const tableEl = document.createElement("table");
    tableEl.className = "attendance-table";
    const thead = tableEl.createTHead();
    const headerRow = thead.insertRow();
    headerRow.innerHTML = "<th>Game</th><th class=\"attendance-toggle-col\">Include</th><th>Dailies</th><th>Weeklies</th><th>Endgame</th>";
    const tbody = tableEl.createTBody();
    rows.forEach((r) => {
      const tr = tbody.insertRow();
      const nameTd = tr.insertCell();
      nameTd.innerHTML = escapeHtml(r.name);
      const toggleTd = tr.insertCell();
      toggleTd.className = "attendance-toggle-cell";
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.className = "attendance-pie-toggle";
      toggle.checked = r.includeInPie;
      toggle.title = "This toggle is for affecting pie charts below.";
      toggle.setAttribute("aria-label", "Include " + (r.name || "game") + " in pie charts");
      toggle.addEventListener("change", () => {
        state.attendancePieInclude[r.gameId] = toggle.checked;
        save();
        renderAll();
      });
      toggleTd.appendChild(toggle);
      const dTd = tr.insertCell();
      dTd.textContent = r.dAttempted > 0 ? r.dCompleted + "/" + r.dAttempted : "—";
      const wTd = tr.insertCell();
      wTd.textContent = r.wAttempted > 0 ? r.wCompleted + "/" + r.wAttempted : "—";
      const eTd = tr.insertCell();
      eTd.textContent = r.eAttempted > 0 ? r.eCompleted + "/" + r.eAttempted : "—";
    });
    const totalRow = tbody.insertRow();
    totalRow.className = "attendance-total-row";
    const totalNameTd = totalRow.insertCell();
    totalNameTd.textContent = "Total";
    const totalToggleTd = totalRow.insertCell();
    totalToggleTd.className = "attendance-toggle-cell";
    totalToggleTd.innerHTML = "";
    const totalDTd = totalRow.insertCell();
    totalDTd.textContent = dDone + "/" + dTotal;
    const totalWTd = totalRow.insertCell();
    totalWTd.textContent = wDone + "/" + wTotal;
    const totalETd = totalRow.insertCell();
    totalETd.textContent = eDone + "/" + eTotal;
    table.appendChild(tableEl);
    container.appendChild(table);
    const pieRow = document.createElement("div");
    pieRow.className = "pie-row";
    const pctD = dTotal ? Math.round((dDone / dTotal) * 100) : 0;
    const pctW = wTotal ? Math.round((wDone / wTotal) * 100) : 0;
    const pctE = eTotal ? Math.round((eDone / eTotal) * 100) : 0;
    pieRow.innerHTML =
      "<div class=\"pie-box\"><h3>Dailies</h3><div class=\"pie-chart\" style=\"--pct: " + (pctD / 100 * 360) + "deg\"></div><div class=\"pie-legend\">" + dDone + "/" + dTotal + " (" + pctD + "%)</div></div>" +
      "<div class=\"pie-box\"><h3>Weeklies</h3><div class=\"pie-chart\" style=\"--pct: " + (pctW / 100 * 360) + "deg\"></div><div class=\"pie-legend\">" + wDone + "/" + wTotal + " (" + pctW + "%)</div></div>" +
      "<div class=\"pie-box\"><h3>Endgame</h3><div class=\"pie-chart\" style=\"--pct: " + (pctE / 100 * 360) + "deg\"></div><div class=\"pie-legend\">" + eDone + "/" + eTotal + " (" + pctE + "%)</div></div>";
    container.appendChild(pieRow);

    const calendarSection = document.createElement("div");
    calendarSection.className = "attendance-calendar-section";
    const calHeader = document.createElement("div");
    calHeader.className = "attendance-calendar-header";
    const calTitle = document.createElement("h4");
    calTitle.className = "data-section-label";
    calTitle.textContent = "Weekly calendar";
    calHeader.appendChild(calTitle);
    const historyBtn = document.createElement("button");
    historyBtn.type = "button";
    historyBtn.className = "btn btn-ghost";
    historyBtn.textContent = "History";
    historyBtn.addEventListener("click", () => {
      state.attendanceView = "history";
      const now = getSimulatedNow();
      if (state.historyMonth == null) state.historyMonth = now.getMonth();
      if (state.historyYear == null) state.historyYear = now.getFullYear();
      save();
      renderAll();
    });
    const timestampsBtn = document.createElement("button");
    timestampsBtn.type = "button";
    timestampsBtn.className = "btn btn-ghost";
    timestampsBtn.textContent = "Time Trends";
    timestampsBtn.addEventListener("click", () => {
      state.attendanceView = "timestamps";
      save();
      renderAll();
    });
    calHeader.appendChild(historyBtn);
    calHeader.appendChild(timestampsBtn);
    calendarSection.appendChild(calHeader);
    const calGrid = document.createElement("div");
    calGrid.className = "attendance-calendar-grid";
    const weekDates = getWeekDates();
    const todayStr = getDateStr();
    weekDates.forEach((d) => {
      const dateStr = getDateStr(d);
      const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
      const available = getTasksAvailableOnDate(dateStr);
      const wDone = (available.weeklies || []).filter((item) => (dayData.weeklies || []).includes(item.key)).length;
      const eDone = (available.endgame || []).filter((item) => (dayData.endgame || []).includes(item.key)).length;
      const completedCount = (dayData.dailies || []).length + wDone + eDone;
      const isFuture = dateStr > todayStr;
      const dayEl = document.createElement("div");
      dayEl.className = "attendance-calendar-day" + (dateStr === todayStr ? " today" : "") + (isFuture ? " future" : "");
      const dayHeader = document.createElement("div");
      dayHeader.className = "attendance-calendar-day-header";
      dayHeader.textContent = DAY_NAMES[d.getDay()] + " " + dateStr.slice(5);
      dayEl.appendChild(dayHeader);
      const summary = document.createElement("div");
      summary.className = "attendance-calendar-summary";
      summary.textContent = available.dailies.length + available.weeklies.length + available.endgame.length === 0
        ? "—"
        : completedCount + " completed";
      dayEl.appendChild(summary);
      if (completedCount > 0) {
        const tooltip = document.createElement("div");
        tooltip.className = "attendance-calendar-tooltip";
        const frag = document.createDocumentFragment();
        const addPart = (text, type) => {
          const span = document.createElement("span");
          span.className = "attendance-tooltip-item attendance-tooltip-" + type;
          span.textContent = text;
          if (frag.childNodes.length > 0) frag.appendChild(document.createElement("br"));
          frag.appendChild(span);
        };
        dayData.dailies.forEach((gameId) => {
          const game = getGame(gameId);
          addPart(game ? game.name : gameId, "dailies");
        });
        (available.weeklies || []).filter((item) => (dayData.weeklies || []).includes(item.key)).forEach((item) => {
          const dot = item.key.indexOf(".");
          const gId = dot >= 0 ? item.key.slice(0, dot) : item.key;
          const tId = dot >= 0 ? item.key.slice(dot + 1) : "";
          const game = getGame(gId);
          const task = (game?.weeklies || []).find((t) => (t.id || t.label) === tId);
          addPart(task ? task.label : tId, "weeklies");
        });
        (available.endgame || []).filter((item) => (dayData.endgame || []).includes(item.key)).forEach((item) => {
          const dot = item.key.indexOf(".");
          const gId = dot >= 0 ? item.key.slice(0, dot) : item.key;
          const tId = dot >= 0 ? item.key.slice(dot + 1) : "";
          const game = getGame(gId);
          const task = (game?.endgame || []).find((t) => (t.id || t.label) === tId);
          addPart(task ? task.label : tId, "endgame");
        });
        tooltip.appendChild(frag);
        dayEl.appendChild(tooltip);
      }
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-ghost btn-sm attendance-calendar-edit";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openCalendarDayModal(dateStr));
      dayEl.appendChild(editBtn);
      calGrid.appendChild(dayEl);
    });
    calendarSection.appendChild(calGrid);
    container.appendChild(calendarSection);
  }

  const TIMESTAMPS_NONE = "_none";

  function renderAttendanceTimestamps(container) {
    const games = getAllGames();
    const selected = state.timestampsSelectedGameIds || {};
    const showNone = !!selected[TIMESTAMPS_NONE];
    const gameIds = Object.keys(selected).filter((k) => k !== TIMESTAMPS_NONE);
    const showAll = !showNone && gameIds.length === 0;
    const timestamps = showNone ? [] : (state.completionTimestamps || []).filter((t) => showAll || selected[t.gameId]);

    const header = document.createElement("div");
    header.className = "history-header";
    const title = document.createElement("h3");
    title.className = "data-section-label";
    title.textContent = "Completion time trends";
    header.appendChild(title);
    const clearTrendsBtn = document.createElement("button");
    clearTrendsBtn.type = "button";
    clearTrendsBtn.className = "btn btn-ghost";
    clearTrendsBtn.textContent = "Clear Time Trends data";
    clearTrendsBtn.title = "Remove all completion timestamps (keeps other data)";
    clearTrendsBtn.style.marginLeft = "0.5rem";
    clearTrendsBtn.addEventListener("click", () => openClearTimeTrendsModal());
    header.appendChild(clearTrendsBtn);
    const weeklyBtn = document.createElement("button");
    weeklyBtn.type = "button";
    weeklyBtn.className = "btn btn-ghost";
    weeklyBtn.textContent = "← Weekly";
    weeklyBtn.style.marginLeft = "0.5rem";
    weeklyBtn.addEventListener("click", () => {
      state.attendanceView = "weekly";
      save();
      renderAll();
    });
    header.appendChild(weeklyBtn);
    container.appendChild(header);

    const gameLabelRow = document.createElement("div");
    gameLabelRow.style.display = "flex";
    gameLabelRow.style.alignItems = "center";
    gameLabelRow.style.gap = "0.5rem";
    gameLabelRow.style.marginTop = "1rem";
    const gameLabel = document.createElement("h4");
    gameLabel.className = "data-section-label";
    gameLabel.textContent = "Show games";
    gameLabel.style.margin = "0";
    gameLabelRow.appendChild(gameLabel);
    const selectAllBtn = document.createElement("button");
    selectAllBtn.type = "button";
    selectAllBtn.className = "btn btn-ghost";
    selectAllBtn.textContent = "Select all";
    selectAllBtn.title = "Select all games and tasks";
    selectAllBtn.addEventListener("click", () => {
      state.timestampsSelectedGameIds = {};
      state.timestampsSelectedEndgameTasks = {};
      save();
      renderAll();
    });
    gameLabelRow.appendChild(selectAllBtn);
    const unselectAllBtn = document.createElement("button");
    unselectAllBtn.type = "button";
    unselectAllBtn.className = "btn btn-ghost";
    unselectAllBtn.textContent = "Unselect all";
    unselectAllBtn.title = "Deselect all games and tasks (show none)";
    unselectAllBtn.addEventListener("click", () => {
      state.timestampsSelectedGameIds = { [TIMESTAMPS_NONE]: true };
      state.timestampsSelectedEndgameTasks = { [TIMESTAMPS_NONE]: true };
      save();
      renderAll();
    });
    gameLabelRow.appendChild(unselectAllBtn);
    container.appendChild(gameLabelRow);
    const gameWrap = document.createElement("div");
    gameWrap.className = "timestamps-game-selector";
    gameWrap.style.display = "flex";
    gameWrap.style.flexWrap = "wrap";
    gameWrap.style.gap = "0.5rem";
    gameWrap.style.marginBottom = "1rem";
    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timestamps-game-pill";
      btn.textContent = game.name;
      btn.setAttribute("aria-pressed", (showAll || selected[game.id]) ? "true" : "false");
      const isSelected = showAll || selected[game.id];
      if (isSelected) btn.classList.add("filled");
      btn.addEventListener("click", () => {
        delete state.timestampsSelectedGameIds[TIMESTAMPS_NONE];
        if (showAll || selected[game.id]) {
          if (showAll) {
            const others = games.filter((g) => g.id !== game.id).map((g) => g.id);
            state.timestampsSelectedGameIds = {};
            others.forEach((id) => { state.timestampsSelectedGameIds[id] = true; });
          } else {
            delete state.timestampsSelectedGameIds[game.id];
          }
          if (Object.keys(state.timestampsSelectedGameIds).filter((k) => k !== TIMESTAMPS_NONE).length === 0) state.timestampsSelectedGameIds = { [TIMESTAMPS_NONE]: true };
        } else {
          state.timestampsSelectedGameIds[game.id] = true;
          if (Object.keys(state.timestampsSelectedGameIds).filter((k) => k !== TIMESTAMPS_NONE).length === games.length) state.timestampsSelectedGameIds = {};
        }
        save();
        renderAll();
      });
      gameWrap.appendChild(btn);
    });
    container.appendChild(gameWrap);

    const hourCountsByType = { dailies: Array(24).fill(0), weeklies: Array(24).fill(0), endgame: Array(24).fill(0) };
    const hourDetails = Array(24).fill(null).map(() => []);
    timestamps.forEach((t) => {
      const h = Number(t.hour);
      if (h >= 0 && h <= 23 && hourCountsByType[t.taskType]) {
        hourCountsByType[t.taskType][h]++;
        const game = getGame(t.gameId);
        hourDetails[h].push({ gameName: game ? game.name : t.gameId, taskType: t.taskType, taskLabel: t.taskLabel, dateStr: t.dateStr });
      }
    });
    const hourTotals = Array(24).fill(0).map((_, h) =>
      hourCountsByType.dailies[h] + hourCountsByType.weeklies[h] + hourCountsByType.endgame[h]
    );
    const maxCount = Math.max(1, ...hourTotals);

    const barLabel = document.createElement("h4");
    barLabel.className = "data-section-label";
    barLabel.textContent = "Completions by hour (rounded)";
    barLabel.style.marginTop = "1.5rem";
    container.appendChild(barLabel);
    const hourLegend = document.createElement("div");
    hourLegend.className = "timestamps-hour-legend";
    hourLegend.style.display = "flex";
    hourLegend.style.gap = "1rem";
    hourLegend.style.marginBottom = "0.5rem";
    hourLegend.style.fontSize = "0.8rem";
    ["dailies", "weeklies", "endgame"].forEach((type) => {
      const item = document.createElement("span");
      item.style.display = "inline-flex";
      item.style.alignItems = "center";
      item.style.gap = "0.35rem";
      const dot = document.createElement("span");
      dot.style.width = "10px";
      dot.style.height = "10px";
      dot.style.borderRadius = "2px";
      dot.style.background = "var(--pie-" + type + ")";
      item.appendChild(dot);
      item.appendChild(document.createTextNode(type.charAt(0).toUpperCase() + type.slice(1)));
      hourLegend.appendChild(item);
    });
    container.appendChild(hourLegend);
    const barWrap = document.createElement("div");
    barWrap.className = "timestamps-bar-graph";
    barWrap.style.display = "grid";
    barWrap.style.gridTemplateColumns = "repeat(24, 1fr)";
    barWrap.style.gap = "2px";
    barWrap.style.marginBottom = "1.5rem";
    barWrap.style.minHeight = "120px";
    barWrap.style.alignItems = "end";
    for (let h = 0; h < 24; h++) {
      const col = document.createElement("div");
      col.className = "timestamps-bar-col timestamps-hour-stacked";
      col.style.display = "flex";
      col.style.flexDirection = "column";
      col.style.alignItems = "stretch";
      col.style.justifyContent = "flex-end";
      col.style.gap = "0";
      const stack = document.createElement("div");
      stack.className = "timestamps-hour-stack";
      stack.style.display = "flex";
      stack.style.flexDirection = "column-reverse";
      stack.style.flex = "1";
      stack.style.minHeight = "60px";
      ["dailies", "weeklies", "endgame"].forEach((type) => {
        const count = hourCountsByType[type][h];
        if (count > 0) {
          const seg = document.createElement("div");
          seg.className = "timestamps-bar-segment";
          seg.style.height = (count / maxCount) * 100 + "px";
          seg.style.minHeight = "2px";
          seg.style.background = "var(--pie-" + type + ")";
          seg.style.borderRadius = "1px";
          seg.title = type + ": " + count;
          stack.appendChild(seg);
        }
      });
      col.appendChild(stack);
      const lbl = document.createElement("span");
      lbl.className = "timestamps-bar-label";
      lbl.style.fontSize = "0.7rem";
      lbl.style.color = "var(--text-muted)";
      lbl.textContent = h;
      col.appendChild(lbl);
      const total = hourCountsByType.dailies[h] + hourCountsByType.weeklies[h] + hourCountsByType.endgame[h];
      col.title = h + ":00 – Dailies: " + hourCountsByType.dailies[h] + ", Weeklies: " + hourCountsByType.weeklies[h] + ", Endgame: " + hourCountsByType.endgame[h] + " — Total: " + total;
      col.style.cursor = "pointer";
      col.addEventListener("click", () => {
        openTimeTrendsDetailModal(h + ":00 completions", hourDetails[h] || []);
      });
      barWrap.appendChild(col);
      const tooltip = document.createElement("div");
      tooltip.className = "timestamps-hour-tooltip";
      tooltip.textContent = h + ":00 – Dailies: " + hourCountsByType.dailies[h] + ", Weeklies: " + hourCountsByType.weeklies[h] + ", Endgame: " + hourCountsByType.endgame[h] + " — Total: " + total;
      col.appendChild(tooltip);
    }
    container.appendChild(barWrap);

    const weekliesOnly = timestamps.filter((t) => t.taskType === "weeklies");
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const dayDetails = [[], [], [], [], [], [], []];
    weekliesOnly.forEach((t) => {
      const d = new Date(t.dateStr + "T12:00:00");
      const day = d.getDay();
      dayCounts[day]++;
      const game = getGame(t.gameId);
      dayDetails[day].push({ gameName: game ? game.name : t.gameId, taskLabel: t.taskLabel, dateStr: t.dateStr });
    });

    const weekliesLabel = document.createElement("h4");
    weekliesLabel.className = "data-section-label";
    weekliesLabel.textContent = "Weeklies completed by day of week";
    weekliesLabel.style.marginTop = "1.5rem";
    container.appendChild(weekliesLabel);
    const maxDayCount = Math.max(1, ...dayCounts);
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekliesBarWrap = document.createElement("div");
    weekliesBarWrap.className = "timestamps-bar-graph timestamps-weeklies-bar-graph";
    weekliesBarWrap.style.gridTemplateColumns = "repeat(7, 1fr)";
    weekliesBarWrap.style.minHeight = "120px";
    weekliesBarWrap.style.alignItems = "end";
    for (let i = 0; i < 7; i++) {
      const col = document.createElement("div");
      col.className = "timestamps-bar-col";
      col.style.display = "flex";
      col.style.flexDirection = "column";
      col.style.justifyContent = "flex-end";
      col.style.alignItems = "center";
      col.style.gap = "2px";
      const spacer = document.createElement("div");
      spacer.style.flex = "1";
      spacer.style.minHeight = "0";
      col.appendChild(spacer);
      const bar = document.createElement("div");
      bar.className = "timestamps-bar";
      bar.style.height = maxDayCount > 0 ? (dayCounts[i] / maxDayCount) * 100 + "px" : "4px";
      bar.style.background = "var(--pie-weeklies)";
      col.appendChild(bar);
      const lbl = document.createElement("span");
      lbl.className = "timestamps-bar-label";
      lbl.textContent = dayNames[i];
      col.appendChild(lbl);
      const countLbl = document.createElement("span");
      countLbl.className = "timestamps-bar-count";
      countLbl.textContent = dayCounts[i];
      countLbl.style.fontSize = "0.75rem";
      countLbl.style.fontWeight = "600";
      countLbl.style.color = "var(--text)";
      col.appendChild(countLbl);
      col.title = dayNames[i] + " – " + dayCounts[i] + " completion(s)";
      col.style.cursor = "pointer";
      col.addEventListener("click", () => {
        openTimeTrendsDetailModal(dayNames[i] + " completions", dayDetails[i] || []);
      });
      weekliesBarWrap.appendChild(col);
    }
    container.appendChild(weekliesBarWrap);

    const endgameOnly = timestamps.filter((t) => t.taskType === "endgame");
    const allEndgameTasks = [];
    games.forEach((game) => {
      if (!showAll && !selected[game.id]) return;
      (game.endgame || []).forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        allEndgameTasks.push({ key, gameId: game.id, taskId: task.id || task.label, gameName: game.name, taskLabel: task.label || task.id });
      });
    });

    const endgameTaskSelected = state.timestampsSelectedEndgameTasks || {};
    const showNoneEndgame = !!endgameTaskSelected[TIMESTAMPS_NONE];
    const endgameTaskIds = Object.keys(endgameTaskSelected).filter((k) => k !== TIMESTAMPS_NONE);
    const showAllEndgameTasks = !showNoneEndgame && endgameTaskIds.length === 0;

    const endgameTaskLabelRow = document.createElement("div");
    endgameTaskLabelRow.style.display = "flex";
    endgameTaskLabelRow.style.alignItems = "center";
    endgameTaskLabelRow.style.gap = "0.5rem";
    endgameTaskLabelRow.style.marginTop = "1.5rem";
    const endgameTaskLabel = document.createElement("h4");
    endgameTaskLabel.className = "data-section-label";
    endgameTaskLabel.textContent = "Endgame tasks";
    endgameTaskLabel.style.margin = "0";
    endgameTaskLabelRow.appendChild(endgameTaskLabel);
    const unselectAllEndgameBtn = document.createElement("button");
    unselectAllEndgameBtn.type = "button";
    unselectAllEndgameBtn.className = "btn btn-ghost";
    const selectAllEndgameBtn = document.createElement("button");
    selectAllEndgameBtn.type = "button";
    selectAllEndgameBtn.className = "btn btn-ghost";
    selectAllEndgameBtn.textContent = "Select all";
    selectAllEndgameBtn.title = "Select all endgame tasks";
    selectAllEndgameBtn.addEventListener("click", () => {
      state.timestampsSelectedEndgameTasks = {};
      save();
      renderAll();
    });
    endgameTaskLabelRow.appendChild(selectAllEndgameBtn);
    unselectAllEndgameBtn.textContent = "Unselect all";
    unselectAllEndgameBtn.title = "Deselect all endgame tasks (show none)";
    unselectAllEndgameBtn.addEventListener("click", () => {
      state.timestampsSelectedEndgameTasks = { [TIMESTAMPS_NONE]: true };
      save();
      renderAll();
    });
    endgameTaskLabelRow.appendChild(unselectAllEndgameBtn);
    container.appendChild(endgameTaskLabelRow);
    const endgameTaskWrap = document.createElement("div");
    endgameTaskWrap.className = "timestamps-game-selector";
    endgameTaskWrap.style.display = "flex";
    endgameTaskWrap.style.flexWrap = "wrap";
    endgameTaskWrap.style.gap = "0.5rem";
    endgameTaskWrap.style.marginBottom = "0.75rem";
    allEndgameTasks.forEach(({ key, gameName, taskLabel }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timestamps-game-pill timestamps-endgame-pill";
      btn.textContent = taskLabel + (games.length > 1 ? " (" + gameName + ")" : "");
      btn.setAttribute("aria-pressed", (showAllEndgameTasks || endgameTaskSelected[key]) ? "true" : "false");
      if (showAllEndgameTasks || endgameTaskSelected[key]) btn.classList.add("filled");
      btn.addEventListener("click", () => {
        delete state.timestampsSelectedEndgameTasks[TIMESTAMPS_NONE];
        if (showAllEndgameTasks || endgameTaskSelected[key]) {
          if (showAllEndgameTasks) {
            const others = allEndgameTasks.filter((et) => et.key !== key).map((et) => et.key);
            state.timestampsSelectedEndgameTasks = {};
            others.forEach((k) => { state.timestampsSelectedEndgameTasks[k] = true; });
          } else {
            delete state.timestampsSelectedEndgameTasks[key];
          }
          if (Object.keys(state.timestampsSelectedEndgameTasks).filter((k) => k !== TIMESTAMPS_NONE).length === 0) state.timestampsSelectedEndgameTasks = { [TIMESTAMPS_NONE]: true };
        } else {
          state.timestampsSelectedEndgameTasks[key] = true;
          if (Object.keys(state.timestampsSelectedEndgameTasks).filter((k) => k !== TIMESTAMPS_NONE).length === allEndgameTasks.length) state.timestampsSelectedEndgameTasks = {};
        }
        save();
        renderAll();
      });
      endgameTaskWrap.appendChild(btn);
    });
    container.appendChild(endgameTaskWrap);

    const taskPoints = {};
    allEndgameTasks.forEach(({ key, gameId, taskId, gameName, taskLabel }) => {
      if (!showAllEndgameTasks && !endgameTaskSelected[key]) return;
      const events = getEndgameCompletionEventsForTrend(key);
      if (events.length === 0) return;
      const game = getGame(gameId);
      const task = (game?.endgame || []).find((et) => (et.id || et.label) === taskId);
      if (!game || !task) return;
      const limitUnit = task.timeLimitUnit === "day" ? "day" : "week";
      const hasExplicitLimit = task.timeLimitEvery != null || task.timeLimitUnit != null;
      const timeLimitMs = hasExplicitLimit ? getIntervalMs(task.timeLimitEvery, limitUnit) : getIntervalMs(task.frequencyEvery, (task.frequencyUnit === "day") ? "day" : "week");
      const byCycle = {};
      events.forEach((t) => {
        let cycleStartMs, cycleEndMs;
        if (t.cycleStartStr && t.cycleEndStr) {
          const startMom = getResetMomentForDateStr(task, game, t.cycleStartStr);
          const endMom = getResetMomentForDateStr(task, game, t.cycleEndStr);
          if (!startMom || !endMom || endMom.getTime() <= startMom.getTime()) return;
          cycleStartMs = startMom.getTime();
          cycleEndMs = endMom.getTime();
        } else {
          const cycleStart = getCycleStartForDate(task, t.dateStr, game);
          cycleStartMs = cycleStart.getTime();
          cycleEndMs = cycleStartMs + timeLimitMs;
        }
        let pct;
        if (t.skipped) {
          pct = 0;
        } else {
          const completionMs = new Date(t.dateStr + "T" + String(t.hour).padStart(2, "0") + ":00:00").getTime();
          const cycleLen = cycleEndMs - cycleStartMs;
          if (cycleLen <= 0) return;
          pct = ((cycleEndMs - completionMs) / cycleLen) * 100;
          pct = Math.max(0, Math.min(100, pct));
        }
        if (byCycle[cycleStartMs] == null || pct > byCycle[cycleStartMs]) byCycle[cycleStartMs] = pct;
      });
      const sortedCycles = Object.keys(byCycle).map(Number).sort((a, b) => a - b);
      if (sortedCycles.length > 0) {
        taskPoints[key] = { label: taskLabel, points: sortedCycles.map((ms) => byCycle[ms]) };
      }
    });

    const endgameLabel = document.createElement("h4");
    endgameLabel.className = "data-section-label";
    endgameLabel.textContent = "Endgame trend: completion # vs % time remaining (100% = start of cycle, 0% = deadline)";
    endgameLabel.style.marginTop = "1rem";
    container.appendChild(endgameLabel);
    const lineGraphWrap = document.createElement("div");
    lineGraphWrap.className = "timestamps-line-graph";
    const graphWidth = 400;
    const graphHeight = 200;
    const padding = { top: 20, right: 20, bottom: 40, left: 45 };
    const plotWidth = graphWidth - padding.left - padding.right;
    const plotHeight = graphHeight - padding.top - padding.bottom;
    const maxX = Math.max(1, ...Object.values(taskPoints).map((tp) => tp.points.length));
    const xDivisor = maxX > 1 ? maxX - 1 : 1;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + graphWidth + " " + graphHeight);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "auto");
    svg.style.maxWidth = graphWidth + "px";
    svg.style.display = "block";
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const colors = ["var(--pie-endgame)", "var(--pie-dailies)", "var(--pie-weeklies)", "#f472b6", "#fbbf24"];
    Object.keys(taskPoints).forEach((key, idx) => {
      const tp = taskPoints[key];
      if (tp.points.length === 0) return;
      const pathD = tp.points.map((pct, i) => {
        const x = padding.left + (i / xDivisor) * plotWidth;
        const y = padding.top + plotHeight - (pct / 100) * plotHeight;
        return (i === 0 ? "M" : "L") + x + "," + y;
      }).join(" ");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", colors[idx % colors.length]);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
      tp.points.forEach((pct, i) => {
        const x = padding.left + (i / xDivisor) * plotWidth;
        const y = padding.top + plotHeight - (pct / 100) * plotHeight;
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", "4");
        circle.setAttribute("fill", colors[idx % colors.length]);
        circle.setAttribute("stroke", "var(--bg)");
        circle.setAttribute("stroke-width", "1");
        svg.appendChild(circle);
      });
    });
    const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    yAxis.setAttribute("x1", padding.left);
    yAxis.setAttribute("y1", padding.top);
    yAxis.setAttribute("x2", padding.left);
    yAxis.setAttribute("y2", padding.top + plotHeight);
    yAxis.setAttribute("stroke", "var(--border)");
    yAxis.setAttribute("stroke-width", "1");
    svg.insertBefore(yAxis, svg.firstChild);
    const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    xAxis.setAttribute("x1", padding.left);
    xAxis.setAttribute("y1", padding.top + plotHeight);
    xAxis.setAttribute("x2", padding.left + plotWidth);
    xAxis.setAttribute("y2", padding.top + plotHeight);
    xAxis.setAttribute("stroke", "var(--border)");
    xAxis.setAttribute("stroke-width", "1");
    svg.insertBefore(xAxis, svg.firstChild);
    for (let p = 0; p <= 100; p += 25) {
      const y = padding.top + plotHeight - (p / 100) * plotHeight;
      const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick.setAttribute("x1", padding.left - 4);
      tick.setAttribute("y1", y);
      tick.setAttribute("x2", padding.left);
      tick.setAttribute("y2", y);
      tick.setAttribute("stroke", "var(--border)");
      svg.insertBefore(tick, svg.firstChild);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", padding.left - 8);
      label.setAttribute("y", y + 4);
      label.setAttribute("text-anchor", "end");
      label.setAttribute("fill", "var(--text-muted)");
      label.setAttribute("font-size", "10");
      label.textContent = p + "%";
      svg.insertBefore(label, svg.firstChild);
    }
    for (let i = 1; i <= maxX; i += Math.max(1, Math.floor(maxX / 5))) {
      const x = padding.left + ((i - 1) / xDivisor) * plotWidth;
      const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
      tick.setAttribute("x1", x);
      tick.setAttribute("y1", padding.top + plotHeight);
      tick.setAttribute("x2", x);
      tick.setAttribute("y2", padding.top + plotHeight + 4);
      tick.setAttribute("stroke", "var(--border)");
      svg.insertBefore(tick, svg.firstChild);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", x);
      label.setAttribute("y", padding.top + plotHeight + 16);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", "var(--text-muted)");
      label.setAttribute("font-size", "10");
      label.textContent = i;
      svg.insertBefore(label, svg.firstChild);
    }
    const legendWrap = document.createElement("div");
    legendWrap.className = "timestamps-line-legend";
    legendWrap.style.display = "flex";
    legendWrap.style.flexWrap = "wrap";
    legendWrap.style.gap = "1rem";
    legendWrap.style.marginTop = "0.5rem";
    legendWrap.style.fontSize = "0.85rem";
    Object.keys(taskPoints).forEach((key, idx) => {
      const tp = taskPoints[key];
      if (tp.points.length === 0) return;
      const item = document.createElement("span");
      item.style.display = "inline-flex";
      item.style.alignItems = "center";
      item.style.gap = "0.35rem";
      const dot = document.createElement("span");
      dot.style.width = "10px";
      dot.style.height = "10px";
      dot.style.borderRadius = "50%";
      dot.style.background = colors[idx % colors.length];
      item.appendChild(dot);
      item.appendChild(document.createTextNode(escapeHtml(tp.label)));
      legendWrap.appendChild(item);
    });
    lineGraphWrap.appendChild(svg);
    if (Object.keys(taskPoints).length > 0) lineGraphWrap.appendChild(legendWrap);
    if (Object.keys(taskPoints).length === 0) {
      const empty = document.createElement("p");
      empty.style.color = "var(--text-muted)";
      empty.style.fontSize = "0.9rem";
      empty.textContent = "No endgame completion data. Complete endgame tasks to see the trend.";
      lineGraphWrap.appendChild(empty);
    }
    container.appendChild(lineGraphWrap);
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  const CURRENCY_PIE_COLORS = ["#34d399", "#7c3aed", "#60a5fa", "#f472b6", "#fbbf24", "#22d3ee", "#a78bfa", "#fb923c"];

  function createCompletionPieBox(title, completed, total, useCleared) {
    const skipped = total - completed;
    const pct = total ? (completed / total) * 360 : 0;
    const labelDone = useCleared ? "Cleared" : "Completed";
    const box = document.createElement("div");
    box.className = "pie-box";
    box.innerHTML =
      "<h3>" + escapeHtml(title) + "</h3>" +
      "<div class=\"pie-chart\" style=\"--pct: " + pct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">" + labelDone + ": " + completed + " (" + (total ? Math.round((completed / total) * 100) : 0) + "%)</span>" +
      "<span class=\"pie-legend-item skipped\">Skipped: " + skipped + " (" + (total ? Math.round((skipped / total) * 100) : 0) + "%)</span>" +
      "</div>";
    return box;
  }

  function createExtracurricularCurrencyPieBox(task, earned, potential) {
    const pot = Math.max(0, Number(potential) || 0);
    const e = Math.max(0, Number(earned) || 0);
    const total = Math.max(pot, e, 1);
    const earnedPct = total ? (e / total) * 360 : 0;
    const box = document.createElement("div");
    box.className = "pie-box";
    if (total === 0 || (e === 0 && pot === 0)) {
      box.innerHTML =
        "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
        "<div class=\"pie-chart pie-chart-empty\"></div>" +
        "<div class=\"pie-legend\">No currency earned yet</div>";
      return box;
    }
    box.innerHTML =
      "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
      "<div class=\"pie-chart\" style=\"--pct: " + earnedPct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">Earned: " + e + (total ? " (" + Math.round((e / total) * 100) + "%)" : "") + "</span>" +
      "<span class=\"pie-legend-item skipped\">Potential: " + pot + "</span>" +
      "</div>";
    return box;
  }

  function createEndgameCurrencyPieBox(task, earned, attempted) {
    const potential = Math.max(0, Number(task && task.currency) || 0) * Math.max(0, attempted);
    const total = Math.max(potential, earned, 1);
    const earnedPct = total ? (earned / total) * 360 : 0;
    const box = document.createElement("div");
    box.className = "pie-box";
    if (total === 0 || (earned === 0 && potential === 0)) {
      box.innerHTML =
        "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
        "<div class=\"pie-chart pie-chart-empty\"></div>" +
        "<div class=\"pie-legend\">No currency earned yet</div>";
      return box;
    }
    box.innerHTML =
      "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
      "<div class=\"pie-chart\" style=\"--pct: " + earnedPct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">Earned: " + earned + (total ? " (" + Math.round((earned / total) * 100) + "%)" : "") + "</span>" +
      "<span class=\"pie-legend-item skipped\">Potential: " + potential + "</span>" +
      "</div>";
    return box;
  }

  function createCurrencyPieBox(title, segments, emptyMessage) {
    const total = segments.reduce((s, x) => s + x.value, 0);
    if (total === 0) {
      const box = document.createElement("div");
      box.className = "pie-box";
      box.innerHTML =
        "<h3>" + escapeHtml(title) + "</h3>" +
        "<div class=\"pie-chart pie-chart-empty\"></div>" +
        "<div class=\"pie-legend\">" + escapeHtml(emptyMessage || "No data") + "</div>";
      return box;
    }
    let gradientParts = [];
    let acc = 0;
    segments.forEach((seg, i) => {
      const deg = (seg.value / total) * 360;
      if (deg > 0) {
        gradientParts.push(seg.color + " " + acc + "deg " + (acc + deg) + "deg");
        acc += deg;
      }
    });
    const box = document.createElement("div");
    box.className = "pie-box";
    let legendHtml = "";
    segments.forEach((seg) => {
      const pct = total ? Math.round((seg.value / total) * 100) : 0;
      const valStr = typeof seg.value === "number" && !Number.isInteger(seg.value) ? Number(seg.value).toFixed(2) : String(seg.value);
      legendHtml += "<span class=\"pie-legend-item\" style=\"--dot-color:" + seg.color + "\">" + escapeHtml(seg.label) + ": " + valStr + " (" + pct + "%)</span>";
    });
    box.innerHTML =
      "<h3>" + escapeHtml(title) + "</h3>" +
      "<div class=\"pie-chart pie-chart-multi\" style=\"background: conic-gradient(" + gradientParts.join(", ") + ")\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" + legendHtml + "</div>";
    return box;
  }

