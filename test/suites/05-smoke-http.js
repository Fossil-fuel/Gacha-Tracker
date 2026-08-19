"use strict";

const assert = require("../lib/assert");
const productMap = require("../lib/product-map");

const BASE = process.env.GATCHA_TEST_URL || "http://localhost:4000";

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return res.text();
}

module.exports = {
  name: "smoke-http",
  title: "Live site smoke (localhost)",
  async run() {
    let html;
    try {
      html = await fetchText(BASE + "/");
    } catch (err) {
      const skip = new Error(
        "SKIP: dev server not reachable at " + BASE + " (" + err.message + "). Start with npm run dev, or set GATCHA_TEST_URL."
      );
      skip.skip = true;
      throw skip;
    }

    assert.ok(html.includes("Gacha Tracker"), "home page title/brand present");
    const surfaces = productMap.extractFromHtml(html);
    assert.equal(surfaces.tabs, productMap.expectedSidebarTabs(), "served HTML sidebar tabs");
    assert.equal(surfaces.panels, productMap.expectedPanels(), "served HTML panels");
    assert.equal(surfaces.modals, productMap.expectedModals(), "served HTML modals");
    productMap.SUBVIEWS.forEach((v) => {
      assert.ok(html.includes(v.needle), "served HTML has " + v.id);
    });
    assert.ok(html.includes("app.js"), "app.js script referenced");

    const app = await fetchText(BASE + "/app.js");
    productMap.WRITE_PATHS.forEach((w) => {
      assert.ok(app.includes(w.name), "served app.js has " + w.name);
    });
    productMap.expectedRenders().forEach((fn) => {
      assert.ok(app.includes("function " + fn), "served app.js has " + fn);
    });
    assert.ok(app.includes("Only applies for manual-reset endgame"), "served app.js locks Start/End to manual-reset");

    const css = await fetchText(BASE + "/styles.css");
    assert.ok(css.length > 1000, "styles.css is served");
    assert.ok(css.includes("earnings-modal-finish-row"), "styles include Finished editors");
    assert.ok(css.includes("extracurricular-completed-row"), "styles include Completed row");
  },
};
