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

  load();
  if (typeof window.initFirebaseAuth === "function") window.initFirebaseAuth();
  processResets();
  if (state.defaultTab && state.defaultTab !== state.tab) {
    state.tab = state.defaultTab;
  }
  setDateLabels();
  initTabs();
  initFormatToggles();
  initTaskModal();
  initGameModal();
  initDeleteGameModal();
  initClearGameDataModal();
  initCalendarDayModal();
  initEarningsModal();
  initEndgameCompleteModal();
  initExtracurricularCompleteModal();
  initTimeTrendsDetailModal();
  initClearTimeTrendsModal();
  initSettingsModal();
  initExtracurricularTaskModal();
  window.addEventListener("beforeunload", () => {
    if (typeof window.flushPendingSave === "function") window.flushPendingSave();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && typeof window.flushPendingSave === "function") {
      window.flushPendingSave();
    }
  });
  setInterval(() => {
    const changed = processResets();
    updateTaskRemainingTexts();
    if (changed) renderActiveTab();
  }, 60000);
  setInterval(updateSidebarTime, 1000);
  renderAll();
})();
