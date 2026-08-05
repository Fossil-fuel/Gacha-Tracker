/**
 * Rebuild presets/*.json from a full-app backup export.
 * Usage: node scripts/update-presets-from-backup.js [backupPath]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PRESETS_DIR = path.join(ROOT, "presets");
const TODAY = "2026-08-04";

const backupPath =
  process.argv[2] ||
  "e:/Gacha Tracker Back-ups/gacha-tracker-backup-preset.json";

const NAME_TO_PRESET = {
  "honkai star rail": "hsr",
  "zenless zone zero": "zzz",
  "honkai impact 3rd": "hi3",
  "wuthering waves": "ww",
  "arknights: endfield": "akendfield",
  "punishing grey ravens": "pgr",
  "punishing grey raven": "pgr",
};

const PRESET_DISPLAY_NAMES = {
  hsr: "Honkai Star Rail",
  zzz: "Zenless Zone Zero",
  hi3: "Honkai Impact 3rd",
  ww: "Wuthering Waves",
  akendfield: "Arknights: Endfield",
  pgr: "Punishing Grey Raven",
};

const PRESET_ICON_STOCK_IDS = {
  hsr: "pfp-hsr-official",
  zzz: "pfp-zzz-official",
  hi3: "pfp-hi3rd-official",
  ww: "pfp-wuwa-official",
  akendfield: "pfp-endfield-official",
  pgr: "pfp-pgr-official",
};

const LABEL_ID_OVERRIDES = {
  "curwar / divuni": "curwar_divuni",
  "hollow zero": "hollow_zero",
  "hallow zero": "hollow_zero",
  "endstate matrix": "endstate_matrix",
  missions: "missions",
  "operation guardians": "operation_guardians",
  warzone: "warzone",
  "pain cage": "pain_cage",
};

function loadBackupGames(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const payload = typeof raw["gacha-tracker"] === "string"
    ? JSON.parse(raw["gacha-tracker"])
    : (raw["gacha-tracker"] || raw);
  if (!Array.isArray(payload.games)) {
    throw new Error("Backup has no games[]");
  }
  return payload.games;
}

function slugify(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48) || "task";
}

function resolveTaskId(task) {
  const label = String(task.label || "").trim();
  const lower = label.toLowerCase();
  if (LABEL_ID_OVERRIDES[lower]) return LABEL_ID_OVERRIDES[lower];
  const id = String(task.id || "");
  if (id && !/^([we]_\d+|g_)/.test(id)) return id;
  return slugify(label);
}

function isTaskActive(task) {
  if (!task) return false;
  if (task.cycleEndEnabled && task.cycleEndDate && String(task.cycleEndDate) < TODAY) {
    return false;
  }
  return true;
}

function cleanTask(task) {
  const out = {
    id: resolveTaskId(task),
    label: task.label === "Hallow Zero" ? "Hollow Zero" : task.label,
    weekStartDay: Number.isFinite(task.weekStartDay) ? task.weekStartDay : 0,
    weekStartHour: Number.isFinite(task.weekStartHour) ? task.weekStartHour : 4,
    weekStartMinute: Number.isFinite(task.weekStartMinute) ? task.weekStartMinute : 0,
    currency: Math.max(0, Number(task.currency) || 0),
    dateStarted: task.dateStarted || TODAY,
    frequencyEvery: Math.max(1, Number(task.frequencyEvery) || 1),
    frequencyUnit: task.frequencyUnit === "day" ? "day" : "week",
    timeLimitEvery: Math.max(1, Number(task.timeLimitEvery) || 1),
    timeLimitUnit: task.timeLimitUnit === "day" ? "day" : "week",
    adjustForDST: task.adjustForDST !== false,
  };

  if (task.countFromDateStarted) out.countFromDateStarted = true;
  if (Number(task.earliestCompleteDays) > 0) {
    out.earliestCompleteDays = Math.max(0, Number(task.earliestCompleteDays) || 0);
  } else if (Number.isFinite(task.earliestCompleteHour) || Number.isFinite(task.earliestCompleteMinute)) {
    // Keep unlock clock even when days = 0 (e.g. Elysian Realm 10:00)
    out.earliestCompleteDays = Math.max(0, Number(task.earliestCompleteDays) || 0);
  }
  if (Number.isFinite(task.earliestCompleteHour)) out.earliestCompleteHour = task.earliestCompleteHour;
  if (Number.isFinite(task.earliestCompleteMinute)) out.earliestCompleteMinute = task.earliestCompleteMinute;

  if (task.cycleEndTimeSameAsBegin === false) {
    out.cycleEndTimeSameAsBegin = false;
    if (Number.isFinite(task.cycleEndHour)) out.cycleEndHour = task.cycleEndHour;
    if (Number.isFinite(task.cycleEndMinute)) out.cycleEndMinute = task.cycleEndMinute;
  }

  if (task.manualReset) {
    out.manualReset = true;
    if (task.manualDueTbd || !task.manualDueDateStr) {
      out.manualDueTbd = true;
      out.manualDueDateStr = null;
    } else {
      out.manualDueTbd = false;
      out.manualDueDateStr = task.manualDueDateStr;
      if (Number.isFinite(task.manualDueHour)) out.manualDueHour = task.manualDueHour;
      if (Number.isFinite(task.manualDueMinute)) out.manualDueMinute = task.manualDueMinute;
    }
  }

  if (task.hideInData || task.excludeFromData) out.hideInData = true;

  // Preserve an active (not-yet-ended) stop-cycle marker only.
  if (task.cycleEndEnabled && task.cycleEndDate && String(task.cycleEndDate) >= TODAY) {
    out.cycleEndEnabled = true;
    out.cycleEndDate = task.cycleEndDate;
  }

  return out;
}

function resolvePresetId(game) {
  if (game.presetId && PRESET_DISPLAY_NAMES[game.presetId]) return game.presetId;
  const key = String(game.name || "").toLowerCase().trim();
  return NAME_TO_PRESET[key] || null;
}

function gameToPreset(game, presetId) {
  const weeklies = (game.weeklies || []).filter(isTaskActive).map(cleanTask);
  const endgame = (game.endgame || []).filter(isTaskActive).map(cleanTask);
  const preset = {
    id: presetId,
    name: PRESET_DISPLAY_NAMES[presetId] || game.name,
    server: game.server || "america",
    resetHour: Number.isFinite(game.resetHour) ? game.resetHour : 4,
    resetMinute: Number.isFinite(game.resetMinute) ? game.resetMinute : 0,
    dailies: game.dailies !== false,
    dailyCurrency: Math.max(0, Number(game.dailyCurrency) || 0),
    currencyPerPull: Math.max(0, Number(game.currencyPerPull) || 0),
    currencyName: game.currencyName || "Currency",
    weeklies,
    endgame,
  };
  if (PRESET_ICON_STOCK_IDS[presetId]) {
    preset.iconStockId = PRESET_ICON_STOCK_IDS[presetId];
  }
  if (preset.resetMinute === 0 && preset.resetHour !== 0) {
    // Keep compact like older presets when minute is default zero for non-midnight games.
    // PGR uses hour 0 — keep resetMinute for clarity.
  }
  if (presetId !== "pgr" && preset.resetMinute === 0) {
    delete preset.resetMinute;
  }
  return preset;
}

function main() {
  if (!fs.existsSync(backupPath)) {
    console.error("Backup not found:", backupPath);
    process.exit(1);
  }
  const games = loadBackupGames(backupPath);
  const byPreset = new Map();
  games.forEach((g) => {
    const id = resolvePresetId(g);
    if (!id) {
      console.warn("Skipping unmapped game:", g.name, g.presetId || "(no presetId)");
      return;
    }
    byPreset.set(id, g);
  });

  const indexPath = path.join(PRESETS_DIR, "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const ids = index.presets || [];

  ids.forEach((id) => {
    const game = byPreset.get(id);
    if (!game) {
      console.warn("No backup game for preset", id, "— left unchanged");
      return;
    }
    const preset = gameToPreset(game, id);
    const outPath = path.join(PRESETS_DIR, id + ".json");
    fs.writeFileSync(outPath, JSON.stringify(preset, null, 2) + "\n");
    console.log(
      "Wrote",
      id + ".json",
      "| W",
      preset.weeklies.length,
      "E",
      preset.endgame.length
    );
  });

  index.version = Math.max(3, Number(index.version) || 0);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
  console.log("Updated presets/index.json version →", index.version);
}

main();
