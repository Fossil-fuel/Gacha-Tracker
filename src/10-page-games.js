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
    const gameTitle = document.createElement("h3");
    gameTitle.className = "games-selected-title";
    gameTitle.textContent = selected.name;
    titleRow.appendChild(gameTitle);
    const editNameBtn = document.createElement("button");
    editNameBtn.type = "button";
    editNameBtn.className = "btn btn-ghost games-edit-name-btn";
    editNameBtn.textContent = "Edit name";
    editNameBtn.setAttribute("aria-label", "Edit game name");
    editNameBtn.addEventListener("click", () => {
      const newName = prompt("Game name", selected.name || "");
      if (newName != null && String(newName).trim()) {
        selected.name = String(newName).trim();
        save();
        renderAll();
      }
    });
    titleRow.appendChild(editNameBtn);
    const syncBtn = document.createElement("button");
    syncBtn.type = "button";
    syncBtn.className = "btn btn-ghost games-sync-btn";
    syncBtn.textContent = "Sync with Calendar";
    syncBtn.setAttribute("aria-label", "Sync all tasks from calendar history");
    syncBtn.title = "Update Completed/Attempted for all tasks from calendar history";
    syncBtn.addEventListener("click", () => {
      syncAllTasksForGame(selected);
    });
    titleRow.appendChild(syncBtn);
    const clearDataBtn = document.createElement("button");
    clearDataBtn.type = "button";
    clearDataBtn.className = "btn btn-ghost games-clear-data-btn";
    clearDataBtn.textContent = "Clear Data";
    clearDataBtn.setAttribute("aria-label", "Clear all attempts and completions for this game");
    clearDataBtn.title = "Reset all attempts and completions to zero";
    clearDataBtn.addEventListener("click", () => openClearGameDataModal(selected.id));
    titleRow.appendChild(clearDataBtn);
    const deleteGameBtn = document.createElement("button");
    deleteGameBtn.type = "button";
    deleteGameBtn.className = "btn btn-ghost games-delete-btn";
    deleteGameBtn.textContent = "Delete game";
    deleteGameBtn.addEventListener("click", () => deleteGame(selected.id));
    titleRow.appendChild(deleteGameBtn);
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
        save();
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
        renderAll();
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
        renderAll();
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
        renderAll();
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
        renderAll();
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
        const v = Math.max(0, Number(changerInput.value) || 0);
        state.dailiesCompleted[selected.id] = v;
        const dateStr = getDailyPeriodDateStr(selected, getSimulatedNow());
        if (v) recordCompletion(dateStr, "dailies", selected.id);
        else unrecordCompletion(dateStr, "dailies", selected.id);
        save();
        renderAll();
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

      const syncRow = document.createElement("div");
      syncRow.className = "endgame-currency-row games-changer-row";
      const syncBtn = document.createElement("button");
      syncBtn.type = "button";
      syncBtn.className = "btn btn-ghost";
      syncBtn.textContent = "Sync with Calendar";
      syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
      syncBtn.addEventListener("click", () => syncTaskWithCalendar(selected, "dailies", selected.id));
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
        if (activeTasks.length > 0) {
          const activeLabel = document.createElement("p");
          activeLabel.className = "games-extracurricular-section-label";
          activeLabel.textContent = "Active";
          content.appendChild(activeLabel);
          const activeList = document.createElement("ul");
          activeList.className = "task-list";
          activeTasks.forEach((task) => activeList.appendChild(buildExtracurricularTaskItem(task)));
          content.appendChild(activeList);
        }
        if (archivedTasks.length > 0) {
          const archivedLabel = document.createElement("p");
          archivedLabel.className = "games-extracurricular-section-label";
          archivedLabel.textContent = "History";
          archivedLabel.style.marginTop = "1rem";
          content.appendChild(archivedLabel);
          const archivedList = document.createElement("ul");
          archivedList.className = "task-list";
          archivedTasks.forEach((task) => archivedList.appendChild(buildExtracurricularTaskItem(task)));
          content.appendChild(archivedList);
        }
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
        renderAll();
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
        renderAll();
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
        const li = document.createElement("li");
        li.className = "task-item task-item-with-changer";
        const top = document.createElement("div");
        top.className = "task-item-top";
        const info = document.createElement("div");
        info.className = "task-item-info";
        const label = document.createElement("span");
        label.className = "task-label";
        label.textContent = t.label || "";
        const potSpan = document.createElement("span");
        potSpan.className = "games-task-potential";
        potSpan.textContent = "Potential: " + getWeeklyPotential(t);
        const resetSpan = document.createElement("span");
        resetSpan.className = "games-task-reset";
        resetSpan.textContent = "Resets: " + getWeeklyResetDisplay(t, getSimulatedNow(), selected);
        const dateStartSpan = document.createElement("span");
        dateStartSpan.className = "games-weekly-date-start";
        const ds = isValidDateStr(t.dateStarted) ? t.dateStarted : getDateStr();
        const dsDate = new Date(ds + "T12:00:00");
        dateStartSpan.textContent = "Started: " + formatDate(dsDate);
        dateStartSpan.title = "Date started: " + ds;
        info.appendChild(label);
        info.appendChild(potSpan);
        info.appendChild(resetSpan);
        info.appendChild(dateStartSpan);
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "icon-btn";
        editBtn.textContent = "✎";
        editBtn.setAttribute("aria-label", "Edit task");
        editBtn.addEventListener("click", () => openTaskModal({ gameId: selected.id, taskType: "weeklies", task: t }));
        top.appendChild(info);
        top.appendChild(editBtn);
        li.appendChild(top);
        const changerRow = document.createElement("div");
        changerRow.className = "games-changer-row";
        changerRow.innerHTML = "<label>Completed amount:</label>";
        const key = selected.id + "." + (t.id || t.label);
        const changerInput = document.createElement("input");
        changerInput.type = "number";
        changerInput.min = "0";
        changerInput.placeholder = "0";
        changerInput.value = String(getCompletedAmount(state.weekliesCompleted, key));
        changerInput.addEventListener("change", () => {
          const v = Math.max(0, Number(changerInput.value) || 0);
          state.weekliesCompleted[key] = v;
          if (v) recordCompletion(getDateStr(), "weeklies", key);
          else unrecordCompletion(getDateStr(), "weeklies", key);
          save();
          renderAll();
        });
        changerRow.appendChild(changerInput);
        li.appendChild(changerRow);

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
        li.appendChild(attemptRow);

        const syncRow = document.createElement("div");
        syncRow.className = "games-changer-row";
        const syncBtn = document.createElement("button");
        syncBtn.type = "button";
        syncBtn.className = "btn btn-ghost";
        syncBtn.textContent = "Sync with Calendar";
        syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
        syncBtn.addEventListener("click", () => syncTaskWithCalendar(selected, "weeklies", key));
        syncRow.appendChild(syncBtn);
        li.appendChild(syncRow);

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
        const li = document.createElement("li");
        li.className = "task-item task-item-with-changer";
        const top = document.createElement("div");
        top.className = "task-item-top";
        const info = document.createElement("div");
        info.className = "task-item-info";
        const label = document.createElement("span");
        label.className = "task-label";
        label.textContent = t.label || "";
        const potSpan = document.createElement("span");
        potSpan.className = "games-task-potential";
        potSpan.textContent = "Potential: " + getEndgamePotential(t);
        const resetSpan = document.createElement("span");
        resetSpan.className = "games-task-reset";
        resetSpan.textContent = "Resets: " + getEndgameResetDisplay(t, getSimulatedNow(), selected);
        const dateStartSpan = document.createElement("span");
        dateStartSpan.className = "games-endgame-date-start";
        const ds = isValidDateStr(t.dateStarted) ? t.dateStarted : getDateStr();
        const dsDate = new Date(ds + "T12:00:00");
        dateStartSpan.textContent = "Started: " + formatDate(dsDate);
        dateStartSpan.title = "Date started: " + ds;
        info.appendChild(label);
        info.appendChild(potSpan);
        info.appendChild(resetSpan);
        info.appendChild(dateStartSpan);
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "icon-btn";
        editBtn.textContent = "✎";
        editBtn.setAttribute("aria-label", "Edit task");
        editBtn.addEventListener("click", () => openTaskModal({ gameId: selected.id, taskType: "endgame", task: t }));
        top.appendChild(info);
        top.appendChild(editBtn);
        li.appendChild(top);
        const changerRow = document.createElement("div");
        changerRow.className = "games-changer-row";
        changerRow.innerHTML = "<label>Completed amount:</label>";
        const key = selected.id + "." + (t.id || t.label);
        const changerInput = document.createElement("input");
        changerInput.type = "number";
        changerInput.min = "0";
        changerInput.placeholder = "0";
        changerInput.value = String(getCompletedAmount(state.endgameCompleted, key));
        changerInput.addEventListener("change", () => {
          const v = Math.max(0, Number(changerInput.value) || 0);
          state.endgameCompleted[key] = v;
          if (v) recordCompletion(getDateStr(), "endgame", key);
          else unrecordCompletion(getDateStr(), "endgame", key);
          ensureEndgameEarnedArrayLength(selected.id, t.id || t.label, v);
          save();
          renderAll();
        });
        changerRow.appendChild(changerInput);
        li.appendChild(changerRow);

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
        li.appendChild(attemptRow);

        const earningsRow = document.createElement("div");
        earningsRow.className = "games-changer-row";
        const earningsBtn = document.createElement("button");
        earningsBtn.type = "button";
        earningsBtn.className = "btn btn-ghost";
        earningsBtn.textContent = "Completion History";
        earningsBtn.addEventListener("click", () => openEarningsModal(selected.id, t));
        earningsRow.appendChild(earningsBtn);
        li.appendChild(earningsRow);

        const syncRow = document.createElement("div");
        syncRow.className = "games-changer-row";
        const syncBtn = document.createElement("button");
        syncBtn.type = "button";
        syncBtn.className = "btn btn-ghost";
        syncBtn.textContent = "Sync with Calendar";
        syncBtn.title = "Update Completed/Attempted from calendar history (tally from first complete to today)";
        syncBtn.addEventListener("click", () => syncTaskWithCalendar(selected, "endgame", key));
        syncRow.appendChild(syncBtn);
        li.appendChild(syncRow);

        ul.appendChild(li);
      });
      content.appendChild(ul);
    }
    container.appendChild(content);
  }

