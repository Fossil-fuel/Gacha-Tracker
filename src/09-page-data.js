  function getDataExcludeInProgress(gameId) {
    const g = state.dataExcludeInProgress && state.dataExcludeInProgress[gameId];
    return g !== false;
  }

  function setDataExcludeInProgress(gameId, value) {
    if (!state.dataExcludeInProgress) state.dataExcludeInProgress = {};
    state.dataExcludeInProgress[gameId] = value;
  }

  function getDataPieInclude(gameId, category) {
    const g = state.dataPieInclude && state.dataPieInclude[gameId];
    return g && g[category] !== undefined ? g[category] : true;
  }

  function setDataPieInclude(gameId, category, value) {
    if (!state.dataPieInclude) state.dataPieInclude = {};
    if (!state.dataPieInclude[gameId]) state.dataPieInclude[gameId] = {};
    state.dataPieInclude[gameId][category] = value;
  }

  function renderData() {
    const container = document.getElementById("dataContainer");
    if (!container) return;
    const game = getGame(state.dataSelectedGameId);
    if (!game) {
      container.innerHTML = "<p class=\"empty-state\">Select a game from the Data list in the sidebar to view its data.</p>";
      return;
    }
    container.innerHTML = "";
    const gameTitle = document.createElement("h3");
    gameTitle.className = "data-game-title";
    gameTitle.textContent = game.name;
    container.appendChild(gameTitle);

    const exclToggleWrap = document.createElement("div");
    exclToggleWrap.className = "data-excl-toggle-wrap";
    const exclToggle = document.createElement("label");
    exclToggle.className = "data-excl-toggle";
    const exclCheck = document.createElement("input");
    exclCheck.type = "checkbox";
    exclCheck.checked = getDataExcludeInProgress(game.id);
    exclCheck.setAttribute("aria-label", "Exclude in-progress cycles from data");
    exclCheck.addEventListener("change", () => {
      setDataExcludeInProgress(game.id, exclCheck.checked);
      save();
      renderAll();
    });
    exclToggle.appendChild(exclCheck);
    const exclText = document.createElement("span");
    exclText.className = "data-excl-text";
    exclText.textContent = "Only completed cycles (exclude in-progress). Turn off to show theoretical data including current-cycle tasks not yet completed.";
    exclToggle.appendChild(exclText);
    exclToggleWrap.appendChild(exclToggle);
    container.appendChild(exclToggleWrap);

    const ep = getGameEarnedAndPotential(game);
    const cpp = Math.max(0, Number(game.currencyPerPull) || 0);

    const currencyLabel = getCurrencyLabel(game);
    const dE = ep ? ep.dailies.earned : 0, dP = ep ? ep.dailies.potential : 0;
    const wE = ep ? ep.weeklies.earned : 0, wP = ep ? ep.weeklies.potential : 0;
    const eE = ep ? ep.endgame.earned : 0, eP = ep ? ep.endgame.potential : 0;
    const xE = ep && ep.extracurricular ? ep.extracurricular.earned : 0;
    const xP = ep && ep.extracurricular ? ep.extracurricular.potential : 0;

    const incD = getDataPieInclude(game.id, "dailies");
    const incW = getDataPieInclude(game.id, "weeklies");
    const incE = getDataPieInclude(game.id, "endgame");
    const incX = getDataPieInclude(game.id, "extracurricular");

    const inclEarned = (incD ? dE : 0) + (incW ? wE : 0) + (incE ? eE : 0) + (incX ? xE : 0);
    const inclPotential = (incD ? dP : 0) + (incW ? wP : 0) + (incE ? eP : 0) + (incX ? xP : 0);
    const missed = Math.max(0, inclPotential - inclEarned);

    const toPullsStr = (n) => cpp > 0 ? (n / cpp).toFixed(2) : "—";
    const formatCurr = (earned, potential) => (earned === 0 && potential === 0) ? "—" : String(earned);
    const formatCurrPot = (earned, potential) => (earned === 0 && potential === 0) ? "—" : String(potential);
    const formatPulls = (earned, potential) => (earned === 0 && potential === 0) ? "—" : toPullsStr(earned);
    const formatPullsPot = (earned, potential) => (earned === 0 && potential === 0) ? "—" : toPullsStr(potential);

    const makeToggle = (cat, checked) => {
      const t = document.createElement("input");
      t.type = "checkbox";
      t.className = "data-pie-toggle";
      t.checked = checked;
      t.title = "Include " + cat + " in earning total and pie charts";
      t.setAttribute("aria-label", "Include " + cat + " in total and pie charts");
      t.addEventListener("change", () => {
        setDataPieInclude(game.id, cat.toLowerCase(), t.checked);
        save();
        renderAll();
      });
      return t;
    };

    const tablesSection = document.createElement("div");
    tablesSection.className = "data-pie-section data-tables-section";
    const currencyHeader = document.createElement("h4");
    currencyHeader.className = "data-section-label";
    currencyHeader.textContent = currencyLabel + " earned vs potential";
    tablesSection.appendChild(currencyHeader);

    const currencyTableWrap = document.createElement("div");
    currencyTableWrap.className = "data-table-wrap";
    const currencyTable = document.createElement("table");
    currencyTable.className = "data-summary-table";
    currencyTable.innerHTML = "<thead><tr><th>Category</th><th class=\"data-toggle-col\">Include</th><th>Earned</th><th>Potential</th></tr></thead>";
    const currencyTbody = currencyTable.createTBody();
    const pullsTable = document.createElement("table");
    pullsTable.className = "data-summary-table";
    pullsTable.innerHTML = "<thead><tr><th>Category</th><th class=\"data-toggle-col\">Include</th><th>Earned</th><th>Potential</th></tr></thead>";
    const pullsTbody = pullsTable.createTBody();
    [[ "Dailies", dE, dP, incD ], [ "Weeklies", wE, wP, incW ], [ "Endgame", eE, eP, incE ], [ "Extracurricular", xE, xP, incX ]].forEach(([ cat, earned, potential, inc ]) => {
      const tr = currencyTbody.insertRow();
      tr.insertCell().textContent = cat;
      const toggleCell = tr.insertCell();
      toggleCell.className = "data-toggle-cell";
      toggleCell.appendChild(makeToggle(cat, inc));
      tr.insertCell().textContent = formatCurr(earned, potential);
      tr.insertCell().textContent = formatCurrPot(earned, potential);
      const pr = pullsTbody.insertRow();
      pr.insertCell().textContent = cat;
      const ptCell = pr.insertCell();
      ptCell.className = "data-toggle-cell";
      ptCell.appendChild(makeToggle(cat, inc));
      pr.insertCell().textContent = formatPulls(earned, potential);
      pr.insertCell().textContent = formatPullsPot(earned, potential);
    });
    const totalCurr = currencyTbody.insertRow();
    totalCurr.className = "data-summary-total";
    totalCurr.insertCell().textContent = "Total";
    totalCurr.insertCell().className = "data-toggle-cell";
    totalCurr.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : String(inclEarned);
    totalCurr.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : String(inclPotential);
    const totalPull = pullsTbody.insertRow();
    totalPull.className = "data-summary-total";
    totalPull.insertCell().textContent = "Total";
    totalPull.insertCell().className = "data-toggle-cell";
    totalPull.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : toPullsStr(inclEarned);
    totalPull.insertCell().textContent = (inclEarned === 0 && inclPotential === 0) ? "—" : toPullsStr(inclPotential);
    currencyTableWrap.appendChild(currencyTable);
    tablesSection.appendChild(currencyTableWrap);

    const currencyEarnedSegs = [];
    if (incD && dE > 0) currencyEarnedSegs.push({ label: "Dailies", value: dE, color: CURRENCY_PIE_COLORS[0] });
    if (incW && wE > 0) currencyEarnedSegs.push({ label: "Weeklies", value: wE, color: CURRENCY_PIE_COLORS[1] });
    if (incE && eE > 0) currencyEarnedSegs.push({ label: "Endgame", value: eE, color: CURRENCY_PIE_COLORS[2] });
    if (incX && xE > 0) currencyEarnedSegs.push({ label: "Extracurricular", value: xE, color: CURRENCY_PIE_COLORS[4] });
    const currencyPotentialSegs = [];
    if (incD && dP > 0) currencyPotentialSegs.push({ label: "Dailies", value: dP, color: CURRENCY_PIE_COLORS[0] });
    if (incW && wP > 0) currencyPotentialSegs.push({ label: "Weeklies", value: wP, color: CURRENCY_PIE_COLORS[1] });
    if (incE && eP > 0) currencyPotentialSegs.push({ label: "Endgame", value: eP, color: CURRENCY_PIE_COLORS[2] });
    if (incX && xP > 0) currencyPotentialSegs.push({ label: "Extracurricular", value: xP, color: CURRENCY_PIE_COLORS[4] });
    const currencyNetSegs = [];
    if (incD && dE > 0) currencyNetSegs.push({ label: "Dailies", value: dE, color: CURRENCY_PIE_COLORS[0] });
    if (incW && wE > 0) currencyNetSegs.push({ label: "Weeklies", value: wE, color: CURRENCY_PIE_COLORS[1] });
    if (incE && eE > 0) currencyNetSegs.push({ label: "Endgame", value: eE, color: CURRENCY_PIE_COLORS[2] });
    if (incX && xE > 0) currencyNetSegs.push({ label: "Extracurricular", value: xE, color: CURRENCY_PIE_COLORS[4] });
    if (missed > 0) currencyNetSegs.push({ label: "Missed", value: missed, color: CURRENCY_PIE_COLORS[3] });
    const piesRow = document.createElement("div");
    piesRow.className = "data-pies-row";
    piesRow.appendChild(createCurrencyPieBox("Earned", currencyEarnedSegs, "No currency earned yet"));
    piesRow.appendChild(createCurrencyPieBox("Net Earnings", currencyNetSegs, "No data"));
    piesRow.appendChild(createCurrencyPieBox("Potential", currencyPotentialSegs, "No potential yet"));
    tablesSection.appendChild(piesRow);

    const pullsHeader = document.createElement("h4");
    pullsHeader.className = "data-section-label";
    pullsHeader.textContent = "Pulls earned vs potential";
    pullsHeader.style.marginTop = "1.5rem";
    tablesSection.appendChild(pullsHeader);
    const pullsTableWrap = document.createElement("div");
    pullsTableWrap.className = "data-table-wrap";
    pullsTableWrap.appendChild(pullsTable);
    tablesSection.appendChild(pullsTableWrap);
    container.appendChild(tablesSection);

    const excl = getDataExcludeInProgress(game.id);
    const dCompleted = game.dailies ? (excl ? getCompletedAttemptedCompletedCyclesOnly(game, "dailies", game.id).completed : getCompletedAmount(state.dailiesCompleted, game.id)) : 0;
    const dAttempted = game.dailies ? (excl ? getCompletedAttemptedCompletedCyclesOnly(game, "dailies", game.id).attempted : getAttemptedAmount(state.dailiesAttempted, game.id)) : 0;
    const dTotal = game.dailies ? (dAttempted > 0 ? dAttempted : Math.max(dCompleted, 1)) : 0;
    const weeklies = game.weeklies || [];
    let wCompleted = 0, wAttempted = 0;
    weeklies.forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      if (excl) {
        const ca = getCompletedAttemptedCompletedCyclesOnly(game, "weeklies", key);
        wCompleted += ca.completed;
        wAttempted += ca.attempted;
      } else {
        wCompleted += getCompletedAmount(state.weekliesCompleted, key);
        wAttempted += getAttemptedAmount(state.weekliesAttempted, key);
      }
    });
    const wTotal = wAttempted > 0 ? wAttempted : Math.max(wCompleted, weeklies.length || 1);
    const endgame = game.endgame || [];
    let eCompleted = 0, eAttempted = 0;
    endgame.forEach((t) => {
      const key = game.id + "." + (t.id || t.label);
      if (excl) {
        const ca = getCompletedAttemptedCompletedCyclesOnly(game, "endgame", key);
        eCompleted += ca.completed;
        eAttempted += ca.attempted;
      } else {
        eCompleted += getCompletedAmount(state.endgameCompleted, key);
        eAttempted += getAttemptedAmount(state.endgameAttempted, key);
      }
    });
    const eTotal = eAttempted > 0 ? eAttempted : Math.max(eCompleted, endgame.length || 1);

    const overallRow = document.createElement("div");
    overallRow.className = "data-pie-row";
    overallRow.innerHTML = "<h4 class=\"data-section-label\">Overall</h4>";
    const overallPies = document.createElement("div");
    overallPies.className = "pie-row";
    overallPies.appendChild(createCompletionPieBox("Dailies", dCompleted, dTotal, false));
    overallPies.appendChild(createCompletionPieBox("Weeklies", wCompleted, wTotal, false));
    overallPies.appendChild(createCompletionPieBox("Endgame", eCompleted, eTotal, true));
    overallRow.appendChild(overallPies);
    container.appendChild(overallRow);

    if (weeklies.length > 0) {
      const weekliesSection = document.createElement("div");
      weekliesSection.className = "data-pie-section";
      const wh = document.createElement("h4");
      wh.className = "data-section-label";
      wh.textContent = "Weeklies";
      weekliesSection.appendChild(wh);
      const wPies = document.createElement("div");
      wPies.className = "pie-row";
      weeklies.forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const ca = excl ? getCompletedAttemptedCompletedCyclesOnly(game, "weeklies", key) : { completed: getCompletedAmount(state.weekliesCompleted, key), attempted: getAttemptedAmount(state.weekliesAttempted, key) };
        const total = ca.attempted > 0 ? ca.attempted : Math.max(ca.completed, 1);
        wPies.appendChild(createCompletionPieBox(task.label || "Weekly", ca.completed, total, false));
      });
      weekliesSection.appendChild(wPies);
      container.appendChild(weekliesSection);
    }

    if (endgame.length > 0) {
      const endgameSection = document.createElement("div");
      endgameSection.className = "data-pie-section";
      const eh = document.createElement("h4");
      eh.className = "data-section-label";
      eh.textContent = "Endgame";
      endgameSection.appendChild(eh);
      const ePies = document.createElement("div");
      ePies.className = "pie-row";
      endgame.forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const ca = excl ? getCompletedAttemptedCompletedCyclesOnly(game, "endgame", key) : { completed: getCompletedAmount(state.endgameCompleted, key), attempted: getAttemptedAmount(state.endgameAttempted, key) };
        const total = ca.attempted > 0 ? ca.attempted : Math.max(ca.completed, 1);
        ePies.appendChild(createCompletionPieBox(task.label || "Endgame", ca.completed, total, true));
      });
      endgameSection.appendChild(ePies);
      container.appendChild(endgameSection);

      const currencySection = document.createElement("div");
      currencySection.className = "data-pie-section";
      const ch = document.createElement("h4");
      ch.className = "data-section-label";
      ch.textContent = "Endgame " + currencyLabel + " earned";
      currencySection.appendChild(ch);
      const currencyPies = document.createElement("div");
      currencyPies.className = "pie-row";
      endgame.forEach((task) => {
        const key = game.id + "." + (task.id || task.label);
        const ca = excl ? getCompletedAttemptedCompletedCyclesOnly(game, "endgame", key) : { completed: getCompletedAmount(state.endgameCompleted, key), attempted: getAttemptedAmount(state.endgameAttempted, key) };
        const earned = excl ? getEndgameEarnedCompletedCyclesOnly(game.id, task.id || task.label, ca.completed) : (Number(getEndgameEarned(game.id, task.id || task.label)) || 0);
        currencyPies.appendChild(createEndgameCurrencyPieBox(task, earned, ca.attempted));
      });
      currencySection.appendChild(currencyPies);
      container.appendChild(currencySection);
    }

    const exTasks = (state.extracurricularTasks || []).filter((t) => t.gameId === game.id);
    if (exTasks.length > 0) {
      const exSection = document.createElement("div");
      exSection.className = "data-pie-section";
      const exh = document.createElement("h4");
      exh.className = "data-section-label";
      exh.textContent = "Extracurricular " + currencyLabel + " earned";
      exSection.appendChild(exh);
      const exPies = document.createElement("div");
      exPies.className = "pie-row";
      exTasks.forEach((task) => {
        const pot = Math.max(0, Number(task.currency) || 0);
        let earned = 0;
        if (state.extracurricularCompleted[task.id]) {
          const rec = state.extracurricularCurrencyEarned && state.extracurricularCurrencyEarned[task.id];
          earned = rec !== undefined && rec !== null ? Math.max(0, Number(rec) || 0) : pot;
        }
        exPies.appendChild(createExtracurricularCurrencyPieBox(task, earned, pot));
      });
      exSection.appendChild(exPies);
      container.appendChild(exSection);
    }
  }

  function renderSidebarDataList() {
    const list = document.getElementById("sidebarDataList");
    if (!list) return;
    list.innerHTML = "";
    getAllGames().forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.draggable = true;
      btn.dataset.gameId = game.id;
      const active = state.tab === "data" && game.id === state.dataSelectedGameId;
      btn.className = "sidebar-data-item" + (active ? " active" : "");
      btn.textContent = game.name;
      btn.addEventListener("click", () => {
        state.tab = "data";
        state.dataSelectedGameId = game.id;
        state.gamesSelectedId = game.id;
        save();
        renderAll();
      });
      btn.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", game.id);
        e.dataTransfer.effectAllowed = "move";
        btn.classList.add("sidebar-drag-source");
      });
      btn.addEventListener("dragend", () => btn.classList.remove("sidebar-drag-source"));
      btn.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.classList.add("sidebar-drag-over");
      });
      btn.addEventListener("dragleave", (e) => e.currentTarget.classList.remove("sidebar-drag-over"));
      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("sidebar-drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        const targetId = e.currentTarget.dataset.gameId;
        if (draggedId && targetId && draggedId !== targetId) reorderGame(draggedId, targetId);
      });
      list.appendChild(btn);
    });
  }

  function renderSidebarGamesList() {
    const list = document.getElementById("sidebarGamesList");
    if (!list) return;
    list.innerHTML = "";
    getAllGames().forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.draggable = true;
      btn.dataset.gameId = game.id;
      const active = state.tab === "games" && game.id === state.gamesSelectedId;
      btn.className = "sidebar-game-item" + (active ? " active" : "");
      btn.textContent = game.name;
      btn.addEventListener("click", () => {
        state.tab = "games";
        state.gamesSelectedId = game.id;
        state.dataSelectedGameId = game.id;
        save();
        renderAll();
      });
      btn.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", game.id);
        e.dataTransfer.effectAllowed = "move";
        btn.classList.add("sidebar-drag-source");
      });
      btn.addEventListener("dragend", () => btn.classList.remove("sidebar-drag-source"));
      btn.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        e.currentTarget.classList.add("sidebar-drag-over");
      });
      btn.addEventListener("dragleave", (e) => e.currentTarget.classList.remove("sidebar-drag-over"));
      btn.addEventListener("drop", (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("sidebar-drag-over");
        const draggedId = e.dataTransfer.getData("text/plain");
        const targetId = e.currentTarget.dataset.gameId;
        if (draggedId && targetId && draggedId !== targetId) reorderGame(draggedId, targetId);
      });
      list.appendChild(btn);
    });
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "sidebar-game-item add-game";
    addBtn.textContent = "+ Add game";
    addBtn.addEventListener("click", () => {
      openGameModal();
    });
    list.appendChild(addBtn);
  }

