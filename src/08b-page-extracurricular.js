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
    const snippetParts = [];
    if (task.description) snippetParts.push(task.description);
    else if (dateLine) snippetParts.push(dateLine);
    snippetParts.push("Potential: " + pot + " · Earned: " + earnedStr);
    if (remainingText && remainingText !== "TBD") snippetParts.push(remainingText + " left");
    const snippet = document.createElement("p");
    snippet.className = "task-card-snippet";
    snippet.textContent = snippetParts.join(" · ");
    body.appendChild(snippet);

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
    body.appendChild(meta);

    return li;
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
    container.appendChild(headerRow);

    const tasksRaw = viewMode === "history" ? getArchivedExtracurricularTasks() : getActiveExtracurricularTasks();
    const now = getSimulatedNow();
    // Active board: due-date / completion sort. History: leave in saved order (no re-sort).
    const tasks = viewMode === "history"
      ? tasksRaw
      : sortBoardTaskEntries(tasksRaw.map((task, taskOrder) => {
          const rem = getExtracurricularTimeRemainingMs(task, now);
          return {
            task,
            completed: !!state.extracurricularCompleted[task.id],
            dueMs: rem == null ? Number.POSITIVE_INFINITY : (now.getTime() + rem),
            gameOrder: 0,
            taskOrder,
          };
        })).map((entry) => entry.task);

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
    list.className = "task-grid task-grid-knot";
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

  function openExtracurricularTaskModal(task) {
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
        if (task && task.gameId === g.id) opt.selected = true;
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
    taskModal.gameId = (task && task.gameId) || null;
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
    "ridu chronicles",
    "summer vibes",
    "select all",
    "unselect all",
    "fill from screenshot",
  ];

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
      candidates.push({ out, days: d, score: score + (d >= 7 && d <= 60 ? 2 : 0), source });
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
      // "37 days left", "Ends in 37 days"
      const reEnds = /(?:ends?\s+in|remaining|left)\s*:?\s*(\d{1,3})\s*d(?:ays?)?/gi;
      while ((m = reEnds.exec(chunk)) !== null) {
        push(m[1], null, null, 12 + lineBonus, m[0]);
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
      const low = line.toLowerCase();
      if (OCR_UI_NOISE.some((n) => low === n || low.includes(n))) return true;
      if (/^\d+([./,]\d+)*$/.test(line)) return true;
      if (/^\d+\s*\/\s*[\d,]+$/.test(line)) return true;
      if (!/[A-Za-z\u00C0-\u024F]/.test(line)) return true;
      if (line.length < 4) return true;
      return false;
    };

    const titleCandidates = lines
      .map((line, idx) => {
        let cleaned = line.replace(/\s*\(([ivx]+)\)\s*$/i, "").trim();
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
          return early * 2 + Math.min(words, 6) + mixed;
        };
        return score(b) - score(a);
      });
      label = titleCandidates[0].line;
    }

    const descLines = lines.filter((line) => {
      if (isNoise(line)) return false;
      if (label && line.toLowerCase().includes(label.toLowerCase().slice(0, Math.min(12, label.length)))) return false;
      if (timeRemaining && line.toLowerCase().includes(timeRemaining.toLowerCase())) return false;
      return line.length >= 40 && /[a-z]/i.test(line);
    });
    const description = descLines.slice(0, 3).join(" ").trim();

    let gameHint = "";
    const lowAll = joined.toLowerCase();
    if (/\bzzz\b|zenless|ridu chronicles|hollow zero|new eridu/.test(lowAll)) gameHint = "zzz";
    else if (/\bhsr\b|honkai star rail|trailblaze|divergent universe/.test(lowAll)) gameHint = "hsr";
    else if (/\bhi3\b|honkai impact|superstring|memorial arena/.test(lowAll)) gameHint = "hi3";
    else if (/\bwuthering|whimpering wastes|tower of adversity/.test(lowAll)) gameHint = "ww";
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

  /**
   * Upscale + contrast boost; optional top-band crop for event timers in the header.
   * Returns a canvas (Tesseract accepts canvas/HTMLImageElement).
   */
  function preprocessScreenshotForOcr(img, opts) {
    const o = opts || {};
    const topFraction = o.topFraction != null ? o.topFraction : 1;
    const scale = o.scale != null ? o.scale : 2;
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const cropH = Math.max(1, Math.round(srcH * Math.min(1, Math.max(0.15, topFraction))));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(cropH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, srcW, cropH, 0, 0, canvas.width, canvas.height);
    try {
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = frame.data;
      for (let i = 0; i < d.length; i += 4) {
        // luma + contrast stretch toward black/white (helps white outlined UI text)
        let y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        y = (y - 128) * 1.35 + 128;
        y = y < 0 ? 0 : y > 255 ? 255 : y;
        // Soft threshold: keep midtones but punch text
        const v = y > 170 ? 255 : y < 90 ? 0 : y;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(frame, 0, 0);
    } catch (_) {
      // tainted canvas / security — return unprocessed draw
    }
    return canvas;
  }

  async function recognizeScreenshotText(Tesseract, fileOrBlob) {
    const img = await loadImageElement(fileOrBlob);
    const full = preprocessScreenshotForOcr(img, { topFraction: 1, scale: 2 });
    const top = preprocessScreenshotForOcr(img, { topFraction: 0.42, scale: 2.5 });
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: () => {},
    });
    try {
      // Sparse UI text helps timers/titles on busy art
      if (worker.setParameters) {
        await worker.setParameters({
          tessedit_pageseg_mode: "11",
          preserve_interword_spaces: "1",
        });
      }
      const [fullRes, topRes] = await Promise.all([worker.recognize(full), worker.recognize(top)]);
      const a = (fullRes && fullRes.data && fullRes.data.text) || "";
      const b = (topRes && topRes.data && topRes.data.text) || "";
      return (a + "\n" + b).trim();
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
