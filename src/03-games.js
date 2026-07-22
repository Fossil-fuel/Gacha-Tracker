    document.querySelectorAll(".task-menu-grid .day-cell").forEach((cell) => {
      cell.addEventListener("click", () => {
        updateDaySelection(Number(cell.getAttribute("data-day")));
      });
      cell.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          updateDaySelection(Number(cell.getAttribute("data-day")));
        }
      });
    });

    const freqDay = qs("taskFrequencyUnitDay");
    const freqWeek = qs("taskFrequencyUnitWeek");
    const limDay = qs("taskTimeLimitUnitDay");
    const limWeek = qs("taskTimeLimitUnitWeek");
    if (freqDay) freqDay.addEventListener("click", () => { updateUnitToggles("frequency", "day"); updateTaskCycleEndPreview(); updateTaskTimeRemainingDisplay(); });
    if (freqWeek) freqWeek.addEventListener("click", () => { updateUnitToggles("frequency", "week"); updateTaskCycleEndPreview(); updateTaskTimeRemainingDisplay(); });
    if (limDay) limDay.addEventListener("click", () => { updateUnitToggles("timeLimit", "day"); updateTaskCycleEndPreview(); updateTaskTimeRemainingDisplay(); });
    if (limWeek) limWeek.addEventListener("click", () => { updateUnitToggles("timeLimit", "week"); updateTaskCycleEndPreview(); updateTaskTimeRemainingDisplay(); });

    document.addEventListener("keydown", (e) => {
      if (!taskModal.open) return;
      if (e.key === "Escape") closeTaskModal();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const game = getGame(taskModal.gameId);
      if (!game) return;

      const nameInput = qs("taskNameInput");
      const resetTime = qs("taskResetTime");
      const freqEvery = qs("taskFrequencyEvery");
      const limEvery = qs("taskTimeLimitEvery");
      const currencyInput = qs("taskCurrencyInput");
      const dateStartedInput = qs("taskDateStarted");

      const label = (nameInput && nameInput.value ? nameInput.value.trim() : "");
      if (!label) {
        if (nameInput) nameInput.focus();
        return;
      }

      const { hour, minute } = parseTimeStr(resetTime && resetTime.value ? resetTime.value : getDefaultTimeStr());
      const frequencyEvery = Math.max(1, Number(freqEvery && freqEvery.value) || 1);
      const timeLimitEvery = Math.max(1, Number(limEvery && limEvery.value) || 1);
      const currency = Math.max(0, Number(currencyInput && currencyInput.value) || 0);
      const dateStarted = isValidDateStr(dateStartedInput && dateStartedInput.value) ? dateStartedInput.value : getDateStr();
      const cycleEndToggle = qs("taskCycleEndEnabled");
      const cycleEndDateInput = qs("taskCycleEndDate");
      const cycleEndEnabled = !!(cycleEndToggle && cycleEndToggle.checked);
      let cycleEndDate = cycleEndEnabled && cycleEndDateInput && isValidDateStr(cycleEndDateInput.value)
        ? cycleEndDateInput.value
        : null;
      if (cycleEndEnabled && !cycleEndDate) {
        if (cycleEndDateInput) cycleEndDateInput.focus();
        return;
      }
      if (cycleEndEnabled && cycleEndDate < dateStarted) {
        alert("Last cycle end date must be on or after the cycle start date.");
        if (cycleEndDateInput) cycleEndDateInput.focus();
        return;
      }

      if (taskModal.taskType === "weeklies") {
        game.weeklies = game.weeklies || [];
        const existingIdx = taskModal.taskId ? game.weeklies.findIndex((t) => t.id === taskModal.taskId) : -1;
        const dstToggle = qs("taskAdjustForDST");
        const adjustForDST = dstToggle ? dstToggle.checked : true;
        const next = {
          id: taskModal.taskId || ("w_" + Date.now()),
          label,
          weekStartDay: taskModal.selectedDay,
          weekStartHour: hour,
          weekStartMinute: minute,
          currency,
          dateStarted,
          frequencyEvery,
          frequencyUnit: taskModal.frequencyUnit,
          timeLimitEvery,
          timeLimitUnit: taskModal.timeLimitUnit,
          adjustForDST,
          cycleEndEnabled: cycleEndEnabled || undefined,
          cycleEndDate: cycleEndEnabled ? cycleEndDate : null,
        };
        if (existingIdx >= 0) {
          const merged = { ...game.weeklies[existingIdx], ...next };
          if (!cycleEndEnabled) {
            delete merged.cycleEndEnabled;
            delete merged.cycleEndDate;
          }
          game.weeklies[existingIdx] = merged;
        } else game.weeklies.push(next);
      } else if (taskModal.taskType === "endgame") {
        game.endgame = game.endgame || [];
        const existingIdx = taskModal.taskId ? game.endgame.findIndex((t) => t.id === taskModal.taskId) : -1;
        const dstToggle = qs("taskAdjustForDST");
        const adjustForDST = dstToggle ? dstToggle.checked : true;
        const next = {
          id: taskModal.taskId || ("e_" + Date.now()),
          label,
          currency,
          weekStartDay: taskModal.selectedDay,
          weekStartHour: hour,
          weekStartMinute: minute,
          dateStarted,
          frequencyEvery,
          frequencyUnit: taskModal.frequencyUnit,
          timeLimitEvery,
          timeLimitUnit: taskModal.timeLimitUnit,
          adjustForDST,
          cycleEndEnabled: cycleEndEnabled || undefined,
          cycleEndDate: cycleEndEnabled ? cycleEndDate : null,
        };
        if (existingIdx >= 0) {
          const prev = game.endgame[existingIdx];
          const oldCurrency = getEndgamePotential(prev);
          const taskId = prev.id || prev.label;
          if (oldCurrency !== currency) {
            const key = game.id + "." + taskId;
            const attempted = getAttemptedAmount(state.endgameAttempted, key);
            if (attempted > 0) {
              freezeEndgameCurrencyPotentialForPastCycles(game.id, taskId, oldCurrency, attempted);
            }
          }
          const merged = { ...game.endgame[existingIdx], ...next };
          if (!cycleEndEnabled) {
            delete merged.cycleEndEnabled;
            delete merged.cycleEndDate;
          }
          game.endgame[existingIdx] = merged;
        } else {
          game.endgame.push(next);
        }
      } else {
        return;
      }

      save();
      closeTaskModal();
      renderActiveTab();
    });
  }

  function addGame(name, opts) {
    const o = opts || {};
    const id = "g_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const weeklies = Array.isArray(o.weeklies) ? o.weeklies.map((t) => ({
      ...t,
      dateStarted: isValidDateStr(t.dateStarted) ? t.dateStarted : getDateStr(),
      frequencyEvery: Number.isFinite(t.frequencyEvery) ? t.frequencyEvery : 1,
      frequencyUnit: t.frequencyUnit || "week",
      timeLimitEvery: t.timeLimitEvery != null ? t.timeLimitEvery : 1,
      timeLimitUnit: t.timeLimitUnit || "week",
    })) : [];
    const endgame = Array.isArray(o.endgame) ? o.endgame.map((t) => ({
      ...t,
      dateStarted: isValidDateStr(t.dateStarted) ? t.dateStarted : getDateStr(),
    })) : [];
    state.games.push({
      id,
      name: name || "New game",
      presetId: o.presetId || null,
      server: (o.server && ["america", "asia", "europe"].includes(o.server)) ? o.server : "america",
      resetHour: Number.isFinite(o.resetHour) ? o.resetHour : getDefaultResetHour(),
      dailies: o.dailies == null ? true : !!o.dailies,
      dailyCurrency: Math.max(0, Number(o.dailyCurrency) || 0),
      currencyPerPull: Math.max(0, Number(o.currencyPerPull) || 0),
      currencyName: (o.currencyName && String(o.currencyName).trim()) || "",
      weeklies,
      endgame,
    });
    const game = getGame(id);
    if (game && o.presetId) {
      const now = getSimulatedNow();
      const todayStr = getDateStr();
      if (game.dailies) {
        state.lastProcessedResets.dailies = state.lastProcessedResets.dailies || {};
        state.lastProcessedResets.dailies[id] = todayStr;
      }
      (game.weeklies || []).forEach((task) => {
        const key = id + "." + (task.id || task.label);
        const remainingMs = getWeeklyTimeRemainingMs(task, now, game);
        const { intervalMs, timeLimitMs } = getCycleParams(task);
        const cycleEndMs = now.getTime() + remainingMs;
        const nextCycleStartMs = cycleEndMs - timeLimitMs + intervalMs;
        state.lastProcessedResets.weeklies = state.lastProcessedResets.weeklies || {};
        state.lastProcessedResets.weeklies[key] = nextCycleStartMs;
      });
      (game.endgame || []).forEach((task) => {
        const key = id + "." + (task.id || task.label);
        const cycleStart = getCycleStartForDate(task, todayStr, game);
        const { intervalMs } = getCycleParams(task);
        state.lastProcessedResets.endgame = state.lastProcessedResets.endgame || {};
        state.lastProcessedResets.endgame[key] = cycleStart.getTime() + intervalMs;
      });
    }
    if (o.presetId && Array.isArray(o.extracurricular) && o.extracurricular.length > 0) {
      state.extracurricularTasks = state.extracurricularTasks || [];
      o.extracurricular.forEach((t, i) => {
        state.extracurricularTasks.push({
          id: "ex_" + Date.now() + "_" + i + "_" + Math.random().toString(36).slice(2, 8),
          label: t.label || "Task",
          startDate: getDateStr(),
          endDateTBD: t.endDateTBD !== false,
          endDate: t.endDateTBD === false ? (t.endDate || null) : null,
          description: t.description || null,
          gameId: id,
          currency: t.currency != null ? t.currency : undefined,
        });
      });
    }
    state.gamesSelectedId = id;
    state.dataSelectedGameId = id;
    save();
    renderActiveTab();
  }

  function deleteGame(gameId) {
    if (state.confirmBeforeDelete === false) {
      reallyDeleteGame(gameId);
    } else {
      openDeleteGameModal(gameId);
    }
  }

  function reallyDeleteGame(gameId) {
    const game = getGame(gameId);
    if (!game) return;

    state.games = state.games.filter((g) => g.id !== gameId);

    delete state.dailiesCompleted[gameId];
    delete state.dailiesAttempted[gameId];
    Object.keys(state.weekliesCompleted).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.weekliesCompleted[k];
    });
    Object.keys(state.weekliesAttempted).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.weekliesAttempted[k];
    });
    Object.keys(state.endgameCompleted).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgameCompleted[k];
    });
    Object.keys(state.endgameAttempted).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgameAttempted[k];
    });
    delete state.endgameCurrencyEarned[gameId];
    delete state.endgameCurrencyPotential[gameId];
    Object.keys(state.endgameCompletionDates || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgameCompletionDates[k];
    });
    Object.keys(state.endgamePendingCurrency || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgamePendingCurrency[k];
    });
    Object.keys(state.endgamePendingCycleStartMs || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgamePendingCycleStartMs[k];
    });

    delete state.lastProcessedResets.dailies[gameId];
    Object.keys(state.lastProcessedResets.weeklies || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.lastProcessedResets.weeklies[k];
    });
    Object.keys(state.lastProcessedResets.endgame || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.lastProcessedResets.endgame[k];
    });

    Object.keys(state.completionByDate || {}).forEach((dateStr) => {
      const day = state.completionByDate[dateStr];
      if (!day) return;
      if (day.dailies) day.dailies = day.dailies.filter((id) => id !== gameId);
      if (day.weeklies) day.weeklies = day.weeklies.filter((k) => !k.startsWith(gameId + "."));
      if (day.endgame) day.endgame = day.endgame.filter((k) => !k.startsWith(gameId + "."));
    });

    (state.extracurricularTasks || []).filter((t) => t.gameId === gameId).forEach((t) => {
      delete state.extracurricularCompleted[t.id];
      if (state.extracurricularCompletedAt) delete state.extracurricularCompletedAt[t.id];
      if (state.extracurricularCurrencyEarned) delete state.extracurricularCurrencyEarned[t.id];
    });
    state.extracurricularTasks = (state.extracurricularTasks || []).filter((t) => t.gameId !== gameId);

    if (state.dataSelectedGameId === gameId || state.gamesSelectedId === gameId) {
      const remaining = getAllGames();
      const nextId = remaining.length ? remaining[0].id : null;
      state.dataSelectedGameId = nextId;
      state.gamesSelectedId = nextId;
    }

    save();
    renderActiveTab();
  }

  function getCompletedAmount(obj, key) {
    const v = obj[key];
    if (v === undefined || v === null) return 0;
    if (typeof v === "boolean") return v ? 1 : 0;
    return Math.max(0, Number(v) || 0);
  }

  function getAttemptedAmount(obj, key) {
    const v = obj[key];
    if (v === undefined || v === null) return 0;
    return Math.max(0, Number(v) || 0);
  }

  function setDailiesAttempted(gameId, value) {
    state.dailiesAttempted[gameId] = Math.max(0, Number(value) || 0);
    save();
    renderActiveTab();
  }

  function setWeekliesAttempted(gameId, taskId, value) {
    const key = gameId + "." + taskId;
    state.weekliesAttempted[key] = Math.max(0, Number(value) || 0);
    save();
    renderActiveTab();
  }

  function setEndgameAttempted(gameId, taskId, value) {
    const key = gameId + "." + taskId;
    const old = getAttemptedAmount(state.endgameAttempted, key);
    const next = Math.max(0, Number(value) || 0);
    state.endgameAttempted[key] = next;
    const game = getGame(gameId);
    const task = game && (game.endgame || []).find((t) => (t.id || t.label) === taskId);
    if (task) {
      if (next > old) {
        const pot = getEndgamePotential(task);
        for (let i = old; i < next; i++) snapshotEndgamePotentialAt(gameId, taskId, i, pot);
      }
      ensureEndgamePotentialArrayLength(gameId, taskId, next);
    }
    save();
    renderActiveTab();
  }

  function isCompletedToday(type, key) {
    const dateStr = type === "dailies"
      ? (() => { const g = getGame(key); return g ? getDailyPeriodDateStr(g, getSimulatedNow()) : getDateStr(); })()
      : getDateStr();
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    return (dayData[type] || []).includes(key);
  }

  function toggleDaily(gameId) {
    const game = getGame(gameId);
    const dateStr = game ? getDailyPeriodDateStr(game, getSimulatedNow()) : getDateStr();
    const amt = getCompletedAmount(state.dailiesCompleted, gameId);
    const isMarkingComplete = !isCompletedToday("dailies", gameId);
    if (isMarkingComplete) {
      state.dailiesCompleted[gameId] = amt + 1;
      recordCompletion(dateStr, "dailies", gameId);
      const attempted = getAttemptedAmount(state.dailiesAttempted, gameId);
      if (attempted < state.dailiesCompleted[gameId]) state.dailiesAttempted[gameId] = state.dailiesCompleted[gameId];
    } else {
      state.dailiesCompleted[gameId] = Math.max(0, amt - 1);
      unrecordCompletion(dateStr, "dailies", gameId);
    }
    processResets();
    save();
    renderActiveTab();
  }

  function completeExtracurricularWithCurrency(taskId, currencyValue) {
    const task = (state.extracurricularTasks || []).find((t) => t.id === taskId);
    if (!task) return;
    if (!state.extracurricularCurrencyEarned) state.extracurricularCurrencyEarned = {};
    state.extracurricularCurrencyEarned[taskId] = Math.max(0, Number(currencyValue) || 0);
    state.extracurricularCompleted[taskId] = true;
    if (!state.extracurricularCompletedAt) state.extracurricularCompletedAt = {};
    state.extracurricularCompletedAt[taskId] = getSimulatedNow().toISOString();
    save();
    renderActiveTab();
  }

  function clearExtracurricularCompletion(taskId) {
    delete state.extracurricularCompleted[taskId];
    if (state.extracurricularCompletedAt) delete state.extracurricularCompletedAt[taskId];
    if (state.extracurricularCurrencyEarned) delete state.extracurricularCurrencyEarned[taskId];
    save();
    renderActiveTab();
  }

  function setTaskCycleStop(gameId, taskType, taskId, enabled, cycleEndDate) {
    const game = getGame(gameId);
    if (!game) return false;
    const list = taskType === "weeklies" ? (game.weeklies || []) : (game.endgame || []);
    const task = list.find((t) => (t.id || t.label) === taskId);
    if (!task) return false;
    const dateStarted = isValidDateStr(task.dateStarted) ? task.dateStarted : getDateStr();
    if (enabled) {
      const endDate = isValidDateStr(cycleEndDate) ? cycleEndDate : getDateStr();
      if (endDate < dateStarted) {
        alert("Last cycle end date must be on or after the cycle start date.");
        renderActiveTab();
        return false;
      }
      task.cycleEndEnabled = true;
      task.cycleEndDate = endDate;
    } else {
      delete task.cycleEndEnabled;
      delete task.cycleEndDate;
    }
    processResets();
    save();
    renderActiveTab();
    return true;
  }

  function appendTaskCycleEndFooter(parent, game, task, taskType) {
    if (!parent || !game || !task) return;
    const taskId = task.id || task.label;
    const footer = document.createElement("div");
    footer.className = "task-panel-cycle-end-footer";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "task-panel-cycle-end-toggle";
    toggleLabel.title = "Stop repeating cycles after the selected date";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "fill-toggle";
    toggle.checked = !!(task.cycleEndEnabled && isValidDateStr(task.cycleEndDate));
    toggle.setAttribute("aria-label", "Stop repeating cycles");

    const toggleText = document.createElement("span");
    toggleText.textContent = "Stop cycles";

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.className = "task-panel-cycle-end-date";
    dateInput.value = isValidDateStr(task.cycleEndDate) ? task.cycleEndDate : getDateStr();
    dateInput.hidden = !toggle.checked;
    dateInput.setAttribute("aria-label", "Last cycle end date");

    toggleLabel.appendChild(toggle);
    toggleLabel.appendChild(toggleText);
    footer.appendChild(toggleLabel);
    footer.appendChild(dateInput);

    toggle.addEventListener("change", () => {
      dateInput.hidden = !toggle.checked;
      if (!toggle.checked) {
        setTaskCycleStop(game.id, taskType, taskId, false);
        return;
      }
      if (!isValidDateStr(dateInput.value)) dateInput.value = getDateStr();
      setTaskCycleStop(game.id, taskType, taskId, true, dateInput.value);
    });
    dateInput.addEventListener("change", () => {
      if (!toggle.checked) return;
      setTaskCycleStop(game.id, taskType, taskId, true, dateInput.value);
    });

    parent.appendChild(footer);
  }

  function toggleWeekly(gameId, taskId) {
    const game = getGame(gameId);
    const task = (game && game.weeklies || []).find((t) => (t.id || t.label) === taskId);
    if (task && isTaskCycleEnded(task, getSimulatedNow(), game)) return;
    const key = gameId + "." + taskId;
    const dateStr = getDateStr();
    const amt = getCompletedAmount(state.weekliesCompleted, key);
    const isMarkingComplete = !isWeeklyCompletedInCurrentCycle(key, dateStr);
    if (isMarkingComplete) {
      state.weekliesCompleted[key] = amt + 1;
      recordCompletion(dateStr, "weeklies", key);
      const attempted = getAttemptedAmount(state.weekliesAttempted, key);
      if (attempted < state.weekliesCompleted[key]) state.weekliesAttempted[key] = state.weekliesCompleted[key];
    } else {
      const completedDateStr = getWeeklyCompletionDateInCurrentCycle(key, dateStr);
      if (completedDateStr) unrecordCompletion(completedDateStr, "weeklies", key);
      state.weekliesCompleted[key] = Math.max(0, amt - 1);
    }
    processResets();
    save();
    renderActiveTab();
  }

  function requestToggleEndgame(gameId, taskId) {
    const game = getGame(gameId);
    const task = (game && game.endgame || []).find((t) => (t.id || t.label) === taskId);
    if (task && isTaskCycleEnded(task, getSimulatedNow(), game)) return;
    const key = gameId + "." + taskId;
    const dateStr = getDateStr();
    if (isEndgameCompletedInCurrentCycle(key, dateStr)) {
      toggleEndgame(gameId, taskId);
      return;
    }
    openEndgameCompleteModal(gameId, taskId, null);
  }

  function completeEndgameWithCurrency(gameId, taskId, currencyValue) {
    const key = gameId + "." + taskId;
    const dateStr = getDateStr();
    const amt = getCompletedAmount(state.endgameCompleted, key);
    const game = getGame(gameId);
    const task = (game && game.endgame || []).find((t) => (t.id || t.label) === taskId);
    if (!game || !task) return;

    state.endgameCompleted[key] = amt + 1;
    recordCompletion(dateStr, "endgame", key);
    ensureEndgameEarnedArrayLength(gameId, taskId, amt + 1);
    snapshotEndgamePotentialAt(gameId, taskId, amt, getEndgamePotential(task));
    setEndgameEarnedAt(gameId, taskId, amt, currencyValue, { skipSave: true, skipRender: true });
    const { start, end } = getEndgameCycleDatesForDate(task, dateStr, game);
    setEndgameCompletionDate(gameId, taskId, amt, start, end, { skipSave: true });
    const attempted = getAttemptedAmount(state.endgameAttempted, key);
    if (attempted < state.endgameCompleted[key]) state.endgameAttempted[key] = state.endgameCompleted[key];
    state.endgamePendingCurrency[key] = 0;
    processResets();
    save();
    renderActiveTab();
  }

  function toggleEndgame(gameId, taskId) {
    const key = gameId + "." + taskId;
    const dateStr = getDateStr();
    const amt = getCompletedAmount(state.endgameCompleted, key);
    const isMarkingComplete = !isEndgameCompletedInCurrentCycle(key, dateStr);
    if (isMarkingComplete) {
      state.endgameCompleted[key] = amt + 1;
      recordCompletion(dateStr, "endgame", key);
      ensureEndgameEarnedArrayLength(gameId, taskId, amt + 1);
      snapshotEndgamePotentialAt(gameId, taskId, amt, getEndgamePotential(task));
      const attempted = getAttemptedAmount(state.endgameAttempted, key);
      if (attempted < state.endgameCompleted[key]) state.endgameAttempted[key] = state.endgameCompleted[key];
    } else {
      const completedDateStr = getEndgameCompletionDateInCurrentCycle(key, dateStr);
      if (completedDateStr) unrecordCompletion(completedDateStr, "endgame", key);
      state.endgameCompleted[key] = Math.max(0, amt - 1);
      ensureEndgameEarnedArrayLength(gameId, taskId, Math.max(0, amt - 1));
      ensureEndgamePotentialArrayLength(gameId, taskId, getAttemptedAmount(state.endgameAttempted, key));
    }
    processResets();
    save();
    renderActiveTab();
  }

  function getDailyEarned(gameId) {
    const game = getGame(gameId);
    if (!game || !game.dailies) return 0;
    const amt = getCompletedAmount(state.dailiesCompleted, gameId);
    return amt * getDailyPotential(game);
  }

  function getDailyPotential(game) {
    return Math.max(0, Number(game && game.dailyCurrency) || 0);
  }

  function getWeeklyEarned(gameId, taskId) {
    const game = getGame(gameId);
    const task = (game?.weeklies || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return 0;
    const key = gameId + "." + taskId;
    const amt = getCompletedAmount(state.weekliesCompleted, key);
    return amt * getWeeklyPotential(task);
  }

  function getWeeklyPotential(task) {
    return Math.max(0, Number(task && task.currency) || 0);
  }

  function getEndgameEarnedPerCompletion(gameId, taskId) {
    const arr = state.endgameCurrencyEarned[gameId] && state.endgameCurrencyEarned[gameId][taskId];
    return Array.isArray(arr) ? arr.slice() : [];
  }

  function setEndgameEarnedAt(gameId, taskId, index, value, opts) {
    if (!state.endgameCurrencyEarned[gameId]) state.endgameCurrencyEarned[gameId] = {};
    let arr = state.endgameCurrencyEarned[gameId][taskId];
    if (!Array.isArray(arr)) arr = [];
    while (arr.length <= index) arr.push(0);
    arr[index] = Math.max(0, Number(value) || 0);
    state.endgameCurrencyEarned[gameId][taskId] = arr;
    if (!opts || !opts.skipSave) save();
    if (!opts || !opts.skipRender) renderActiveTab();
  }

  function ensureEndgameEarnedArrayLength(gameId, taskId, minLen) {
    if (!state.endgameCurrencyEarned[gameId]) state.endgameCurrencyEarned[gameId] = {};
    let arr = state.endgameCurrencyEarned[gameId][taskId];
    if (!Array.isArray(arr)) arr = [];
    while (arr.length < minLen) arr.push(0);
    if (arr.length > minLen) arr = arr.slice(0, minLen);
    state.endgameCurrencyEarned[gameId][taskId] = arr;
  }

  function setEndgameEarned(gameId, taskId, value) {
    if (!state.endgameCurrencyEarned[gameId]) state.endgameCurrencyEarned[gameId] = {};
    const num = value === "" ? 0 : Math.max(0, Number(value) || 0);
    state.endgameCurrencyEarned[gameId][taskId] = [num];
    save();
    renderActiveTab();
  }

  function getEndgameEarned(gameId, taskId) {
    const arr = getEndgameEarnedPerCompletion(gameId, taskId);
    return arr.reduce((s, x) => s + (Number(x) || 0), 0);
  }

  function getEndgamePotential(task) {
    return Math.max(0, Number(task && task.currency) || 0);
  }

  function getEndgamePotentialPerCompletion(gameId, taskId) {
    const arr = state.endgameCurrencyPotential[gameId] && state.endgameCurrencyPotential[gameId][taskId];
    return Array.isArray(arr) ? arr.slice() : [];
  }

  function setEndgamePotentialAt(gameId, taskId, index, value, opts) {
    if (!state.endgameCurrencyPotential[gameId]) state.endgameCurrencyPotential[gameId] = {};
    let arr = state.endgameCurrencyPotential[gameId][taskId];
    if (!Array.isArray(arr)) arr = [];
    while (arr.length <= index) arr.push(null);
    arr[index] = Math.max(0, Number(value) || 0);
    state.endgameCurrencyPotential[gameId][taskId] = arr;
    if (!opts || !opts.skipSave) save();
    if (!opts || !opts.skipRender) renderActiveTab();
  }

  function ensureEndgamePotentialArrayLength(gameId, taskId, minLen) {
    if (!state.endgameCurrencyPotential[gameId]) state.endgameCurrencyPotential[gameId] = {};
    let arr = state.endgameCurrencyPotential[gameId][taskId];
    if (!Array.isArray(arr)) arr = [];
    while (arr.length < minLen) arr.push(null);
    if (arr.length > minLen) arr = arr.slice(0, minLen);
    state.endgameCurrencyPotential[gameId][taskId] = arr;
  }

  function snapshotEndgamePotentialAt(gameId, taskId, index, potential, opts) {
    setEndgamePotentialAt(gameId, taskId, index, potential, opts);
  }

  function freezeEndgameCurrencyPotentialForPastCycles(gameId, taskId, oldCurrency, throughAttempted) {
    const pot = Math.max(0, Number(oldCurrency) || 0);
    ensureEndgamePotentialArrayLength(gameId, taskId, throughAttempted);
    for (let i = 0; i < throughAttempted; i++) {
      snapshotEndgamePotentialAt(gameId, taskId, i, pot, { skipSave: true, skipRender: true });
    }
  }

  function getEndgamePotentialAtCycle(gameId, taskId, task, index) {
    const arr = getEndgamePotentialPerCompletion(gameId, taskId);
    if (index < arr.length && arr[index] != null && Number.isFinite(Number(arr[index]))) {
      return Math.max(0, Number(arr[index]) || 0);
    }
    return getEndgamePotential(task);
  }

  function getEndgamePotentialSum(gameId, taskId, task, cycleCount) {
    const n = Math.max(0, Number(cycleCount) || 0);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += getEndgamePotentialAtCycle(gameId, taskId, task, i);
    return sum;
  }

  /** Backfill missing per-cycle potential from the task's current currency (one-time for existing saves). */
  function migrateEndgameCurrencyPotential() {
    let changed = false;
    (state.games || []).forEach((game) => {
      (game.endgame || []).forEach((task) => {
        const taskId = task.id || task.label;
        const key = game.id + "." + taskId;
        const attempted = getAttemptedAmount(state.endgameAttempted, key);
        const completed = getCompletedAmount(state.endgameCompleted, key);
        const earnedLen = getEndgameEarnedPerCompletion(game.id, taskId).length;
        const maxLen = Math.max(attempted, completed, earnedLen);
        if (maxLen <= 0) return;
        const potArr = getEndgamePotentialPerCompletion(game.id, taskId);
        const livePot = getEndgamePotential(task);
        ensureEndgamePotentialArrayLength(game.id, taskId, maxLen);
        for (let i = 0; i < maxLen; i++) {
          if (i < potArr.length && potArr[i] != null && Number.isFinite(Number(potArr[i]))) continue;
          snapshotEndgamePotentialAt(game.id, taskId, i, livePot, { skipSave: true, skipRender: true });
          changed = true;
        }
      });
    });
    if (changed) save();
  }

  function getCurrencyLabel(game) {
    const name = game && game.currencyName && String(game.currencyName).trim();
    return name || "Currency";
  }

  /** Get completed and attempted counts for only cycles that have fully ended (periodEnd <= now). */
  function getCompletedAttemptedCompletedCyclesOnly(game, type, key) {
    const now = getSimulatedNow();
    const history = getTaskTallyHistory(game, type, key);
    const completed = history
      .filter((p) => p.periodEnd.getTime() <= now.getTime())
      .reduce((s, p) => s + p.completed, 0);
    return {
      attempted: getTaskAttemptedFromCalendar(game, type, key, false),
      completed,
    };
  }

  /** Get earned for endgame from only completed cycles (first N entries from endgameCurrencyEarned). */
  function getEndgameEarnedCompletedCyclesOnly(gameId, taskId, completedCount) {
    const arr = getEndgameEarnedPerCompletion(gameId, taskId);
    let sum = 0;
    for (let i = 0; i < completedCount && i < arr.length; i++) {
      sum += Number(arr[i]) || 0;
    }
    return sum;
  }

  function getGameEarnedAndPotential(game, excludeInProgress) {
    if (!game) return null;
    const excl = excludeInProgress !== false && (state.dataExcludeInProgress && state.dataExcludeInProgress[game.id] !== false);
    const dailyPot = getDailyPotential(game);

    let dEarned, dPotential;
    if (game.dailies) {
      if (excl) {
        const ca = getCompletedAttemptedCompletedCyclesOnly(game, "dailies", game.id);
        dEarned = ca.completed * dailyPot;
        dPotential = ca.attempted * dailyPot;
      } else {
        dEarned = getCompletedAmount(state.dailiesCompleted, game.id) * dailyPot;
        dPotential = getAttemptedAmount(state.dailiesAttempted, game.id) * dailyPot;
      }
    } else {
      dEarned = 0;
      dPotential = 0;
    }

    let wEarned = 0, wPotential = 0;
    (game.weeklies || []).forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      const pot = getWeeklyPotential(t);
      if (excl) {
        const ca = getCompletedAttemptedCompletedCyclesOnly(game, "weeklies", key);
        wEarned += ca.completed * pot;
        wPotential += ca.attempted * pot;
      } else {
        wEarned += getCompletedAmount(state.weekliesCompleted, key) * pot;
        wPotential += getAttemptedAmount(state.weekliesAttempted, key) * pot;
      }
    });

    let eEarned = 0, ePotential = 0;
    (game.endgame || []).forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      const taskId = t.id || t.label;
      if (excl) {
        const ca = getCompletedAttemptedCompletedCyclesOnly(game, "endgame", key);
        eEarned += getEndgameEarnedCompletedCyclesOnly(game.id, taskId, ca.completed);
        ePotential += getEndgamePotentialSum(game.id, taskId, t, ca.attempted);
      } else {
        eEarned += getEndgameEarned(game.id, taskId);
        ePotential += getEndgamePotentialSum(game.id, taskId, t, getAttemptedAmount(state.endgameAttempted, key));
      }
    });

    let xEarned = 0, xPotential = 0;
    (state.extracurricularTasks || []).forEach((t) => {
      if (t.gameId !== game.id) return;
      const cur = Math.max(0, Number(t.currency) || 0);
      if (cur > 0) xPotential += cur;
      if (!state.extracurricularCompleted[t.id]) return;
      const recorded = state.extracurricularCurrencyEarned && state.extracurricularCurrencyEarned[t.id];
      if (recorded !== undefined && recorded !== null) {
        xEarned += Math.max(0, Number(recorded) || 0);
      } else if (cur > 0) {
        xEarned += cur;
      }
    });

    return {
      dailies: { earned: dEarned, potential: dPotential },
      weeklies: { earned: wEarned, potential: wPotential },
      endgame: { earned: eEarned, potential: ePotential },
      extracurricular: { earned: xEarned, potential: xPotential },
      total: {
        earned: dEarned + wEarned + eEarned + xEarned,
        potential: dPotential + wPotential + ePotential + xPotential,
      },
    };
  }

