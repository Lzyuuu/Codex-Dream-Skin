import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ENGINE_FILES,
  canHotSwitch,
  resolveEngine,
  resolveScript,
  shouldShowMenuBar,
  statusIconName,
} from "../src/engine.ts";
import type { DreamSkinStatus } from "../src/model.ts";

async function writeEngine(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "scripts"), { recursive: true });
  for (const relative of ENGINE_FILES) {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, relative === "VERSION" ? "1.0.0\n" : `fixture:${relative}\n`);
    if (relative.startsWith("scripts/") && relative.endsWith(".sh")) {
      await fs.chmod(file, 0o755);
    }
  }
}

async function fixture(): Promise<{ root: string; repository: string; installed: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-raycast-engine."));
  const repository = path.join(root, "repository");
  const installed = path.join(root, "installed");
  await fs.mkdir(repository);
  await fs.writeFile(path.join(repository, "README.md"), "fixture");
  await writeEngine(path.join(repository, "macos"));
  await fs.cp(path.join(repository, "macos"), installed, { recursive: true });
  return { root, repository, installed };
}

test("uses only the managed installed engine for runtime scripts", async (t) => {
  const value = await fixture();
  t.after(() => fs.rm(value.root, { recursive: true, force: true }));
  const context = await resolveEngine(value.repository, value.installed);

  assert.equal(context.sourceReady, true);
  assert.equal(context.runtimeReady, true);
  assert.equal(context.synchronized, true);
  assert.equal(
    await resolveScript(context, "start-dream-skin-macos.sh"),
    path.join(await fs.realpath(value.installed), "scripts", "start-dream-skin-macos.sh"),
  );
});

test("keeps the installed engine usable when the repository moved", async (t) => {
  const value = await fixture();
  t.after(() => fs.rm(value.root, { recursive: true, force: true }));
  const context = await resolveEngine(path.join(value.root, "missing-repository"), value.installed);

  assert.equal(context.sourceReady, false);
  assert.match(context.sourceError ?? "", /源码目录/);
  assert.equal(context.runtimeReady, true);
  assert.equal(
    await resolveScript(context, "status-dream-skin-macos.sh"),
    path.join(await fs.realpath(value.installed), "scripts", "status-dream-skin-macos.sh"),
  );
});

test("reports missing and drifted managed engines", async (t) => {
  const value = await fixture();
  t.after(() => fs.rm(value.root, { recursive: true, force: true }));

  const missing = await resolveEngine(value.repository, path.join(value.root, "missing-installed"));
  assert.equal(missing.sourceReady, true);
  assert.equal(missing.runtimeReady, false);
  assert.equal(missing.synchronized, false);

  await fs.writeFile(path.join(value.installed, "scripts", "injector.mjs"), "drift\n");
  const drifted = await resolveEngine(value.repository, value.installed);
  assert.equal(drifted.runtimeReady, true);
  assert.equal(drifted.synchronized, false);
});

test("rejects symlinked source repositories without disabling the installed engine", async (t) => {
  const value = await fixture();
  const link = path.join(value.root, "repository-link");
  await fs.symlink(value.repository, link);
  t.after(() => fs.rm(value.root, { recursive: true, force: true }));

  const context = await resolveEngine(link, value.installed);
  assert.equal(context.sourceReady, false);
  assert.match(context.sourceError ?? "", /符号链接/);
  assert.equal(context.runtimeReady, true);
});

test("allows hot switching only through a healthy ChatGPT connection", () => {
  const healthy: DreamSkinStatus = {
    session: "active",
    operation: "",
    operationMessage: "",
    port: 9341,
    injectorAlive: true,
    cdpOk: true,
    codexRunning: true,
    themeId: "theme",
    themeName: "Theme",
    appliedThemeId: "theme",
    appliedThemeName: "Theme",
  };

  assert.equal(canHotSwitch(healthy), true);
  for (const field of ["injectorAlive", "cdpOk", "codexRunning"] as const) {
    assert.equal(canHotSwitch({ ...healthy, [field]: false }), false);
  }
});

test("uses badged icons for the menu-bar status", () => {
  const status = {
    session: "active",
    operation: "",
    injectorAlive: true,
  } as DreamSkinStatus;
  assert.equal(statusIconName(status), "icon-active.png");
  assert.equal(statusIconName({ ...status, operation: "applying" }), "icon-busy.png");
  assert.equal(
    statusIconName({ ...status, session: "paused", injectorAlive: false }),
    "icon-off.png",
  );
  assert.equal(
    statusIconName({ ...status, session: "stale", injectorAlive: false }),
    "icon-error.png",
  );
});

test("hides the menu-bar item only after a full exit", () => {
  const status = {
    session: "active",
    operation: "",
    injectorAlive: true,
  } as DreamSkinStatus;

  assert.equal(shouldShowMenuBar(status), true);
  assert.equal(shouldShowMenuBar({ ...status, session: "paused" }), true);
  assert.equal(shouldShowMenuBar({ ...status, session: "paused", injectorAlive: false }), false);
  assert.equal(shouldShowMenuBar({ ...status, session: "off", injectorAlive: false }), false);
  assert.equal(shouldShowMenuBar({ ...status, session: "stale", injectorAlive: false }), true);
});
