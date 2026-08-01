"use strict";

const assert = require("../lib/assert");
const ocr = require("../lib/extracurricular-ocr-parse");
const fs = require("fs");
const path = require("path");

function check(name, fn) {
  try {
    fn();
    return { name, ok: true };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err && err.message ? err.message : String(err),
      actual: err && err.actual,
      expected: err && err.expected,
    };
  }
}

module.exports = {
  name: "extracurricular-ocr",
  title: "Extracurricular screenshot OCR parse",
  run() {
    const checks = [];
    const appSrc = fs.readFileSync(path.join(__dirname, "..", "..", "app.js"), "utf8");
    const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");

    checks.push(
      check("Source: OCR fill wired in extracurricular modal", () => {
        assert.ok(appSrc.includes("function parseExtracurricularScreenshotText"), "parse helper");
        assert.ok(appSrc.includes("function runExtracurricularScreenshotOcr"), "run OCR");
        assert.ok(appSrc.includes("extracurricularOcrSkipDescription"), "skip description toggle");
        assert.ok(appSrc.includes("tesseract.js"), "tesseract CDN");
        assert.ok(html.includes('id="extracurricularOcrDrop"'), "drop zone");
        assert.ok(html.includes('id="extracurricularOcrSkipDescription"'), "skip toggle in html");
      })
    );

    checks.push(
      check("Parse: ZZZ summer event sample fills name, 37d, description, game hint", () => {
        const text = [
          "Summer Waves Roll In",
          "Ride the Tide Into Summer",
          "37d",
          "Ridu Chronicles",
          "The one who comes chasing the tides all the way from the skies will naturally receive the sea's blessings. Under the glow of the bonfire lies the reflection of an unforgettable summer",
          "Outfit Reward",
          "Summer Waves Roll In (I)",
          "Current Revenue",
          "0/360,000",
          "Event Demo",
          "Event Details",
        ].join("\n");
        const parsed = ocr.parseExtracurricularScreenshotText(text);
        assert.equal(parsed.timeRemaining, "37d", "timer");
        assert.ok(/summer waves roll in/i.test(parsed.label), "title: " + parsed.label);
        assert.ok(parsed.description.length > 20, "description extracted");
        assert.equal(parsed.gameHint, "zzz", "zzz hint from Ridu Chronicles");
      })
    );

    checks.push(
      check("Parse: OCR-garbled timers still resolve to days", () => {
        assert.equal(ocr.extractEventTimeRemainingFromOcr("Summer Waves\n37cl\nEvent Details"), "37d", "37cl→37d");
        assert.equal(ocr.extractEventTimeRemainingFromOcr("title\n37 dl\nmore"), "37d", "37 dl→37d");
        assert.equal(ocr.extractEventTimeRemainingFromOcr("Ends in 37 days\nfoo"), "37d", "Ends in 37 days");
        assert.equal(ocr.extractEventTimeRemainingFromOcr("badge\n37\nOutfit Reward"), "37d", "bare 37 line");
        assert.equal(ocr.extractEventTimeRemainingFromOcr("6d 7hr left"), "6d 7hr", "days+hours");
      })
    );

    checks.push(
      check("Parse: skip-description is a UI concern; parser still returns description text", () => {
        const parsed = ocr.parseExtracurricularScreenshotText(
          "Memory of Chaos Special\n14d\nA longer flavor line that should be treated as description text for the event banner."
        );
        assert.equal(parsed.timeRemaining, "14d", "14d");
        assert.ok(parsed.description, "description available for optional fill");
      })
    );

    const failed = checks.filter((c) => !c.ok);
    return { ok: failed.length === 0, checks, title: "Extracurricular screenshot OCR parse" };
  },
};
