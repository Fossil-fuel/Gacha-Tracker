  function setModalOpen(open) {
    const el = qs("taskModal");
    if (!el) return;
    taskModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
  }

  function setGameModalOpen(open) {
    const el = qs("gameModal");
    if (!el) return;
    gameModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
  }

  function setDeleteGameModalOpen(open) {
    const el = qs("deleteGameModal");
    if (!el) return;
    deleteGameModalState.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
  }

  let clearGameDataModalGameId = null;
  function openClearGameDataModal(gameId) {
    const modal = qs("clearGameDataModal");
    const msg = qs("clearGameDataMessage");
    if (!modal || !msg) return;
    clearGameDataModalGameId = gameId;
    const game = getGame(gameId);
    msg.textContent = "Are you sure? This will reset all attempts and completions for " + (game ? game.name : "this game") + " to zero. Calendar history for this game will also be cleared. This cannot be undone.";
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeClearGameDataModal() {
    const modal = qs("clearGameDataModal");
    if (modal) {
      clearGameDataModalGameId = null;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  }
  function confirmClearGameData() {
    if (clearGameDataModalGameId) {
      clearGameData(clearGameDataModalGameId);
      clearGameDataModalGameId = null;
    }
    closeClearGameDataModal();
  }

  let clearDataModalOpen = false;
  function openClearDataModal() {
    const modal = qs("clearDataModal");
    if (!modal) return;
    clearDataModalOpen = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }
  function closeClearDataModal() {
    const modal = qs("clearDataModal");
    if (modal) {
      clearDataModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen) document.body.style.overflow = "";
    }
  }
  function confirmClearData() {
    state.games = [];
    state.dailiesCompleted = {};
    state.weekliesCompleted = {};
    state.endgameCompleted = {};
    state.dailiesAttempted = {};
    state.weekliesAttempted = {};
    state.endgameAttempted = {};
    state.endgameCurrencyEarned = {};
    state.endgameCompletionDates = {};
    state.completionByDate = {};
    state.completionTimestamps = [];
    state.lastProcessedResets = { dailies: {}, weeklies: {}, endgame: {} };
    state.lastSimulationSnapshot = null;
    state.lastSkipDaySnapshot = null;
    state.simulatedDateOffset = 0;
    state.attendancePieInclude = {};
    state.dataPieInclude = {};
    state.extracurricularTasks = [];
    state.extracurricularCompleted = {};
    state.extracurricularCompletedAt = {};
    state.tab = state.defaultTab || "about";
    save();
    renderAll();
    closeClearDataModal();
    closeSettingsModal();
  }

  let calendarDayModal = { open: false, dateStr: null };

  function setCalendarDayModalOpen(open) {
    const el = qs("calendarDayModal");
    if (!el) return;
    calendarDayModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
  }

  function openCalendarDayModal(dateStr) {
    calendarDayModal.dateStr = dateStr;
    const titleEl = qs("calendarDayModalTitle");
    if (titleEl) titleEl.textContent = "Edit " + dateStr;
    const container = qs("calendarDayModalTasks");
    if (!container) return;
    container.innerHTML = "";
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const available = getTasksAvailableOnDate(dateStr);
    const checkboxes = [];
    const addTask = (item, type) => {
      const isCompleted = type === "dailies"
        ? dayData.dailies.includes(item.key)
        : type === "weeklies"
          ? (dayData.weeklies || []).includes(item.key)
          : (dayData.endgame || []).includes(item.key);
      const label = document.createElement("label");
      label.className = "calendar-day-modal-task calendar-day-modal-task-" + type;
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = isCompleted;
      check.dataset.type = type;
      check.dataset.key = item.key;
      label.appendChild(check);
      const span = document.createElement("span");
      span.textContent = labelAfterDash(item.label);
      label.appendChild(span);
      container.appendChild(label);
      checkboxes.push({ check, type, key: item.key });
    };
    available.dailies.forEach((item) => addTask(item, "dailies"));
    available.weeklies.forEach((item) => addTask(item, "weeklies"));
    available.endgame.forEach((item) => addTask(item, "endgame"));
    if (container.children.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No tasks available for this day.";
      container.appendChild(p);
    }
    calendarDayModal.checkboxes = checkboxes;
    setCalendarDayModalOpen(true);
  }

  let earningsModal = { gameId: null, task: null };

  function openEarningsModal(gameId, task) {
    earningsModal.gameId = gameId;
    earningsModal.task = task;
    const key = gameId + "." + (task.id || task.label);
    const completedCount = getCompletedAmount(state.endgameCompleted, key);
    ensureEndgameEarnedArrayLength(gameId, task.id || task.label, completedCount);
    const earnedArr = getEndgameEarnedPerCompletion(gameId, task.id || task.label);
    const datesArr = getEndgameCompletionDates(gameId, task.id || task.label);

    const titleEl = qs("earningsModalTitle");
    if (titleEl) titleEl.textContent = "Completion History — " + (task.label || "Task");

    const listEl = qs("earningsModalList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (completedCount === 0 && earnedArr.length === 0) {
      const empty = document.createElement("p");
      empty.className = "earnings-modal-empty";
      empty.textContent = "No completions yet. Complete this task to add earnings.";
      listEl.appendChild(empty);
    } else {
    const itemCount = Math.max(earnedArr.length, completedCount, 1);
    for (let i = 0; i < itemCount; i++) {
      const cycleDates = getEndgameCycleDates(task, i);
      const stored = datesArr[i] || {};
      const startVal = stored.start || "";
      const endVal = stored.end || "";
      const dateLabel = startVal && endVal ? startVal + " — " + endVal : "(Start - End)";

      const item = document.createElement("div");
      item.className = "earnings-modal-item";
      const dateRow = document.createElement("div");
      dateRow.className = "earnings-modal-date-row";
      const dateDisplay = document.createElement("span");
      dateDisplay.className = "earnings-modal-date-display";
      dateDisplay.textContent = "Completion " + (i + 1) + ": " + dateLabel;
      dateRow.appendChild(dateDisplay);
      const startInput = document.createElement("input");
      startInput.type = "date";
      startInput.placeholder = "Start";
      startInput.value = startVal;
      startInput.title = "Start date";
      const endInput = document.createElement("input");
      endInput.type = "date";
      endInput.placeholder = "End";
      endInput.value = endVal;
      endInput.title = "End date";
      const dateEditWrap = document.createElement("div");
      dateEditWrap.className = "earnings-modal-date-edit";
      dateEditWrap.appendChild(startInput);
      dateEditWrap.appendChild(document.createTextNode(" — "));
      dateEditWrap.appendChild(endInput);
      const updateDateDisplay = () => {
        const s = startInput.value || "";
        const e = endInput.value || "";
        dateDisplay.textContent = "Completion " + (i + 1) + ": " + (s && e ? s + " — " + e : "(Start - End)");
        setEndgameCompletionDate(gameId, task.id || task.label, i, s, e);
      };
      startInput.addEventListener("change", updateDateDisplay);
      endInput.addEventListener("change", updateDateDisplay);
      dateRow.appendChild(dateEditWrap);
      item.appendChild(dateRow);

      const earnRow = document.createElement("div");
      earnRow.className = "earnings-modal-earn-row";
      earnRow.innerHTML = "<label>Earned:</label>";
      const earnInput = document.createElement("input");
      earnInput.type = "number";
      earnInput.min = "0";
      earnInput.placeholder = "0";
      earnInput.value = String(earnedArr[i] || 0);
      earnInput.addEventListener("change", () => setEndgameEarnedAt(gameId, task.id || task.label, i, earnInput.value));
      earnRow.appendChild(earnInput);
      item.appendChild(earnRow);
      listEl.appendChild(item);
    }
    }

    const modalEl = qs("earningsModal");
    if (modalEl) {
      modalEl.hidden = false;
      modalEl.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
  }

  function closeEarningsModal() {
    earningsModal.gameId = null;
    earningsModal.task = null;
    const modalEl = qs("earningsModal");
    if (modalEl) {
      modalEl.hidden = true;
      modalEl.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  }

  function closeCalendarDayModal() {
    calendarDayModal.dateStr = null;
    calendarDayModal.checkboxes = null;
    setCalendarDayModalOpen(false);
  }

  function saveCalendarDayModal() {
    const dateStr = calendarDayModal.dateStr;
    const checkboxes = calendarDayModal.checkboxes || [];
    if (!dateStr) return;
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    checkboxes.forEach(({ check, type, key }) => {
      const wasCompleted = type === "dailies"
        ? (dayData.dailies || []).includes(key)
        : type === "weeklies"
          ? (dayData.weeklies || []).includes(key)
          : (dayData.endgame || []).includes(key);
      const nowCompleted = check.checked;
      if (nowCompleted) recordCompletion(dateStr, type, key);
      else unrecordCompletion(dateStr, type, key);
      if (wasCompleted !== nowCompleted) {
        if (type === "dailies") {
          const amt = getCompletedAmount(state.dailiesCompleted, key);
          state.dailiesCompleted[key] = nowCompleted ? amt + 1 : Math.max(0, amt - 1);
          const attempted = getAttemptedAmount(state.dailiesAttempted, key);
          if (attempted < state.dailiesCompleted[key]) state.dailiesAttempted[key] = state.dailiesCompleted[key];
        } else if (type === "weeklies" || type === "endgame") {
          const completedObj = type === "weeklies" ? state.weekliesCompleted : state.endgameCompleted;
          const attemptedObj = type === "weeklies" ? state.weekliesAttempted : state.endgameAttempted;
          const amt = getCompletedAmount(completedObj, key);
          completedObj[key] = nowCompleted ? amt + 1 : Math.max(0, amt - 1);
          if (nowCompleted && getAttemptedAmount(attemptedObj, key) < completedObj[key]) attemptedObj[key] = completedObj[key];
          if (type === "endgame") {
            const dot = key.indexOf(".");
            const gameId = dot >= 0 ? key.slice(0, dot) : key;
            const taskId = dot >= 0 ? key.slice(dot + 1) : "";
            ensureEndgameEarnedArrayLength(gameId, taskId, nowCompleted ? amt + 1 : Math.max(0, amt - 1));
          }
        }
      }
    });
    processResets();
    save();
    renderAll();
    closeCalendarDayModal();
  }

  function updateDaySelection(dayIndex) {
    taskModal.selectedDay = dayIndex;
    document.querySelectorAll(".task-menu-grid .day-cell").forEach((cell) => {
      const d = Number(cell.getAttribute("data-day"));
      cell.classList.toggle("active", d === dayIndex);
      cell.setAttribute("aria-pressed", d === dayIndex ? "true" : "false");
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
    });
  }

  function updateTaskTimeRemainingDisplay() {
    if (!taskModal.open || (taskModal.taskType !== "weeklies" && taskModal.taskType !== "endgame")) return;
    const el = qs("taskTimeRemainingInput");
    if (!el) return;
    const dateInput = qs("taskDateStarted");
    const resetTime = qs("taskResetTime");
    const freqEvery = qs("taskFrequencyEvery");
    const limEvery = qs("taskTimeLimitEvery");
    const dstToggle = qs("taskAdjustForDST");
    const { hour, minute } = parseTimeStr(resetTime && resetTime.value ? resetTime.value : getDefaultTimeStr());
    const dateStarted = isValidDateStr(dateInput && dateInput.value) ? dateInput.value : getDateStr();
    const frequencyEvery = Math.max(1, Number(freqEvery && freqEvery.value) || 1);
    const timeLimitEvery = Math.max(1, Number(limEvery && limEvery.value) || 1);
    const adjustForDST = dstToggle ? dstToggle.checked : true;
    const tempTask = {
      dateStarted,
      weekStartDay: taskModal.selectedDay,
      weekStartHour: hour,
      weekStartMinute: minute,
      frequencyEvery,
      frequencyUnit: taskModal.frequencyUnit || "week",
      timeLimitEvery,
      timeLimitUnit: taskModal.timeLimitUnit || "week",
    };
    const game = taskModal.gameId ? getGame(taskModal.gameId) : null;
    const ms = taskModal.taskType === "weeklies"
      ? getWeeklyTimeRemainingMs(tempTask, null, game)
      : getEndgameTimeRemainingMs(tempTask, null, game);
    el.value = formatRemainingMs(ms);
  }

  function applyTaskTimeRemainingFromInput() {
    if (!taskModal.open || (taskModal.taskType !== "weeklies" && taskModal.taskType !== "endgame")) return;
    const input = qs("taskTimeRemainingInput");
    const dateInput = qs("taskDateStarted");
    const resetTime = qs("taskResetTime");
    const freqEvery = qs("taskFrequencyEvery");
    const limEvery = qs("taskTimeLimitEvery");
    if (!input || !dateInput || !resetTime) return;
    const remainingMs = parseTimeRemainingToMs(input.value.trim());
    if (remainingMs == null || remainingMs <= 0) return;
    const freqUnit = taskModal.frequencyUnit || "week";
    const limitUnit = taskModal.timeLimitUnit || "week";
    const periodMs = taskModal.taskType === "weeklies"
      ? 7 * 24 * 60 * 60 * 1000
      : getIntervalMs(Math.max(1, Number(limEvery && limEvery.value) || 1), limitUnit);
    const elapsedMs = Math.max(0, periodMs - remainingMs);
    const now = getSimulatedNow();
    const cycleStart = new Date(now.getTime() - elapsedMs);
    const tz = getRecordingTimezone();
    const parts = getDatePartsInTimezone(cycleStart, tz);
    const dateStr = parts.year + "-" + String(parts.month + 1).padStart(2, "0") + "-" + String(parts.day).padStart(2, "0");
    const timeStr = timeToStr(parts.hour, parts.minute);
    dateInput.value = dateStr;
    resetTime.value = timeStr;
    input.value = formatRemainingMs(remainingMs);
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    if (dayOfWeek >= 0) updateDaySelection(dayOfWeek);
  }

  function updateUnitToggles(kind, unit) {
    if (kind === "frequency") taskModal.frequencyUnit = unit;
    if (kind === "timeLimit") taskModal.timeLimitUnit = unit;

    const freqDay = qs("taskFrequencyUnitDay");
    const freqWeek = qs("taskFrequencyUnitWeek");
    const limDay = qs("taskTimeLimitUnitDay");
    const limWeek = qs("taskTimeLimitUnitWeek");

    if (freqDay && freqWeek) {
      freqDay.classList.toggle("active", taskModal.frequencyUnit === "day");
      freqWeek.classList.toggle("active", taskModal.frequencyUnit === "week");
      freqDay.setAttribute("aria-pressed", taskModal.frequencyUnit === "day" ? "true" : "false");
      freqWeek.setAttribute("aria-pressed", taskModal.frequencyUnit === "week" ? "true" : "false");
    }

    if (limDay && limWeek) {
      limDay.classList.toggle("active", taskModal.timeLimitUnit === "day");
      limWeek.classList.toggle("active", taskModal.timeLimitUnit === "week");
      limDay.setAttribute("aria-pressed", taskModal.timeLimitUnit === "day" ? "true" : "false");
      limWeek.setAttribute("aria-pressed", taskModal.timeLimitUnit === "week" ? "true" : "false");
    }
  }

  function setExtraFields(taskType, task) {
    const extra = qs("taskModalExtra");
    if (!extra) return;
    extra.innerHTML = "";

    const row1 = document.createElement("div");
    row1.className = "task-menu-extra-row";
    const label1 = document.createElement("label");
    label1.textContent = "Currency (potential)";
    label1.setAttribute("for", "taskCurrencyInput");
    const input1 = document.createElement("input");
    input1.id = "taskCurrencyInput";
    input1.type = "number";
    input1.min = "0";
    input1.step = "1";
    input1.placeholder = "0";
    input1.value = String(Math.max(0, Number(task && task.currency) || 0));
    row1.appendChild(label1);
    row1.appendChild(input1);
    extra.appendChild(row1);

    if (taskType === "weeklies" || taskType === "endgame") {
      const row2 = document.createElement("div");
      row2.className = "task-menu-extra-row";
      const label2 = document.createElement("label");
      label2.textContent = "Cycle start date";
      label2.setAttribute("for", "taskDateStarted");
      const input2 = document.createElement("input");
      input2.id = "taskDateStarted";
      input2.type = "date";
      input2.value = isValidDateStr(task && task.dateStarted) ? task.dateStarted : getDateStr();
      row2.appendChild(label2);
      row2.appendChild(input2);
      extra.appendChild(row2);

      const rowRemaining = document.createElement("div");
      rowRemaining.className = "task-menu-extra-row task-menu-time-remaining";
      const labelRem = document.createElement("label");
      labelRem.textContent = "Time remaining";
      labelRem.setAttribute("for", "taskTimeRemainingInput");
      const remainingInput = document.createElement("input");
      remainingInput.id = "taskTimeRemainingInput";
      remainingInput.type = "text";
      remainingInput.className = "task-time-remaining-input";
      remainingInput.placeholder = "e.g. 6d 7hr";
      remainingInput.setAttribute("aria-label", "Time remaining (input to auto-fill cycle start)");
      const inputWrap = document.createElement("span");
      inputWrap.className = "task-time-remaining-input-wrap";
      inputWrap.appendChild(remainingInput);
      const applyHint = document.createElement("span");
      applyHint.className = "task-time-remaining-hint";
      applyHint.textContent = "Enter to apply";
      inputWrap.appendChild(applyHint);
      rowRemaining.appendChild(labelRem);
      rowRemaining.appendChild(inputWrap);
      extra.appendChild(rowRemaining);
      remainingInput.addEventListener("blur", applyTaskTimeRemainingFromInput);
      remainingInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          applyTaskTimeRemainingFromInput();
        }
      });
    }
  }

  function openTaskModal(opts) {
    const { gameId, taskType, task } = opts || {};
    const title = qs("taskModalTitle");
    if (title) title.textContent = (task ? "Edit" : "New") + " " + (taskType === "endgame" ? "Endgame Task" : "Weekly Task");

    taskModal.gameId = gameId;
    taskModal.taskType = taskType;
    taskModal.taskId = task ? task.id : null;

    const nameInput = qs("taskNameInput");
    const resetTime = qs("taskResetTime");
    const freqEvery = qs("taskFrequencyEvery");
    const limEvery = qs("taskTimeLimitEvery");

    if (nameInput) nameInput.value = (task && task.label) ? task.label : "";

    // day selection: both use weekStartDay (endgame falls back to resetDay for legacy tasks)
    const selectedDay =
      taskType === "weeklies"
        ? (task && Number.isFinite(task.weekStartDay) ? task.weekStartDay : 0)
        : (task && Number.isFinite(task.weekStartDay) ? task.weekStartDay : (task && Number.isFinite(task.resetDay) ? task.resetDay : 0));
    updateDaySelection(selectedDay);

    // time selection: both use weekStartHour/weekStartMinute (endgame falls back to resetHour/resetMinute for legacy)
    let tStr = getDefaultTimeStr();
    if (taskType === "weeklies") {
      tStr = timeToStr(task && task.weekStartHour, task && task.weekStartMinute);
    } else {
      const h = Number.isFinite(task && task.weekStartHour) ? task.weekStartHour : (Number.isFinite(task && task.resetHour) ? task.resetHour : undefined);
      const m = Number.isFinite(task && task.weekStartMinute) ? task.weekStartMinute : (Number.isFinite(task && task.resetMinute) ? task.resetMinute : undefined);
      tStr = timeToStr(h, m);
    }
    if (resetTime) resetTime.value = tStr;

    const dstToggle = qs("taskAdjustForDST");
    if (dstToggle) dstToggle.checked = task && task.adjustForDST !== false;

    // frequency + time limit (stored on task but not used elsewhere yet)
    const fEvery = Math.max(1, Number(task && task.frequencyEvery) || 1);
    const fUnit = (task && (task.frequencyUnit === "day" || task.frequencyUnit === "week")) ? task.frequencyUnit : (taskType === "weeklies" ? "week" : "week");
    const lEvery = Math.max(1, Number(task && task.timeLimitEvery) || 1);
    const lUnit = (task && (task.timeLimitUnit === "day" || task.timeLimitUnit === "week")) ? task.timeLimitUnit : "week";

    if (freqEvery) freqEvery.value = String(fEvery);
    if (limEvery) limEvery.value = String(lEvery);
    updateUnitToggles("frequency", fUnit);
    updateUnitToggles("timeLimit", lUnit);

    setExtraFields(taskType, task);
    setModalOpen(true);
    updateTaskTimeRemainingDisplay();

    // focus name input for quick typing
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function closeTaskModal() {
    setModalOpen(false);
    taskModal.gameId = null;
    taskModal.taskType = null;
    taskModal.taskId = null;
  }

  function getPreset(presetId) {
    return GAME_PRESETS.find((p) => p.id === presetId) || null;
  }

  function updatePresetButtons(selectedId) {
    document.querySelectorAll(".game-add-options .game-add-option").forEach((btn) => {
      const id = btn.getAttribute("data-preset");
      const active = id === selectedId;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function openGameModal() {
    gameModal.selectedPresetId = "custom";
    updatePresetButtons("custom");
    const nameInput = qs("gameNameInput");
    if (nameInput) nameInput.value = "";
    setGameModalOpen(true);
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function closeGameModal() {
    setGameModalOpen(false);
    gameModal.selectedPresetId = "custom";
  }

  function openDeleteGameModal(gameId) {
    const game = getGame(gameId);
    if (!game) return;
    deleteGameModalState.gameId = gameId;
    const msg = qs("deleteGameMessage");
    if (msg) {
      msg.textContent = 'Are you sure you want to delete "' + (game.name || "game") + '"? This cannot be undone.';
    }
    setDeleteGameModalOpen(true);
  }

  function closeDeleteGameModal() {
    setDeleteGameModalOpen(false);
    deleteGameModalState.gameId = null;
  }

  function initGameModal() {
    const modalEl = qs("gameModal");
    const closeBtn = qs("gameModalClose");
    const cancelBtn = qs("gameModalCancel");
    const form = qs("gameModalForm");
    const nameInput = qs("gameNameInput");

    if (!modalEl || !form) return;

    modalEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-close") === "true") closeGameModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeGameModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeGameModal);

    document.querySelectorAll(".game-add-options .game-add-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const presetId = btn.getAttribute("data-preset") || "custom";
        gameModal.selectedPresetId = presetId;
        updatePresetButtons(presetId);
        const preset = presetId === "custom" ? null : getPreset(presetId);
        if (nameInput) nameInput.value = preset ? preset.name : (nameInput.value || "");
        const serverEl = qs("gameServerSelect");
        if (serverEl) serverEl.value = state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
        if (nameInput) nameInput.focus();
      });
    });

    document.addEventListener("keydown", (e) => {
      if (!gameModal.open) return;
      if (e.key === "Escape") closeGameModal();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const rawName = nameInput && nameInput.value ? nameInput.value.trim() : "";
      const preset = gameModal.selectedPresetId === "custom" ? null : getPreset(gameModal.selectedPresetId);
      const name = rawName || (preset ? preset.name : "New game");
      const serverEl = qs("gameServerSelect");
      const server = serverEl && ["america", "asia", "europe"].includes(serverEl.value) ? serverEl.value : "america";

      state.tab = "games";
      const primaryServer = state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
      if (preset) addGame(name, { ...preset, presetId: preset.id, server: primaryServer });
      else addGame(name, { presetId: null, server });
      closeGameModal();
    });
  }

  function initDeleteGameModal() {
    const modalEl = qs("deleteGameModal");
    const closeBtn = qs("deleteGameModalClose");
    const cancelBtn = qs("deleteGameCancel");
    const confirmBtn = qs("deleteGameConfirm");

    if (!modalEl || !confirmBtn) return;

    modalEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-close") === "true") {
        closeDeleteGameModal();
      }
    });
    if (closeBtn) closeBtn.addEventListener("click", closeDeleteGameModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeDeleteGameModal);

    confirmBtn.addEventListener("click", () => {
      const id = deleteGameModalState.gameId;
      if (id) reallyDeleteGame(id);
      closeDeleteGameModal();
    });

    document.addEventListener("keydown", (e) => {
      if (!deleteGameModalState.open) return;
      if (e.key === "Escape") closeDeleteGameModal();
    });
  }

  function initClearGameDataModal() {
    const modalEl = qs("clearGameDataModal");
    const closeBtn = qs("clearGameDataModalClose");
    const cancelBtn = qs("clearGameDataCancel");
    const confirmBtn = qs("clearGameDataConfirm");
    if (!modalEl || !confirmBtn) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "clearGameDataModal") closeClearGameDataModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeClearGameDataModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeClearGameDataModal);
    confirmBtn.addEventListener("click", confirmClearGameData);
    document.addEventListener("keydown", (e) => {
      if (!clearGameDataModalGameId) return;
      if (e.key === "Escape") closeClearGameDataModal();
    });
  }

  let clearTimeTrendsModalOpen = false;
  function openClearTimeTrendsModal() {
    const modal = qs("clearTimeTrendsModal");
    const container = qs("clearTimeTrendsModalGames");
    if (!modal || !container) return;
    clearTimeTrendsModalOpen = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    container.innerHTML = "";
    container.className = "clear-time-trends-games timestamps-game-selector";
    container.style.display = "flex";
    container.style.flexWrap = "wrap";
    container.style.gap = "0.5rem";
    const games = getAllGames();
    const gameIdsWithData = new Set((state.completionTimestamps || []).map((t) => t.gameId));
    const selected = new Set(gameIdsWithData);
    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timestamps-game-pill clear-time-trends-pill";
      btn.textContent = game.name + (gameIdsWithData.has(game.id) ? " (" + (state.completionTimestamps || []).filter((t) => t.gameId === game.id).length + ")" : "");
      btn.dataset.gameId = game.id;
      btn.setAttribute("aria-pressed", selected.has(game.id) ? "true" : "false");
      if (selected.has(game.id)) btn.classList.add("filled");
      btn.addEventListener("click", () => {
        if (selected.has(game.id)) {
          selected.delete(game.id);
          btn.classList.remove("filled");
          btn.setAttribute("aria-pressed", "false");
        } else {
          selected.add(game.id);
          btn.classList.add("filled");
          btn.setAttribute("aria-pressed", "true");
        }
      });
      container.appendChild(btn);
    });
    if (games.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No games to clear.";
      container.appendChild(p);
    }
  }
  function closeClearTimeTrendsModal() {
    const modal = qs("clearTimeTrendsModal");
    if (modal) {
      clearTimeTrendsModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen && !clearDataModalOpen && !timeTrendsDetailModalOpen) document.body.style.overflow = "";
    }
  }
  function confirmClearTimeTrends() {
    const container = qs("clearTimeTrendsModalGames");
    if (!container) return;
    const selectedIds = new Set();
    container.querySelectorAll('.clear-time-trends-pill.filled, .clear-time-trends-pill[aria-pressed="true"]').forEach((btn) => {
      selectedIds.add(btn.dataset.gameId);
    });
    if (selectedIds.size > 0 && state.completionTimestamps) {
      state.completionTimestamps = state.completionTimestamps.filter((t) => !selectedIds.has(t.gameId));
      const selected = state.timestampsSelectedGameIds || {};
      selectedIds.forEach((id) => delete selected[id]);
      if (Object.keys(selected).length === 0) state.timestampsSelectedGameIds = {};
      const endgameSelected = state.timestampsSelectedEndgameTasks || {};
      Object.keys(endgameSelected).forEach((k) => {
        if (selectedIds.has(k.split(".")[0])) delete endgameSelected[k];
      });
      if (Object.keys(endgameSelected).length === 0) state.timestampsSelectedEndgameTasks = {};
    }
    save();
    renderAll();
    closeClearTimeTrendsModal();
  }

  let timeTrendsDetailModalOpen = false;
  function openTimeTrendsDetailModal(title, items) {
    const modal = qs("timeTrendsDetailModal");
    if (!modal) return;
    timeTrendsDetailModalOpen = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const titleEl = qs("timeTrendsDetailModalTitle");
    if (titleEl) titleEl.textContent = title;
    const listEl = qs("timeTrendsDetailModalList");
    if (listEl) {
      listEl.innerHTML = "";
      if (!items || items.length === 0) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.textContent = "No completions in this period.";
        listEl.appendChild(p);
      } else {
        items.forEach((item) => {
          const row = document.createElement("div");
          row.className = "time-trends-detail-list-item";
          const gameName = item.gameName || item.gameId || "?";
          const taskLabel = item.taskLabel || "";
          const typeLabel = item.taskType ? " (" + item.taskType.charAt(0).toUpperCase() + item.taskType.slice(1) + ")" : "";
          const datePart = item.dateStr ? " — " + item.dateStr : "";
          row.textContent = gameName + (taskLabel ? " – " + taskLabel : "") + typeLabel + datePart;
          listEl.appendChild(row);
        });
      }
    }
  }
  function closeTimeTrendsDetailModal() {
    const modal = qs("timeTrendsDetailModal");
    if (modal) {
      timeTrendsDetailModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen && !clearDataModalOpen) document.body.style.overflow = "";
    }
  }
  function initTimeTrendsDetailModal() {
    const modalEl = qs("timeTrendsDetailModal");
    const closeBtn = qs("timeTrendsDetailModalClose");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "timeTrendsDetailModal") closeTimeTrendsDetailModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeTimeTrendsDetailModal);
    document.addEventListener("keydown", (e) => {
      if (!timeTrendsDetailModalOpen) return;
      if (e.key === "Escape") closeTimeTrendsDetailModal();
    });
  }

  function initClearTimeTrendsModal() {
    const modalEl = qs("clearTimeTrendsModal");
    const closeBtn = qs("clearTimeTrendsModalClose");
    const cancelBtn = qs("clearTimeTrendsCancel");
    const confirmBtn = qs("clearTimeTrendsConfirm");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "clearTimeTrendsModal") closeClearTimeTrendsModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeClearTimeTrendsModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeClearTimeTrendsModal);
    if (confirmBtn) confirmBtn.addEventListener("click", confirmClearTimeTrends);
    document.addEventListener("keydown", (e) => {
      if (!clearTimeTrendsModalOpen) return;
      if (e.key === "Escape") closeClearTimeTrendsModal();
    });
  }

  function initEarningsModal() {
    const modalEl = qs("earningsModal");
    const closeBtn = qs("earningsModalClose");
    const cancelBtn = qs("earningsModalCancel");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeEarningsModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeEarningsModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeEarningsModal);
  }

  function initCalendarDayModal() {
    const modalEl = qs("calendarDayModal");
    const closeBtn = qs("calendarDayModalClose");
    const cancelBtn = qs("calendarDayModalCancel");
    const saveBtn = qs("calendarDayModalSave");

    if (!modalEl) return;

    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeCalendarDayModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeCalendarDayModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeCalendarDayModal);
    if (saveBtn) saveBtn.addEventListener("click", saveCalendarDayModal);

    document.addEventListener("keydown", (e) => {
      if (!calendarDayModal.open) return;
      if (e.key === "Escape") closeCalendarDayModal();
    });
  }

  let settingsModalOpen = false;

  const PRESET_NAMES = {
    purple: "Purple",
    blue: "Blue",
    green: "Green",
    rose: "Rose",
    amber: "Amber",
    teal: "Teal",
    aqua: "Aqua",
    grayscale: "Grayscale",
    red: "Red",
    orange: "Orange",
    yellow: "Yellow",
    pink: "Pink",
    indigo: "Indigo",
    violet: "Violet",
    brown: "Brown",
    gray: "Gray",
    black: "Black",
    white: "White",
  };

  function openSettingsModal() {
    const modalEl = qs("settingsModal");
    if (!modalEl) return;
    settingsModalOpen = true;
    modalEl.hidden = false;
    modalEl.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderSettingsPresetGrid();
    renderSettingsCustomLayers();
    renderSettingsSavedPresets();
    syncSettingsUI();
  }

  function closeSettingsModal() {
    const modalEl = qs("settingsModal");
    if (!modalEl) return;
    settingsModalOpen = false;
    modalEl.hidden = true;
    modalEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function renderSettingsPresetGrid() {
    const grid = qs("settings-preset-grid");
    if (!grid) return;
    grid.innerHTML = "";
    THEME_PRESET_IDS_UNIQUE.forEach((id) => {
      const name = PRESET_NAMES[id] || id;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-theme-option";
      btn.dataset.theme = id;
      btn.setAttribute("aria-pressed", "false");
      btn.setAttribute("aria-label", name);
      btn.title = name;
      const swatch = document.createElement("span");
      swatch.className = "settings-theme-swatch settings-theme-" + id;
      const label = document.createElement("span");
      label.className = "settings-theme-name";
      label.textContent = name;
      btn.appendChild(swatch);
      btn.appendChild(label);
      grid.appendChild(btn);
    });
    grid.querySelectorAll(".settings-theme-option").forEach((btn) => {
      btn.addEventListener("click", () => selectPreset(btn.getAttribute("data-theme")));
    });
  }

  function selectPreset(themeId) {
    if (!themeId) return;
    const isCustom = themeId.startsWith("custom_");
    const hasPreset = THEME_PRESET_IDS_UNIQUE.includes(themeId);
    const hasCustomPreset = isCustom && state.customThemePresets.some((p) => p.id === themeId);
    if (!hasPreset && !hasCustomPreset) return;
    state.themeMode = "preset";
    state.themePreset = themeId;
    applyTheme();
    state.themeCustom = getCurrentThemeColors();
    save();
    syncSettingsUI();
    renderSettingsSavedPresets();
  }

  function hexToRgb(hex) {
    const m = hex.replace(/^#/, "").match(/^([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  let colorPickerEditingLayerId = null;

  let colorPickerHsl = { h: 270, s: 75, l: 50 };

  function openColorPickerPopover(layerId, layerLabel, hex) {
    const modal = qs("colorWheelModal");
    if (!modal) return;
    colorPickerEditingLayerId = layerId;
    const nameEl = qs("settings-picker-layer-name");
    if (nameEl) nameEl.textContent = layerLabel;
    const titleEl = qs("colorWheelModalTitle");
    if (titleEl) titleEl.textContent = layerLabel;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    const rgb = hexToRgb(hex || "#7c3aed");
    if (rgb) {
      colorPickerHsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    }
    const lightnessSlider = qs("settings-lightness-slider");
    if (lightnessSlider) lightnessSlider.value = colorPickerHsl.l;
    drawColorWheel();
    updateWheelMarker();
  }

  function closeColorPickerPopover() {
    const modal = qs("colorWheelModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
    colorPickerEditingLayerId = null;
  }

  function drawColorWheel() {
    const canvas = qs("settings-color-wheel");
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const innerR = size * 0.32;
    const outerR = size * 0.48;
    for (let i = 0; i < 360; i += 2) {
      const hue = i;
      const startAng = ((hue - 1) * Math.PI) / 180;
      const endAng = ((hue + 1) * Math.PI) / 180;
      const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      grad.addColorStop(0, "hsl(" + hue + ", 0%, 50%)");
      grad.addColorStop(1, "hsl(" + hue + ", 100%, 50%)");
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, startAng, endAng);
      ctx.arc(cx, cy, innerR, endAng, startAng, true);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = "hsl(0, 0%, 50%)";
    ctx.fill();
  }

  function wheelPosToHsl(px, py) {
    const canvas = qs("settings-color-wheel");
    if (!canvas) return colorPickerHsl;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const x = (px - rect.left) * scaleX - cx;
    const y = (py - rect.top) * scaleY - cy;
    const r = Math.sqrt(x * x + y * y);
    const innerR = canvas.width * 0.32;
    const outerR = canvas.width * 0.48;
    let h = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    let s = 0;
    if (r >= outerR) {
      s = 100;
    } else if (r > innerR) {
      s = ((r - innerR) / (outerR - innerR)) * 100;
    }
    const lSlider = qs("settings-lightness-slider");
    const l = lSlider ? parseInt(lSlider.value || "50", 10) : 50;
    return { h: Math.round(h), s: Math.round(s), l };
  }

  function updateWheelMarker() {
    const wrap = document.querySelector(".settings-color-wheel-wrap");
    const marker = qs("settings-wheel-marker");
    const canvas = qs("settings-color-wheel");
    if (!wrap || !marker || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const innerR = canvas.width * 0.32;
    const outerR = canvas.width * 0.48;
    const r = innerR + (colorPickerHsl.s / 100) * (outerR - innerR);
    const rad = (colorPickerHsl.h * Math.PI) / 180;
    const x = rect.width / 2 + r * scaleX * Math.cos(rad);
    const y = rect.height / 2 + r * scaleY * Math.sin(rad);
    marker.style.left = (rect.left - wrap.getBoundingClientRect().left + x) + "px";
    marker.style.top = (rect.top - wrap.getBoundingClientRect().top + y) + "px";
  }

  function getColorPickerHex() {
    const lSlider = qs("settings-lightness-slider");
    const l = lSlider ? parseInt(lSlider.value || "50", 10) : colorPickerHsl.l;
    const rgb = hslToRgb(colorPickerHsl.h, colorPickerHsl.s, l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  function applyColorPickerToLayer() {
    if (!colorPickerEditingLayerId) return;
    const hex = getColorPickerHex();
    updateCustomLayer(colorPickerEditingLayerId, hex);
    const row = document.querySelector('.settings-custom-layer[data-layer-id="' + colorPickerEditingLayerId + '"]');
    if (row) {
      const swatch = row.querySelector(".settings-layer-swatch");
      if (swatch) swatch.style.background = hex;
    }
  }

  let colorPickerPopoverInitialized = false;

  function initColorPickerPopover() {
    if (colorPickerPopoverInitialized) return;
    colorPickerPopoverInitialized = true;
    const modal = qs("colorWheelModal");
    const canvas = qs("settings-color-wheel");
    const wrap = document.querySelector(".settings-color-wheel-wrap");
    const lightnessSlider = qs("settings-lightness-slider");
    const closeBtn = qs("settings-picker-close");
    const modalCloseBtn = qs("colorWheelModalClose");
    if (!modal || !canvas || !wrap) return;

    const closeWheel = () => { applyColorPickerToLayer(); closeColorPickerPopover(); };
    if (closeBtn) closeBtn.addEventListener("click", closeWheel);
    if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeWheel);
    modal.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "colorWheelModal") closeWheel();
    });

    function handleWheelClick(e) {
      const rect = canvas.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      colorPickerHsl = wheelPosToHsl(e.clientX, e.clientY);
      updateWheelMarker();
      applyColorPickerToLayer();
    }

    canvas.addEventListener("mousedown", (e) => {
      handleWheelClick(e);
      const move = (ev) => {
        handleWheelClick(ev);
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });

    if (lightnessSlider) {
      lightnessSlider.addEventListener("input", () => {
        applyColorPickerToLayer();
      });
    }

    drawColorWheel();
  }

  function renderSettingsSavedPresets() {
    const container = qs("settings-saved-presets");
    if (!container) return;
    container.innerHTML = "";
    (state.customThemePresets || []).forEach((preset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-saved-preset" + (state.themePreset === preset.id ? " selected" : "");
      btn.dataset.presetId = preset.id;
      const swatch = document.createElement("span");
      swatch.className = "settings-saved-preset-swatch";
      swatch.style.background = preset.colors?.accent || "#7c3aed";
      const label = document.createElement("span");
      label.className = "settings-saved-preset-name";
      label.textContent = preset.name || preset.id;
      btn.title = preset.name || preset.id;
      btn.appendChild(swatch);
      btn.appendChild(label);
      btn.addEventListener("click", () => selectPreset(preset.id));
      container.appendChild(btn);
    });
  }

  function getCurrentThemeColors() {
    if (state.themeMode === "custom" && state.themeCustom) return { ...state.themeCustom };
    if (state.themePreset && state.themePreset.startsWith("custom_")) {
      const p = state.customThemePresets.find((pr) => pr.id === state.themePreset);
      if (p && p.colors) return { ...p.colors };
    }
    const root = document.documentElement;
    const cs = root ? getComputedStyle(root) : null;
    if (!cs) return { ...DEFAULT_CUSTOM_THEME };
    return {
      bg: cs.getPropertyValue("--bg").trim() || DEFAULT_CUSTOM_THEME.bg,
      bgElevated: cs.getPropertyValue("--bg-elevated").trim() || DEFAULT_CUSTOM_THEME.bgElevated,
      bgPanel: cs.getPropertyValue("--bg-panel").trim() || DEFAULT_CUSTOM_THEME.bgPanel,
      text: cs.getPropertyValue("--text").trim() || DEFAULT_CUSTOM_THEME.text,
      textMuted: cs.getPropertyValue("--text-muted").trim() || DEFAULT_CUSTOM_THEME.textMuted,
      accent: cs.getPropertyValue("--accent").trim() || DEFAULT_CUSTOM_THEME.accent,
      accentHover: cs.getPropertyValue("--accent-hover").trim() || DEFAULT_CUSTOM_THEME.accentHover,
      accentActive: cs.getPropertyValue("--accent-active").trim() || DEFAULT_CUSTOM_THEME.accentActive,
      border: cs.getPropertyValue("--border").trim() || DEFAULT_CUSTOM_THEME.border,
      success: cs.getPropertyValue("--success").trim() || DEFAULT_CUSTOM_THEME.success,
      pieDailies: cs.getPropertyValue("--pie-dailies").trim() || DEFAULT_CUSTOM_THEME.pieDailies,
      pieWeeklies: cs.getPropertyValue("--pie-weeklies").trim() || DEFAULT_CUSTOM_THEME.pieWeeklies,
      pieEndgame: cs.getPropertyValue("--pie-endgame").trim() || DEFAULT_CUSTOM_THEME.pieEndgame,
      pieMissed: cs.getPropertyValue("--pie-missed").trim() || DEFAULT_CUSTOM_THEME.pieMissed,
    };
  }

  function openSavePresetModal() {
    const modal = qs("savePresetModal");
    const input = qs("savePresetNameInput");
    if (!modal || !input) return;
    input.value = "My theme";
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => input.focus(), 0);
  }

  function closeSavePresetModal() {
    const modal = qs("savePresetModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function confirmSavePreset() {
    const input = qs("savePresetNameInput");
    const name = input && input.value ? input.value.trim() : "";
    if (!name) return;
    closeSavePresetModal();
    const colors = getCurrentThemeColors();
    const id = "custom_" + Date.now();
    state.customThemePresets = state.customThemePresets || [];
    state.customThemePresets.push({ id, name, colors });
    state.themeMode = "preset";
    state.themePreset = id;
    applyTheme();
    save();
    syncSettingsUI();
    renderSettingsSavedPresets();
  }

  function openDeletePresetModal() {
    if (!state.themePreset || !state.themePreset.startsWith("custom_")) return;
    const preset = state.customThemePresets.find((p) => p.id === state.themePreset);
    const modal = qs("deletePresetModal");
    const msg = qs("deletePresetMessage");
    if (!modal || !msg) return;
    msg.textContent = 'Are you sure you want to delete "' + (preset ? preset.name : "this preset") + '"? This cannot be undone.';
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function closeDeletePresetModal() {
    const modal = qs("deletePresetModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function confirmDeletePreset() {
    if (!state.themePreset || !state.themePreset.startsWith("custom_")) return;
    closeDeletePresetModal();
    state.customThemePresets = (state.customThemePresets || []).filter((p) => p.id !== state.themePreset);
    state.themePreset = "purple";
    state.themeMode = "preset";
    applyTheme();
    save();
    syncSettingsUI();
    renderSettingsSavedPresets();
  }

  function renderSettingsCustomLayers() {
    const container = qs("settings-custom-layers");
    if (!container) return;
    if (!state.themeCustom) {
      state.themeCustom = { ...DEFAULT_CUSTOM_THEME };
    }
    container.innerHTML = "";
    COLOR_LAYERS.forEach((layer) => {
      const row = document.createElement("div");
      row.className = "settings-custom-layer";
      row.dataset.layerId = layer.id;
      const label = document.createElement("label");
      label.textContent = layer.label;
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "settings-layer-swatch";
      swatch.style.background = state.themeCustom[layer.id] || "#000000";
      swatch.title = layer.label + " (click for color wheel)";
      row.appendChild(label);
      row.appendChild(swatch);
      container.appendChild(row);

      swatch.addEventListener("click", () => {
        openColorPickerPopover(layer.id, layer.label, state.themeCustom[layer.id] || "#000000");
      });
    });
    renderSettingsSavedPresets();
    initColorPickerPopover();
  }

  function updateCustomLayer(layerId, hex) {
    state.themeMode = "custom";
    if (!state.themeCustom) state.themeCustom = { ...DEFAULT_CUSTOM_THEME };
    state.themeCustom[layerId] = hex;
    applyTheme();
    save();
  }

  function syncSettingsUI() {
    document.querySelectorAll(".settings-theme-option").forEach((btn) => {
      const themeId = btn.getAttribute("data-theme");
      const active = state.themeMode === "preset" && themeId === state.themePreset;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const textSizeEl = qs("settingsTextSize");
    if (textSizeEl) textSizeEl.value = state.textSize || "medium";
    const primaryServerEl = qs("settingsPrimaryServer");
    if (primaryServerEl) primaryServerEl.value = state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
    const defaultResetTzEl = qs("settingsDefaultResetTimezone");
    if (defaultResetTzEl) {
      if (defaultResetTzEl.options.length === 0) {
        COMMON_TIMEZONES.forEach((opt) => {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label;
          defaultResetTzEl.appendChild(o);
        });
      }
      defaultResetTzEl.value = state.defaultResetTimezone || "Etc/GMT+5";
    }
    const dateFormatEl = qs("settingsDateFormat");
    if (dateFormatEl) dateFormatEl.value = state.dateFormat || "mdy";
    const timeFormatEl = qs("settingsTimeFormat");
    if (timeFormatEl) timeFormatEl.value = state.timeFormat || "12h";
    const firstDayEl = qs("settingsFirstDayOfWeek");
    if (firstDayEl) firstDayEl.value = String(state.firstDayOfWeek ?? 0);
    const compactEl = qs("settingsCompactMode");
    if (compactEl) compactEl.checked = !!state.compactMode;
    const defaultTabEl = qs("settingsDefaultTab");
    if (defaultTabEl) defaultTabEl.value = state.defaultTab || "about";
    const countdownEl = qs("settingsShowResetCountdown");
    if (countdownEl) countdownEl.checked = state.showResetCountdown !== false;
    const confirmDeleteEl = qs("settingsConfirmBeforeDelete");
    if (confirmDeleteEl) confirmDeleteEl.checked = state.confirmBeforeDelete !== false;
    const undoRow = qs("settingsUndoSimulationRow");
    if (undoRow) undoRow.hidden = !state.lastSimulationSnapshot;
    const undoSkipRow = qs("settingsUndoSkipDayRow");
    if (undoSkipRow) undoSkipRow.hidden = !state.lastSkipDaySnapshot;
    const standardTab = document.querySelector('.settings-tab-btn[data-color-tab="standard"]');
    const customTab = document.querySelector('.settings-tab-btn[data-color-tab="custom"]');
    const standardPanel = qs("settings-color-standard");
    const customPanel = qs("settings-color-custom");
    const isCustom = state.themeMode === "custom" || (state.themePreset && state.themePreset.startsWith("custom_"));
    if (standardTab) {
      standardTab.classList.toggle("active", !isCustom);
      standardTab.setAttribute("aria-selected", !isCustom ? "true" : "false");
    }
    if (customTab) {
      customTab.classList.toggle("active", isCustom);
      customTab.setAttribute("aria-selected", isCustom ? "true" : "false");
    }
    if (standardPanel) {
      standardPanel.classList.toggle("active", !isCustom);
      standardPanel.hidden = isCustom;
    }
    if (customPanel) {
      customPanel.classList.toggle("active", isCustom);
      customPanel.hidden = !isCustom;
    }
  }

  function updateAccountUI(user) {
    const statusEl = qs("accountStatus");
    const loginBtns = qs("accountLoginButtons");
    const logoutRow = qs("accountLogoutRow");
    if (!statusEl || !loginBtns || !logoutRow) return;

    if (user) {
      const provider = user.providerData && user.providerData[0] ? user.providerData[0].providerId : "";
      const providerName = provider === "google.com" ? "Google" : provider === "facebook.com" ? "Facebook" : provider === "twitter.com" ? "Twitter" : "Account";
      statusEl.textContent = "Signed in with " + providerName + " (" + (user.email || user.displayName || "signed in") + ")";
      statusEl.className = "account-status account-signed-in";
      loginBtns.hidden = true;
      logoutRow.hidden = false;
    } else {
      statusEl.textContent = "";
      statusEl.className = "account-status";
      loginBtns.hidden = false;
      logoutRow.hidden = true;
    }
  }

  function initSettingsModal() {
    const modalEl = qs("settingsModal");
    const closeBtn = qs("settingsModalClose");
    const settingsBtn = qs("sidebarSettingsBtn");

    if (!modalEl) return;

    if (settingsBtn) settingsBtn.addEventListener("click", openSettingsModal);

    const loginGoogle = qs("accountLoginGoogle");
    const loginFacebook = qs("accountLoginFacebook");
    const loginTwitter = qs("accountLoginTwitter");
    const logoutBtn = qs("accountLogoutBtn");
    if (loginGoogle && typeof window.signInWithGoogle === "function") loginGoogle.addEventListener("click", window.signInWithGoogle);
    if (loginFacebook && typeof window.signInWithFacebook === "function") loginFacebook.addEventListener("click", window.signInWithFacebook);
    if (loginTwitter && typeof window.signInWithTwitter === "function") loginTwitter.addEventListener("click", window.signInWithTwitter);
    if (logoutBtn && typeof window.signOutCloud === "function") logoutBtn.addEventListener("click", window.signOutCloud);

    if (typeof window.updateAccountUI === "function") {
      window.updateAccountUI = updateAccountUI;
      updateAccountUI(window.getFirebaseUser ? window.getFirebaseUser() : null);
    }


    document.querySelectorAll(".settings-nav-item[data-settings-section]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.getAttribute("data-settings-section");
        document.querySelectorAll(".settings-nav-item[data-settings-section]").forEach((b) => {
          b.classList.remove("active");
          b.removeAttribute("aria-current");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-current", "page");
        document.querySelectorAll(".settings-section").forEach((sectionEl) => {
          sectionEl.classList.remove("active");
        });
        const target = document.getElementById("settings-section-" + section);
        if (target) target.classList.add("active");
      });
    });

    const textSizeEl = qs("settingsTextSize");
    if (textSizeEl) textSizeEl.addEventListener("change", () => {
      state.textSize = textSizeEl.value || "medium";
      applyTextSize();
      save();
    });
    const primaryServerEl = qs("settingsPrimaryServer");
    if (primaryServerEl) primaryServerEl.addEventListener("change", () => {
      const v = primaryServerEl.value;
      if (["america", "asia", "europe"].includes(v)) {
        state.primaryServer = v;
        save();
        updateSidebarTime();
      }
    });
    const defaultResetTzEl = qs("settingsDefaultResetTimezone");
    if (defaultResetTzEl) defaultResetTzEl.addEventListener("change", () => {
      state.defaultResetTimezone = defaultResetTzEl.value || "Etc/GMT+5";
      freezeTalliesOnTimezoneChange();
      save();
      updateSidebarTime();
      renderAll();
    });
    const dateFormatEl = qs("settingsDateFormat");
    if (dateFormatEl) dateFormatEl.addEventListener("change", () => {
      state.dateFormat = dateFormatEl.value || "mdy";
      save();
      renderAll();
    });
    const timeFormatEl = qs("settingsTimeFormat");
    if (timeFormatEl) timeFormatEl.addEventListener("change", () => {
      state.timeFormat = timeFormatEl.value || "12h";
      save();
      updateSidebarTime();
    });
    const syncLocalTzBtn = qs("settingsSyncLocalTimezoneBtn");
    if (syncLocalTzBtn) syncLocalTzBtn.addEventListener("click", () => {
      const matched = getMatchingTimezoneForLocalOffset();
      state.defaultResetTimezone = matched;
      const defaultResetTzEl = qs("settingsDefaultResetTimezone");
      if (defaultResetTzEl) defaultResetTzEl.value = matched;
      freezeTalliesOnTimezoneChange();
      save();
      updateSidebarTime();
      renderAll();
    });
    const firstDayEl = qs("settingsFirstDayOfWeek");
    if (firstDayEl) firstDayEl.addEventListener("change", () => {
      state.firstDayOfWeek = parseInt(firstDayEl.value, 10) || 0;
      save();
      renderAll();
    });
    const compactEl = qs("settingsCompactMode");
    if (compactEl) compactEl.addEventListener("change", () => {
      state.compactMode = compactEl.checked;
      applyCompactMode();
      save();
      renderAll();
    });
    const defaultTabEl = qs("settingsDefaultTab");
    if (defaultTabEl) defaultTabEl.addEventListener("change", () => {
      state.defaultTab = defaultTabEl.value || "about";
      save();
    });
    const countdownEl = qs("settingsShowResetCountdown");
    if (countdownEl) countdownEl.addEventListener("change", () => {
      state.showResetCountdown = countdownEl.checked;
      save();
      updateSidebarTime();
    });
    const confirmDeleteEl = qs("settingsConfirmBeforeDelete");
    if (confirmDeleteEl) confirmDeleteEl.addEventListener("change", () => {
      state.confirmBeforeDelete = confirmDeleteEl.checked;
      save();
    });

    const exportBtn = qs("settingsExportBtn");
    if (exportBtn) exportBtn.addEventListener("click", () => {
      const payload = JSON.stringify({ [STORAGE_KEY]: localStorage.getItem(STORAGE_KEY) }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gacha-tracker-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    const importInput = qs("settingsImportInput");
    if (importInput) importInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const raw = parsed ? parsed[STORAGE_KEY] : null;
          if (!raw) throw new Error("Invalid backup file");
          const data = JSON.parse(raw);
          if (!data || !data.games) throw new Error("Invalid backup file");
          const keys = Object.keys(data);
          keys.forEach((k) => {
            if (state[k] !== undefined && k !== "lastSimulationSnapshot") state[k] = data[k];
          });
          state.lastSimulationSnapshot = null;
          save();
          load();
          renderAll();
          closeSettingsModal();
        } catch (err) {
          alert("Failed to import: " + (err.message || "Invalid file"));
        }
        importInput.value = "";
      };
      reader.readAsText(file);
    });
    const simulateBtn = qs("settingsSimulateBtn");
    if (simulateBtn) simulateBtn.addEventListener("click", () => {
      runSimulation();
      closeSettingsModal();
    });
    const undoBtn = qs("settingsUndoSimulationBtn");
    if (undoBtn) undoBtn.addEventListener("click", () => {
      undoSimulation();
      closeSettingsModal();
    });
    const skipDayBtn = qs("settingsSkipDayBtn");
    if (skipDayBtn) skipDayBtn.addEventListener("click", () => {
      skipDayForward();
      syncSettingsUI();
      closeSettingsModal();
    });
    const undoSkipBtn = qs("settingsUndoSkipDayBtn");
    if (undoSkipBtn) undoSkipBtn.addEventListener("click", () => {
      undoSkipDay();
      syncSettingsUI();
      closeSettingsModal();
    });
    const clearBtn = qs("settingsClearDataBtn");
    if (clearBtn) clearBtn.addEventListener("click", () => {
      if (state.confirmBeforeDelete === false) {
        confirmClearData();
        return;
      }
      openClearDataModal();
    });

    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeSettingsModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeSettingsModal);

    document.querySelectorAll('.settings-tab-btn[data-color-tab]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-color-tab");
        const isCustom = tab === "custom";
        state.themeMode = isCustom ? "custom" : "preset";
        if (isCustom && !state.themeCustom) {
          state.themeCustom = { ...DEFAULT_CUSTOM_THEME };
        }
        applyTheme();
        save();
        syncSettingsUI();
        if (isCustom) renderSettingsCustomLayers();
      });
    });

    const saveBtn = qs("settings-save-preset-btn");
    const deleteBtn = qs("settings-delete-preset-btn");
    if (saveBtn) saveBtn.addEventListener("click", openSavePresetModal);
    if (deleteBtn) deleteBtn.addEventListener("click", openDeletePresetModal);

    qs("savePresetModal")?.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "savePresetModal") closeSavePresetModal();
    });
    qs("savePresetModalClose")?.addEventListener("click", closeSavePresetModal);
    qs("savePresetCancel")?.addEventListener("click", closeSavePresetModal);
    qs("savePresetConfirm")?.addEventListener("click", confirmSavePreset);
    qs("savePresetNameInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmSavePreset();
    });

    qs("deletePresetModal")?.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "deletePresetModal") closeDeletePresetModal();
    });
    qs("deletePresetModalClose")?.addEventListener("click", closeDeletePresetModal);
    qs("deletePresetCancel")?.addEventListener("click", closeDeletePresetModal);
    qs("deletePresetConfirm")?.addEventListener("click", confirmDeletePreset);

    qs("clearDataModal")?.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "clearDataModal") closeClearDataModal();
    });
    qs("clearDataModalClose")?.addEventListener("click", closeClearDataModal);
    qs("clearDataCancel")?.addEventListener("click", closeClearDataModal);
    qs("clearDataConfirm")?.addEventListener("click", confirmClearData);

    document.addEventListener("keydown", (e) => {
      if (!settingsModalOpen && !clearDataModalOpen) return;
      if (e.key === "Escape") {
        if (clearDataModalOpen) {
          closeClearDataModal();
        } else if (colorPickerEditingLayerId) {
          applyColorPickerToLayer();
          closeColorPickerPopover();
        } else {
          closeSettingsModal();
        }
      }
    });

  }

  function initTaskModal() {
    const modalEl = qs("taskModal");
    const closeBtn = qs("taskModalClose");
    const cancelBtn = qs("taskModalCancel");
    const form = qs("taskModalForm");

    if (!modalEl || !form) return;

    modalEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-close") === "true") closeTaskModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeTaskModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeTaskModal);
