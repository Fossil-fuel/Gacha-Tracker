  function getSidebarResetHour() {
    const server = state.primaryServer && ["america", "asia", "europe"].includes(state.primaryServer) ? state.primaryServer : "america";
    return getEffectiveResetHour ? getEffectiveResetHour(server, getSimulatedNow()) : getDefaultResetHour();
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
    const offsetRef = getSimulatedNow();
    return getNextResetDateInTimezone(now, hour, minute, tz, offsetRef);
  }

  let lastDstSidebarUpdateMs = 0;

  function updateSidebarTime() {
    const now = getSimulatedNow();
    const tz = getAppTimezone();
    const recTz = getRecordingTimezone();
    const parts = getDatePartsInTimezone(now, tz);
    const dateEl = document.getElementById("currentDate");
    if (dateEl) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const month = monthNames[parts.month];
      const offset = (state.simulatedDateOffset || 0);
      dateEl.textContent = parts.weekday + ", " + month + " " + parts.day + ", " + parts.year + (offset > 0 ? " (+" + offset + " day simulated)" : "");
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
      const nowMs = now.getTime();
      if (nowMs - lastDstSidebarUpdateMs >= 60000) {
        lastDstSidebarUpdateMs = nowMs;
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
  }

  /** Pack .task-grid cards into equal-width shortest-column masonry (up to 4 cols). Skips home checklist strip. */
  function unwrapTaskMasonry(root) {
    if (!root) return;
    root.querySelectorAll(":scope > .task-masonry-col").forEach((col) => {
      while (col.firstChild) root.insertBefore(col.firstChild, col);
      col.remove();
    });
    root.classList.remove("task-grid-masonry-js", "task-grid-masonry-single");
  }

  function applyTaskMasonry(root, opts) {
    if (!root || !root.classList || !root.classList.contains("task-grid")) return;
    if (root.closest(".home-dwe-checklist-scroll")) return;
    const force = !!(opts && opts.force);
    const items = Array.from(root.querySelectorAll(":scope > .task-item, :scope > .task-masonry-col > .task-item"));
    if (items.length === 0) {
      unwrapTaskMasonry(root);
      return;
    }
    const gap = 12;
    const minColRaw = Number(root.dataset.masonryMin);
    const minColDefault = root.classList.contains("task-grid-dailies") ? 300 : 200;
    const minCol = Number.isFinite(minColRaw) && minColRaw >= 120 ? minColRaw : minColDefault;
    const width = root.getBoundingClientRect().width || root.clientWidth || 0;
    if (width < 40) return;
    const maxColsRaw = Number(root.dataset.masonryMax);
    const maxCols = Number.isFinite(maxColsRaw) && maxColsRaw > 0 ? Math.min(4, Math.floor(maxColsRaw)) : 4;
    let colCount = Math.floor((width + gap) / (minCol + gap));
    colCount = Math.max(1, Math.min(maxCols, colCount));
    const prevCols = Number(root.dataset.masonryCols || 0);
    const alreadyPacked = !!root.querySelector(":scope > .task-masonry-col");
    if (!force && alreadyPacked && prevCols === colCount) return;

    unwrapTaskMasonry(root);
    root.dataset.masonryCols = String(colCount);
    if (colCount === 1) {
      root.classList.add("task-grid-masonry-js", "task-grid-masonry-single");
      return;
    }
    root.classList.add("task-grid-masonry-js");
    const columns = [];
    const heights = [];
    for (let i = 0; i < colCount; i++) {
      const col = document.createElement("div");
      col.className = "task-masonry-col";
      root.appendChild(col);
      columns.push(col);
      heights.push(0);
    }
    items.forEach((item) => {
      let best = 0;
      for (let i = 1; i < colCount; i++) {
        if (heights[i] < heights[best]) best = i;
      }
      columns[best].appendChild(item);
      heights[best] += (item.getBoundingClientRect().height || 140) + gap;
    });
  }

  let taskMasonryResizeObserver = null;
  /**
   * Pack task cards into a staggered masonry grid.
   * Packs once on open; does not reshuffle as images load (banner aspect-ratio
   * reserves height). Window resize only re-packs if the column count changes.
   */
  function scheduleTaskMasonry(root) {
    if (!root) return;
    requestAnimationFrame(() => {
      applyTaskMasonry(root, { force: true });
      if (typeof ResizeObserver === "undefined") return;
      if (!taskMasonryResizeObserver) {
        taskMasonryResizeObserver = new ResizeObserver((entries) => {
          // force:false → only re-pack when column count changes (see applyTaskMasonry).
          entries.forEach((entry) => applyTaskMasonry(entry.target, { force: false }));
        });
      }
      try {
        taskMasonryResizeObserver.observe(root);
      } catch (_) {}
    });
  }

  /** Sort board entries: incomplete first by soonest due, completed at end. */
  function sortBoardTaskEntries(entries) {
    return [...entries].sort((a, b) => {
      const aAwait = !!(a.task && a.task.manualAwaitingRestart);
      const bAwait = !!(b.task && b.task.manualAwaitingRestart);
      if (aAwait !== bAwait) return aAwait ? -1 : 1;
      if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
      const aDue = Number.isFinite(a.dueMs) ? a.dueMs : Number.POSITIVE_INFINITY;
      const bDue = Number.isFinite(b.dueMs) ? b.dueMs : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      if ((a.gameOrder || 0) !== (b.gameOrder || 0)) return (a.gameOrder || 0) - (b.gameOrder || 0);
      return (a.taskOrder || 0) - (b.taskOrder || 0);
    });
  }

  function normalizeTaskBannerShape(shape) {
    if (shape === "square" || shape === "vertical" || shape === "horizontal") return shape;
    return "horizontal";
  }

  /** Resolved banner aspect ratio (width/height). Supports freeform bannerAspect + legacy shapes. */
  function getTaskBannerAspect(task) {
    if (task && Number.isFinite(Number(task.bannerAspect)) && Number(task.bannerAspect) > 0) {
      return Number(task.bannerAspect);
    }
    const shape = normalizeTaskBannerShape(task && task.bannerShape);
    if (shape === "square") return 1;
    if (shape === "vertical") return 9 / 16;
    return 16 / 9;
  }

  /** surface: "home" | "games" | "board" (default). Uses shared bannerSourceImage + bannerViews. */
  function getTaskBannerForSurface(task, surface) {
    const s = surface || "board";
    if (!task) return { image: null, aspect: 16 / 9, source: null };
    const source = (typeof resolveTaskBannerSource === "function")
      ? resolveTaskBannerSource(task)
      : (task.bannerSourceImage || task.bannerImage || task.bannerHomeImage || task.bannerGamesImage || null);
    const view = (typeof resolveTaskBannerView === "function")
      ? resolveTaskBannerView(task, s)
      : null;
    if (source) {
      let aspect = (view && Number(view.aspect) > 0) ? Number(view.aspect) : null;
      if (!aspect) {
        if (s === "home") aspect = 16 / 9;
        else if (s === "games") aspect = 3 / 4;
        else aspect = getTaskBannerAspect(task);
      }
      const display =
        typeof resolveStockBannerUrl === "function" ? resolveStockBannerUrl(source) : source;
      return { image: display, aspect: aspect, view: view, source: source };
    }
    // Legacy per-surface images (pre single-source)
    if (s === "home" && task.bannerHomeImage) {
      return {
        image: task.bannerHomeImage,
        aspect: (Number(task.bannerHomeAspect) > 0 ? Number(task.bannerHomeAspect) : 16 / 9),
        view: null,
        source: null,
      };
    }
    if (s === "games" && task.bannerGamesImage) {
      return {
        image: task.bannerGamesImage,
        aspect: (Number(task.bannerGamesAspect) > 0 ? Number(task.bannerGamesAspect) : 3 / 4),
        view: null,
        source: null,
      };
    }
    if (task.bannerImage) {
      return {
        image: task.bannerImage,
        aspect: getTaskBannerAspect(task),
        view: null,
        source: null,
      };
    }
    return { image: null, aspect: (view && view.aspect) || 16 / 9, view: null, source: null };
  }

  function applyBannerViewportImgStyles(img, view) {
    if (!img) return;
    if (!view) {
      img.style.left = "0";
      img.style.top = "0";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      return;
    }
    img.style.left = (Number(view.x || 0) * 100) + "%";
    img.style.top = (Number(view.y || 0) * 100) + "%";
    img.style.width = (Math.max(0.001, Number(view.w || 1)) * 100) + "%";
    img.style.height = (Math.max(0.001, Number(view.h || 1)) * 100) + "%";
    img.style.objectFit = "fill";
    img.style.objectPosition = "center";
  }

  function getTaskBannerOverlayText(task) {
    if (!task) return "";
    return String(task.bannerOverlayText || "").trim();
  }

  /** Optional CSS label over a banner image container. */
  function appendBannerOverlayLabel(parent, task) {
    const text = getTaskBannerOverlayText(task);
    if (!parent || !text) return null;
    const el = document.createElement("span");
    el.className = "task-banner-overlay";
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  /** Banner strip/thumb for weekly & endgame task cards. variant: "card" | "thumb" */
  function appendTaskBanner(parent, task, variant) {
    if (!parent || !task) return null;
    const surface = variant === "thumb" ? "games" : "board";
    const banner = getTaskBannerForSurface(task, surface);
    if (!banner.image) return null;
    const wrap = document.createElement("div");
    wrap.className = (variant === "thumb" ? "task-banner-thumb-wrap" : "task-banner-card-wrap");
    wrap.style.aspectRatio = String(banner.aspect);
    const img = document.createElement("img");
    img.className = (variant === "thumb" ? "task-banner-thumb" : "task-banner-card") + " task-banner-viewport-img";
    img.src = banner.image;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    applyBannerViewportImgStyles(img, banner.view);
    wrap.appendChild(img);
    appendBannerOverlayLabel(wrap, task);
    parent.insertBefore(wrap, parent.firstChild);
    parent.classList.add(variant === "thumb" ? "has-task-banner-thumb" : "has-task-banner");
    return img;
  }

  function isGamesBannerHamburgerMode() {
    try {
      return !!(window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
    } catch (_) {
      return false;
    }
  }

  /** Full-height left media panel for Games-page managed task cards.
   *  opts.surface: force "home" | "games". Default: home in hamburger, games otherwise. */
  function appendGamesTaskSideMedia(cardEl, task, opts) {
    if (!cardEl) return null;
    const media = document.createElement("div");
    media.className = "games-task-media";
    const forced = opts && opts.surface;
    const surface = (forced === "home" || forced === "games")
      ? forced
      : (isGamesBannerHamburgerMode() ? "home" : "games");
    const banner = getTaskBannerForSurface(task, surface);
    if (banner.image) {
      const stage = document.createElement("div");
      stage.className = "games-task-media-stage";
      const fallbackAspect = surface === "home" ? (16 / 9) : (3 / 4);
      const aspect = Number(banner.aspect) > 0 ? Number(banner.aspect) : fallbackAspect;
      stage.style.aspectRatio = String(aspect);
      stage.style.setProperty("--banner-aspect", String(aspect));
      media.style.setProperty("--banner-aspect", String(aspect));
      const img = document.createElement("img");
      img.className = "games-task-media-img task-banner-viewport-img";
      img.src = banner.image;
      img.alt = "";
      img.loading = "lazy";
      img.draggable = false;
      applyBannerViewportImgStyles(img, banner.view);
      stage.appendChild(img);
      appendBannerOverlayLabel(stage, task);
      media.appendChild(stage);
      cardEl.classList.add("has-games-task-media");
    } else {
      const ph = document.createElement("div");
      ph.className = "games-task-media-placeholder";
      ph.setAttribute("aria-hidden", "true");
      media.appendChild(ph);
    }
    cardEl.insertBefore(media, cardEl.firstChild);
    return media;
  }

  function resolveGameIconUrl(source) {
    if (!source) return "";
    return typeof resolveStockBannerUrl === "function" ? resolveStockBannerUrl(source) : String(source);
  }

  function buildTaskCardAvatar(game) {
    if (game && game.iconImage) {
      const img = document.createElement("img");
      img.className = "task-card-avatar";
      img.src = resolveGameIconUrl(game.iconImage);
      img.alt = "";
      img.draggable = false;
      return img;
    }
    const ph = document.createElement("div");
    ph.className = "task-card-avatar task-card-avatar-placeholder";
    ph.setAttribute("aria-hidden", "true");
    ph.textContent = ((game && game.name) || "?").trim().charAt(0).toUpperCase() || "?";
    return ph;
  }

  /**
   * Home/dailies heading: game icon left of name, optional potential under the name.
   * Returns { el, nameEl }.
   */
  function buildTaskGameHeading(game, opts) {
    const o = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "task-game-heading" + (o.className ? " " + o.className : "");

    if (game && game.iconImage) {
      const img = document.createElement("img");
      img.className = "task-game-heading-icon";
      img.src = resolveGameIconUrl(game.iconImage);
      img.alt = "";
      img.draggable = false;
      wrap.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "task-game-heading-icon task-game-heading-icon-placeholder";
      ph.setAttribute("aria-hidden", "true");
      ph.textContent = ((game && game.name) || o.title || "?").trim().charAt(0).toUpperCase() || "?";
      wrap.appendChild(ph);
    }

    const text = document.createElement("div");
    text.className = "task-game-heading-text";
    const nameEl = document.createElement("span");
    nameEl.className = "task-label";
    nameEl.textContent = o.title || (game && game.name) || "Game";
    text.appendChild(nameEl);
    if (o.potential != null && String(o.potential).trim() !== "") {
      const pot = document.createElement("span");
      pot.className = "task-potential";
      pot.textContent = o.potential;
      text.appendChild(pot);
    }
    wrap.appendChild(text);
    return { el: wrap, nameEl: nameEl };
  }

  /**
   * Inter-Knot style media header: banner (or placeholder) + overlapping game avatar/name.
   * opts.surface: "home" | "board" | "games" (default board)
   * Empty banners shrink to the game-name byline except on home (keeps full placeholder).
   */
  function appendTaskCardMedia(cardEl, task, game, opts) {
    if (!cardEl) return null;
    const surface = (opts && opts.surface) || "board";
    const banner = getTaskBannerForSurface(task, surface);
    const hasBanner = !!banner.image;
    const shrinkEmpty = !hasBanner && surface !== "home";
    const aspect = hasBanner ? banner.aspect : 16 / 9;
    const media = document.createElement("div");
    media.className = "task-card-media"
      + (hasBanner ? "" : " task-card-media-empty")
      + (shrinkEmpty ? " task-card-media-compact" : "");
    if (!shrinkEmpty) media.style.aspectRatio = String(aspect);

    if (hasBanner) {
      const img = document.createElement("img");
      img.className = "task-banner-card task-banner-viewport-img";
      img.src = banner.image;
      img.alt = "";
      img.loading = "lazy";
      img.draggable = false;
      applyBannerViewportImgStyles(img, banner.view);
      media.appendChild(img);
      appendBannerOverlayLabel(media, task);
      cardEl.classList.add("has-task-banner");
    } else if (!shrinkEmpty) {
      const ph = document.createElement("div");
      ph.className = "task-card-media-placeholder";
      ph.setAttribute("aria-hidden", "true");
      media.appendChild(ph);
    }

    const byline = document.createElement("div");
    byline.className = "task-card-byline";
    byline.appendChild(buildTaskCardAvatar(game));
    const author = document.createElement("span");
    author.className = "task-card-author";
    author.textContent = (game && game.name) || "Game";
    byline.appendChild(author);
    media.appendChild(byline);

    cardEl.classList.add("task-card-knot");
    cardEl.appendChild(media);
    return media;
  }

  function appendTaskCardBody(cardEl) {
    const body = document.createElement("div");
    body.className = "task-card-body";
    cardEl.appendChild(body);
    return body;
  }

  /** Compress an image file to a JPEG data URL (shared by task banners + game icons). */
  function compressImageFileToDataUrl(file, opts) {
    const options = opts || {};
    const maxW = options.maxWidth || 720;
    const quality = options.quality == null ? 0.72 : options.quality;
    const maxBytes = options.maxBytes || 4 * 1024 * 1024;
    return new Promise((resolve, reject) => {
      if (!file || !String(file.type || "").startsWith("image/")) {
        reject(new Error("Choose an image file."));
        return;
      }
      if (file.size > maxBytes) {
        reject(new Error("Image is too large (max " + Math.round(maxBytes / (1024 * 1024)) + "MB)."));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxW / Math.max(1, img.naturalWidth || img.width));
        const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image."));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not load image."));
      };
      img.src = url;
    });
  }

  /**
   * Game identity row: square icon + name + optional subtitle (list headers / Games title).
   * opts: { tagName?, className?, showPlaceholder?, interactive? }
   */
  function buildGameIdentityHeader(game, opts) {
    const o = opts || {};
    const el = document.createElement(o.tagName || "div");
    const shape = (game && (game.iconShape === "circle" || game.iconShape === "square" || game.iconShape === "rounded"))
      ? game.iconShape
      : "rounded";
    el.className =
      "game-identity game-identity-shape-" +
      shape +
      (o.className ? " " + o.className : "") +
      (o.interactive ? " game-identity-interactive" : "");
    if (o.interactive) {
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      el.setAttribute("aria-label", "Edit game identity for " + ((game && game.name) || "game"));
    }
    if (game && game.iconImage) {
      const icon = document.createElement("img");
      icon.className = "game-identity-icon";
      icon.src = resolveGameIconUrl(game.iconImage);
      icon.alt = "";
      icon.draggable = false;
      el.appendChild(icon);
    } else if (o.showPlaceholder) {
      const ph = document.createElement("div");
      ph.className = "game-identity-icon game-identity-icon-placeholder";
      ph.setAttribute("aria-hidden", "true");
      const letter = ((game && game.name) || "?").trim().charAt(0).toUpperCase() || "?";
      ph.textContent = letter;
      el.appendChild(ph);
    }
    const text = document.createElement("div");
    text.className = "game-identity-text";
    const name = document.createElement("div");
    name.className = "game-identity-name";
    name.textContent = (game && game.name) || "Game";
    text.appendChild(name);
    const sub = (game && game.subtitle && String(game.subtitle).trim()) || "";
    if (sub) {
      const subtitle = document.createElement("div");
      subtitle.className = "game-identity-subtitle";
      subtitle.textContent = sub;
      text.appendChild(subtitle);
    } else if (o.interactive) {
      const hint = document.createElement("div");
      hint.className = "game-identity-subtitle game-identity-hint";
      hint.textContent = "Click to edit icon, name, and subtitle";
      text.appendChild(hint);
    }
    el.appendChild(text);
    return el;
  }

