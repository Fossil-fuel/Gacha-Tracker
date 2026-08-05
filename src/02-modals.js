  function setModalOpen(open) {
    const el = qs("taskModal");
    if (!el) return;
    taskModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) activateModalFocus(el);
    else deactivateModalFocus();
  }

  function setGameModalOpen(open) {
    const el = qs("gameModal");
    if (!el) return;
    gameModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) activateModalFocus(el);
    else deactivateModalFocus();
  }

  function setDeleteGameModalOpen(open) {
    const el = qs("deleteGameModal");
    if (!el) return;
    deleteGameModalState.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) activateModalFocus(el);
    else deactivateModalFocus();
  }

  function setDeleteTaskModalOpen(open) {
    const el = qs("deleteTaskModal");
    if (!el) return;
    deleteTaskModalState.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) activateModalFocus(el);
    else deactivateModalFocus();
  }

  function openDeleteTaskModal(taskLabel, onConfirm) {
    if (typeof onConfirm !== "function") return;
    deleteTaskModalState.onConfirm = onConfirm;
    const msg = qs("deleteTaskMessage");
    if (msg) {
      const name = String(taskLabel || "").trim() || "this task";
      msg.textContent = 'Are you sure you want to delete "' + name + '"? This cannot be undone.';
    }
    setDeleteTaskModalOpen(true);
  }

  function closeDeleteTaskModal() {
    setDeleteTaskModalOpen(false);
    deleteTaskModalState.onConfirm = null;
  }

  function initDeleteTaskModal() {
    const modalEl = qs("deleteTaskModal");
    const closeBtn = qs("deleteTaskModalClose");
    const cancelBtn = qs("deleteTaskCancel");
    const confirmBtn = qs("deleteTaskConfirm");
    if (!modalEl || !confirmBtn) return;

    modalEl.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("modal-backdrop") ||
        (e.target.getAttribute && e.target.getAttribute("data-close") === "deleteTaskModal")
      ) {
        closeDeleteTaskModal();
      }
    });
    if (closeBtn) closeBtn.addEventListener("click", closeDeleteTaskModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeDeleteTaskModal);

    confirmBtn.addEventListener("click", () => {
      const fn = deleteTaskModalState.onConfirm;
      closeDeleteTaskModal();
      if (typeof fn === "function") fn();
    });

    document.addEventListener("keydown", (e) => {
      if (!deleteTaskModalState.open) return;
      if (e.key === "Escape") closeDeleteTaskModal();
    });
  }

  const MODAL_FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let modalFocusReturnEl = null;
  let modalFocusTrapBound = false;

  function listModalFocusable(modalRoot) {
    if (!modalRoot) return [];
    const dialog = modalRoot.querySelector(".modal-dialog") || modalRoot;
    return Array.from(dialog.querySelectorAll(MODAL_FOCUSABLE)).filter((el) => {
      if (el.hasAttribute("disabled")) return false;
      if (el.getAttribute("aria-hidden") === "true") return false;
      if (el.closest("[hidden]")) return false;
      return true;
    });
  }

  function getTopOpenModal() {
    const open = Array.from(document.querySelectorAll(".modal")).filter((el) => !el.hidden);
    if (!open.length) return null;
    let best = null;
    let bestZ = -Infinity;
    let bestIdx = -1;
    open.forEach((el, i) => {
      let z = parseFloat(window.getComputedStyle(el).zIndex);
      if (!Number.isFinite(z)) z = 0;
      if (z > bestZ || (z === bestZ && i > bestIdx)) {
        best = el;
        bestZ = z;
        bestIdx = i;
      }
    });
    return best;
  }

  function onModalFocusTrapKeydown(e) {
    if (e.key !== "Tab") return;
    const modal = getTopOpenModal();
    if (!modal) return;
    const focusables = listModalFocusable(modal);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function activateModalFocus(modalRoot) {
    if (!modalRoot) return;
    if (!modalFocusReturnEl || !modalFocusReturnEl.closest || !modalFocusReturnEl.closest(".modal")) {
      modalFocusReturnEl = document.activeElement;
    }
    const focusables = listModalFocusable(modalRoot);
    const preferred =
      focusables.find((el) => el.matches("input, select, textarea") && el.type !== "hidden") ||
      focusables.find((el) => !el.classList.contains("modal-close")) ||
      focusables[0];
    if (preferred) setTimeout(() => preferred.focus(), 0);
    if (!modalFocusTrapBound) {
      modalFocusTrapBound = true;
      document.addEventListener("keydown", onModalFocusTrapKeydown, true);
    }
  }

  function deactivateModalFocus() {
    const stillOpen = getTopOpenModal();
    if (stillOpen) {
      activateModalFocus(stillOpen);
      return;
    }
    if (modalFocusTrapBound) {
      document.removeEventListener("keydown", onModalFocusTrapKeydown, true);
      modalFocusTrapBound = false;
    }
    const ret = modalFocusReturnEl;
    modalFocusReturnEl = null;
    if (ret && typeof ret.focus === "function") {
      setTimeout(() => {
        try {
          ret.focus();
        } catch (_) {}
      }, 0);
    }
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
    activateModalFocus(modal);
  }
  function closeClearGameDataModal() {
    const modal = qs("clearGameDataModal");
    if (modal) {
      clearGameDataModalGameId = null;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      deactivateModalFocus();
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
    activateModalFocus(modal);
  }
  function closeClearDataModal() {
    const modal = qs("clearDataModal");
    if (modal) {
      clearDataModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen) document.body.style.overflow = "";
      deactivateModalFocus();
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
    state.endgameCurrencyPotential = {};
    state.endgamePendingCurrency = {};
    state.endgamePendingCycleStartMs = {};
    state.endgameCompletionDates = {};
    state.completionByDate = {};
    state.completionTimestamps = [];
    state.historyCompact = null;
    state.lastProcessedResets = { dailies: {}, weeklies: {}, endgame: {} };
    state.lastSimulationSnapshot = null;
    state.lastSkipDaySnapshot = null;
    state.simulatedDateOffset = 0;
    state.attendancePieInclude = {};
    state.dataPieInclude = {};
    state.extracurricularTasks = [];
    state.extracurricularCompleted = {};
    state.extracurricularCompletedAt = {};
    state.extracurricularCurrencyEarned = {};
    state.tab = state.defaultTab || "about";
    save();
    // bulk state change: full refresh
    renderAll();
    closeClearDataModal();
    closeSettingsModal();
  }

  let calendarDayModal = { open: false, dateStr: null };
  /** @type {null|{ mode: 'calendar'|'debug', dateStr?: string, checkboxes?: any, currencyMap?: object|null, rows: Array<{type,key,label,dateStr}> }} */
  let completionTimeModalCtx = null;

  function setCalendarDayModalOpen(open) {
    const el = qs("calendarDayModal");
    if (!el) return;
    calendarDayModal.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.style.overflow = open ? "hidden" : "";
    if (open) activateModalFocus(el);
    else deactivateModalFocus();
  }

  function setCompletionTimeModalOpen(open) {
    const el = qs("completionTimeModal");
    if (!el) return;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      document.body.style.overflow = "hidden";
      activateModalFocus(el);
    } else {
      deactivateModalFocus();
      // Keep scroll lock if Settings (or another modal) is still open underneath.
      const still = typeof getTopOpenModal === "function" ? getTopOpenModal() : null;
      if (still) {
        document.body.style.overflow = "hidden";
        return;
      }
      document.body.style.overflow = "";
    }
  }

  function defaultCompletionTimeValue() {
    const now = typeof getSimulatedNow === "function" ? getSimulatedNow() : new Date();
    const tz = typeof getAppTimezone === "function" ? getAppTimezone() : null;
    if (tz && typeof getDatePartsInTimezone === "function") {
      const p = getDatePartsInTimezone(now, tz);
      return String(p.hour).padStart(2, "0") + ":" + String(p.minute || 0).padStart(2, "0");
    }
    return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  function parseTimeInputValue(value) {
    const m = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!m) return { hour: 12, minute: 0 };
    return {
      hour: Math.max(0, Math.min(23, parseInt(m[1], 10) || 0)),
      minute: Math.max(0, Math.min(59, parseInt(m[2], 10) || 0)),
    };
  }

  function taskLabelForCompletionRow(type, key) {
    if (type === "dailies") {
      const game = getGame(key);
      return (game && game.name) || key;
    }
    const dot = key.indexOf(".");
    const gameId = dot >= 0 ? key.slice(0, dot) : key;
    const taskId = dot >= 0 ? key.slice(dot + 1) : "";
    const game = getGame(gameId);
    const list = type === "weeklies" ? (game && game.weeklies) : (game && game.endgame);
    const task = (list || []).find((t) => (t.id || t.label) === taskId);
    const gName = (game && game.name) || gameId;
    return gName + " — " + ((task && task.label) || taskId);
  }

  function isMarkedOnCalendarDay(dateStr, type, key) {
    const dayData = state.completionByDate[dateStr] || {};
    if (type === "dailies") return (dayData.dailies || []).includes(key);
    if (type === "weeklies") return (dayData.weeklies || []).includes(key);
    if (type === "endgame") return (dayData.endgame || []).includes(key);
    return false;
  }

  function collectNewlyCompletedFromCalendar(dateStr, checkboxes) {
    const rows = [];
    (checkboxes || []).forEach(({ check, type, key }) => {
      if (!check || !check.checked) return;
      // Only brand-new marks on this day (not already filled / carried).
      if (isMarkedOnCalendarDay(dateStr, type, key)) return;
      rows.push({
        type,
        key,
        label: taskLabelForCompletionRow(type, key),
        dateStr,
      });
    });
    return rows;
  }

  function syncCompletionTimeBatchSelectAll() {
    const selectAll = qs("completionTimeSelectAll");
    const ctx = completionTimeModalCtx;
    if (!selectAll || !ctx || !ctx.rows || !ctx.rows.length) return;
    const checks = ctx.rows.map((r) => r._check).filter(Boolean);
    const n = checks.filter((c) => c.checked).length;
    selectAll.checked = n > 0 && n === checks.length;
    selectAll.indeterminate = n > 0 && n < checks.length;
  }

  function applyBatchCompletionTimeToSelected() {
    const ctx = completionTimeModalCtx;
    if (!ctx || !ctx.rows) return;
    const batchInput = qs("completionTimeBatchInput");
    const value = batchInput ? batchInput.value : defaultCompletionTimeValue();
    let applied = 0;
    ctx.rows.forEach((row) => {
      if (!row._check || !row._check.checked) return;
      if (row._input) row._input.value = value;
      applied++;
    });
    if (!applied) {
      alert("Select one or more tasks first, then Apply to selected.");
    }
  }

  function openCompletionTimeModal(ctx) {
    completionTimeModalCtx = ctx;
    const list = qs("completionTimeModalList");
    const title = qs("completionTimeModalTitle");
    const desc = qs("completionTimeModalDesc");
    const batchBar = qs("completionTimeBatchBar");
    const selectAll = qs("completionTimeSelectAll");
    const batchInput = qs("completionTimeBatchInput");
    const confirmBtn = qs("completionTimeModalConfirm");
    if (!list) return;
    list.innerHTML = "";
    const def = defaultCompletionTimeValue();
    const isDupes = ctx.mode === "debug-dupes";
    const isUnlockEdit = ctx.mode === "debug-before-unlock";
    const isTimeDateFix = ctx.mode === "debug-time-date-fix";
    if (title) {
      title.textContent = isDupes
        ? "Resolve duplicate times"
        : isTimeDateFix
          ? "Fix times & dates"
          : isUnlockEdit
            ? "Edit unlock-error dates"
            : ctx.mode === "debug"
              ? "Fill missing times"
              : "Completion time";
    }
    if (desc) {
      desc.textContent = isDupes
        ? "These tasks have more than one finish timestamp in the same cycle. Pick which one to keep; the others are removed. Calendar marks and tallies stay unchanged."
        : isTimeDateFix
          ? "Update finish date/time, pick which duplicate to keep, or Drop a cycle so it counts as skipped. Tallies rebuild after Save."
          : isUnlockEdit
            ? "These finishes are before the task unlock window. Date/time default to unlock. Tallies stay unchanged. If unlock days were set by mistake, clear them on the task in Games instead."
            : ctx.mode === "debug"
              ? "These calendar marks have no finish time. Enter times individually, or select several and use Batch → Apply to selected."
              : "When did you finish each newly completed task on " +
                (typeof formatDate === "function" ? formatDate(ctx.dateStr) : ctx.dateStr) +
                "? Select several to set the same time in one step.";
    }
    if (confirmBtn) {
      confirmBtn.textContent = isDupes
        ? "Keep selected"
        : isTimeDateFix
          ? "Apply fixes"
          : isUnlockEdit
            ? "Save dates"
            : "Save times";
    }
    if (batchBar) {
      batchBar.hidden = !!(isDupes || isUnlockEdit || isTimeDateFix || !(ctx.rows && ctx.rows.length));
      if (isTimeDateFix || isDupes || isUnlockEdit) batchBar.setAttribute("hidden", "");
    }
    if (batchInput) batchInput.value = def;
    if (selectAll) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    }

    if (isDupes) {
      (ctx.groups || []).forEach((group, gIdx) => {
        const block = document.createElement("div");
        block.className = "completion-time-dupe-group";
        const head = document.createElement("div");
        head.className = "completion-time-dupe-head";
        head.textContent = group.label;
        const meta = document.createElement("div");
        meta.className = "completion-time-dupe-meta";
        meta.textContent =
          (group.type === "dailies" ? "Day " : "Cycle ") +
          group.cycleStart +
          (group.type ? " · " + group.type : "");
        block.appendChild(head);
        block.appendChild(meta);
        const radios = [];
        const stamps = group.stamps || [];
        const defaultIdx = Math.max(0, stamps.length - 1);
        stamps.forEach((stamp, sIdx) => {
          const opt = document.createElement("label");
          opt.className = "completion-time-dupe-option";
          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = "completionTimeDupe_" + gIdx;
          radio.value = String(sIdx);
          radio.checked = sIdx === defaultIdx;
          radio.dataset.dateStr = stamp.dateStr;
          radio.dataset.hour = String(Number(stamp.hour) || 0);
          radio.dataset.minute = String(Number(stamp.minute) || 0);
          const text = document.createElement("span");
          const timeLabel =
            typeof formatTimeOnly === "function"
              ? formatTimeOnly(Number(stamp.hour) || 0, Number(stamp.minute) || 0)
              : String(stamp.hour) + ":" + String(stamp.minute || 0).padStart(2, "0");
          const dateLabel =
            typeof formatDate === "function" ? formatDate(stamp.dateStr) : stamp.dateStr;
          text.textContent = dateLabel + " · " + timeLabel;
          opt.appendChild(radio);
          opt.appendChild(text);
          block.appendChild(opt);
          radios.push(radio);
        });
        list.appendChild(block);
        group._radios = radios;
      });
      setCompletionTimeModalOpen(true);
      return;
    }

    if (isUnlockEdit) {
      (ctx.rows || []).forEach((row, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "completion-time-row completion-time-row-unlock-edit";
        const lab = document.createElement("div");
        lab.className = "completion-time-row-label";
        lab.textContent = row.label;
        const meta = document.createElement("div");
        meta.className = "completion-time-row-meta";
        meta.textContent =
          "Cycle " +
          row.cycleStart +
          " · unlock " +
          (row.unlockDate || row.suggestedDateStr || "—") +
          (row.unlockHour != null
            ? " " +
              (typeof timeToStr === "function"
                ? timeToStr(row.unlockHour, row.unlockMinute || 0)
                : String(row.unlockHour).padStart(2, "0") +
                  ":" +
                  String(row.unlockMinute || 0).padStart(2, "0"))
            : "") +
          (row.type ? " · " + row.type : "") +
          (row.dateStr
            ? " · was " +
              row.dateStr +
              (row.hour != null
                ? " " +
                  (typeof timeToStr === "function"
                    ? timeToStr(row.hour, row.minute || 0)
                    : String(row.hour).padStart(2, "0") + ":" + String(row.minute || 0).padStart(2, "0"))
                : "")
            : "");
        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.id = "completionUnlockDate_" + idx;
        dateInput.className = "settings-input";
        dateInput.value = row.suggestedDateStr || row.unlockDate || row.dateStr || "";
        dateInput.min = row.cycleStart || "";
        const timeInput = document.createElement("input");
        timeInput.type = "time";
        timeInput.id = "completionUnlockTime_" + idx;
        timeInput.className = "settings-input";
        const h = Number.isFinite(Number(row.suggestedHour))
          ? Number(row.suggestedHour)
          : Number.isFinite(Number(row.unlockHour))
            ? Number(row.unlockHour)
            : Number.isFinite(Number(row.hour))
              ? Number(row.hour)
              : Number(def.slice(0, 2)) || 12;
        const m = Number.isFinite(Number(row.suggestedMinute))
          ? Number(row.suggestedMinute)
          : Number.isFinite(Number(row.unlockMinute))
            ? Number(row.unlockMinute)
            : Number.isFinite(Number(row.minute))
              ? Number(row.minute)
              : Number(def.slice(3, 5)) || 0;
        timeInput.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
        wrap.appendChild(lab);
        wrap.appendChild(dateInput);
        wrap.appendChild(timeInput);
        wrap.appendChild(meta);
        list.appendChild(wrap);
        row._dateInput = dateInput;
        row._input = timeInput;
      });
      setCompletionTimeModalOpen(true);
      return;
    }

    if (isTimeDateFix) {
      (ctx.rows || []).forEach((row, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "completion-time-row completion-time-row-unlock-edit";
        const lab = document.createElement("div");
        lab.className = "completion-time-row-label";
        lab.textContent = (row.label || "") + " · " + (row.kind || "");
        const meta = document.createElement("div");
        meta.className = "completion-time-row-meta";
        meta.textContent =
          (row.message || "") +
          (row.cycleStart ? " · cycle " + row.cycleStart : "") +
          (row.type ? " · " + row.type : "");

        const action = document.createElement("select");
        action.className = "settings-select";
        action.setAttribute("aria-label", "Action for " + (row.label || "item"));
        [
          ["set", "Update finish"],
          ["drop", "Drop (count as skip)"],
        ].forEach(([val, text]) => {
          const opt = document.createElement("option");
          opt.value = val;
          opt.textContent = text;
          action.appendChild(opt);
        });

        const dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.className = "settings-input";
        dateInput.value = row.suggestedDateStr || row.dateStr || row.cycleStart || "";

        const timeInput = document.createElement("input");
        timeInput.type = "time";
        timeInput.className = "settings-input";
        const h = Number.isFinite(Number(row.suggestedHour))
          ? Number(row.suggestedHour)
          : Number.isFinite(Number(row.hour))
            ? Number(row.hour)
            : Number(def.slice(0, 2)) || 12;
        const m = Number.isFinite(Number(row.suggestedMinute))
          ? Number(row.suggestedMinute)
          : Number.isFinite(Number(row.minute))
            ? Number(row.minute)
            : Number(def.slice(3, 5)) || 0;
        timeInput.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");

        const syncActionUi = () => {
          const dropping = action.value === "drop";
          dateInput.disabled = dropping;
          timeInput.disabled = dropping;
          if (row._dupeRadios) row._dupeRadios.forEach((r) => { r.disabled = dropping; });
        };
        action.addEventListener("change", syncActionUi);

        wrap.appendChild(lab);
        wrap.appendChild(action);
        wrap.appendChild(dateInput);
        wrap.appendChild(timeInput);
        wrap.appendChild(meta);

        if (row.kind === "duplicate-timestamps" && Array.isArray(row.stamps) && row.stamps.length) {
          const dupeWrap = document.createElement("div");
          dupeWrap.className = "completion-time-dupe-group";
          const hint = document.createElement("div");
          hint.className = "completion-time-dupe-meta";
          hint.textContent =
            "Pick one finish to keep. All other timestamps in this cycle are deleted (no new stamp is added).";
          dupeWrap.appendChild(hint);
          const radios = [];
          row.stamps.forEach((stamp, sIdx) => {
            const opt = document.createElement("label");
            opt.className = "completion-time-dupe-option";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "fixTimeDupe_" + idx;
            radio.checked = sIdx === row.stamps.length - 1;
            radio.dataset.dateStr = stamp.dateStr;
            radio.dataset.hour = String(Number(stamp.hour) || 0);
            radio.dataset.minute = String(Number(stamp.minute) || 0);
            radio.addEventListener("change", () => {
              if (!radio.checked) return;
              dateInput.value = stamp.dateStr || dateInput.value;
              timeInput.value =
                String(Number(stamp.hour) || 0).padStart(2, "0") +
                ":" +
                String(Number(stamp.minute) || 0).padStart(2, "0");
            });
            const text = document.createElement("span");
            const timeLabel =
              typeof formatTimeOnly === "function"
                ? formatTimeOnly(Number(stamp.hour) || 0, Number(stamp.minute) || 0)
                : String(stamp.hour) + ":" + String(stamp.minute || 0).padStart(2, "0");
            const dateLabel =
              typeof formatDate === "function" ? formatDate(stamp.dateStr) : stamp.dateStr;
            text.textContent = "Keep " + dateLabel + " · " + timeLabel;
            opt.appendChild(radio);
            opt.appendChild(text);
            dupeWrap.appendChild(opt);
            radios.push(radio);
          });
          wrap.appendChild(dupeWrap);
          row._dupeRadios = radios;
          const last = row.stamps[row.stamps.length - 1];
          if (last) {
            dateInput.value = last.dateStr || dateInput.value;
            timeInput.value =
              String(Number(last.hour) || 0).padStart(2, "0") +
              ":" +
              String(Number(last.minute) || 0).padStart(2, "0");
          }
        }

        list.appendChild(wrap);
        row._actionSelect = action;
        row._dateInput = dateInput;
        row._input = timeInput;
        syncActionUi();
      });
      setCompletionTimeModalOpen(true);
      return;
    }

    (ctx.rows || []).forEach((row, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "completion-time-row";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "completion-time-row-check";
      check.id = "completionTimeSelect_" + idx;
      check.setAttribute("aria-label", "Select " + (row.label || "task") + " for batch time");
      check.addEventListener("change", () => {
        wrap.classList.toggle("is-batch-selected", check.checked);
        syncCompletionTimeBatchSelectAll();
      });
      const lab = document.createElement("label");
      lab.className = "completion-time-row-label";
      lab.htmlFor = "completionTimeInput_" + idx;
      lab.textContent = row.label;
      const meta = document.createElement("div");
      meta.className = "completion-time-row-meta";
      meta.textContent = row.dateStr + (row.type ? " · " + row.type : "");
      const input = document.createElement("input");
      input.type = "time";
      input.id = "completionTimeInput_" + idx;
      input.className = "settings-input";
      input.value = def;
      input.dataset.idx = String(idx);
      wrap.appendChild(check);
      wrap.appendChild(lab);
      wrap.appendChild(input);
      wrap.appendChild(meta);
      list.appendChild(wrap);
      row._input = input;
      row._check = check;
    });
    setCompletionTimeModalOpen(true);
  }

  function closeCompletionTimeModal() {
    completionTimeModalCtx = null;
    setCompletionTimeModalOpen(false);
  }

  function confirmCompletionTimeModal() {
    const ctx = completionTimeModalCtx;
    if (!ctx) return;
    if (ctx.mode === "debug-dupes") {
      const choices = (ctx.groups || []).map((group) => {
        const radios = group._radios || [];
        let picked = radios.find((r) => r.checked);
        if (!picked) picked = radios[radios.length - 1] || radios[0];
        const keep = picked
          ? {
              dateStr: picked.dataset.dateStr,
              hour: Number(picked.dataset.hour) || 0,
              minute: Number(picked.dataset.minute) || 0,
            }
          : null;
        return {
          type: group.type,
          gameId: group.gameId,
          taskId: group.taskId,
          cycleStart: group.cycleStart,
          keep,
        };
      });
      closeCompletionTimeModal();
      const result =
        typeof resolveDuplicateCompletionTimestamps === "function"
          ? resolveDuplicateCompletionTimestamps(choices)
          : { ok: false, removed: 0, resolved: 0 };
      const report = qs("settingsDebugReport");
      if (report) {
        const lines = [];
        lines.push("Resolve duplicate times");
        lines.push("Groups resolved: " + (result.resolved || 0));
        lines.push("Timestamps removed: " + (result.removed || 0));
        lines.push("");
        if (result.after && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(result.after));
        } else if (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(scanDataConflicts()));
        }
        report.textContent = lines.join("\n");
      }
      if (typeof syncSettingsUI === "function") syncSettingsUI();
      return;
    }
    if (ctx.mode === "debug-before-unlock") {
      const edits = (ctx.rows || []).map((row) => {
        const parsed = parseTimeInputValue(row._input && row._input.value);
        const newDateStr = (row._dateInput && row._dateInput.value) || row.suggestedDateStr || row.dateStr;
        return {
          type: row.type,
          gameId: row.gameId,
          taskId: row.taskId,
          cycleStart: row.cycleStart,
          newDateStr,
          hour: parsed.hour,
          minute: parsed.minute,
        };
      });
      closeCompletionTimeModal();
      const result =
        typeof applyDebugBeforeUnlockEdits === "function"
          ? applyDebugBeforeUnlockEdits(edits)
          : { ok: false, updated: 0 };
      const report = qs("settingsDebugReport");
      if (report) {
        const lines = [];
        lines.push("Edit unlock-error dates");
        lines.push("Cycles updated: " + (result.updated || 0));
        lines.push("");
        if (result.after && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(result.after));
        } else if (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(scanDataConflicts()));
        }
        report.textContent = lines.join("\n");
      }
      if (typeof syncSettingsUI === "function") syncSettingsUI();
      return;
    }
    if (ctx.mode === "debug-time-date-fix") {
      const edits = (ctx.rows || []).map((row) => {
        const action = (row._actionSelect && row._actionSelect.value) || "set";
        const parsed = parseTimeInputValue(row._input && row._input.value);
        const newDateStr = (row._dateInput && row._dateInput.value) || row.suggestedDateStr || row.dateStr;
        let keep = null;
        if (row.kind === "duplicate-timestamps" && row._dupeRadios) {
          const picked = row._dupeRadios.find((r) => r.checked) || row._dupeRadios[row._dupeRadios.length - 1];
          if (picked) {
            keep = {
              dateStr: picked.dataset.dateStr,
              hour: Number(picked.dataset.hour) || 0,
              minute: Number(picked.dataset.minute) || 0,
            };
          }
        }
        return {
          kind: row.kind,
          type: row.type,
          gameId: row.gameId,
          taskId: row.taskId,
          cycleStart: row.cycleStart,
          action,
          newDateStr: keep ? keep.dateStr : newDateStr,
          hour: keep ? keep.hour : parsed.hour,
          minute: keep ? keep.minute : parsed.minute,
          keep,
        };
      });
      closeCompletionTimeModal();
      const result =
        typeof applyDebugTimeDateFixes === "function"
          ? applyDebugTimeDateFixes(edits)
          : { ok: false, updated: 0, dropped: 0 };
      const report = qs("settingsDebugReport");
      if (report) {
        const lines = [];
        lines.push("Fix times & dates");
        lines.push("Updated: " + (result.updated || 0) + "  ·  Dropped: " + (result.dropped || 0));
        lines.push("");
        if (result.after && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(result.after));
        } else if (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(scanDataConflicts()));
        }
        report.textContent = lines.join("\n");
      }
      if (typeof syncSettingsUI === "function") syncSettingsUI();
      return;
    }
    const timesByKey = {};
    (ctx.rows || []).forEach((row) => {
      const parsed = parseTimeInputValue(row._input && row._input.value);
      timesByKey[row.type + "|" + row.key] = parsed;
      row.hour = parsed.hour;
      row.minute = parsed.minute;
    });
    if (ctx.mode === "debug") {
      const entries = (ctx.rows || []).map((row) => ({
        type: row.type,
        key: row.key,
        dateStr: row.dateStr,
        hour: row.hour,
        minute: row.minute,
      }));
      closeCompletionTimeModal();
      const result =
        typeof fillMissingCompletionTimes === "function"
          ? fillMissingCompletionTimes(entries)
          : { ok: false, added: 0 };
      const report = qs("settingsDebugReport");
      if (report) {
        const lines = [];
        lines.push("Fill missing times");
        lines.push("Added: " + (result.added || 0) + " timestamp(s)");
        lines.push("");
        if (result.after && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(result.after));
        } else if (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function") {
          lines.push(formatConflictScanReport(scanDataConflicts()));
        }
        report.textContent = lines.join("\n");
      }
      if (typeof syncSettingsUI === "function") syncSettingsUI();
      return;
    }

    // Calendar save path
    const dateStr = ctx.dateStr;
    const checkboxes = ctx.checkboxes;
    const currencyMap = ctx.currencyMap || null;
    closeCompletionTimeModal();
    applyCalendarDayModalSave(dateStr, checkboxes, currencyMap, timesByKey);
  }

  function openCalendarDayModal(dateStr) {
    calendarDayModal.dateStr = dateStr;
    const titleEl = qs("calendarDayModalTitle");
    if (titleEl) titleEl.textContent = "Edit " + (typeof formatDate === "function" ? formatDate(dateStr) : dateStr);
    const container = qs("calendarDayModalTasks");
    if (!container) return;
    container.innerHTML = "";
    const dayData = state.completionByDate[dateStr] || { dailies: [], weeklies: [], endgame: [] };
    const available = getTasksAvailableOnDate(dateStr);
    const checkboxes = [];
    let anyCarried = false;
    const addTask = (item, type) => {
      // Checkbox must match the calendar D/W/E bar: marked on THIS day only.
      // (Endgame used to use cycle-wide completion, so later finishes looked done on earlier days.)
      const onThisDay =
        type === "dailies"
          ? (dayData.dailies || []).includes(item.key)
          : type === "weeklies"
            ? (dayData.weeklies || []).includes(item.key)
            : (dayData.endgame || []).includes(item.key);
      const cycleFinish =
        (type === "weeklies" || type === "endgame") && typeof getCompletionDateInCycle === "function"
          ? getCompletionDateInCycle(item.key, type, dateStr)
          : null;
      const carried =
        !!onThisDay &&
        (type === "weeklies" || type === "endgame") &&
        typeof isCarriedCompletionMark === "function" &&
        isCarriedCompletionMark(type, item.key, dateStr);
      const finishedLater = !onThisDay && !!cycleFinish && cycleFinish > dateStr;
      const finishedEarlierUnmarked = !onThisDay && !!cycleFinish && cycleFinish < dateStr;
      if (carried) anyCarried = true;
      const label = document.createElement("label");
      label.className =
        "calendar-day-modal-task calendar-day-modal-task-" +
        type +
        (carried ? " calendar-day-modal-task-carried" : "") +
        (finishedLater || finishedEarlierUnmarked ? " calendar-day-modal-task-elsewhere" : "");
      if (carried) {
        label.title = "Carried: finished earlier in this cycle (fill-remaining). Uncheck to clear the cycle.";
      } else if (finishedLater) {
        label.title = "Finished later in this cycle (" + cycleFinish + "). Not marked on this day.";
      } else if (finishedEarlierUnmarked) {
        label.title = "Finished earlier in this cycle (" + cycleFinish + "), but this day has no fill mark.";
      }
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = onThisDay;
      check.dataset.type = type;
      check.dataset.key = item.key;
      label.appendChild(check);
      const span = document.createElement("span");
      span.appendChild(document.createTextNode(labelAfterDash(item.label)));
      if (carried) {
        const tag = document.createElement("span");
        tag.className = "calendar-day-modal-carried-tag";
        tag.textContent = " (carried)";
        span.appendChild(tag);
      } else if (finishedLater) {
        const tag = document.createElement("span");
        tag.className = "calendar-day-modal-elsewhere-tag";
        tag.textContent = " (finished later)";
        span.appendChild(tag);
      } else if (finishedEarlierUnmarked) {
        const tag = document.createElement("span");
        tag.className = "calendar-day-modal-elsewhere-tag";
        tag.textContent = " (finished earlier)";
        span.appendChild(tag);
      }
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
    } else if (anyCarried) {
      const hint = document.createElement("p");
      hint.className = "calendar-day-modal-carried-hint";
      hint.textContent =
        "Carried = finished earlier in this cycle; later days stay marked (fill-remaining). The E/W bars count marks on this day only — tasks finished later stay unchecked here.";
      container.insertBefore(hint, container.firstChild);
    }
    calendarDayModal.checkboxes = checkboxes;
    setCalendarDayModalOpen(true);
  }

  let earningsModal = { gameId: null, task: null, taskType: null };

  function formatHistoryCycleDateRange(periodStart, periodEnd) {
    return getDateStr(periodStart) + " — " + getDateStr(periodEnd);
  }

  function appendEarningsMaxLabel(parent, maxValue) {
    const maxSpan = document.createElement("span");
    maxSpan.className = "earnings-modal-max";
    maxSpan.textContent = "Max: " + maxValue;
    parent.appendChild(maxSpan);
  }

  function createTaskOptionInfoIcon(title) {
    const infoIcon = document.createElement("span");
    infoIcon.className = "currency-info-icon";
    infoIcon.setAttribute("aria-label", "More information");
    infoIcon.textContent = "ⓘ";
    if (title) infoIcon.title = title;
    return infoIcon;
  }

  function createTaskCurrencyInfoIcon(taskType) {
    if (taskType === "endgame") {
      return createTaskOptionInfoIcon(
        "Maximum currency earnable per cycle. Changing this only affects new cycles—the max for past cycles is saved when each cycle is attempted or completed, so your Data page history stays accurate."
      );
    }
    return createTaskOptionInfoIcon(
      "Maximum currency earnable when this weekly is completed. Changing this updates the potential cap shown on the Data page for all cycles."
    );
  }

  function setEarningsModalSkippedLayout(hasSkipped) {
    const columns = qs("earningsModalColumns");
    if (columns) columns.classList.toggle("has-skipped", !!hasSkipped);
    const skippedSection = qs("earningsModalSkippedSection");
    if (skippedSection) skippedSection.hidden = !hasSkipped;
  }

  function populateWeeklyEarningsModal(gameId, task, listEl, skippedSection, skippedListEl) {
    const game = getGame(gameId);
    const key = gameId + "." + (task.id || task.label);
    const history = game ? getTaskTallyHistory(game, "weeklies", key) : [];
    const pot = getWeeklyPotential(task);
    const now = getSimulatedNow();
    const completedPeriods = history.filter((p) => p.completed > 0);

    listEl.innerHTML = "";
    if (completedPeriods.length === 0) {
      const empty = document.createElement("p");
      empty.className = "earnings-modal-empty";
      empty.textContent = history.length === 0
        ? "No cycles yet. Complete this task to add history."
        : "No completed cycles yet.";
      listEl.appendChild(empty);
    } else {
      let completionNum = 0;
      history.forEach((period) => {
        if (period.completed === 0) return;
        completionNum += 1;
        const item = document.createElement("div");
        item.className = "earnings-modal-item";
        const dateRow = document.createElement("div");
        dateRow.className = "earnings-modal-date-row";
        const dateDisplay = document.createElement("span");
        dateDisplay.className = "earnings-modal-date-display";
        dateDisplay.textContent = "Completion " + completionNum + ": " + formatHistoryCycleDateRange(period.periodStart, period.periodEnd);
        dateRow.appendChild(dateDisplay);
        item.appendChild(dateRow);

        const earnRow = document.createElement("div");
        earnRow.className = "earnings-modal-earn-row";
        earnRow.innerHTML = "<label>Earned:</label>";
        const earnVal = document.createElement("span");
        earnVal.className = "earnings-modal-earn-value";
        earnVal.textContent = String(pot);
        earnRow.appendChild(earnVal);
        appendEarningsMaxLabel(earnRow, pot);
        item.appendChild(earnRow);
        listEl.appendChild(item);
      });
    }

    const skipped = history.filter((p) => p.completed === 0 && p.periodEnd.getTime() <= now.getTime());
    if (skippedListEl) {
      skippedListEl.innerHTML = "";
      if (skipped.length === 0) {
        setEarningsModalSkippedLayout(false);
      } else {
        setEarningsModalSkippedLayout(true);
        skipped.forEach((period) => {
          const item = document.createElement("div");
          item.className = "earnings-modal-skipped-item";
          item.textContent = formatHistoryCycleDateRange(period.periodStart, period.periodEnd) + " (skipped) · Max: " + pot;
          skippedListEl.appendChild(item);
        });
      }
    }
  }

  function openEarningsModal(gameId, task, taskType) {
    const type = taskType === "weeklies" ? "weeklies" : "endgame";
    earningsModal.gameId = gameId;
    earningsModal.task = task;
    earningsModal.taskType = type;

    const titleEl = qs("earningsModalTitle");
    if (titleEl) titleEl.textContent = "Completion History — " + (task.label || "Task");

    const listEl = qs("earningsModalList");
    const skippedSection = qs("earningsModalSkippedSection");
    const skippedListEl = qs("earningsModalSkippedList");
    if (!listEl) return;
    setEarningsModalSkippedLayout(false);

    if (type === "weeklies") {
      populateWeeklyEarningsModal(gameId, task, listEl, skippedSection, skippedListEl);
      const modalEl = qs("earningsModal");
      if (modalEl) {
        modalEl.hidden = false;
        modalEl.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        activateModalFocus(modalEl);
      }
      return;
    }

    const key = gameId + "." + (task.id || task.label);
    const completedCount = getCompletedAmount(state.endgameCompleted, key);
    ensureEndgameEarnedArrayLength(gameId, task.id || task.label, completedCount);
    const earnedArr = getEndgameEarnedPerCompletion(gameId, task.id || task.label);
    const game = getGame(gameId);
    const completedEntries = game ? getEndgameCompletedPeriodsFromCalendar(game, task, key) : [];
    const endgameHistory = game ? getTaskTallyHistory(game, "endgame", key) : [];

    listEl.innerHTML = "";

    if (completedEntries.length === 0 && earnedArr.length === 0) {
      const empty = document.createElement("p");
      empty.className = "earnings-modal-empty";
      empty.textContent = "No completions yet. Complete this task to add earnings.";
      listEl.appendChild(empty);
    } else {
      completedEntries.forEach((entry, i) => {
        const completionNum = i + 1;
        const startVal = entry.range.start;
        const endVal = entry.range.end;
        const dateLabel = startVal && endVal ? startVal + " — " + endVal : "(Start - End)";

        const item = document.createElement("div");
        item.className = "earnings-modal-item";
        const dateRow = document.createElement("div");
        dateRow.className = "earnings-modal-date-row";
        const dateDisplay = document.createElement("span");
        dateDisplay.className = "earnings-modal-date-display";
        dateDisplay.textContent = "Completion " + completionNum + ": " + dateLabel;
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
          dateDisplay.textContent = "Completion " + completionNum + ": " + (s && e ? s + " — " + e : "(Start - End)");
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
        const historyIdx = endgameHistory.findIndex((p) => p.periodStart.getTime() === entry.period.periodStart.getTime());
        const maxPot = historyIdx >= 0
          ? getEndgamePotentialAtCycle(gameId, task.id || task.label, task, historyIdx)
          : getEndgamePotential(task);
        appendEarningsMaxLabel(earnRow, maxPot);
        item.appendChild(earnRow);
        listEl.appendChild(item);
      });
    }

    const skippedCycles = getEndgameSkippedCycles(key);
    if (skippedListEl) {
      skippedListEl.innerHTML = "";
      if (skippedCycles.length === 0) {
        setEarningsModalSkippedLayout(false);
      } else {
        setEarningsModalSkippedLayout(true);
        skippedCycles.forEach((s) => {
          const idx = endgameHistory.findIndex((p) => p.periodStart.getTime() === s.periodStart.getTime());
          const maxPot = idx >= 0
            ? getEndgamePotentialAtCycle(gameId, task.id || task.label, task, idx)
            : getEndgamePotential(task);
          const item = document.createElement("div");
          item.className = "earnings-modal-skipped-item";
          item.textContent = s.startStr + " — " + s.endStr + " (skipped) · Max: " + maxPot;
          skippedListEl.appendChild(item);
        });
      }
    }

    const modalEl = qs("earningsModal");
    if (modalEl) {
      modalEl.hidden = false;
      modalEl.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      activateModalFocus(modalEl);
    }
  }

  function closeEarningsModal() {
    earningsModal.gameId = null;
    earningsModal.task = null;
    earningsModal.taskType = null;
    const modalEl = qs("earningsModal");
    if (modalEl) {
      modalEl.hidden = true;
      modalEl.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }

  let endgameCompleteModalCtx = null;

  function setEndgameCompleteModalOpen(open) {
    const el = qs("endgameCompleteModal");
    if (!el) return;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      document.body.style.overflow = "hidden";
      activateModalFocus(el);
    } else {
      if (!calendarDayModal.open) {
        const ex = qs("extracurricularCompleteModal");
        if (!ex || ex.hidden) document.body.style.overflow = "";
      }
      deactivateModalFocus();
    }
  }

  function populateEndgameCompleteModal(gameId, taskId) {
    const game = getGame(gameId);
    const task = game && (game.endgame || []).find((t) => (t.id || t.label) === taskId);
    const titleEl = qs("endgameCompleteModalTitle");
    const descEl = qs("endgameCompleteModalDesc");
    const input = qs("endgameCompleteCurrencyInput");
    if (!task || !input) return;
    const key = gameId + "." + taskId;
    syncEndgamePendingForKey(key, game, task);
    const prefill = getEndgamePendingAmount(key, game, task);
    if (titleEl) {
      titleEl.textContent = "Currency earned";
      titleEl.dataset.gameId = gameId;
      titleEl.dataset.taskId = taskId;
    }
    if (descEl) {
      const cur = getCurrencyLabel(game);
      descEl.textContent = (task.label || "Endgame") + " — How much " + cur + " did you earn for completing this cycle?";
    }
    const completedCount = getCompletedAmount(state.endgameCompleted, key);
    const earnedArr = getEndgameEarnedPerCompletion(gameId, taskId);
    const pastWrap = qs("endgameCompletePastWrap");
    const pastSummary = qs("endgameCompletePastSummary");
    const pastList = qs("endgameCompletePastList");
    const pastToggle = qs("endgameCompletePastToggle");
    const samePastBtn = qs("endgameCompleteSameAsPastBtn");
    const curLabel = getCurrencyLabel(game);
    const lastPastAmount = completedCount > 0 ? (Number(earnedArr[completedCount - 1]) || 0) : 0;
    if (pastSummary) {
      if (completedCount > 0) {
        pastSummary.textContent = "Last completion earned: " + lastPastAmount + " " + curLabel + ".";
      } else {
        pastSummary.textContent = "No prior completions recorded for this task.";
      }
    }
    if (pastList) {
      pastList.innerHTML = "";
      for (let i = 0; i < completedCount; i++) {
        const li = document.createElement("li");
        li.textContent = "Completion " + (i + 1) + ": " + (Number(earnedArr[i]) || 0) + " " + curLabel;
        pastList.appendChild(li);
      }
      pastList.hidden = true;
    }
    if (pastToggle) {
      if (completedCount >= 1) {
        pastToggle.hidden = false;
        pastToggle.textContent = "Show past earnings";
        pastToggle.setAttribute("aria-expanded", "false");
        pastToggle.title = "Show or hide earnings from each previous completion.";
        pastToggle.setAttribute("aria-label", "Show past earnings: list amounts from previous completions");
      } else {
        pastToggle.hidden = true;
      }
    }
    if (samePastBtn) {
      if (completedCount > 0) {
        samePastBtn.hidden = false;
        samePastBtn.textContent = "Same as past cycle (" + lastPastAmount + ")";
        samePastBtn.title = "Set amount to last completion's earnings (" + lastPastAmount + " " + curLabel + ").";
        samePastBtn.setAttribute("aria-label", "Same as past cycle: set to " + lastPastAmount + " " + curLabel);
      } else {
        samePastBtn.hidden = true;
      }
    }
    if (pastWrap) pastWrap.hidden = false;
    input.value = prefill > 0 ? String(prefill) : "";
    input.min = "0";
    input.placeholder = "0";
    const fullBtn = qs("endgameCompleteFullPotentialBtn");
    const pot = getEndgamePotential(task);
    if (fullBtn) {
      if (pot > 0) {
        fullBtn.hidden = false;
        const cur = getCurrencyLabel(game);
        fullBtn.textContent = "Earned full amount (" + pot + ")";
        fullBtn.title = "Set earned to this task's full potential (" + pot + " " + cur + ").";
        fullBtn.setAttribute("aria-label", "Earned full amount: set to " + pot + " " + cur);
      } else {
        fullBtn.hidden = true;
      }
    }
    setTimeout(() => input.focus(), 0);
  }

  function applyEndgameCompleteFullPotential() {
    const titleEl = qs("endgameCompleteModalTitle");
    const gameId = titleEl && titleEl.dataset.gameId;
    const taskId = titleEl && titleEl.dataset.taskId;
    if (!gameId || !taskId) return;
    const game = getGame(gameId);
    const task = game && (game.endgame || []).find((t) => (t.id || t.label) === taskId);
    if (!task) return;
    const pot = getEndgamePotential(task);
    const input = qs("endgameCompleteCurrencyInput");
    if (input && pot > 0) input.value = String(pot);
  }

  function applyEndgameCompleteSameAsPastCycle() {
    const titleEl = qs("endgameCompleteModalTitle");
    const gameId = titleEl && titleEl.dataset.gameId;
    const taskId = titleEl && titleEl.dataset.taskId;
    if (!gameId || !taskId) return;
    const key = gameId + "." + taskId;
    const completedCount = getCompletedAmount(state.endgameCompleted, key);
    if (completedCount <= 0) return;
    const earnedArr = getEndgameEarnedPerCompletion(gameId, taskId);
    const lastPast = Number(earnedArr[completedCount - 1]) || 0;
    const input = qs("endgameCompleteCurrencyInput");
    if (input) input.value = String(lastPast);
  }

  /**
   * @param {string} gameId
   * @param {string} taskId
   * @param {null|{ dateStr: string, checkboxes: Array, dayData: object, newEndgameKeys: string[], currencyMap: object, idx: number }} calCtx
   */
  function openEndgameCompleteModal(gameId, taskId, calCtx) {
    endgameCompleteModalCtx = calCtx;
    populateEndgameCompleteModal(gameId, taskId);
    setEndgameCompleteModalOpen(true);
  }

  function closeEndgameCompleteModal() {
    endgameCompleteModalCtx = null;
    setEndgameCompleteModalOpen(false);
  }

  function setExtracurricularCompleteModalOpen(open) {
    const el = qs("extracurricularCompleteModal");
    if (!el) return;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      document.body.style.overflow = "hidden";
      activateModalFocus(el);
    } else {
      if (!calendarDayModal.open) {
        const eg = qs("endgameCompleteModal");
        if (!eg || eg.hidden) document.body.style.overflow = "";
      }
      deactivateModalFocus();
    }
  }

  function populateExtracurricularCompleteModal(taskId) {
    const tasks = state.extracurricularTasks || [];
    const task = tasks.find((t) => t.id === taskId);
    const titleEl = qs("extracurricularCompleteModalTitle");
    const descEl = qs("extracurricularCompleteModalDesc");
    const input = qs("extracurricularCompleteCurrencyInput");
    const fullBtn = qs("extracurricularCompleteFullPotentialBtn");
    if (!task || !input) return;
    const game = task.gameId ? getGame(task.gameId) : null;
    const curLabel = getCurrencyLabel(game);
    if (titleEl) {
      titleEl.textContent = "Currency earned";
      titleEl.dataset.taskId = taskId;
    }
    if (descEl) {
      descEl.textContent = (task.label || "Task") + " — How much " + curLabel + " did you earn for completing this task?";
    }
    const pot = Math.max(0, Number(task.currency) || 0);
    input.value = pot > 0 ? String(pot) : "";
    input.min = "0";
    input.placeholder = "0";
    if (fullBtn) {
      if (pot > 0) {
        fullBtn.hidden = false;
        fullBtn.textContent = "Earned full amount (" + pot + ")";
        fullBtn.title = "Set earned to the potential amount set on this task (" + pot + " " + curLabel + ").";
      } else {
        fullBtn.hidden = true;
      }
    }
    setTimeout(() => input.focus(), 0);
  }

  function openExtracurricularCompleteModal(taskId) {
    populateExtracurricularCompleteModal(taskId);
    setExtracurricularCompleteModalOpen(true);
  }

  function closeExtracurricularCompleteModal() {
    setExtracurricularCompleteModalOpen(false);
  }

  function confirmExtracurricularCompleteModal() {
    const titleEl = qs("extracurricularCompleteModalTitle");
    const taskId = titleEl && titleEl.dataset.taskId;
    const input = qs("extracurricularCompleteCurrencyInput");
    const raw = input && input.value !== undefined && input.value !== null ? input.value : "";
    const num = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
    if (!taskId) {
      closeExtracurricularCompleteModal();
      return;
    }
    closeExtracurricularCompleteModal();
    completeExtracurricularWithCurrency(taskId, num);
  }

  function applyExtracurricularCompleteFullPotential() {
    const titleEl = qs("extracurricularCompleteModalTitle");
    const taskId = titleEl && titleEl.dataset.taskId;
    const tasks = state.extracurricularTasks || [];
    const task = taskId && tasks.find((t) => t.id === taskId);
    if (!task) return;
    const pot = Math.max(0, Number(task.currency) || 0);
    const input = qs("extracurricularCompleteCurrencyInput");
    if (input && pot > 0) input.value = String(pot);
  }

  function confirmEndgameCompleteModal() {
    const input = qs("endgameCompleteCurrencyInput");
    const raw = input && input.value !== undefined && input.value !== null ? input.value : "";
    const num = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
    const ctx = endgameCompleteModalCtx;
    if (ctx) {
      const keys = ctx.newEndgameKeys;
      const idx = ctx.idx;
      const key = keys[idx];
      ctx.currencyMap[key] = num;
      if (idx + 1 < keys.length) {
        ctx.idx = idx + 1;
        const dot = keys[idx + 1].indexOf(".");
        const ngid = dot >= 0 ? keys[idx + 1].slice(0, dot) : keys[idx + 1];
        const ntid = dot >= 0 ? keys[idx + 1].slice(dot + 1) : "";
        populateEndgameCompleteModal(ngid, ntid);
        return;
      }
      const dateStr = ctx.dateStr;
      const checkboxes = ctx.checkboxes;
      const currencyMap = ctx.currencyMap;
      endgameCompleteModalCtx = null;
      setEndgameCompleteModalOpen(false);
      const timeRows = collectNewlyCompletedFromCalendar(dateStr, checkboxes);
      if (timeRows.length) {
        openCompletionTimeModal({
          mode: "calendar",
          dateStr,
          checkboxes,
          currencyMap,
          rows: timeRows,
        });
        return;
      }
      applyCalendarDayModalSave(dateStr, checkboxes, currencyMap, null);
      return;
    }
    const titleEl = qs("endgameCompleteModalTitle");
    let gameId = null;
    let taskId = null;
    if (titleEl && titleEl.dataset.gameId) {
      gameId = titleEl.dataset.gameId;
      taskId = titleEl.dataset.taskId || "";
    }
    if (!gameId || !taskId) {
      closeEndgameCompleteModal();
      return;
    }
    closeEndgameCompleteModal();
    completeEndgameWithCurrency(gameId, taskId, num);
  }

  function openEndgameCompleteModalForCalendar(dateStr, checkboxes, dayData, newEndgameKeys) {
    const firstKey = newEndgameKeys[0];
    const dot = firstKey.indexOf(".");
    const gameId = dot >= 0 ? firstKey.slice(0, dot) : firstKey;
    const taskId = dot >= 0 ? firstKey.slice(dot + 1) : "";
    const ctx = {
      dateStr,
      checkboxes,
      dayData,
      newEndgameKeys,
      currencyMap: {},
      idx: 0,
    };
    openEndgameCompleteModal(gameId, taskId, ctx);
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
    const newEndgameKeys = [];
    checkboxes.forEach(({ check, type, key }) => {
      if (type !== "endgame") return;
      // Currency prompt only when this day gains a new endgame mark (not carried/already marked).
      if (!isMarkedOnCalendarDay(dateStr, "endgame", key) && check.checked) newEndgameKeys.push(key);
    });
    if (newEndgameKeys.length > 0) {
      openEndgameCompleteModalForCalendar(dateStr, checkboxes, dayData, newEndgameKeys);
      return;
    }
    const timeRows = collectNewlyCompletedFromCalendar(dateStr, checkboxes);
    if (timeRows.length) {
      openCompletionTimeModal({
        mode: "calendar",
        dateStr,
        checkboxes,
        currencyMap: null,
        rows: timeRows,
      });
      return;
    }
    applyCalendarDayModalSave(dateStr, checkboxes, null, null);
  }

  /**
   * @param {null|Object<string, number>} endgameCurrencyOverrides
   * @param {null|Object<string, {hour:number, minute:number}>} completionTimesByTypeKey — key = "type|key"
   */
  function applyCalendarDayModalSave(dateStr, checkboxes, endgameCurrencyOverrides, completionTimesByTypeKey) {
    const blocked = [];
    const times = completionTimesByTypeKey || {};
    checkboxes.forEach(({ check, type, key }) => {
      // Compare against this day's calendar marks so Save on a pre-finish day
      // does not wipe a cycle that was completed later.
      const wasCompleted = isMarkedOnCalendarDay(dateStr, type, key);
      const nowCompleted = check.checked;
      if (wasCompleted === nowCompleted) return;

      if (nowCompleted) {
        const currencyValue =
          type === "endgame" && endgameCurrencyOverrides && endgameCurrencyOverrides[key] !== undefined
            ? endgameCurrencyOverrides[key]
            : undefined;
        const t = times[type + "|" + key];
        const result = applyTaskCompletion(type, key, {
          dateStr,
          currencyValue,
          hour: t ? t.hour : undefined,
          minute: t ? t.minute : undefined,
          save: false,
          render: false,
          processResets: false,
        });
        if (result && !result.ok) {
          check.checked = false;
          blocked.push(result.reason || key);
        }
      } else {
        removeTaskCompletion(type, key, {
          dateStr,
          save: false,
          render: false,
          processResets: false,
        });
      }
    });
    if (blocked.length) {
      alert("Some tasks are still locked:\n" + blocked.slice(0, 5).join("\n"));
    }
    processResets();
    save();
    renderActiveTab();
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

  function readCycleEndTimeFieldsFromModal(beginHour, beginMinute) {
    const sameToggle = qs("taskCycleEndTimeSameAsBegin");
    const endInput = qs("taskCycleEndTime");
    const sameAsBegin = !sameToggle || sameToggle.checked;
    if (sameAsBegin) {
      return { cycleEndTimeSameAsBegin: true };
    }
    const parts = parseTimeStr(endInput && endInput.value ? endInput.value : timeToStr(beginHour, beginMinute));
    return {
      cycleEndTimeSameAsBegin: false,
      cycleEndHour: parts.hour,
      cycleEndMinute: parts.minute,
    };
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
    const tempTask = Object.assign(
      {
        dateStarted,
        weekStartDay: taskModal.selectedDay,
        weekStartHour: hour,
        weekStartMinute: minute,
        frequencyEvery,
        frequencyUnit: taskModal.frequencyUnit || "week",
        timeLimitEvery,
        timeLimitUnit: taskModal.timeLimitUnit || "week",
        adjustForDST,
      },
      readCycleEndTimeFieldsFromModal(hour, minute)
    );
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
    if (typeof syncTaskCycleEndTimeUI === "function") syncTaskCycleEndTimeUI();
    input.value = formatRemainingMs(remainingMs);
    const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
    if (dayOfWeek >= 0) updateDaySelection(dayOfWeek);
  }

  function buildTempTaskFromModal() {
    const dateInput = qs("taskDateStarted");
    const resetTime = qs("taskResetTime");
    const freqEvery = qs("taskFrequencyEvery");
    const limEvery = qs("taskTimeLimitEvery");
    const dstToggle = qs("taskAdjustForDST");
    const manualResetToggle = qs("taskManualReset");
    const { hour, minute } = parseTimeStr(resetTime && resetTime.value ? resetTime.value : getDefaultTimeStr());
    const dateStarted = isValidDateStr(dateInput && dateInput.value) ? dateInput.value : getDateStr();
    return Object.assign(
      {
        dateStarted,
        weekStartDay: taskModal.selectedDay,
        weekStartHour: hour,
        weekStartMinute: minute,
        frequencyEvery: Math.max(1, Number(freqEvery && freqEvery.value) || 1),
        frequencyUnit: taskModal.frequencyUnit || "week",
        timeLimitEvery: Math.max(1, Number(limEvery && limEvery.value) || 1),
        timeLimitUnit: taskModal.timeLimitUnit || "week",
        adjustForDST: dstToggle ? dstToggle.checked : true,
        manualReset: !!(manualResetToggle && manualResetToggle.checked),
      },
      readCycleEndTimeFieldsFromModal(hour, minute)
    );
  }

  function updateTaskCycleEndPreview() {
    // Stop-cycle preview removed from task menu; keep no-op for legacy callers.
  }

  function setTaskCycleEndFieldsVisible() {
    // Stop-cycle fields removed from task menu; keep no-op for legacy callers.
  }

  function setTaskMenuSectionExpanded(toggleBtn, bodyEl, expanded) {
    if (!toggleBtn || !bodyEl) return;
    const open = !!expanded;
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    toggleBtn.classList.toggle("is-expanded", open);
    bodyEl.hidden = !open;
  }

  const TASK_BANNER_SECTION_PREF_KEY = "gacha.taskBannerSectionExpanded";

  function getTaskBannerSectionPreferExpanded() {
    try {
      const raw = localStorage.getItem(TASK_BANNER_SECTION_PREF_KEY);
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch (_) {}
    return null;
  }

  function setTaskBannerSectionPreferExpanded(expanded) {
    try {
      localStorage.setItem(TASK_BANNER_SECTION_PREF_KEY, expanded ? "1" : "0");
    } catch (_) {}
  }

  /** Expand Card banners only until a banner image exists (or user collapsed it themselves). */
  function syncTaskBannerSectionOpenState(task) {
    const toggleBtn = qs("taskBannerSectionToggle");
    const bodyEl = qs("taskBannerSectionBody");
    const hasImage = !!(task && typeof resolveTaskBannerSource === "function" && resolveTaskBannerSource(task))
      || !!(taskModal && taskModal.bannerSource);
    const pref = getTaskBannerSectionPreferExpanded();
    let expanded;
    if (hasImage) {
      // After first saved/used image: keep collapsed unless the user explicitly prefers open.
      expanded = pref === true;
    } else if (pref == null) {
      expanded = true;
    } else {
      expanded = pref;
    }
    setTaskMenuSectionExpanded(toggleBtn, bodyEl, expanded);
  }

  function syncTaskModalManualResetUI() {
    const manualToggle = qs("taskManualReset");
    const manual = !!(manualToggle && manualToggle.checked);
    document.querySelectorAll(".task-menu-scheduled-only").forEach((el) => {
      el.hidden = manual;
      if (manual) el.setAttribute("aria-hidden", "true");
      else el.removeAttribute("aria-hidden");
    });
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
    label1.appendChild(createTaskCurrencyInfoIcon(taskType));
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

      const rowCountFrom = document.createElement("div");
      rowCountFrom.className = "task-menu-extra-row task-cycle-end-row";
      const countFromLabel = document.createElement("label");
      countFromLabel.setAttribute("for", "taskCountFromDateStarted");
      countFromLabel.textContent = "Count from cycle start date (even if incomplete)";
      countFromLabel.appendChild(
        createTaskOptionInfoIcon(
          "When on, completed/attempted tallies start at the cycle start date above, including skipped cycles before the first calendar completion."
        )
      );
      const countFromToggle = document.createElement("input");
      countFromToggle.type = "checkbox";
      countFromToggle.id = "taskCountFromDateStarted";
      countFromToggle.className = "settings-toggle";
      countFromToggle.checked = !!(task && task.countFromDateStarted);
      countFromToggle.setAttribute("aria-label", "Count from cycle start date even without a completion");
      rowCountFrom.appendChild(countFromLabel);
      rowCountFrom.appendChild(countFromToggle);
      extra.appendChild(rowCountFrom);

      const unlockSection = document.createElement("div");
      unlockSection.className = "task-menu-section task-menu-extra-section";
      unlockSection.dataset.section = "unlock";
      const unlockToggle = document.createElement("button");
      unlockToggle.type = "button";
      unlockToggle.className = "task-menu-section-toggle";
      unlockToggle.id = "taskUnlockSectionToggle";
      unlockToggle.setAttribute("aria-expanded", "false");
      unlockToggle.setAttribute("aria-controls", "taskUnlockSectionBody");
      unlockToggle.innerHTML = "<span class=\"task-menu-section-title\">Unlock / earliest complete</span><span class=\"task-menu-section-chevron\" aria-hidden=\"true\"></span>";
      const unlockBody = document.createElement("div");
      unlockBody.id = "taskUnlockSectionBody";
      unlockBody.className = "task-menu-section-body";
      unlockBody.hidden = true;

      const rowUnlock = document.createElement("div");
      rowUnlock.className = "task-menu-extra-row";
      const labelUnlockDays = document.createElement("label");
      labelUnlockDays.textContent = "Earliest complete (days after reset)";
      labelUnlockDays.setAttribute("for", "taskEarliestCompleteDays");
      labelUnlockDays.appendChild(
        createTaskOptionInfoIcon(
          "How many days after the cycle reset before this task can be marked complete. 0 = same day as reset. Pain Cage uses 2 (day 3)."
        )
      );
      const inputUnlockDays = document.createElement("input");
      inputUnlockDays.id = "taskEarliestCompleteDays";
      inputUnlockDays.type = "number";
      inputUnlockDays.min = "0";
      inputUnlockDays.step = "1";
      inputUnlockDays.value = String(Math.max(0, Number(task && task.earliestCompleteDays) || 0));
      rowUnlock.appendChild(labelUnlockDays);
      rowUnlock.appendChild(inputUnlockDays);
      unlockBody.appendChild(rowUnlock);

      const rowUnlockTime = document.createElement("div");
      rowUnlockTime.className = "task-menu-extra-row";
      const labelUnlockTime = document.createElement("label");
      labelUnlockTime.textContent = "Unlock time on that day";
      labelUnlockTime.setAttribute("for", "taskEarliestCompleteTime");
      labelUnlockTime.appendChild(
        createTaskOptionInfoIcon(
          "Time on the unlock day when completion becomes allowed. Leave blank to use the task reset time."
        )
      );
      const inputUnlockTime = document.createElement("input");
      inputUnlockTime.id = "taskEarliestCompleteTime";
      inputUnlockTime.type = "time";
      inputUnlockTime.step = "60";
      if (task && (Number.isFinite(task.earliestCompleteHour) || Number.isFinite(task.earliestCompleteMinute))) {
        inputUnlockTime.value = timeToStr(task.earliestCompleteHour, task.earliestCompleteMinute);
      } else {
        inputUnlockTime.value = "";
        inputUnlockTime.placeholder = "Same as reset";
      }
      rowUnlockTime.appendChild(labelUnlockTime);
      rowUnlockTime.appendChild(inputUnlockTime);
      unlockBody.appendChild(rowUnlockTime);

      unlockToggle.addEventListener("click", () => {
        const open = unlockToggle.getAttribute("aria-expanded") !== "true";
        setTaskMenuSectionExpanded(unlockToggle, unlockBody, open);
      });
      const hasUnlock = !!(task && ((Number(task.earliestCompleteDays) || 0) > 0
        || Number.isFinite(task.earliestCompleteHour)
        || Number.isFinite(task.earliestCompleteMinute)));
      setTaskMenuSectionExpanded(unlockToggle, unlockBody, hasUnlock);
      unlockSection.appendChild(unlockToggle);
      unlockSection.appendChild(unlockBody);
      extra.appendChild(unlockSection);

      const rowRemaining = document.createElement("div");
      rowRemaining.className = "task-menu-extra-row task-menu-time-remaining task-menu-scheduled-only";
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

      input2.addEventListener("change", () => { updateTaskTimeRemainingDisplay(); });
      remainingInput.addEventListener("input", () => updateTaskTimeRemainingDisplay());
    }
  }

function syncTaskCycleEndTimeUI() {
    const sameToggle = qs("taskCycleEndTimeSameAsBegin");
    const endTime = qs("taskCycleEndTime");
    const beginTime = qs("taskResetTime");
    if (!endTime) return;
    const same = !sameToggle || sameToggle.checked;
    endTime.disabled = same;
    endTime.setAttribute("aria-disabled", same ? "true" : "false");
    if (same && beginTime && beginTime.value) endTime.value = beginTime.value;
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

    const sameEndToggle = qs("taskCycleEndTimeSameAsBegin");
    const cycleEndTime = qs("taskCycleEndTime");
    const sameAsBegin = !task || task.cycleEndTimeSameAsBegin !== false;
    if (sameEndToggle) sameEndToggle.checked = sameAsBegin;
    if (cycleEndTime) {
      if (sameAsBegin) {
        cycleEndTime.value = tStr;
      } else {
        cycleEndTime.value = timeToStr(
          Number.isFinite(task && task.cycleEndHour) ? task.cycleEndHour : undefined,
          Number.isFinite(task && task.cycleEndMinute) ? task.cycleEndMinute : undefined
        );
      }
    }
    syncTaskCycleEndTimeUI();

    const dstToggle = qs("taskAdjustForDST");
    if (dstToggle) dstToggle.checked = task && task.adjustForDST !== false;

    const manualResetToggle = qs("taskManualReset");
    if (manualResetToggle) manualResetToggle.checked = !!(task && task.manualReset);

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
    syncTaskModalManualResetUI();
    setActiveBannerUi("task");
    taskModal.bannerTarget = "board";
    const loaded = loadTaskBannersFromTask(task);
    taskModal.bannerSource = loaded.source;
    taskModal.bannerViews = loaded.views;
    taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    resetTaskBannerCropState();
    syncTaskBannerTargetButtons();
    syncTaskBannerPreview();
    syncTaskBannerSectionOpenState(task);
    setModalOpen(true);
    requestAnimationFrame(() => {
      resizeTaskBannerCropStage();
      drawTaskBannerCrop();
      if (taskModal.bannerSource) {
        loadTaskBannerSourceFromUrl(taskModal.bannerSource, { keepViews: true }).catch(() => {});
      } else {
        syncTaskBannerEditorFrames();
        drawTaskBannerCrop();
      }
    });
    updateTaskTimeRemainingDisplay();

    // focus name input for quick typing
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function closeTaskModal() {
    setModalOpen(false);
    taskModal.gameId = null;
    taskModal.taskType = null;
    taskModal.taskId = null;
    taskModal.bannerTarget = "board";
    taskModal.bannerSource = null;
    taskModal.bannerViews = emptyTaskBannerViews();
    taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    resetTaskBannerCropState();
    syncTaskBannerPreview();
    syncTaskBannerTargetButtons();
  }

  const manualResetModalState = {
    open: false,
    gameId: null,
    taskType: null,
    taskId: null,
    reason: "reset", // "create" | "reset" | "expiry"
  };

  function setManualResetModalOpen(open) {
    const el = qs("manualResetModal");
    if (!el) return;
    manualResetModalState.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      document.body.style.overflow = "hidden";
      activateModalFocus(el);
    } else {
      const otherOpen = Array.from(document.querySelectorAll(".modal")).some((m) => m !== el && !m.hidden);
      if (!otherOpen) document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }

  function syncManualResetDueInputs() {
    const tbd = qs("manualResetDueTbd");
    const due = qs("manualResetDueDate");
    const dueTime = qs("manualResetDueTime");
    const remaining = qs("manualResetTimeRemainingInput");
    if (!due) return;
    const isTbd = !!(tbd && tbd.checked);
    due.disabled = isTbd;
    due.setAttribute("aria-disabled", isTbd ? "true" : "false");
    if (dueTime) {
      dueTime.disabled = isTbd;
      dueTime.setAttribute("aria-disabled", isTbd ? "true" : "false");
    }
    if (remaining) {
      remaining.disabled = isTbd;
      remaining.setAttribute("aria-disabled", isTbd ? "true" : "false");
      if (isTbd) {
        remaining.value = "";
        remaining.placeholder = "e.g. 6d 7hr";
      }
    }
    if (!isTbd) updateManualResetTimeRemainingDisplay();
  }

  function getManualResetModalEndMoment() {
    const dueInput = qs("manualResetDueDate");
    const dueTime = qs("manualResetDueTime");
    const tbd = qs("manualResetDueTbd");
    if (tbd && tbd.checked) return null;
    const dueStr = dueInput && dueInput.value ? dueInput.value.trim() : "";
    if (!isValidDateStr(dueStr)) return null;
    const timeParts = parseTimeStr((dueTime && dueTime.value) || "23:59");
    const m = dueStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      timeParts.hour,
      timeParts.minute,
      0
    );
  }

  function updateManualResetTimeRemainingDisplay() {
    const remaining = qs("manualResetTimeRemainingInput");
    const tbd = qs("manualResetDueTbd");
    if (!remaining) return;
    if (tbd && tbd.checked) {
      remaining.value = "";
      remaining.placeholder = "e.g. 6d 7hr";
      return;
    }
    const endMoment = getManualResetModalEndMoment();
    if (!endMoment) {
      remaining.value = "";
      remaining.placeholder = "e.g. 6d 7hr";
      return;
    }
    const ms = endMoment.getTime() - getSimulatedNow().getTime();
    remaining.value = ms > 0 ? formatRemainingMs(ms) : "Not Available";
  }

  function applyManualResetTimeRemainingFromInput() {
    const remaining = qs("manualResetTimeRemainingInput");
    const dueInput = qs("manualResetDueDate");
    const dueTime = qs("manualResetDueTime");
    const tbd = qs("manualResetDueTbd");
    if (!remaining || !dueInput) return;
    if (tbd && tbd.checked) return;
    const remainingMs = parseTimeRemainingToMs(remaining.value.trim());
    if (remainingMs == null || remainingMs <= 0) return;
    const endDate = new Date(getSimulatedNow().getTime() + remainingMs);
    dueInput.value = getDateStr(endDate);
    if (dueTime) dueTime.value = timeToStr(endDate.getHours(), endDate.getMinutes());
    if (tbd) {
      tbd.checked = false;
      syncManualResetDueInputs();
    }
    remaining.value = formatRemainingMs(remainingMs);
  }

  function openManualResetModal(opts) {
    const o = opts || {};
    const game = getGame(o.gameId);
    if (!game) return;
    const list = o.taskType === "endgame" ? (game.endgame || []) : (game.weeklies || []);
    const task = list.find((t) => (t.id || t.label) === o.taskId);
    if (!task || !task.manualReset) return;
    if (manualResetModalState.open) return;

    manualResetModalState.gameId = o.gameId;
    manualResetModalState.taskType = o.taskType === "endgame" ? "endgame" : "weeklies";
    manualResetModalState.taskId = o.taskId;
    manualResetModalState.reason = o.reason || "reset";

    const title = qs("manualResetModalTitle");
    const desc = qs("manualResetModalDesc");
    const startInput = qs("manualResetStartDate");
    const startTime = qs("manualResetStartTime");
    const dueInput = qs("manualResetDueDate");
    const dueTime = qs("manualResetDueTime");
    const tbdToggle = qs("manualResetDueTbd");
    const label = task.label || (manualResetModalState.taskType === "endgame" ? "Endgame" : "Weekly");
    const now = getSimulatedNow();

    const isEdit = manualResetModalState.reason === "edit";
    if (title) {
      if (manualResetModalState.reason === "expiry") title.textContent = "Cycle due — set next window";
      else if (isEdit) title.textContent = "Edit current window";
      else title.textContent = "Manual Reset / Start";
    }
    if (desc) {
      if (manualResetModalState.reason === "expiry") {
        desc.textContent = ("\"" + label + "\" is past due. Set the next start and due time, or leave due TBD if you do not know yet.");
      } else if (isEdit) {
        desc.textContent = ("Edit the current window for \"" + label + "\". This does not archive the cycle or start a new one.");
      } else {
        desc.textContent = ("Set when \"" + label + "\" starts and when it is due, or leave due TBD if you do not know yet.");
      }
    }
    const confirmBtnLabel = qs("manualResetModalConfirm");
    if (confirmBtnLabel) confirmBtnLabel.textContent = isEdit ? "Save" : "Start";

    if (startInput) {
      startInput.value = isEdit && isValidDateStr(task.dateStarted) ? task.dateStarted : getDateStr(now);
    }
    if (startTime) {
      if (isEdit && Number.isFinite(task.weekStartHour)) {
        startTime.value = timeToStr(task.weekStartHour, Number.isFinite(task.weekStartMinute) ? task.weekStartMinute : 0);
      } else {
        startTime.value = timeToStr(now.getHours(), now.getMinutes());
      }
    }

    const hasDue = !task.manualDueTbd && isValidDateStr(task.manualDueDateStr);
    if (tbdToggle) tbdToggle.checked = isEdit ? !!task.manualDueTbd : false;
    if (dueInput) {
      dueInput.value = hasDue ? task.manualDueDateStr : getDateStr(now);
    }
    if (dueTime) {
      const dueH = Number.isFinite(task.manualDueHour)
        ? task.manualDueHour
        : (Number.isFinite(task.weekStartHour) ? task.weekStartHour : 23);
      const dueM = Number.isFinite(task.manualDueMinute)
        ? task.manualDueMinute
        : (Number.isFinite(task.weekStartMinute) ? task.weekStartMinute : 59);
      dueTime.value = hasDue
        ? timeToStr(dueH, dueM)
        : timeToStr(now.getHours(), now.getMinutes());
    }
    syncManualResetDueInputs();
    updateManualResetTimeRemainingDisplay();
    setManualResetModalOpen(true);
  }

  function closeManualResetModal() {
    setManualResetModalOpen(false);
    manualResetModalState.gameId = null;
    manualResetModalState.taskType = null;
    manualResetModalState.taskId = null;
    manualResetModalState.reason = "reset";
  }

  function confirmManualResetModal() {
    const game = getGame(manualResetModalState.gameId);
    if (!game) {
      closeManualResetModal();
      return;
    }
    const list = manualResetModalState.taskType === "endgame" ? (game.endgame || []) : (game.weeklies || []);
    const task = list.find((t) => (t.id || t.label) === manualResetModalState.taskId);
    if (!task) {
      closeManualResetModal();
      return;
    }
    const tbdToggle = qs("manualResetDueTbd");
    const startInput = qs("manualResetStartDate");
    const startTimeEl = qs("manualResetStartTime");
    const dueInput = qs("manualResetDueDate");
    const dueTimeEl = qs("manualResetDueTime");
    const tbd = !!(tbdToggle && tbdToggle.checked);
    const startDateStr = startInput && isValidDateStr(startInput.value) ? startInput.value : getDateStr();
    const startParts = parseTimeStr((startTimeEl && startTimeEl.value) || timeToStr(getSimulatedNow().getHours(), getSimulatedNow().getMinutes()));
    const dueDateStr = !tbd && dueInput && isValidDateStr(dueInput.value) ? dueInput.value : null;
    const dueParts = parseTimeStr((dueTimeEl && dueTimeEl.value) || "23:59");
    if (!tbd && !dueDateStr) {
      if (dueInput) dueInput.focus();
      return;
    }
    let startWeekday = 0;
    if (isValidDateStr(startDateStr)) {
      startWeekday = new Date(startDateStr + "T12:00:00").getDay();
    }

    if (manualResetModalState.reason === "edit") {
      task.dateStarted = startDateStr;
      task.weekStartHour = startParts.hour;
      task.weekStartMinute = startParts.minute;
      task.weekStartDay = startWeekday;
      if (tbd) {
        task.manualDueTbd = true;
        task.manualDueDateStr = null;
        delete task.manualDueHour;
        delete task.manualDueMinute;
      } else {
        task.manualDueTbd = false;
        task.manualDueDateStr = dueDateStr;
        task.manualDueHour = dueParts.hour;
        task.manualDueMinute = dueParts.minute;
      }
      task.manualAwaitingRestart = false;
    } else {
      startManualResetWindow(game, task, manualResetModalState.taskType, {
        reason: manualResetModalState.reason,
        tbd,
        dueDateStr,
        dueHour: dueParts.hour,
        dueMinute: dueParts.minute,
        dateStarted: startDateStr,
        startHour: startParts.hour,
        startMinute: startParts.minute,
        startWeekday: startWeekday,
      });
    }
    save();
    if (typeof bumpDataVersion === "function") bumpDataVersion();
    closeManualResetModal();
    renderActiveTab();
    if (typeof checkManualResetExpiries === "function") checkManualResetExpiries();
  }

  function cancelManualResetModal() {
    const game = getGame(manualResetModalState.gameId);
    const list = game
      ? (manualResetModalState.taskType === "endgame" ? (game.endgame || []) : (game.weeklies || []))
      : [];
    const task = list.find((t) => (t.id || t.label) === manualResetModalState.taskId);
    const reason = manualResetModalState.reason;
    // Cancel on create/expiry = "don't know next cycle yet" (pin). Cancel on mid-cycle Reset / edit aborts with no change.
    if (task && task.manualReset && (reason === "create" || reason === "expiry")) {
      task.manualAwaitingRestart = true;
      if (reason === "create" && !isValidDateStr(task.manualDueDateStr)) {
        task.manualDueTbd = true;
        task.manualDueDateStr = null;
      }
      save();
      if (typeof bumpDataVersion === "function") bumpDataVersion();
      renderActiveTab();
    }
    closeManualResetModal();
  }

  function initManualResetModal() {
    const modalEl = qs("manualResetModal");
    if (!modalEl) return;
    const confirmBtn = qs("manualResetModalConfirm");
    const cancelBtn = qs("manualResetModalCancel");
    const closeBtn = qs("manualResetModalClose");
    const tbdToggle = qs("manualResetDueTbd");
    const dueInput = qs("manualResetDueDate");
    const dueTime = qs("manualResetDueTime");
    const remaining = qs("manualResetTimeRemainingInput");

    modalEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-close") === "manualResetModal") {
        cancelManualResetModal();
      }
    });
    if (confirmBtn) confirmBtn.addEventListener("click", confirmManualResetModal);
    if (cancelBtn) cancelBtn.addEventListener("click", cancelManualResetModal);
    if (closeBtn) closeBtn.addEventListener("click", cancelManualResetModal);
    if (tbdToggle) tbdToggle.addEventListener("change", syncManualResetDueInputs);
    if (dueInput) {
      dueInput.addEventListener("change", updateManualResetTimeRemainingDisplay);
      dueInput.addEventListener("input", updateManualResetTimeRemainingDisplay);
      dueInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmManualResetModal();
        }
      });
    }
    if (dueTime) {
      dueTime.addEventListener("change", updateManualResetTimeRemainingDisplay);
      dueTime.addEventListener("input", updateManualResetTimeRemainingDisplay);
    }
    if (remaining) {
      remaining.addEventListener("blur", applyManualResetTimeRemainingFromInput);
      remaining.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          applyManualResetTimeRemainingFromInput();
        }
      });
    }
    document.addEventListener("keydown", (e) => {
      if (!manualResetModalState.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        cancelManualResetModal();
      }
    });
  }

  const manualCompletionModalState = {
    open: false,
    gameId: null,
    taskType: null, // "dailies" | "weeklies" | "endgame"
    taskId: null,
  };

  function setManualCompletionModalOpen(open) {
    const el = qs("manualCompletionModal");
    if (!el) return;
    manualCompletionModalState.open = open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      document.body.style.overflow = "hidden";
      activateModalFocus(el);
    } else {
      const otherOpen = Array.from(document.querySelectorAll(".modal")).some((m) => m !== el && !m.hidden);
      if (!otherOpen) document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }

  function closeManualCompletionModal() {
    setManualCompletionModalOpen(false);
    manualCompletionModalState.gameId = null;
    manualCompletionModalState.taskType = null;
    manualCompletionModalState.taskId = null;
    const conflict = qs("manualCompletionConflict");
    if (conflict) {
      conflict.hidden = true;
      conflict.textContent = "";
    }
  }

  function getManualCompletionTaskContext() {
    const type = manualCompletionModalState.taskType;
    const game = getGame(manualCompletionModalState.gameId);
    if (!game || !type) return null;
    if (type === "dailies") {
      return { type, game, task: null, key: game.id, label: game.name || "Dailies", isManual: false };
    }
    const list = type === "endgame" ? (game.endgame || []) : (game.weeklies || []);
    const task = list.find((t) => (t.id || t.label) === manualCompletionModalState.taskId);
    if (!task) return null;
    return {
      type,
      game,
      task,
      key: game.id + "." + (task.id || task.label),
      label: task.label || manualCompletionModalState.taskId,
      isManual: !!task.manualReset,
    };
  }

  function readManualCompletionWindowFromForm() {
    const startDateEl = qs("manualCompletionWindowStartDate");
    const startTimeEl = qs("manualCompletionWindowStartTime");
    const endDateEl = qs("manualCompletionWindowEndDate");
    const endTimeEl = qs("manualCompletionWindowEndTime");
    const startDateStr = startDateEl && isValidDateStr(startDateEl.value) ? startDateEl.value : null;
    const endDateStr = endDateEl && isValidDateStr(endDateEl.value) ? endDateEl.value : null;
    if (!startDateStr || !endDateStr) return null;
    const startParts = parseTimeStr((startTimeEl && startTimeEl.value) || "04:00");
    const endParts = parseTimeStr((endTimeEl && endTimeEl.value) || "23:59");
    return {
      startDateStr,
      endDateStr,
      startHour: startParts.hour,
      startMinute: startParts.minute,
      endHour: endParts.hour,
      endMinute: endParts.minute,
    };
  }

  function refreshManualCompletionConflictHint() {
    const conflict = qs("manualCompletionConflict");
    const dateInput = qs("manualCompletionDate");
    if (!conflict) return;
    const ctx = getManualCompletionTaskContext();
    if (!ctx) {
      conflict.hidden = true;
      conflict.textContent = "";
      return;
    }
    const dateStr = dateInput && isValidDateStr(dateInput.value) ? dateInput.value : null;
    if (!dateStr) {
      conflict.hidden = true;
      conflict.textContent = "";
      return;
    }
    let existing = null;
    if (ctx.type === "dailies") {
      const dayData = state.completionByDate[dateStr] || {};
      if ((dayData.dailies || []).includes(ctx.key)) existing = dateStr;
    } else if (ctx.isManual && typeof buildManualResetBoundsFromParts === "function") {
      const win = readManualCompletionWindowFromForm();
      if (win) {
        const bounds = buildManualResetBoundsFromParts(ctx.task, ctx.game, ctx.type, win);
        const hit = typeof findManualWindowCompletion === "function"
          ? findManualWindowCompletion(ctx.key, ctx.type, ctx.task, bounds)
          : { dateStr: null };
        existing = hit && hit.dateStr ? hit.dateStr : null;
      }
    } else if (typeof getCycleCompletionDateStr === "function") {
      existing = getCycleCompletionDateStr(ctx.type, ctx.key, dateStr);
    }
    if (existing) {
      conflict.hidden = false;
      conflict.textContent = "Conflict: a completion is already marked for this cycle on "
        + formatDate(new Date(existing + "T12:00:00"))
        + ". Adding will replace it.";
    } else {
      conflict.hidden = true;
      conflict.textContent = "";
    }
  }

  function openManualCompletionModal(opts) {
    const o = opts || {};
    const game = getGame(o.gameId);
    if (!game) return;
    const taskType = o.taskType === "endgame" || o.taskType === "dailies" ? o.taskType : "weeklies";
    if (taskType !== "dailies") {
      const list = taskType === "endgame" ? (game.endgame || []) : (game.weeklies || []);
      if (!list.find((t) => (t.id || t.label) === o.taskId)) return;
    }
    if (manualCompletionModalState.open || manualResetModalState.open) return;

    manualCompletionModalState.gameId = o.gameId;
    manualCompletionModalState.taskType = taskType;
    manualCompletionModalState.taskId = o.taskId || null;

    const ctx = getManualCompletionTaskContext();
    if (!ctx) return;

    const title = qs("manualCompletionModalTitle");
    const desc = qs("manualCompletionModalDesc");
    const windowFields = qs("manualCompletionWindowFields");
    const startDate = qs("manualCompletionWindowStartDate");
    const startTime = qs("manualCompletionWindowStartTime");
    const endDate = qs("manualCompletionWindowEndDate");
    const endTime = qs("manualCompletionWindowEndTime");
    const dateInput = qs("manualCompletionDate");
    const timeInput = qs("manualCompletionTime");
    const currencyRow = qs("manualCompletionCurrencyRow");
    const currencyInput = qs("manualCompletionCurrency");
    const now = getSimulatedNow();

    if (title) title.textContent = "Add completion";
    if (desc) {
      desc.textContent = ctx.isManual
        ? ("Log a completion for \"" + ctx.label + "\". Set the cycle window (past or current) and when you finished. Past windows are saved to history without changing the live cycle.")
        : ("Log a completion for \"" + ctx.label + "\". The cycle is inferred from the completion date.");
    }
    if (windowFields) windowFields.hidden = !ctx.isManual;
    if (ctx.isManual && ctx.task) {
      if (startDate) startDate.value = isValidDateStr(ctx.task.dateStarted) ? ctx.task.dateStarted : getDateStr(now);
      if (startTime) {
        startTime.value = timeToStr(
          Number.isFinite(ctx.task.weekStartHour) ? ctx.task.weekStartHour : now.getHours(),
          Number.isFinite(ctx.task.weekStartMinute) ? ctx.task.weekStartMinute : now.getMinutes()
        );
      }
      if (endDate) {
        endDate.value = (!ctx.task.manualDueTbd && isValidDateStr(ctx.task.manualDueDateStr))
          ? ctx.task.manualDueDateStr
          : getDateStr(now);
      }
      if (endTime) {
        const eh = Number.isFinite(ctx.task.manualDueHour)
          ? ctx.task.manualDueHour
          : (Number.isFinite(ctx.task.weekStartHour) ? ctx.task.weekStartHour : 23);
        const em = Number.isFinite(ctx.task.manualDueMinute)
          ? ctx.task.manualDueMinute
          : (Number.isFinite(ctx.task.weekStartMinute) ? ctx.task.weekStartMinute : 59);
        endTime.value = timeToStr(eh, em);
      }
    }
    if (dateInput) dateInput.value = getDateStr(now);
    if (timeInput) timeInput.value = timeToStr(now.getHours(), now.getMinutes());
    if (currencyRow) currencyRow.hidden = ctx.type !== "endgame";
    if (currencyInput) {
      const pot = ctx.task && typeof getEndgamePotential === "function" ? getEndgamePotential(ctx.task) : 0;
      currencyInput.value = String(Math.max(0, pot || 0));
    }
    refreshManualCompletionConflictHint();
    setManualCompletionModalOpen(true);
  }

  function confirmManualCompletionModal() {
    const ctx = getManualCompletionTaskContext();
    if (!ctx) {
      closeManualCompletionModal();
      return;
    }
    const dateInput = qs("manualCompletionDate");
    const timeInput = qs("manualCompletionTime");
    const dateStr = dateInput && isValidDateStr(dateInput.value) ? dateInput.value : null;
    if (!dateStr) {
      if (dateInput) dateInput.focus();
      return;
    }
    const timeParts = parseTimeStr((timeInput && timeInput.value) || timeToStr(getSimulatedNow().getHours(), getSimulatedNow().getMinutes()));

    // Manual-reset: go through applyManualResetCompletion so calendar / tallies / trends / closed cycles stay consistent.
    if (ctx.isManual && ctx.task) {
      const win = readManualCompletionWindowFromForm();
      if (!win) {
        alert("Manual-reset tasks need both cycle start and end dates.");
        return;
      }
      const currencyInput = qs("manualCompletionCurrency");
      const baseOpts = {
        dateStr,
        hour: timeParts.hour,
        minute: timeParts.minute,
        startDateStr: win.startDateStr,
        endDateStr: win.endDateStr,
        startHour: win.startHour,
        startMinute: win.startMinute,
        endHour: win.endHour,
        endMinute: win.endMinute,
        currencyValue: ctx.type === "endgame" && currencyInput
          ? Math.max(0, Number(currencyInput.value) || 0)
          : undefined,
        replace: false,
      };
      if (typeof applyManualResetCompletion !== "function") {
        alert("Manual completion is unavailable.");
        return;
      }
      let result = applyManualResetCompletion(ctx.game, ctx.task, ctx.type, baseOpts);
      if (result && result.reason === "conflict") {
        const msg = "A completion already exists for this cycle"
          + (result.conflictDateStr
            ? (" on " + formatDate(new Date(result.conflictDateStr + "T12:00:00")))
            : "")
          + ".\n\nReplace it with this new completion?";
        if (!window.confirm(msg)) return;
        result = applyManualResetCompletion(ctx.game, ctx.task, ctx.type, Object.assign({}, baseOpts, { replace: true }));
      }
      if (result && !result.ok && result.reason && result.reason !== "conflict") {
        alert(result.reason);
        return;
      }
      if (!result || !result.ok) return;
      closeManualCompletionModal();
      return;
    }

    // Normal dailies / scheduled weeklies / endgame: infer cycle from completion date.
    let existing = null;
    if (ctx.type === "dailies") {
      const dayData = state.completionByDate[dateStr] || {};
      if ((dayData.dailies || []).includes(ctx.key)) existing = dateStr;
    } else if (typeof getCycleCompletionDateStr === "function") {
      existing = getCycleCompletionDateStr(ctx.type, ctx.key, dateStr);
    }

    if (ctx.type !== "dailies" && ctx.task && typeof getCycleBoundsForTaskType === "function") {
      const bounds = getCycleBoundsForTaskType(ctx.type, ctx.task, new Date(dateStr + "T12:00:00"), ctx.game);
      if (!bounds) {
        alert("That completion date is outside this task's cycles.");
        return;
      }
      const completeMs = new Date(
        dateStr + "T" + String(timeParts.hour).padStart(2, "0") + ":" + String(timeParts.minute).padStart(2, "0") + ":00"
      ).getTime();
      if (completeMs < bounds.cycleStart.getTime() || completeMs >= bounds.cycleEnd.getTime()) {
        alert("Completion time must fall inside the cycle that contains that date.");
        return;
      }
    }

    if (existing) {
      const msg = "A completion already exists for this cycle on "
        + formatDate(new Date(existing + "T12:00:00"))
        + ".\n\nReplace it with this new completion?";
      if (!window.confirm(msg)) return;
      removeTaskCompletion(ctx.type, ctx.key, {
        dateStr: existing,
        skipUnlockGate: true,
        recordUndo: false,
        save: false,
        render: false,
        processResets: false,
      });
    }

    const opts = {
      dateStr,
      hour: timeParts.hour,
      minute: timeParts.minute,
      skipUnlockGate: true,
    };
    if (ctx.type === "endgame") {
      const currencyInput = qs("manualCompletionCurrency");
      if (currencyInput) opts.currencyValue = Math.max(0, Number(currencyInput.value) || 0);
    }
    const result = applyTaskCompletion(ctx.type, ctx.key, opts);
    if (result && !result.ok && result.reason) {
      alert(result.reason);
      return;
    }
    closeManualCompletionModal();
  }

  function initManualCompletionModal() {
    const modalEl = qs("manualCompletionModal");
    if (!modalEl) return;
    const confirmBtn = qs("manualCompletionModalConfirm");
    const cancelBtn = qs("manualCompletionModalCancel");
    const closeBtn = qs("manualCompletionModalClose");
    const dateInput = qs("manualCompletionDate");

    modalEl.addEventListener("click", (e) => {
      const target = e.target;
      if (target && target.getAttribute && target.getAttribute("data-close") === "manualCompletionModal") {
        closeManualCompletionModal();
      }
    });
    if (confirmBtn) confirmBtn.addEventListener("click", confirmManualCompletionModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeManualCompletionModal);
    if (closeBtn) closeBtn.addEventListener("click", closeManualCompletionModal);
    if (dateInput) {
      dateInput.addEventListener("change", refreshManualCompletionConflictHint);
      dateInput.addEventListener("input", refreshManualCompletionConflictHint);
    }
    ["manualCompletionWindowStartDate", "manualCompletionWindowEndDate", "manualCompletionWindowStartTime", "manualCompletionWindowEndTime", "manualCompletionTime"].forEach((id) => {
      const el = qs(id);
      if (el) {
        el.addEventListener("change", refreshManualCompletionConflictHint);
        el.addEventListener("input", refreshManualCompletionConflictHint);
      }
    });
    document.addEventListener("keydown", (e) => {
      if (!manualCompletionModalState.open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeManualCompletionModal();
      }
    });
  }

  /** Scan for expired manual-reset due windows and open the start popup (once per task). */
  function checkManualResetExpiries() {
    if (manualResetModalState.open || manualCompletionModalState.open) return false;
    const now = getSimulatedNow();
    const games = typeof getAllGames === "function" ? getAllGames() : (state.games || []);
    for (let gi = 0; gi < games.length; gi++) {
      const game = games[gi];
      const pairs = [
        ["weeklies", game.weeklies || []],
        ["endgame", game.endgame || []],
      ];
      for (let pi = 0; pi < pairs.length; pi++) {
        const taskType = pairs[pi][0];
        const list = pairs[pi][1];
        for (let ti = 0; ti < list.length; ti++) {
          const task = list[ti];
          if (!isManualResetTask(task)) continue;
          if (task.manualAwaitingRestart) continue;
          if (!isManualResetExpired(task, now)) continue;
          openManualResetModal({
            gameId: game.id,
            taskType,
            taskId: task.id || task.label,
            reason: "expiry",
          });
          return true;
        }
      }
    }
    return false;
  }

  function getPreset(presetId) {
    return GAME_PRESETS.find((p) => p.id === presetId) || null;
  }

  function decorateGameAddPresetIcons() {
    document.querySelectorAll(".game-add-options .game-add-option").forEach((btn) => {
      const presetId = btn.getAttribute("data-preset") || "custom";
      if (presetId === "custom") return;
      const preset = getPreset(presetId);
      const iconPath =
        typeof resolvePresetIconPath === "function"
          ? resolvePresetIconPath(preset || { id: presetId, presetId })
          : null;
      if (!iconPath) return;
      const url = typeof resolveStockBannerUrl === "function" ? resolveStockBannerUrl(iconPath) : iconPath;
      let iconEl = btn.querySelector(".game-add-option-icon");
      if (!iconEl) {
        iconEl = document.createElement("img");
        iconEl.className = "game-add-option-icon";
        iconEl.alt = "";
        iconEl.setAttribute("aria-hidden", "true");
        btn.insertBefore(iconEl, btn.firstChild);
      }
      if (iconEl.tagName === "IMG") {
        iconEl.src = url;
        iconEl.classList.remove("game-add-option-icon-placeholder");
      } else {
        const img = document.createElement("img");
        img.className = "game-add-option-icon";
        img.src = url;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        img.draggable = false;
        iconEl.replaceWith(img);
      }
    });
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
    decorateGameAddPresetIcons();
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
    const titleEl = qs("clearTimeTrendsModalTitle");
    if (!modal || !container) return;
    clearTimeTrendsModalOpen = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (titleEl) titleEl.textContent = "Sync Time Trends with Calendar";
    container.innerHTML = "";
    container.className = "clear-time-trends-games timestamps-game-selector";
    container.style.display = "flex";
    container.style.flexWrap = "wrap";
    container.style.gap = "0.5rem";
    const games = getAllGames();
    const gameIdsWithData = new Set((state.completionTimestamps || []).map((t) => t.gameId));
    const selected = new Set(gameIdsWithData.size ? gameIdsWithData : games.map((g) => g.id));
    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timestamps-game-pill clear-time-trends-pill";
      const stampCount = (state.completionTimestamps || []).filter((t) => t.gameId === game.id).length;
      btn.textContent = game.name + (stampCount ? " (" + stampCount + ")" : "");
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
      p.textContent = "No games to sync.";
      container.appendChild(p);
    }
    activateModalFocus(modal);
  }
  function closeClearTimeTrendsModal() {
    const modal = qs("clearTimeTrendsModal");
    if (modal) {
      clearTimeTrendsModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen && !clearDataModalOpen && !timeTrendsDetailModalOpen) document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }
  function getSelectedTimeTrendsGameIds() {
    const container = qs("clearTimeTrendsModalGames");
    const selectedIds = [];
    if (!container) return selectedIds;
    container.querySelectorAll('.clear-time-trends-pill.filled, .clear-time-trends-pill[aria-pressed="true"]').forEach((btn) => {
      if (btn.dataset.gameId) selectedIds.push(btn.dataset.gameId);
    });
    return selectedIds;
  }
  function confirmClearTimeTrends() {
    const selectedIds = getSelectedTimeTrendsGameIds();
    if (selectedIds.length > 0 && state.completionTimestamps) {
      const drop = new Set(selectedIds);
      state.completionTimestamps = state.completionTimestamps.filter((t) => !drop.has(t.gameId));
    }
    save();
    renderActiveTab();
    closeClearTimeTrendsModal();
  }
  function confirmSyncTimeTrendsFromCalendar() {
    const selectedIds = getSelectedTimeTrendsGameIds();
    if (!selectedIds.length) {
      alert("Select at least one game to sync.");
      return;
    }
    if (typeof syncTimestampsFromCalendar !== "function") {
      alert("Sync with Calendar is unavailable.");
      return;
    }
    const result = syncTimestampsFromCalendar({
      gameIds: selectedIds,
      skipRender: false,
      skipSave: false,
    });
    closeClearTimeTrendsModal();
    const parts = [
      "Synced Time Trends with Calendar.",
      "Already had times (unchanged): " + (result.kept || 0),
      "Filled from your usual trend hours: " + (result.added || 0),
    ];
    if (result.collapsed) parts.push("Duplicate stamps collapsed: " + result.collapsed);
    parts.push("Existing Time Trends stamps were left as-is so charts stay familiar.");
    alert(parts.join("\n"));
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
    activateModalFocus(modal);
  }
  function closeTimeTrendsDetailModal() {
    const modal = qs("timeTrendsDetailModal");
    if (modal) {
      timeTrendsDetailModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen && !clearDataModalOpen) document.body.style.overflow = "";
      deactivateModalFocus();
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

  let attendanceSkippedModalOpen = false;
  function openAttendanceSkippedModal(title, groups, skippedTotal) {
    const modal = qs("attendanceSkippedModal");
    if (!modal) return;
    attendanceSkippedModalOpen = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    const titleEl = qs("attendanceSkippedModalTitle");
    if (titleEl) titleEl.textContent = title || "Skipped tasks";
    const summaryEl = qs("attendanceSkippedModalSummary");
    if (summaryEl) {
      const taskCount = (groups || []).reduce((n, g) => n + ((g.tasks && g.tasks.length) || 0), 0);
      const skipSum = (groups || []).reduce(
        (n, g) => n + (g.tasks || []).reduce((s, t) => s + (Number(t.skipped) || 0), 0),
        0
      );
      const total = Number.isFinite(skippedTotal) ? skippedTotal : skipSum;
      summaryEl.textContent =
        total <= 0
          ? "Nothing skipped for included games."
          : total +
            " skipped cycle" +
            (total === 1 ? "" : "s") +
            " across " +
            taskCount +
            " task" +
            (taskCount === 1 ? "" : "s") +
            ".";
    }
    const listEl = qs("attendanceSkippedModalList");
    if (listEl && typeof fillAttendanceSkippedList === "function") {
      fillAttendanceSkippedList(listEl, groups || [], "No skipped tasks.");
    } else if (listEl) {
      listEl.innerHTML = "";
      (groups || []).forEach((group) => {
        const block = document.createElement("div");
        block.className = "attendance-skipped-game";
        const h = document.createElement("h4");
        h.className = "attendance-skipped-game-title";
        h.textContent = group.gameName;
        block.appendChild(h);
        const ul = document.createElement("ul");
        ul.className = "attendance-skipped-task-list";
        (group.tasks || []).forEach((task) => {
          const li = document.createElement("li");
          li.textContent =
            task.label + " — " + task.skipped + " skipped (" + task.completed + "/" + task.attempted + ")";
          ul.appendChild(li);
        });
        block.appendChild(ul);
        listEl.appendChild(block);
      });
    }
    activateModalFocus(modal);
  }
  function closeAttendanceSkippedModal() {
    const modal = qs("attendanceSkippedModal");
    if (modal) {
      attendanceSkippedModalOpen = false;
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      if (!settingsModalOpen && !clearDataModalOpen && !timeTrendsDetailModalOpen) document.body.style.overflow = "";
      deactivateModalFocus();
    }
  }
  function initAttendanceSkippedModal() {
    const modalEl = qs("attendanceSkippedModal");
    const closeBtn = qs("attendanceSkippedModalClose");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("modal-backdrop") ||
        e.target.getAttribute("data-close") === "attendanceSkippedModal"
      ) {
        closeAttendanceSkippedModal();
      }
    });
    if (closeBtn) closeBtn.addEventListener("click", closeAttendanceSkippedModal);
    document.addEventListener("keydown", (e) => {
      if (!attendanceSkippedModalOpen) return;
      if (e.key === "Escape") closeAttendanceSkippedModal();
    });
  }

  function initClearTimeTrendsModal() {
    const modalEl = qs("clearTimeTrendsModal");
    const closeBtn = qs("clearTimeTrendsModalClose");
    const cancelBtn = qs("clearTimeTrendsCancel");
    const clearBtn = qs("clearTimeTrendsConfirm");
    const syncBtn = qs("syncTimeTrendsConfirm");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal-backdrop") || e.target.getAttribute("data-close") === "clearTimeTrendsModal") closeClearTimeTrendsModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeClearTimeTrendsModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeClearTimeTrendsModal);
    if (clearBtn) clearBtn.addEventListener("click", confirmClearTimeTrends);
    if (syncBtn) syncBtn.addEventListener("click", confirmSyncTimeTrendsFromCalendar);
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

  function initEndgameCompleteModal() {
    const modalEl = qs("endgameCompleteModal");
    const confirmBtn = qs("endgameCompleteModalConfirm");
    const cancelBtn = qs("endgameCompleteModalCancel");
    const closeBtn = qs("endgameCompleteModalClose");
    const fullPotentialBtn = qs("endgameCompleteFullPotentialBtn");
    const input = qs("endgameCompleteCurrencyInput");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeEndgameCompleteModal();
    });
    if (confirmBtn) confirmBtn.addEventListener("click", confirmEndgameCompleteModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeEndgameCompleteModal);
    if (closeBtn) closeBtn.addEventListener("click", closeEndgameCompleteModal);
    if (fullPotentialBtn) fullPotentialBtn.addEventListener("click", applyEndgameCompleteFullPotential);
    const sameAsPastBtn = qs("endgameCompleteSameAsPastBtn");
    if (sameAsPastBtn) sameAsPastBtn.addEventListener("click", applyEndgameCompleteSameAsPastCycle);
    const pastToggle = qs("endgameCompletePastToggle");
    const pastList = qs("endgameCompletePastList");
    if (pastToggle && pastList) {
      pastToggle.addEventListener("click", () => {
        const show = pastList.hidden;
        pastList.hidden = !show;
        pastToggle.textContent = show ? "Hide past earnings" : "Show past earnings";
        pastToggle.setAttribute("aria-expanded", show ? "true" : "false");
        pastToggle.title = show ? "Hide the list of past completion amounts." : "Show or hide earnings from each previous completion.";
      });
    }
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmEndgameCompleteModal();
        }
      });
    }
    document.addEventListener("keydown", (e) => {
      const el = qs("endgameCompleteModal");
      if (!el || el.hidden) return;
      if (e.key === "Escape") closeEndgameCompleteModal();
    });
  }

  function initExtracurricularCompleteModal() {
    const modalEl = qs("extracurricularCompleteModal");
    const confirmBtn = qs("extracurricularCompleteModalConfirm");
    const cancelBtn = qs("extracurricularCompleteModalCancel");
    const closeBtn = qs("extracurricularCompleteModalClose");
    const fullBtn = qs("extracurricularCompleteFullPotentialBtn");
    const input = qs("extracurricularCompleteCurrencyInput");
    if (!modalEl) return;
    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeExtracurricularCompleteModal();
    });
    if (confirmBtn) confirmBtn.addEventListener("click", confirmExtracurricularCompleteModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeExtracurricularCompleteModal);
    if (closeBtn) closeBtn.addEventListener("click", closeExtracurricularCompleteModal);
    if (fullBtn) fullBtn.addEventListener("click", applyExtracurricularCompleteFullPotential);
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmExtracurricularCompleteModal();
        }
      });
    }
    document.addEventListener("keydown", (e) => {
      const el = qs("extracurricularCompleteModal");
      if (!el || el.hidden) return;
      if (e.key === "Escape") closeExtracurricularCompleteModal();
    });
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

    initCompletionTimeModal();
  }

  function initCompletionTimeModal() {
    const modalEl = qs("completionTimeModal");
    if (!modalEl || modalEl.dataset.bound === "1") return;
    modalEl.dataset.bound = "1";
    const closeBtn = qs("completionTimeModalClose");
    const cancelBtn = qs("completionTimeModalCancel");
    const confirmBtn = qs("completionTimeModalConfirm");
    const selectAll = qs("completionTimeSelectAll");
    const batchApply = qs("completionTimeBatchApply");
    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeCompletionTimeModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeCompletionTimeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeCompletionTimeModal);
    if (confirmBtn) confirmBtn.addEventListener("click", confirmCompletionTimeModal);
    if (selectAll) {
      selectAll.addEventListener("change", () => {
        const ctx = completionTimeModalCtx;
        if (!ctx || !ctx.rows) return;
        ctx.rows.forEach((row) => {
          if (!row._check) return;
          row._check.checked = selectAll.checked;
          if (row._check.parentElement) {
            row._check.parentElement.classList.toggle("is-batch-selected", selectAll.checked);
          }
        });
        selectAll.indeterminate = false;
      });
    }
    if (batchApply) batchApply.addEventListener("click", applyBatchCompletionTimeToSelected);
    document.addEventListener("keydown", (e) => {
      const el = qs("completionTimeModal");
      if (!el || el.hidden) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeCompletionTimeModal();
      }
    });
  }

  function openDebugFillMissingTimes() {
    if (typeof listMissingCompletionTimes !== "function") {
      alert("Fill missing times is unavailable.");
      return;
    }
    const missing = listMissingCompletionTimes();
    const report = qs("settingsDebugReport");
    if (!missing.length) {
      if (report) {
        report.textContent =
          "Fill missing times\n\nNo calendar completions without timestamps were found." +
          (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function"
            ? "\n\n" + formatConflictScanReport(scanDataConflicts())
            : "");
      }
      return;
    }
    openCompletionTimeModal({
      mode: "debug",
      rows: missing.map((row) => ({
        type: row.type,
        key: row.key,
        label: row.label,
        dateStr: row.dateStr,
      })),
    });
  }

  function openDebugResolveDuplicateTimes() {
    if (typeof listDuplicateCompletionTimestamps !== "function") {
      alert("Resolve duplicate times is unavailable.");
      return;
    }
    const groups = listDuplicateCompletionTimestamps();
    const report = qs("settingsDebugReport");
    if (!groups.length) {
      if (report) {
        report.textContent =
          "Resolve duplicate times\n\nNo tasks with multiple timestamps in the same cycle were found." +
          (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function"
            ? "\n\n" + formatConflictScanReport(scanDataConflicts())
            : "");
      }
      return;
    }
    openCompletionTimeModal({
      mode: "debug-dupes",
      groups: groups.map((g) => ({
        type: g.type,
        key: g.key,
        gameId: g.gameId,
        taskId: g.taskId,
        label: g.label,
        cycleStart: g.cycleStart,
        stamps: (g.stamps || []).map((s) => ({
          dateStr: s.dateStr,
          hour: s.hour,
          minute: s.minute,
        })),
      })),
    });
  }

  function openDebugFixTimesDates() {
    if (typeof listTimeDateFixQueue !== "function") {
      alert("Fix times & dates is unavailable.");
      return;
    }
    const queue = listTimeDateFixQueue();
    const report = qs("settingsDebugReport");
    if (!queue.length) {
      if (report) {
        report.textContent =
          "Fix times & dates\n\nNo time/date conflicts to fix." +
          (typeof scanDataConflicts === "function" && typeof formatConflictScanReport === "function"
            ? "\n\n" + formatConflictScanReport(scanDataConflicts())
            : "");
      }
      return;
    }
    openCompletionTimeModal({
      mode: "debug-time-date-fix",
      rows: queue.map((c) => ({
        kind: c.kind,
        type: c.type,
        key: c.key,
        gameId: c.gameId,
        taskId: c.taskId,
        label: (c.game || "") + " — " + (c.task || c.taskId || ""),
        cycleStart: c.cycleStart,
        message: c.message,
        dateStr: c.dateStr,
        hour: c.hour,
        minute: c.minute,
        unlockDate: c.unlockDate,
        unlockHour: c.unlockHour,
        unlockMinute: c.unlockMinute,
        stamps: c.stamps,
        suggestedDateStr: c.suggestedDateStr,
        suggestedHour: c.suggestedHour,
        suggestedMinute: c.suggestedMinute,
      })),
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
    syncShareCardCustomRow();
    renderShareCardGamePills();
    activateModalFocus(modalEl);
  }

  function closeSettingsModal() {
    const modalEl = qs("settingsModal");
    if (!modalEl) return;
    settingsModalOpen = false;
    modalEl.hidden = true;
    modalEl.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    deactivateModalFocus();
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
    const rgb = hexToRgb(hex || "#a855f7");
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
      swatch.style.background = preset.colors?.accent || "#a855f7";
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
    activateModalFocus(modal);
  }

  function closeSavePresetModal() {
    const modal = qs("savePresetModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      deactivateModalFocus();
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
    activateModalFocus(modal);
  }

  function closeDeletePresetModal() {
    const modal = qs("deletePresetModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      deactivateModalFocus();
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
    updateCompletionUndoUI();
    const schemaEl = qs("settingsDebugSchemaVersion");
    if (schemaEl) {
      schemaEl.textContent = String(Number(state.schemaVersion) || 0) + " / target " + (typeof SCHEMA_VERSION !== "undefined" ? SCHEMA_VERSION : 2);
    }
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

  function updateCompletionUndoUI() {
    const btn = document.getElementById("settingsUndoCompletionBtn");
    const hint = document.getElementById("settingsUndoCompletionHint");
    const can = typeof canUndoCompletion === "function" && canUndoCompletion();
    if (btn) {
      btn.disabled = !can;
      const label = typeof getCompletionUndoLabel === "function" ? getCompletionUndoLabel() : "";
      btn.title = can ? "Undo: " + label : "Nothing to undo";
    }
    if (hint) {
      hint.textContent = can
        ? "Next undo: " + (typeof getCompletionUndoLabel === "function" ? getCompletionUndoLabel() : "") + " (Ctrl+Z)"
        : "Ctrl+Z also undoes the last complete/incomplete (this session)";
    }
  }

  function downloadTextFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const shareCardSelected = new Set();
  /** Once the user Clears or toggles pills, empty selection must stay empty (do not re-select all). */
  let shareCardSelectionTouched = false;
  /** @type {Record<string, string>} gameId -> banner source | "none" */
  const shareCardHeroByGame = Object.create(null);

  function syncShareCardCustomRow() {
    const daysEl = qs("settingsShareCardDays");
    const row = qs("settingsShareCardCustomRow");
    if (!row) return;
    const custom = daysEl && daysEl.value === "custom";
    row.hidden = !custom;
    if (custom) {
      const today = typeof getDateStr === "function" ? getDateStr() : new Date().toISOString().slice(0, 10);
      const startEl = qs("settingsShareCardStart");
      const endEl = qs("settingsShareCardEnd");
      if (startEl && !startEl.value) {
        const d = new Date(today + "T12:00:00");
        d.setDate(d.getDate() - 89);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        startEl.value = y + "-" + m + "-" + day;
      }
      if (endEl && !endEl.value) endEl.value = today;
    }
  }

  function renderShareCardHeroPickers() {
    const host = qs("settingsShareCardHeroPick");
    const hint = qs("settingsShareCardHeroHint");
    if (!host) return;
    host.innerHTML = "";
    const games = (typeof getAllGames === "function" ? getAllGames() : []).filter((g) =>
      shareCardSelected.has(g.id)
    );
    let anyChoices = false;
    games.forEach((game) => {
      const choices =
        typeof collectShareCardBannerChoices === "function"
          ? collectShareCardBannerChoices(game)
          : [];
      if (!choices.length) {
        if (shareCardHeroByGame[game.id] && shareCardHeroByGame[game.id] !== "none") {
          delete shareCardHeroByGame[game.id];
        }
        return;
      }
      anyChoices = true;
      if (shareCardHeroByGame[game.id] == null) {
        shareCardHeroByGame[game.id] = choices[0].source;
      }
      const block = document.createElement("div");
      block.className = "settings-share-card-hero-game";
      const title = document.createElement("div");
      title.className = "settings-share-card-hero-game-title";
      title.textContent = (game.name || "Game") + " — hero banner";
      const row = document.createElement("div");
      row.className = "settings-share-card-hero-row";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", "Hero banner for " + (game.name || "game"));

      function addThumb(label, source, kind) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "settings-share-card-hero-thumb";
        const selected =
          source === "none"
            ? shareCardHeroByGame[game.id] === "none"
            : shareCardHeroByGame[game.id] === source;
        btn.setAttribute("aria-pressed", selected ? "true" : "false");
        if (selected) btn.classList.add("is-selected");
        btn.title = label;
        if (source === "none") {
          btn.classList.add("is-none");
          btn.textContent = "None";
        } else {
          const img = document.createElement("img");
          img.alt = "";
          img.loading = "lazy";
          img.src =
            typeof resolveStockBannerUrl === "function"
              ? resolveStockBannerUrl(source)
              : source;
          const cap = document.createElement("span");
          cap.textContent = label;
          btn.appendChild(img);
          btn.appendChild(cap);
          if (kind) btn.dataset.kind = kind;
        }
        btn.addEventListener("click", () => {
          shareCardHeroByGame[game.id] = source;
          renderShareCardHeroPickers();
        });
        row.appendChild(btn);
      }

      addThumb("None", "none");
      choices.forEach((c) => addThumb(c.label, c.source, c.kind));
      block.appendChild(title);
      block.appendChild(row);
      host.appendChild(block);
    });
    host.hidden = !anyChoices;
    if (hint) hint.hidden = !anyChoices;
  }

  function renderShareCardGamePills() {
    const wrap = qs("settingsShareCardGames");
    if (!wrap) return;
    const games = typeof getAllGames === "function" ? getAllGames() : [];
    // Default to all games only before the user has touched the selector.
    if (!shareCardSelectionTouched && shareCardSelected.size === 0 && games.length) {
      games.forEach((g) => shareCardSelected.add(g.id));
    }
    // Drop ids for games that no longer exist
    Array.from(shareCardSelected).forEach((id) => {
      if (!games.some((g) => g.id === id)) shareCardSelected.delete(id);
    });
    Object.keys(shareCardHeroByGame).forEach((id) => {
      if (!shareCardSelected.has(id)) delete shareCardHeroByGame[id];
    });
    wrap.innerHTML = "";
    if (!games.length) {
      const p = document.createElement("p");
      p.className = "settings-hint";
      p.textContent = "No games yet. Add one in Games first.";
      wrap.appendChild(p);
      renderShareCardHeroPickers();
      return;
    }
    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "timestamps-game-pill";
      btn.textContent = game.name;
      const on = shareCardSelected.has(game.id);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) btn.classList.add("filled");
      btn.addEventListener("click", () => {
        shareCardSelectionTouched = true;
        if (shareCardSelected.has(game.id)) shareCardSelected.delete(game.id);
        else shareCardSelected.add(game.id);
        renderShareCardGamePills();
      });
      wrap.appendChild(btn);
    });
    renderShareCardHeroPickers();
  }

  function getShareCardExportOpts() {
    const daysEl = qs("settingsShareCardDays");
    const mode = daysEl ? daysEl.value : "90";
    const opts = {
      gameIds: Array.from(shareCardSelected),
      heroByGameId: Object.assign({}, shareCardHeroByGame),
    };
    if (mode === "custom") {
      const startEl = qs("settingsShareCardStart");
      const endEl = qs("settingsShareCardEnd");
      opts.startStr = startEl && startEl.value;
      opts.endStr = endEl && endEl.value;
    } else {
      opts.days = Number(mode) || 90;
    }
    return opts;
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


    function setSettingsSectionDropdownOpen(open) {
      const trigger = qs("settingsSectionTrigger");
      const menu = qs("settingsSectionMenu");
      if (!trigger || !menu) return;
      const isOpen = !!open;
      trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      menu.hidden = !isOpen;
    }

    function syncSettingsSectionDropdown(section) {
      const labelEl = qs("settingsSectionTriggerLabel");
      const menu = qs("settingsSectionMenu");
      if (!menu) return;
      let label = "Appearance";
      menu.querySelectorAll('[role="option"]').forEach((opt) => {
        const on = opt.getAttribute("data-settings-section") === section;
        opt.setAttribute("aria-selected", on ? "true" : "false");
        if (on) label = (opt.textContent || "").trim() || label;
      });
      if (labelEl) labelEl.textContent = label;
    }

    function activateSettingsSection(section) {
      if (!section) return;
      document.querySelectorAll(".settings-nav-item[data-settings-section]").forEach((b) => {
        const on = b.getAttribute("data-settings-section") === section;
        b.classList.toggle("active", on);
        if (on) b.setAttribute("aria-current", "page");
        else b.removeAttribute("aria-current");
      });
      document.querySelectorAll(".settings-section").forEach((sectionEl) => {
        sectionEl.classList.remove("active");
      });
      const target = document.getElementById("settings-section-" + section);
      if (target) target.classList.add("active");
      syncSettingsSectionDropdown(section);
      setSettingsSectionDropdownOpen(false);
      if (section === "stock-assets") fillSettingsStockAssetsGallery();
      if (section === "my-images") fillSettingsMyImagesGallery();
    }

    document.querySelectorAll(".settings-nav-item[data-settings-section]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activateSettingsSection(btn.getAttribute("data-settings-section"));
      });
    });

    const settingsSectionTrigger = qs("settingsSectionTrigger");
    const settingsSectionMenu = qs("settingsSectionMenu");
    const settingsSectionDropdown = qs("settingsSectionDropdown");
    if (settingsSectionTrigger && settingsSectionMenu) {
      settingsSectionTrigger.addEventListener("click", (e) => {
        e.preventDefault();
        const open = settingsSectionTrigger.getAttribute("aria-expanded") === "true";
        setSettingsSectionDropdownOpen(!open);
      });
      settingsSectionMenu.querySelectorAll('[role="option"]').forEach((opt) => {
        opt.addEventListener("click", () => {
          activateSettingsSection(opt.getAttribute("data-settings-section"));
        });
      });
      document.addEventListener("click", (e) => {
        if (!settingsSectionDropdown || settingsSectionMenu.hidden) return;
        if (settingsSectionDropdown.contains(e.target)) return;
        setSettingsSectionDropdownOpen(false);
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && settingsSectionTrigger.getAttribute("aria-expanded") === "true") {
          setSettingsSectionDropdownOpen(false);
          settingsSectionTrigger.focus();
        }
      });
    }

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
      // display-only: active tab + chrome
      renderActiveTab();
    });
    const dateFormatEl = qs("settingsDateFormat");
    if (dateFormatEl) dateFormatEl.addEventListener("change", () => {
      state.dateFormat = dateFormatEl.value || "mdy";
      save();
      // display-only: active tab + chrome
      renderActiveTab();
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
      // display-only: active tab + chrome
      renderActiveTab();
    });
    const firstDayEl = qs("settingsFirstDayOfWeek");
    if (firstDayEl) firstDayEl.addEventListener("change", () => {
      state.firstDayOfWeek = parseInt(firstDayEl.value, 10) || 0;
      save();
      // display-only: active tab + chrome
      renderActiveTab();
    });
    const compactEl = qs("settingsCompactMode");
    if (compactEl) compactEl.addEventListener("change", () => {
      state.compactMode = compactEl.checked;
      applyCompactMode();
      save();
      // display-only: active tab + chrome
      renderActiveTab();
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

    let myImagesUploadKind = "banner";
    const myImagesFile = qs("settingsMyImagesFile");
    const myImagesBannerBtn = qs("settingsMyImagesUploadBannerBtn");
    const myImagesPfpBtn = qs("settingsMyImagesUploadPfpBtn");
    if (myImagesBannerBtn && myImagesFile) {
      myImagesBannerBtn.addEventListener("click", () => {
        myImagesUploadKind = "banner";
        myImagesFile.click();
      });
    }
    if (myImagesPfpBtn && myImagesFile) {
      myImagesPfpBtn.addEventListener("click", () => {
        myImagesUploadKind = "pfp";
        myImagesFile.click();
      });
    }
    if (myImagesFile) {
      myImagesFile.addEventListener("change", async () => {
        const file = myImagesFile.files && myImagesFile.files[0];
        myImagesFile.value = "";
        if (!file) return;
        try {
          const maxW = myImagesUploadKind === "pfp" ? 1200 : 1400;
          const dataUrl = await compressImageFileToDataUrl(file, { maxWidth: maxW, quality: 0.92 });
          const base = (file.name ? String(file.name).replace(/\.[^.]+$/, "") : "") || (myImagesUploadKind === "pfp" ? "Profile" : "Banner");
          const entry = addUserImage({ kind: myImagesUploadKind, label: base, dataUrl: dataUrl });
          if (!entry) throw new Error("Could not add image.");
          save();
          fillSettingsMyImagesGallery();
        } catch (err) {
          alert((err && err.message) || "Could not add that image.");
        }
      });
    }

    const exportBtn = qs("settingsExportBtn");
    if (exportBtn) exportBtn.addEventListener("click", () => {
      // Ensure debounced edits are flushed, then export the in-memory full payload (includes images).
      if (typeof flushPendingSave === "function") flushPendingSave();
      save({ immediate: true });
      const raw = JSON.stringify(buildSavePayload());
      if (!raw || raw === "{}") {
        alert("Nothing to export yet — local save is empty.");
        return;
      }
      const payload = JSON.stringify({ [STORAGE_KEY]: raw }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gacha-tracker-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    const exportMdBtn = qs("settingsExportSummaryMdBtn");
    if (exportMdBtn) exportMdBtn.addEventListener("click", () => {
      const md = buildExportSummaryMarkdown({ days: 90 });
      downloadTextFile("gacha-tracker-summary-" + new Date().toISOString().slice(0, 10) + ".md", md, "text/markdown;charset=utf-8");
    });
    const exportCsvBtn = qs("settingsExportSummaryCsvBtn");
    if (exportCsvBtn) exportCsvBtn.addEventListener("click", () => {
      const csv = buildExportSummaryCsv({ days: 90 });
      downloadTextFile("gacha-tracker-completions-" + new Date().toISOString().slice(0, 10) + ".csv", csv, "text/csv;charset=utf-8");
    });

    function bindSettingsCollapseToggle(toggleId, bodyId) {
      const toggleBtn = qs(toggleId);
      const bodyEl = qs(bodyId);
      if (!toggleBtn || !bodyEl) return;
      toggleBtn.addEventListener("click", () => {
        const open = toggleBtn.getAttribute("aria-expanded") !== "true";
        setTaskMenuSectionExpanded(toggleBtn, bodyEl, open);
      });
    }
    bindSettingsCollapseToggle("settingsShareCardToggle", "settingsShareCardBody");
    bindSettingsCollapseToggle("settingsSimulatedToggle", "settingsSimulatedBody");

    const shareDaysEl = qs("settingsShareCardDays");
    if (shareDaysEl) shareDaysEl.addEventListener("change", syncShareCardCustomRow);
    const shareAllBtn = qs("settingsShareCardSelectAllBtn");
    if (shareAllBtn) shareAllBtn.addEventListener("click", () => {
      const games = typeof getAllGames === "function" ? getAllGames() : [];
      shareCardSelectionTouched = true;
      shareCardSelected.clear();
      games.forEach((g) => shareCardSelected.add(g.id));
      renderShareCardGamePills();
    });
    const shareNoneBtn = qs("settingsShareCardSelectNoneBtn");
    if (shareNoneBtn) shareNoneBtn.addEventListener("click", () => {
      shareCardSelectionTouched = true;
      shareCardSelected.clear();
      renderShareCardGamePills();
    });
    const shareExportBtn = qs("settingsShareCardExportBtn");
    if (shareExportBtn) {
      shareExportBtn.addEventListener("click", async () => {
        if (typeof downloadShareCardPng !== "function") {
          alert("Share card export is unavailable.");
          return;
        }
        try {
          const result = await downloadShareCardPng(getShareCardExportOpts());
          if (!result.ok) alert(result.reason || "Could not export share card.");
        } catch (err) {
          alert((err && err.message) || "Could not export share card.");
        }
      });
    }

    async function updateShareCardPreview() {
      const wrap = qs("settingsShareCardPreview");
      const img = qs("settingsShareCardPreviewImg");
      const meta = qs("settingsShareCardPreviewMeta");
      if (!wrap || !img) return;
      if (typeof buildShareCardModel !== "function" || typeof renderShareCardCanvas !== "function") {
        wrap.hidden = false;
        if (meta) meta.textContent = "Preview unavailable.";
        return;
      }
      const model = buildShareCardModel(getShareCardExportOpts());
      if (!model.ok) {
        wrap.hidden = false;
        img.removeAttribute("src");
        if (meta) meta.textContent = model.reason || "Nothing to preview.";
        return;
      }
      let rendered;
      try {
        rendered = await renderShareCardCanvas(model);
      } catch (err) {
        wrap.hidden = false;
        img.removeAttribute("src");
        if (meta) meta.textContent = (err && err.message) || "Could not render preview.";
        return;
      }
      if (!rendered.ok) {
        wrap.hidden = false;
        img.removeAttribute("src");
        if (meta) meta.textContent = rendered.reason || "Could not render preview.";
        return;
      }
      img.src = rendered.canvas.toDataURL("image/png");
      wrap.hidden = false;
      if (meta) {
        meta.textContent =
          rendered.width +
          "×" +
          rendered.height +
          " · " +
          model.gameCount +
          " game" +
          (model.gameCount === 1 ? "" : "s");
      }
    }

    const sharePreviewBtn = qs("settingsShareCardPreviewBtn");
    if (sharePreviewBtn) sharePreviewBtn.addEventListener("click", () => {
      updateShareCardPreview();
    });

    const undoCompletionBtn = qs("settingsUndoCompletionBtn");
    if (undoCompletionBtn) undoCompletionBtn.addEventListener("click", () => {
      const result = undoLastCompletion();
      if (!result.ok) {
        alert(result.reason || "Nothing to undo");
        return;
      }
      syncSettingsUI();
    });
    const importInput = qs("settingsImportInput");
    if (importInput) importInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          let data = null;
          // Preferred backup shape: { "gacha-tracker": "<json string>" }
          if (parsed && typeof parsed[STORAGE_KEY] === "string") {
            data = JSON.parse(parsed[STORAGE_KEY]);
          } else if (parsed && parsed[STORAGE_KEY] && typeof parsed[STORAGE_KEY] === "object") {
            // Tolerate already-parsed inner payload
            data = parsed[STORAGE_KEY];
          } else if (parsed && Array.isArray(parsed.games)) {
            // Tolerate raw save payload without wrapper
            data = parsed;
          }
          if (!data || !Array.isArray(data.games)) {
            throw new Error("Invalid backup file (expected Export data JSON)");
          }
          const keys = Object.keys(data);
          keys.forEach((k) => {
            if (state[k] !== undefined && k !== "lastSimulationSnapshot") state[k] = data[k];
          });
          state.lastSimulationSnapshot = null;
          if (typeof clearCompletionUndoStack === "function") clearCompletionUndoStack();
          // Must flush before load(), or load() reloads the previous localStorage and undoes the import.
          save({ immediate: true });
          load();
          // bulk state change: full refresh
          renderAll();
          const report = qs("settingsDebugReport");
          if (report && typeof formatConflictScanReport === "function" && typeof scanDataConflicts === "function") {
            report.textContent =
              "Import complete. Suggested next step: open Debug and scan for conflicts.\n\n" +
              formatConflictScanReport(scanDataConflicts());
          }
          alert("Import complete. Your local backup is now loaded on this site.");
          closeSettingsModal();
        } catch (err) {
          alert("Failed to import: " + (err.message || "Invalid file"));
        }
        importInput.value = "";
      };
      reader.readAsText(file);
    });

    function showRepairResult(result) {
      const report = qs("settingsDebugReport");
      if (!report) return;
      const lines = [];
      lines.push("Repair mode: " + (result.mode || "safe"));
      lines.push("Actions:");
      (result.actions || []).forEach((a) => lines.push("  • " + a));
      lines.push("");
      lines.push("Before — " + result.before.counts.total + " conflict(s)");
      lines.push("After  — " + result.after.counts.total + " conflict(s)");
      const infoLeft = result.after.counts.info || 0;
      const warnLeft = (result.after.counts.warn || 0) + (result.after.counts.error || 0);
      if (infoLeft && !warnLeft) {
        lines.push("");
        lines.push(
          "Remaining items are [info] only (usually calendar marks without timestamps). Those are not auto-fixed."
        );
      }
      lines.push("");
      lines.push(formatConflictScanReport(result.after));
      report.textContent = lines.join("\n");
      syncSettingsUI();
    }

    const repairDataBtn = qs("settingsRepairDataBtn");
    if (repairDataBtn) repairDataBtn.addEventListener("click", () => {
      if (!confirm("Repair current data?\n\nThis rebuilds completion days from timestamps, clamps unlock windows, fills remaining cycle days, and syncs tallies.")) return;
      const result = runIntegrityRepair("safe");
      showRepairResult(result);
      alert(
        "Repair finished.\nConflicts: " +
          result.before.counts.total +
          " → " +
          result.after.counts.total +
          "\n\nSee Settings → Debug for the full report."
      );
    });

    const debugScanBtn = qs("settingsDebugScanBtn");
    if (debugScanBtn) debugScanBtn.addEventListener("click", () => {
      const report = qs("settingsDebugReport");
      if (report) report.textContent = formatConflictScanReport(scanDataConflicts());
      syncSettingsUI();
    });
    const debugRepairSafeBtn = qs("settingsDebugRepairSafeBtn");
    if (debugRepairSafeBtn) debugRepairSafeBtn.addEventListener("click", () => {
      if (!confirm("Run safe integrity repair on current data?")) return;
      showRepairResult(runIntegrityRepair("safe"));
    });
    const debugRepairTsBtn = qs("settingsDebugRepairTimestampsBtn");
    if (debugRepairTsBtn) debugRepairTsBtn.addEventListener("click", () => {
      if (!confirm("Repair preferring timestamps (rebuild early calendar marks from timestamps)?")) return;
      showRepairResult(runIntegrityRepair("prefer-timestamps"));
    });
    const debugRepairTalliesBtn = qs("settingsDebugRepairTalliesBtn");
    if (debugRepairTalliesBtn) debugRepairTalliesBtn.addEventListener("click", () => {
      if (!confirm("Rebuild all completed/attempted tallies from the calendar only?")) return;
      showRepairResult(runIntegrityRepair("tallies-only"));
    });
    const debugFillTimesBtn = qs("settingsDebugFillMissingTimesBtn");
    if (debugFillTimesBtn) debugFillTimesBtn.addEventListener("click", () => openDebugFillMissingTimes());
    const debugFixTimesDatesBtn = qs("settingsDebugFixTimesDatesBtn");
    if (debugFixTimesDatesBtn) debugFixTimesDatesBtn.addEventListener("click", () => openDebugFixTimesDates());

    function getSelectedCompactMonths() {
      const sel = qs("settingsCompactMonths");
      return sel ? Number(sel.value) || 12 : 12;
    }

    function formatCompactPreview(preview) {
      if (!preview) return "No preview.";
      const lines = [];
      lines.push("Compact preview");
      lines.push("Keep calendar after: " + preview.cutoffDateStr + " (drop on/before)");
      lines.push("Months: " + preview.months);
      lines.push("Calendar days to remove: " + preview.removedCalendarDays);
      lines.push("Completion marks to remove: " + preview.removedMarks);
      lines.push("Tallies: unchanged (archived baselines keep Sync correct)");
      if (preview.existingCutoff) lines.push("Existing archive cutoff: " + preview.existingCutoff);
      if (preview.removedCalendarDays === 0) lines.push("Nothing to compact for this range.");
      return lines.join("\n");
    }

    const compactPreviewBtn = qs("settingsCompactPreviewBtn");
    if (compactPreviewBtn) compactPreviewBtn.addEventListener("click", () => {
      const report = qs("settingsDebugReport");
      if (!report || typeof previewHistoryCompact !== "function") return;
      report.textContent = formatCompactPreview(previewHistoryCompact(getSelectedCompactMonths()));
    });

    const compactApplyBtn = qs("settingsCompactApplyBtn");
    if (compactApplyBtn) compactApplyBtn.addEventListener("click", () => {
      if (typeof previewHistoryCompact !== "function" || typeof applyHistoryCompact !== "function") return;
      const months = getSelectedCompactMonths();
      const preview = previewHistoryCompact(months);
      const report = qs("settingsDebugReport");
      if (report) report.textContent = formatCompactPreview(preview);
      if (preview.removedCalendarDays === 0) {
        alert("Nothing to compact for the selected range.");
        return;
      }
      if (
        !confirm(
          "Compact history older than " +
            months +
            " month(s)?\n\n" +
            "Remove " +
            preview.removedCalendarDays +
            " calendar day(s) and " +
            preview.removedMarks +
            " mark(s) on/before " +
            preview.cutoffDateStr +
            ".\nTallies stay the same; Sync will use archived baselines.\n\nContinue?"
        )
      ) {
        return;
      }
      if (confirm("Download a full JSON backup before compacting?\n\nOK = download then compact\nCancel = compact without new download")) {
        const data = JSON.stringify(buildSavePayload(), null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "gacha-tracker-pre-compact-" + new Date().toISOString().slice(0, 10) + ".json";
        a.click();
        URL.revokeObjectURL(a.href);
      }
      const result = applyHistoryCompact(months);
      if (report) {
        const lines = [formatCompactPreview(result.preview || preview)];
        if (result.ok) {
          lines.push("");
          lines.push("Applied. New archive cutoff: " + (result.historyCompact && result.historyCompact.cutoffDateStr));
        } else {
          lines.push("");
          lines.push("Not applied: " + (result.reason || "unknown"));
        }
        report.textContent = lines.join("\n");
      }
      if (result.ok) alert("History compacted. Tallies unchanged.");
      else alert(result.reason || "Compact did not run.");
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
    const skipTimeBtn = qs("settingsSkipTimeBtn");
    const skipHoursInput = qs("settingsSkipHoursInput");
    if (skipTimeBtn && skipHoursInput) skipTimeBtn.addEventListener("click", () => {
      skipTimeForward(Number(skipHoursInput.value) || 1);
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
        const top = typeof getTopOpenModal === "function" ? getTopOpenModal() : null;
        // Nested modals (Fill missing times, etc.) handle their own Escape.
        if (top && top.id && top.id !== "settingsModal" && top.id !== "clearDataModal") return;
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

  function emptyBannerView(aspect) {
    return {
      aspect: (Number.isFinite(aspect) && aspect > 0) ? aspect : 16 / 9,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    };
  }

  function emptyTaskBannerViews() {
    return {
      home: null,
      games: null,
      board: null,
    };
  }

  function defaultFitBannerView(stageAspect, imageAspect) {
    const aspect = (Number(stageAspect) > 0) ? Number(stageAspect) : 16 / 9;
    const imgAspect = (Number(imageAspect) > 0) ? Number(imageAspect) : aspect;
    if (imgAspect >= aspect) {
      const h = aspect / imgAspect;
      return { aspect: aspect, x: 0, y: (1 - h) / 2, w: 1, h: h };
    }
    const w = imgAspect / aspect;
    return { aspect: aspect, x: (1 - w) / 2, y: 0, w: w, h: 1 };
  }

  function cloneBannerView(view, fallbackAspect) {
    if (!view || typeof view !== "object") return emptyBannerView(fallbackAspect);
    return {
      aspect: (Number(view.aspect) > 0) ? Number(view.aspect) : (fallbackAspect || 16 / 9),
      x: Number.isFinite(Number(view.x)) ? Number(view.x) : 0,
      y: Number.isFinite(Number(view.y)) ? Number(view.y) : 0,
      w: Number(view.w) > 0 ? Number(view.w) : 1,
      h: Number(view.h) > 0 ? Number(view.h) : 1,
    };
  }

  function resolveTaskBannerSource(task) {
    if (!task) return null;
    if (task.bannerSourceImage) return task.bannerSourceImage;
    return task.bannerImage || task.bannerHomeImage || task.bannerGamesImage || null;
  }

  function resolveTaskBannerView(task, surface) {
    const s = surface || "board";
    const fallback = (TASK_BANNER_TARGETS[s] || TASK_BANNER_TARGETS.board).aspect;
    if (task && task.bannerViews && task.bannerViews[s]) {
      return cloneBannerView(task.bannerViews[s], fallback);
    }
    return null;
  }

  function loadTaskBannersFromTask(task) {
    const source = resolveTaskBannerSource(task);
    const views = emptyTaskBannerViews();
    if (task && task.bannerViews) {
      views.home = task.bannerViews.home ? cloneBannerView(task.bannerViews.home, TASK_BANNER_TARGETS.home.aspect) : null;
      views.games = task.bannerViews.games ? cloneBannerView(task.bannerViews.games, TASK_BANNER_TARGETS.games.aspect) : null;
      views.board = task.bannerViews.board ? cloneBannerView(task.bannerViews.board, TASK_BANNER_TARGETS.board.aspect) : null;
    }
    return { source: source, views: views };
  }

  function getActiveTaskBannerView() {
    const key = taskModal.bannerTarget || "board";
    if (!taskModal.bannerViews) taskModal.bannerViews = emptyTaskBannerViews();
    const fallback = (TASK_BANNER_TARGETS[key] || TASK_BANNER_TARGETS.board).aspect;
    if (!taskModal.bannerViews[key]) return null;
    return cloneBannerView(taskModal.bannerViews[key], fallback);
  }

  function applyTaskBannersToSavePayload(next) {
    if (taskModal.bannerSource) {
      next.bannerSourceImage = taskModal.bannerSource;
      const img = taskBannerCrop.sourceImg;
      const imageAspect = (img && img.naturalWidth > 0)
        ? (img.naturalWidth / img.naturalHeight)
        : 16 / 9;
      const ensureView = (key, fallbackAspect) => {
        if (taskModal.bannerViews && taskModal.bannerViews[key]) {
          return cloneBannerView(taskModal.bannerViews[key], fallbackAspect);
        }
        return defaultFitBannerView(fallbackAspect, imageAspect);
      };
      next.bannerViews = {
        home: ensureView("home", TASK_BANNER_TARGETS.home.aspect),
        games: ensureView("games", TASK_BANNER_TARGETS.games.aspect),
        board: ensureView("board", TASK_BANNER_TARGETS.board.aspect),
      };
    } else {
      next.bannerSourceImage = undefined;
      next.bannerViews = undefined;
    }
    next.bannerImage = undefined;
    next.bannerAspect = undefined;
    next.bannerShape = undefined;
    next.bannerHomeImage = undefined;
    next.bannerHomeAspect = undefined;
    next.bannerGamesImage = undefined;
    next.bannerGamesAspect = undefined;
  }

  function clearTaskBannerFieldsFromMerged(merged) {
    if (!taskModal.bannerSource) {
      delete merged.bannerSourceImage;
      delete merged.bannerViews;
    }
    delete merged.bannerImage;
    delete merged.bannerAspect;
    delete merged.bannerShape;
    delete merged.bannerHomeImage;
    delete merged.bannerHomeAspect;
    delete merged.bannerGamesImage;
    delete merged.bannerGamesAspect;
  }

  function resetTaskBannerCropState() {
    taskBannerCrop.sourceImg = null;
    taskBannerCrop.imgX = 0;
    taskBannerCrop.imgY = 0;
    taskBannerCrop.imgW = 0;
    taskBannerCrop.imgH = 0;
    taskBannerCrop.cropX = 0;
    taskBannerCrop.cropY = 0;
    taskBannerCrop.cropW = 0;
    taskBannerCrop.cropH = 0;
    taskBannerCrop.mode = null;
    taskBannerCrop.clear = false;
  }

  function getTaskBannerCropAspect() {
    const target = taskModal.bannerTarget || "board";
    if (target === "home" || target === "games") {
      return (TASK_BANNER_TARGETS[target] || TASK_BANNER_TARGETS.home).aspect;
    }
    if (taskBannerCrop.cropW > 0 && taskBannerCrop.cropH > 0) {
      return taskBannerCrop.cropW / taskBannerCrop.cropH;
    }
    if (taskModal.bannerViews && taskModal.bannerViews.board && Number(taskModal.bannerViews.board.aspect) > 0) {
      return Number(taskModal.bannerViews.board.aspect);
    }
    const img = taskBannerCrop.sourceImg;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      return img.naturalWidth / img.naturalHeight;
    }
    return 16 / 9;
  }

  function getTaskBannerImageAspect() {
    const img = taskBannerCrop.sourceImg;
    if (!img || !(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return 16 / 9;
    return img.naturalWidth / img.naturalHeight;
  }

  function softClampTaskBannerRect(kind) {
    const stage = TASK_BANNER_STAGE;
    const margin = 24;
    const isImg = kind === "img";
    let x = isImg ? taskBannerCrop.imgX : taskBannerCrop.cropX;
    let y = isImg ? taskBannerCrop.imgY : taskBannerCrop.cropY;
    const w = isImg ? taskBannerCrop.imgW : taskBannerCrop.cropW;
    const h = isImg ? taskBannerCrop.imgH : taskBannerCrop.cropH;
    if (x + w < margin) x = margin - w;
    if (y + h < margin) y = margin - h;
    if (x > stage.w - margin) x = stage.w - margin;
    if (y > stage.h - margin) y = stage.h - margin;
    if (isImg) {
      taskBannerCrop.imgX = x;
      taskBannerCrop.imgY = y;
    } else {
      taskBannerCrop.cropX = x;
      taskBannerCrop.cropY = y;
    }
  }

  function placeTaskBannerCropBox(aspect) {
    const stage = TASK_BANNER_STAGE;
    const a = (Number(aspect) > 0) ? Number(aspect) : 16 / 9;
    const pad = 28;
    const maxW = Math.max(40, stage.w - pad * 2);
    const maxH = Math.max(40, stage.h - pad * 2);
    let cropW;
    let cropH;
    if (maxW / maxH > a) {
      cropH = maxH * 0.82;
      cropW = cropH * a;
    } else {
      cropW = maxW * 0.82;
      cropH = cropW / a;
    }
    if (cropW < TASK_BANNER_CROP_MIN) {
      cropW = TASK_BANNER_CROP_MIN;
      cropH = cropW / a;
    }
    if (cropH < TASK_BANNER_CROP_MIN) {
      cropH = TASK_BANNER_CROP_MIN;
      cropW = cropH * a;
    }
    taskBannerCrop.cropW = cropW;
    taskBannerCrop.cropH = cropH;
    taskBannerCrop.cropX = (stage.w - cropW) / 2;
    taskBannerCrop.cropY = (stage.h - cropH) / 2;
  }

  function fitTaskBannerImageToStage() {
    const img = taskBannerCrop.sourceImg;
    if (!img) return;
    const stage = TASK_BANNER_STAGE;
    const nw = img.naturalWidth || 1;
    const nh = img.naturalHeight || 1;
    const scale = Math.min(stage.w / nw, stage.h / nh) * 0.92;
    taskBannerCrop.imgW = nw * scale;
    taskBannerCrop.imgH = nh * scale;
    taskBannerCrop.imgX = (stage.w - taskBannerCrop.imgW) / 2;
    taskBannerCrop.imgY = (stage.h - taskBannerCrop.imgH) / 2;
    placeTaskBannerCropBox(getTaskBannerCropAspect());
  }

  function applyBannerViewToStage(view) {
    if (!view || !(Number(view.w) > 0) || !(Number(view.h) > 0)) {
      fitTaskBannerImageToStage();
      return;
    }
    const aspect = (Number(view.aspect) > 0)
      ? Number(view.aspect)
      : getTaskBannerCropAspect();
    placeTaskBannerCropBox(aspect);
    const v = cloneBannerView(view, aspect);
    taskBannerCrop.imgX = taskBannerCrop.cropX + v.x * taskBannerCrop.cropW;
    taskBannerCrop.imgY = taskBannerCrop.cropY + v.y * taskBannerCrop.cropH;
    taskBannerCrop.imgW = Math.max(0.001, v.w) * taskBannerCrop.cropW;
    taskBannerCrop.imgH = Math.max(0.001, v.h) * taskBannerCrop.cropH;
    // Keep natural image aspect (no stretch)
    const nat = getTaskBannerImageAspect();
    const midX = taskBannerCrop.imgX + taskBannerCrop.imgW / 2;
    const midY = taskBannerCrop.imgY + taskBannerCrop.imgH / 2;
    if (taskBannerCrop.imgW / Math.max(0.001, taskBannerCrop.imgH) > nat) {
      taskBannerCrop.imgH = taskBannerCrop.imgW / nat;
    } else {
      taskBannerCrop.imgW = taskBannerCrop.imgH * nat;
    }
    taskBannerCrop.imgX = midX - taskBannerCrop.imgW / 2;
    taskBannerCrop.imgY = midY - taskBannerCrop.imgH / 2;
  }

  function captureBannerViewFromStage() {
    const cw = Math.max(0.001, taskBannerCrop.cropW);
    const ch = Math.max(0.001, taskBannerCrop.cropH);
    return {
      aspect: cw / ch,
      x: (taskBannerCrop.imgX - taskBannerCrop.cropX) / cw,
      y: (taskBannerCrop.imgY - taskBannerCrop.cropY) / ch,
      w: taskBannerCrop.imgW / cw,
      h: taskBannerCrop.imgH / ch,
    };
  }

  function renderBannerViewDataUrl(img, view, maxLong) {
    if (!img || !view) return null;
    const aspect = (Number(view.aspect) > 0) ? Number(view.aspect) : 16 / 9;
    const long = maxLong || 720;
    let finalW;
    let finalH;
    if (aspect >= 1) {
      finalW = long;
      finalH = Math.max(1, Math.round(long / aspect));
    } else {
      finalH = long;
      finalW = Math.max(1, Math.round(long * aspect));
    }
    const out = document.createElement("canvas");
    out.width = finalW;
    out.height = finalH;
    const ctx = out.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, finalW, finalH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      Number(view.x || 0) * finalW,
      Number(view.y || 0) * finalH,
      Math.max(0.001, Number(view.w || 1)) * finalW,
      Math.max(0.001, Number(view.h || 1)) * finalH
    );
    return out.toDataURL("image/jpeg", 0.82);
  }

  function syncTaskBannerEditorFrames() {
    const imgFrame = bannerEl("imgFrame");
    const cropFrame = bannerEl("cropFrame");
    const has = !!taskBannerCrop.sourceImg && !taskBannerCrop.clear;
    [imgFrame, cropFrame].forEach((frame) => {
      if (!frame) return;
      frame.hidden = !has;
      frame.setAttribute("aria-hidden", has ? "false" : "true");
    });
    if (!has) return;
    if (imgFrame) {
      imgFrame.style.left = taskBannerCrop.imgX + "px";
      imgFrame.style.top = taskBannerCrop.imgY + "px";
      imgFrame.style.width = taskBannerCrop.imgW + "px";
      imgFrame.style.height = taskBannerCrop.imgH + "px";
    }
    if (cropFrame) {
      cropFrame.style.left = taskBannerCrop.cropX + "px";
      cropFrame.style.top = taskBannerCrop.cropY + "px";
      cropFrame.style.width = taskBannerCrop.cropW + "px";
      cropFrame.style.height = taskBannerCrop.cropH + "px";
    }
  }

  function syncTaskBannerTargetButtons() {
    const active = taskModal.bannerTarget || "board";
    const hasSource = !!taskModal.bannerSource;
    bannerRootEl().querySelectorAll(".task-banner-target-btn").forEach((btn) => {
      const on = btn.dataset.bannerTarget === active;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      const key = btn.dataset.bannerTarget;
      const preview = taskModal.bannerPreviewUrls && taskModal.bannerPreviewUrls[key];
      btn.classList.toggle("has-image", !!(hasSource && preview));
      const media = btn.querySelector(".task-banner-target-media");
      if (media) {
        if (hasSource && preview) {
          media.style.backgroundImage = "url(\"" + String(preview).replace(/"/g, "%22") + "\")";
        } else if (hasSource) {
          const src =
            typeof resolveStockBannerUrl === "function"
              ? resolveStockBannerUrl(taskModal.bannerSource)
              : taskModal.bannerSource;
          media.style.backgroundImage = "url(\"" + String(src).replace(/"/g, "%22") + "\")";
        } else {
          media.style.backgroundImage = "";
        }
      }
    });
  }

  function resizeTaskBannerCropStage() {
    const canvas = bannerEl("canvas");
    const wrap = bannerEl("wrap");
    if (!canvas || !wrap) return;
    const prevW = TASK_BANNER_STAGE.w || 1;
    const prevH = TASK_BANNER_STAGE.h || 1;
    const cssW = Math.max(160, Math.round(wrap.clientWidth || (wrap.parentElement && wrap.parentElement.clientWidth) || 480));
    // Fixed workspace (not tied to crop aspect) so image + crop can both move/scale
    const cssH = Math.max(220, Math.min(420, Math.round(cssW * 9 / 16)));
    if (cssW === TASK_BANNER_STAGE.w && cssH === TASK_BANNER_STAGE.h && canvas.width === cssW && canvas.height === cssH) {
      return;
    }
    TASK_BANNER_STAGE.w = cssW;
    TASK_BANNER_STAGE.h = cssH;
    canvas.width = cssW;
    canvas.height = cssH;
    wrap.style.height = cssH + "px";
    if (taskBannerCrop.sourceImg && prevW > 0 && prevH > 0) {
      const sx = cssW / prevW;
      const sy = cssH / prevH;
      taskBannerCrop.imgX *= sx;
      taskBannerCrop.imgY *= sy;
      taskBannerCrop.imgW *= sx;
      taskBannerCrop.imgH *= sy;
      taskBannerCrop.cropX *= sx;
      taskBannerCrop.cropY *= sy;
      taskBannerCrop.cropW *= sx;
      taskBannerCrop.cropH *= sy;
    }
  }

  function drawTaskBannerCrop() {
    const canvas = bannerEl("canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    const img = taskBannerCrop.sourceImg;
    if (!img || taskBannerCrop.clear) {
      syncTaskBannerEditorFrames();
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      taskBannerCrop.imgX,
      taskBannerCrop.imgY,
      taskBannerCrop.imgW,
      taskBannerCrop.imgH
    );
    syncTaskBannerEditorFrames();
  }

  function commitTaskBannerCrop() {
    const key = taskModal.bannerTarget || "board";
    if (!taskModal.bannerViews) taskModal.bannerViews = emptyTaskBannerViews();
    if (!taskModal.bannerPreviewUrls) {
      taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    }
    if (taskBannerCrop.clear || !taskBannerCrop.sourceImg) {
      taskModal.bannerSource = null;
      taskModal.bannerViews = emptyTaskBannerViews();
      taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    } else {
      // Keep stock paths / userimg: refs; only adopt img.src for raw data/blob uploads.
      const prev = String(taskModal.bannerSource || "");
      const isRef =
        (typeof isUserImageRef === "function" && isUserImageRef(prev)) ||
        (/^assets\//i.test(prev) && prev.indexOf("data:") !== 0);
      if (!isRef) {
        taskModal.bannerSource = taskBannerCrop.sourceImg.src || taskModal.bannerSource;
      }
      const view = captureBannerViewFromStage();
      if (key === "home" || key === "games") {
        view.aspect = TASK_BANNER_TARGETS[key].aspect;
      }
      taskModal.bannerViews[key] = view;
      const preview = renderBannerViewDataUrl(taskBannerCrop.sourceImg, view, 360);
      if (preview) taskModal.bannerPreviewUrls[key] = preview;
    }
    syncTaskBannerPreview();
    syncTaskBannerTargetButtons();
  }

  function loadTaskBannerSourceFromUrl(url, opts) {
    const resetViews = !(opts && opts.keepViews === true);
    const storedUrl = String(url || "");
    const loadUrl = typeof resolveStockBannerUrl === "function" ? resolveStockBannerUrl(storedUrl) : storedUrl;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        taskBannerCrop.sourceImg = img;
        taskBannerCrop.clear = false;
        taskModal.bannerSource = storedUrl;
        if (resetViews) {
          taskModal.bannerViews = emptyTaskBannerViews();
          taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
        }
        resizeTaskBannerCropStage();
        if (resetViews) fitTaskBannerImageToStage();
        else applyBannerViewToStage(getActiveTaskBannerView());
        drawTaskBannerCrop();
        commitTaskBannerCrop();
        resolve();
      };
      img.onerror = () => reject(new Error("Could not load image."));
      img.src = loadUrl;
    });
  }

  function getTaskBannerPreviewTaskStub() {
    const nameInput = bannerEl("nameInput");
    const label = (nameInput && nameInput.value.trim()) || "Task name";
    return {
      label: label,
      bannerSourceImage: taskModal.bannerSource || null,
      bannerViews: {
        home: cloneBannerView(taskModal.bannerViews && taskModal.bannerViews.home, TASK_BANNER_TARGETS.home.aspect),
        games: cloneBannerView(taskModal.bannerViews && taskModal.bannerViews.games, TASK_BANNER_TARGETS.games.aspect),
        board: cloneBannerView(taskModal.bannerViews && taskModal.bannerViews.board, TASK_BANNER_TARGETS.board.aspect),
      },
    };
  }

  function getTaskBannerPreviewGame() {
    if (activeBannerUiKey === "extra") {
      const gameSelect = qs("extracurricularTaskGame");
      const gameId = (gameSelect && gameSelect.value) || taskModal.gameId;
      return getGame(gameId) || { name: (gameSelect && gameSelect.selectedOptions && gameSelect.selectedOptions[0] && gameSelect.selectedOptions[0].textContent) || "Game", iconImage: null };
    }
    return getGame(taskModal.gameId) || { name: "Game", iconImage: null };
  }

  function getTaskBannerPreviewPotential() {
    if (activeBannerUiKey === "extra") {
      const potInput = qs("extracurricularTaskCurrency");
      const n = potInput ? Number(potInput.value) : 0;
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    const type = taskModal.taskType;
    const game = getTaskBannerPreviewGame();
    const taskId = taskModal.taskId;
    if (type === "weeklies" && game && taskId) {
      const task = (game.weeklies || []).find((t) => (t.id || t.label) === taskId);
      if (task && typeof getWeeklyPotential === "function") return getWeeklyPotential(task);
    }
    if (type === "endgame" && game && taskId) {
      const task = (game.endgame || []).find((t) => (t.id || t.label) === taskId);
      if (task && typeof getEndgamePotential === "function") return getEndgamePotential(task);
    }
    const potInput = qs("taskPotential") || qs("taskCurrency") || qs("endgameCurrencyMax");
    const n = potInput ? Number(potInput.value) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function buildGamesBannerPreviewCard(task, pot, opts) {
    const mobile = !!(opts && opts.mobile);
    const row = document.createElement("div");
    row.className = "task-item task-item-with-changer games-task-card task-banner-preview-games "
      + (mobile ? "task-banner-preview-games-mobile" : "task-banner-preview-games-desktop");
    appendGamesTaskSideMedia(row, task, { surface: mobile ? "home" : "games" });
    const main = document.createElement("div");
    main.className = "games-task-main";
    const top = document.createElement("div");
    top.className = "task-item-top games-task-top";
    const titleLine = document.createElement("div");
    titleLine.className = "games-task-title-line";
    const label = document.createElement("span");
    label.className = "task-label";
    label.textContent = task.label;
    titleLine.appendChild(label);
    top.appendChild(titleLine);
    main.appendChild(top);
    if (pot > 0) {
      const bottom = document.createElement("div");
      bottom.className = "games-task-bottom";
      const right = document.createElement("div");
      right.className = "games-task-bottom-right";
      const potSpan = document.createElement("span");
      potSpan.className = "games-task-potential";
      potSpan.textContent = "Potential: " + pot;
      right.appendChild(potSpan);
      bottom.appendChild(right);
      main.appendChild(bottom);
    }
    row.appendChild(main);
    return row;
  }

  function syncTaskBannerPreview() {
    const wrap = bannerEl("previewWrap");
    const cardHost = bannerEl("cardPreview");
    const clearBtn = bannerEl("clearBtn");
    const saveLibBtn = bannerEl("saveLibraryBtn");
    const has = !!taskModal.bannerSource;
    if (clearBtn) clearBtn.hidden = !(has || taskBannerCrop.sourceImg);
    if (saveLibBtn) {
      const src = String(taskModal.bannerSource || "");
      const alreadyLibrary = typeof isUserImageRef === "function" && isUserImageRef(src);
      const isStockPath = /^assets\//i.test(src);
      saveLibBtn.hidden = !(has && taskBannerCrop.sourceImg && !alreadyLibrary && !isStockPath);
    }
    if (wrap) wrap.hidden = !has;
    if (!cardHost) return;
    cardHost.innerHTML = "";
    if (!has) return;

    const target = taskModal.bannerTarget || "board";
    const task = getTaskBannerPreviewTaskStub();
    const game = getTaskBannerPreviewGame();
    const pot = getTaskBannerPreviewPotential();
    const outerLabel = wrap && wrap.querySelector(":scope > .task-banner-preview-label");

    if (target === "games") {
      if (outerLabel) outerLabel.hidden = true;
      cardHost.classList.add("task-banner-card-preview-dual");
      const stack = document.createElement("div");
      stack.className = "task-banner-preview-stack";

      const deskBlock = document.createElement("div");
      deskBlock.className = "task-banner-preview-block";
      const deskLabel = document.createElement("span");
      deskLabel.className = "task-banner-preview-label";
      deskLabel.textContent = "Desktop";
      deskBlock.appendChild(deskLabel);
      deskBlock.appendChild(buildGamesBannerPreviewCard(task, pot, { mobile: false }));

      const mobBlock = document.createElement("div");
      mobBlock.className = "task-banner-preview-block";
      const mobHead = document.createElement("div");
      mobHead.className = "task-banner-preview-heading";
      const mobLabel = document.createElement("span");
      mobLabel.className = "task-banner-preview-label";
      mobLabel.textContent = "Mobile / hamburger";
      const mobNote = document.createElement("span");
      mobNote.className = "task-banner-preview-note";
      mobNote.textContent = "Uses the Home image setting (not Games) in hamburger / compressed mode.";
      mobHead.appendChild(mobLabel);
      mobHead.appendChild(mobNote);
      mobBlock.appendChild(mobHead);
      mobBlock.appendChild(buildGamesBannerPreviewCard(task, pot, { mobile: true }));

      stack.appendChild(deskBlock);
      stack.appendChild(mobBlock);
      cardHost.appendChild(stack);
      return;
    }

    if (outerLabel) {
      outerLabel.hidden = false;
      outerLabel.textContent = "Preview";
    }
    cardHost.classList.remove("task-banner-card-preview-dual");

    const card = document.createElement("div");
    card.className = "task-item task-card-knot task-banner-preview-card";
    appendTaskCardMedia(card, task, game, { surface: target === "home" ? "home" : "board" });
    const body = appendTaskCardBody(card);

    const top = document.createElement("div");
    top.className = "task-top task-card-title-row";
    const titleCol = document.createElement("div");
    titleCol.className = "task-game-heading-text";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label;
    titleCol.appendChild(span);
    if (pot > 0) {
      const potSpan = document.createElement("span");
      potSpan.className = "task-potential";
      potSpan.textContent = "Potential: " + pot;
      titleCol.appendChild(potSpan);
    }
    top.appendChild(titleCol);
    body.appendChild(top);

    const snippet = document.createElement("p");
    snippet.className = "task-card-snippet";
    snippet.textContent = "Incomplete · Preview";
    body.appendChild(snippet);

    const sub = document.createElement("div");
    sub.className = "task-subrows";
    const statusRow = document.createElement("div");
    statusRow.className = "task-subrow";
    const statusLeft = document.createElement("div");
    statusLeft.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    check.disabled = true;
    check.setAttribute("aria-hidden", "true");
    const statusLabel = document.createElement("span");
    statusLabel.innerHTML = "<strong>Status:</strong> Incomplete";
    statusLeft.appendChild(check);
    statusLeft.appendChild(statusLabel);
    statusRow.appendChild(statusLeft);
    sub.appendChild(statusRow);

    const remainingRow = document.createElement("div");
    remainingRow.className = "task-subrow";
    const remLeft = document.createElement("div");
    remLeft.className = "left";
    remLeft.innerHTML = "<strong>Time remaining:</strong>";
    remainingRow.appendChild(remLeft);
    const remVal = document.createElement("span");
    remVal.className = "task-remaining";
    remVal.textContent = "—";
    remainingRow.appendChild(remVal);
    sub.appendChild(remainingRow);
    body.appendChild(sub);

    cardHost.appendChild(card);
  }

  async function setTaskBannerFromFile(file) {
    try {
      const dataUrl = await compressImageFileToDataUrl(file, { maxWidth: 1400, quality: 0.92 });
      let source = dataUrl;
      if (typeof addUserImage === "function") {
        const base = (file && file.name ? String(file.name).replace(/\.[^.]+$/, "") : "") || "Banner";
        const entry = addUserImage({ kind: "banner", label: base, dataUrl: dataUrl });
        if (entry && entry.id && typeof makeUserImageRef === "function") {
          source = makeUserImageRef(entry.id);
          if (typeof save === "function") save();
        }
      }
      await loadTaskBannerSourceFromUrl(source);
    } catch (err) {
      alert((err && err.message) || "Could not use that image.");
    }
  }

  function saveCurrentBannerToUserLibrary() {
    if (!taskBannerCrop.sourceImg || !taskModal.bannerSource) {
      alert("Load an image first.");
      return;
    }
    if (typeof isUserImageRef === "function" && isUserImageRef(taskModal.bannerSource)) {
      alert("This image is already in My Images.");
      return;
    }
    const canvas = document.createElement("canvas");
    const img = taskBannerCrop.sourceImg;
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    if (!canvas.width || !canvas.height) {
      alert("Could not read that image.");
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    let dataUrl = "";
    try {
      dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    } catch (_) {
      alert("Could not save that image.");
      return;
    }
    const label = window.prompt("Name for My Images", "Banner") || "Banner";
    const entry = addUserImage({ kind: "banner", label: label, dataUrl: dataUrl });
    if (!entry) {
      alert("Could not add to My Images.");
      return;
    }
    taskModal.bannerSource = makeUserImageRef(entry.id);
    save();
    syncTaskBannerPreview();
    alert("Saved to My Images. This task now references the library copy.");
  }

  function appendPickerSection(host, title, assets, onPick) {
    if (!assets || !assets.length) return;
    const heading = document.createElement("h4");
    heading.className = "stock-banner-picker-heading";
    heading.textContent = title;
    host.appendChild(heading);
    const row = document.createElement("div");
    row.className = "stock-banner-picker-row";
    assets.forEach((asset) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stock-banner-picker-card";
      if (asset.id) btn.setAttribute("data-stock-id", asset.id);
      btn.setAttribute("aria-label", "Use image " + (asset.label || asset.id || ""));
      const img = document.createElement("img");
      img.src = asset.previewUrl || resolveStockBannerUrl(asset.path || asset.ref || "");
      img.alt = "";
      img.loading = "lazy";
      const cap = document.createElement("span");
      cap.className = "stock-banner-picker-label";
      cap.textContent = asset.label || asset.id || "Image";
      btn.appendChild(img);
      btn.appendChild(cap);
      btn.addEventListener("click", () => onPick(asset));
      row.appendChild(btn);
    });
    host.appendChild(row);
  }

  function fillStockBannerPickerGrid(host) {
    if (!host) return;
    host.innerHTML = "";
    const mode = (stockPickerContext && stockPickerContext.mode) || "banner";
    const wantBanner = mode === "banner" || mode === "all";
    const wantPfp = mode === "pfp" || mode === "all";

    const userEntries = typeof getUserImageLibrary === "function" ? getUserImageLibrary() : [];
    const userAssets = userEntries
      .filter((e) => e && e.dataUrl && ((wantBanner && e.kind !== "pfp") || (wantPfp && e.kind === "pfp") || mode === "all"))
      .map((e) => ({
        id: e.id,
        label: e.label || e.id,
        ref: makeUserImageRef(e.id),
        path: makeUserImageRef(e.id),
        previewUrl: e.dataUrl,
        user: true,
        kind: e.kind,
      }));

    if (userAssets.length) {
      appendPickerSection(host, "My Images", userAssets, applyPickerImageAsset);
    } else {
      const hint = document.createElement("p");
      hint.className = "settings-hint";
      hint.textContent = "No personal images yet — upload from Settings → My Images, or Choose image (banners save to My Images automatically).";
      host.appendChild(hint);
    }

    if (wantBanner) {
      const assets = typeof getStockBannerAssets === "function" ? getStockBannerAssets() : [];
      const byKind = { story: [], event: [], other: [] };
      assets.forEach((a) => {
        const k = a.kind === "story" || a.kind === "event" ? a.kind : "other";
        byKind[k].push(Object.assign({ path: a.path, label: a.label, id: a.id }, a));
      });
      [["story", "Stock · Story"], ["event", "Stock · Event"], ["other", "Stock · Other"]].forEach(([kind, title]) => {
        appendPickerSection(host, title, byKind[kind], applyPickerImageAsset);
      });
    }
    if (wantPfp) {
      const pfps = typeof getStockPfpAssets === "function" ? getStockPfpAssets() : [];
      appendPickerSection(
        host,
        "Stock · Profile pictures",
        pfps.map((a) => Object.assign({}, a, { path: a.path })),
        applyPickerImageAsset
      );
    }
  }

  function appendStockAssetCard(grid, asset, kindLabel) {
    const card = document.createElement("figure");
    card.className = "stock-assets-card";
    const img = document.createElement("img");
    img.src = resolveStockBannerUrl(asset.path);
    img.alt = asset.label;
    img.loading = "lazy";
    const fig = document.createElement("figcaption");
    fig.textContent = kindLabel + " · " + asset.label;
    const path = document.createElement("code");
    path.className = "stock-assets-path";
    path.textContent = asset.path;
    card.appendChild(img);
    card.appendChild(fig);
    card.appendChild(path);
    grid.appendChild(card);
  }

  function fillSettingsMyImagesGallery() {
    const host = qs("settingsMyImagesList");
    if (!host) return;
    host.innerHTML = "";
    const list = typeof getUserImageLibrary === "function" ? getUserImageLibrary() : [];
    if (!list.length) {
      host.innerHTML = '<p class="settings-hint">No personal images yet. Add a banner or profile picture above.</p>';
      return;
    }
    const banners = list.filter((e) => e && e.kind !== "pfp");
    const pfps = list.filter((e) => e && e.kind === "pfp");

    function renderBlock(title, entries, galleryClass) {
      if (!entries.length) return;
      const block = document.createElement("div");
      block.className = "stock-assets-block";
      const heading = document.createElement("h5");
      heading.className = "stock-assets-section-heading";
      heading.textContent = title + " (" + entries.length + ")";
      const grid = document.createElement("div");
      grid.className = "stock-assets-gallery" + (galleryClass ? " " + galleryClass : "");
      entries.forEach((entry) => {
        const card = document.createElement("figure");
        card.className = "stock-assets-card my-images-card";
        const img = document.createElement("img");
        img.src = entry.dataUrl || "";
        img.alt = entry.label || entry.id;
        img.loading = "lazy";
        const fig = document.createElement("figcaption");
        fig.textContent = entry.label || entry.id;
        const ref = document.createElement("code");
        ref.className = "stock-assets-path";
        ref.textContent = makeUserImageRef(entry.id);
        const actions = document.createElement("div");
        actions.className = "my-images-card-actions";
        const renameBtn = document.createElement("button");
        renameBtn.type = "button";
        renameBtn.className = "btn btn-ghost btn-sm";
        renameBtn.textContent = "Rename";
        renameBtn.addEventListener("click", () => {
          const next = window.prompt("Rename image", entry.label || "");
          if (next == null) return;
          updateUserImageMeta(entry.id, { label: next });
          save();
          fillSettingsMyImagesGallery();
        });
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn btn-ghost btn-sm";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", () => {
          if (!window.confirm("Remove “" + (entry.label || entry.id) + "” from My Images? Tasks still using it will lose the picture until you pick another.")) return;
          removeUserImage(entry.id);
          save();
          fillSettingsMyImagesGallery();
        });
        actions.appendChild(renameBtn);
        actions.appendChild(delBtn);
        card.appendChild(img);
        card.appendChild(fig);
        card.appendChild(ref);
        card.appendChild(actions);
        grid.appendChild(card);
      });
      block.appendChild(heading);
      block.appendChild(grid);
      host.appendChild(block);
    }

    renderBlock("Banners", banners, "");
    if (banners.length && pfps.length) {
      const divider = document.createElement("hr");
      divider.className = "stock-assets-divider";
      host.appendChild(divider);
    }
    renderBlock("Profile pictures", pfps, "stock-assets-gallery--pfp");
  }

  function fillSettingsStockAssetsGallery() {
    const host = qs("settingsStockAssetsList");
    if (!host) return;
    host.innerHTML = "";
    const banners = typeof getStockBannerAssets === "function" ? getStockBannerAssets() : [];
    const pfps = typeof getStockPfpAssets === "function" ? getStockPfpAssets() : [];
    if (!banners.length && !pfps.length) {
      host.innerHTML = '<p class="settings-hint">No stock assets found.</p>';
      return;
    }

    if (banners.length) {
      const block = document.createElement("div");
      block.className = "stock-assets-block";
      const heading = document.createElement("h5");
      heading.className = "stock-assets-section-heading";
      heading.textContent = "Banners";
      const grid = document.createElement("div");
      grid.className = "stock-assets-gallery";
      banners.forEach((asset) => {
        const kind =
          asset.kind === "story" ? "Story" : asset.kind === "event" ? "Event" : "Banner";
        appendStockAssetCard(grid, asset, kind);
      });
      block.appendChild(heading);
      block.appendChild(grid);
      host.appendChild(block);
    }

    if (pfps.length) {
      if (banners.length) {
        const divider = document.createElement("hr");
        divider.className = "stock-assets-divider";
        divider.setAttribute("aria-hidden", "true");
        host.appendChild(divider);
      }
      const block = document.createElement("div");
      block.className = "stock-assets-block";
      const heading = document.createElement("h5");
      heading.className = "stock-assets-section-heading";
      heading.id = "settings-stock-pfps-heading";
      heading.textContent = "Profile pictures";
      const grid = document.createElement("div");
      grid.className = "stock-assets-gallery stock-assets-gallery--pfp";
      grid.setAttribute("aria-labelledby", "settings-stock-pfps-heading");
      pfps.forEach((asset) => appendStockAssetCard(grid, asset, "PFP"));
      block.appendChild(heading);
      block.appendChild(grid);
      host.appendChild(block);
    }
  }

  let stockPickerContext = { mode: "banner", uiKey: "task", onPick: null };

  function closeStockBannerPicker() {
    const el = qs("stockBannerPickerModal");
    if (!el || el.hidden) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    if (typeof deactivateModalFocus === "function") deactivateModalFocus(el);
    stockPickerContext = { mode: "banner", uiKey: "task", onPick: null };
  }

  function openStockBannerPicker(uiKey) {
    stockPickerContext = { mode: "banner", uiKey: TASK_BANNER_UI[uiKey] ? uiKey : "task", onPick: null };
    const el = qs("stockBannerPickerModal");
    const grid = qs("stockBannerPickerGrid");
    const title = qs("stockBannerPickerModalTitle");
    const desc = qs("stockBannerPickerDesc");
    if (!el || !grid) return;
    if (title) title.textContent = "Image library";
    if (desc) desc.textContent = "Pick one of your images or a bundled stock banner. You can still crop after applying.";
    fillStockBannerPickerGrid(grid);
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    if (typeof activateModalFocus === "function") activateModalFocus(el);
    const closeBtn = qs("stockBannerPickerModalClose");
    if (closeBtn) closeBtn.focus();
  }

  function openImageLibraryPicker(opts) {
    const o = opts || {};
    stockPickerContext = {
      mode: o.mode === "pfp" || o.mode === "all" ? o.mode : "banner",
      uiKey: o.uiKey || "task",
      onPick: typeof o.onPick === "function" ? o.onPick : null,
    };
    const el = qs("stockBannerPickerModal");
    const grid = qs("stockBannerPickerGrid");
    const title = qs("stockBannerPickerModalTitle");
    const desc = qs("stockBannerPickerDesc");
    if (!el || !grid) return;
    if (title) title.textContent = o.title || "Image library";
    if (desc) {
      desc.textContent =
        o.desc ||
        (stockPickerContext.mode === "pfp"
          ? "Pick a profile picture from My Images or stock Official icons."
          : "Pick one of your images or a bundled stock asset.");
    }
    fillStockBannerPickerGrid(grid);
    el.hidden = false;
    el.setAttribute("aria-hidden", "false");
    if (typeof activateModalFocus === "function") activateModalFocus(el);
    const closeBtn = qs("stockBannerPickerModalClose");
    if (closeBtn) closeBtn.focus();
  }

  async function applyPickerImageAsset(asset) {
    if (!asset) return;
    const path = asset.ref || asset.path;
    if (!path) return;
    if (typeof stockPickerContext.onPick === "function") {
      const cb = stockPickerContext.onPick;
      closeStockBannerPicker();
      try {
        await cb(asset);
      } catch (err) {
        alert((err && err.message) || "Could not load that image.");
      }
      return;
    }
    const uiKey = (stockPickerContext && stockPickerContext.uiKey) || "task";
    setActiveBannerUi(uiKey);
    closeStockBannerPicker();
    try {
      await loadTaskBannerSourceFromUrl(path);
      drawTaskBannerCrop();
      syncTaskBannerPreview();
      syncTaskBannerTargetButtons();
    } catch (err) {
      alert((err && err.message) || "Could not load that image.");
    }
  }

  async function applyStockBannerAsset(asset) {
    return applyPickerImageAsset(asset);
  }

  async function switchTaskBannerTarget(target) {
    if (!TASK_BANNER_TARGETS[target]) return;
    if (taskBannerCrop.sourceImg && !taskBannerCrop.clear) commitTaskBannerCrop();
    taskModal.bannerTarget = target;
    syncTaskBannerTargetButtons();
    resizeTaskBannerCropStage();
    if (taskModal.bannerSource && taskBannerCrop.sourceImg) {
      applyBannerViewToStage(getActiveTaskBannerView());
      drawTaskBannerCrop();
      syncTaskBannerPreview();
    } else if (taskModal.bannerSource) {
      try {
        await loadTaskBannerSourceFromUrl(taskModal.bannerSource, { keepViews: true });
      } catch (_) {
        drawTaskBannerCrop();
        syncTaskBannerPreview();
      }
    } else {
      resetTaskBannerCropState();
      drawTaskBannerCrop();
      syncTaskBannerPreview();
    }
  }

  function applyTaskBannerCornerScaleLocked(kind, mode, dx, dy, aspect) {
    const min = TASK_BANNER_CROP_MIN;
    const isImg = kind === "img";
    const startX = isImg ? taskBannerCrop.startImgX : taskBannerCrop.startCropX;
    const startY = isImg ? taskBannerCrop.startImgY : taskBannerCrop.startCropY;
    const startW = isImg ? taskBannerCrop.startImgW : taskBannerCrop.startCropW;
    const startH = isImg ? taskBannerCrop.startImgH : taskBannerCrop.startCropH;
    let w = startW;
    let h = startH;
    const growW = (mode === "ne" || mode === "se") ? dx : -dx;
    const growH = (mode === "sw" || mode === "se") ? dy : -dy;
    if (Math.abs(growW) >= Math.abs(growH) * aspect) {
      w = startW + growW;
      h = w / aspect;
    } else {
      h = startH + growH;
      w = h * aspect;
    }
    if (w < min) {
      w = min;
      h = w / aspect;
    }
    if (h < min) {
      h = min;
      w = h * aspect;
    }
    let x = startX;
    let y = startY;
    if (mode === "nw" || mode === "sw") x = startX + startW - w;
    if (mode === "nw" || mode === "ne") y = startY + startH - h;
    if (isImg) {
      taskBannerCrop.imgX = x;
      taskBannerCrop.imgY = y;
      taskBannerCrop.imgW = w;
      taskBannerCrop.imgH = h;
      softClampTaskBannerRect("img");
    } else {
      taskBannerCrop.cropX = x;
      taskBannerCrop.cropY = y;
      taskBannerCrop.cropW = w;
      taskBannerCrop.cropH = h;
      softClampTaskBannerRect("crop");
    }
  }

  function applyTaskBannerCropFreeScale(mode, dx, dy) {
    const min = TASK_BANNER_CROP_MIN;
    let x = taskBannerCrop.startCropX;
    let y = taskBannerCrop.startCropY;
    let w = taskBannerCrop.startCropW;
    let h = taskBannerCrop.startCropH;
    if (mode === "nw") {
      x = taskBannerCrop.startCropX + dx;
      y = taskBannerCrop.startCropY + dy;
      w = taskBannerCrop.startCropW - dx;
      h = taskBannerCrop.startCropH - dy;
    } else if (mode === "ne") {
      y = taskBannerCrop.startCropY + dy;
      w = taskBannerCrop.startCropW + dx;
      h = taskBannerCrop.startCropH - dy;
    } else if (mode === "sw") {
      x = taskBannerCrop.startCropX + dx;
      w = taskBannerCrop.startCropW - dx;
      h = taskBannerCrop.startCropH + dy;
    } else {
      w = taskBannerCrop.startCropW + dx;
      h = taskBannerCrop.startCropH + dy;
    }
    if (w < min) {
      if (mode === "nw" || mode === "sw") x = taskBannerCrop.startCropX + taskBannerCrop.startCropW - min;
      w = min;
    }
    if (h < min) {
      if (mode === "nw" || mode === "ne") y = taskBannerCrop.startCropY + taskBannerCrop.startCropH - min;
      h = min;
    }
    taskBannerCrop.cropX = x;
    taskBannerCrop.cropY = y;
    taskBannerCrop.cropW = w;
    taskBannerCrop.cropH = h;
    softClampTaskBannerRect("crop");
  }

  function pointInRect(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  function nearTaskBannerCropBorder(px, py, band) {
    const b = band || 12;
    const x = taskBannerCrop.cropX;
    const y = taskBannerCrop.cropY;
    const w = taskBannerCrop.cropW;
    const h = taskBannerCrop.cropH;
    if (!pointInRect(px, py, x - b, y - b, w + b * 2, h + b * 2)) return false;
    return !pointInRect(px, py, x + b, y + b, Math.max(0, w - b * 2), Math.max(0, h - b * 2));
  }

  function hitBannerFrameHandle(px, py, x, y, w, h, pad) {
    const size = pad || 14;
    const corners = {
      nw: [x, y],
      ne: [x + w, y],
      sw: [x, y + h],
      se: [x + w, y + h],
    };
    for (const key of Object.keys(corners)) {
      const hx = corners[key][0];
      const hy = corners[key][1];
      if (Math.abs(px - hx) <= size && Math.abs(py - hy) <= size) return key;
    }
    return null;
  }

  function initTaskBannerControls() {
    const pointerPos = (clientX, clientY) => {
      const wrap = bannerEl("wrap");
      if (!wrap) return { x: 0, y: 0 };
      const rect = wrap.getBoundingClientRect();
      const sx = TASK_BANNER_STAGE.w / Math.max(1, rect.width);
      const sy = TASK_BANNER_STAGE.h / Math.max(1, rect.height);
      return {
        x: (clientX - rect.left) * sx,
        y: (clientY - rect.top) * sy,
      };
    };

    const snapshotDragStart = (p) => {
      taskBannerCrop.dragStartX = p.x;
      taskBannerCrop.dragStartY = p.y;
      taskBannerCrop.startImgX = taskBannerCrop.imgX;
      taskBannerCrop.startImgY = taskBannerCrop.imgY;
      taskBannerCrop.startImgW = taskBannerCrop.imgW;
      taskBannerCrop.startImgH = taskBannerCrop.imgH;
      taskBannerCrop.startCropX = taskBannerCrop.cropX;
      taskBannerCrop.startCropY = taskBannerCrop.cropY;
      taskBannerCrop.startCropW = taskBannerCrop.cropW;
      taskBannerCrop.startCropH = taskBannerCrop.cropH;
    };

    const onDown = (clientX, clientY, forcedMode) => {
      if (!taskBannerCrop.sourceImg) return;
      const p = pointerPos(clientX, clientY);
      snapshotDragStart(p);
      if (forcedMode) {
        taskBannerCrop.mode = forcedMode;
        return;
      }
      const cropHandle = hitBannerFrameHandle(
        p.x, p.y,
        taskBannerCrop.cropX, taskBannerCrop.cropY,
        taskBannerCrop.cropW, taskBannerCrop.cropH
      );
      if (cropHandle) {
        taskBannerCrop.mode = "scale-crop-" + cropHandle;
        return;
      }
      const imgHandle = hitBannerFrameHandle(
        p.x, p.y,
        taskBannerCrop.imgX, taskBannerCrop.imgY,
        taskBannerCrop.imgW, taskBannerCrop.imgH
      );
      if (imgHandle) {
        taskBannerCrop.mode = "scale-img-" + imgHandle;
        return;
      }
      if (nearTaskBannerCropBorder(p.x, p.y)) {
        taskBannerCrop.mode = "move-crop";
        return;
      }
      if (pointInRect(p.x, p.y, taskBannerCrop.imgX, taskBannerCrop.imgY, taskBannerCrop.imgW, taskBannerCrop.imgH)) {
        taskBannerCrop.mode = "move-img";
        return;
      }
      if (pointInRect(p.x, p.y, taskBannerCrop.cropX, taskBannerCrop.cropY, taskBannerCrop.cropW, taskBannerCrop.cropH)) {
        taskBannerCrop.mode = "move-crop";
        return;
      }
      taskBannerCrop.mode = null;
    };

    const onMove = (clientX, clientY) => {
      if (!taskBannerCrop.mode) return;
      const p = pointerPos(clientX, clientY);
      const dx = p.x - taskBannerCrop.dragStartX;
      const dy = p.y - taskBannerCrop.dragStartY;
      const mode = taskBannerCrop.mode;

      if (mode === "move-img") {
        taskBannerCrop.imgX = taskBannerCrop.startImgX + dx;
        taskBannerCrop.imgY = taskBannerCrop.startImgY + dy;
        softClampTaskBannerRect("img");
      } else if (mode === "move-crop") {
        taskBannerCrop.cropX = taskBannerCrop.startCropX + dx;
        taskBannerCrop.cropY = taskBannerCrop.startCropY + dy;
        softClampTaskBannerRect("crop");
      } else if (mode.indexOf("scale-img-") === 0) {
        applyTaskBannerCornerScaleLocked("img", mode.slice("scale-img-".length), dx, dy, getTaskBannerImageAspect());
      } else if (mode.indexOf("scale-crop-") === 0) {
        const corner = mode.slice("scale-crop-".length);
        const target = taskModal.bannerTarget || "board";
        if (target === "board") {
          applyTaskBannerCropFreeScale(corner, dx, dy);
        } else {
          applyTaskBannerCornerScaleLocked("crop", corner, dx, dy, getTaskBannerCropAspect());
        }
      }
      drawTaskBannerCrop();
    };

    const onUp = () => {
      if (!taskBannerCrop.mode) return;
      taskBannerCrop.mode = null;
      if (taskBannerCrop.sourceImg) commitTaskBannerCrop();
    };

    function bindOneBannerUi(uiKey) {
      const prev = activeBannerUiKey;
      setActiveBannerUi(uiKey);
      const fileInput = bannerEl("file");
      const chooseBtn = bannerEl("chooseBtn");
      const stockBtn = bannerEl("stockBtn");
      const saveLibraryBtn = bannerEl("saveLibraryBtn");
      const clearBtn = bannerEl("clearBtn");
      const wrap = bannerEl("wrap");
      const imgFrame = bannerEl("imgFrame");
      const cropFrame = bannerEl("cropFrame");
      const nameInput = bannerEl("nameInput");
      const root = bannerRootEl();
      setActiveBannerUi(prev);
      if (!fileInput || !root) return;

      const activate = () => setActiveBannerUi(uiKey);

      if (typeof ResizeObserver !== "undefined" && wrap) {
        const ro = new ResizeObserver(() => {
          if (!wrap.isConnected) return;
          if (activeBannerUiKey !== uiKey) return;
          resizeTaskBannerCropStage();
          drawTaskBannerCrop();
        });
        ro.observe(wrap);
      }

      root.querySelectorAll(".task-banner-target-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          activate();
          switchTaskBannerTarget(btn.dataset.bannerTarget || "board");
        });
      });

      if (chooseBtn) {
        chooseBtn.addEventListener("click", (e) => {
          e.preventDefault();
          activate();
          fileInput.click();
        });
      }
      if (stockBtn) {
        stockBtn.addEventListener("click", (e) => {
          e.preventDefault();
          activate();
          openStockBannerPicker(uiKey);
        });
      }
      if (saveLibraryBtn) {
        saveLibraryBtn.addEventListener("click", (e) => {
          e.preventDefault();
          activate();
          saveCurrentBannerToUserLibrary();
        });
      }
      fileInput.addEventListener("change", () => {
        activate();
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (file) setTaskBannerFromFile(file);
      });

      if (wrap) {
        ["dragenter", "dragover"].forEach((type) => {
          wrap.addEventListener(type, (e) => {
            e.preventDefault();
            wrap.classList.add("is-dragover");
          });
        });
        ["dragleave", "drop"].forEach((type) => {
          wrap.addEventListener(type, (e) => {
            e.preventDefault();
            wrap.classList.remove("is-dragover");
          });
        });
        wrap.addEventListener("drop", (e) => {
          activate();
          const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (file) setTaskBannerFromFile(file);
        });
        wrap.addEventListener("mousedown", (e) => {
          if (e.target && e.target.classList && e.target.classList.contains("task-banner-crop-handle")) return;
          e.preventDefault();
          activate();
          onDown(e.clientX, e.clientY, null);
        });
        wrap.addEventListener("touchstart", (e) => {
          if (!e.touches || !e.touches[0]) return;
          if (e.target && e.target.classList && e.target.classList.contains("task-banner-crop-handle")) return;
          activate();
          onDown(e.touches[0].clientX, e.touches[0].clientY, null);
        }, { passive: true });
      }

      if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
          e.preventDefault();
          activate();
          resetTaskBannerCropState();
          taskBannerCrop.clear = true;
          taskModal.bannerSource = null;
          taskModal.bannerViews = emptyTaskBannerViews();
          taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
          resizeTaskBannerCropStage();
          drawTaskBannerCrop();
          syncTaskBannerPreview();
          syncTaskBannerTargetButtons();
        });
      }

      if (nameInput) {
        nameInput.addEventListener("input", () => {
          if (activeBannerUiKey !== uiKey) return;
          if (taskModal.bannerSource) syncTaskBannerPreview();
        });
      }

      const bindFrameDown = (frame, frameKind) => {
        if (!frame) return;
        frame.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          activate();
          const handle = e.target && e.target.getAttribute && e.target.getAttribute("data-handle");
          if (handle) {
            onDown(e.clientX, e.clientY, "scale-" + frameKind + "-" + handle);
          } else {
            onDown(e.clientX, e.clientY, "move-" + frameKind);
          }
        });
        frame.addEventListener("touchstart", (e) => {
          if (!e.touches || !e.touches[0]) return;
          activate();
          const handle = e.target && e.target.getAttribute && e.target.getAttribute("data-handle");
          if (handle) {
            onDown(e.touches[0].clientX, e.touches[0].clientY, "scale-" + frameKind + "-" + handle);
          } else {
            onDown(e.touches[0].clientX, e.touches[0].clientY, "move-" + frameKind);
          }
        }, { passive: true });
      };
      bindFrameDown(imgFrame, "img");
      bindFrameDown(cropFrame, "crop");
    }

    Object.keys(TASK_BANNER_UI).forEach(bindOneBannerUi);

    const stockPicker = qs("stockBannerPickerModal");
    const stockPickerClose = qs("stockBannerPickerModalClose");
    if (stockPickerClose) {
      stockPickerClose.addEventListener("click", () => closeStockBannerPicker());
    }
    if (stockPicker) {
      stockPicker.addEventListener("click", (e) => {
        const t = e.target;
        if (t && t.getAttribute && t.getAttribute("data-close") === "stockBannerPickerModal") {
          closeStockBannerPicker();
        }
      });
    }

    window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", (e) => {
      if (!taskBannerCrop.mode || !e.touches || !e.touches[0]) return;
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    window.addEventListener("touchend", onUp);
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
    initTaskBannerControls();

    const resetTime = qs("taskResetTime");
    const sameEndToggle = qs("taskCycleEndTimeSameAsBegin");
    const cycleEndTime = qs("taskCycleEndTime");
    if (resetTime) {
      resetTime.addEventListener("input", () => {
        syncTaskCycleEndTimeUI();
        if (typeof updateTaskCycleEndPreview === "function") updateTaskCycleEndPreview();
        if (typeof updateTaskTimeRemainingDisplay === "function") updateTaskTimeRemainingDisplay();
      });
      resetTime.addEventListener("change", () => {
        syncTaskCycleEndTimeUI();
        if (typeof updateTaskCycleEndPreview === "function") updateTaskCycleEndPreview();
        if (typeof updateTaskTimeRemainingDisplay === "function") updateTaskTimeRemainingDisplay();
      });
    }
    if (sameEndToggle) {
      sameEndToggle.addEventListener("change", () => {
        syncTaskCycleEndTimeUI();
        if (typeof updateTaskCycleEndPreview === "function") updateTaskCycleEndPreview();
        if (typeof updateTaskTimeRemainingDisplay === "function") updateTaskTimeRemainingDisplay();
      });
    }
    if (cycleEndTime) {
      cycleEndTime.addEventListener("change", () => {
        if (typeof updateTaskCycleEndPreview === "function") updateTaskCycleEndPreview();
        if (typeof updateTaskTimeRemainingDisplay === "function") updateTaskTimeRemainingDisplay();
      });
    }
