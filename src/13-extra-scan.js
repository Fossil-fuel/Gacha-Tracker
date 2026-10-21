  /**
   * Manual Game8 scan for extracurricular story/event tasks.
   * Does not remove or edit tasks that are already saved.
   */
  const EXTRA_SCAN_PRESET_URLS = {
    hsr: [
      "https://game8.co/games/Honkai-Star-Rail",
      "https://game8.co/games/Honkai-Star-Rail/archives/408749",
    ],
    zzz: [
      "https://game8.co/games/Zenless-Zone-Zero",
      "https://game8.co/games/Zenless-Zone-Zero/archives/614559",
    ],
    ww: [
      "https://game8.co/games/Wuthering-Waves",
      "https://game8.co/games/Wuthering-Waves/archives/616859",
      "https://game8.co/games/Wuthering-Waves/archives/453473",
    ],
    akendfield: [
      "https://game8.co/games/Arknights-Endfield",
      "https://game8.co/games/Arknights-Endfield/archives/618761",
      "https://game8.co/games/Arknights-Endfield/archives/535443",
    ],
  };

  function extraScanPresetUrls(game) {
    const id = game && game.presetId ? String(game.presetId) : "";
    return (EXTRA_SCAN_PRESET_URLS[id] || []).slice();
  }

  function ensureExtraScan(game) {
    if (!game.extraScan || typeof game.extraScan !== "object") game.extraScan = {};
    const scan = game.extraScan;
    if (typeof scan.enabled !== "boolean") scan.enabled = false;
    if (!Array.isArray(scan.urls)) scan.urls = [];
    scan.urls = scan.urls.map((u) => String(u || "").trim()).filter(Boolean);
    if (scan.enabled && !scan.urls.length) scan.urls = extraScanPresetUrls(game);
    if (!scan.versionLabel) scan.versionLabel = "";
    if (!scan.updateEndDate) scan.updateEndDate = null;
    return scan;
  }

  function extraScanNorm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extraScanLabelsMatch(a, b) {
    if (!a || !b) return false;
    const core = (value) => String(value || "").replace(/^\d+\s+\d+\s+/, "").trim();
    return core(a) === core(b);
  }

  function extraScanUpdateEnded(game) {
    const scan = ensureExtraScan(game);
    if (!scan.enabled || !scan.updateEndDate) return false;
    return getDateStr() >= scan.updateEndDate;
  }

  function filterExtraScanProposals(game, tasks) {
    const existing = (state.extracurricularTasks || [])
      .filter((t) => t && t.gameId === game.id)
      .map((t) => extraScanNorm(t.label));
    const list = Array.isArray(tasks) ? tasks : [];
    return list.filter((task) => {
      const key = extraScanNorm(task.label);
      return key && !existing.some((have) => extraScanLabelsMatch(have, key));
    });
  }

  function renderExtraScanReminders(parent, onlyGameId) {
    if (!parent) return;
    getAllGames().forEach((game) => {
      if (onlyGameId && game.id !== onlyGameId) return;
      if (!extraScanUpdateEnded(game)) return;
      const scan = ensureExtraScan(game);
      const bar = document.createElement("div");
      bar.className = "extra-scan-reminder";
      const text = document.createElement("p");
      text.className = "extra-scan-reminder-text";
      const name = document.createElement("strong");
      name.textContent = game.name || "Game";
      text.appendChild(name);
      text.appendChild(document.createTextNode(
        " update" + (scan.versionLabel ? " " + scan.versionLabel : "") + " ended — scan for the next extracurricular tasks."
      ));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost btn-sm";
      btn.textContent = "Scan now";
      btn.addEventListener("click", () => openExtraScanForGame(game.id));
      bar.appendChild(text);
      bar.appendChild(btn);
      parent.appendChild(bar);
    });
  }

  function closeExtraScanModal() {
    const modal = document.getElementById("extraScanModal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }

  function openExtraScanModal(title, bodyNode, actions) {
    const modal = document.getElementById("extraScanModal");
    const titleEl = document.getElementById("extraScanModalTitle");
    const body = document.getElementById("extraScanModalBody");
    const actionRow = document.getElementById("extraScanModalActions");
    if (!modal || !body || !actionRow) return;
    if (titleEl) titleEl.textContent = title || "Update scan";
    body.innerHTML = "";
    if (bodyNode) body.appendChild(bodyNode);
    actionRow.innerHTML = "";
    (actions || []).forEach((action) => actionRow.appendChild(action));
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
  }

  function extraScanStatusNode(message) {
    const p = document.createElement("p");
    p.className = "extra-scan-status";
    p.textContent = message;
    return p;
  }

  async function runExtraScan(game) {
    const scan = ensureExtraScan(game);
    if (!scan.enabled) {
      openExtraScanModal(
        game.name || "Update scan",
        extraScanStatusNode("Turn on Auto task queue for this game under Games → Data, then scan again."),
        [extraScanCloseButton()]
      );
      return;
    }
    const urls = scan.urls.filter(Boolean);
    if (!urls.length) {
      openExtraScanModal(
        game.name || "Update scan",
        extraScanStatusNode("Add at least one Game8 page under Games → Data."),
        [extraScanCloseButton()]
      );
      return;
    }
    openExtraScanModal(
      (game.name || "Game") + " — scanning",
      extraScanStatusNode("Reading each event page for " + (game.name || "this game") + " to get start and end dates…"),
      []
    );
    let payload;
    try {
      const res = await fetch("/api/extra-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      payload = await res.json();
      if (!res.ok || !payload || payload.ok === false) {
        throw new Error((payload && payload.error) || "Scan failed");
      }
    } catch (err) {
      const msg = err && err.message ? err.message : "Scan failed";
      const hint = /failed to fetch|networkerror/i.test(msg)
        ? " Scan updates only works on a local hub. Install Node.js 18 or newer (npm is included; Python is not required), download this project from GitHub, and run npm run dev. Then open http://127.0.0.1:4000. The public site cannot read Game8."
        : "";
      openExtraScanModal(
        (game.name || "Game") + " — scan failed",
        extraScanStatusNode(msg + hint),
        [extraScanCloseButton()]
      );
      return;
    }
    scan.versionLabel = payload.version || scan.versionLabel || "";
    scan.updateEndDate = payload.updateEndDate || null;
    scan.releasedOn = payload.releasedOn || null;
    scan.lastScanAt = new Date().toISOString();
    save();
    const proposals = filterExtraScanProposals(game, payload.tasks || []);
    showExtraScanReview(game, proposals, payload);
  }

  function extraScanCloseButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-ghost";
    btn.textContent = "Close";
    btn.addEventListener("click", closeExtraScanModal);
    return btn;
  }

  function showExtraScanReview(game, proposals, payload) {
    const wrap = document.createElement("div");
    const intro = document.createElement("p");
    intro.className = "extra-scan-status";
    const ver = payload.version ? "Version " + payload.version : "This update";
    intro.textContent = proposals.length
      ? ver + " for " + (game.name || "this game") + ". Nothing already saved is removed. Pick what to add. Story tasks stay open (end TBD), start on the update date, and name the banner character in the description. Event tasks use the event name only. Start and end dates are read from each event's own page. The description says login bonus, gameplay, spending, reward bonus, returnee, or character trial."
      : ver + " did not find any new story or event tasks after your latest matching extracurricular task.";
    wrap.appendChild(intro);
    if (payload.updateEndDate) {
      const endNote = document.createElement("p");
      endNote.className = "extra-scan-status";
      endNote.textContent = "Update window ends " + payload.updateEndDate + ". After that date, Home and Extracurricular show a reminder to scan again.";
      wrap.appendChild(endNote);
    }
    if (payload.warnings && payload.warnings.length) {
      const warn = document.createElement("p");
      warn.className = "extra-scan-status";
      warn.textContent = payload.warnings[0];
      wrap.appendChild(warn);
    }
    const checks = [];
    if (proposals.length) {
      const list = document.createElement("div");
      list.className = "extra-scan-list";
      proposals.forEach((task, index) => {
        const row = document.createElement("label");
        row.className = "extra-scan-item";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.className = "fill-toggle";
        box.checked = task.checked !== false;
        checks.push({ box, task, index });
        const copy = document.createElement("span");
        copy.className = "extra-scan-item-copy";
        const kind = document.createElement("span");
        kind.className = "extra-scan-kind";
        kind.textContent = task.kind === "STORY" ? "STORY" : "EVENT";
        const title = document.createElement("span");
        title.className = "extra-scan-item-title";
        title.textContent = task.label || "Untitled";
        const meta = document.createElement("span");
        meta.className = "extra-scan-item-meta";
        const endBit = task.endDateTBD || !task.endDate ? "end TBD" : "ends " + task.endDate;
        meta.textContent = (task.startDate ? "starts " + task.startDate + " · " : "") + endBit + (task.description ? " · " + task.description : "");
        copy.appendChild(kind);
        copy.appendChild(title);
        copy.appendChild(meta);
        row.appendChild(box);
        row.appendChild(copy);
        list.appendChild(row);
      });
      wrap.appendChild(list);
    }
    const actions = [extraScanCloseButton()];
    if (proposals.length) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn";
      addBtn.textContent = "Add selected";
      addBtn.addEventListener("click", () => {
        const chosen = checks.filter((row) => row.box.checked).map((row) => row.task);
        if (!chosen.length) return;
        commitExtraScanTasks(game, chosen);
        closeExtraScanModal();
      });
      actions.push(addBtn);
    }
    openExtraScanModal((game.name || "Game") + " — found tasks", wrap, actions);
  }

  function commitExtraScanTasks(game, tasks) {
    state.extracurricularTasks = state.extracurricularTasks || [];
    const stamp = Date.now();
    tasks.forEach((task, i) => {
      const endTbd = task.endDateTBD !== false || !task.endDate;
      state.extracurricularTasks.push({
        id: "ex_" + stamp + "_" + i,
        label: task.label,
        startDate: task.startDate || getDateStr(),
        endDateTBD: endTbd,
        endDate: endTbd ? null : task.endDate,
        endTime: endTbd ? undefined : "23:59",
        description: task.description || null,
        gameId: game.id,
        bannerOverlayText: task.kind === "STORY" ? "STORY" : "EVENT",
        bannerOverlayTextSize: 3,
      });
    });
    save();
    renderActiveTab();
  }

  function openExtraScanForGame(gameId) {
    const game = getGame(gameId);
    if (!game) return;
    runExtraScan(game);
  }

  function openExtraScanGamePicker() {
    const games = getAllGames();
    const wrap = document.createElement("div");
    const intro = document.createElement("p");
    intro.className = "extra-scan-status";
    intro.textContent = "Local hub only. The public site cannot read Game8. Pick a game. The scan only reads that game’s pages and only adds tasks you check.";
    wrap.appendChild(intro);
    if (!games.length) {
      wrap.appendChild(extraScanStatusNode("Add a game first."));
      openExtraScanModal("Scan updates", wrap, [extraScanCloseButton()]);
      return;
    }
    const list = document.createElement("div");
    list.className = "extra-scan-game-list";
    games.forEach((game) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-ghost extra-scan-game-btn";
      const scan = ensureExtraScan(game);
      btn.textContent = (game.name || "Game") + (scan.enabled ? "" : " — queue off");
      btn.addEventListener("click", () => openExtraScanForGame(game.id));
      list.appendChild(btn);
    });
    wrap.appendChild(list);
    openExtraScanModal("Scan updates", wrap, [extraScanCloseButton()]);
  }

  function appendExtraScanCurrencySettings(content, game) {
    const scan = ensureExtraScan(game);
    const row = document.createElement("div");
    row.className = "endgame-currency-row endgame-currency-row-with-desc";
    const label = document.createElement("label");
    label.textContent = "Auto task queue";
    const info = document.createElement("span");
    info.className = "currency-info-icon";
    info.title = "Off by default. When on, a manual scan can propose new story and event tasks from the pages below. Saved tasks are never removed.";
    info.setAttribute("aria-label", "More information");
    info.textContent = "ⓘ";
    label.appendChild(info);
    row.appendChild(label);
    const inner = document.createElement("div");
    inner.className = "endgame-currency-row-inner";
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.className = "settings-toggle";
    toggle.checked = !!scan.enabled;
    toggle.setAttribute("aria-label", "Auto task queue");
    const desc = document.createElement("span");
    desc.className = "endgame-currency-desc";
    desc.textContent = "Manual scan only, and only on a local hub. The public site cannot read Game8. On arms the update-ended reminder and lets Scan updates create new extracurricular tasks.";
    inner.appendChild(toggle);
    inner.appendChild(desc);
    row.appendChild(inner);
    content.appendChild(row);

    const pagesWrap = document.createElement("div");
    pagesWrap.className = "extra-scan-urls";
    pagesWrap.hidden = !scan.enabled;

    function paintUrls() {
      pagesWrap.innerHTML = "";
      const hint = document.createElement("p");
      hint.className = "endgame-currency-desc extra-scan-url-hint";
      hint.textContent = "Pages to compare. The scan combines them. Game roots also follow that page’s current version and events links.";
      pagesWrap.appendChild(hint);
      const list = scan.urls.length ? scan.urls.slice() : [""];
      list.forEach((url, index) => {
        const line = document.createElement("div");
        line.className = "extra-scan-url-row";
        const input = document.createElement("input");
        input.type = "url";
        input.placeholder = "https://game8.co/games/…";
        input.value = url;
        input.setAttribute("aria-label", "Scan page " + (index + 1));
        input.addEventListener("change", () => {
          scan.urls[index] = input.value.trim();
          scan.urls = scan.urls.filter(Boolean);
          save();
          paintUrls();
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn-ghost btn-sm";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
          scan.urls.splice(index, 1);
          save();
          paintUrls();
        });
        line.appendChild(input);
        line.appendChild(remove);
        pagesWrap.appendChild(line);
      });
      const add = document.createElement("button");
      add.type = "button";
      add.className = "btn btn-ghost btn-sm";
      add.textContent = "Add page";
      add.addEventListener("click", () => {
        scan.urls.push("");
        save();
        paintUrls();
      });
      pagesWrap.appendChild(add);
    }

    toggle.addEventListener("change", () => {
      scan.enabled = toggle.checked;
      if (scan.enabled && !scan.urls.filter(Boolean).length) {
        scan.urls = extraScanPresetUrls(game);
      }
      save();
      pagesWrap.hidden = !scan.enabled;
      paintUrls();
      renderActiveTab();
    });
    paintUrls();
    content.appendChild(pagesWrap);
  }

  function initExtraScanModal() {
    const modal = document.getElementById("extraScanModal");
    const closeBtn = document.getElementById("extraScanModalClose");
    if (!modal) return;
    modal.addEventListener("click", (e) => {
      if (e.target && e.target.getAttribute && e.target.getAttribute("data-close") === "true") closeExtraScanModal();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeExtraScanModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.hidden) closeExtraScanModal();
    });
  }
