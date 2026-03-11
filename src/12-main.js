  function renderAll() {
    setDateLabels();
    renderTabs();
    renderHome();
    renderDailies();
    renderWeeklies();
    renderEndgame();
    renderSidebarDataList();
    renderSidebarGamesList();
    renderAttendance();
    renderExtracurricular();
    renderData();
    renderGames();
  }

  function initTabs() {
    document.querySelectorAll(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.dataset.tab;
        if (!t) return;
        state.tab = t;
        const view = btn.dataset.attendanceView;
        const exViewMode = btn.dataset.extracurricularViewMode;
        if (view === "history") {
          state.attendanceView = "history";
          const now = new Date();
          if (state.historyMonth == null) state.historyMonth = now.getMonth();
          if (state.historyYear == null) state.historyYear = now.getFullYear();
        } else if (t === "attendance") {
          state.attendanceView = "weekly";
        }
        if (exViewMode === "history") {
          state.extracurricularViewMode = "history";
        } else if (t === "extracurricular" && !exViewMode) {
          state.extracurricularViewMode = "tasks";
        }
        save();
        renderAll();
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
  initSettingsModal();
  initExtracurricularTaskModal();
  setInterval(() => {
    const changed = processResets();
    updateTaskRemainingTexts();
    if (changed) renderAll();
  }, 60000);
  setInterval(updateSidebarTime, 1000);
  renderAll();
})();
