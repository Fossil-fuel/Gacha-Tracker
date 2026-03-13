  function getSidebarResetHour() {
    const server = state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
    return getEffectiveResetHour ? getEffectiveResetHour(server, new Date()) : getDefaultResetHour();
  }

  function getSidebarResetMinute() {
    return 0;
  }

  function getSidebarPrimaryServer() {
    return state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
  }

  function getNextResetDate(now) {
    const server = getSidebarPrimaryServer();
    const baseTz = getServerTimezone ? getServerTimezone(server) : getRecordingTimezone();
    const hour = getSidebarResetHour();
    const minute = getSidebarResetMinute();
    const tz = getDstAwareTimezoneForDisplay(baseTz);
    const offsetRef = new Date();
    return getNextResetDateInTimezone(now, hour, minute, tz, offsetRef);
  }

  /** Next reset with DST (4am when active, 3am when inactive). */
  function getNextResetDateWithDST(now) {
    return getNextResetDate(now);
  }

  /** Next reset with no DST shift (3am for America/Europe, 4am for Asia). */
  function getNextResetDateStandard(now) {
    const server = getSidebarPrimaryServer();
    const baseTz = getServerTimezone ? getServerTimezone(server) : getRecordingTimezone();
    const hour = server === "asia" ? 4 : 3;
    const minute = 0;
    const tz = baseTz;
    const offsetRef = new Date();
    return getNextResetDateInTimezone(now, hour, minute, tz, offsetRef);
  }

  function updateSidebarTime() {
    const now = new Date();
    const tz = getAppTimezone();
    const recTz = getRecordingTimezone();
    const parts = getDatePartsInTimezone(now, tz);
    const dateEl = document.getElementById("currentDate");
    if (dateEl) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = monthNames[parts.month];
      dateEl.textContent = parts.weekday + ", " + month + " " + parts.day + ", " + parts.year;
    }
    const timeEl = document.getElementById("currentTime");
    if (timeEl) {
      timeEl.textContent = formatTime(now);
    }
    const tzEl = document.getElementById("sidebarTimezone");
    if (tzEl) {
      tzEl.textContent = getTimezoneDisplayLabel();
    }
    const countdownEl = document.getElementById("resetCountdown");
    if (countdownEl) {
      if (state.showResetCountdown === false) {
        countdownEl.style.display = "none";
      } else {
        countdownEl.style.display = "";
        const next = getNextResetDate(now);
        const ms = next.getTime() - now.getTime();
        countdownEl.textContent = "Next reset in " + formatRemainingMs(ms);
      }
    }
    const dstDatesEl = document.getElementById("sidebarDstDates");
    if (dstDatesEl) {
      const server = getSidebarPrimaryServer();
      const dstZoneMap = { america: "America/New_York", europe: "Europe/Paris", asia: null };
      const dstTz = (server === "asia" || !getDSTTransitionDates) ? null : (dstZoneMap[server] || "America/New_York");
      const dstInfo = dstTz ? getDSTTransitionDates(dstTz, now.getFullYear()) : null;
      if (dstInfo && (dstInfo.spring || dstInfo.fall)) {
        const lines = [];
        if (dstInfo.spring) lines.push("DST starts: " + formatDate(dstInfo.spring));
        if (dstInfo.fall) lines.push("DST ends: " + formatDate(dstInfo.fall));
        dstDatesEl.textContent = lines.join(" · ");
        dstDatesEl.style.display = "";
      } else {
        dstDatesEl.textContent = "";
        dstDatesEl.style.display = "none";
      }
    }
    const resetCompareEl = document.getElementById("sidebarResetCompare");
    if (resetCompareEl) {
      const nextWith = getNextResetDateWithDST(now);
      const nextWithout = getNextResetDateStandard(now);
      const partsWith = getDatePartsInTimezone(nextWith, tz);
      const partsWithout = getDatePartsInTimezone(nextWithout, tz);
      const msWith = nextWith.getTime() - now.getTime();
      const msWithout = nextWithout.getTime() - now.getTime();
      const withStr = formatTimeOnly(partsWith.hour, partsWith.minute) + " (" + formatRemainingMs(msWith) + ")";
      const withoutStr = formatTimeOnly(partsWithout.hour, partsWithout.minute) + " (" + formatRemainingMs(msWithout) + ")";
      resetCompareEl.innerHTML = "W/ DST: " + withStr + "<br>W/O DST: " + withoutStr;
      resetCompareEl.style.display = "";
    }
    const hintEl = document.getElementById("sidebarHint");
    if (hintEl) {
      const next = getNextResetDate(now);
      const displayParts = getDatePartsInTimezone(next, tz);
      const displayTzLabel = getTimezoneLabelForId(tz);
      const recTzLabel = getTimezoneLabelForId(recTz);
      hintEl.textContent = "Dailies reset at " + formatTimeOnly(displayParts.hour, displayParts.minute) + " (" + displayTzLabel + "). Dates/calendar use " + recTzLabel + ". Data saved in this browser.";
    }
  }

  function setDateLabels() {
    updateSidebarTime();
  }

  function renderTabs() {
    const current = document.getElementById("breadcrumbCurrent");
    const tabNames = { about: "About", home: "Home", dailies: "Dailies", weeklies: "Weeklies", endgame: "Endgame", attendance: "Attendance", extracurricular: "Extracurricular", data: "Data", games: "Games" };
    let label = tabNames[state.tab] || state.tab;
    if (state.tab === "attendance" && state.attendanceView === "timestamps") label = "Time Trends";
    else if (state.tab === "attendance" && state.attendanceView === "history") label = "History";
    if (current) current.textContent = label;

    document.querySelectorAll(".tab").forEach((btn) => {
      const t = btn.dataset.tab;
      const view = btn.dataset.attendanceView;
      const exViewMode = btn.dataset.extracurricularViewMode;
      let active = t === state.tab;
      if (active && view) {
        active = state.attendanceView === view;
      } else if (active && t === "attendance" && !view) {
        active = state.attendanceView === "weekly";
      }
      if (active && exViewMode) {
        active = state.extracurricularViewMode === exViewMode;
      } else if (active && t === "extracurricular" && !exViewMode) {
        active = state.extracurricularViewMode === "tasks";
      }
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    document.querySelectorAll(".panel").forEach((panel) => {
      const id = panel.id;
      const name = id.replace("panel-", "");
      panel.classList.toggle("active", name === state.tab);
      panel.hidden = name !== state.tab;
    });
    updateFormatButtons();
  }

  function updateFormatButtons() {
    ["dailies", "weeklies", "endgame", "extracurricular"].forEach((panel) => {
      const view = state[panel + "View"] || "list";
      const wrap = document.getElementById("format-toggle-" + panel);
      if (!wrap) return;
      wrap.querySelectorAll(".format-btn").forEach((btn) => {
        const isActive = btn.dataset.format === view;
        btn.classList.toggle("active", isActive);
      });
    });
  }

  function initFormatToggles() {
    document.querySelectorAll(".format-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const panel = btn.dataset.panel;
        const format = btn.dataset.format;
        if (!panel || !format) return;
        const key = panel + "View";
        if (state[key] !== format) {
          state[key] = format;
          save();
          renderAll();
        }
      });
    });
  }

