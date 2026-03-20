/**
 * Mobile integration - layout and behavior for viewports <= 768px.
 * All changes are scoped to mobile via CSS media queries and viewport checks.
 * PC display/format is unaffected.
 */
(function () {
  "use strict";

  const MOBILE_BREAKPOINT = 768;
  const BODY_CLASS_OPEN = "mobile-sidebar-open";
  const BODY_CLASS_KEYBOARD = "mobile-keyboard-open";
  const KEYBOARD_THRESHOLD = 0.75;

  let hamburgerEl = null;
  let overlayEl = null;
  let mobileSettingsBtn = null;
  let navListenersAttached = false;
  let maxViewportHeight = 0;

  function isMobile() {
    return window.matchMedia("(max-width: " + MOBILE_BREAKPOINT + "px)").matches;
  }

  function updateVisualViewport() {
    if (!window.visualViewport) return;
    const vv = window.visualViewport;
    const h = vv.height;
    const t = vv.offsetTop;
    if (isMobile()) {
      maxViewportHeight = Math.max(maxViewportHeight, h);
      const keyboardOpen = h < maxViewportHeight * KEYBOARD_THRESHOLD;
      document.body.classList.toggle(BODY_CLASS_KEYBOARD, keyboardOpen);
    } else {
      document.body.classList.remove(BODY_CLASS_KEYBOARD);
      maxViewportHeight = 0;
    }
    document.documentElement.style.setProperty("--visual-viewport-height", h + "px");
    document.documentElement.style.setProperty("--visual-viewport-offset-top", t + "px");
  }

  function scrollFocusedIntoView() {
    const active = document.activeElement;
    if (!active || !active.closest || !active.closest(".modal")) return;
    const modal = active.closest(".modal-dialog");
    if (!modal) return;
    const scrollEl = modal.querySelector(".modal-body, .settings-content");
    if (!scrollEl || !scrollEl.contains(active)) return;
    function doScroll() {
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 350);
  }

  function openSidebar() {
    document.body.classList.add(BODY_CLASS_OPEN);
    if (hamburgerEl) hamburgerEl.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    document.body.classList.remove(BODY_CLASS_OPEN);
    if (hamburgerEl) hamburgerEl.setAttribute("aria-expanded", "false");
  }

  function toggleSidebar() {
    if (document.body.classList.contains(BODY_CLASS_OPEN)) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function createHamburgerButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mobile-hamburger icon-btn";
    btn.setAttribute("aria-label", "Open menu");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "sidebar-left");
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    btn.addEventListener("click", toggleSidebar);
    return btn;
  }

  function createOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "mobile-sidebar-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.addEventListener("click", closeSidebar);
    return overlay;
  }

  function createMobileSettingsButton() {
    const settingsBtn = document.getElementById("sidebarSettingsBtn");
    if (!settingsBtn) return null;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mobile-settings-btn icon-btn";
    btn.setAttribute("aria-label", "Settings");
    btn.setAttribute("title", "Settings");
    btn.innerHTML = settingsBtn.innerHTML;
    btn.addEventListener("click", function () {
      settingsBtn.click();
    });
    return btn;
  }

  function closeSidebarOnNavClick() {
    const sidebar = document.querySelector(".sidebar-left");
    if (!sidebar || navListenersAttached) return;

    sidebar.addEventListener("click", function (e) {
      if (!isMobile()) return;
      const target = e.target.closest(".tab, .sidebar-data-item, .sidebar-game-item, .sidebar-brand, #aboutNavTitle");
      if (target) closeSidebar();
    });
    navListenersAttached = true;
  }

  function init() {
    if (!isMobile()) {
      closeSidebar();
      return;
    }

    const breadcrumbBar = document.querySelector(".breadcrumb-bar");
    if (!breadcrumbBar) return;

    if (!hamburgerEl) {
      hamburgerEl = createHamburgerButton();
      breadcrumbBar.insertBefore(hamburgerEl, breadcrumbBar.firstChild);
    }

    if (!overlayEl) {
      overlayEl = createOverlay();
      document.body.appendChild(overlayEl);
    }

    if (!mobileSettingsBtn) {
      mobileSettingsBtn = createMobileSettingsButton();
      if (mobileSettingsBtn) {
        const topBarActions = document.querySelector(".top-bar-actions");
        if (topBarActions) {
          topBarActions.insertBefore(mobileSettingsBtn, topBarActions.firstChild);
        }
      }
    }

    closeSidebarOnNavClick();
  }

  function handleResize() {
    if (!isMobile()) {
      closeSidebar();
    } else {
      init();
    }
  }

  function onEscape(e) {
    if (e.key === "Escape" && document.body.classList.contains(BODY_CLASS_OPEN)) {
      closeSidebar();
    }
  }

  function run() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", onEscape);

    if (window.visualViewport) {
      updateVisualViewport();
      window.visualViewport.addEventListener("resize", updateVisualViewport);
      window.visualViewport.addEventListener("scroll", updateVisualViewport);
    }
    document.addEventListener("focusin", scrollFocusedIntoView);
  }

  run();
})();
