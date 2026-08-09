"use strict";

const assert = require("../lib/assert");

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
    assert.ok(html.includes('data-tab="dailies"'), "dailies tab present in served HTML");
    assert.ok(html.includes('data-tab="weeklies"'), "weeklies tab present");
    assert.ok(html.includes('data-tab="endgame"'), "endgame tab present");
    assert.ok(html.includes("app.js"), "app.js script referenced");

    const app = await fetchText(BASE + "/app.js");
    assert.ok(app.includes("function recordCompletion"), "served app.js has recordCompletion");
    assert.ok(app.includes("function renderHome"), "served app.js has renderHome");
    assert.ok(app.includes("function setCycleCompletionMoment"), "served app.js has finish-moment edits");
    assert.ok(app.includes("function setExtracurricularCompletionMoment"), "served app.js has extracurricular moment edits");
    assert.ok(app.includes("Only applies for manual-reset endgame"), "served app.js locks Start/End to manual-reset");

    const css = await fetchText(BASE + "/styles.css");
    assert.ok(css.length > 1000, "styles.css is served");
    assert.ok(css.includes("earnings-modal-finish-row"), "styles include Finished editors");
    assert.ok(css.includes("extracurricular-completed-row"), "styles include Completed row");
  },
};
