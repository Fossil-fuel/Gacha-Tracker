  const EXTRACURRICULAR_ARCHIVE_MS = 24 * 60 * 60 * 1000;

  function isExtracurricularArchived(task) {
    const completed = state.extracurricularCompleted[task.id];
    if (!completed) return false;
    const at = state.extracurricularCompletedAt && state.extracurricularCompletedAt[task.id];
    if (!at) return true;
    const completedDate = new Date(at);
    return (getSimulatedNow().getTime() - completedDate.getTime()) > EXTRACURRICULAR_ARCHIVE_MS;
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
    return (state.extracurricularTasks || []).filter((t) => isExtracurricularArchived(t));
  }

  function setExtracurricularCompleted(taskId, completed) {
    state.extracurricularCompleted[taskId] = completed;
    if (completed) {
      if (!state.extracurricularCompletedAt) state.extracurricularCompletedAt = {};
      state.extracurricularCompletedAt[taskId] = getSimulatedNow().toISOString();
    } else {
      if (state.extracurricularCompletedAt) delete state.extracurricularCompletedAt[taskId];
    }
  }

  /** Builds a card for the home page checklist, matching the format of weekly/endgame cards (title, potential, completion status, time remaining). */
  function buildExtracurricularTaskItemForHome(task, tagName) {
    const completed = !!state.extracurricularCompleted[task.id];
    const el = document.createElement(tagName || "div");
    el.className = "task-item home-dwe-checklist-item home-dwe-checklist-item-extracurricular" + (completed ? " done" : "");

    if (task.gameId) {
      const game = getGame(task.gameId);
      if (game) {
        const gameLabel = document.createElement("div");
        gameLabel.className = "task-grid-game-label";
        gameLabel.textContent = game.name || task.gameId;
        el.appendChild(gameLabel);
      }
    }

    const top = document.createElement("div");
    top.className = "task-top";
    const span = document.createElement("span");
    span.className = "task-label home-dwe-checklist-label";
    span.textContent = task.label || "Task";
    top.appendChild(span);
    const pot = Math.max(0, Number(task.currency) || 0);
    if (pot > 0) {
      const potSpan = document.createElement("span");
      potSpan.className = "task-potential";
      potSpan.textContent = "Potential: " + pot;
      top.appendChild(potSpan);
    }
    el.appendChild(top);

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
      save();
      renderAll();
    });
    const label1 = document.createElement("span");
    label1.innerHTML = "<strong>Completion Status:</strong> " + (completed ? "Complete" : "Incomplete");
    span.addEventListener("click", () => {
      setExtracurricularCompleted(task.id, !completed);
      save();
      renderAll();
    });
    left1.appendChild(check);
    left1.appendChild(label1);
    row1.appendChild(left1);
    sub.appendChild(row1);

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
    remainingVal.textContent = getExtracurricularTimeRemainingText(task, getSimulatedNow());
    remainingRow.appendChild(remainingVal);
    sub.appendChild(remainingRow);

    el.appendChild(sub);
    return el;
  }

  function buildExtracurricularTaskItem(task, listOrGrid) {
    const completed = state.extracurricularCompleted[task.id];
    const li = document.createElement("li");
    li.className = "task-item task-item-with-changer";
    if (completed) li.classList.add("done");

    if (task.gameId) {
      const game = getGame(task.gameId);
      if (game) {
        const gameLabel = document.createElement("div");
        gameLabel.className = "extracurricular-task-game-label";
        gameLabel.textContent = game.name || task.gameId;
        li.appendChild(gameLabel);
      }
    }

    const top = document.createElement("div");
    top.className = "task-item-top";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task-checkbox";
    checkbox.checked = !!completed;
    checkbox.addEventListener("change", () => {
      setExtracurricularCompleted(task.id, checkbox.checked);
      save();
      renderAll();
    });
    top.appendChild(checkbox);
    const labelWrap = document.createElement("div");
    labelWrap.className = "task-item-info";
    const label = document.createElement("span");
    label.className = "task-label";
    label.textContent = task.label || "Task";
    const info = document.createElement("span");
    info.className = "extracurricular-task-info";
    const startStr = task.startDate || "";
    const endStr = task.endDateTBD ? "TBD" : (task.endDate || "");
    info.textContent = startStr + (endStr ? " — " + endStr : "");
    labelWrap.appendChild(label);
    labelWrap.appendChild(info);
    const remainingText = getExtracurricularTimeRemainingText(task, getSimulatedNow());
    if (remainingText !== "TBD") {
      const remainingSpan = document.createElement("span");
      remainingSpan.className = "extracurricular-task-remaining";
      remainingSpan.textContent = " · " + remainingText + " left";
      labelWrap.appendChild(remainingSpan);
    }
    top.appendChild(labelWrap);
    const actions = document.createElement("div");
    actions.className = "task-item-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "✎";
    editBtn.setAttribute("aria-label", "Edit task");
    editBtn.addEventListener("click", () => openExtracurricularTaskModal(task));
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", "Delete task");
    deleteBtn.addEventListener("click", () => deleteExtracurricularTask(task.id));
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    top.appendChild(actions);
    li.appendChild(top);
    if (task.description) {
      const desc = document.createElement("p");
      desc.className = "extracurricular-task-desc";
      desc.textContent = task.description;
      li.appendChild(desc);
    }
    return li;
  }

  function renderExtracurricular() {
    const container = document.getElementById("extracurricularContent");
    if (!container) return;
    container.innerHTML = "";
    const viewMode = state.extracurricularViewMode || "tasks";
    const view = state.extracurricularView || "list";

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
        renderAll();
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
        renderAll();
      });
      headerRow.appendChild(tasksBtn);
    }
    container.appendChild(headerRow);

    const tasks = viewMode === "history" ? getArchivedExtracurricularTasks() : getActiveExtracurricularTasks();

    if (tasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = viewMode === "history"
        ? "No archived tasks. Completed tasks stay in the list for 24 hours, then move here."
        : "No extracurricular tasks yet. Add one to get started.";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("ul");
    list.className = "task-list" + (view === "grid" ? " task-list-grid" : "");
    tasks.forEach((task) => list.appendChild(buildExtracurricularTaskItem(task)));
    container.appendChild(list);
  }

  function updateExtracurricularTimeRemainingDisplay() {
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
    const endInput = document.getElementById("extracurricularTaskEndDate");
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
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const endOfDay = new Date(y, mo, d, 23, 59, 59);
    const now = getSimulatedNow();
    const ms = endOfDay.getTime() - now.getTime();
    input.value = ms > 0 ? formatRemainingMs(ms) : "Not Available";
  }

  function applyExtracurricularTimeRemainingFromInput() {
    const input = document.getElementById("extracurricularTimeRemainingInput");
    const endInput = document.getElementById("extracurricularTaskEndDate");
    const endTBDInput = document.getElementById("extracurricularTaskEndDateTBD");
    if (!input || !endInput) return;
    const remainingMs = parseTimeRemainingToMs(input.value.trim());
    if (remainingMs == null || remainingMs <= 0) return;
    const now = getSimulatedNow();
    const endDate = new Date(now.getTime() + remainingMs);
    const endStr = getDateStr(endDate);
    endInput.value = endStr;
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
    const descInput = document.getElementById("extracurricularTaskDescription");
    const gameSelect = document.getElementById("extracurricularTaskGame");

    if (title) title.textContent = task ? "Edit task" : "Add task";
    const currencyInput = document.getElementById("extracurricularTaskCurrency");
    if (nameInput) nameInput.value = task ? (task.label || "") : "";
    if (startInput) startInput.value = task && task.startDate ? task.startDate : getDateStr();
    if (endTBDInput) endTBDInput.checked = !!(task && task.endDateTBD);
    if (endInput) {
      endInput.value = task && task.endDate ? task.endDate : "";
      endInput.disabled = !!(task && task.endDateTBD);
    }
    if (descInput) descInput.value = task ? (task.description || "") : "";
    if (currencyInput) currencyInput.value = task && task.currency != null ? String(task.currency) : "";
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
    if (endRow) endRow.style.display = endTBDInput && endTBDInput.checked ? "none" : "";
    if (endTBDInput) {
      endTBDInput.onchange = () => {
        if (endInput) endInput.disabled = endTBDInput.checked;
        if (endRow) endRow.style.display = endTBDInput.checked ? "none" : "";
        updateExtracurricularTimeRemainingDisplay();
      };
    }
    if (endInput) {
      endInput.onchange = updateExtracurricularTimeRemainingDisplay;
      endInput.oninput = updateExtracurricularTimeRemainingDisplay;
    }

    updateExtracurricularTimeRemainingDisplay();

    if (modal) {
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
    extracurricularTaskModalState.task = task;
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function closeExtracurricularTaskModal() {
    const modal = document.getElementById("extracurricularTaskModal");
    if (modal) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
    extracurricularTaskModalState.task = null;
  }

  function deleteExtracurricularTask(taskId) {
    state.extracurricularTasks = (state.extracurricularTasks || []).filter((t) => t.id !== taskId);
    delete state.extracurricularCompleted[taskId];
    if (state.extracurricularCompletedAt) delete state.extracurricularCompletedAt[taskId];
    save();
    renderAll();
  }

  const extracurricularTaskModalState = { task: null };

  function initExtracurricularTaskModal() {
    const modal = document.getElementById("extracurricularTaskModal");
    const closeBtn = document.getElementById("extracurricularTaskModalClose");
    const cancelBtn = document.getElementById("extracurricularTaskModalCancel");
    const form = document.getElementById("extracurricularTaskModalForm");

    if (!modal || !form) return;
    initExtracurricularTimeRemainingInput();

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

      const label = (nameInput && nameInput.value || "").trim();
      if (!label) {
        if (nameInput) nameInput.focus();
        return;
      }

      const task = extracurricularTaskModalState.task;
      const currency = Math.max(0, Number(currencyInput && currencyInput.value) || 0);
      const payload = {
        id: task ? task.id : "ex_" + Date.now(),
        label,
        startDate: startInput && startInput.value ? startInput.value : getDateStr(),
        endDateTBD: !!(endTBDInput && endTBDInput.checked),
        endDate: endTBDInput && endTBDInput.checked ? null : (endInput && endInput.value || null),
        description: (descInput && descInput.value || "").trim() || null,
        gameId: (gameSelect && gameSelect.value) || null,
        currency: currency || undefined,
      };

      if (task) {
        const idx = (state.extracurricularTasks || []).findIndex((t) => t.id === task.id);
        if (idx >= 0) state.extracurricularTasks[idx] = { ...state.extracurricularTasks[idx], ...payload };
      } else {
        state.extracurricularTasks = state.extracurricularTasks || [];
        state.extracurricularTasks.push(payload);
      }
      save();
      closeExtracurricularTaskModal();
      renderAll();
    });
  }
