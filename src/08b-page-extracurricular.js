  const EXTRACURRICULAR_ARCHIVE_MS = 24 * 60 * 60 * 1000;

  function isExtracurricularArchived(task) {
    const now = getSimulatedNow().getTime();
    const endMs = getExtracurricularEndMs(task);
    if (endMs != null && now > endMs) return true;
    const completed = state.extracurricularCompleted[task.id];
    if (!completed) return false;
    const at = state.extracurricularCompletedAt && state.extracurricularCompletedAt[task.id];
    if (!at) return true;
    const completedDate = new Date(at);
    return (now - completedDate.getTime()) > EXTRACURRICULAR_ARCHIVE_MS;
  }

  function sortExtracurricularByDueDate(tasks) {
    return [...tasks].sort((a, b) => {
      const aTbd = !!a.endDateTBD || !a.endDate;
      const bTbd = !!b.endDateTBD || !b.endDate;
      if (aTbd !== bTbd) return aTbd ? 1 : -1;
      if (aTbd) return 0;
      return (a.endDate || "").localeCompare(b.endDate || "");
    });
  }

  function getActiveExtracurricularTasks() {
    return sortExtracurricularByDueDate((state.extracurricularTasks || []).filter((t) => !isExtracurricularArchived(t)));
  }

  function getArchivedExtracurricularTasks() {
    // Keep array order — History should not be re-sorted on each render.
    return (state.extracurricularTasks || []).filter((t) => isExtracurricularArchived(t));
  }

  function setExtracurricularCompleted(taskId, completed) {
    if (completed) openExtracurricularCompleteModal(taskId);
    else clearExtracurricularCompletion(taskId);
  }

  /** Builds a card for the home page checklist, matching dailies/weeklies/endgame (same task-item hover). */
  function buildExtracurricularTaskItemForHome(task, tagName) {
    const completed = !!state.extracurricularCompleted[task.id];
    const el = document.createElement(tagName || "div");
    el.className = "task-item" + (completed ? " done" : "");

    const game = task.gameId ? getGame(task.gameId) : null;
    appendTaskCardMedia(el, task, game || { name: task.label || "Task" }, { surface: "home" });
    const body = appendTaskCardBody(el);

    const pot = Math.max(0, Number(task.currency) || 0);
    const top = document.createElement("div");
    top.className = "task-top task-card-title-row";
    const titleCol = document.createElement("div");
    titleCol.className = "task-game-heading-text";
    const span = document.createElement("span");
    span.className = "task-label";
    span.textContent = task.label || "Task";
    span.addEventListener("click", () => {
      setExtracurricularCompleted(task.id, !completed);
    });
    titleCol.appendChild(span);
    if (pot > 0) {
      const potSpan = document.createElement("span");
      potSpan.className = "task-potential";
      potSpan.textContent = "Potential: " + pot;
      titleCol.appendChild(potSpan);
    }
    top.appendChild(titleCol);
    body.appendChild(top);

    const sub = document.createElement("div");
    sub.className = "task-subrows";
    const row1 = document.createElement("div");
    row1.className = "task-subrow";
    const left1 = document.createElement("div");
    left1.className = "left";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    check.setAttribute("aria-label", completed ? "Mark incomplete" : "Mark complete");
    check.addEventListener("click", () => {
      setExtracurricularCompleted(task.id, !completed);
    });
    const label1 = document.createElement("span");
    label1.innerHTML = "<strong>Completion Status:</strong> " + (completed ? "Complete" : "Incomplete");
    left1.appendChild(check);
    left1.appendChild(label1);
    row1.appendChild(left1);
    sub.appendChild(row1);

    const remText = getExtracurricularTimeRemainingText(task, getSimulatedNow());
    if (remText) {
      const remainingRow = document.createElement("div");
      remainingRow.className = "task-subrow";
      const leftR = document.createElement("div");
      leftR.className = "left";
      const labelR = document.createElement("span");
      labelR.innerHTML = "<strong>Time remaining:</strong>";
      leftR.appendChild(labelR);
      remainingRow.appendChild(leftR);
      const remainingVal = document.createElement("span");
      remainingVal.className = "task-remaining";
      remainingVal.textContent = remText;
      remainingRow.appendChild(remainingVal);
      sub.appendChild(remainingRow);
    }

    body.appendChild(sub);
    return el;
  }

  function buildExtracurricularTaskItem(task, tagName, opts) {
    const completed = state.extracurricularCompleted[task.id];
    const li = document.createElement(tagName || "li");
    li.className = "task-item task-item-with-changer task-card-knot";
    if (completed) li.classList.add("done");

    const game = task.gameId ? getGame(task.gameId) : null;
    const surface = (opts && opts.surface) || "board";
    const media = appendTaskCardMedia(li, task, game || { name: task.gameId || "Task" }, { surface: surface });

    const actions = document.createElement("div");
    actions.className = "task-card-media-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "✎";
    editBtn.setAttribute("aria-label", "Edit task");
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openExtracurricularTaskModal(task);
    });
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", "Delete task");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteExtracurricularTask(task.id);
    });
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    if (media) media.appendChild(actions);

    const body = appendTaskCardBody(li);

    const top = document.createElement("div");
    top.className = "task-item-top task-card-title-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = !!completed;
    checkbox.addEventListener("change", () => {
      const want = checkbox.checked;
      if (want === !!state.extracurricularCompleted[task.id]) return;
      if (want) {
        checkbox.checked = false;
        openExtracurricularCompleteModal(task.id);
      } else {
        clearExtracurricularCompletion(task.id);
      }
    });
    top.appendChild(checkbox);
    const labelWrap = document.createElement("div");
    labelWrap.className = "task-item-info";
    const label = document.createElement("span");
    label.className = "task-label";
    label.textContent = task.label || "Task";
    labelWrap.appendChild(label);
    top.appendChild(labelWrap);
    body.appendChild(top);

    const startStr = task.startDate || "";
    const endStr = task.endDateTBD ? "TBD" : (task.endDate || "");
    const endDisplay = endStr + (task.endTime && !task.endDateTBD ? " " + task.endTime : "");
    const dateLine = startStr + (endDisplay ? " — " + endDisplay : "");
    const pot = Math.max(0, Number(task.currency) || 0);
    let earnedStr = "—";
    if (completed) {
      const rec = state.extracurricularCurrencyEarned && state.extracurricularCurrencyEarned[task.id];
      const e = rec !== undefined && rec !== null ? Math.max(0, Number(rec) || 0) : pot;
      earnedStr = String(e);
    }
    const remainingText = getExtracurricularTimeRemainingText(task, getSimulatedNow());
    // Snippet: description and time-left only — Dates/Currency live in dedicated rows below.
    const snippetParts = [];
    if (task.description) snippetParts.push(task.description);
    if (remainingText && remainingText !== "TBD") snippetParts.push(remainingText + " left");
    if (snippetParts.length) {
      const snippet = document.createElement("p");
      snippet.className = "task-card-snippet";
      snippet.textContent = snippetParts.join(" · ");
      body.appendChild(snippet);
    }

    const meta = document.createElement("div");
    meta.className = "task-subrows";
    if (dateLine) {
      const info = document.createElement("div");
      info.className = "task-subrow";
      const infoSpan = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = "Dates: ";
      infoSpan.appendChild(strong);
      infoSpan.appendChild(document.createTextNode(dateLine));
      info.appendChild(infoSpan);
      meta.appendChild(info);
    }
    const currencyRow = document.createElement("div");
    currencyRow.className = "task-subrow";
    const currencySpan = document.createElement("span");
    const currencyStrong = document.createElement("strong");
    currencyStrong.textContent = "Currency: ";
    currencySpan.appendChild(currencyStrong);
    currencySpan.appendChild(document.createTextNode("Potential " + pot + " · Earned " + earnedStr));
    currencyRow.appendChild(currencySpan);
    meta.appendChild(currencyRow);

    if (completed) {
      const completedRow = document.createElement("div");
      completedRow.className = "task-subrow extracurricular-completed-row";
      const completedLab = document.createElement("strong");
      completedLab.textContent = "Completed: ";
      completedRow.appendChild(completedLab);

      let finishDate = "";
      let finishHour = 12;
      let finishMinute = 0;
      const iso = state.extracurricularCompletedAt && state.extracurricularCompletedAt[task.id];
      if (iso) {
        const d = new Date(iso);
        if (Number.isFinite(d.getTime())) {
          const tz = typeof getAppTimezone === "function" ? getAppTimezone() : getRecordingTimezone();
          const parts =
            typeof getDatePartsInTimezone === "function"
              ? getDatePartsInTimezone(d, tz)
              : {
                  year: d.getFullYear(),
                  month: d.getMonth(),
                  day: d.getDate(),
                  hour: d.getHours(),
                  minute: d.getMinutes(),
                };
          finishDate =
            String(parts.year) +
            "-" +
            String(parts.month + 1).padStart(2, "0") +
            "-" +
            String(parts.day).padStart(2, "0");
          finishHour = Number(parts.hour);
          finishMinute = Number(parts.minute);
          if (!Number.isFinite(finishHour)) finishHour = 12;
          if (!Number.isFinite(finishMinute)) finishMinute = 0;
        }
      }
      const stamp = (state.completionTimestamps || []).find(
        (t) => t && t.taskType === "extracurricular" && String(t.taskId || "") === String(task.id)
      );
      if ((!finishDate || !isValidDateStr(finishDate)) && stamp && isValidDateStr(stamp.dateStr)) {
        finishDate = stamp.dateStr;
        if (Number.isFinite(stamp.hour)) finishHour = stamp.hour;
        if (Number.isFinite(stamp.minute)) finishMinute = stamp.minute;
      }

      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.value = finishDate || "";
      dateInput.title = "Completion date (updates calendar / trends)";
      const timeInput = document.createElement("input");
      timeInput.type = "time";
      timeInput.step = "60";
      timeInput.value =
        typeof timeToStr === "function"
          ? timeToStr(finishHour, finishMinute)
          : String(finishHour).padStart(2, "0") + ":" + String(finishMinute).padStart(2, "0");
      timeInput.title = "Completion time (updates calendar / trends)";
      const applyCompletedMoment = () => {
        if (typeof setExtracurricularCompletionMoment !== "function") return;
        const parts =
          typeof parseTimeStr === "function"
            ? parseTimeStr(timeInput.value || "12:00")
            : { hour: 12, minute: 0 };
        const result = setExtracurricularCompletionMoment(task.id, dateInput.value, parts.hour, parts.minute, {
          skipRender: true,
        });
        if (result && !result.ok && result.reason) {
          alert(result.reason);
          return;
        }
        renderActiveTab();
      };
      dateInput.addEventListener("change", applyCompletedMoment);
      timeInput.addEventListener("change", applyCompletedMoment);
      completedRow.appendChild(dateInput);
      completedRow.appendChild(timeInput);
      meta.appendChild(completedRow);
    }

    body.appendChild(meta);

    return li;
  }

  function getExtracurricularGridColumns() {
    return state.extracurricularGridColumns === 5 ? 5 : 4;
  }

  function getExtracurricularDateOrder() {
    return state.extracurricularDateOrder === "newest" ? "newest" : "oldest";
  }

  /** Start date order. Missing dates stay last; ties keep saved order. */
  function sortExtracurricularByStartDate(tasks, order) {
    const newest = order === "newest";
    return tasks
      .map((task, taskOrder) => ({ task, taskOrder }))
      .sort((a, b) => {
        const as = a.task.startDate || "";
        const bs = b.task.startDate || "";
        if (as && bs && as !== bs) return as < bs ? (newest ? 1 : -1) : newest ? -1 : 1;
        if (as && !bs) return -1;
        if (!as && bs) return 1;
        return a.taskOrder - b.taskOrder;
      })
      .map((entry) => entry.task);
  }

  function appendExtracurricularViewToggle(parent, label, current, options, onChange) {
    const group = document.createElement("div");
    group.className = "extracurricular-view-control";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    const caption = document.createElement("span");
    caption.className = "extracurricular-view-control-label";
    caption.textContent = label;
    group.appendChild(caption);
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost btn-sm" + (opt.value === current ? " is-selected" : "");
      btn.textContent = opt.label;
      btn.setAttribute("aria-pressed", opt.value === current ? "true" : "false");
      btn.addEventListener("click", () => {
        if (opt.value === current) return;
        onChange(opt.value);
      });
      group.appendChild(btn);
    });
    parent.appendChild(group);
  }

  function renderExtracurricular() {
    const container = document.getElementById("extracurricularContent");
    if (!container) return;
    container.innerHTML = "";
    const viewMode = state.extracurricularViewMode || "tasks";

    const headerRow = document.createElement("div");
    headerRow.className = "extracurricular-header-row";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-add";
    addBtn.textContent = "+ Add task";
    addBtn.addEventListener("click", () => openExtracurricularTaskModal(null));
    headerRow.appendChild(addBtn);
    if (viewMode === "tasks") {
      const historyBtn = document.createElement("button");
      historyBtn.type = "button";
      historyBtn.className = "btn btn-ghost";
      historyBtn.textContent = "History";
      historyBtn.addEventListener("click", () => {
        state.extracurricularViewMode = "history";
        save();
        renderActiveTab();
      });
      headerRow.appendChild(historyBtn);
      const scanBtn = document.createElement("button");
      scanBtn.type = "button";
      scanBtn.className = "btn btn-ghost";
      scanBtn.textContent = "Scan updates";
      scanBtn.title = "Only works on a local hub. The public site cannot read Game8.";
      const scanNote = document.createElement("span");
      scanNote.className = "extra-scan-local-note";
      scanNote.textContent = "Local hub only";
      scanBtn.addEventListener("click", () => {
        if (typeof openExtraScanGamePicker === "function") openExtraScanGamePicker();
      });
      headerRow.appendChild(scanBtn);
      headerRow.appendChild(scanNote);
    } else {
      const tasksBtn = document.createElement("button");
      tasksBtn.type = "button";
      tasksBtn.className = "btn btn-ghost";
      tasksBtn.textContent = "← Tasks";
      tasksBtn.addEventListener("click", () => {
        state.extracurricularViewMode = "tasks";
        save();
        renderActiveTab();
      });
      headerRow.appendChild(tasksBtn);
    }
    const controls = document.createElement("div");
    controls.className = "extracurricular-view-controls";
    appendExtracurricularViewToggle(
      controls,
      "Columns",
      getExtracurricularGridColumns(),
      [
        { value: 4, label: "4" },
        { value: 5, label: "5" },
      ],
      (value) => {
        state.extracurricularGridColumns = value;
        save();
        renderActiveTab();
      }
    );
    appendExtracurricularViewToggle(
      controls,
      "Start date",
      getExtracurricularDateOrder(),
      [
        { value: "oldest", label: "Oldest" },
        { value: "newest", label: "Newest" },
      ],
      (value) => {
        state.extracurricularDateOrder = value;
        save();
        renderActiveTab();
      }
    );
    headerRow.appendChild(controls);
    container.appendChild(headerRow);
    if (typeof renderExtraScanReminders === "function") renderExtraScanReminders(container);

    const tasksRaw = viewMode === "history" ? getArchivedExtracurricularTasks() : getActiveExtracurricularTasks();
    const tasks = sortExtracurricularByStartDate(tasksRaw, getExtracurricularDateOrder());

    if (tasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = viewMode === "history"
        ? "No archived tasks. Tasks move here when their end date passes, or when completed 24+ hours ago."
        : "No extracurricular tasks yet. Add one to get started.";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    const cols = getExtracurricularGridColumns();
    list.className = "task-grid task-grid-knot";
    list.dataset.masonryOrder = "source";
    list.dataset.masonryMax = String(cols);
    list.dataset.masonryPreferred = String(cols);
    list.dataset.masonryMin = "160";
    tasks.forEach((task) => list.appendChild(buildExtracurricularTaskItem(task, "div")));
    container.appendChild(list);
    scheduleTaskMasonry(list);
  }

  function updateExtracurricularTimeRemainingDisplay() {
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
    const endInput = document.getElementById("extracurricularTaskEndDate");
    const endTimeInput = document.getElementById("extracurricularTaskEndTime");
    const row = document.getElementById("extracurricularTimeRemainingRow");
    const input = document.getElementById("extracurricularTimeRemainingInput");
    if (!row || !input) return;
    const isTBD = endTBDInput && endTBDInput.checked;
    const endStr = endInput && endInput.value ? endInput.value.trim() : "";
    if (isTBD || !endStr) {
      input.value = "";
      input.placeholder = "e.g. 6d 7hr";
      return;
    }
    const m = endStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      input.value = "";
      return;
    }
    const timeStr = (endTimeInput && endTimeInput.value) ? endTimeInput.value.trim() : "23:59";
    const tParts = timeStr.split(":");
    const h = parseInt(tParts[0], 10) || 23;
    const min = parseInt(tParts[1], 10) || 59;
    const sec = parseInt(tParts[2], 10) || 0;
    const endMoment = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), h, min, sec);
    const now = getSimulatedNow();
    const ms = endMoment.getTime() - now.getTime();
    input.value = ms > 0 ? formatRemainingMs(ms) : "Not Available";
  }

  function applyExtracurricularTimeRemainingFromInput() {
    const input = document.getElementById("extracurricularTimeRemainingInput");
    const endInput = document.getElementById("extracurricularTaskEndDate");
    const endTimeInput = document.getElementById("extracurricularTaskEndTime");
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
    if (!input || !endInput) return;
    const remainingMs = parseTimeRemainingToMs(input.value.trim());
    if (remainingMs == null || remainingMs <= 0) return;
    const now = getSimulatedNow();
    const endDate = new Date(now.getTime() + remainingMs);
    const endStr = getDateStr(endDate);
    endInput.value = endStr;
    const h = endDate.getHours();
    const m = endDate.getMinutes();
    if (endTimeInput) endTimeInput.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    if (endTBDInput) {
      endTBDInput.checked = false;
      endInput.disabled = false;
    }
    const endRow = document.querySelector(".extracurricular-end-date-row");
    if (endRow) endRow.style.display = "";
    input.value = formatRemainingMs(remainingMs);
  }

  function initExtracurricularTimeRemainingInput() {
    const input = document.getElementById("extracurricularTimeRemainingInput");
    if (!input) return;
    input.addEventListener("blur", applyExtracurricularTimeRemainingFromInput);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applyExtracurricularTimeRemainingFromInput();
      }
    });
  }

  function openExtracurricularTaskModal(task, preset) {
    const modal = document.getElementById("extracurricularTaskModal");
    const title = document.getElementById("extracurricularTaskModalTitle");
    const form = document.getElementById("extracurricularTaskModalForm");
    const nameInput = document.getElementById("extracurricularTaskName");
    const startInput = document.getElementById("extracurricularTaskStartDate");
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
    const endInput = document.getElementById("extracurricularTaskEndDate");
    const endTimeInput = document.getElementById("extracurricularTaskEndTime");
    const descInput = document.getElementById("extracurricularTaskDescription");
    const gameSelect = document.getElementById("extracurricularTaskGame");

    const presetGameId = !task && preset && preset.gameId ? preset.gameId : null;
    if (title) title.textContent = task ? "Edit task" : "Add task";
    const currencyInput = document.getElementById("extracurricularTaskCurrency");
    const excludeFromDataInput = document.getElementById("extracurricularTaskExcludeFromData");
    if (nameInput) nameInput.value = task ? (task.label || "") : "";
    if (startInput) startInput.value = task && task.startDate ? task.startDate : getDateStr();
    if (endTBDInput) endTBDInput.checked = !!(task && task.endDateTBD);
    if (endInput) {
      endInput.value = task && task.endDate ? task.endDate : "";
      endInput.disabled = !!(task && task.endDateTBD);
    }
    if (endTimeInput) endTimeInput.value = (task && task.endTime) ? task.endTime : "23:59";
    if (descInput) descInput.value = task ? (task.description || "") : "";
    if (currencyInput) currencyInput.value = task && task.currency != null ? String(task.currency) : "";
    if (excludeFromDataInput) excludeFromDataInput.checked = !!(task && task.excludeFromData);
    if (gameSelect) {
      gameSelect.innerHTML = "<option value=\"\">— None —</option>";
      getAllGames().forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.name || g.id;
        if ((task && task.gameId === g.id) || (!task && presetGameId === g.id)) opt.selected = true;
        gameSelect.appendChild(opt);
      });
    }

    const endRow = document.querySelector(".extracurricular-end-date-row");
    const endTimeRow = document.querySelector(".extracurricular-end-time-row");
    if (endRow) endRow.style.display = endTBDInput && endTBDInput.checked ? "none" : "";
    if (endTimeRow) endTimeRow.style.display = endTBDInput && endTBDInput.checked ? "none" : "";
    if (endTBDInput) {
      endTBDInput.onchange = () => {
        if (endInput) endInput.disabled = endTBDInput.checked;
        if (endRow) endRow.style.display = endTBDInput.checked ? "none" : "";
        if (endTimeRow) endTimeRow.style.display = endTBDInput.checked ? "none" : "";
        updateExtracurricularTimeRemainingDisplay();
      };
    }
    if (endInput) {
      endInput.onchange = updateExtracurricularTimeRemainingDisplay;
      endInput.oninput = updateExtracurricularTimeRemainingDisplay;
    }
    if (endTimeInput) {
      endTimeInput.onchange = updateExtracurricularTimeRemainingDisplay;
      endTimeInput.oninput = updateExtracurricularTimeRemainingDisplay;
    }

    updateExtracurricularTimeRemainingDisplay();
    setExtracurricularOcrStatus(
      "Reads event name and time left (e.g. 37d). When Skip description is on, description is left alone."
    );

    if (typeof setActiveBannerUi === "function") setActiveBannerUi("extra");
    taskModal.bannerTarget = "home";
    taskModal.gameId = (task && task.gameId) || presetGameId || null;
    const loaded = typeof loadTaskBannersFromTask === "function"
      ? loadTaskBannersFromTask(task)
      : { source: null, views: emptyTaskBannerViews() };
    taskModal.bannerSource = loaded.source;
    taskModal.bannerViews = loaded.views;
    taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    const overlayInput = typeof bannerEl === "function" ? bannerEl("overlayTextInput") : document.getElementById("extraBannerOverlayText");
    if (overlayInput) overlayInput.value = (task && task.bannerOverlayText) ? String(task.bannerOverlayText) : "";
    const overlaySizeInput = typeof bannerEl === "function" ? bannerEl("overlayTextSizeInput") : document.getElementById("extraBannerOverlayTextSize");
    if (overlaySizeInput) {
      const size = typeof getTaskBannerOverlayTextSize === "function"
        ? getTaskBannerOverlayTextSize(task)
        : 1;
      overlaySizeInput.value = String(size);
      overlaySizeInput.setAttribute("aria-valuenow", String(size));
    }
    if (typeof resetTaskBannerCropState === "function") resetTaskBannerCropState();
    if (typeof syncTaskBannerTargetButtons === "function") syncTaskBannerTargetButtons();
    if (typeof syncTaskBannerPreview === "function") syncTaskBannerPreview();

    if (modal) {
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
      if (typeof activateModalFocus === "function") activateModalFocus(modal);
    }
    extracurricularTaskModalState.task = task;
    requestAnimationFrame(() => {
      if (typeof setActiveBannerUi === "function") setActiveBannerUi("extra");
      if (typeof resizeTaskBannerCropStage === "function") resizeTaskBannerCropStage();
      if (typeof drawTaskBannerCrop === "function") drawTaskBannerCrop();
      if (taskModal.bannerSource && typeof loadTaskBannerSourceFromUrl === "function") {
        loadTaskBannerSourceFromUrl(taskModal.bannerSource, { keepViews: true }).catch(() => {});
      } else if (typeof syncTaskBannerEditorFrames === "function") {
        syncTaskBannerEditorFrames();
        if (typeof drawTaskBannerCrop === "function") drawTaskBannerCrop();
      }
    });
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function closeExtracurricularTaskModal() {
    const modal = document.getElementById("extracurricularTaskModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
      if (typeof deactivateModalFocus === "function") deactivateModalFocus();
    }
    extracurricularTaskModalState.task = null;
    if (typeof setActiveBannerUi === "function") setActiveBannerUi("task");
    if (typeof resetTaskBannerCropState === "function") resetTaskBannerCropState();
    taskModal.bannerSource = null;
    taskModal.bannerViews = typeof emptyTaskBannerViews === "function" ? emptyTaskBannerViews() : { home: null, games: null, board: null };
    taskModal.bannerPreviewUrls = { home: null, games: null, board: null };
    const overlayInput = document.getElementById("extraBannerOverlayText");
    if (overlayInput) overlayInput.value = "";
    const overlaySizeInput = document.getElementById("extraBannerOverlayTextSize");
    if (overlaySizeInput) {
      overlaySizeInput.value = "1";
      overlaySizeInput.setAttribute("aria-valuenow", "1");
    }
  }

  function deleteExtracurricularTask(taskId) {
    const task = (state.extracurricularTasks || []).find((t) => t.id === taskId);
    if (!task) return;
    confirmTaskDelete(task.label || taskId, () => reallyDeleteExtracurricularTask(taskId));
  }

  function reallyDeleteExtracurricularTask(taskId) {
    if (!(state.extracurricularTasks || []).some((t) => t.id === taskId)) return;
    state.extracurricularTasks = (state.extracurricularTasks || []).filter((t) => t.id !== taskId);
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

  const extracurricularTaskModalState = { task: null };

  const OCR_UI_NOISE = [
    "event demo",
    "event details",
    "outfit reward",
    "current revenue",
    "current phase",
    "time remaining",
    "rewards preview",
    "trial resonators",
    "ridu chronicles",
    "summer vibes",
    "select all",
    "unselect all",
    "fill from screenshot",
  ];
  const OCR_BADGE_WORDS = {
    featured: 1, combat: 1, story: 1, casual: 1, event: 1, details: 1,
    challenge: 1, rewards: 1, preview: 1, remaining: 1, trial: 1, resonators: 1,
    resonator: 1, available: 1, limited: 1, login: 1, outfit: 1, demo: 1,
    phase: 1, revenue: 1, current: 1
  };
  const OCR_TITLE_STOP = { the: 1, a: 1, an: 1, of: 1, and: 1, will: 1, be: 1, to: 1, for: 1, in: 1, on: 1, with: 1 };

  function loadScriptOnce(src, globalName) {
    return new Promise((resolve, reject) => {
      if (globalName && typeof window[globalName] !== "undefined") {
        resolve(window[globalName]);
        return;
      }
      const existing = document.querySelector('script[data-ocr-src="' + src + '"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(globalName ? window[globalName] : true));
        existing.addEventListener("error", () => reject(new Error("Failed to load " + src)));
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.ocrSrc = src;
      s.onload = () => resolve(globalName ? window[globalName] : true);
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  function ensureTesseractLoaded() {
    if (typeof window.Tesseract !== "undefined") return Promise.resolve(window.Tesseract);
    return loadScriptOnce("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", "Tesseract");
  }

  function setExtracurricularOcrStatus(msg) {
    const el = document.getElementById("extracurricularOcrStatus");
    if (el) el.textContent = msg || "";
  }

  /** Soften common OCR confusions around event timers (37d, clock badges, etc.). */
  function normalizeOcrForTimers(text) {
    let s = String(text || "");
    // Only same-line digit confusions (do not let \s eat newlines into the next word).
    s = s.replace(/(\d)[ \t]*[OoQ](?=[ \t]*\d|[ \t]*[dD](?:ays?\b)?|[ \t]*$)/gm, "$10");
    s = s.replace(/(\d)[ \t]*[Il|!](?=[ \t]*[dD](?:ays?\b)?|[ \t]*$)/gm, "$11");
    // "37cl" / "37dl" / "37al" often = "37d"
    s = s.replace(/\b(\d{1,3})[ \t]*(?:cl|dl|al|ol|ci|di)\b/gi, "$1d");
    // "37 d ." / "37d." / "37·d"
    s = s.replace(/\b(\d{1,3})[ \t]*[·•.\-_]?[ \t]*[dD]\b/g, "$1d");
    return s;
  }

  function tidyOcrLine(line) {
    let s = String(line || "").replace(/\s+/g, " ").trim();
    s = s.replace(/[;|)(]+/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    s = s.replace(/\bofthe\b/gi, "of the");
    s = s.replace(/\bwillbe\b/gi, "will be");
    s = s.replace(/([A-Za-z])\.(?=[A-Za-z])/g, "$1");
    s = s.replace(/([a-z])i([A-Z])/g, "$1 $2");
    s = s.replace(/^[\s|©®•·\-—~=\\/@#$%^&*()]+/, "");
    s = s.replace(/[\s|©®•·\-—~=]+$/g, "");
    return s.trim();
  }

  function ocrLineWords(line) {
    return tidyOcrLine(line).toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  }

  function isOcrBadgeLine(line) {
    const low = tidyOcrLine(line).toLowerCase();
    if (!low) return false;
    if (OCR_UI_NOISE.some((n) => low === n || low.includes(n))) return true;
    const words = ocrLineWords(line).filter((w) => !OCR_TITLE_STOP[w] && w.length >= 3);
    if (!words.length) return false;
    const badges = words.filter((w) => OCR_BADGE_WORDS[w]);
    return badges.length / words.length >= 0.5;
  }

  function isOcrTimerLine(line) {
    const low = tidyOcrLine(line).toLowerCase();
    if (!low) return false;
    if (/\b(remaining|left|ends?\s+in)\b/.test(low)) return true;
    return /^\d{1,3}\s*d(?:ays?)?(?:\s+\d{1,2}\s*h(?:rs?|ours?)?)?(?:\s+\d{1,2}\s*m(?:in(?:ute)?s?)?)?$/.test(low);
  }

  function isOcrTitleContinuation(line) {
    if (isOcrBadgeLine(line) || isOcrTimerLine(line)) return false;
    const words = tidyOcrLine(line).split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 2) return false;
    return words.every((word) => word.length >= 3 && /^[A-Z0-9][A-Za-z0-9'’&-]*$/.test(word));
  }

  /**
   * Pull event countdown from noisy OCR. Prefers 1–120 day values (typical event length).
   * Returns e.g. "37d" or "6d 7hr" or "".
   */
  function extractEventTimeRemainingFromOcr(text) {
    const normalized = normalizeOcrForTimers(text);
    const lines = normalized
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const haystacks = [normalized.replace(/\s+/g, " "), ...lines];

    const candidates = [];
    const push = (days, hours, mins, score, source) => {
      const d = Number(days);
      if (!Number.isFinite(d) || d < 1 || d > 120) return;
      const h = hours != null && hours !== "" ? Number(hours) : null;
      const m = mins != null && mins !== "" ? Number(mins) : null;
      if (h != null && (!Number.isFinite(h) || h > 23)) return;
      if (m != null && (!Number.isFinite(m) || m > 59)) return;
      let out = d + "d";
      if (h) out += " " + h + "hr";
      if (m) out += " " + m + "m";
      const fuller = (h ? 6 : 0) + (m ? 3 : 0);
      candidates.push({ out, days: d, score: score + fuller + (d >= 7 && d <= 60 ? 2 : 0), source });
    };

    haystacks.forEach((chunk, idx) => {
      const lineBonus = idx > 0 && chunk.length <= 12 ? 3 : 0;
      let m;
      const reFull =
        /\b(\d{1,3})\s*d(?:ays?)?(?:\s*(\d{1,2})\s*(?:h|hr|hrs|hours?))?(?:\s*(\d{1,2})\s*(?:m|min|mins|minutes?))?\b/gi;
      while ((m = reFull.exec(chunk)) !== null) {
        push(m[1], m[2], m[3], 10 + lineBonus, m[0]);
      }
      const reGlued = /\b(\d{1,3})d\b/gi;
      while ((m = reGlued.exec(chunk)) !== null) {
        push(m[1], null, null, 9 + lineBonus, m[0]);
      }
      // "Remaining: 16d 6h", "Ends in 37 days"
      const reEnds = /(?:ends?\s+in|remaining|left)\s*:?\s*(\d{1,3})\s*d(?:ays?)?(?:\s*(\d{1,2})\s*(?:h|hr|hrs|hours?))?(?:\s*(\d{1,2})\s*(?:m|min|mins|minutes?))?/gi;
      while ((m = reEnds.exec(chunk)) !== null) {
        push(m[1], m[2], m[3], 12 + lineBonus, m[0]);
      }
      // Short line that is only a plausible day count (clock badge OCR dropped the "d")
      if (idx > 0 && /^(\d{1,3})$/.test(chunk)) {
        const n = Number(chunk);
        if (n >= 2 && n <= 90) push(n, null, null, 4, chunk);
      }
      // "37" next to leftover junk from a clock icon: "O 37d", "* 37"
      const reBadge = /(?:^|[\s*•·▪︎○◯◉⏰⏱])(\d{1,3})\s*[dD]?(?:\s|$)/g;
      while ((m = reBadge.exec(chunk)) !== null) {
        if (/d/i.test(m[0])) push(m[1], null, null, 8 + lineBonus, m[0]);
      }
    });

    if (!candidates.length) return "";
    candidates.sort((a, b) => b.score - a.score || b.days - a.days);
    return candidates[0].out;
  }

  /**
   * Heuristic parse of event-banner OCR text → { label, timeRemaining, description, gameHint }.
   */
  function parseExtracurricularScreenshotText(text) {
    const raw = String(text || "").replace(/\r/g, "\n");
    const lines = raw
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const joined = lines.join(" ");
    const timeRemaining = extractEventTimeRemainingFromOcr(raw);

    const isNoise = (line) => {
      const cleaned = tidyOcrLine(line);
      const low = cleaned.toLowerCase();
      if (!cleaned) return true;
      if (isOcrBadgeLine(cleaned) || isOcrTimerLine(cleaned)) return true;
      if (/^\d+([./,]\d+)*$/.test(cleaned)) return true;
      if (/^\d+\s*\/\s*[\d,]+$/.test(cleaned)) return true;
      if (!/[A-Za-z\u00C0-\u024F]/.test(cleaned)) return true;
      if (cleaned.length < 4) return true;
      if (low === "challenge") return true;
      return false;
    };

    const titleCandidates = lines
      .map((line, idx) => {
        let cleaned = tidyOcrLine(line).replace(/\s*\(([ivx]+)\)\s*$/i, "").trim();
        cleaned = cleaned.replace(/^["'“”]+|["'“”]+$/g, "").trim();
        return { line: cleaned, idx };
      })
      .filter((c) => !isNoise(c.line) && c.line.length <= 80 && /[A-Za-z\u00C0-\u024F]{3,}/.test(c.line));

    let label = "";
    if (titleCandidates.length) {
      titleCandidates.sort((a, b) => {
        const score = (c) => {
          const words = c.line.split(/\s+/).length;
          const early = Math.max(0, 12 - c.idx);
          const mixed = /[a-z]/.test(c.line) && /[A-Z]/.test(c.line) ? 3 : 0;
          const pipes = /[|©®]/.test(c.line) ? 6 : 0;
          const junk = /[^A-Za-z0-9'’&,.\-\s]/.test(c.line) ? 10 : 0;
          return early * 2 + Math.min(words, 6) + mixed - pipes - junk;
        };
        return score(b) - score(a);
      });
      const chosen = titleCandidates[0];
      label = chosen.line;
      const next = lines[chosen.idx + 1] ? tidyOcrLine(lines[chosen.idx + 1]) : "";
      if (next && isOcrTitleContinuation(next)) label = tidyOcrLine(label + " " + next);
      const prev = chosen.idx > 0 ? tidyOcrLine(lines[chosen.idx - 1]) : "";
      if (prev && isOcrTitleContinuation(label) && !isOcrBadgeLine(prev) && !isOcrTimerLine(prev) && prev.length > label.length) {
        label = tidyOcrLine(prev + " " + label);
      }
    }

    const descLines = lines.filter((line) => {
      if (isNoise(line)) return false;
      if (label && line.toLowerCase().includes(label.toLowerCase().slice(0, Math.min(12, label.length)))) return false;
      if (timeRemaining && line.toLowerCase().includes(timeRemaining.toLowerCase())) return false;
      return line.length >= 60 && /[a-z]/i.test(line);
    });
    const description = descLines.slice(0, 3).join(" ").trim();

    let gameHint = "";
    const lowAll = joined.toLowerCase();
    if (/\bzzz\b|zenless|ridu chronicles|hollow zero|new eridu/.test(lowAll)) gameHint = "zzz";
    else if (/\bhsr\b|honkai star rail|trailblaze|divergent universe/.test(lowAll)) gameHint = "hsr";
    else if (/\bhi3\b|honkai impact|superstring|memorial arena/.test(lowAll)) gameHint = "hi3";
    else if (/\bwuthering|whimpering wastes|tower of adversity|\bresonators?\b/.test(lowAll)) gameHint = "ww";
    else if (/\bpgr\b|punishing gray|punishing grey|pain cage|warzone/.test(lowAll)) gameHint = "pgr";
    else if (/\bendfield|arknights/.test(lowAll)) gameHint = "akendfield";

    return { label, timeRemaining, description, gameHint, rawText: raw };
  }

  function guessExtracurricularGameId(hint) {
    if (!hint) return "";
    const games = typeof getAllGames === "function" ? getAllGames() : state.games || [];
    const byId = games.find((g) => String(g.id).toLowerCase() === hint);
    if (byId) return byId.id;
    const presets = {
      zzz: [/zenless/i, /\bzzz\b/i],
      hsr: [/star rail/i, /\bhsr\b/i],
      hi3: [/impact 3/i, /\bhi3\b/i],
      ww: [/wuthering/i],
      pgr: [/punishing/i, /\bpgr\b/i],
      akendfield: [/endfield/i, /arknights/i],
    };
    const reList = presets[hint] || [];
    const hit = games.find((g) => reList.some((re) => re.test(g.name || "") || re.test(g.id || "")));
    return hit ? hit.id : "";
  }

  function applyExtracurricularOcrResult(parsed, opts) {
    const o = opts || {};
    const skipDescription = !!o.skipDescription;
    if (!parsed) return;

    const nameInput = document.getElementById("extracurricularTaskName");
    const descInput = document.getElementById("extracurricularTaskDescription");
    const gameSelect = document.getElementById("extracurricularTaskGame");
    const remainingInput = document.getElementById("extracurricularTimeRemainingInput");
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");

    if (parsed.label && nameInput) nameInput.value = parsed.label;

    if (parsed.timeRemaining && remainingInput) {
      if (endTBDInput && endTBDInput.checked) {
        endTBDInput.checked = false;
        if (typeof endTBDInput.onchange === "function") endTBDInput.onchange();
        else endTBDInput.dispatchEvent(new Event("change"));
      }
      remainingInput.value = parsed.timeRemaining;
      applyExtracurricularTimeRemainingFromInput();
    }

    if (!skipDescription && parsed.description && descInput) {
      descInput.value = parsed.description;
    }

    if (parsed.gameHint && gameSelect && !gameSelect.value) {
      const gid = guessExtracurricularGameId(parsed.gameHint);
      if (gid) gameSelect.value = gid;
    }
  }

  function loadImageElement(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load image"));
      };
      img.src = url;
    });
  }

  function ocrTitleScore(label) {
    const text = tidyOcrLine(label);
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    let score = 0;
    if (letters >= 4 && !isOcrBadgeLine(text)) score += 20 + Math.min(letters, 40);
    if (/\b(ofthe|willbe)\b/i.test(text) || /[a-z]i[A-Z]/.test(text)) score -= 6;
    if (/[^A-Za-z0-9'’&,.\-\s]/.test(text)) score -= 10;
    text.split(/\s+/).forEach((word) => {
      const core = word.replace(/[^A-Za-z']/g, "");
      if (!core || core === "&") return;
      if (core.length < 2) score -= 8;
      else if (/^[a-z]/.test(core) && !OCR_TITLE_STOP[core.toLowerCase()]) score -= 8;
    });
    return score;
  }

  function ocrTimeScore(time) {
    const t = String(time || "");
    if (!t) return 0;
    let score = 12;
    if (/\dhr/.test(t)) score += 4;
    const days = parseInt(t, 10);
    if (days >= 7 && days <= 60) score += 2;
    return score;
  }

  /** Longest run of title-case words, skipping badge chips and the countdown. */
  function leadingTitleRun(text) {
    let best = "";
    let bestScore = 0;
    String(text || "").split(/\n/).forEach((raw) => {
      const words = tidyOcrLine(raw).split(/\s+/).filter(Boolean);
      let cur = [];
      const commit = () => {
        const run = cur.join(" ").trim();
        const score = ocrTitleScore(run);
        if (score > bestScore) {
          bestScore = score;
          best = run;
        }
        cur = [];
      };
      words.forEach((word) => {
        const core = word.replace(/[^A-Za-z0-9'’&]/g, "");
        const lower = core.toLowerCase();
        const stop = !!OCR_TITLE_STOP[lower];
        const badge = !!OCR_BADGE_WORDS[lower] || /^\d{1,3}d$/i.test(core) || /^\d{1,2}h$/i.test(core);
        const titleWord = core === "&" || (!badge && !stop && /^[A-Z0-9]/.test(core) && core.length >= 2);
        const keep = titleWord || (stop && cur.length);
        if (keep) cur.push(core === "&" ? "&" : core);
        else commit();
      });
      commit();
    });
    return best;
  }

  function assembleOcrWordsText(words) {
    const items = (words || []).map((word) => ({
      text: String(word.text || "").trim(),
      conf: Number(word.confidence) || 0,
      x: word.bbox ? word.bbox.x0 : 0,
      y: word.bbox ? (word.bbox.y0 + word.bbox.y1) / 2 : 0,
      h: word.bbox ? Math.max(1, word.bbox.y1 - word.bbox.y0) : 1,
    })).filter((word) => {
      if (!word.text) return false;
      if (/^\d{1,3}d$/i.test(word.text) || /^\d{1,2}h$/i.test(word.text)) return word.conf >= 30;
      if (/^(of|the|a|an|&|and)$/i.test(word.text)) return word.conf >= 20;
      return word.conf >= 45;
    });
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const grouped = [];
    items.forEach((word) => {
      const last = grouped[grouped.length - 1];
      if (!last || Math.abs(word.y - last.y) > Math.max(last.h, word.h) * 0.5) {
        grouped.push({ y: word.y, h: word.h, words: [word] });
        return;
      }
      last.words.push(word);
      last.h = Math.max(last.h, word.h);
    });
    return grouped.map((line) => {
      line.words.sort((a, b) => a.x - b.x);
      return tidyOcrLine(line.words.map((word) => word.text).join(" "));
    }).filter(Boolean).join("\n");
  }

  /**
   * Upscale the banner. The mask pass keeps near-white outlined title text.
   */
  function preprocessScreenshotForOcr(img, opts) {
    const o = opts || {};
    const scale = o.scale != null ? o.scale : 2;
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = o.smooth !== false;
    ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, canvas.width, canvas.height);
    if (o.mask) {
      try {
        const cutoff = o.cutoff != null ? o.cutoff : 208;
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = frame.data;
        for (let i = 0; i < d.length; i += 4) {
          const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = y >= cutoff ? 0 : 255;
          d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(frame, 0, 0);
      } catch (_) {}
    }
    return canvas;
  }

  function textVariantsFromOcrResult(result) {
    const data = result && result.data ? result.data : {};
    const fromWords = assembleOcrWordsText(data.words || []);
    const plain = String(data.text || "").trim();
    return [fromWords, plain].filter(Boolean);
  }

  async function recognizeScreenshotText(Tesseract, fileOrBlob) {
    const img = await loadImageElement(fileOrBlob);
    const plain = preprocessScreenshotForOcr(img, { scale: 2 });
    const mask = preprocessScreenshotForOcr(img, { scale: 2, mask: true });
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: () => {},
    });
    try {
      if (worker.setParameters) {
        await worker.setParameters({
          tessedit_pageseg_mode: "11",
          preserve_interword_spaces: "1",
        });
      }
      const sharp = preprocessScreenshotForOcr(img, { scale: 2, mask: true, cutoff: 220, smooth: false });
      const plainRes = await worker.recognize(plain);
      const maskRes = await worker.recognize(mask);
      const sharpRes = await worker.recognize(sharp);
      const plainVariants = textVariantsFromOcrResult(plainRes);
      const variants = plainVariants.concat(textVariantsFromOcrResult(maskRes), textVariantsFromOcrResult(sharpRes));
      let bestLabel = "";
      let bestTitleScore = 0;
      let bestDescription = "";
      let bestTime = "";
      let bestTimeScore = 0;
      const considerTime = (text) => {
        const time = parseExtracurricularScreenshotText(text).timeRemaining;
        const score = ocrTimeScore(time);
        if (score > bestTimeScore) {
          bestTimeScore = score;
          bestTime = time;
        }
      };
      variants.forEach((text) => {
        const parsed = parseExtracurricularScreenshotText(text);
        [{ label: parsed.label, description: parsed.description }, { label: leadingTitleRun(text), description: "" }].forEach((candidate) => {
          const score = ocrTitleScore(candidate.label);
          if (score > bestTitleScore) {
            bestTitleScore = score;
            bestLabel = candidate.label;
            bestDescription = candidate.description || "";
          }
        });
      });
      plainVariants.forEach(considerTime);
      if (!bestTime) variants.forEach(considerTime);
      const hintBlob = variants.join("\n").toLowerCase();
      let hintLine = "";
      if (/\bzzz\b|zenless|ridu chronicles|hollow zero|new eridu/.test(hintBlob)) hintLine = "event details zenless";
      else if (/\bhsr\b|honkai star rail|trailblaze|divergent universe/.test(hintBlob)) hintLine = "event details honkai star rail";
      else if (/\bhi3\b|honkai impact|superstring|memorial arena/.test(hintBlob)) hintLine = "event details honkai impact";
      else if (/\bwuthering|whimpering wastes|tower of adversity|\bresonators?\b/.test(hintBlob)) hintLine = "event details resonators";
      else if (/\bpgr\b|punishing gray|punishing grey|pain cage|warzone/.test(hintBlob)) hintLine = "event details punishing gray";
      else if (/\bendfield|arknights/.test(hintBlob)) hintLine = "event details endfield";
      return [bestLabel, bestTime, bestDescription, hintLine].filter(Boolean).join("\n");
    } finally {
      await worker.terminate();
    }
  }

  async function runExtracurricularScreenshotOcr(fileOrBlob) {
    if (!fileOrBlob) return;
    const skipEl = document.getElementById("extracurricularOcrSkipDescription");
    const skipDescription = !!(skipEl && skipEl.checked);
    setExtracurricularOcrStatus("Loading OCR engine…");
    try {
      const Tesseract = await ensureTesseractLoaded();
      setExtracurricularOcrStatus("Reading screenshot (enhancing image)…");
      const text = await recognizeScreenshotText(Tesseract, fileOrBlob);
      const parsed = parseExtracurricularScreenshotText(text);
      if (!parsed.label && !parsed.timeRemaining && !parsed.description) {
        const preview = text.replace(/\s+/g, " ").trim().slice(0, 100);
        setExtracurricularOcrStatus(
          "Couldn’t read event details — try a tighter crop of the title and timer." +
            (preview ? " OCR saw: “" + preview + "…”" : "")
        );
        return;
      }
      applyExtracurricularOcrResult(parsed, { skipDescription });
      const bits = [];
      if (parsed.label) bits.push("name");
      if (parsed.timeRemaining) bits.push("time left (" + parsed.timeRemaining + ")");
      if (!skipDescription && parsed.description) bits.push("description");
      if (parsed.gameHint) bits.push("game hint");
      let status =
        "Filled: " + (bits.join(", ") || "nothing") + (skipDescription ? " (description skipped)" : "") + ". Review before saving.";
      if (!parsed.timeRemaining) {
        const preview = text.replace(/\s+/g, " ").trim().slice(0, 80);
        status +=
          " Timer not found — enter time remaining manually." +
          (preview ? " OCR snippet: “" + preview + "…”" : "");
      }
      setExtracurricularOcrStatus(status);
    } catch (err) {
      setExtracurricularOcrStatus("OCR failed: " + ((err && err.message) || "unknown error"));
    }
  }

  function initExtracurricularOcrFill() {
    const drop = document.getElementById("extracurricularOcrDrop");
    const fileInput = document.getElementById("extracurricularOcrFile");
    const chooseBtn = document.getElementById("extracurricularOcrChooseBtn");
    if (!drop || !fileInput) return;
    if (drop.dataset.bound === "1") return;
    drop.dataset.bound = "1";

    const onFiles = (files) => {
      const file = files && files[0];
      if (!file || !String(file.type || "").startsWith("image/")) {
        setExtracurricularOcrStatus("Please choose an image file.");
        return;
      }
      runExtracurricularScreenshotOcr(file);
    };

    if (chooseBtn) {
      chooseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        fileInput.click();
      });
    }
    fileInput.addEventListener("change", () => {
      onFiles(fileInput.files);
      fileInput.value = "";
    });
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("is-dragover");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("is-dragover");
      onFiles(e.dataTransfer && e.dataTransfer.files);
    });
    drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    document.addEventListener("paste", (e) => {
      const modal = document.getElementById("extracurricularTaskModal");
      if (!modal || modal.hidden) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item && item.type && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            runExtracurricularScreenshotOcr(blob);
          }
          break;
        }
      }
    });
  }

  function initExtracurricularTaskModal() {
    const modal = document.getElementById("extracurricularTaskModal");
    const closeBtn = document.getElementById("extracurricularTaskModalClose");
    const cancelBtn = document.getElementById("extracurricularTaskModalCancel");
    const form = document.getElementById("extracurricularTaskModalForm");

    if (!modal || !form) return;
    initExtracurricularTimeRemainingInput();
    initExtracurricularOcrFill();

    modal.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeExtracurricularTaskModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeExtracurricularTaskModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeExtracurricularTaskModal);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.hidden) closeExtracurricularTaskModal();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const nameInput = document.getElementById("extracurricularTaskName");
      const startInput = document.getElementById("extracurricularTaskStartDate");
      const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
      const endInput = document.getElementById("extracurricularTaskEndDate");
      const descInput = document.getElementById("extracurricularTaskDescription");
      const gameSelect = document.getElementById("extracurricularTaskGame");
      const currencyInput = document.getElementById("extracurricularTaskCurrency");
      const excludeFromDataInput = document.getElementById("extracurricularTaskExcludeFromData");

      const label = (nameInput && nameInput.value || "").trim();
      if (!label) {
        if (nameInput) nameInput.focus();
        return;
      }

      const task = extracurricularTaskModalState.task;
      const currency = Math.max(0, Number(currencyInput && currencyInput.value) || 0);
      const endTimeInput = document.getElementById("extracurricularTaskEndTime");
      const endTimeVal = endTBDInput && endTBDInput.checked ? null : (endTimeInput && endTimeInput.value ? endTimeInput.value.trim() : null);
      const excludeFromData = !!(excludeFromDataInput && excludeFromDataInput.checked);
      const payload = {
        id: task ? task.id : "ex_" + Date.now(),
        label,
        startDate: startInput && startInput.value ? startInput.value : getDateStr(),
        endDateTBD: !!(endTBDInput && endTBDInput.checked),
        endDate: endTBDInput && endTBDInput.checked ? null : (endInput && endInput.value || null),
        endTime: endTimeVal || undefined,
        description: (descInput && descInput.value || "").trim() || null,
        gameId: (gameSelect && gameSelect.value) || null,
        currency: currency || undefined,
        excludeFromData: excludeFromData || undefined,
      };

      if (typeof setActiveBannerUi === "function") setActiveBannerUi("extra");
      if (typeof commitTaskBannerCrop === "function" && taskBannerCrop.sourceImg && !taskBannerCrop.clear) {
        commitTaskBannerCrop();
      }
      if (typeof applyTaskBannersToSavePayload === "function") applyTaskBannersToSavePayload(payload);
      // Extracurricular: Board crop is also used on the Games page (no separate Games crop).
      if (payload.bannerViews && payload.bannerViews.board && typeof cloneBannerView === "function") {
        payload.bannerViews.games = cloneBannerView(payload.bannerViews.board, payload.bannerViews.board.aspect);
      }

      if (task) {
        const idx = (state.extracurricularTasks || []).findIndex((t) => t.id === task.id);
        if (idx >= 0) {
          const merged = { ...state.extracurricularTasks[idx], ...payload };
          if (!excludeFromData) delete merged.excludeFromData;
          if (typeof clearTaskBannerFieldsFromMerged === "function") clearTaskBannerFieldsFromMerged(merged);
          state.extracurricularTasks[idx] = merged;
        }
      } else {
        state.extracurricularTasks = state.extracurricularTasks || [];
        state.extracurricularTasks.push(payload);
      }
      save();
      closeExtracurricularTaskModal();
      renderActiveTab();
    });

    const gameSelectLive = document.getElementById("extracurricularTaskGame");
    const currencyLive = document.getElementById("extracurricularTaskCurrency");
    const refreshPreview = () => {
      if (activeBannerUiKey !== "extra") return;
      if (taskModal.bannerSource && typeof syncTaskBannerPreview === "function") syncTaskBannerPreview();
    };
    if (gameSelectLive) {
      gameSelectLive.addEventListener("change", () => {
        taskModal.gameId = gameSelectLive.value || null;
        refreshPreview();
      });
    }
    if (currencyLive) currencyLive.addEventListener("input", refreshPreview);
  }
