import { Alert, Toast, confirmAlert, environment, open, showToast } from "@raycast/api";
import fs from "node:fs/promises";
import path from "node:path";
import {
  canHotSwitch,
  maintainEngine,
  readStatus,
  runScript,
  stateRoot,
  themesRoot,
} from "./engine";
import type { EngineContext } from "./model";

async function withToast(title: string, action: () => Promise<void>): Promise<boolean> {
  const toast = await showToast({ style: Toast.Style.Animated, title });
  try {
    await action();
    toast.style = Toast.Style.Success;
    toast.title = `${title}完成`;
    return true;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = `${title}失败`;
    toast.message = (error instanceof Error ? error.message : String(error)).slice(-800);
    return false;
  }
}

async function confirmRestart(context: EngineContext, action: string): Promise<boolean> {
  const status = await readStatus(context, true);
  if (canHotSwitch(status)) return true;
  return confirmAlert({
    title: `${action}可能需要重启 ChatGPT`,
    message: "当前没有健康的热切换连接。请先保存未发送的输入，再继续。",
    primaryAction: { title: "继续", style: Alert.ActionStyle.Default },
    dismissAction: { title: "取消" },
  });
}

export async function switchTheme(context: EngineContext, id: string): Promise<boolean> {
  if (!(await confirmRestart(context, "切换主题"))) return false;
  return withToast("切换主题", async () => {
    await runScript(context, "switch-theme-macos.sh", ["--id", id]);
  });
}

export async function applySkin(context: EngineContext): Promise<boolean> {
  if (!(await confirmRestart(context, "应用皮肤"))) return false;
  return withToast("应用皮肤", async () => {
    await runScript(context, "start-dream-skin-macos.sh", ["--restart-existing"]);
  });
}

export async function pauseSkin(context: EngineContext): Promise<boolean> {
  return withToast("暂停皮肤", async () => {
    await runScript(context, "pause-dream-skin-macos.sh");
  });
}

export async function exitDreamSkin(context: EngineContext): Promise<boolean> {
  const confirmed = await confirmAlert({
    title: "彻底退出 Dream Skin？",
    message: "将移除皮肤、停止注入器并清理旧启动任务。ChatGPT 会保持运行。",
    primaryAction: { title: "彻底退出", style: Alert.ActionStyle.Destructive },
    dismissAction: { title: "取消" },
  });
  if (!confirmed) return false;
  return withToast("退出 Dream Skin", async () => {
    await runScript(context, "pause-dream-skin-macos.sh", ["--stop-injector"]);
  });
}

export async function syncEngine(context: EngineContext): Promise<boolean> {
  const confirmed = await confirmAlert({
    title: context.runtimeReady ? "同步 Dream Skin 引擎？" : "安装 Dream Skin 引擎？",
    message: "Raycast 将安全停止注入、退出 ChatGPT，再从所选源码原子安装受管引擎。用户主题会保留。",
    primaryAction: { title: context.runtimeReady ? "退出并同步" : "退出并安装" },
    dismissAction: { title: "取消" },
  });
  if (!confirmed) return false;
  return withToast(context.runtimeReady ? "同步引擎" : "安装引擎", async () => {
    await maintainEngine(context, "sync");
  });
}

export async function repairEngine(context: EngineContext): Promise<boolean> {
  const confirmed = await confirmAlert({
    title: "修复 Dream Skin 引擎？",
    message:
      "Raycast 将只移除 Dream Skin 的命名后台作业，退出 ChatGPT，重装受管引擎并运行自检。不会删除用户主题或直接终止未验证 PID。",
    primaryAction: { title: "开始修复" },
    dismissAction: { title: "取消" },
  });
  if (!confirmed) return false;
  return withToast("修复引擎", async () => {
    await maintainEngine(context, "repair");
  });
}

export async function diagnoseEngine(context: EngineContext): Promise<boolean> {
  return withToast("诊断引擎", async () => {
    if (!context.runtimeReady) throw new Error(context.runtimeError || "受管引擎未安装");
    if (context.sourceReady && !context.synchronized) {
      throw new Error("受管引擎与所选源码不一致，请执行“同步引擎”。");
    }
    await runScript(context, "doctor-macos.sh", [], 60_000);
  });
}

export async function verifySkin(context: EngineContext): Promise<boolean> {
  return withToast("验证并截图", async () => {
    await fs.mkdir(environment.supportPath, { recursive: true });
    const screenshot = path.join(environment.supportPath, "dream-skin-verification.png");
    await runScript(context, "verify-dream-skin-macos.sh", ["--screenshot", screenshot], 60_000);
    await open(screenshot);
  });
}

async function requireSelectedFile(
  file: string,
  extensions: RegExp,
  maximum: number,
): Promise<string> {
  const absolute = path.resolve(file);
  if (!extensions.test(absolute)) throw new Error("文件类型不受支持");
  const info = await fs.lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 1 || info.size > maximum) {
    throw new Error("所选文件不是符合大小限制的普通文件");
  }
  return absolute;
}

export async function createImageTheme(
  context: EngineContext,
  file: string,
  name: string,
): Promise<boolean> {
  const image = await requireSelectedFile(
    file,
    /\.(?:png|jpe?g|webp|heic|tiff?)$/i,
    50 * 1024 * 1024,
  );
  if (!(await confirmRestart(context, "创建并应用图片主题"))) return false;
  return withToast("创建图片主题", async () => {
    const args = ["--file", image];
    if (name.trim()) args.push("--name", name.trim());
    await runScript(context, "load-image-theme-macos.sh", args);
  });
}

export async function importThemeZip(context: EngineContext, file: string): Promise<boolean> {
  const archive = await requireSelectedFile(file, /\.zip$/i, 32 * 1024 * 1024);
  return withToast("导入主题 ZIP", async () => {
    const result = await runScript(context, "import-theme-zip-macos.sh", ["--file", archive]);
    const value = JSON.parse(result.stdout) as { status?: string; name?: string };
    if (!new Set(["imported", "duplicate"]).has(value.status ?? "")) {
      throw new Error("导入器没有返回成功状态");
    }
  });
}

export async function openThemesFolder(): Promise<void> {
  await fs.mkdir(themesRoot, { recursive: true, mode: 0o700 });
  await open(themesRoot);
}

export async function openStateFolder(): Promise<void> {
  await fs.mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await open(stateRoot);
}

export async function openGallery(): Promise<void> {
  await open("https://dreamskin.cc/gallery");
}

export async function openStudio(): Promise<void> {
  await open("https://dreamskin.cc/studio");
}
