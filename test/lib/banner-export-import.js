"use strict";

/**
 * Pure helpers mirroring export / slim-omit / import banner behavior for regression tests.
 * Keep in sync with src/01-core.js (clone*WithoutImages, userImageLibrary) and
 * src/02-modals.js (export buildSavePayload / import applySavePayload).
 */

const USER_IMAGE_REF_PREFIX = "userimg:";

function isUserImageRef(path) {
  return String(path || "").trim().toLowerCase().indexOf(USER_IMAGE_REF_PREFIX) === 0;
}

function getUserImageIdFromRef(path) {
  const raw = String(path || "").trim();
  if (!isUserImageRef(raw)) return "";
  return raw.slice(USER_IMAGE_REF_PREFIX.length);
}

function isEmbeddedImageUrl(path) {
  return /^(data:|blob:)/i.test(String(path || "").trim());
}

function cloneTaskWithoutImages(task) {
  if (!task || typeof task !== "object") return task;
  const c = Object.assign({}, task);
  if (isEmbeddedImageUrl(c.bannerSourceImage)) delete c.bannerSourceImage;
  if (isEmbeddedImageUrl(c.bannerImage)) delete c.bannerImage;
  if (isEmbeddedImageUrl(c.bannerHomeImage)) delete c.bannerHomeImage;
  if (isEmbeddedImageUrl(c.bannerGamesImage)) delete c.bannerGamesImage;
  delete c.bannerHomeAspect;
  delete c.bannerGamesAspect;
  return c;
}

function cloneGameWithoutImages(game) {
  if (!game || typeof game !== "object") return game;
  const c = Object.assign({}, game);
  if (isEmbeddedImageUrl(c.iconImage)) delete c.iconImage;
  c.weeklies = Array.isArray(game.weeklies) ? game.weeklies.map(cloneTaskWithoutImages) : game.weeklies;
  c.endgame = Array.isArray(game.endgame) ? game.endgame.map(cloneTaskWithoutImages) : game.endgame;
  return c;
}

function cloneUserImageLibraryForSave(library, omitData) {
  return (library || []).map((e) => {
    if (!e || typeof e !== "object") return e;
    if (!omitData) {
      return {
        id: e.id,
        kind: e.kind === "pfp" ? "pfp" : "banner",
        label: e.label || "",
        createdAt: e.createdAt || 0,
        dataUrl: e.dataUrl || "",
      };
    }
    return {
      id: e.id,
      kind: e.kind === "pfp" ? "pfp" : "banner",
      label: e.label || "",
      createdAt: e.createdAt || 0,
    };
  });
}

function normalizeLoadedUserImageLibrary(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const id = String(e.id || "").trim();
      const dataUrl = String(e.dataUrl || "").trim();
      if (!id) return null;
      return {
        id: id,
        kind: e.kind === "pfp" ? "pfp" : "banner",
        label: String(e.label || id).trim().slice(0, 80) || id,
        createdAt: Number(e.createdAt) || 0,
        dataUrl: dataUrl.indexOf("data:") === 0 ? dataUrl : "",
      };
    })
    .filter(Boolean);
}

function countUserImageLibraryBlobs(library) {
  let n = 0;
  (library || []).forEach((e) => {
    if (e && typeof e.dataUrl === "string" && e.dataUrl.indexOf("data:") === 0) n++;
  });
  return n;
}

/** Preserve blobs when incoming library is slim/meta-only (matches src/01-core.js). */
function mergeLoadedUserImageLibrary(incomingRaw, existing) {
  const incoming = normalizeLoadedUserImageLibrary(incomingRaw);
  const prevById = new Map();
  (existing || []).forEach((e) => {
    if (e && e.id) prevById.set(e.id, e);
  });
  return incoming.map((e) => {
    if (e.dataUrl) return e;
    const prev = prevById.get(e.id);
    if (prev && typeof prev.dataUrl === "string" && prev.dataUrl.indexOf("data:") === 0) {
      return Object.assign({}, e, { dataUrl: prev.dataUrl });
    }
    return e;
  });
}

/** Minimal full export payload (banner-related fields). */
function buildFullExportPayload(state) {
  return {
    games: state.games,
    extracurricularTasks: state.extracurricularTasks || [],
    userImageLibrary: cloneUserImageLibraryForSave(state.userImageLibrary, false),
  };
}

/** Slim backup shape used by maybeWriteDailySlimBackup (omitImages: true). */
function buildSlimPayload(state) {
  return {
    games: (state.games || []).map(cloneGameWithoutImages),
    extracurricularTasks: (state.extracurricularTasks || []).map(cloneTaskWithoutImages),
    userImageLibrary: cloneUserImageLibraryForSave(state.userImageLibrary, true),
  };
}

/**
 * Simulate Settings export wrapper → parse → applySavePayload-style import.
 * opts.reloadFromSlim: if true, mimics the old broken import (save then load from slim).
 * opts.existingLibrary: in-memory library before apply (tests slim-merge preserve).
 */
function roundTripExportImport(state, opts) {
  const options = opts || {};
  const STORAGE_KEY = "gacha-tracker";
  const inner = buildFullExportPayload(state);
  const fileJson = JSON.stringify({ [STORAGE_KEY]: JSON.stringify(inner) });
  const parsed = JSON.parse(fileJson);
  const data = JSON.parse(parsed[STORAGE_KEY]);

  if (options.reloadFromSlim) {
    // Old bug: after import, load() read slim localStorage (no image blobs / stripped data URLs).
    return buildSlimPayload({
      games: data.games,
      extracurricularTasks: data.extracurricularTasks,
      userImageLibrary: data.userImageLibrary,
    });
  }

  const existing = options.existingLibrary || [];
  return {
    games: data.games,
    extracurricularTasks: data.extracurricularTasks || [],
    userImageLibrary: mergeLoadedUserImageLibrary(data.userImageLibrary, existing),
  };
}

/** Apply a slim payload onto an existing in-memory library (post-fix / stale load). */
function applySlimOntoLibrary(fullState) {
  const slim = buildSlimPayload(fullState);
  return {
    games: slim.games,
    extracurricularTasks: slim.extracurricularTasks,
    userImageLibrary: mergeLoadedUserImageLibrary(slim.userImageLibrary, fullState.userImageLibrary),
  };
}

function resolveBannerSource(task, library) {
  const src = task && task.bannerSourceImage;
  if (!src) return { ok: false, reason: "missing bannerSourceImage" };
  const raw = String(src).trim();
  if (raw.indexOf("data:") === 0) return { ok: true, kind: "dataUrl", url: raw };
  if (/^assets\//.test(raw) || /^\.?\/?assets\//.test(raw)) {
    return { ok: true, kind: "stock", url: raw };
  }
  if (isUserImageRef(raw)) {
    const id = getUserImageIdFromRef(raw);
    const entry = (library || []).find((e) => e && e.id === id);
    if (!entry || !entry.dataUrl) {
      return { ok: false, reason: "userimg ref not resolvable", ref: raw, id };
    }
    return { ok: true, kind: "userimg", url: entry.dataUrl, ref: raw, id };
  }
  if (/^(https?:|\/\/)/i.test(raw)) return { ok: true, kind: "remote", url: raw };
  return { ok: true, kind: "path", url: raw };
}

function findEndgameTask(games, gameId, taskId) {
  const game = (games || []).find((g) => g && g.id === gameId);
  if (!game) return null;
  return (game.endgame || []).find((t) => t && t.id === taskId) || null;
}

module.exports = {
  USER_IMAGE_REF_PREFIX,
  isEmbeddedImageUrl,
  isUserImageRef,
  cloneTaskWithoutImages,
  cloneGameWithoutImages,
  cloneUserImageLibraryForSave,
  normalizeLoadedUserImageLibrary,
  countUserImageLibraryBlobs,
  mergeLoadedUserImageLibrary,
  buildFullExportPayload,
  buildSlimPayload,
  roundTripExportImport,
  applySlimOntoLibrary,
  resolveBannerSource,
  findEndgameTask,
};
