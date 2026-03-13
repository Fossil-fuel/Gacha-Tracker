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
    if (freqDay) freqDay.addEventListener("click", () => updateUnitToggles("frequency", "day"));
    if (freqWeek) freqWeek.addEventListener("click", () => updateUnitToggles("frequency", "week"));
    if (limDay) limDay.addEventListener("click", () => updateUnitToggles("timeLimit", "day"));
    if (limWeek) limWeek.addEventListener("click", () => updateUnitToggles("timeLimit", "week"));

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
        };
        if (existingIdx >= 0) game.weeklies[existingIdx] = { ...game.weeklies[existingIdx], ...next };
        else game.weeklies.push(next);
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
        };
        if (existingIdx >= 0) game.endgame[existingIdx] = { ...game.endgame[existingIdx], ...next };
        else game.endgame.push(next);
      } else {
        return;
      }

      save();
      closeTaskModal();
      renderAll();
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
    if (game && o.presetId && (weeklies.length || endgame.length)) {
      const now = getSimulatedNow();
      const todayStr = getDateStr();
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
    renderAll();
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
    Object.keys(state.endgameCompletionDates || {}).forEach((k) => {
      if (k.startsWith(gameId + ".")) delete state.endgameCompletionDates[k];
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
    });
    state.extracurricularTasks = (state.extracurricularTasks || []).filter((t) => t.gameId !== gameId);

    if (state.dataSelectedGameId === gameId || state.gamesSelectedId === gameId) {
      const remaining = getAllGames();
      const nextId = remaining.length ? remaining[0].id : null;
      state.dataSelectedGameId = nextId;
      state.gamesSelectedId = nextId;
    }

    save();
    renderAll();
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
    renderAll();
  }

  function setWeekliesAttempted(gameId, taskId, value) {
    const key = gameId + "." + taskId;
    state.weekliesAttempted[key] = Math.max(0, Number(value) || 0);
    save();
    renderAll();
  }

  function setEndgameAttempted(gameId, taskId, value) {
    const key = gameId + "." + taskId;
    state.endgameAttempted[key] = Math.max(0, Number(value) || 0);
    save();
    renderAll();
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
    renderAll();
  }

  function toggleWeekly(gameId, taskId) {
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
    renderAll();
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
      const attempted = getAttemptedAmount(state.endgameAttempted, key);
      if (attempted < state.endgameCompleted[key]) state.endgameAttempted[key] = state.endgameCompleted[key];
    } else {
      const completedDateStr = getEndgameCompletionDateInCurrentCycle(key, dateStr);
      if (completedDateStr) unrecordCompletion(completedDateStr, "endgame", key);
      state.endgameCompleted[key] = Math.max(0, amt - 1);
      ensureEndgameEarnedArrayLength(gameId, taskId, Math.max(0, amt - 1));
    }
    processResets();
    save();
    renderAll();
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

  function setEndgameEarnedAt(gameId, taskId, index, value) {
    if (!state.endgameCurrencyEarned[gameId]) state.endgameCurrencyEarned[gameId] = {};
    let arr = state.endgameCurrencyEarned[gameId][taskId];
    if (!Array.isArray(arr)) arr = [];
    while (arr.length <= index) arr.push(0);
    arr[index] = Math.max(0, Number(value) || 0);
    state.endgameCurrencyEarned[gameId][taskId] = arr;
    save();
    renderAll();
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
    renderAll();
  }

  function getEndgameEarned(gameId, taskId) {
    const arr = getEndgameEarnedPerCompletion(gameId, taskId);
    return arr.reduce((s, x) => s + (Number(x) || 0), 0);
  }

  function getEndgamePotential(task) {
    return Math.max(0, Number(task && task.currency) || 0);
  }

  function getCurrencyLabel(game) {
    const name = game && game.currencyName && String(game.currencyName).trim();
    return name || "Currency";
  }

  function getGameEarnedAndPotential(game) {
    if (!game) return null;
    const dEarned = game.dailies ? getCompletedAmount(state.dailiesCompleted, game.id) * getDailyPotential(game) : 0;
    const dPotential = game.dailies ? getAttemptedAmount(state.dailiesAttempted, game.id) * getDailyPotential(game) : 0;
    let wEarned = 0, wPotential = 0;
    (game.weeklies || []).forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      const pot = getWeeklyPotential(t);
      wEarned += getCompletedAmount(state.weekliesCompleted, key) * pot;
      wPotential += getAttemptedAmount(state.weekliesAttempted, key) * pot;
    });
    let eEarned = 0, ePotential = 0;
    (game.endgame || []).forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      const pot = getEndgamePotential(t);
      eEarned += getEndgameEarned(game.id, t.id || t.label);
      ePotential += getAttemptedAmount(state.endgameAttempted, key) * pot;
    });
    let xEarned = 0, xPotential = 0;
    (state.extracurricularTasks || []).forEach((t) => {
      if (t.gameId !== game.id) return;
      const cur = Math.max(0, Number(t.currency) || 0);
      if (cur <= 0) return;
      xPotential += cur;
      if (state.extracurricularCompleted[t.id]) xEarned += cur;
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

