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
  "rewards preview",
  "trial resonators",
  "ridu chronicles",
];
const OCR_BADGE_WORDS = {
  featured: 1, combat: 1, story: 1, casual: 1, event: 1, details: 1,
  challenge: 1, rewards: 1, preview: 1, remaining: 1, trial: 1, resonators: 1,
  resonator: 1, available: 1, limited: 1, login: 1, outfit: 1, demo: 1,
  phase: 1, revenue: 1, current: 1
};
const OCR_TITLE_STOP = { the: 1, a: 1, an: 1, of: 1, and: 1, will: 1, be: 1, to: 1, for: 1, in: 1, on: 1, with: 1 };

function normalizeOcrForTimers(text) {
  let s = String(text || "");
  s = s.replace(/(\d)[ \t]*[OoQ](?=[ \t]*\d|[ \t]*[dD](?:ays?\b)?|[ \t]*$)/gm, "$10");
  s = s.replace(/(\d)[ \t]*[Il|!](?=[ \t]*[dD](?:ays?\b)?|[ \t]*$)/gm, "$11");
  s = s.replace(/\b(\d{1,3})[ \t]*(?:cl|dl|al|ol|ci|di)\b/gi, "$1d");
  s = s.replace(/\b(\d{1,3})[ \t]*[·•.\-_]?[ \t]*[dD]\b/g, "$1d");
  return s;
}

function tidyOcrLine(line) {
  let s = String(line || "").replace(/\s+/g, " ").trim();
  s = s.replace(/[;|)(]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\bofthe\b/gi, "of the");
  s = s.replace(/\bwillbe\b/gi, "will be");
  s = s.replace(/([A-Za-z])\.(?=[A-Za-z])/g, "$1");
  s = s.replace(/([a-z])i([A-Z])/g, "$1 $2");
  s = s.replace(/^[\s|©®•·\-—~=\\/@#$%^&*()]+/, "");
  s = s.replace(/[\s|©®•·\-—~=]+$/g, "");
  return s.trim();
}

function ocrLineWords(line) {
  return tidyOcrLine(line).toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
}

function isOcrBadgeLine(line) {
  const low = tidyOcrLine(line).toLowerCase();
  if (!low) return false;
  if (OCR_UI_NOISE.some((n) => low === n || low.includes(n))) return true;
  const words = ocrLineWords(line).filter((w) => !OCR_TITLE_STOP[w] && w.length >= 3);
  if (!words.length) return false;
  const badges = words.filter((w) => OCR_BADGE_WORDS[w]);
  return badges.length / words.length >= 0.5;
}

function isOcrTimerLine(line) {
  const low = tidyOcrLine(line).toLowerCase();
  if (!low) return false;
  if (/\b(remaining|left|ends?\s+in)\b/.test(low)) return true;
  return /^\d{1,3}\s*d(?:ays?)?(?:\s+\d{1,2}\s*h(?:rs?|ours?)?)?(?:\s+\d{1,2}\s*m(?:in(?:ute)?s?)?)?$/.test(low);
}

function isOcrTitleContinuation(line) {
  if (isOcrBadgeLine(line) || isOcrTimerLine(line)) return false;
  const words = tidyOcrLine(line).split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 2) return false;
  return words.every((word) => word.length >= 3 && /^[A-Z0-9][A-Za-z0-9'’&-]*$/.test(word));
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
    const fuller = (h ? 6 : 0) + (m ? 3 : 0);
    candidates.push({ out, days: d, score: score + fuller + (d >= 7 && d <= 60 ? 2 : 0) });
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
    const reEnds = /(?:ends?\s+in|remaining|left)\s*:?\s*(\d{1,3})\s*d(?:ays?)?(?:\s*(\d{1,2})\s*(?:h|hr|hrs|hours?))?(?:\s*(\d{1,2})\s*(?:m|min|mins|minutes?))?/gi;
    while ((m = reEnds.exec(chunk)) !== null) {
      push(m[1], m[2], m[3], 12 + lineBonus);
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
    const cleaned = tidyOcrLine(line);
    if (!cleaned) return true;
    if (isOcrBadgeLine(cleaned) || isOcrTimerLine(cleaned)) return true;
    if (/^\d+([./,]\d+)*$/.test(cleaned)) return true;
    if (/^\d+\s*\/\s*[\d,]+$/.test(cleaned)) return true;
    if (!/[A-Za-z]/.test(cleaned)) return true;
    if (cleaned.length < 4) return true;
    return false;
  };

  const titleCandidates = lines
    .map((line, idx) => {
      let cleaned = tidyOcrLine(line).replace(/\s*\(([ivx]+)\)\s*$/i, "").trim();
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
        const pipes = /[|©®]/.test(c.line) ? 6 : 0;
        const junk = /[^A-Za-z0-9'’&,.\-\s]/.test(c.line) ? 10 : 0;
        return early * 2 + Math.min(words, 6) + mixed - pipes - junk;
      };
      return score(b) - score(a);
    });
    const chosen = titleCandidates[0];
    label = chosen.line;
    const next = lines[chosen.idx + 1] ? tidyOcrLine(lines[chosen.idx + 1]) : "";
    if (next && isOcrTitleContinuation(next)) label = tidyOcrLine(label + " " + next);
    const prev = chosen.idx > 0 ? tidyOcrLine(lines[chosen.idx - 1]) : "";
    if (prev && isOcrTitleContinuation(label) && !isOcrBadgeLine(prev) && !isOcrTimerLine(prev) && prev.length > label.length) {
      label = tidyOcrLine(prev + " " + label);
    }
  }

  const descLines = lines.filter((line) => {
    if (isNoise(line)) return false;
    if (label && line.toLowerCase().includes(label.toLowerCase().slice(0, Math.min(12, label.length)))) return false;
    return line.length >= 60 && /[a-z]/i.test(line);
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
