import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { DreamSkinStatus, EngineContext } from "./model";

const execFileAsync = promisify(execFile);
const RUNTIME_SCRIPTS = new Set([
  "doctor-macos.sh",
  "import-theme-zip-macos.sh",
  "load-image-theme-macos.sh",
  "pause-dream-skin-macos.sh",
  "restore-dream-skin-macos.sh",
  "start-dream-skin-macos.sh",
  "status-dream-skin-macos.sh",
  "switch-theme-macos.sh",
  "verify-dream-skin-macos.sh",
]);

export const ENGINE_FILES = [
  "VERSION",
  "assets/dream-skin.css",
  "assets/portal-hero.png",
  "assets/renderer-inject.js",
  "assets/safe-css-policy.json",
  "assets/safe-css-validator.mjs",
  "assets/selectors.json",
  "assets/theme-package-validator.mjs",
  "assets/theme.json",
  "scripts/common-macos.sh",
  "scripts/doctor-macos.sh",
  "scripts/extract-theme-zip-macos.sh",
  "scripts/image-metadata.mjs",
  "scripts/import-theme-zip-macos.sh",
  "scripts/injector.mjs",
  "scripts/install-dream-skin-macos.sh",
  "scripts/load-image-theme-macos.sh",
  "scripts/pause-dream-skin-macos.sh",
  "scripts/publish-theme-import.mjs",
  "scripts/restore-dream-skin-macos.sh",
  "scripts/snapshot-active-theme-macos.sh",
  "scripts/snapshot-theme-zip.mjs",
  "scripts/stage-theme.mjs",
  "scripts/start-dream-skin-macos.sh",
  "scripts/status-dream-skin-macos.sh",
  "scripts/switch-theme-macos.sh",
  "scripts/theme-content-fingerprint.mjs",
  "scripts/theme-switch-lock-macos.sh",
  "scripts/theme-config.mjs",
  "scripts/validate-safe-css-file.mjs",
  "scripts/verify-dream-skin-macos.sh",
  "scripts/write-theme.mjs",
] as const;

export const installedEngineRoot = path.join(os.homedir(), ".codex", "codex-dream-skin-studio");
export const stateRoot = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "CodexDreamSkinStudio",
);
export const themesRoot = path.join(stateRoot, "themes");

async function requirePlainFile(file: string, label: string): Promise<void> {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} 不是普通文件`);
  if (info.size < 1) throw new Error(`${label} 是空文件`);
}

async function inspectEngineRoot(root: string): Promise<{ root: string; scriptsRoot: string }> {
  const absolute = path.resolve(root);
  const info = await fs.lstat(absolute);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("引擎目录不能是符号链接");
  const realRoot = await fs.realpath(absolute);
  for (const relative of ENGINE_FILES) {
    await requirePlainFile(path.join(realRoot, relative), relative);
  }
  const scriptsRoot = await fs.realpath(path.join(realRoot, "scripts"));
  if (!scriptsRoot.startsWith(`${realRoot}${path.sep}`)) throw new Error("脚本路径逃逸引擎目录");
  for (const script of RUNTIME_SCRIPTS) {
    await fs.access(path.join(scriptsRoot, script), constants.X_OK);
  }
  return { root: realRoot, scriptsRoot };
}

async function inspectSource(input: string): Promise<{
  repository: string;
  sourceRoot: string;
  sourceScriptsRoot: string;
}> {
  if (!input.trim()) throw new Error("未选择 Dream Skin 源码目录");
  const repository = path.resolve(input);
  const info = await fs.lstat(repository);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("源码目录不能是符号链接");
  const realRepository = await fs.realpath(repository);
  await requirePlainFile(path.join(realRepository, "README.md"), "README.md");
  const engine = await inspectEngineRoot(path.join(realRepository, "macos"));
  if (!engine.root.startsWith(`${realRepository}${path.sep}`)) {
    throw new Error("macos 路径逃逸源码目录");
  }
  return {
    repository: realRepository,
    sourceRoot: engine.root,
    sourceScriptsRoot: engine.scriptsRoot,
  };
}

async function engineFingerprint(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const relative of ENGINE_FILES) {
    hash.update(relative);
    hash.update("\0");
    hash.update(await fs.readFile(path.join(root, relative)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function resolveEngine(
  sourceInput = "",
  managedRoot = installedEngineRoot,
): Promise<EngineContext> {
  const context: EngineContext = {
    installedRoot: path.resolve(managedRoot),
    installedScriptsRoot: path.join(path.resolve(managedRoot), "scripts"),
    sourceReady: false,
    runtimeReady: false,
    synchronized: false,
  };

  try {
    Object.assign(context, await inspectSource(sourceInput));
    context.sourceReady = true;
  } catch (error) {
    context.sourceError = `源码目录不可用：${error instanceof Error ? error.message : String(error)}`;
  }

  try {
    const installed = await inspectEngineRoot(managedRoot);
    context.installedRoot = installed.root;
    context.installedScriptsRoot = installed.scriptsRoot;
    context.runtimeReady = true;
  } catch (error) {
    context.runtimeError = error instanceof Error ? error.message : String(error);
  }

  if (context.sourceReady && context.runtimeReady && context.sourceRoot) {
    const [sourceHash, installedHash] = await Promise.all([
      engineFingerprint(context.sourceRoot),
      engineFingerprint(context.installedRoot),
    ]);
    context.synchronized = sourceHash === installedHash;
  }
  return context;
}

export async function resolveScript(context: EngineContext, name: string): Promise<string> {
  if (!RUNTIME_SCRIPTS.has(name)) throw new Error(`不允许执行脚本：${name}`);
  if (!context.runtimeReady) throw new Error(context.runtimeError || "受管引擎尚未安装");
  const script = path.join(context.installedScriptsRoot, name);
  await requirePlainFile(script, name);
  const realScript = await fs.realpath(script);
  if (!realScript.startsWith(`${context.installedScriptsRoot}${path.sep}`)) {
    throw new Error(`脚本路径逃逸受管引擎：${name}`);
  }
  await fs.access(realScript, constants.X_OK);
  return realScript;
}

export async function resolveSourceInstaller(context: EngineContext): Promise<string> {
  if (!context.sourceReady || !context.sourceScriptsRoot) {
    throw new Error(context.sourceError || "请先在 Raycast 设置中选择 Dream Skin 源码目录");
  }
  const script = path.join(context.sourceScriptsRoot, "install-dream-skin-macos.sh");
  await requirePlainFile(script, "install-dream-skin-macos.sh");
  await fs.access(script, constants.X_OK);
  return script;
}

export interface ScriptResult {
  stdout: string;
  stderr: string;
}

async function execute(
  file: string,
  args: string[],
  cwd: string,
  timeout: number,
): Promise<ScriptResult> {
  try {
    const result = await execFileAsync(file, args, {
      cwd,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 2 * 1024 * 1024,
      timeout,
    });
    return { stdout: String(result.stdout), stderr: String(result.stderr) };
  } catch (error) {
    const failure = error as Error & { stdout?: string | Buffer; stderr?: string | Buffer };
    const detail = [failure.stderr, failure.stdout, failure.message]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join("\n")
      .slice(-1200);
    throw new Error(detail || `${path.basename(file)} 执行失败`);
  }
}

export async function runScript(
  context: EngineContext,
  name: string,
  args: string[] = [],
  timeout = 180_000,
): Promise<ScriptResult> {
  const script = await resolveScript(context, name);
  return execute(script, args, context.installedRoot, timeout);
}

export async function runSourceInstaller(context: EngineContext): Promise<ScriptResult> {
  const script = await resolveSourceInstaller(context);
  return execute(script, ["--no-launchers", "--no-launch"], context.sourceRoot!, 180_000);
}

async function removeLaunchdJob(label: string): Promise<void> {
  try {
    await execFileAsync("/bin/launchctl", ["remove", label], { timeout: 10_000 });
  } catch {
    // launchctl returns non-zero when the named Dream Skin job is already absent.
  }
}

async function chatGPTIsRunning(): Promise<boolean> {
  for (const name of ["ChatGPT", "Codex"]) {
    try {
      await execFileAsync("/usr/bin/pgrep", ["-x", name], { timeout: 5_000 });
      return true;
    } catch {
      // pgrep returns non-zero when this exact process name is absent.
    }
  }
  return false;
}

async function quitChatGPT(): Promise<void> {
  try {
    await execFileAsync(
      "/usr/bin/osascript",
      ["-e", 'tell application id "com.openai.codex" to quit'],
      { timeout: 10_000 },
    );
  } catch {
    // The app may already be closed; the exact process check below is authoritative.
  }
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (!(await chatGPTIsRunning())) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("ChatGPT 未在 20 秒内退出；未继续覆盖引擎。");
}

export async function maintainEngine(
  context: EngineContext,
  mode: "sync" | "repair",
): Promise<EngineContext> {
  if (!context.sourceReady) {
    throw new Error(context.sourceError || "请先在 Raycast 设置中选择 Dream Skin 源码目录");
  }

  if (mode === "sync" && context.runtimeReady) {
    await runScript(context, "pause-dream-skin-macos.sh", ["--stop-injector"]);
  } else if (mode === "repair") {
    await Promise.all([
      removeLaunchdJob("com.openai.codex-dream-skin-studio.injector"),
      removeLaunchdJob("com.openai.codex-dream-skin-studio.app"),
    ]);
  }

  await quitChatGPT();
  await runSourceInstaller(context);

  const refreshed = await resolveEngine(context.repository, context.installedRoot);
  if (!refreshed.runtimeReady || !refreshed.synchronized) {
    throw new Error(refreshed.runtimeError || "安装后的受管引擎与源码不一致");
  }
  await runScript(refreshed, "doctor-macos.sh", [], 60_000);
  await runScript(refreshed, "pause-dream-skin-macos.sh", ["--stop-injector"]);
  return resolveEngine(context.repository, context.installedRoot);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown): boolean {
  return value === true;
}

export async function readStatus(context: EngineContext, deep = false): Promise<DreamSkinStatus> {
  const result = await runScript(
    context,
    "status-dream-skin-macos.sh",
    deep ? ["--json", "--deep"] : ["--json"],
    15_000,
  );
  const value = JSON.parse(result.stdout) as Record<string, unknown>;
  return {
    session: text(value.session),
    operation: text(value.operation),
    operationMessage: text(value.operationMessage),
    port: Number.isInteger(value.port) ? Number(value.port) : 9341,
    injectorAlive: bool(value.injectorAlive),
    cdpOk: bool(value.cdpOk),
    codexRunning: bool(value.codexRunning),
    themeId: text(value.themeId),
    themeName: text(value.themeName),
    appliedThemeId: text(value.appliedThemeId),
    appliedThemeName: text(value.appliedThemeName),
  };
}

export function canHotSwitch(status: DreamSkinStatus): boolean {
  return status.session === "active" && status.injectorAlive && status.cdpOk && status.codexRunning;
}

export function statusLabel(status?: DreamSkinStatus): string {
  if (!status) return "引擎未就绪";
  if (status.operation === "applying" || status.operation === "pausing") return "处理中";
  if (status.session === "active" && status.injectorAlive) return "运行中";
  if (status.session === "off" || status.session === "paused") return "已暂停";
  if (status.session === "applying") return "处理中";
  return "异常";
}

export function engineLabel(context?: EngineContext): string {
  if (!context?.runtimeReady) return "未安装或需修复";
  if (!context.sourceReady) return "受管引擎就绪 · 源码不可用";
  return context.synchronized ? "受管引擎已同步" : "受管引擎待同步";
}

export function statusIconName(status?: DreamSkinStatus): string {
  if (!status) return "icon-error.png";
  if (status.operation === "applying" || status.operation === "pausing") return "icon-busy.png";
  if (status.session === "active" && status.injectorAlive) return "icon-active.png";
  if (status.session === "off" || status.session === "paused") return "icon-off.png";
  if (status.session === "applying") return "icon-busy.png";
  return "icon-error.png";
}

export function shouldShowMenuBar(status?: DreamSkinStatus): boolean {
  return !status || status.injectorAlive || !["off", "paused"].includes(status.session);
}
