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
    if (freqDay) freqDay.addEventListener("click", () => { updateUnitToggles("frequency", "day"); updateTaskTimeRemainingDisplay(); });
    if (freqWeek) freqWeek.addEventListener("click", () => { updateUnitToggles("frequency", "week"); updateTaskTimeRemainingDisplay(); });
    if (limDay) limDay.addEventListener("click", () => { updateUnitToggles("timeLimit", "day"); updateTaskTimeRemainingDisplay(); });
    if (limWeek) limWeek.addEventListener("click", () => { updateUnitToggles("timeLimit", "week"); updateTaskTimeRemainingDisplay(); });

    const manualResetToggle = qs("taskManualReset");
    if (manualResetToggle) {
      manualResetToggle.addEventListener("change", syncTaskModalManualResetUI);
    }
    const bannerSectionToggle = qs("taskBannerSectionToggle");
    if (bannerSectionToggle) {
      bannerSectionToggle.addEventListener("click", () => {
        const body = qs("taskBannerSectionBody");
        const open = bannerSectionToggle.getAttribute("aria-expanded") !== "true";
        setTaskMenuSectionExpanded(bannerSectionToggle, body, open);
        setTaskBannerSectionPreferExpanded(open);
        if (open) {
          requestAnimationFrame(() => {
            if (typeof resizeTaskBannerCropStage === "function") resizeTaskBannerCropStage();
            if (typeof drawTaskBannerCrop === "function") drawTaskBannerCrop();
          });
        }
      });
    }

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
      const sameEndToggle = qs("taskCycleEndTimeSameAsBegin");
      const cycleEndTimeInput = qs("taskCycleEndTime");
      const cycleEndTimeSameAsBegin = !sameEndToggle || sameEndToggle.checked;
      let cycleEndHour;
      let cycleEndMinute;
      if (!cycleEndTimeSameAsBegin) {
        const endParts = parseTimeStr(
          cycleEndTimeInput && cycleEndTimeInput.value ? cycleEndTimeInput.value : timeToStr(hour, minute)
        );
        cycleEndHour = endParts.hour;
        cycleEndMinute = endParts.minute;
      }
      const frequencyEvery = Math.max(1, Number(freqEvery && freqEvery.value) || 1);
      const timeLimitEvery = Math.max(1, Number(limEvery && limEvery.value) || 1);
      const currency = Math.max(0, Number(currencyInput && currencyInput.value) || 0);
      const dateStarted = isValidDateStr(dateStartedInput && dateStartedInput.value) ? dateStartedInput.value : getDateStr();
      const countFromToggle = qs("taskCountFromDateStarted");
      const countFromDateStarted = !!(countFromToggle && countFromToggle.checked);
      const unlockDaysInput = qs("taskEarliestCompleteDays");
      const unlockTimeInput = qs("taskEarliestCompleteTime");
      const earliestCompleteDays = Math.max(0, Number(unlockDaysInput && unlockDaysInput.value) || 0);
      let earliestCompleteHour;
      let earliestCompleteMinute;
      let hasUnlockTime = false;
      if (unlockTimeInput && unlockTimeInput.value) {
        const parts = parseTimeStr(unlockTimeInput.value);
        earliestCompleteHour = parts.hour;
        earliestCompleteMinute = parts.minute;
        hasUnlockTime = true;
      }

      if (taskModal.taskType === "weeklies") {
        game.weeklies = game.weeklies || [];
        const existingIdx = taskModal.taskId ? game.weeklies.findIndex((t) => t.id === taskModal.taskId) : -1;
        const dstToggle = qs("taskAdjustForDST");
        const adjustForDST = dstToggle ? dstToggle.checked : true;
        const manualResetToggle = qs("taskManualReset");
        const manualReset = !!(manualResetToggle && manualResetToggle.checked);
        const prevTask = existingIdx >= 0 ? game.weeklies[existingIdx] : null;
        const wasManual = !!(prevTask && prevTask.manualReset);
        const next = {
          id: taskModal.taskId || ("w_" + Date.now()),
          label,
          weekStartDay: taskModal.selectedDay,
          weekStartHour: hour,
          weekStartMinute: minute,
          cycleEndTimeSameAsBegin: cycleEndTimeSameAsBegin ? undefined : false,
          cycleEndHour: cycleEndTimeSameAsBegin ? undefined : cycleEndHour,
          cycleEndMinute: cycleEndTimeSameAsBegin ? undefined : cycleEndMinute,
          currency,
          dateStarted,
          frequencyEvery,
          frequencyUnit: taskModal.frequencyUnit,
          timeLimitEvery,
          timeLimitUnit: taskModal.timeLimitUnit,
          adjustForDST,
          countFromDateStarted: countFromDateStarted || undefined,
          earliestCompleteDays: earliestCompleteDays || undefined,
          earliestCompleteHour: hasUnlockTime ? earliestCompleteHour : undefined,
          earliestCompleteMinute: hasUnlockTime ? earliestCompleteMinute : undefined,
          manualReset: manualReset || undefined,
          manualDueDateStr: manualReset
            ? (prevTask && isValidDateStr(prevTask.manualDueDateStr) ? prevTask.manualDueDateStr : null)
            : null,
          manualDueTbd: manualReset ? !!(prevTask && prevTask.manualDueTbd) || !(prevTask && isValidDateStr(prevTask.manualDueDateStr)) : undefined,
          manualDueHour: manualReset && prevTask && Number.isFinite(prevTask.manualDueHour) ? prevTask.manualDueHour : undefined,
          manualDueMinute: manualReset && prevTask && Number.isFinite(prevTask.manualDueMinute) ? prevTask.manualDueMinute : undefined,
          manualAwaitingRestart: manualReset ? !!(prevTask && prevTask.manualAwaitingRestart) : undefined,
        };
        if (taskBannerCrop.sourceImg && !taskBannerCrop.clear) commitTaskBannerCrop();
        applyTaskBannersToSavePayload(next);
        if (taskModal.bannerSource) setTaskBannerSectionPreferExpanded(false);
        if (existingIdx >= 0) {
          const merged = { ...game.weeklies[existingIdx], ...next };
          if (!countFromDateStarted) delete merged.countFromDateStarted;
          if (!earliestCompleteDays) delete merged.earliestCompleteDays;
          if (!hasUnlockTime) {
            delete merged.earliestCompleteHour;
            delete merged.earliestCompleteMinute;
          }
          if (cycleEndTimeSameAsBegin) {
            delete merged.cycleEndTimeSameAsBegin;
            delete merged.cycleEndHour;
            delete merged.cycleEndMinute;
          }
          if (!manualReset) {
            delete merged.manualReset;
            delete merged.manualDueDateStr;
            delete merged.manualDueTbd;
            delete merged.manualDueHour;
            delete merged.manualDueMinute;
            delete merged.manualAwaitingRestart;
            delete merged.manualClosedCycles;
          }
          clearTaskBannerFieldsFromMerged(merged);
          game.weeklies[existingIdx] = merged;
        } else game.weeklies.push(next);

        save();
        if (typeof bumpDataVersion === "function") bumpDataVersion();
        const savedId = next.id;
        const openManual = manualReset && (!wasManual || existingIdx < 0);
        closeTaskModal();
        renderActiveTab();
        if (openManual && typeof openManualResetModal === "function") {
          openManualResetModal({
            gameId: game.id,
            taskType: "weeklies",
            taskId: savedId,
            reason: "create",
          });
        }
        return;
      } else if (taskModal.taskType === "endgame") {
        game.endgame = game.endgame || [];
        const existingIdx = taskModal.taskId ? game.endgame.findIndex((t) => t.id === taskModal.taskId) : -1;
        const dstToggle = qs("taskAdjustForDST");
        const adjustForDST = dstToggle ? dstToggle.checked : true;
        const manualResetToggle = qs("taskManualReset");
        const manualReset = !!(manualResetToggle && manualResetToggle.checked);
        const prevTask = existingIdx >= 0 ? game.endgame[existingIdx] : null;
        const wasManual = !!(prevTask && prevTask.manualReset);
        const next = {
          id: taskModal.taskId || ("e_" + Date.now()),
          label,
          currency,
          weekStartDay: taskModal.selectedDay,
          weekStartHour: hour,
          weekStartMinute: minute,
          cycleEndTimeSameAsBegin: cycleEndTimeSameAsBegin ? undefined : false,
          cycleEndHour: cycleEndTimeSameAsBegin ? undefined : cycleEndHour,
          cycleEndMinute: cycleEndTimeSameAsBegin ? undefined : cycleEndMinute,
          dateStarted,
          frequencyEvery,
          frequencyUnit: taskModal.frequencyUnit,
          timeLimitEvery,
          timeLimitUnit: taskModal.timeLimitUnit,
          adjustForDST,
          countFromDateStarted: countFromDateStarted || undefined,
          earliestCompleteDays: earliestCompleteDays || undefined,
          earliestCompleteHour: hasUnlockTime ? earliestCompleteHour : undefined,
          earliestCompleteMinute: hasUnlockTime ? earliestCompleteMinute : undefined,
          manualReset: manualReset || undefined,
          manualDueDateStr: manualReset
            ? (prevTask && isValidDateStr(prevTask.manualDueDateStr) ? prevTask.manualDueDateStr : null)
            : null,
          manualDueTbd: manualReset ? !!(prevTask && prevTask.manualDueTbd) || !(prevTask && isValidDateStr(prevTask.manualDueDateStr)) : undefined,
          manualDueHour: manualReset && prevTask && Number.isFinite(prevTask.manualDueHour) ? prevTask.manualDueHour : undefined,
          manualDueMinute: manualReset && prevTask && Number.isFinite(prevTask.manualDueMinute) ? prevTask.manualDueMinute : undefined,
          manualAwaitingRestart: manualReset ? !!(prevTask && prevTask.manualAwaitingRestart) : undefined,
        };
        if (taskBannerCrop.sourceImg && !taskBannerCrop.clear) commitTaskBannerCrop();
        applyTaskBannersToSavePayload(next);
        if (taskModal.bannerSource) setTaskBannerSectionPreferExpanded(false);
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
          if (!countFromDateStarted) delete merged.countFromDateStarted;
          if (!earliestCompleteDays) delete merged.earliestCompleteDays;
          if (!hasUnlockTime) {
            delete merged.earliestCompleteHour;
            delete merged.earliestCompleteMinute;
          }
          if (cycleEndTimeSameAsBegin) {
            delete merged.cycleEndTimeSameAsBegin;
            delete merged.cycleEndHour;
            delete merged.cycleEndMinute;
          }
          if (!manualReset) {
            delete merged.manualReset;
            delete merged.manualDueDateStr;
            delete merged.manualDueTbd;
            delete merged.manualDueHour;
            delete merged.manualDueMinute;
            delete merged.manualAwaitingRestart;
            delete merged.manualClosedCycles;
          }
          clearTaskBannerFieldsFromMerged(merged);
          game.endgame[existingIdx] = merged;
        } else {
          game.endgame.push(next);
        }

        save();
        if (typeof bumpDataVersion === "function") bumpDataVersion();
        const savedId = next.id;
        const openManual = manualReset && (!wasManual || existingIdx < 0);
        closeTaskModal();
        renderActiveTab();
        if (openManual && typeof openManualResetModal === "function") {
          openManualResetModal({
            gameId: game.id,
            taskType: "endgame",
            taskId: savedId,
            reason: "create",
          });
        }
        return;
      } else {
        return;
      }
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
    if (game) {
      const iconPath =
        (typeof resolvePresetIconPath === "function"
          ? resolvePresetIconPath({ id: o.presetId, presetId: o.presetId, iconStockId: o.iconStockId })
          : null) ||
        (o.iconImage && String(o.iconImage).trim()) ||
        null;
      if (iconPath) {
        game.iconImage = iconPath;
        game.iconShape = (o.iconShape === "circle" || o.iconShape === "square" || o.iconShape === "rounded")
          ? o.iconShape
          : "rounded";
      }
    }
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
    const isMarkingComplete = !(state.completionByDate[dateStr] && (state.completionByDate[dateStr].dailies || []).includes(gameId));
    if (isMarkingComplete) {
      applyTaskCompletion("dailies", gameId, { dateStr });
    } else {
      removeTaskCompletion("dailies", gameId, { dateStr });
    }
  }

  function toggleWeekly(gameId, taskId) {
    const game = getGame(gameId);
    const task = (game && game.weeklies || []).find((t) => (t.id || t.label) === taskId);
    if (task && isTaskCycleEnded(task, getSimulatedNow(), game)) return;
    const key = gameId + "." + taskId;
    const dateStr = getTaskPeriodDateStr("weeklies", task, game, getSimulatedNow());
    const isMarkingComplete = !isWeeklyCompletedInCurrentCycle(key, dateStr);
    if (isMarkingComplete) {
      const result = applyTaskCompletion("weeklies", key, { dateStr });
      if (result && !result.ok && result.reason) alert(result.reason);
    } else {
      removeTaskCompletion("weeklies", key, { dateStr });
    }
  }

  function requestToggleEndgame(gameId, taskId) {
    const game = getGame(gameId);
    const task = (game && game.endgame || []).find((t) => (t.id || t.label) === taskId);
    if (task && isTaskCycleEnded(task, getSimulatedNow(), game)) return;
    const key = gameId + "." + taskId;
    const dateStr = getTaskPeriodDateStr("endgame", task, game, getSimulatedNow());
    if (isEndgameCompletedInCurrentCycle(key, dateStr)) {
      toggleEndgame(gameId, taskId);
      return;
    }
    if (task && !isTaskCompletionUnlocked("endgame", task, game)) {
      alert(getTaskUnlockHint("endgame", task, game));
      return;
    }
    openEndgameCompleteModal(gameId, taskId, null);
  }

  function completeEndgameWithCurrency(gameId, taskId, currencyValue) {
    const game = getGame(gameId);
    const task = (game && game.endgame || []).find((t) => (t.id || t.label) === taskId);
    const key = gameId + "." + taskId;
    const dateStr = getTaskPeriodDateStr("endgame", task, game, getSimulatedNow());
    const result = applyTaskCompletion("endgame", key, {
      dateStr,
      currencyValue,
    });
    if (result && !result.ok && result.reason) alert(result.reason);
  }

  function toggleEndgame(gameId, taskId) {
    const game = getGame(gameId);
    const task = (game && game.endgame || []).find((t) => (t.id || t.label) === taskId);
    const key = gameId + "." + taskId;
    const dateStr = getTaskPeriodDateStr("endgame", task, game, getSimulatedNow());
    const isMarkingComplete = !isEndgameCompletedInCurrentCycle(key, dateStr);
    if (isMarkingComplete) {
      const result = applyTaskCompletion("endgame", key, { dateStr });
      if (result && !result.ok && result.reason) alert(result.reason);
    } else {
      removeTaskCompletion("endgame", key, { dateStr });
    }
  }

  function completeExtracurricularWithCurrency(taskId, currencyValue) {
    const task = (state.extracurricularTasks || []).find((t) => t.id === taskId);
    if (!task) return;
    if (!state.extracurricularCurrencyEarned) state.extracurricularCurrencyEarned = {};
    state.extracurricularCurrencyEarned[taskId] = Math.max(0, Number(currencyValue) || 0);
    state.extracurricularCompleted[taskId] = true;
    if (!state.extracurricularCompletedAt) state.extracurricularCompletedAt = {};
    const completedAt = getSimulatedNow().toISOString();
    state.extracurricularCompletedAt[taskId] = completedAt;
    if (typeof recordCompletionTimestamp === "function") {
      const tz = typeof getAppTimezone === "function" ? getAppTimezone() : Intl.DateTimeFormat().resolvedOptions().timeZone;
      const d = new Date(completedAt);
      const parts = typeof getDatePartsInTimezone === "function"
        ? getDatePartsInTimezone(d, tz)
        : { year: d.getFullYear(), month: d.getMonth(), day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
      const dateStr =
        String(parts.year) +
        "-" +
        String(parts.month + 1).padStart(2, "0") +
        "-" +
        String(parts.day).padStart(2, "0");
      const key = (task.gameId || "") + "." + taskId;
      recordCompletionTimestamp("extracurricular", key, {
        dateStr,
        hour: parts.hour,
        minute: parts.minute,
      });
    }
    save();
    renderActiveTab();
  }

  function clearExtracurricularCompletion(taskId) {
    delete state.extracurricularCompleted[taskId];
    if (state.extracurricularCompletedAt) delete state.extracurricularCompletedAt[taskId];
    if (state.extracurricularCurrencyEarned) delete state.extracurricularCurrencyEarned[taskId];
    if (Array.isArray(state.completionTimestamps)) {
      state.completionTimestamps = state.completionTimestamps.filter(
        (t) => !(t && t.taskType === "extracurricular" && String(t.taskId || "") === String(taskId))
      );
    }
    save();
    renderActiveTab();
  }

  /**
   * Confirm before deleting a task (honors Settings → Confirm before delete).
   * Uses the shared delete-task modal; onConfirm runs only if the user confirms.
   */
  function confirmTaskDelete(taskLabel, onConfirm) {
    if (typeof onConfirm !== "function") return;
    if (state.confirmBeforeDelete === false) {
      onConfirm();
      return;
    }
    openDeleteTaskModal(taskLabel, onConfirm);
  }

  /** Remove a weekly/endgame task from its game and related completion state (same persist/render pattern as extracurricular). */
  function deleteGameBoardTask(gameId, taskType, taskId) {
    if (!gameId || !taskId || (taskType !== "weeklies" && taskType !== "endgame")) return;
    const game = getGame(gameId);
    if (!game) return;
    const listKey = taskType === "weeklies" ? "weeklies" : "endgame";
    const list = game[listKey] || [];
    const task = list.find((t) => (t.id || t.label) === taskId);
    if (!task) return;
    confirmTaskDelete(task.label || taskId, () => reallyDeleteGameBoardTask(gameId, taskType, taskId));
  }

  function reallyDeleteGameBoardTask(gameId, taskType, taskId) {
    if (!gameId || !taskId || (taskType !== "weeklies" && taskType !== "endgame")) return;
    const game = getGame(gameId);
    if (!game) return;
    const listKey = taskType === "weeklies" ? "weeklies" : "endgame";
    const list = game[listKey] || [];
    const next = list.filter((t) => (t.id || t.label) !== taskId);
    if (next.length === list.length) return;
    game[listKey] = next;

    const key = gameId + "." + taskId;
    if (taskType === "weeklies") {
      delete state.weekliesCompleted[key];
      delete state.weekliesAttempted[key];
      if (state.lastProcessedResets && state.lastProcessedResets.weeklies) {
        delete state.lastProcessedResets.weeklies[key];
      }
    } else {
      delete state.endgameCompleted[key];
      delete state.endgameAttempted[key];
      if (state.endgameCompletionDates) delete state.endgameCompletionDates[key];
      if (state.endgamePendingCurrency) delete state.endgamePendingCurrency[key];
      if (state.endgamePendingCycleStartMs) delete state.endgamePendingCycleStartMs[key];
      if (state.lastProcessedResets && state.lastProcessedResets.endgame) {
        delete state.lastProcessedResets.endgame[key];
      }
      if (state.endgameCurrencyEarned && state.endgameCurrencyEarned[gameId]) {
        delete state.endgameCurrencyEarned[gameId][taskId];
      }
      if (state.endgameCurrencyPotential && state.endgameCurrencyPotential[gameId]) {
        delete state.endgameCurrencyPotential[gameId][taskId];
      }
      if (state.timestampsSelectedEndgameTasks) {
        delete state.timestampsSelectedEndgameTasks[key];
      }
    }

    Object.keys(state.completionByDate || {}).forEach((dateStr) => {
      const day = state.completionByDate[dateStr];
      if (!day || !Array.isArray(day[taskType])) return;
      day[taskType] = day[taskType].filter((k) => k !== key);
      if (
        !(day.dailies && day.dailies.length) &&
        !(day.weeklies && day.weeklies.length) &&
        !(day.endgame && day.endgame.length)
      ) {
        delete state.completionByDate[dateStr];
      }
    });

    if (Array.isArray(state.completionTimestamps)) {
      state.completionTimestamps = state.completionTimestamps.filter((t) => {
        if (!t || t.taskType !== taskType || t.gameId !== gameId) return true;
        return String(t.taskId || "") !== String(taskId);
      });
    }

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

  function isTaskHiddenInData(task) {
    return !!(task && (task.hideInData || task.excludeFromData));
  }

  function setTaskHideInData(gameId, taskType, taskId, hidden) {
    const game = getGame(gameId);
    if (!game) return false;
    const list = taskType === "endgame" ? (game.endgame || []) : (game.weeklies || []);
    const task = list.find((t) => (t.id || t.label) === taskId);
    if (!task) return false;
    if (hidden) task.hideInData = true;
    else delete task.hideInData;
    bumpDataVersion();
    save();
    renderActiveTab();
    return true;
  }

  function appendTaskCycleEndFooter(parent, game, task, taskType) {
    if (!parent || !game || !task) return;
    const taskId = task.id || task.label;
    const footer = document.createElement("div");
    footer.className = "task-panel-cycle-end-footer";

    const left = document.createElement("div");
    left.className = "task-panel-cycle-end-left";

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
    left.appendChild(toggleLabel);
    left.appendChild(dateInput);
    footer.appendChild(left);

    const hideLabel = document.createElement("label");
    hideLabel.className = "task-panel-cycle-end-toggle task-panel-hide-in-data-toggle";
    hideLabel.title = "Hide this task from the Data tab";
    const hideToggle = document.createElement("input");
    hideToggle.type = "checkbox";
    hideToggle.className = "fill-toggle";
    hideToggle.checked = !!task.hideInData;
    hideToggle.setAttribute("aria-label", "Hide in Data");
    const hideText = document.createElement("span");
    hideText.textContent = "Hide in Data";
    hideLabel.appendChild(hideToggle);
    hideLabel.appendChild(hideText);
    hideToggle.addEventListener("change", () => {
      setTaskHideInData(game.id, taskType, taskId, hideToggle.checked);
    });
    footer.appendChild(hideLabel);

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

  /**
   * Calendar-based completed/attempted for Data tab.
   * Completed always includes finished-early current cycles.
   * includeInProgress=false excludes only unfinished current cycles from attempted/potential.
   */
  function getCalendarCompletedAttempted(game, type, key, includeInProgress) {
    const history = getTaskTallyHistory(game, type, key);
    let completed;
    if (type === "endgame") {
      const task = (game.endgame || []).find((t) => (game.id + "." + (t.id || t.label)) === key);
      completed = task ? getEndgameCompletedPeriodsFromCalendar(game, task, key).length : 0;
    } else {
      completed = history.reduce((s, p) => s + p.completed, 0);
    }
    return {
      completed,
      attempted: getTaskAttemptedFromCalendar(game, type, key, includeInProgress),
    };
  }

  /** @deprecated Use getCalendarCompletedAttempted(game, type, key, false). */
  function getCompletedAttemptedCompletedCyclesOnly(game, type, key) {
    return getCalendarCompletedAttempted(game, type, key, false);
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
    const includeInProgress = !excl;
    const dailyPot = getDailyPotential(game);

    let dEarned, dPotential;
    if (game.dailies) {
      const ca = getCalendarCompletedAttempted(game, "dailies", game.id, includeInProgress);
      dEarned = ca.completed * dailyPot;
      dPotential = ca.attempted * dailyPot;
    } else {
      dEarned = 0;
      dPotential = 0;
    }

    let wEarned = 0, wPotential = 0;
    (game.weeklies || []).forEach((t) => {
      if (isTaskHiddenInData(t)) return;
      const key = game.id + "." + (t.id || t.label);
      const pot = getWeeklyPotential(t);
      const ca = getCalendarCompletedAttempted(game, "weeklies", key, includeInProgress);
      wEarned += ca.completed * pot;
      wPotential += ca.attempted * pot;
    });

    let eEarned = 0, ePotential = 0;
    (game.endgame || []).forEach((t) => {
      if (isTaskHiddenInData(t)) return;
      const key = game.id + "." + (t.id || t.label);
      const taskId = t.id || t.label;
      const ca = getCalendarCompletedAttempted(game, "endgame", key, includeInProgress);
      eEarned += getEndgameEarnedCompletedCyclesOnly(game.id, taskId, ca.completed);
      ePotential += getEndgamePotentialSum(game.id, taskId, t, ca.attempted);
    });

    let xEarned = 0, xPotential = 0;
    (state.extracurricularTasks || []).forEach((t) => {
      if (t.gameId !== game.id) return;
      if (isTaskHiddenInData(t)) return;
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

