"use strict";

const assert = require("../lib/assert");
const fs = require("fs");
const path = require("path");
const {
  buildFullExportPayload,
  buildSlimPayload,
  roundTripExportImport,
  resolveBannerSource,
  findEndgameTask,
  cloneTaskWithoutImages,
  isEmbeddedImageUrl,
} = require("../lib/banner-export-import");

const ROOT = path.join(__dirname, "..", "..");
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function makeFixtureState() {
  return {
    games: [
      {
        id: "g1",
        name: "Demo",
        endgame: [
          {
            id: "eg_data",
            label: "Data URL banner",
            bannerSourceImage: TINY_PNG,
            bannerOverlayText: "Data",
            bannerViews: {
              home: { aspect: 16 / 9, scale: 1, x: 0, y: 0 },
              games: { aspect: 3 / 1, scale: 1, x: 0, y: 0 },
              board: { aspect: 21 / 9, scale: 1, x: 0, y: 0 },
            },
          },
          {
            id: "eg_user",
            label: "Library banner",
            bannerSourceImage: "userimg:uimg_banner1",
            bannerOverlayText: "Lib",
            bannerViews: {
              home: { aspect: 16 / 9, scale: 1.1, x: 2, y: 1 },
              games: null,
              board: { aspect: 21 / 9, scale: 1, x: 0, y: 0 },
            },
          },
          {
            id: "eg_stock",
            label: "Stock banner",
            bannerSourceImage: "assets/banners/demo-stock.png",
            bannerViews: {
              home: { aspect: 16 / 9, scale: 1, x: 0, y: 0 },
              games: { aspect: 3 / 1, scale: 1, x: 0, y: 0 },
              board: { aspect: 21 / 9, scale: 1, x: 0, y: 0 },
            },
          },
        ],
      },
    ],
    extracurricularTasks: [],
    userImageLibrary: [
      {
        id: "uimg_banner1",
        kind: "banner",
        label: "My banner",
        createdAt: 1,
        dataUrl: TINY_PNG,
      },
    ],
  };
}

module.exports = {
  name: "banner-export-import",
  title: "Banner export → import round-trip",
  run() {
    const state = makeFixtureState();

    const full = buildFullExportPayload(state);
    assert.ok(
      full.userImageLibrary[0] && full.userImageLibrary[0].dataUrl === TINY_PNG,
      "full export includes userImageLibrary dataUrl"
    );
    assert.equal(
      findEndgameTask(full.games, "g1", "eg_user").bannerSourceImage,
      "userimg:uimg_banner1",
      "full export keeps userimg ref on task"
    );
    assert.equal(
      findEndgameTask(full.games, "g1", "eg_data").bannerSourceImage,
      TINY_PNG,
      "full export keeps embedded data URL on task"
    );
    assert.equal(
      findEndgameTask(full.games, "g1", "eg_stock").bannerSourceImage,
      "assets/banners/demo-stock.png",
      "full export keeps stock path"
    );

    const restored = roundTripExportImport(state);
    const dataTask = findEndgameTask(restored.games, "g1", "eg_data");
    const userTask = findEndgameTask(restored.games, "g1", "eg_user");
    const stockTask = findEndgameTask(restored.games, "g1", "eg_stock");

    assert.ok(dataTask && dataTask.bannerViews && dataTask.bannerViews.home, "data URL task keeps bannerViews");
    assert.ok(resolveBannerSource(dataTask, restored.userImageLibrary).ok, "data URL banner resolvable after import");
    assert.equal(dataTask.bannerOverlayText, "Data", "overlay text survives import");

    const userResolved = resolveBannerSource(userTask, restored.userImageLibrary);
    assert.ok(userResolved.ok, "userimg banner resolvable after import");
    assert.equal(userResolved.kind, "userimg", "resolves via library");
    assert.equal(userResolved.url, TINY_PNG, "library dataUrl restored");

    const stockResolved = resolveBannerSource(stockTask, restored.userImageLibrary);
    assert.ok(stockResolved.ok, "stock path banner resolvable after import");
    assert.equal(stockResolved.kind, "stock", "stock path kind");
    assert.equal(stockTask.bannerSourceImage, "assets/banners/demo-stock.png", "stock path unchanged");

    // Document the old failure mode: reload-from-slim drops embedded banners and library blobs.
    const broken = roundTripExportImport(state, { reloadFromSlim: true });
    const brokenData = findEndgameTask(broken.games, "g1", "eg_data");
    const brokenUser = findEndgameTask(broken.games, "g1", "eg_user");
    assert.ok(!brokenData.bannerSourceImage, "slim reload strips embedded data URL banners");
    assert.ok(
      !resolveBannerSource(brokenUser, broken.userImageLibrary).ok,
      "slim reload leaves userimg refs without library blobs"
    );
    // Stock paths must still survive slim omit (new cloneTaskWithoutImages behavior).
    assert.equal(
      findEndgameTask(broken.games, "g1", "eg_stock").bannerSourceImage,
      "assets/banners/demo-stock.png",
      "slim omit keeps stock path refs"
    );
    assert.equal(
      brokenUser.bannerSourceImage,
      "userimg:uimg_banner1",
      "slim omit keeps userimg refs (even if blob library is omitted)"
    );

    const slim = buildSlimPayload(state);
    assert.ok(
      slim.userImageLibrary[0] && !slim.userImageLibrary[0].dataUrl,
      "slim library omits dataUrl bytes"
    );
    assert.ok(isEmbeddedImageUrl(TINY_PNG), "tiny fixture detects as embedded");
    assert.equal(
      cloneTaskWithoutImages({ bannerSourceImage: "userimg:x" }).bannerSourceImage,
      "userimg:x",
      "cloneTaskWithoutImages keeps userimg ref"
    );
    assert.ok(
      cloneTaskWithoutImages({ bannerSourceImage: TINY_PNG }).bannerSourceImage == null,
      "cloneTaskWithoutImages strips data URLs"
    );

    const core = read("src/01-core.js");
    assert.ok(core.includes("function isEmbeddedImageUrl"), "core defines isEmbeddedImageUrl");
    assert.ok(
      core.includes("userImageLibrary: cloneUserImageLibraryForSave(omitImages)"),
      "buildSavePayload includes userImageLibrary"
    );
    assert.ok(
      /if \(isEmbeddedImageUrl\(c\.bannerSourceImage\)\) delete c\.bannerSourceImage/.test(core),
      "slim clone only strips embedded bannerSourceImage"
    );

    const modals = read("src/02-modals.js");
    assert.ok(
      /settingsImportInput[\s\S]*?applySavePayload\(data,\s*\{\s*isFirstLoad:\s*false\s*\}\)[\s\S]*?save\(\{\s*immediate:\s*true\s*\}\)[\s\S]*?renderAll\(\)/.test(
        modals
      ),
      "import must applySavePayload + save + renderAll (no load() slim reload)"
    );
    assert.ok(
      /settingsImportInput[\s\S]*?applySavePayload\(data[\s\S]*?save\(\{\s*immediate:\s*true\s*\}\)/.test(modals) &&
        !/settingsImportInput[\s\S]*?save\(\{\s*immediate:\s*true\s*\}\)[\s\S]*?\bload\(\)/.test(modals),
      "import must not call load() after save"
    );
    assert.ok(
      /settingsExportBtn[\s\S]*?JSON\.stringify\(buildSavePayload\(\)\)/.test(modals),
      "export uses full buildSavePayload() (images included)"
    );
  },
};
