"use strict";

/**
 * Mirrors timer/OCR parse helpers in src/08b-page-extracurricular.js for unit tests.
 */
const OCR_UI_NOISE = [
  "event demo",
  "event details",
  "outfit reward",
  "current revenue",
  "current phase",
  "time remaining",
  "ridu chronicles",
];

function normalizeOcrForTimers(text) {
  let s = String(text || "");
  s = s.replace(/(\d)[ \t]*[OoQ](?=[ \t]*\d|[ \t]*[dD](?:ays?\b)?|[ \t]*$)/gm, "$10");
  s = s.replace(/(\d)[ \t]*[Il|!](?=[ \t]*[dD](?:ays?\b)?|[ \t]*$)/gm, "$11");
  s = s.replace(/\b(\d{1,3})[ \t]*(?:cl|dl|al|ol|ci|di)\b/gi, "$1d");
  s = s.replace(/\b(\d{1,3})[ \t]*[·•.\-_]?[ \t]*[dD]\b/g, "$1d");
  return s;
}

function extractEventTimeRemainingFromOcr(text) {
  const normalized = normalizeOcrForTimers(text);
  const lines = normalized
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const haystacks = [normalized.replace(/\s+/g, " "), ...lines];

  const candidates = [];
  const push = (days, hours, mins, score) => {
    const d = Number(days);
    if (!Number.isFinite(d) || d < 1 || d > 120) return;
    const h = hours != null && hours !== "" ? Number(hours) : null;
    const m = mins != null && mins !== "" ? Number(mins) : null;
    if (h != null && (!Number.isFinite(h) || h > 23)) return;
    if (m != null && (!Number.isFinite(m) || m > 59)) return;
    let out = d + "d";
    if (h) out += " " + h + "hr";
    if (m) out += " " + m + "m";
    candidates.push({ out, days: d, score: score + (d >= 7 && d <= 60 ? 2 : 0) });
  };

  haystacks.forEach((chunk, idx) => {
    const lineBonus = idx > 0 && chunk.length <= 12 ? 3 : 0;
    let m;
    const reFull =
      /\b(\d{1,3})\s*d(?:ays?)?(?:\s*(\d{1,2})\s*(?:h|hr|hrs|hours?))?(?:\s*(\d{1,2})\s*(?:m|min|mins|minutes?))?\b/gi;
    while ((m = reFull.exec(chunk)) !== null) {
      push(m[1], m[2], m[3], 10 + lineBonus);
    }
    const reGlued = /\b(\d{1,3})d\b/gi;
    while ((m = reGlued.exec(chunk)) !== null) {
      push(m[1], null, null, 9 + lineBonus);
    }
    const reEnds = /(?:ends?\s+in|remaining|left)\s*:?\s*(\d{1,3})\s*d(?:ays?)?/gi;
    while ((m = reEnds.exec(chunk)) !== null) {
      push(m[1], null, null, 12 + lineBonus);
    }
    if (idx > 0 && /^(\d{1,3})$/.test(chunk)) {
      const n = Number(chunk);
      if (n >= 2 && n <= 90) push(n, null, null, 4);
    }
  });

  if (!candidates.length) return "";
  candidates.sort((a, b) => b.score - a.score || b.days - a.days);
  return candidates[0].out;
}

function parseExtracurricularScreenshotText(text) {
  const raw = String(text || "").replace(/\r/g, "\n");
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const joined = lines.join(" ");
  const timeRemaining = extractEventTimeRemainingFromOcr(raw);

  const isNoise = (line) => {
    const low = line.toLowerCase();
    if (OCR_UI_NOISE.some((n) => low === n || low.includes(n))) return true;
    if (/^\d+([./,]\d+)*$/.test(line)) return true;
    if (/^\d+\s*\/\s*[\d,]+$/.test(line)) return true;
    if (!/[A-Za-z]/.test(line)) return true;
    if (line.length < 4) return true;
    return false;
  };

  const titleCandidates = lines
    .map((line, idx) => {
      let cleaned = line.replace(/\s*\(([ivx]+)\)\s*$/i, "").trim();
      return { line: cleaned, idx };
    })
    .filter((c) => !isNoise(c.line) && c.line.length <= 80 && /[A-Za-z]{3,}/.test(c.line));

  let label = "";
  if (titleCandidates.length) {
    titleCandidates.sort((a, b) => {
      const score = (c) => {
        const words = c.line.split(/\s+/).length;
        const early = Math.max(0, 12 - c.idx);
        const mixed = /[a-z]/.test(c.line) && /[A-Z]/.test(c.line) ? 3 : 0;
        return early * 2 + Math.min(words, 6) + mixed;
      };
      return score(b) - score(a);
    });
    label = titleCandidates[0].line;
  }

  const descLines = lines.filter((line) => {
    if (isNoise(line)) return false;
    if (label && line.toLowerCase().includes(label.toLowerCase().slice(0, Math.min(12, label.length)))) return false;
    return line.length >= 40 && /[a-z]/i.test(line);
  });
  const description = descLines.slice(0, 3).join(" ").trim();

  let gameHint = "";
  const lowAll = joined.toLowerCase();
  if (/\bzzz\b|zenless|ridu chronicles|hollow zero|new eridu/.test(lowAll)) gameHint = "zzz";
  else if (/\bhsr\b|honkai star rail|trailblaze|divergent universe/.test(lowAll)) gameHint = "hsr";

  return { label, timeRemaining, description, gameHint };
}

module.exports = {
  parseExtracurricularScreenshotText,
  extractEventTimeRemainingFromOcr,
  normalizeOcrForTimers,
};
