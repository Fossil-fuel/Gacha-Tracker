"use strict";

const fs = require("fs");
const path = require("path");

const backupPath =
  process.argv[2] ||
  "e:/Gacha Tracker Back-ups/gacha-tracker-backup-2026-08-04 (1).json";
const outDir = path.join(__dirname, "share-preview-hsr");
fs.mkdirSync(outDir, { recursive: true });

const raw = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const state =
  typeof raw["gacha-tracker"] === "string"
    ? JSON.parse(raw["gacha-tracker"])
    : raw["gacha-tracker"] || raw;

const game = (state.games || []).find(
  (g) => /star rail/i.test(g.name || "") || g.presetId === "hsr"
);
if (!game) {
  console.error("HSR not found");
  process.exit(1);
}

function firstBanner(t) {
  return (
    t.bannerSourceImage ||
    t.bannerImage ||
    t.bannerHomeImage ||
    t.bannerGamesImage ||
    null
  );
}

function saveDataUrl(dataUrl, fileBase) {
  if (!dataUrl || !String(dataUrl).startsWith("data:")) return null;
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const ext = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : mime.includes("gif")
        ? "gif"
        : "jpg";
  const file = fileBase + "." + ext;
  fs.writeFileSync(path.join(outDir, file), Buffer.from(m[2], "base64"));
  return file;
}

function rate(done, att) {
  const possible = Math.max(0, Number(att) || 0);
  const d = Math.max(0, Math.min(possible, Number(done) || 0));
  const pct = possible > 0 ? Math.round((d / possible) * 100) : null;
  return { done: d || Number(done) || 0, possible, pct };
}

const iconFile = saveDataUrl(game.iconImage, "icon");

const weeklies = (game.weeklies || []).map((t, i) => {
  const key = game.id + "." + (t.id || t.label);
  const bannerSrc = firstBanner(t);
  const bannerFile = saveDataUrl(bannerSrc, "weekly_" + i);
  return {
    label: t.label || t.id,
    ...rate(
      (state.weekliesCompleted || {})[key],
      (state.weekliesAttempted || {})[key]
    ),
    bannerFile,
    currency: Number(t.currency) || 0,
  };
}).filter((t) => t.possible > 0 || t.done > 0);

const endgame = (game.endgame || []).map((t, i) => {
  const key = game.id + "." + (t.id || t.label);
  const bannerSrc = firstBanner(t);
  const bannerFile = saveDataUrl(bannerSrc, "endgame_" + i);
  return {
    label: t.label || t.id,
    id: t.id || t.label,
    ...rate(
      (state.endgameCompleted || {})[key],
      (state.endgameAttempted || {})[key]
    ),
    bannerFile,
    currency: Number(t.currency) || 0,
  };
}).filter((t) => t.possible > 0 || t.done > 0);

const dailies = rate(
  (state.dailiesCompleted || {})[game.id],
  (state.dailiesAttempted || {})[game.id]
);

// Currency totals matching app getGameCurrencyTotals (simplified)
let earned = 0;
let potential = 0;
if (game.dailies !== false) {
  const pot = Number(game.dailyCurrency) || 0;
  earned += dailies.done * pot;
  potential += dailies.possible * pot;
}
weeklies.forEach((t) => {
  earned += t.done * t.currency;
  potential += t.possible * t.currency;
});
endgame.forEach((t) => {
  const c = t.done;
  const a = t.possible;
  const pot = t.currency;
  const earnedArr =
    (state.endgameCurrencyEarned &&
      state.endgameCurrencyEarned[game.id] &&
      state.endgameCurrencyEarned[game.id][t.id]) ||
    [];
  const potArr =
    (state.endgameCurrencyPotential &&
      state.endgameCurrencyPotential[game.id] &&
      state.endgameCurrencyPotential[game.id][t.id]) ||
    [];
  if (earnedArr.length) {
    earned += earnedArr.slice(0, c).reduce((s, n) => s + (Number(n) || 0), 0);
  } else {
    earned += c * pot;
  }
  if (potArr.length) {
    potential += potArr.slice(0, a).reduce((s, n) => s + (Number(n) || 0), 0);
  } else {
    potential += a * pot;
  }
});

const end = new Date("2026-08-04T12:00:00");
const start = new Date(end);
start.setDate(start.getDate() - 89);
const startStr = start.toISOString().slice(0, 10);
const endStr = "2026-08-04";
const finishNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const finishCounts = [0, 0, 0, 0, 0, 0, 0];
(state.completionTimestamps || []).forEach((t) => {
  if (!t || t.gameId !== game.id) return;
  if (!t.dateStr || t.dateStr < startStr || t.dateStr > endStr) return;
  const d = new Date(t.dateStr + "T12:00:00").getDay();
  const idx = d === 0 ? 6 : d - 1;
  finishCounts[idx]++;
});
const maxFinish = Math.max(1, ...finishCounts);
const peakIdx = finishCounts.indexOf(Math.max(...finishCounts));

const banners = []
  .concat(weeklies, endgame)
  .filter((t) => t.bannerFile)
  .map((t) => ({ label: t.label, file: t.bannerFile }));

const heroFile = banners[0] ? banners[0].file : null;

function fmt(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function rateText(r, unit) {
  if (!r || r.possible <= 0 || r.pct == null) return "—";
  return r.pct + "% · " + r.done + "/" + r.possible + (unit ? " " + unit : "");
}

const model = {
  title: game.name,
  subtitle: (game.subtitle || "HoYoverse") + " · Last 90 days · " + startStr + " – " + endStr,
  iconFile,
  iconShape: game.iconShape || "rounded",
  heroFile,
  banners,
  dailies,
  weeklies,
  endgame,
  summary: {
    dailies,
    weeklies: rate(
      weeklies.reduce((s, t) => s + t.done, 0),
      weeklies.reduce((s, t) => s + t.possible, 0)
    ),
    endgame: rate(
      endgame.reduce((s, t) => s + t.done, 0),
      endgame.reduce((s, t) => s + t.possible, 0)
    ),
  },
  currencyName: game.currencyName || "Stellar Jade",
  earned: Math.round(earned),
  potential: Math.round(potential),
  finishNames,
  finishCounts,
  peak: finishNames[peakIdx] + " (" + finishCounts[peakIdx] + ")",
  hasIcon: !!iconFile,
  hasHero: !!heroFile,
  hasStrip: banners.length > 0,
};

fs.writeFileSync(path.join(outDir, "model.json"), JSON.stringify(model, null, 2));

function bar(pct, color) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="bar"><i style="width:${w}%;background:${color}"></i></div>`;
}

function taskRows(list, color, unit, withThumb) {
  return list
    .map((t) => {
      const thumb =
        withThumb && t.bannerFile
          ? `<img class="thumb" src="${t.bannerFile}" alt="" />`
          : withThumb
            ? ""
            : "";
      return `<div class="task ${t.bannerFile || !withThumb ? "" : "no-art"}">${thumb}<div class="task-body"><div class="task-top"><span>${escapeHtml(
        t.label
      )}</span><span class="muted">${rateText(t, unit)}</span></div>${bar(
        t.pct,
        color
      )}</div></div>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function finishChart() {
  return `<div class="finish">${finishNames
    .map((n, i) => {
      const h = Math.max(8, Math.round((finishCounts[i] / maxFinish) * 70));
      return `<div class="fin"><div class="fin-bar" style="height:${h}px"></div><span>${n}</span></div>`;
    })
    .join("")}</div>`;
}

function miniSummary() {
  const cats = [
    ["Dailies", model.summary.dailies, "#87ceeb"],
    ["Weeklies", model.summary.weeklies, "#20b2aa"],
    ["Endgame", model.summary.endgame, "#50c878"],
  ];
  return `<div class="mini">${cats
    .map(
      ([label, r, c]) =>
        `<div class="chip" style="border-top:3px solid ${c}"><div class="muted">${label}</div><div class="big" style="color:${c}">${
          r.pct != null ? r.pct + "%" : "—"
        }</div><div class="muted small">${r.possible ? r.done + "/" + r.possible : "No data"}</div></div>`
    )
    .join("")}</div>`;
}

function currency() {
  return `<div class="currency"><div class="muted">${escapeHtml(
    model.currencyName
  )} earned</div><div class="cur-nums"><strong>${fmt(model.earned)}</strong><span class="muted"> / </span><em>${fmt(
    model.potential
  )}</em></div></div>`;
}

const css = `
  :root { --bg:#0c0a12; --elev:#16121f; --panel:#13101c; --text:#f5f2fa; --muted:#a8a0b8; --border:#2e2740; --accent:#2dd4bf; }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,"Segoe UI",Roboto,Arial,sans-serif;background:#1a1a1a;color:var(--text);padding:24px}
  h1{font-size:1.1rem;margin:0 0 8px;color:#fff}
  .hint{color:#aaa;margin:0 0 20px;font-size:.9rem;max-width:880px;line-height:1.4}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px}
  .card{background:linear-gradient(160deg,var(--bg),var(--elev) 55%,var(--bg));border:1px solid var(--border);border-radius:18px;overflow:hidden;width:100%;max-width:420px;box-shadow:0 16px 40px rgba(0,0,0,.35)}
  .pad{padding:18px}
  .brand{font-size:11px;letter-spacing:.08em;font-weight:700;color:var(--muted)}
  .title{font-size:26px;font-weight:800;margin:8px 0 4px;line-height:1.15}
  .sub{font-size:12px;color:var(--muted);margin-bottom:12px}
  .hero{width:100%;height:150px;object-fit:cover;display:block;background:#000}
  .hero-wrap{position:relative}
  .hero-fade{position:absolute;inset:auto 0 0 0;height:70px;background:linear-gradient(transparent,var(--bg))}
  .head{display:flex;gap:12px;align-items:center}
  .icon{width:56px;height:56px;object-fit:cover;border-radius:14px;border:1px solid var(--border);background:var(--panel);flex-shrink:0}
  .icon.circle{border-radius:50%}
  .icon.letter{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;color:var(--accent)}
  .mini{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0}
  .chip{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:8px}
  .big{font-size:22px;font-weight:800}
  .muted{color:var(--muted)} .small{font-size:10px}
  .sec{margin-top:12px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:10px;border-top:3px solid var(--c, #aaa)}
  .sec h3{margin:0 0 8px;font-size:11px;letter-spacing:.06em;color:var(--c,#aaa)}
  .task{display:flex;gap:8px;margin-bottom:8px}
  .thumb{width:36px;height:36px;border-radius:8px;object-fit:cover;flex-shrink:0}
  .task-body{flex:1;min-width:0}
  .task-top{display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:600;margin-bottom:4px}
  .bar{height:7px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden}
  .bar i{display:block;height:100%;border-radius:99px}
  .currency{margin-top:12px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:12px}
  .cur-nums{font-size:20px;margin-top:4px} .cur-nums em{color:var(--accent);font-style:normal;font-weight:800}
  .finish{display:flex;align-items:flex-end;gap:6px;height:96px;margin-top:8px;padding:8px;background:var(--panel);border:1px solid var(--border);border-radius:12px}
  .fin{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%}
  .fin-bar{width:100%;max-width:28px;background:var(--accent);border-radius:4px 4px 0 0}
  .fin span{font-size:9px;color:var(--muted);font-weight:700}
  .strip{display:flex;gap:6px;overflow:hidden;margin:8px 0 4px}
  .strip img{width:64px;height:40px;object-fit:cover;border-radius:8px;border:1px solid var(--border)}
  .tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--accent);border:1px solid var(--accent);border-radius:999px;padding:3px 8px;margin-bottom:8px}
  .split{display:grid;grid-template-columns:88px 1fr;gap:12px}
  .poster-title{font-size:34px;font-weight:900;letter-spacing:-.02em;position:relative;z-index:1}
  .wm{position:absolute;right:8px;top:40px;width:120px;height:120px;opacity:.12;object-fit:cover;border-radius:24px;pointer-events:none}
  .poster-wrap{position:relative;overflow:hidden}
  .poster-blocks{display:grid;gap:8px;margin:12px 0}
  .poster-blocks div{padding:10px 12px;border-radius:12px;background:var(--panel);border:1px solid var(--border)}
  .poster-blocks strong{font-size:28px;display:block}
  .fallback-note{margin-top:8px;font-size:11px;color:#fbbf24;background:rgba(251,191,36,.08);border:1px dashed rgba(251,191,36,.35);padding:8px;border-radius:8px}
  .foot{text-align:center;color:var(--muted);font-size:11px;padding:10px 0 14px}
`;

function draft1() {
  // Hero + Icon
  const hero = model.hasHero
    ? `<div class="hero-wrap"><img class="hero" src="${model.heroFile}" alt=""/><div class="hero-fade"></div></div>`
    : "";
  const icon = model.hasIcon
    ? `<img class="icon ${model.iconShape === "circle" ? "circle" : ""}" src="${model.iconFile}" alt=""/>`
    : `<div class="icon letter">H</div>`;
  return `<article class="card">
    <div class="pad"><span class="tag">DRAFT 1 · Hero + Icon</span><div class="brand">GACHA TRACKER</div></div>
    ${hero}
    <div class="pad" style="padding-top:${model.hasHero ? "4px" : "18px"}">
      <div class="head">${icon}<div><div class="title">${escapeHtml(model.title)}</div><div class="sub">${escapeHtml(model.subtitle)}</div></div></div>
      ${!model.hasHero ? `<div class="fallback-note">No usable task banner → hero omitted (no empty band).</div>` : ""}
      ${miniSummary()}
      <div class="sec" style="--c:#20b2aa"><h3>WEEKLIES</h3>${taskRows(model.weeklies, "#20b2aa", "", false)}</div>
      <div class="sec" style="--c:#50c878"><h3>ENDGAME</h3>${taskRows(model.endgame, "#50c878", "", false)}</div>
      ${finishChart()}
      <div class="muted small" style="margin-top:6px">Peak: ${escapeHtml(model.peak)}</div>
      ${currency()}
    </div>
    <div class="foot">Share card · not a backup</div>
  </article>`;
}

function draft2() {
  const icon = model.hasIcon
    ? `<img class="icon" src="${model.iconFile}" alt=""/>`
    : `<div class="icon letter">H</div>`;
  return `<article class="card">
    <div class="pad">
      <span class="tag">DRAFT 2 · Icon header</span>
      <div class="brand">GACHA TRACKER</div>
      <div class="head" style="margin-top:10px">${icon}<div><div class="title">${escapeHtml(model.title)}</div><div class="sub">${escapeHtml(model.subtitle)}</div></div></div>
      <div class="fallback-note">Never uses banners. Missing icon → letter avatar (shown style relies on your saved icon).</div>
      ${miniSummary()}
      <div class="sec" style="--c:#20b2aa"><h3>WEEKLIES</h3>${taskRows(model.weeklies, "#20b2aa", "", false)}</div>
      <div class="sec" style="--c:#50c878"><h3>ENDGAME</h3>${taskRows(model.endgame, "#50c878", "", false)}</div>
      ${finishChart()}
      ${currency()}
    </div>
    <div class="foot">Share card · not a backup</div>
  </article>`;
}

function draft3() {
  const strip = model.hasStrip
    ? `<div class="strip">${model.banners
        .map((b) => `<img src="${b.file}" alt="${escapeHtml(b.label)}" title="${escapeHtml(b.label)}" />`)
        .join("")}</div>`
    : `<div class="fallback-note">No task banners → thumbnail strip removed entirely.</div>`;
  const icon = model.hasIcon
    ? `<img class="icon" src="${model.iconFile}" alt=""/>`
    : `<div class="icon letter">H</div>`;
  return `<article class="card">
    <div class="pad">
      <span class="tag">DRAFT 3 · Media strip</span>
      <div class="brand">GACHA TRACKER</div>
      <div class="head" style="margin-top:10px">${icon}<div><div class="title">${escapeHtml(model.title)}</div><div class="sub">${escapeHtml(model.subtitle)}</div></div></div>
      ${strip}
      ${miniSummary()}
      <div class="sec" style="--c:#20b2aa"><h3>WEEKLIES</h3>${taskRows(model.weeklies, "#20b2aa", "", true)}</div>
      <div class="sec" style="--c:#50c878"><h3>ENDGAME</h3>${taskRows(model.endgame, "#50c878", "", true)}</div>
      ${finishChart()}
      ${currency()}
    </div>
    <div class="foot">Share card · not a backup</div>
  </article>`;
}

function draft4() {
  const left = model.hasIcon
    ? `<div><img class="icon" style="width:72px;height:72px" src="${model.iconFile}" alt=""/><div class="muted small" style="margin-top:8px">${escapeHtml(
        model.title
      )}</div></div>`
    : null;
  if (left) {
    return `<article class="card"><div class="pad">
      <span class="tag">DRAFT 4 · Adaptive split</span>
      <div class="brand">GACHA TRACKER</div>
      <div class="sub">${escapeHtml(model.subtitle)}</div>
      <div class="split">${left}<div>${miniSummary()}
        <div class="sec" style="--c:#20b2aa"><h3>WEEKLIES</h3>${taskRows(model.weeklies, "#20b2aa", "", false)}</div>
        <div class="sec" style="--c:#50c878"><h3>ENDGAME</h3>${taskRows(model.endgame, "#50c878", "", false)}</div>
        ${currency()}
      </div></div>
      ${finishChart()}
    </div><div class="foot">Share card · not a backup</div></article>`;
  }
  return `<article class="card"><div class="pad">
    <span class="tag">DRAFT 4 · Adaptive split (no-icon fallback)</span>
    <div class="title">${escapeHtml(model.title)}</div>
    <div class="sub">${escapeHtml(model.subtitle)}</div>
    <div class="fallback-note">No icon → full-width text layout (no empty left column).</div>
    ${miniSummary()}
    <div class="sec" style="--c:#20b2aa"><h3>WEEKLIES</h3>${taskRows(model.weeklies, "#20b2aa", "", false)}</div>
    ${currency()}
  </div><div class="foot">Share card · not a backup</div></article>`;
}

function draft5() {
  const wm = model.hasIcon
    ? `<img class="wm" src="${model.iconFile}" alt=""/>`
    : "";
  return `<article class="card"><div class="pad poster-wrap">
    <span class="tag">DRAFT 5 · Text-first poster</span>
    <div class="brand">GACHA TRACKER</div>
    ${wm}
    <div class="poster-title">${escapeHtml(model.title)}</div>
    <div class="sub">${escapeHtml(model.subtitle)}</div>
    ${!model.hasIcon ? `<div class="fallback-note">No icon → watermark omitted.</div>` : ""}
    <div class="poster-blocks">
      <div><span class="muted">DAILIES</span><strong style="color:#87ceeb">${model.dailies.pct}%</strong><span class="muted small">${rateText(model.dailies, "days")}</span></div>
      <div><span class="muted">WEEKLIES</span><strong style="color:#20b2aa">${model.summary.weeklies.pct}%</strong><span class="muted small">${rateText(model.summary.weeklies, "")}</span></div>
      <div><span class="muted">ENDGAME</span><strong style="color:#50c878">${model.summary.endgame.pct}%</strong><span class="muted small">${rateText(model.summary.endgame, "")}</span></div>
    </div>
    ${finishChart()}
    ${currency()}
  </div><div class="foot">Share card · not a backup</div></article>`;
}

// Also a no-image fallback demo using same numbers
function draft1NoArt() {
  return `<article class="card">
    <div class="pad">
      <span class="tag">DRAFT 1 fallback · no banners/icon</span>
      <div class="brand">GACHA TRACKER</div>
      <div class="head" style="margin-top:10px"><div class="icon letter">H</div><div><div class="title">${escapeHtml(model.title)}</div><div class="sub">${escapeHtml(model.subtitle)}</div></div></div>
      <div class="fallback-note">Hero + icon assets missing → letter avatar, no blank banner strip.</div>
      ${miniSummary()}
      <div class="sec" style="--c:#20b2aa"><h3>WEEKLIES</h3>${taskRows(model.weeklies, "#20b2aa", "", false)}</div>
      <div class="sec" style="--c:#50c878"><h3>ENDGAME</h3>${taskRows(model.endgame, "#50c878", "", false)}</div>
      ${finishChart()}
      ${currency()}
    </div>
    <div class="foot">Share card · not a backup</div>
  </article>`;
}

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>HSR Share Card Drafts (real backup data)</title>
<style>${css}</style></head>
<body>
  <h1>Honkai Star Rail — share card drafts from your backup</h1>
  <p class="hint">
    Source: <code>${path.basename(backupPath)}</code> · Window: last 90 days (${startStr} → ${endStr}).
    Numbers use your stored Games tallies + finish-day timestamps. Images are your actual HSR icon / task banners.
    Banners present on: ${banners.map((b) => b.label).join(", ") || "(none)"}.
    Weeklies without art (Divergent Universe, Currency Wars if still listed) intentionally have no thumb gap in Draft 3 rows.
  </p>
  <div class="grid">
    ${draft1()}
    ${draft2()}
    ${draft3()}
    ${draft4()}
    ${draft5()}
    ${draft1NoArt()}
  </div>
</body></html>`;

const outHtml = path.join(outDir, "index.html");
fs.writeFileSync(outHtml, html);
console.log("Wrote", outHtml);
console.log(
  JSON.stringify(
    {
      iconFile,
      heroFile,
      bannerCount: banners.length,
      dailies,
      weeklies: weeklies.map((t) => ({ label: t.label, pct: t.pct, banner: !!t.bannerFile })),
      endgame: endgame.map((t) => ({ label: t.label, pct: t.pct, banner: !!t.bannerFile })),
      earned: model.earned,
      potential: model.potential,
      peak: model.peak,
    },
    null,
    2
  )
);
