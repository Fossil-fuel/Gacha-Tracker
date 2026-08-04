  function renderSharedChrome() {
    setDateLabels();
    renderTabs();
    renderSidebarDataList();
    renderSidebarGamesList();
  }

  function renderActiveTabPanel() {
    switch (state.tab) {
      case "home":
        renderHome();
        break;
      case "dailies":
        renderDailies();
        break;
      case "weeklies":
        renderWeeklies();
        break;
      case "endgame":
        renderEndgame();
        break;
      case "attendance":
        renderAttendance();
        break;
      case "extracurricular":
        renderExtracurricular();
        break;
      case "data":
        renderData();
        break;
      case "games":
        renderGames();
        break;
      case "about":
      default:
        break;
    }
  }

  function renderActiveTab() {
    const run = () => {
      beginTallyCacheFrame();
      try {
        renderSharedChrome();
        renderActiveTabPanel();
      } finally {
        endTallyCacheFrame();
      }
    };
    if (typeof isPerfDebugEnabled === "function" && isPerfDebugEnabled()) {
      perfMeasure("renderActiveTab:" + state.tab, run);
    } else {
      run();
    }
  }

  function renderAll() {
    const run = () => {
      beginTallyCacheFrame();
      try {
        renderSharedChrome();
        renderHome();
        renderDailies();
        renderWeeklies();
        renderEndgame();
        renderAttendance();
        renderExtracurricular();
        renderData();
        renderGames();
      } finally {
        endTallyCacheFrame();
      }
    };
    if (typeof isPerfDebugEnabled === "function" && isPerfDebugEnabled()) {
      perfMeasure("renderAll", run);
    } else {
      run();
    }
  }

  function initTabs() {
    const titleEl = document.getElementById("aboutNavTitle");
    if (titleEl) {
      titleEl.style.cursor = "pointer";
      titleEl.setAttribute("role", "button");
      titleEl.setAttribute("tabindex", "0");
      titleEl.setAttribute("aria-label", "Go to About page");
      titleEl.addEventListener("click", () => {
        state.tab = "about";
        renderActiveTab();
      });
      titleEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          state.tab = "about";
          renderActiveTab();
        }
      });
    }
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.dataset.tab;
        if (!t) return;
        state.tab = t;
        const view = btn.dataset.attendanceView;
        const exViewMode = btn.dataset.extracurricularViewMode;
        if (view === "history") {
          state.attendanceView = "history";
          const now = getSimulatedNow();
          if (state.historyMonth == null) state.historyMonth = now.getMonth();
          if (state.historyYear == null) state.historyYear = now.getFullYear();
        } else if (view === "timestamps") {
          state.attendanceView = "timestamps";
        } else if (t === "attendance") {
          state.attendanceView = "weekly";
        }
        if (exViewMode === "history") {
          state.extracurricularViewMode = "history";
        } else if (t === "extracurricular" && !exViewMode) {
          state.extracurricularViewMode = "tasks";
        }
        const runSwitch = () => renderActiveTab();
        if (typeof isPerfDebugEnabled === "function" && isPerfDebugEnabled()) {
          perfMeasure("tabSwitch:" + t, runSwitch);
        } else {
          runSwitch();
        }
      });
    });
  }

  function startApp() {
    if (typeof window.initFirebaseAuth === "function") window.initFirebaseAuth();
    processResets();
    if (state.defaultTab && state.defaultTab !== state.tab) {
      state.tab = state.defaultTab;
    }
    setDateLabels();
    initTabs();
    initTaskModal();
    initManualResetModal();
    initGameModal();
    initGameIdentityModal();
    initDeleteGameModal();
    initDeleteTaskModal();
    initClearGameDataModal();
    initCalendarDayModal();
    initEarningsModal();
    initEndgameCompleteModal();
    initExtracurricularCompleteModal();
    initTimeTrendsDetailModal();
    initAttendanceSkippedModal();
    initClearTimeTrendsModal();
    initSettingsModal();
    initExtracurricularTaskModal();
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== "z") return;
      if (e.altKey || e.shiftKey) return;
      const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable)) return;
      if (typeof canUndoCompletion !== "function" || !canUndoCompletion()) return;
      e.preventDefault();
      const result = undoLastCompletion();
      if (result && result.ok && typeof updateCompletionUndoUI === "function") updateCompletionUndoUI();
    });
    window.addEventListener("beforeunload", () => {
      if (typeof window.flushPendingSave === "function") window.flushPendingSave();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && typeof window.flushPendingSave === "function") {
        window.flushPendingSave();
      }
      // Phase 5: catch up sidebar clock as soon as the tab is focused again.
      if (document.visibilityState === "visible") {
        if (typeof updateSidebarTime === "function") updateSidebarTime();
        if (typeof checkManualResetExpiries === "function") checkManualResetExpiries();
      }
    });
    window.addEventListener("focus", () => {
      if (typeof checkManualResetExpiries === "function") checkManualResetExpiries();
    });
    setInterval(() => {
      const changed = processResets();
      updateTaskRemainingTexts();
      if (changed) renderActiveTab();
      if (typeof checkManualResetExpiries === "function") checkManualResetExpiries();
    }, 60000);
    // Pause sidebar clock while the page is in a background tab (saves work; resets timer unchanged).
    setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      updateSidebarTime();
    }, 1000);

    // Games banners switch home↔games crop at the hamburger breakpoint.
    try {
      const gamesBannerMq = window.matchMedia("(max-width: 768px)");
      const onGamesBannerModeChange = () => {
        if (state.tab === "games") renderActiveTab();
      };
      if (gamesBannerMq.addEventListener) gamesBannerMq.addEventListener("change", onGamesBannerModeChange);
      else if (gamesBannerMq.addListener) gamesBannerMq.addListener(onGamesBannerModeChange);
    } catch (_) {}

    // Cold start: active tab + chrome only. Full renderAll stays for import/repair/cloud/dev skips.
    renderActiveTab();
    if (typeof checkManualResetExpiries === "function") checkManualResetExpiries();

    // Opt-in live probe surface for localhost regression (URL: ?liveProbe=1).
    if (typeof location !== "undefined" && /(?:\?|&)liveProbe=1(?:&|$)/.test(String(location.search || ""))) {
      window.__gachaLiveProbe = {
        ready: true,
        getStateSnapshot() {
          return JSON.parse(
            JSON.stringify({
              games: state.games,
              completionByDate: state.completionByDate,
              completionTimestamps: state.completionTimestamps,
              dailiesCompleted: state.dailiesCompleted,
              weekliesCompleted: state.weekliesCompleted,
              endgameCompleted: state.endgameCompleted,
              dailiesAttempted: state.dailiesAttempted,
              weekliesAttempted: state.weekliesAttempted,
              endgameAttempted: state.endgameAttempted,
              lastProcessedResets: state.lastProcessedResets,
              endgameCurrencyEarned: state.endgameCurrencyEarned,
              endgameCurrencyPotential: state.endgameCurrencyPotential,
              endgameCompletionDates: state.endgameCompletionDates,
              simulatedDateOffset: state.simulatedDateOffset || 0,
              simulatedHourOffset: state.simulatedHourOffset || 0,
              tab: state.tab,
            })
          );
        },
        loadStateSnapshot(snap) {
          if (!snap || typeof snap !== "object") return false;
          [
            "games",
            "completionByDate",
            "completionTimestamps",
            "dailiesCompleted",
            "weekliesCompleted",
            "endgameCompleted",
            "dailiesAttempted",
            "weekliesAttempted",
            "endgameAttempted",
            "lastProcessedResets",
            "endgameCurrencyEarned",
            "endgameCurrencyPotential",
            "endgameCompletionDates",
          ].forEach((k) => {
            if (snap[k] !== undefined) state[k] = snap[k];
          });
          state.simulatedDateOffset = snap.simulatedDateOffset || 0;
          state.simulatedHourOffset = snap.simulatedHourOffset || 0;
          if (!state.lastProcessedResets || typeof state.lastProcessedResets !== "object") {
            state.lastProcessedResets = { dailies: {}, weeklies: {}, endgame: {} };
          } else {
            if (!state.lastProcessedResets.dailies) state.lastProcessedResets.dailies = {};
            if (!state.lastProcessedResets.weeklies) state.lastProcessedResets.weeklies = {};
            if (!state.lastProcessedResets.endgame) state.lastProcessedResets.endgame = {};
          }
          if (!state.completionByDate) state.completionByDate = {};
          if (!Array.isArray(state.completionTimestamps)) state.completionTimestamps = [];
          if (snap.tab) state.tab = snap.tab;
          if (typeof save === "function") save({ immediate: true });
          if (typeof renderAll === "function") renderAll();
          return true;
        },
        applyTaskCompletion,
        removeTaskCompletion,
        getRemainingDatesInCycleFrom,
        getCalendarDatesInCycleRange,
        getWeeklyCycleBoundsForMoment,
        getEndgameCycleBoundsForMoment,
        getTaskPeriodDateStr,
        getTasksAvailableOnDate,
        isWeeklyAvailableOnDate,
        isWeeklyAvailableOnCalendarDate,
        isEndgameAvailableOnCalendarDate,
        isCompletedInCycleForDate,
        isWeeklyCompletedInCurrentCycle,
        isEndgameCompletedInCurrentCycle,
        getGame,
        getAllGames,
        cleanupCycleBoundaryBleedMarks,
        processResets,
        scanDataConflicts,
        listBeforeUnlockConflicts,
        applyDebugBeforeUnlockEdits,
        listTimeDateFixQueue,
        applyDebugTimeDateFixes,
        getDateStr,
        getSimulatedNow,
        getPeriodDateStrForReset,
        getCycleMembershipMoment,
        toggleWeekly,
        toggleEndgame,
        completeEndgameWithCurrency,
        recordCompletion,
        unrecordCompletion,
      };
    }
  }

  function bootApp() {
    const finish = () => {
      try {
        startApp();
      } catch (err) {
        console.error(err);
      }
    };
    if (typeof initPersistentStorage === "function") {
      initPersistentStorage().then(finish).catch(() => {
        try { load(); } catch (_) {}
        finish();
      });
    } else {
      load();
      finish();
    }
  }

  bootApp();
})();
