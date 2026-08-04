  function appendCycleEndedBadge(parent, task, game) {
    if (!isTaskCycleEnded(task, getSimulatedNow(), game)) return;
    const bounds = getLastCycleBounds(task, game);
    const badge = document.createElement("span");
    badge.className = "task-cycle-ended-badge";
    badge.textContent = bounds
      ? "Ended · last cycle " + formatDate(new Date(bounds.endStr + "T12:00:00"))
      : "Ended";
    parent.appendChild(badge);
  }

  /** Tag showing when calendar tally counting began (first completion or dateStarted). */
  function appendCountingSinceTag(parent, game, type, key) {
    const startStr = getTaskTallyStartDate(game, type, key);
    const firstComplete = getTaskFirstCalendarCompletionDate(game, type, key);
    const tag = document.createElement("span");
    tag.className = "task-counting-since-tag";
    if (startStr) {
      tag.textContent = "Counting since: " + formatDate(new Date(startStr + "T12:00:00"));
      if (firstComplete && firstComplete === startStr) {
        tag.title = "First calendar completion (" + startStr + "). Completed/attempted tallies start from this date.";
      } else if (!firstComplete) {
        tag.title = "Counting from cycle start date (" + startStr + ") even without a completion that day.";
      } else {
        tag.title = "Counting from cycle start date (" + startStr + "). First completion was " + firstComplete + ".";
      }
    } else {
      tag.textContent = "Counting since: —";
      tag.title = "No calendar completions yet. Tallies start after the first completion, or enable “Count from cycle start date” on the task.";
    }
    parent.appendChild(tag);
    return tag;
  }

  /** Shell for Games weeklies/endgame cards: left media + right main column. */
  function createGamesManagedTaskCard(selected, t, taskType) {
    const key = selected.id + "." + (t.id || t.label);
    const li = document.createElement("li");
    li.className = "task-item task-item-with-changer games-task-card";
    appendGamesTaskSideMedia(li, t);

    const main = document.createElement("div");
    main.className = "games-task-main";

    const top = document.createElement("div");
    top.className = "task-item-top games-task-top";

    const header = document.createElement("div");
    header.className = "games-task-header";
    const titleLine = document.createElement("div");
    titleLine.className = "games-task-title-line";
    const label = document.createElement("span");
    label.className = "task-label";
    label.textContent = t.label || "";
    titleLine.appendChild(label);
    header.appendChild(titleLine);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "✎";
    editBtn.setAttribute("aria-label", "Edit task");
    editBtn.addEventListener("click", () => openTaskModal({ gameId: selected.id, taskType: taskType, task: t }));
    header.appendChild(editBtn);
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "icon-btn";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", "Delete task");
    deleteBtn.addEventListener("click", () => {
      deleteGameBoardTask(selected.id, taskType, t.id || t.label);
    });
    header.appendChild(deleteBtn);
    top.appendChild(header);

    const meta = document.createElement("div");
    meta.className = "games-task-meta";

    const metaLine = document.createElement("div");
    metaLine.className = "games-task-meta-line";
    const resetSpan = document.createElement("span");
    resetSpan.className = "games-task-reset";
    resetSpan.textContent = "Resets: " + (
      taskType === "endgame"
        ? getEndgameResetDisplay(t, getSimulatedNow(), selected)
        : getWeeklyResetDisplay(t, getSimulatedNow(), selected)
    );
    metaLine.appendChild(resetSpan);

    const dateStartSpan = document.createElement("span");
    dateStartSpan.className = taskType === "endgame" ? "games-endgame-date-start" : "games-weekly-date-start";
    const ds = isValidDateStr(t.dateStarted) ? t.dateStarted : getDateStr();
    const dsDate = new Date(ds + "T12:00:00");
    dateStartSpan.textContent = "Started: " + formatDate(dsDate);
    dateStartSpan.title = "Date started: " + ds;
    metaLine.appendChild(dateStartSpan);
    meta.appendChild(metaLine);

    appendCountingSinceTag(meta, selected, taskType, key);
    appendCycleEndedBadge(meta, t, selected);
    top.appendChild(meta);

    main.appendChild(top);
    li.appendChild(main);
    return { li, main, key };
  }

  function appendGamesTaskBottom(main, selected, t, taskType, potentialText) {
    const bottom = document.createElement("div");
    bottom.className = "games-task-bottom";
    const right = document.createElement("div");
    right.className = "games-task-bottom-right";
    const potSpan = document.createElement("span");
    potSpan.className = "games-task-potential";
    potSpan.textContent = potentialText;
    right.appendChild(potSpan);
    appendTaskCycleEndFooter(right, selected, t, taskType);
    bottom.appendChild(right);
    main.appendChild(bottom);
  }

  function formatCountingSinceLabel(game, type, key) {
    const startStr = getTaskTallyStartDate(game, type, key);
    if (!startStr) return "Counting since: —";
    return "Counting since: " + formatDate(new Date(startStr + "T12:00:00"));
  }

  /** Prevent number inputs from blurring (and firing change) when clicking Sync. */
  function bindSyncButton(btn, onSync) {
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", onSync);
  }

  const gameIdentityModalState = {
    open: false,
    gameId: null,
    sourceImg: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    shape: "rounded",
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    panStartX: 0,
    panStartY: 0,
    clearIcon: false,
  };

  function setGameIdentityModalOpen(open) {
    const el = document.getElementById("gameIdentityModal");
    if (!el) return;
    gameIdentityModalState.open = !!open;
    el.hidden = !open;
    el.setAttribute("aria-hidden", open ? "false" : "true");
  }

  function closeGameIdentityModal() {
    setGameIdentityModalOpen(false);
    gameIdentityModalState.gameId = null;
    gameIdentityModalState.sourceImg = null;
    gameIdentityModalState.clearIcon = false;
  }

  function syncGameIdentityShapeButtons() {
    document.querySelectorAll(".game-icon-shape-btn").forEach((btn) => {
      const active = btn.dataset.shape === gameIdentityModalState.shape;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const frame = document.getElementById("gameIdentityCropFrame");
    const wrap = document.getElementById("gameIdentityCropWrap");
    if (frame) {
      frame.className = "game-icon-crop-frame game-icon-crop-frame-" + gameIdentityModalState.shape;
    }
    if (wrap) {
      wrap.className = "game-icon-crop-wrap game-icon-crop-wrap-" + gameIdentityModalState.shape;
    }
  }

  function updateGameIdentityLivePreview() {
    const box = document.getElementById("gameIdentityLivePreview");
    if (!box) return;
    const nameInput = document.getElementById("gameIdentityName");
    const subInput = document.getElementById("gameIdentitySubtitle");
    const draft = {
      name: (nameInput && nameInput.value.trim()) || "Game",
      subtitle: (subInput && subInput.value.trim()) || "",
      iconShape: gameIdentityModalState.shape,
      iconImage: null,
    };
    if (!gameIdentityModalState.clearIcon) {
      if (gameIdentityModalState.sourceImg) {
        draft.iconImage = exportGameIdentityCropDataUrl(96) || null;
      } else {
        const game = getGame(gameIdentityModalState.gameId);
        if (game && game.iconImage) draft.iconImage = game.iconImage;
      }
    }
    box.innerHTML = "";
    const label = document.createElement("div");
    label.className = "game-identity-preview-label";
    label.textContent = "Preview";
    box.appendChild(label);
    box.appendChild(buildGameIdentityHeader(draft, { className: "games-selected-identity", showPlaceholder: true }));
  }

  function drawGameIdentityCrop() {
    const canvas = document.getElementById("gameIdentityCropCanvas");
    const empty = document.getElementById("gameIdentityCropEmpty");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, w, h);
    const img = gameIdentityModalState.sourceImg;
    if (!img) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    const base = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const scale = base * gameIdentityModalState.zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const x = (w - drawW) / 2 + gameIdentityModalState.panX;
    const y = (h - drawH) / 2 + gameIdentityModalState.panY;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, drawW, drawH);
  }

  function exportGameIdentityCropDataUrl(outSize) {
    const img = gameIdentityModalState.sourceImg;
    if (!img) return null;
    const stage = 280;
    const size = outSize || 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const base = Math.max(stage / img.naturalWidth, stage / img.naturalHeight);
    const scale = base * gameIdentityModalState.zoom;
    const drawW = img.naturalWidth * scale * (size / stage);
    const drawH = img.naturalHeight * scale * (size / stage);
    const x = (size - drawW) / 2 + gameIdentityModalState.panX * (size / stage);
    const y = (size - drawH) / 2 + gameIdentityModalState.panY * (size / stage);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, drawW, drawH);
    return canvas.toDataURL("image/jpeg", 0.88);
  }

  function loadGameIdentitySourceFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        gameIdentityModalState.sourceImg = img;
        gameIdentityModalState.zoom = 1;
        gameIdentityModalState.panX = 0;
        gameIdentityModalState.panY = 0;
        gameIdentityModalState.clearIcon = false;
        const zoom = document.getElementById("gameIdentityZoom");
        if (zoom) zoom.value = "1";
        drawGameIdentityCrop();
        updateGameIdentityLivePreview();
        resolve();
      };
      img.onerror = () => reject(new Error("Could not load image."));
      img.src = url;
    });
  }

  async function openGameIdentityModal(gameId) {
    const game = getGame(gameId);
    if (!game) return;
    gameIdentityModalState.gameId = gameId;
    gameIdentityModalState.shape = (game.iconShape === "circle" || game.iconShape === "square") ? game.iconShape : "rounded";
    gameIdentityModalState.clearIcon = false;
    gameIdentityModalState.sourceImg = null;
    const nameInput = document.getElementById("gameIdentityName");
    const subInput = document.getElementById("gameIdentitySubtitle");
    if (nameInput) nameInput.value = game.name || "";
    if (subInput) subInput.value = game.subtitle || "";
    syncGameIdentityShapeButtons();
    drawGameIdentityCrop();
    if (game.iconImage) {
      try {
        await loadGameIdentitySourceFromUrl(game.iconImage);
      } catch (_) {
        updateGameIdentityLivePreview();
      }
    } else {
      const empty = document.getElementById("gameIdentityCropEmpty");
      if (empty) empty.hidden = false;
      updateGameIdentityLivePreview();
    }
    setGameIdentityModalOpen(true);
    if (nameInput) setTimeout(() => nameInput.focus(), 0);
  }

  function initGameIdentityModal() {
    const modalEl = document.getElementById("gameIdentityModal");
    const form = document.getElementById("gameIdentityForm");
    const closeBtn = document.getElementById("gameIdentityModalClose");
    const cancelBtn = document.getElementById("gameIdentityModalCancel");
    const chooseBtn = document.getElementById("gameIdentityChooseIconBtn");
    const clearBtn = document.getElementById("gameIdentityClearIconBtn");
    const fileInput = document.getElementById("gameIdentityIconFile");
    const zoom = document.getElementById("gameIdentityZoom");
    const canvas = document.getElementById("gameIdentityCropCanvas");
    const nameInput = document.getElementById("gameIdentityName");
    const subInput = document.getElementById("gameIdentitySubtitle");
    if (!modalEl || !form) return;

    modalEl.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeGameIdentityModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeGameIdentityModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeGameIdentityModal);
    document.addEventListener("keydown", (e) => {
      if (!gameIdentityModalState.open) return;
      if (e.key === "Escape") closeGameIdentityModal();
    });

    document.querySelectorAll(".game-icon-shape-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        gameIdentityModalState.shape = btn.dataset.shape || "rounded";
        syncGameIdentityShapeButtons();
        updateGameIdentityLivePreview();
      });
    });

    if (chooseBtn && fileInput) {
      chooseBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        try {
          const dataUrl = await compressImageFileToDataUrl(file, { maxWidth: 1200, quality: 0.92 });
          await loadGameIdentitySourceFromUrl(dataUrl);
        } catch (err) {
          alert((err && err.message) || "Could not use that image.");
        }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        gameIdentityModalState.sourceImg = null;
        gameIdentityModalState.clearIcon = true;
        gameIdentityModalState.zoom = 1;
        gameIdentityModalState.panX = 0;
        gameIdentityModalState.panY = 0;
        if (zoom) zoom.value = "1";
        drawGameIdentityCrop();
        updateGameIdentityLivePreview();
      });
    }
    if (zoom) {
      zoom.addEventListener("input", () => {
        gameIdentityModalState.zoom = Number(zoom.value) || 1;
        drawGameIdentityCrop();
        updateGameIdentityLivePreview();
      });
    }
    if (nameInput) nameInput.addEventListener("input", updateGameIdentityLivePreview);
    if (subInput) subInput.addEventListener("input", updateGameIdentityLivePreview);

    if (canvas) {
      const onDown = (clientX, clientY) => {
        if (!gameIdentityModalState.sourceImg) return;
        gameIdentityModalState.dragging = true;
        gameIdentityModalState.dragStartX = clientX;
        gameIdentityModalState.dragStartY = clientY;
        gameIdentityModalState.panStartX = gameIdentityModalState.panX;
        gameIdentityModalState.panStartY = gameIdentityModalState.panY;
      };
      const onMove = (clientX, clientY) => {
        if (!gameIdentityModalState.dragging) return;
        gameIdentityModalState.panX = gameIdentityModalState.panStartX + (clientX - gameIdentityModalState.dragStartX);
        gameIdentityModalState.panY = gameIdentityModalState.panStartY + (clientY - gameIdentityModalState.dragStartY);
        drawGameIdentityCrop();
      };
      const onUp = () => {
        if (!gameIdentityModalState.dragging) return;
        gameIdentityModalState.dragging = false;
        updateGameIdentityLivePreview();
      };
      canvas.addEventListener("mousedown", (e) => {
        e.preventDefault();
        onDown(e.clientX, e.clientY);
      });
      window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
      window.addEventListener("mouseup", onUp);
      canvas.addEventListener("touchstart", (e) => {
        if (!e.touches || !e.touches[0]) return;
        onDown(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      canvas.addEventListener("touchmove", (e) => {
        if (!e.touches || !e.touches[0]) return;
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });
      canvas.addEventListener("touchend", onUp);
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const game = getGame(gameIdentityModalState.gameId);
      if (!game) return;
      const name = nameInput && nameInput.value.trim();
      if (!name) {
        if (nameInput) nameInput.focus();
        return;
      }
      game.name = name;
      const sub = subInput && subInput.value.trim();
      if (sub) game.subtitle = sub;
      else delete game.subtitle;
      game.iconShape = gameIdentityModalState.shape;
      if (gameIdentityModalState.clearIcon) {
        delete game.iconImage;
      } else if (gameIdentityModalState.sourceImg) {
        const cropped = exportGameIdentityCropDataUrl(256);
        if (cropped) game.iconImage = cropped;
      }
      save();
      closeGameIdentityModal();
      renderActiveTab();
    });
  }

  function renderGames() {
    const container = document.getElementById("gamesContainer");
    if (!container) return;
    container.innerHTML = "";
    const games = getAllGames();
    if (games.length === 0) {
      container.innerHTML = '<p class="empty-state">No games yet. Add one using "+ Add game" in the sidebar.</p>';
      return;
    }
    const selected = getGame(state.gamesSelectedId) || games[0];
    const titleRow = document.createElement("div");
    titleRow.className = "games-title-row";
    const identity = buildGameIdentityHeader(selected, {
      className: "games-selected-identity",
      showPlaceholder: true,
      interactive: true,
    });
    identity.addEventListener("click", () => openGameIdentityModal(selected.id));
    identity.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openGameIdentityModal(selected.id);
      }
    });
    titleRow.appendChild(identity);

    const actions = document.createElement("div");
    actions.className = "games-title-actions";
    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = "btn btn-ghost games-sync-btn";
    syncBtn.textContent = "Sync with Calendar";
    syncBtn.setAttribute("aria-label", "Sync all tasks from calendar history");
    syncBtn.title = "Update Completed/Attempted for all tasks from calendar history";
    bindSyncButton(syncBtn, () => {
      syncAllTasksForGame(selected);
    });
    actions.appendChild(syncBtn);
    const clearDataBtn = document.createElement("button");
    clearDataBtn.type = "button";
    clearDataBtn.className = "btn btn-ghost games-clear-data-btn";
    clearDataBtn.textContent = "Clear Data";
    clearDataBtn.setAttribute("aria-label", "Clear all attempts and completions for this game");
    clearDataBtn.title = "Reset all attempts and completions to zero";
    clearDataBtn.addEventListener("click", () => openClearGameDataModal(selected.id));
    actions.appendChild(clearDataBtn);
    const deleteGameBtn = document.createElement("button");
    deleteGameBtn.type = "button";
    deleteGameBtn.className = "btn btn-ghost games-delete-btn";
    deleteGameBtn.textContent = "Delete game";
    deleteGameBtn.addEventListener("click", () => deleteGame(selected.id));
    actions.appendChild(deleteGameBtn);
    titleRow.appendChild(actions);
    container.appendChild(titleRow);
    const titleSep = document.createElement("div");
    titleSep.className = "games-separator";
    container.appendChild(titleSep);
    const subTabs = document.createElement("div");
    subTabs.className = "games-sub-tabs";
    ["dailies", "weeklies", "endgame", "extracurricular", "currency"].forEach((sub) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "games-sub-tab" + (state.gamesSubTab === sub ? " active" : "");
      btn.textContent = sub === "currency" ? "Currency" : sub.charAt(0).toUpperCase() + sub.slice(1);
      btn.addEventListener("click", () => {
        state.gamesSubTab = sub;
        renderGames();
      });
      subTabs.appendChild(btn);
    });
    container.appendChild(subTabs);
    const content = document.createElement("div");
    content.className = "games-content";
    if (state.gamesSubTab === "dailies") {
      const serverRow = document.createElement("div");
      serverRow.className = "endgame-currency-row endgame-currency-row-with-desc";
      serverRow.innerHTML = "<label>Server</label>";
      const serverInner = document.createElement("div");
      serverInner.className = "endgame-currency-row-inner";
      const serverSelect = document.createElement("select");
      serverSelect.className = "settings-select";
      SERVER_OPTIONS.forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt.id;
        o.textContent = opt.label + " (" + (opt.offsetMinutes >= 0 ? "UTC+" : "UTC") + (opt.offsetMinutes / 60) + ")";
        serverSelect.appendChild(o);
      });
      serverSelect.value = selected.server && ["america", "asia", "europe"].includes(selected.server) ? selected.server : "america";
      serverSelect.addEventListener("change", () => {
        selected.server = serverSelect.value;
        save();
        renderActiveTab();
      });
      const serverDesc = document.createElement("span");
      serverDesc.className = "endgame-currency-desc";
      serverDesc.textContent = "Reset is 4am server time (3am when DST inactive). Your display timezone shifts the shown time.";
      serverInner.appendChild(serverSelect);
      serverInner.appendChild(serverDesc);
      serverRow.appendChild(serverInner);
      content.appendChild(serverRow);

      const resetRow = document.createElement("div");
      resetRow.className = "endgame-currency-row";
      resetRow.innerHTML = "<label>Daily reset time</label>";
      const resetInput = document.createElement("input");
      resetInput.type = "time";
      resetInput.step = "60";
      const h = Number.isFinite(selected.resetHour) ? selected.resetHour : 4;
      const m = Number.isFinite(selected.resetMinute) ? selected.resetMinute : 0;
      resetInput.value = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
      resetInput.addEventListener("change", () => {
        const [hh, mm] = (resetInput.value || "04:00").split(":").map(Number);
        selected.resetHour = hh;
        selected.resetMinute = mm;
        save();
        renderActiveTab();
      });
      resetRow.appendChild(resetInput);
      content.appendChild(resetRow);

      const dstRow = document.createElement("div");
      dstRow.className = "endgame-currency-row endgame-currency-row-with-desc";
      dstRow.innerHTML = "<label>Adjust for DST</label>";
      const dstInner = document.createElement("div");
      dstInner.className = "endgame-currency-row-inner";
      const dstToggle = document.createElement("input");
      dstToggle.type = "checkbox";
      dstToggle.className = "dst-toggle";
      dstToggle.checked = selected.adjustForDST !== false;
      dstToggle.setAttribute("aria-label", "Adjust reset time for daylight saving");
      dstToggle.addEventListener("change", () => {
        selected.adjustForDST = dstToggle.checked;
        save();
        renderActiveTab();
      });
      const dstDesc = document.createElement("span");
      dstDesc.className = "endgame-currency-desc";
      dstDesc.textContent = "When on, reset shifts from 4am to 3am when DST is inactive (after first Sunday of November).";
      dstInner.appendChild(dstToggle);
      dstInner.appendChild(dstDesc);
      dstRow.appendChild(dstInner);
      content.appendChild(dstRow);

      const row = document.createElement("div");
      row.className = "endgame-currency-row";
      row.innerHTML = "<label>Daily currency (potential)</label>";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.placeholder = "0";
      input.value = String(Math.max(0, Number(selected.dailyCurrency) || 0));
      input.addEventListener("change", () => {
        selected.dailyCurrency = Math.max(0, Number(input.value) || 0);
        save();
        renderActiveTab();
      });
      row.appendChild(input);
      content.appendChild(row);

      const changerRow = document.createElement("div");
      changerRow.className = "endgame-currency-row games-changer-row";
      changerRow.innerHTML = "<label>Completed amount:</label>";
      const changerInput = document.createElement("input");
      changerInput.type = "number";
      changerInput.min = "0";
      changerInput.placeholder = "0";
      changerInput.value = String(getCompletedAmount(state.dailiesCompleted, selected.id));
      changerInput.addEventListener("change", () => {
        const old = getCompletedAmount(state.dailiesCompleted, selected.id);
        const v = Math.max(0, Number(changerInput.value) || 0);
        if (v === old) return;
        state.dailiesCompleted[selected.id] = v;
        const dateStr = getDailyPeriodDateStr(selected, getSimulatedNow());
        // Tallies are set explicitly above; write path only syncs calendar/timestamp.
        if (v) applyTaskCompletion("dailies", selected.id, { dateStr, updateTallies: false });
        else removeTaskCompletion("dailies", selected.id, { dateStr, updateTallies: false });
      });
      changerRow.appendChild(changerInput);
      content.appendChild(changerRow);

      const attemptRow = document.createElement("div");
      attemptRow.className = "endgame-currency-row games-changer-row";
      attemptRow.innerHTML = "<label>Amount attempted:</label>";
      const attemptInput = document.createElement("input");
      attemptInput.type = "number";
      attemptInput.min = "0";
      attemptInput.placeholder = "0";
      attemptInput.value = String(getAttemptedAmount(state.dailiesAttempted, selected.id));
      attemptInput.addEventListener("change", () => setDailiesAttempted(selected.id, attemptInput.value));
      attemptRow.appendChild(attemptInput);
      content.appendChild(attemptRow);

      const countingRow = document.createElement("div");
      countingRow.className = "endgame-currency-row games-changer-row";
      appendCountingSinceTag(countingRow, selected, "dailies", selected.id);
      content.appendChild(countingRow);

      const syncRow = document.createElement("div");
      syncRow.className = "endgame-currency-row games-changer-row";
      const syncBtn = document.createElement("button");
      syncBtn.type = "button";
      syncBtn.className = "btn btn-ghost";
      syncBtn.textContent = "Sync with Calendar";
      syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
      bindSyncButton(syncBtn, () => syncTaskWithCalendar(selected, "dailies", selected.id));
      syncRow.appendChild(syncBtn);
      content.appendChild(syncRow);
    } else if (state.gamesSubTab === "extracurricular") {
      const gameTasks = (state.extracurricularTasks || []).filter((t) => t.gameId === selected.id);
      const activeTasks = sortExtracurricularByDueDate(gameTasks.filter((t) => !isExtracurricularArchived(t)));
      const archivedTasks = gameTasks.filter((t) => isExtracurricularArchived(t));
      if (gameTasks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No extracurricular tasks associated with this game. Add tasks in the Extracurricular section and link them to this game.";
        content.appendChild(empty);
      } else {
        const section = document.createElement("div");
        section.className = "games-extracurricular-section";
        if (activeTasks.length > 0) {
          const activeLabel = document.createElement("p");
          activeLabel.className = "games-extracurricular-section-label";
          activeLabel.textContent = "Active";
          section.appendChild(activeLabel);
          const activeList = document.createElement("div");
          activeList.className = "task-grid task-grid-knot";
          activeList.dataset.masonryMax = "3";
          activeTasks.forEach((task) => activeList.appendChild(buildExtracurricularTaskItem(task, "div", { surface: "board" })));
          section.appendChild(activeList);
          scheduleTaskMasonry(activeList);
        }
        if (archivedTasks.length > 0) {
          const archivedLabel = document.createElement("p");
          archivedLabel.className = "games-extracurricular-section-label";
          archivedLabel.textContent = "History";
          archivedLabel.style.marginTop = "1rem";
          section.appendChild(archivedLabel);
          const archivedList = document.createElement("div");
          archivedList.className = "task-grid task-grid-knot";
          archivedList.dataset.masonryMax = "3";
          archivedTasks.forEach((task) => archivedList.appendChild(buildExtracurricularTaskItem(task, "div", { surface: "board" })));
          section.appendChild(archivedList);
          scheduleTaskMasonry(archivedList);
        }
        content.appendChild(section);
      }
    } else if (state.gamesSubTab === "currency") {
      const nameRow = document.createElement("div");
      nameRow.className = "endgame-currency-row";
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Currency name";
      const infoIcon = document.createElement("span");
      infoIcon.className = "currency-info-icon";
      infoIcon.setAttribute("aria-label", "More information");
      infoIcon.title = "Currency name is used in the Data section. If left empty, \"Currency\" is used. Currency per pull converts earned amounts to pulls.";
      infoIcon.textContent = "ⓘ";
      nameLabel.appendChild(infoIcon);
      nameRow.appendChild(nameLabel);
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "e.g. Gems, Primogems (optional)";
      nameInput.value = String(selected.currencyName || "");
      nameInput.addEventListener("change", () => {
        selected.currencyName = (nameInput.value || "").trim();
        save();
        renderActiveTab();
      });
      nameRow.appendChild(nameInput);
      content.appendChild(nameRow);

      const pullRow = document.createElement("div");
      pullRow.className = "endgame-currency-row";
      pullRow.innerHTML = "<label>Currency per pull</label>";
      const pullInput = document.createElement("input");
      pullInput.type = "number";
      pullInput.min = "0";
      pullInput.placeholder = "0";
      pullInput.value = String(Math.max(0, Number(selected.currencyPerPull) || 0));
      pullInput.addEventListener("change", () => {
        selected.currencyPerPull = Math.max(0, Number(pullInput.value) || 0);
        save();
        renderActiveTab();
      });
      pullRow.appendChild(pullInput);
      content.appendChild(pullRow);

      const calcRow = document.createElement("div");
      calcRow.className = "endgame-currency-row";
      const calcLabel = document.createElement("label");
      calcLabel.textContent = "Pulls Calculator";
      const calcInfoIcon = document.createElement("span");
      calcInfoIcon.className = "currency-info-icon";
      calcInfoIcon.setAttribute("aria-label", "More information");
      calcInfoIcon.title = "This does not affect anything, it's just a simple calculator.";
      calcInfoIcon.textContent = "ⓘ";
      calcLabel.appendChild(calcInfoIcon);
      calcRow.appendChild(calcLabel);
      const calcWrap = document.createElement("div");
      calcWrap.className = "pulls-calc-wrap";
      const calcInput = document.createElement("input");
      calcInput.type = "number";
      calcInput.min = "0";
      calcInput.placeholder = "Currency amount";
      calcInput.className = "pulls-calc-input";
      const calcResult = document.createElement("span");
      calcResult.className = "pulls-calc-result";
      const updatePulls = () => {
        const cpp = Math.max(1, Number(selected.currencyPerPull) || 1);
        const amt = Math.max(0, Number(calcInput.value) || 0);
        const pulls = amt / cpp;
        calcResult.textContent = amt > 0 ? "≈ " + pulls.toFixed(1) + " pulls" : "—";
      };
      calcInput.addEventListener("input", updatePulls);
      pullInput.addEventListener("input", () => { updatePulls(); });
      calcWrap.appendChild(calcInput);
      calcWrap.appendChild(calcResult);
      calcRow.appendChild(calcWrap);
      content.appendChild(calcRow);
    } else if (state.gamesSubTab === "weeklies") {
      const list = selected.weeklies || [];
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-add";
      addBtn.textContent = "+ Add weekly task";
      addBtn.addEventListener("click", () => {
        openTaskModal({ gameId: selected.id, taskType: "weeklies", task: null });
      });
      content.appendChild(addBtn);
      const ul = document.createElement("ul");
      ul.className = "task-list";
      (list || []).forEach((t) => {
        const built = createGamesManagedTaskCard(selected, t, "weeklies");
        const li = built.li;
        const main = built.main;
        const key = built.key;

        const changerRow = document.createElement("div");
        changerRow.className = "games-changer-row";
        changerRow.innerHTML = "<label>Completed amount:</label>";
        const changerInput = document.createElement("input");
        changerInput.type = "number";
        changerInput.min = "0";
        changerInput.placeholder = "0";
        changerInput.value = String(getCompletedAmount(state.weekliesCompleted, key));
        changerInput.addEventListener("change", () => {
          const old = getCompletedAmount(state.weekliesCompleted, key);
          const v = Math.max(0, Number(changerInput.value) || 0);
          if (v === old) return;
          state.weekliesCompleted[key] = v;
          save();
          renderActiveTab();
        });
        changerRow.appendChild(changerInput);
        main.appendChild(changerRow);

        const attemptRow = document.createElement("div");
        attemptRow.className = "games-changer-row";
        attemptRow.innerHTML = "<label>Amount attempted:</label>";
        const attemptInput = document.createElement("input");
        attemptInput.type = "number";
        attemptInput.min = "0";
        attemptInput.placeholder = "0";
        attemptInput.value = String(getAttemptedAmount(state.weekliesAttempted, key));
        attemptInput.addEventListener("change", () => setWeekliesAttempted(selected.id, t.id || t.label, attemptInput.value));
        attemptRow.appendChild(attemptInput);
        main.appendChild(attemptRow);

        const historyRow = document.createElement("div");
        historyRow.className = "games-changer-row";
        const historyBtn = document.createElement("button");
        historyBtn.type = "button";
        historyBtn.className = "btn btn-ghost";
        historyBtn.textContent = "Completion History";
        historyBtn.addEventListener("click", () => openEarningsModal(selected.id, t, "weeklies"));
        historyRow.appendChild(historyBtn);
        main.appendChild(historyRow);

        const syncRow = document.createElement("div");
        syncRow.className = "games-changer-row";
        const syncBtn = document.createElement("button");
        syncBtn.type = "button";
        syncBtn.className = "btn btn-ghost";
        syncBtn.textContent = "Sync with Calendar";
        syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
        bindSyncButton(syncBtn, () => syncTaskWithCalendar(selected, "weeklies", key));
        syncRow.appendChild(syncBtn);
        main.appendChild(syncRow);

        appendGamesTaskBottom(main, selected, t, "weeklies", "Potential: " + getWeeklyPotential(t));
        ul.appendChild(li);
      });
      content.appendChild(ul);
    } else {
      const list = selected.endgame || [];
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-add";
      addBtn.textContent = "+ Add endgame task";
      addBtn.addEventListener("click", () => {
        openTaskModal({ gameId: selected.id, taskType: "endgame", task: null });
      });
      content.appendChild(addBtn);
      const ul = document.createElement("ul");
      ul.className = "task-list";
      (list || []).forEach((t) => {
        const built = createGamesManagedTaskCard(selected, t, "endgame");
        const li = built.li;
        const main = built.main;
        const key = built.key;

        const changerRow = document.createElement("div");
        changerRow.className = "games-changer-row";
        changerRow.innerHTML = "<label>Completed amount:</label>";
        const changerInput = document.createElement("input");
        changerInput.type = "number";
        changerInput.min = "0";
        changerInput.placeholder = "0";
        changerInput.value = String(getCompletedAmount(state.endgameCompleted, key));
        changerInput.addEventListener("change", () => {
          const old = getCompletedAmount(state.endgameCompleted, key);
          const v = Math.max(0, Number(changerInput.value) || 0);
          if (v === old) return;
          state.endgameCompleted[key] = v;
          ensureEndgameEarnedArrayLength(selected.id, t.id || t.label, v);
          if (v > old) {
            const pot = getEndgamePotential(t);
            for (let i = old; i < v; i++) snapshotEndgamePotentialAt(selected.id, t.id || t.label, i, pot, { skipSave: true, skipRender: true });
          } else if (v < old) {
            ensureEndgamePotentialArrayLength(selected.id, t.id || t.label, getAttemptedAmount(state.endgameAttempted, key));
          }
          save();
          renderActiveTab();
        });
        changerRow.appendChild(changerInput);
        main.appendChild(changerRow);

        const attemptRow = document.createElement("div");
        attemptRow.className = "games-changer-row";
        attemptRow.innerHTML = "<label>Amount attempted:</label>";
        const attemptInput = document.createElement("input");
        attemptInput.type = "number";
        attemptInput.min = "0";
        attemptInput.placeholder = "0";
        attemptInput.value = String(getAttemptedAmount(state.endgameAttempted, key));
        attemptInput.addEventListener("change", () => setEndgameAttempted(selected.id, t.id || t.label, attemptInput.value));
        attemptRow.appendChild(attemptInput);
        main.appendChild(attemptRow);

        const earningsRow = document.createElement("div");
        earningsRow.className = "games-changer-row";
        const earningsBtn = document.createElement("button");
        earningsBtn.type = "button";
        earningsBtn.className = "btn btn-ghost";
        earningsBtn.textContent = "Completion History";
        earningsBtn.addEventListener("click", () => openEarningsModal(selected.id, t, "endgame"));
        earningsRow.appendChild(earningsBtn);
        main.appendChild(earningsRow);

        const syncRow = document.createElement("div");
        syncRow.className = "games-changer-row";
        const syncBtn = document.createElement("button");
        syncBtn.type = "button";
        syncBtn.className = "btn btn-ghost";
        syncBtn.textContent = "Sync with Calendar";
        syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
        bindSyncButton(syncBtn, () => syncTaskWithCalendar(selected, "endgame", key));
        syncRow.appendChild(syncBtn);
        main.appendChild(syncRow);

        appendGamesTaskBottom(main, selected, t, "endgame", "Potential: " + getEndgamePotential(t));
        ul.appendChild(li);
      });
      content.appendChild(ul);
    }
    container.appendChild(content);
  }

