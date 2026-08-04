  function getHistoryDWEForDate(dateStr, availableOpt) {
    const available = availableOpt || getTasksAvailableOnDate(dateStr);
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

  function getHistoryCompletedTaskLabels(dateStr, availableOpt) {
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const available = availableOpt || getTasksAvailableOnDate(dateStr);
    const labels = { dailies: [], weeklies: [], endgame: [] };
    (dayData.dailies || []).forEach((gameId) => {
      const game = getGame(gameId);
      labels.dailies.push({ text: game ? game.name : gameId, carried: false });
    });
    (available.weeklies || []).filter((item) => (dayData.weeklies || []).includes(item.key)).forEach((item) => {
      const key = item.key;
      const dot = key.indexOf(".");
      const gId = dot >= 0 ? key.slice(0, dot) : key;
      const tId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gId);
      const task = (game?.weeklies || []).find((t) => (t.id || t.label) === tId);
      const carried = typeof isCarriedCompletionMark === "function" && isCarriedCompletionMark("weeklies", key, dateStr);
      labels.weeklies.push({
        text: (task ? task.label : tId) + (carried ? " (carried)" : ""),
        carried: !!carried,
      });
    });
    (available.endgame || []).filter((item) => (dayData.endgame || []).includes(item.key)).forEach((item) => {
      const key = item.key;
      const dot = key.indexOf(".");
      const gId = dot >= 0 ? key.slice(0, dot) : key;
      const tId = dot >= 0 ? key.slice(dot + 1) : "";
      const game = getGame(gId);
      const task = (game?.endgame || []).find((t) => (t.id || t.label) === tId);
      const carried = typeof isCarriedCompletionMark === "function" && isCarriedCompletionMark("endgame", key, dateStr);
      labels.endgame.push({
        text: (task ? task.label : tId) + (carried ? " (carried)" : ""),
        carried: !!carried,
      });
    });
    return labels;
  }

  /** H1: one availability scan per day for History DWE bars + tooltips. */
  function buildHistoryDayModel(dateStr) {
    const available = getTasksAvailableOnDate(dateStr);
    return {
      dateStr,
      available,
      dwe: getHistoryDWEForDate(dateStr, available),
      labels: getHistoryCompletedTaskLabels(dateStr, available),
    };
  }

  // H2: cache day models across History renders; wipe when completion/games/format inputs change.
  let historyDayModelCache = null; // { invalidationKey, models: Map<dateStr, model> }

  function getHistoryDayModelCacheKey() {
    const games = typeof getAllGames === "function" ? getAllGames() : [];
    const gameSig = games
      .map((g) => {
        const w = (g.weeklies || []).map((t) => t.id || t.label).join(",");
        const e = (g.endgame || []).map((t) => t.id || t.label).join(",");
        return g.id + ":w[" + w + "]:e[" + e + "]";
      })
      .join("|");
    const tz =
      typeof getRecordingTimezone === "function"
        ? getRecordingTimezone()
        : typeof getAppTimezone === "function"
          ? getAppTimezone()
          : "";
    return [
      state.dataVersion || 0,
      state.dateFormat || "",
      state.firstDayOfWeek ?? "",
      tz,
      gameSig,
    ].join("::");
  }

  function getCachedHistoryDayModel(dateStr, stats) {
    const inv = getHistoryDayModelCacheKey();
    if (!historyDayModelCache || historyDayModelCache.invalidationKey !== inv) {
      historyDayModelCache = { invalidationKey: inv, models: new Map() };
    }
    const hit = historyDayModelCache.models.get(dateStr);
    if (hit) {
      if (stats) stats.hits++;
      return hit;
    }
    if (stats) stats.misses++;
    const model = buildHistoryDayModel(dateStr);
    historyDayModelCache.models.set(dateStr, model);
    // Soft cap: keep roughly a few months of visited days.
    if (historyDayModelCache.models.size > 120) {
      const oldest = historyDayModelCache.models.keys().next().value;
      if (oldest != null) historyDayModelCache.models.delete(oldest);
    }
    return model;
  }

  let historyDweTooltipActive = null;
  let historyDweTooltipWrap = null;

  function hideHistoryDweTooltip() {
    const tip = historyDweTooltipActive;
    const wrap = historyDweTooltipWrap;
    historyDweTooltipActive = null;
    historyDweTooltipWrap = null;
    if (!tip) return;
    tip.classList.remove("is-open");
    tip.style.position = "";
    tip.style.left = "";
    tip.style.top = "";
    tip.style.bottom = "";
    tip.style.transform = "";
    tip.style.zIndex = "";
    tip.style.maxWidth = "";
    if (wrap && tip.parentNode !== wrap) wrap.appendChild(tip);
    else if (!wrap && tip.parentNode === document.body) tip.remove();
  }

  function positionHistoryDweTooltip(wrap, tip) {
    const rect = wrap.getBoundingClientRect();
    tip.style.position = "fixed";
    tip.style.bottom = "auto";
    tip.style.zIndex = "10000";
    tip.style.maxWidth = "min(22rem, calc(100vw - 1rem))";
    tip.style.left = Math.max(8, rect.left) + "px";
    tip.style.top = rect.top + "px";
    tip.style.transform = "translateY(-100%) translateY(-0.35rem)";
    const tipRect = tip.getBoundingClientRect();
    if (tipRect.top < 8) {
      tip.style.top = rect.bottom + "px";
      tip.style.transform = "translateY(0.35rem)";
    }
    const tipRect2 = tip.getBoundingClientRect();
    if (tipRect2.right > window.innerWidth - 8) {
      tip.style.left = Math.max(8, window.innerWidth - tipRect2.width - 8) + "px";
    }
  }

  function normalizeHistoryTipItems(labelItems) {
    return (labelItems || []).map((item) => (typeof item === "string" ? { text: item, carried: false } : item));
  }

  function createHistoryDweTooltipEl(items, typeName) {
    const tooltip = document.createElement("div");
    tooltip.className = "history-dwe-tooltip history-dwe-tooltip-" + typeName;
    tooltip.setAttribute("role", "tooltip");
    items.forEach((i) => {
      const bit = document.createElement("div");
      bit.className =
        "history-dwe-tooltip-item attendance-tooltip-" +
        typeName +
        (i.carried ? " history-dwe-tooltip-carried" : "");
      const base = String(i.text || "").replace(/\s*\(carried\)\s*$/i, "");
      bit.appendChild(document.createTextNode(base));
      if (i.carried) {
        const tag = document.createElement("span");
        tag.className = "history-dwe-tooltip-carried-tag";
        tag.textContent = " (carried)";
        bit.appendChild(tag);
      }
      tooltip.appendChild(bit);
    });
    return tooltip;
  }

  function ensureHistoryDweTooltip(wrap) {
    if (historyDweTooltipWrap === wrap && historyDweTooltipActive) return historyDweTooltipActive;
    let tip = wrap.querySelector(".history-dwe-tooltip");
    if (tip) return tip;
    const items = wrap._historyTipItems;
    if (!items || !items.length) return null;
    tip = createHistoryDweTooltipEl(items, wrap._historyTipType || "dailies");
    wrap.appendChild(tip);
    return tip;
  }

  function showHistoryDweTooltip(wrap) {
    const tip = ensureHistoryDweTooltip(wrap);
    if (!tip) return;
    if (historyDweTooltipActive && historyDweTooltipActive !== tip) hideHistoryDweTooltip();
    historyDweTooltipActive = tip;
    historyDweTooltipWrap = wrap;
    document.body.appendChild(tip);
    tip.classList.add("is-open");
    positionHistoryDweTooltip(wrap, tip);
  }

  function historyBarWrapFromEvent(root, target) {
    if (!target || !target.closest) return null;
    const wrap = target.closest(".history-dwe-bar-wrap");
    if (!wrap || !root.contains(wrap)) return null;
    if (!wrap._historyTipItems || !wrap._historyTipItems.length) return null;
    return wrap;
  }

  function bindHistoryDweTooltips(root) {
    if (!root) return;
    // H4: delegate so H3 grid swaps do not rebind every bar; tip DOM is built on first show.
    if (!root._historyDweTipDelegated) {
      root._historyDweTipDelegated = true;
      root.addEventListener("mouseover", (e) => {
        const wrap = historyBarWrapFromEvent(root, e.target);
        if (!wrap) return;
        if (historyDweTooltipWrap === wrap && historyDweTooltipActive) return;
        showHistoryDweTooltip(wrap);
      });
      root.addEventListener("mouseout", (e) => {
        const wrap = historyBarWrapFromEvent(root, e.target);
        if (!wrap) return;
        if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
        if (historyDweTooltipWrap === wrap) hideHistoryDweTooltip();
      });
      root.addEventListener("focusin", (e) => {
        const wrap = historyBarWrapFromEvent(root, e.target);
        if (!wrap) return;
        showHistoryDweTooltip(wrap);
      });
      root.addEventListener("focusout", (e) => {
        const wrap = historyBarWrapFromEvent(root, e.target);
        if (!wrap) return;
        if (e.relatedTarget && wrap.contains(e.relatedTarget)) return;
        if (historyDweTooltipWrap === wrap) hideHistoryDweTooltip();
      });
    }
    if (!root._historyDweScrollBound) {
      root._historyDweScrollBound = true;
      root.addEventListener("scroll", hideHistoryDweTooltip, { passive: true });
    }
    if (!bindHistoryDweTooltips._windowBound) {
      bindHistoryDweTooltips._windowBound = true;
      window.addEventListener("scroll", hideHistoryDweTooltip, true);
      window.addEventListener("resize", hideHistoryDweTooltip);
    }
  }

  const HISTORY_MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function resolveHistoryMonthYear(now) {
    let month = state.historyMonth != null ? Number(state.historyMonth) : now.getMonth();
    let year = state.historyYear != null ? Number(state.historyYear) : now.getFullYear();
    if (!Number.isFinite(month) || month < 0 || month > 11) month = now.getMonth();
    if (!Number.isFinite(year) || year < 1970 || year > 2100) year = now.getFullYear();
    return { month, year };
  }

  function getHistoryYearOptions(now, selectedYear) {
    const years = new Set();
    const nowY = now.getFullYear();
    years.add(nowY);
    years.add(selectedYear);
    Object.keys(state.completionByDate || {}).forEach((ds) => {
      if (/^\d{4}-/.test(ds)) years.add(Number(ds.slice(0, 4)));
    });
    (state.completionTimestamps || []).forEach((t) => {
      if (t && isValidDateStr(t.dateStr)) years.add(Number(t.dateStr.slice(0, 4)));
    });
    for (let y = nowY - 1; y <= nowY + 2; y++) years.add(y);
    return [...years].filter((y) => Number.isFinite(y) && y >= 1970 && y <= 2100).sort((a, b) => a - b);
  }

  function buildHistoryDweBar(typeLetter, completed, total, labelItems, typeName) {
    const pct = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
    const items = normalizeHistoryTipItems(labelItems);
    const wrap = document.createElement("div");
    wrap.className = "history-dwe-bar-wrap history-dwe-bar-wrap-" + typeName;
    const allCarried = items.length > 0 && items.every((i) => i.carried);
    if (allCarried) wrap.classList.add("history-dwe-bar-wrap-carried");
    else if (items.some((i) => i.carried)) wrap.classList.add("history-dwe-bar-wrap-mixed");
    const label = document.createElement("span");
    label.className = "history-dwe-label";
    label.textContent = typeLetter;
    wrap.appendChild(label);
    const barEl = document.createElement("div");
    barEl.className = "history-dwe-bar history-dwe-bar-" + typeLetter.toLowerCase();
    barEl.innerHTML = "<span class=\"history-dwe-fill\" style=\"width:" + pct + "%\"></span><span class=\"history-dwe-fraction\">" + escapeHtml(String(completed) + "/" + String(total)) + "</span>";
    wrap.appendChild(barEl);
    if (allCarried) {
      const mark = document.createElement("span");
      mark.className = "history-dwe-carried-mark";
      mark.setAttribute("aria-hidden", "true");
      mark.title = "Carried from earlier in cycle";
      mark.textContent = "↻";
      wrap.appendChild(mark);
    }
    // H4: keep labels for aria / first hover; tip DOM is created in ensureHistoryDweTooltip.
    if (items.length > 0) {
      wrap._historyTipItems = items;
      wrap._historyTipType = typeName;
    }
    return wrap;
  }

  function historyDayAriaLabel(dateStr, dwe, taskLabels) {
    const dateLabel = typeof formatDate === "function" ? formatDate(dateStr) : dateStr;
    const parts = [
      "Dailies " + dwe.dCompleted + " of " + dwe.dTotal,
      "Weeklies " + dwe.wCompleted + " of " + dwe.wTotal,
      "Endgame " + dwe.eCompleted + " of " + dwe.eTotal,
    ];
    const finishedNames = []
      .concat(taskLabels.dailies || [])
      .concat(taskLabels.weeklies || [])
      .concat(taskLabels.endgame || [])
      .filter((i) => i && !i.carried)
      .map((i) => i.text);
    const carriedNames = []
      .concat(taskLabels.weeklies || [])
      .concat(taskLabels.endgame || [])
      .filter((i) => i && i.carried)
      .map((i) => i.text);
    if (finishedNames.length) parts.push("Finished: " + finishedNames.join(", "));
    if (carriedNames.length) parts.push("Carried: " + carriedNames.join(", "));
    return dateLabel + ". " + parts.join(". ") + ". Press Enter to edit.";
  }

  function buildHistoryCalendarGrid(year, month, todayStr, historyDayCacheStats) {
    const grid = document.createElement("div");
    grid.className = "history-calendar-grid";
    grid.setAttribute("role", "grid");
    grid.setAttribute("aria-label", "Completion history calendar");
    const frag = document.createDocumentFragment();
    const firstDay = state.firstDayOfWeek === 1 ? 1 : 0;
    const dayNamesOrdered = firstDay === 1 ? [...DAY_NAMES.slice(1), DAY_NAMES[0]] : DAY_NAMES;
    for (let i = 0; i < 7; i++) {
      const th = document.createElement("div");
      th.className = "history-calendar-weekday";
      th.textContent = dayNamesOrdered[i];
      frag.appendChild(th);
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
    const dayCells = [];
    cellDates.forEach(({ dateStr, isCurrentMonth, dayNum }, cellIndex) => {
      const cell = document.createElement("div");
      cell.className = "history-calendar-day";
      cell.setAttribute("role", "gridcell");
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
      editBtn.tabIndex = -1;
      editBtn.setAttribute("aria-label", "Edit " + (typeof formatDate === "function" ? formatDate(dateStr) : dateStr));
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openCalendarDayModal(dateStr);
      });
      topRow.appendChild(editBtn);
      cell.appendChild(topRow);
      const dayModel = getCachedHistoryDayModel(dateStr, historyDayCacheStats);
      const dwe = dayModel.dwe;
      const taskLabels = dayModel.labels;
      cell.appendChild(buildHistoryDweBar("D", dwe.dCompleted, dwe.dTotal, taskLabels.dailies, "dailies"));
      cell.appendChild(buildHistoryDweBar("W", dwe.wCompleted, dwe.wTotal, taskLabels.weeklies, "weeklies"));
      cell.appendChild(buildHistoryDweBar("E", dwe.eCompleted, dwe.eTotal, taskLabels.endgame, "endgame"));
      cell.setAttribute("aria-label", historyDayAriaLabel(dateStr, dwe, taskLabels));
      cell.tabIndex = -1;
      cell.dataset.cellIndex = String(cellIndex);
      cell.addEventListener("click", (e) => {
        if (e.target && e.target.closest && e.target.closest(".history-calendar-day-edit")) return;
        openCalendarDayModal(dateStr);
      });
      cell.addEventListener("keydown", (e) => {
        const cols = 7;
        let next = cellIndex;
        if (e.key === "ArrowRight") next = cellIndex + 1;
        else if (e.key === "ArrowLeft") next = cellIndex - 1;
        else if (e.key === "ArrowDown") next = cellIndex + cols;
        else if (e.key === "ArrowUp") next = cellIndex - cols;
        else if (e.key === "Home") next = cellIndex - (cellIndex % cols);
        else if (e.key === "End") next = cellIndex - (cellIndex % cols) + (cols - 1);
        else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openCalendarDayModal(dateStr);
          return;
        } else {
          return;
        }
        e.preventDefault();
        if (next < 0 || next >= dayCells.length) return;
        dayCells[cellIndex].tabIndex = -1;
        dayCells[next].tabIndex = 0;
        dayCells[next].focus();
      });
      dayCells.push(cell);
      frag.appendChild(cell);
    });
    const focusIdx = Math.max(
      0,
      dayCells.findIndex((c) => c.classList.contains("history-calendar-day-today"))
    );
    if (dayCells[focusIdx]) dayCells[focusIdx].tabIndex = 0;
    grid.appendChild(frag);
    return grid;
  }

  function mountHistoryCalendarGrid(grid, gridWrap, historyDayCacheStats) {
    const todayCell = grid.querySelector(".history-calendar-day-today");
    if (todayCell && gridWrap.scrollWidth > gridWrap.clientWidth) {
      requestAnimationFrame(function () {
        const scrollLeft = todayCell.offsetLeft - (gridWrap.clientWidth / 2) + (todayCell.offsetWidth / 2);
        gridWrap.scrollLeft = Math.max(0, scrollLeft);
      });
    }
    bindHistoryDweTooltips(gridWrap);
    if (
      typeof isPerfDebugEnabled === "function" &&
      isPerfDebugEnabled() &&
      historyDayCacheStats.hits + historyDayCacheStats.misses > 0
    ) {
      console.log(
        "[perf] historyDayModelCache: hits=" +
          historyDayCacheStats.hits +
          " misses=" +
          historyDayCacheStats.misses +
          " size=" +
          (historyDayModelCache && historyDayModelCache.models ? historyDayModelCache.models.size : 0)
      );
    }
  }

  function syncHistoryMonthChrome(container, month, year, now) {
    const monthLabel = container.querySelector(".history-month-label");
    if (monthLabel) monthLabel.textContent = HISTORY_MONTH_NAMES[month] + " " + year;
    const monthSelect = container.querySelector(".history-month-select");
    if (monthSelect) monthSelect.value = String(month);
    const yearSelect = container.querySelector(".history-year-select");
    if (yearSelect) {
      const wanted = String(year);
      if (![...yearSelect.options].some((o) => o.value === wanted)) {
        yearSelect.innerHTML = "";
        getHistoryYearOptions(now, year).forEach((y) => {
          const opt = document.createElement("option");
          opt.value = String(y);
          opt.textContent = String(y);
          yearSelect.appendChild(opt);
        });
      }
      yearSelect.value = wanted;
    }
  }

  function renderAttendanceHistory(container) {
    hideHistoryDweTooltip();
    const historyDayCacheStats = { hits: 0, misses: 0 };
    const now = getSimulatedNow();
    const { month, year } = resolveHistoryMonthYear(now);
    const todayStr = getDateStr();

    const existingShell = container.querySelector("[data-history-shell]");
    const existingWrap = container.querySelector(".history-calendar-scroll-wrap");
    if (existingShell && existingWrap) {
      syncHistoryMonthChrome(container, month, year, now);
      const grid = buildHistoryCalendarGrid(year, month, todayStr, historyDayCacheStats);
      const oldGrid = existingWrap.querySelector(".history-calendar-grid");
      if (oldGrid) oldGrid.replaceWith(grid);
      else existingWrap.appendChild(grid);
      mountHistoryCalendarGrid(grid, existingWrap, historyDayCacheStats);
      return;
    }

    container.innerHTML = "";

    const header = document.createElement("div");
    header.className = "history-header";
    header.setAttribute("data-history-shell", "1");
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
    const monthWrap = document.createElement("div");
    monthWrap.className = "history-month-wrap";
    const monthLabel = document.createElement("button");
    monthLabel.type = "button";
    monthLabel.className = "history-month-label";
    monthLabel.textContent = HISTORY_MONTH_NAMES[month] + " " + year;
    monthLabel.setAttribute("aria-haspopup", "dialog");
    monthLabel.setAttribute("aria-expanded", "false");
    monthLabel.setAttribute("aria-label", "Choose month and year");
    monthLabel.title = "Click to choose month and year";
    const picker = document.createElement("div");
    picker.className = "history-month-year-picker";
    picker.hidden = true;
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "Month and year");

    function closeHistoryMonthYearPicker() {
      picker.hidden = true;
      monthLabel.setAttribute("aria-expanded", "false");
      monthWrap.classList.remove("is-open");
      if (monthWrap._outsideClose) {
        document.removeEventListener("click", monthWrap._outsideClose);
        monthWrap._outsideClose = null;
      }
    }

    function openHistoryMonthYearPicker() {
      picker.hidden = false;
      monthLabel.setAttribute("aria-expanded", "true");
      monthWrap.classList.add("is-open");
      if (yearSelect) yearSelect.focus();
      if (monthWrap._outsideClose) document.removeEventListener("click", monthWrap._outsideClose);
      monthWrap._outsideClose = () => closeHistoryMonthYearPicker();
      setTimeout(() => document.addEventListener("click", monthWrap._outsideClose), 0);
    }

    prevBtn.addEventListener("click", () => {
      closeHistoryMonthYearPicker();
      const cur = resolveHistoryMonthYear(getSimulatedNow());
      if (cur.month === 0) {
        state.historyMonth = 11;
        state.historyYear = cur.year - 1;
      } else {
        state.historyMonth = cur.month - 1;
        state.historyYear = cur.year;
      }
      save();
      renderActiveTab();
    });

    const monthSelect = document.createElement("select");
    monthSelect.className = "history-month-select settings-select";
    monthSelect.setAttribute("aria-label", "Month");
    HISTORY_MONTH_NAMES.forEach((name, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = name;
      if (i === month) opt.selected = true;
      monthSelect.appendChild(opt);
    });
    const yearSelect = document.createElement("select");
    yearSelect.className = "history-year-select settings-select";
    yearSelect.setAttribute("aria-label", "Year");
    getHistoryYearOptions(now, year).forEach((y) => {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === year) opt.selected = true;
      yearSelect.appendChild(opt);
    });
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "btn btn-ghost btn-sm";
    applyBtn.textContent = "Go";
    function applyMonthYear() {
      const nextMonth = Number(monthSelect.value);
      const nextYear = Number(yearSelect.value);
      if (!Number.isFinite(nextMonth) || nextMonth < 0 || nextMonth > 11) return;
      if (!Number.isFinite(nextYear) || nextYear < 1970 || nextYear > 2100) return;
      state.historyMonth = nextMonth;
      state.historyYear = nextYear;
      closeHistoryMonthYearPicker();
      save();
      renderActiveTab();
    }
    applyBtn.addEventListener("click", applyMonthYear);
    monthSelect.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyMonthYear();
      }
    });
    yearSelect.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyMonthYear();
      }
    });
    picker.appendChild(monthSelect);
    picker.appendChild(yearSelect);
    picker.appendChild(applyBtn);
    monthLabel.addEventListener("click", (e) => {
      e.stopPropagation();
      if (picker.hidden) openHistoryMonthYearPicker();
      else closeHistoryMonthYearPicker();
    });
    picker.addEventListener("click", (e) => e.stopPropagation());
    monthWrap.appendChild(monthLabel);
    monthWrap.appendChild(picker);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn-ghost";
    nextBtn.textContent = "Next ›";
    nextBtn.addEventListener("click", () => {
      closeHistoryMonthYearPicker();
      const cur = resolveHistoryMonthYear(getSimulatedNow());
      if (cur.month === 11) {
        state.historyMonth = 0;
        state.historyYear = cur.year + 1;
      } else {
        state.historyMonth = cur.month + 1;
        state.historyYear = cur.year;
      }
      save();
      renderActiveTab();
    });
    controls.appendChild(prevBtn);
    controls.appendChild(monthWrap);
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
      renderActiveTab();
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
      renderActiveTab();
    });
    header.appendChild(weeklyBtn);
    header.appendChild(timestampsBtn);
    container.appendChild(header);

    const gridWrap = document.createElement("div");
    gridWrap.className = "history-calendar-scroll-wrap";
    const grid = buildHistoryCalendarGrid(year, month, todayStr, historyDayCacheStats);
    gridWrap.appendChild(grid);
    container.appendChild(gridWrap);

    const legend = document.createElement("p");
    legend.className = "history-calendar-legend";
    legend.textContent = "Solid bars = finished that day. Muted bars = still marked complete from an earlier day in the same weekly/endgame cycle (fill-remaining).";
    container.appendChild(legend);

    mountHistoryCalendarGrid(grid, gridWrap, historyDayCacheStats);
  }

  let lastAttendanceViewKey = "";

  function getAttendanceViewKey() {
    return [
      state.dataVersion || 0,
      state.attendanceView,
      state.historyMonth,
      state.historyYear,
      state.dateFormat,
      state.firstDayOfWeek,
      JSON.stringify(state.attendancePieInclude || {}),
      JSON.stringify(state.timestampsSelectedGameIds || {}),
      JSON.stringify(state.timestampsSelectedEndgameTasks || {}),
      state.timestampsEndgamePickerGameId || "",
      getAllGames().map((g) => g.id).join(","),
    ].join("|");
  }

  function renderAttendance() {
    const container = document.getElementById("attendanceContainer");
    if (!container) return;
    const viewKey = getAttendanceViewKey();
    if (viewKey === lastAttendanceViewKey && container.childElementCount > 0) return;
    lastAttendanceViewKey = viewKey;
    hideHistoryDweTooltip();
    const games = getAllGames();
    if (games.length === 0) {
      container.innerHTML = '<p class="empty-state">No games yet. Add one in the Games tab.</p>';
      return;
    }
    if (state.attendanceView === "history") {
      // Keep History chrome when shell already exists; renderAttendanceHistory swaps the grid only.
      if (!container.querySelector("[data-history-shell]")) container.innerHTML = "";
      const run = () => renderAttendanceHistory(container);
      if (typeof isPerfDebugEnabled === "function" && isPerfDebugEnabled() && typeof perfMeasure === "function") {
        const m = (Number(state.historyMonth) || 0) + 1;
        const y = Number(state.historyYear) || 0;
        perfMeasure("historyRender:" + y + "-" + String(m).padStart(2, "0"), run);
      } else {
        run();
      }
      return;
    }
    container.innerHTML = "";
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
        renderActiveTab();
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
    [
      { type: "dailies", title: "Dailies", done: dDone, total: dTotal, pct: pctD },
      { type: "weeklies", title: "Weeklies", done: wDone, total: wTotal, pct: pctW },
      { type: "endgame", title: "Endgame", done: eDone, total: eTotal, pct: pctE },
    ].forEach((pie) => {
      pieRow.appendChild(createAttendanceCategoryPieBox(pie.type, pie.title, pie.done, pie.total, pie.pct));
    });
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
      renderActiveTab();
    });
    const timestampsBtn = document.createElement("button");
    timestampsBtn.type = "button";
    timestampsBtn.className = "btn btn-ghost";
    timestampsBtn.textContent = "Time Trends";
    timestampsBtn.addEventListener("click", () => {
      state.attendanceView = "timestamps";
      save();
      renderActiveTab();
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
    const syncTrendsBtn = document.createElement("button");
    syncTrendsBtn.type = "button";
    syncTrendsBtn.className = "btn btn-ghost";
    syncTrendsBtn.textContent = "Sync with Calendar";
    syncTrendsBtn.title =
      "Fill missing Time Trends stamps from the calendar using your usual hours. Existing stamps stay unchanged.";
    syncTrendsBtn.style.marginLeft = "0.5rem";
    syncTrendsBtn.addEventListener("click", () => openClearTimeTrendsModal());
    header.appendChild(syncTrendsBtn);
    const weeklyBtn = document.createElement("button");
    weeklyBtn.type = "button";
    weeklyBtn.className = "btn btn-ghost";
    weeklyBtn.textContent = "← Weekly";
    weeklyBtn.style.marginLeft = "0.5rem";
    weeklyBtn.addEventListener("click", () => {
      state.attendanceView = "weekly";
      save();
      renderActiveTab();
    });
    header.appendChild(weeklyBtn);
    container.appendChild(header);

    const trendsNote = document.createElement("p");
    trendsNote.className = "timestamps-trends-note";
    trendsNote.textContent =
      "Charts use the day and hour you finished each weekly/endgame cycle (from completion timestamps). Days marked complete only by fill-remaining are not counted again.";
    container.appendChild(trendsNote);

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
      renderActiveTab();
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
      renderActiveTab();
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
        renderActiveTab();
      });
      gameWrap.appendChild(btn);
    });
    container.appendChild(gameWrap);

    const trendTimestamps =
      typeof getTimestampsForTimeTrends === "function" ? getTimestampsForTimeTrends(timestamps) : timestamps;
    const hourCountsByType = { dailies: Array(24).fill(0), weeklies: Array(24).fill(0), endgame: Array(24).fill(0) };
    const hourDetails = Array(24).fill(null).map(() => []);
    trendTimestamps.forEach((t) => {
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

    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
    trendTimestamps.forEach((t) => {
      if (!t.dateStr) return;
      const d = new Date(t.dateStr + "T12:00:00");
      const day = d.getDay();
      if (day >= 0 && day <= 6) dayOfWeekCounts[day]++;
    });
    const peakHour = hourTotals.reduce((best, n, h) => (n > hourTotals[best] ? h : best), 0);
    const peakDay = dayOfWeekCounts.reduce((best, n, d) => (n > dayOfWeekCounts[best] ? d : best), 0);
    const dayFullNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const trendsSummary = document.createElement("p");
    trendsSummary.className = "timestamps-a11y-summary";
    trendsSummary.setAttribute("role", "status");
    if (hourTotals[peakHour] <= 0) {
      trendsSummary.textContent = "No completion timestamps in the current selection.";
    } else {
      trendsSummary.textContent =
        "Most completions by hour: " +
        peakHour +
        ":00 (" +
        hourTotals[peakHour] +
        "). Busiest weekday: " +
        dayFullNames[peakDay] +
        " (" +
        dayOfWeekCounts[peakDay] +
        ").";
    }
    container.appendChild(trendsSummary);

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

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    function appendDayOfWeekChart(taskType, titleText) {
      const typed = trendTimestamps.filter((t) => t.taskType === taskType);
      const dayCounts = [0, 0, 0, 0, 0, 0, 0];
      const dayDetails = [[], [], [], [], [], [], []];
      typed.forEach((t) => {
        if (!t.dateStr) return;
        const d = new Date(t.dateStr + "T12:00:00");
        const day = d.getDay();
        if (day < 0 || day > 6) return;
        dayCounts[day]++;
        const game = getGame(t.gameId);
        dayDetails[day].push({
          gameName: game ? game.name : t.gameId,
          taskType: t.taskType,
          taskLabel: t.taskLabel,
          dateStr: t.dateStr,
        });
      });

      const sectionLabel = document.createElement("h4");
      sectionLabel.className = "data-section-label";
      sectionLabel.textContent = titleText;
      sectionLabel.style.marginTop = "1.5rem";
      container.appendChild(sectionLabel);

      const maxDayCount = Math.max(1, ...dayCounts);
      const dowWrap = document.createElement("div");
      dowWrap.className = "timestamps-bar-graph timestamps-dow-bar-graph timestamps-" + taskType + "-dow-bar-graph";
      if (taskType === "weeklies") dowWrap.classList.add("timestamps-weeklies-bar-graph");
      dowWrap.style.gridTemplateColumns = "repeat(7, 1fr)";
      dowWrap.style.minHeight = "120px";
      dowWrap.style.alignItems = "end";
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
        bar.style.background = "var(--pie-" + taskType + ")";
        col.appendChild(bar);
        const lbl = document.createElement("span");
        lbl.className = "timestamps-bar-label";
        lbl.textContent = dayNames[i];
        col.appendChild(lbl);
        const countLbl = document.createElement("span");
        countLbl.className = "timestamps-bar-count";
        countLbl.textContent = String(dayCounts[i]);
        countLbl.style.fontSize = "0.75rem";
        countLbl.style.fontWeight = "600";
        countLbl.style.color = "var(--text)";
        col.appendChild(countLbl);
        col.title = dayNames[i] + " – " + dayCounts[i] + " " + taskType + " completion(s)";
        col.style.cursor = "pointer";
        col.addEventListener("click", () => {
          openTimeTrendsDetailModal(dayNames[i] + " " + taskType, dayDetails[i] || []);
        });
        dowWrap.appendChild(col);
      }
      container.appendChild(dowWrap);
    }

    appendDayOfWeekChart("dailies", "Dailies completed by day of week");
    appendDayOfWeekChart("weeklies", "Weeklies completed by day of week");
    appendDayOfWeekChart("endgame", "Endgame completed by day of week");

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
    const allEndgameKeys = allEndgameTasks.map((et) => et.key);

    function isEndgameTaskSelected(key) {
      return showAllEndgameTasks || !!endgameTaskSelected[key];
    }

    function setEndgameTaskSelected(key, wantOn) {
      delete state.timestampsSelectedEndgameTasks[TIMESTAMPS_NONE];
      const currentlyOn = isEndgameTaskSelected(key);
      if (wantOn === currentlyOn) return;
      if (currentlyOn) {
        if (showAllEndgameTasks) {
          const others = allEndgameKeys.filter((k) => k !== key);
          state.timestampsSelectedEndgameTasks = {};
          others.forEach((k) => { state.timestampsSelectedEndgameTasks[k] = true; });
        } else {
          delete state.timestampsSelectedEndgameTasks[key];
        }
        if (Object.keys(state.timestampsSelectedEndgameTasks).filter((k) => k !== TIMESTAMPS_NONE).length === 0) {
          state.timestampsSelectedEndgameTasks = { [TIMESTAMPS_NONE]: true };
        }
      } else {
        state.timestampsSelectedEndgameTasks[key] = true;
        if (Object.keys(state.timestampsSelectedEndgameTasks).filter((k) => k !== TIMESTAMPS_NONE).length === allEndgameKeys.length) {
          state.timestampsSelectedEndgameTasks = {};
        }
      }
    }

    function setEndgameTasksForGame(gameId, wantOn) {
      const gameKeys = allEndgameTasks.filter((et) => et.gameId === gameId).map((et) => et.key);
      if (gameKeys.length === 0) return;
      if (wantOn) {
        if (showNoneEndgame) state.timestampsSelectedEndgameTasks = {};
        delete state.timestampsSelectedEndgameTasks[TIMESTAMPS_NONE];
        if (showAllEndgameTasks) return;
        gameKeys.forEach((k) => { state.timestampsSelectedEndgameTasks[k] = true; });
        if (Object.keys(state.timestampsSelectedEndgameTasks).filter((k) => k !== TIMESTAMPS_NONE).length === allEndgameKeys.length) {
          state.timestampsSelectedEndgameTasks = {};
        }
      } else {
        delete state.timestampsSelectedEndgameTasks[TIMESTAMPS_NONE];
        if (showAllEndgameTasks) {
          state.timestampsSelectedEndgameTasks = {};
          allEndgameKeys.filter((k) => !gameKeys.includes(k)).forEach((k) => {
            state.timestampsSelectedEndgameTasks[k] = true;
          });
        } else {
          gameKeys.forEach((k) => { delete state.timestampsSelectedEndgameTasks[k]; });
        }
        if (Object.keys(state.timestampsSelectedEndgameTasks).filter((k) => k !== TIMESTAMPS_NONE).length === 0) {
          state.timestampsSelectedEndgameTasks = { [TIMESTAMPS_NONE]: true };
        }
      }
    }

    const gamesWithEndgame = [];
    const seenGameIds = {};
    allEndgameTasks.forEach((et) => {
      if (seenGameIds[et.gameId]) return;
      seenGameIds[et.gameId] = true;
      gamesWithEndgame.push({ id: et.gameId, name: et.gameName });
    });

    let pickerGameId = state.timestampsEndgamePickerGameId;
    if (!pickerGameId || !seenGameIds[pickerGameId]) {
      pickerGameId = gamesWithEndgame[0] ? gamesWithEndgame[0].id : null;
      state.timestampsEndgamePickerGameId = pickerGameId;
    }
    const tasksForPickerGame = allEndgameTasks.filter((et) => et.gameId === pickerGameId);
    const selectedVisibleCount = allEndgameTasks.filter((et) => isEndgameTaskSelected(et.key)).length;

    const endgameTaskLabelRow = document.createElement("div");
    endgameTaskLabelRow.className = "timestamps-endgame-picker-header";
    const endgameTaskLabel = document.createElement("h4");
    endgameTaskLabel.className = "data-section-label";
    endgameTaskLabel.textContent = "Endgame tasks";
    endgameTaskLabel.style.margin = "0";
    endgameTaskLabelRow.appendChild(endgameTaskLabel);
    const selectAllEndgameBtn = document.createElement("button");
    selectAllEndgameBtn.type = "button";
    selectAllEndgameBtn.className = "btn btn-ghost";
    selectAllEndgameBtn.textContent = "Select all";
    selectAllEndgameBtn.title = "Select all endgame tasks";
    selectAllEndgameBtn.addEventListener("click", () => {
      state.timestampsSelectedEndgameTasks = {};
      save();
      renderActiveTab();
    });
    endgameTaskLabelRow.appendChild(selectAllEndgameBtn);
    const unselectAllEndgameBtn = document.createElement("button");
    unselectAllEndgameBtn.type = "button";
    unselectAllEndgameBtn.className = "btn btn-ghost";
    unselectAllEndgameBtn.textContent = "Unselect all";
    unselectAllEndgameBtn.title = "Deselect all endgame tasks (show none)";
    unselectAllEndgameBtn.addEventListener("click", () => {
      state.timestampsSelectedEndgameTasks = { [TIMESTAMPS_NONE]: true };
      save();
      renderActiveTab();
    });
    endgameTaskLabelRow.appendChild(unselectAllEndgameBtn);
    container.appendChild(endgameTaskLabelRow);

    const endgamePicker = document.createElement("div");
    endgamePicker.className = "timestamps-endgame-picker";

    if (gamesWithEndgame.length === 0) {
      const empty = document.createElement("p");
      empty.className = "timestamps-endgame-picker-empty";
      empty.textContent = "No endgame tasks in the current game selection.";
      endgamePicker.appendChild(empty);
    } else {
      const pickerControls = document.createElement("div");
      pickerControls.className = "timestamps-endgame-picker-controls";

      const gameField = document.createElement("label");
      gameField.className = "timestamps-endgame-picker-field";
      const gameFieldLabel = document.createElement("span");
      gameFieldLabel.textContent = "Game";
      gameField.appendChild(gameFieldLabel);
      const gameSelect = document.createElement("select");
      gameSelect.className = "timestamps-endgame-game-select";
      gameSelect.setAttribute("aria-label", "Endgame tasks game");
      gamesWithEndgame.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.name;
        if (g.id === pickerGameId) opt.selected = true;
        gameSelect.appendChild(opt);
      });
      gameSelect.addEventListener("change", () => {
        state.timestampsEndgamePickerGameId = gameSelect.value || null;
        save();
        renderActiveTab();
      });
      gameField.appendChild(gameSelect);
      pickerControls.appendChild(gameField);

      const gameActionRow = document.createElement("div");
      gameActionRow.className = "timestamps-endgame-picker-actions";
      const selectGameBtn = document.createElement("button");
      selectGameBtn.type = "button";
      selectGameBtn.className = "btn btn-ghost btn-sm";
      selectGameBtn.textContent = "Select all in game";
      selectGameBtn.addEventListener("click", () => {
        setEndgameTasksForGame(pickerGameId, true);
        save();
        renderActiveTab();
      });
      gameActionRow.appendChild(selectGameBtn);
      const clearGameBtn = document.createElement("button");
      clearGameBtn.type = "button";
      clearGameBtn.className = "btn btn-ghost btn-sm";
      clearGameBtn.textContent = "Clear game";
      clearGameBtn.addEventListener("click", () => {
        setEndgameTasksForGame(pickerGameId, false);
        save();
        renderActiveTab();
      });
      gameActionRow.appendChild(clearGameBtn);
      pickerControls.appendChild(gameActionRow);
      endgamePicker.appendChild(pickerControls);

      const summary = document.createElement("p");
      summary.className = "timestamps-endgame-picker-summary";
      summary.textContent =
        selectedVisibleCount +
        " of " +
        allEndgameTasks.length +
        " endgame task" +
        (allEndgameTasks.length === 1 ? "" : "s") +
        " shown";
      endgamePicker.appendChild(summary);

      const taskList = document.createElement("div");
      taskList.className = "timestamps-endgame-task-list";
      taskList.setAttribute("role", "group");
      taskList.setAttribute("aria-label", "Endgame tasks for selected game");

      if (tasksForPickerGame.length === 0) {
        const emptyTasks = document.createElement("p");
        emptyTasks.className = "timestamps-endgame-picker-empty";
        emptyTasks.textContent = "No endgame tasks for this game.";
        taskList.appendChild(emptyTasks);
      } else {
        tasksForPickerGame.forEach(({ key, taskLabel }) => {
          const row = document.createElement("label");
          row.className = "timestamps-endgame-task-row";
          const check = document.createElement("input");
          check.type = "checkbox";
          check.checked = isEndgameTaskSelected(key);
          check.addEventListener("change", () => {
            setEndgameTaskSelected(key, check.checked);
            save();
            renderActiveTab();
          });
          const name = document.createElement("span");
          name.className = "timestamps-endgame-task-name";
          name.textContent = taskLabel;
          row.appendChild(check);
          row.appendChild(name);
          taskList.appendChild(row);
        });
      }
      endgamePicker.appendChild(taskList);
    }

    container.appendChild(endgamePicker);

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
        let cycleStartMs, cycleEndMs, cycleStartStr;
        if (t.cycleStartStr && t.cycleEndStr) {
          const startMom = getResetMomentForDateStr(task, game, t.cycleStartStr);
          const endMom = getResetMomentForDateStr(task, game, t.cycleEndStr);
          if (!startMom || !endMom || endMom.getTime() <= startMom.getTime()) return;
          cycleStartMs = startMom.getTime();
          cycleEndMs = endMom.getTime();
          cycleStartStr = t.cycleStartStr;
        } else {
          const cycleStart = getCycleStartForDate(task, t.dateStr, game);
          cycleStartMs = cycleStart.getTime();
          cycleEndMs = cycleStartMs + timeLimitMs;
          cycleStartStr = getDateStr(cycleStart);
        }
        let pct;
        let daysAfter = 0;
        let hoursAfter = 0;
        if (t.skipped) {
          pct = 0;
          daysAfter = null;
          hoursAfter = null;
        } else {
          const completionMs = new Date(t.dateStr + "T" + String(t.hour).padStart(2, "0") + ":00:00").getTime();
          const cycleLen = cycleEndMs - cycleStartMs;
          if (cycleLen <= 0) return;
          pct = ((cycleEndMs - completionMs) / cycleLen) * 100;
          pct = Math.max(0, Math.min(100, pct));
          const elapsedMs = Math.max(0, completionMs - cycleStartMs);
          const totalHours = Math.floor(elapsedMs / (60 * 60 * 1000));
          daysAfter = Math.floor(totalHours / 24);
          hoursAfter = totalHours % 24;
        }
        if (byCycle[cycleStartMs] == null || pct > byCycle[cycleStartMs].pct) {
          byCycle[cycleStartMs] = { pct, daysAfter, hoursAfter, skipped: !!t.skipped };
        }
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
    const graphHeight = 220;
    const padding = { top: 28, right: 20, bottom: 40, left: 45 };
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
    const colors = ["var(--pie-endgame)", "var(--pie-dailies)", "var(--pie-weeklies)", "#f472b6", "#fbbf24", "#a3e635", "#38bdf8", "#c084fc", "#fb923c", "#2dd4bf"];
    const pointTip = document.createElement("div");
    pointTip.className = "timestamps-trend-point-tooltip";
    pointTip.hidden = true;
    pointTip.setAttribute("role", "tooltip");

    function hideTrendPointTip() {
      pointTip.hidden = true;
      pointTip.textContent = "";
      pointTip.classList.remove("timestamps-trend-point-tooltip-below");
    }

    function formatTrendElapsedLabel(daysAfter, hoursAfter) {
      const parts = [];
      if (daysAfter > 0) parts.push(daysAfter + " day" + (daysAfter === 1 ? "" : "s"));
      if (hoursAfter > 0 || daysAfter === 0) {
        parts.push(hoursAfter + " hour" + (hoursAfter === 1 ? "" : "s"));
      }
      return "completed " + parts.join(" ") + " after cycle started";
    }

    function showTrendPointTip(circleEl, point, seriesLabel) {
      const pctStr = Math.round(point.pct) + "%";
      let detail;
      if (point.skipped || point.daysAfter == null) {
        detail = "Skipped (0% time remaining)";
      } else {
        detail = formatTrendElapsedLabel(point.daysAfter, point.hoursAfter || 0);
      }
      pointTip.replaceChildren();
      const title = document.createElement("strong");
      title.textContent = seriesLabel;
      pointTip.appendChild(title);
      pointTip.appendChild(document.createElement("br"));
      pointTip.appendChild(document.createTextNode(pctStr + " time remaining"));
      pointTip.appendChild(document.createElement("br"));
      pointTip.appendChild(document.createTextNode(detail));
      pointTip.hidden = false;
      const wrapRect = lineGraphWrap.getBoundingClientRect();
      const cRect = circleEl.getBoundingClientRect();
      const left = cRect.left - wrapRect.left + cRect.width / 2;
      const top = cRect.top - wrapRect.top;
      pointTip.style.left = left + "px";
      pointTip.style.top = top + "px";
      requestAnimationFrame(() => {
        const tipRect = pointTip.getBoundingClientRect();
        let nextLeft = left;
        if (tipRect.right > wrapRect.right - 4) nextLeft -= tipRect.right - wrapRect.right + 4;
        if (nextLeft < 4) nextLeft = 4;
        pointTip.style.left = nextLeft + "px";
        if (tipRect.top < wrapRect.top + 4) {
          pointTip.style.top = top + cRect.height + 10 + "px";
          pointTip.classList.add("timestamps-trend-point-tooltip-below");
        } else {
          pointTip.classList.remove("timestamps-trend-point-tooltip-below");
        }
      });
    }

    Object.keys(taskPoints).forEach((key, idx) => {
      const tp = taskPoints[key];
      if (tp.points.length === 0) return;
      const color = colors[idx % colors.length];
      const seriesG = document.createElementNS("http://www.w3.org/2000/svg", "g");
      seriesG.classList.add("timestamps-trend-series");
      seriesG.setAttribute("data-series", key);

      const pathD = tp.points.map((point, i) => {
        const x = padding.left + (i / xDivisor) * plotWidth;
        const y = padding.top + plotHeight - (point.pct / 100) * plotHeight;
        return (i === 0 ? "M" : "L") + x + "," + y;
      }).join(" ");

      const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hitPath.setAttribute("d", pathD);
      hitPath.setAttribute("fill", "none");
      hitPath.setAttribute("stroke", "transparent");
      hitPath.setAttribute("stroke-width", "14");
      hitPath.setAttribute("stroke-linecap", "round");
      hitPath.setAttribute("stroke-linejoin", "round");
      hitPath.classList.add("timestamps-trend-hit");
      seriesG.appendChild(hitPath);

      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.classList.add("timestamps-trend-line");
      seriesG.appendChild(path);

      tp.points.forEach((point, i) => {
        const x = padding.left + (i / xDivisor) * plotWidth;
        const y = padding.top + plotHeight - (point.pct / 100) * plotHeight;
        const pctLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
        pctLabel.classList.add("timestamps-trend-pct-label");
        pctLabel.setAttribute("x", x);
        pctLabel.setAttribute("y", y - 8);
        pctLabel.setAttribute("text-anchor", "middle");
        pctLabel.setAttribute("fill", color);
        pctLabel.setAttribute("font-size", "9");
        pctLabel.setAttribute("font-weight", "700");
        pctLabel.textContent = Math.round(point.pct) + "%";
        seriesG.appendChild(pctLabel);

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", color);
        circle.setAttribute("stroke", "var(--bg)");
        circle.setAttribute("stroke-width", "1");
        circle.classList.add("timestamps-trend-point");
        circle.style.cursor = "pointer";
        circle.addEventListener("mouseenter", (e) => {
          e.stopPropagation();
          seriesG.classList.add("is-hovered");
          svg.classList.add("has-series-hover");
          showTrendPointTip(circle, point, tp.label);
        });
        circle.addEventListener("mouseleave", () => {
          hideTrendPointTip();
        });
        seriesG.appendChild(circle);
      });

      seriesG.addEventListener("mouseenter", () => {
        seriesG.classList.add("is-hovered");
        svg.classList.add("has-series-hover");
      });
      seriesG.addEventListener("mouseleave", () => {
        seriesG.classList.remove("is-hovered");
        if (!svg.querySelector(".timestamps-trend-series.is-hovered")) {
          svg.classList.remove("has-series-hover");
        }
        hideTrendPointTip();
      });
      svg.appendChild(seriesG);
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
      item.appendChild(document.createTextNode(tp.label));
      legendWrap.appendChild(item);
    });
    lineGraphWrap.appendChild(svg);
    lineGraphWrap.appendChild(pointTip);
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

  /**
   * Skipped = attempted − completed for included games.
   * Returns [{ gameId, gameName, tasks: [{ label, skipped, completed, attempted }] }].
   */
  function getAttendanceSkippedGroups(type) {
    const groups = [];
    (getAllGames() || []).forEach((game) => {
      if (state.attendancePieInclude && state.attendancePieInclude[game.id] === false) return;
      const tasks = [];
      if (type === "dailies") {
        if (!game.dailies) return;
        const attempted = getAttemptedAmount(state.dailiesAttempted, game.id);
        const completed = getCompletedAmount(state.dailiesCompleted, game.id);
        const skipped = Math.max(0, attempted - completed);
        if (skipped > 0) {
          tasks.push({ label: "Dailies", skipped, completed, attempted });
        }
      } else if (type === "weeklies") {
        (game.weeklies || []).forEach((t) => {
          const key = game.id + "." + (t.id || t.label);
          const attempted = getAttemptedAmount(state.weekliesAttempted, key);
          const completed = getCompletedAmount(state.weekliesCompleted, key);
          const skipped = Math.max(0, attempted - completed);
          if (skipped > 0) {
            tasks.push({ label: t.label || t.id || key, skipped, completed, attempted });
          }
        });
      } else if (type === "endgame") {
        (game.endgame || []).forEach((t) => {
          const key = game.id + "." + (t.id || t.label);
          const attempted = getAttemptedAmount(state.endgameAttempted, key);
          const completed = getCompletedAmount(state.endgameCompleted, key);
          const skipped = Math.max(0, attempted - completed);
          if (skipped > 0) {
            tasks.push({ label: t.label || t.id || key, skipped, completed, attempted });
          }
        });
      }
      if (tasks.length) {
        groups.push({ gameId: game.id, gameName: game.name || game.id, tasks });
      }
    });
    return groups;
  }

  function fillAttendanceSkippedList(container, groups, emptyMessage) {
    if (!container) return;
    container.innerHTML = "";
    container.classList.add("attendance-skipped-list");
    if (!groups || groups.length === 0) {
      const p = document.createElement("p");
      p.className = "attendance-skipped-empty";
      p.textContent = emptyMessage || "No skipped tasks.";
      container.appendChild(p);
      return;
    }
    groups.forEach((group) => {
      const block = document.createElement("div");
      block.className = "attendance-skipped-game";
      const title = document.createElement("h4");
      title.className = "attendance-skipped-game-title";
      title.textContent = group.gameName;
      block.appendChild(title);
      const ul = document.createElement("ul");
      ul.className = "attendance-skipped-task-list";
      (group.tasks || []).forEach((task) => {
        const li = document.createElement("li");
        li.className = "attendance-skipped-task";
        li.textContent =
          task.label +
          " — " +
          task.skipped +
          " skipped (" +
          task.completed +
          "/" +
          task.attempted +
          ")";
        ul.appendChild(li);
      });
      block.appendChild(ul);
      container.appendChild(block);
    });
  }

  function createAttendanceCategoryPieBox(type, title, done, total, pct) {
    const skipped = Math.max(0, total - done);
    const box = document.createElement("div");
    box.className = "pie-box pie-box-" + type + " attendance-pie-box";
    const h3 = document.createElement("h3");
    h3.textContent = title;
    box.appendChild(h3);
    const chart = document.createElement("div");
    chart.className = "pie-chart attendance-pie-chart";
    chart.style.setProperty("--pct", (pct / 100) * 360 + "deg");
    chart.tabIndex = 0;
    chart.setAttribute("role", "button");
    chart.setAttribute(
      "aria-label",
      title +
        " attendance: " +
        done +
        " of " +
        total +
        " completed, " +
        skipped +
        " skipped. Hover or activate to see skipped tasks by game."
    );
    box.appendChild(chart);
    const legend = document.createElement("div");
    legend.className = "pie-legend pie-legend-split";
    legend.innerHTML =
      "<span class=\"pie-legend-item completed\">Completed: " +
      done +
      " (" +
      (total ? Math.round((done / total) * 100) : 0) +
      "%)</span>" +
      "<span class=\"pie-legend-item skipped\">Skipped: " +
      skipped +
      " (" +
      (total ? Math.round((skipped / total) * 100) : 0) +
      "%)</span>";
    box.appendChild(legend);

    const table = document.createElement("table");
    table.className = "sr-only";
    const donePct = total ? Math.round((done / total) * 100) : 0;
    const skipPct = total ? Math.round((skipped / total) * 100) : 0;
    table.innerHTML =
      "<caption>" +
      escapeHtml(title) +
      " attendance</caption>" +
      "<thead><tr><th scope=\"col\">Status</th><th scope=\"col\">Count</th><th scope=\"col\">Percent</th></tr></thead>" +
      "<tbody>" +
      "<tr><th scope=\"row\">Completed</th><td>" +
      done +
      "</td><td>" +
      donePct +
      "%</td></tr>" +
      "<tr><th scope=\"row\">Skipped</th><td>" +
      skipped +
      "</td><td>" +
      skipPct +
      "%</td></tr>" +
      "</tbody>";
    box.appendChild(table);

    const tooltip = document.createElement("div");
    tooltip.className = "attendance-pie-skipped-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    const tooltipBody = document.createElement("div");
    tooltip.appendChild(tooltipBody);
    box.appendChild(tooltip);

    function refreshTooltip() {
      const groups = getAttendanceSkippedGroups(type);
      fillAttendanceSkippedList(
        tooltipBody,
        groups,
        skipped === 0 ? "No skipped tasks." : "No skipped tasks for included games."
      );
    }

    function showTooltip() {
      refreshTooltip();
      tooltip.hidden = false;
      box.classList.add("attendance-pie-box-tooltip-open");
    }

    function hideTooltip() {
      tooltip.hidden = true;
      box.classList.remove("attendance-pie-box-tooltip-open");
    }

    function openSkippedPopup() {
      hideTooltip();
      if (typeof chart.blur === "function") chart.blur();
      const groups = getAttendanceSkippedGroups(type);
      if (typeof openAttendanceSkippedModal === "function") {
        openAttendanceSkippedModal(title + " — skipped tasks", groups, skipped);
      }
    }

    box.addEventListener("mouseenter", showTooltip);
    box.addEventListener("mouseleave", hideTooltip);
    chart.addEventListener("focus", showTooltip);
    chart.addEventListener("blur", hideTooltip);
    chart.addEventListener("click", (e) => {
      e.preventDefault();
      openSkippedPopup();
    });
    chart.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openSkippedPopup();
      }
    });
    return box;
  }

  const CURRENCY_PIE_COLORS = ["#34d399", "#7c3aed", "#60a5fa", "#f472b6", "#fbbf24", "#22d3ee", "#a78bfa", "#fb923c"];

  function createCompletionPieBox(title, completed, total, useCleared, subtitle) {
    const skipped = total - completed;
    const pct = total ? (completed / total) * 360 : 0;
    const labelDone = useCleared ? "Cleared" : "Completed";
    const box = document.createElement("div");
    box.className = "pie-box";
    // Always reserve subtitle space so pie charts align across a row.
    const subHtml =
      "<p class=\"pie-box-subtitle" + (subtitle ? " task-counting-since-tag" : "") + "\">" +
      (subtitle ? escapeHtml(subtitle) : "&nbsp;") +
      "</p>";
    box.innerHTML =
      "<h3>" + escapeHtml(title) + "</h3>" +
      subHtml +
      "<div class=\"pie-chart\" style=\"--pct: " + pct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">" + labelDone + ": " + completed + " (" + (total ? Math.round((completed / total) * 100) : 0) + "%)</span>" +
      "<span class=\"pie-legend-item skipped\">Skipped: " + skipped + " (" + (total ? Math.round((skipped / total) * 100) : 0) + "%)</span>" +
      "</div>";
    return box;
  }

  function formatExtracurricularDateRangeLabel(task) {
    if (!task) return "";
    const start =
      task.startDate && isValidDateStr(task.startDate) ? formatDate(task.startDate) : "—";
    let end = "TBD";
    if (!task.endDateTBD && task.endDate && isValidDateStr(task.endDate)) {
      end = formatDate(task.endDate);
    }
    return start + " – " + end;
  }

  function createExtracurricularCurrencyPieBox(task, earned, potential, opts) {
    const pot = Math.max(0, Number(potential) || 0);
    const e = Math.max(0, Number(earned) || 0);
    const total = Math.max(pot, e, 1);
    const earnedPct = total ? (e / total) * 360 : 0;
    const box = document.createElement("div");
    box.className = "pie-box";
    const subtitle = (opts && opts.hideDates) ? "" : formatExtracurricularDateRangeLabel(task);
    const subHtml =
      "<p class=\"pie-box-subtitle" + (subtitle ? " task-counting-since-tag" : "") + "\">" +
      (subtitle ? escapeHtml(subtitle) : "&nbsp;") +
      "</p>";
    if (total === 0 || (e === 0 && pot === 0)) {
      box.innerHTML =
        "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
        subHtml +
        "<div class=\"pie-chart pie-chart-empty\"></div>" +
        "<div class=\"pie-legend\">No currency earned yet</div>";
      return box;
    }
    box.innerHTML =
      "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
      subHtml +
      "<div class=\"pie-chart\" style=\"--pct: " + earnedPct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">Earned: " + e + (total ? " (" + Math.round((e / total) * 100) + "%)" : "") + "</span>" +
      "<span class=\"pie-legend-item skipped\">Potential: " + pot + "</span>" +
      "</div>";
    return box;
  }

  function createEndgameCurrencyPieBox(task, earned, potential, subtitle) {
    const pot = Math.max(0, Number(potential) || 0);
    const total = Math.max(pot, earned, 1);
    const earnedPct = total ? (earned / total) * 360 : 0;
    const box = document.createElement("div");
    box.className = "pie-box";
    const subHtml =
      "<p class=\"pie-box-subtitle" + (subtitle ? " task-counting-since-tag" : "") + "\">" +
      (subtitle ? escapeHtml(subtitle) : "&nbsp;") +
      "</p>";
    if (total === 0 || (earned === 0 && pot === 0)) {
      box.innerHTML =
        "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
        subHtml +
        "<div class=\"pie-chart pie-chart-empty\"></div>" +
        "<div class=\"pie-legend\">No currency earned yet</div>";
      return box;
    }
    box.innerHTML =
      "<h3>" + escapeHtml(task.label || "Task") + "</h3>" +
      subHtml +
      "<div class=\"pie-chart\" style=\"--pct: " + earnedPct + "deg\"></div>" +
      "<div class=\"pie-legend pie-legend-split\">" +
      "<span class=\"pie-legend-item completed\">Earned: " + earned + (total ? " (" + Math.round((earned / total) * 100) + "%)" : "") + "</span>" +
      "<span class=\"pie-legend-item skipped\">Potential: " + pot + "</span>" +
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

