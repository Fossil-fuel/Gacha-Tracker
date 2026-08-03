  function buildDailyTaskItem(game, tagName) {
    const doneToday = isCompletedToday("dailies", game.id);
    const el = document.createElement(tagName || "li");
    el.className = "task-item task-item-daily" + (doneToday ? " done" : "");

    const iconWrap = document.createElement("div");
    iconWrap.className = "task-daily-icon";
    if (game && game.iconImage) {
      const img = document.createElement("img");
      img.src = game.iconImage;
      img.alt = "";
      img.draggable = false;
      iconWrap.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "task-daily-icon-placeholder";
      ph.setAttribute("aria-hidden", "true");
      ph.textContent = ((game && game.name) || "?").trim().charAt(0).toUpperCase() || "?";
      iconWrap.appendChild(ph);
    }
    el.appendChild(iconWrap);

    const main = document.createElement("div");
    main.className = "task-daily-main";

    const head = document.createElement("div");
    head.className = "task-daily-head";
    const nameEl = document.createElement("span");
    nameEl.className = "task-label";
    nameEl.textContent = (game && game.name) || game.id;
    nameEl.addEventListener("click", () => toggleDaily(game.id));
    head.appendChild(nameEl);
    const pot = document.createElement("span");
    pot.className = "task-potential";
    pot.textContent = "Potential: " + getDailyPotential(game);
    head.appendChild(pot);
    main.appendChild(head);

    const statusRow = document.createElement("div");
    statusRow.className = "task-daily-status";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "task-checkbox";
    check.setAttribute("aria-label", doneToday ? "Mark incomplete" : "Mark complete");
    check.addEventListener("click", () => toggleDaily(game.id));
    statusRow.appendChild(check);
    const statusText = document.createElement("div");
    statusText.className = "task-daily-status-text";
    const statusLabel = document.createElement("strong");
    statusLabel.textContent = "Completion Status:";
    const statusVal = document.createElement("span");
    statusVal.textContent = doneToday ? "Complete" : "Incomplete";
    statusText.appendChild(statusLabel);
    statusText.appendChild(statusVal);
    statusRow.appendChild(statusText);
    main.appendChild(statusRow);

    const remainingRow = document.createElement("div");
    remainingRow.className = "task-daily-remaining";
    const remLabel = document.createElement("span");
    remLabel.innerHTML = "<strong>Time remaining:</strong>";
    remainingRow.appendChild(remLabel);
    const remainingVal = document.createElement("span");
    remainingVal.className = "task-remaining";
    remainingVal.dataset.type = "daily";
    remainingVal.dataset.gameId = game.id;
    remainingVal.textContent = getDailyTimeRemainingText(game, getSimulatedNow());
    remainingRow.appendChild(remainingVal);
    main.appendChild(remainingRow);

    el.appendChild(main);
    return el;
  }

  /** Square left icon sized to card height, but capped so it never covers text on narrow screens. */
  function syncDailyCardIconSizes(root) {
    if (!root) return;
    const cards = Array.from(root.querySelectorAll(".task-item-daily"));
    if (cards.length === 0) return;
    cards.forEach((card) => {
      const icon = card.querySelector(".task-daily-icon");
      if (!icon) return;
      icon.style.width = "";
      icon.style.minWidth = "";
      icon.style.height = "";
      icon.style.minHeight = "";
    });
    cards.forEach((card) => {
      const icon = card.querySelector(".task-daily-icon");
      if (!icon) return;
      const cs = getComputedStyle(card);
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const rect = card.getBoundingClientRect();
      const fromHeight = Math.max(56, Math.round(rect.height - padY));
      // Keep enough room for the text column on narrow / hamburger layouts.
      const maxFromWidth = Math.max(56, Math.floor((rect.width - padX) * 0.4));
      const side = Math.min(fromHeight, maxFromWidth);
      icon.style.width = side + "px";
      icon.style.minWidth = side + "px";
      icon.style.height = side + "px";
      icon.style.minHeight = side + "px";
    });
  }

  /** Size home daily cards; use 2 rows when hamburger / only ~2 would fit in one row. */
  function syncHomeDailyCardSizes(grid) {
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll(":scope > .task-item-daily"));
    if (cards.length === 0) return;

    const scroll = grid.closest(".home-dwe-checklist-scroll");
    const viewportW = scroll ? scroll.clientWidth : 0;
    const styles = scroll ? getComputedStyle(scroll) : null;
    const padX = styles
      ? (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
      : 16;
    const gap = parseFloat(getComputedStyle(grid).gap) || 8;
    const usable = viewportW > 0 ? Math.max(0, viewportW - padX) : 0;
    const isNarrow = viewportW > 0 && viewportW < 769;
    const minSingle = isNarrow ? 300 : 280;
    const colsIfSingle = usable > 0
      ? Math.floor((usable + gap) / (minSingle + gap))
      : 4;
    const useTwoRows = cards.length >= 2 && (isNarrow || colsIfSingle <= 2);

    let visibleCols;
    let minCard;
    if (useTwoRows) {
      // Prefer 2 columns across when width allows; otherwise one column + peek scroll.
      visibleCols = usable >= (minSingle * 2 + gap) ? 2 : 1.25;
      minCard = isNarrow ? 280 : 260;
    } else {
      visibleCols = 3.5;
      minCard = 280;
    }
    const fitW = usable > 0
      ? Math.floor((usable - gap * Math.max(0, visibleCols - 1)) / visibleCols)
      : 0;

    cards.forEach((card) => {
      card.style.width = "auto";
      card.style.minWidth = "0";
      card.style.height = "auto";
      card.style.minHeight = "0";
      card.style.maxHeight = "none";
      const icon = card.querySelector(".task-daily-icon");
      if (icon) {
        icon.style.width = "";
        icon.style.minWidth = "";
        icon.style.height = "";
        icon.style.minHeight = "";
        icon.style.flex = "";
      }
    });

    const cardW = Math.max(minCard, fitW || minCard);
    grid.classList.toggle("home-dailies-two-rows", useTwoRows);
    grid.style.gridAutoColumns = cardW + "px";
    grid.style.gridAutoFlow = "column";
    grid.style.gridTemplateRows = useTwoRows ? "auto auto" : "1fr";
    cards.forEach((card) => {
      card.style.width = cardW + "px";
      card.style.minWidth = cardW + "px";
    });

    let maxH = 0;
    cards.forEach((card) => {
      maxH = Math.max(maxH, Math.ceil(card.scrollHeight), Math.ceil(card.getBoundingClientRect().height));
    });
    maxH = Math.max(140, maxH);

    cards.forEach((card) => {
      card.style.height = maxH + "px";
      card.style.minHeight = maxH + "px";
      card.style.maxHeight = maxH + "px";
    });
    if (useTwoRows) {
      grid.style.gridTemplateRows = maxH + "px " + maxH + "px";
    }
    syncDailyCardIconSizes(grid);
  }

  function renderDailies() {
    const content = document.getElementById("dailies-content");
    if (!content) return;
    content.innerHTML = "";
    const games = getAllGames();
    const list = document.createElement("div");
    list.id = "list-dailies";
    list.className = "task-grid task-grid-dailies";
    list.dataset.masonryMax = "3";
    list.setAttribute("data-type", "dailies");

    let hasAny = false;
    games.forEach((game) => {
      if (!game.dailies) return;
      hasAny = true;
      list.appendChild(buildDailyTaskItem(game, "div"));
    });
    if (!hasAny) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.style.gridColumn = "1 / -1";
      empty.textContent = "No games yet. Add one in the Games tab.";
      list.appendChild(empty);
    }
    content.appendChild(list);
    scheduleTaskMasonry(list);
    requestAnimationFrame(() => {
      syncDailyCardIconSizes(list);
      list.querySelectorAll("img").forEach((img) => {
        if (img.complete) return;
        img.addEventListener("load", () => syncDailyCardIconSizes(list), { once: true });
      });
    });
  }
