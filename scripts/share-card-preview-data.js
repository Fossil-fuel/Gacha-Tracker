"use strict";

const fs = require("fs");
const path = require("path");

const backupPath =
  process.argv[2] ||
  "e:/Gacha Tracker Back-ups/gacha-tracker-backup-2026-08-04 (1).json";

const raw = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const inner =
  typeof raw["gacha-tracker"] === "string"
    ? JSON.parse(raw["gacha-tracker"])
    : raw["gacha-tracker"] || raw;

const games = inner.games || [];
const hsr = games.find(
  (g) => /star rail/i.test(g.name || "") || g.presetId === "hsr"
);
if (!hsr) {
  console.error("No HSR game found. Games:", games.map((g) => g.name));
  process.exit(1);
}

function classifyImage(src) {
  const s = String(src || "");
  if (!s) return { has: false, kind: "none" };
  if (s.startsWith("userimg:")) return { has: true, kind: "userimg", ref: s };
  if (/^assets\//i.test(s)) return { has: true, kind: "stock", path: s };
  if (s.startsWith("data:")) return { has: true, kind: "data", bytesApprox: Math.round(s.length * 0.75) };
  return { has: true, kind: "other", preview: s.slice(0, 60) };
}

function summarizeTask(t) {
  const src =
    t.bannerSourceImage || t.bannerImage || t.bannerHomeImage || t.bannerGamesImage || null;
  return {
    id: t.id || t.label,
    label: t.label,
    banner: classifyImage(src),
  };
}

const weeklies = (hsr.weeklies || []).map(summarizeTask);
const endgame = (hsr.endgame || []).map(summarizeTask);

const out = {
  backup: path.basename(backupPath),
  name: hsr.name,
  id: hsr.id,
  presetId: hsr.presetId,
  subtitle: hsr.subtitle || null,
  icon: classifyImage(hsr.iconImage),
  iconShape: hsr.iconShape || null,
  currencyName: hsr.currencyName || "Currency",
  dailyCurrency: hsr.dailyCurrency,
  currencyPerPull: hsr.currencyPerPull,
  dailiesOn: hsr.dailies !== false,
  weeklies,
  endgame,
  tallies: {
    dailies: {
      done: (inner.dailiesCompleted || {})[hsr.id] || 0,
      attempted: (inner.dailiesAttempted || {})[hsr.id] || 0,
    },
    weeklies: {},
    endgame: {},
  },
};

function rate(done, att) {
  const possible = Math.max(0, Number(att) || 0);
  const d = Math.max(0, Number(done) || 0);
  const pct = possible > 0 ? Math.round((Math.min(d, possible) / possible) * 100) : null;
  return { done: d, possible, pct };
}

out.tallies.dailies = rate(out.tallies.dailies.done, out.tallies.dailies.attempted);

(hsr.weeklies || []).forEach((t) => {
  const key = hsr.id + "." + (t.id || t.label);
  out.tallies.weeklies[t.label || key] = rate(
    (inner.weekliesCompleted || {})[key],
    (inner.weekliesAttempted || {})[key]
  );
});
(hsr.endgame || []).forEach((t) => {
  const key = hsr.id + "." + (t.id || t.label);
  out.tallies.endgame[t.label || key] = rate(
    (inner.endgameCompleted || {})[key],
    (inner.endgameAttempted || {})[key]
  );
});

let earned = 0;
let potential = 0;
Object.keys(inner.endgameCurrencyEarned || {}).forEach((k) => {
  if (!k.startsWith(hsr.id + ".")) return;
  const v = inner.endgameCurrencyEarned[k];
  if (Array.isArray(v)) earned += v.reduce((a, b) => a + (Number(b) || 0), 0);
  else earned += Number(v) || 0;
});
Object.keys(inner.endgameCurrencyPotential || {}).forEach((k) => {
  if (!k.startsWith(hsr.id + ".")) return;
  const v = inner.endgameCurrencyPotential[k];
  if (Array.isArray(v)) potential += v.reduce((a, b) => a + (Number(b) || 0), 0);
  else potential += Number(v) || 0;
});
// rough daily currency = done * dailyCurrency
const dailyEarn = out.tallies.dailies.done * (Number(hsr.dailyCurrency) || 0);
out.currencyApprox = {
  endgameEarned: Math.round(earned),
  endgamePotential: Math.round(potential),
  dailyEarnedApprox: Math.round(dailyEarn),
  note: "Share card uses getGameCurrencyTotals; this is approximate from backup fields",
};

// Finish day hist from timestamps in last 90 days
const end = new Date("2026-08-04T12:00:00");
const start = new Date(end);
start.setDate(start.getDate() - 89);
const startStr = start.toISOString().slice(0, 10);
const endStr = end.toISOString().slice(0, 10);
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const counts = [0, 0, 0, 0, 0, 0, 0];
(inner.completionTimestamps || []).forEach((t) => {
  if (!t || t.gameId !== hsr.id) return;
  if (!t.dateStr || t.dateStr < startStr || t.dateStr > endStr) return;
  const d = new Date(t.dateStr + "T12:00:00").getDay(); // 0 Sun
  const idx = d === 0 ? 6 : d - 1;
  counts[idx]++;
});
out.finishWindow = { startStr, endStr, days, counts };
out.hasAnyTaskBanner = weeklies.concat(endgame).some((t) => t.banner.has);
out.layoutHints = {
  richHeroPossible: out.hasAnyTaskBanner,
  iconHeaderPossible: out.icon.has,
  mediaStripCount: weeklies.concat(endgame).filter((t) => t.banner.has).length,
};

console.log(JSON.stringify(out, null, 2));
