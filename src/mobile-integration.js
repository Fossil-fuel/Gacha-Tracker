/**
 * Mobile integration - layout and behavior for viewports <= 768px.
 * All changes are scoped to mobile via CSS media queries and viewport checks.
 * PC display/format is unaffected.
 */
(function () {
  "use strict";

  const MOBILE_BREAKPOINT = 768;
  const BODY_CLASS_OPEN = "mobile-sidebar-open";

  let hamburgerEl = null;
  let overlayEl = null;
  let mobileSettingsBtn = null;
  let navListenersAttached = false;

  function isMobile() {
    return window.matchMedia("(max-width: " + MOBILE_BREAKPOINT + "px)").matches;
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
    if (!sidebar) return;

    sidebar.querySelectorAll(".tab, .sidebar-data-item, .sidebar-game-item").forEach(function (el) {
      el.addEventListener("click", function () {
        if (isMobile()) {
          closeSidebar();
        }
      });
    });
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

    if (!navListenersAttached) {
      closeSidebarOnNavClick();
      navListenersAttached = true;
    }
  }

  function handleResize() {
    if (!isMobile()) {
      closeSidebar();
    } else {
      init();
    }
  }

  function run() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
    window.addEventListener("resize", handleResize);
  }

  run();
})();
