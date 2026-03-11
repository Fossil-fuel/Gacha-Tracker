  function getHistoryDWEForDate(dateStr) {
    const available = getTasksAvailableOnDate(dateStr);
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    return {
      dCompleted: (dayData.dailies || []).length,
      dTotal: (available.dailies || []).length,
      wCompleted: (dayData.weeklies || []).length,
      wTotal: (available.weeklies || []).length,
      eCompleted: (dayData.endgame || []).length,
      eTotal: (available.endgame || []).length,
    };
  }

  function getHistoryCompletedTaskLabels(dateStr) {
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const labels = { dailies: [], weeklies: [], endgame: [] };
    (dayData.dailies || []).forEach((gameId) => {
      const game = getGame(gameId);
      labels.dailies.push(game ? game.name : gameId);
    });
    (dayData.weeklies || []).forEach((key) => {
      const dot = key.indexOf(".");
      const gId = dot >= 0 ? key.slice(0, dot) : key;
      const tId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gId);
      const task = (game?.weeklies || []).find((t) => (t.id || t.label) === tId);
      labels.weeklies.push(task ? task.label : tId);
    });
    (dayData.endgame || []).forEach((key) => {
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
    const now = new Date();
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
    header.appendChild(weeklyBtn);
    container.appendChild(header);

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
    container.appendChild(grid);
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
      const now = new Date();
      if (state.historyMonth == null) state.historyMonth = now.getMonth();
      if (state.historyYear == null) state.historyYear = now.getFullYear();
      save();
      renderAll();
    });
    calHeader.appendChild(historyBtn);
    calendarSection.appendChild(calHeader);
    const calGrid = document.createElement("div");
    calGrid.className = "attendance-calendar-grid";
    const weekDates = getWeekDates();
    const todayStr = getDateStr();
    weekDates.forEach((d) => {
      const dateStr = getDateStr(d);
      const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
      const available = getTasksAvailableOnDate(dateStr);
      const completedCount = dayData.dailies.length + dayData.weeklies.length + dayData.endgame.length;
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
        dayData.weeklies.forEach((key) => {
          const dot = key.indexOf(".");
          const gId = dot >= 0 ? key.slice(0, dot) : key;
          const tId = dot >= 0 ? key.slice(dot + 1) : "";
          const game = getGame(gId);
          const task = (game?.weeklies || []).find((t) => (t.id || t.label) === tId);
          addPart(task ? task.label : tId, "weeklies");
        });
        dayData.endgame.forEach((key) => {
          const dot = key.indexOf(".");
          const gId = dot >= 0 ? key.slice(0, dot) : key;
          const tId = dot >= 0 ? key.slice(dot + 1) : "";
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

