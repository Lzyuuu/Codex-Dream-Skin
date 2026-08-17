import assert from "node:assert/strict";
import test from "node:test";
import { parseCachedDreamSkinState } from "../src/state-cache.ts";

const state = {
  context: {
    repository: "/repo",
    sourceRoot: "/repo/macos",
    sourceScriptsRoot: "/repo/macos/scripts",
    installedRoot: "/managed",
    installedScriptsRoot: "/managed/scripts",
    sourceReady: true,
    runtimeReady: true,
    synchronized: true,
  },
  status: { themeId: "theme" },
  library: { themes: [], skipped: [] },
};

test("restores a valid managed-engine state independently of the source path", () => {
  assert.deepEqual(parseCachedDreamSkinState(JSON.stringify(state)), state);
  assert.equal(parseCachedDreamSkinState("not json"), undefined);
});
