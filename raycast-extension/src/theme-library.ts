import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ThemeArt, ThemeLibrary, ThemeRecord } from "./model";

const execFileAsync = promisify(execFile);
const THEME_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MEDIA_NAME = /^background\.(?:png|jpe?g|webp|mp4|webm)$/i;
const VIDEO_NAME = /\.(?:mp4|webm)$/i;
const NOFOLLOW = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

interface ThemeJson {
  id?: unknown;
  name?: unknown;
  tagline?: unknown;
  image?: unknown;
  appearance?: unknown;
  art?: unknown;
}

function sameFile(left: Awaited<ReturnType<fs.FileHandle["stat"]>>, right: typeof left): boolean {
  return (
    left.isFile() &&
    right.isFile() &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

async function readStableJson(file: string, maxBytes = 1024 * 1024): Promise<ThemeJson> {
  const handle = await fs.open(file, NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > maxBytes) {
      throw new Error("theme.json 大小无效");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (!sameFile(before, after) || bytes.length !== after.size)
      throw new Error("theme.json 读取时发生变化");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as ThemeJson;
  } finally {
    await handle.close();
  }
}

function cleanText(value: unknown, fallback: string, maximum: number): string {
  if (typeof value !== "string") return fallback;
  const cleaned = Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127 ? " " : character;
  })
    .join("")
    .trim();
  return Array.from(cleaned).slice(0, maximum).join("") || fallback;
}

function art(value: unknown): ThemeArt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  return {
    focusX: typeof raw.focusX === "number" ? raw.focusX : undefined,
    focusY: typeof raw.focusY === "number" ? raw.focusY : undefined,
    safeArea: typeof raw.safeArea === "string" ? raw.safeArea : undefined,
    taskMode: typeof raw.taskMode === "string" ? raw.taskMode : undefined,
  };
}

async function ffmpegPath(): Promise<string | undefined> {
  for (const candidate of ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"]) {
    try {
      const resolved = await fs.realpath(candidate);
      const info = await fs.stat(resolved);
      if (info.isFile()) {
        await fs.access(resolved, constants.X_OK);
        return resolved;
      }
    } catch {
      // Try the next standard Homebrew location.
    }
  }
  return undefined;
}

export function coverCacheKey(
  mediaPath: string,
  identity: { dev: number | bigint; ino: number | bigint; size: number; mtimeMs: number },
): string {
  return createHash("sha256")
    .update(`${mediaPath}\0${identity.dev}\0${identity.ino}\0${identity.size}\0${identity.mtimeMs}`)
    .digest("hex");
}

export async function ensureVideoCover(
  mediaPath: string,
  supportPath: string,
): Promise<string | undefined> {
  const executable = await ffmpegPath();
  if (!executable) return undefined;
  const before = await fs.stat(mediaPath);
  const covers = path.join(supportPath, "video-covers");
  await fs.mkdir(covers, { recursive: true, mode: 0o700 });
  const cover = path.join(covers, `${coverCacheKey(mediaPath, before)}.jpg`);
  try {
    const existing = await fs.lstat(cover);
    if (existing.isFile() && !existing.isSymbolicLink() && existing.size > 0) return cover;
  } catch {
    // Generate below.
  }

  const temporary = `${cover}.${process.pid}.${Date.now()}.tmp.jpg`;
  const baseArgs = [
    "-nostdin",
    "-v",
    "error",
    "-i",
    mediaPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=1200:-2:force_original_aspect_ratio=decrease",
    "-q:v",
    "3",
    "-y",
    temporary,
  ];
  try {
    try {
      await execFileAsync(executable, ["-ss", "1", ...baseArgs], { timeout: 30_000 });
    } catch {
      await execFileAsync(executable, baseArgs, { timeout: 30_000 });
    }
    const after = await fs.stat(mediaPath);
    if (!sameFile(before, after)) throw new Error("视频在抽帧时发生变化");
    const generated = await fs.stat(temporary);
    if (!generated.isFile() || generated.size < 1) throw new Error("视频封面为空");
    await fs.chmod(temporary, 0o600);
    await fs.rename(temporary, cover);
    return cover;
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function readTheme(directory: string, supportPath: string): Promise<ThemeRecord> {
  const directoryInfo = await fs.lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error("目录无效");
  const directoryId = path.basename(directory);
  if (!THEME_ID.test(directoryId)) throw new Error("目录 ID 无效");

  const value = await readStableJson(path.join(directory, "theme.json"));
  const id = typeof value.id === "string" ? value.id : directoryId;
  if (!THEME_ID.test(id)) throw new Error("主题 ID 无效");
  if (
    typeof value.image !== "string" ||
    !MEDIA_NAME.test(value.image) ||
    path.basename(value.image) !== value.image
  ) {
    throw new Error("背景文件名无效");
  }
  const mediaPath = path.join(directory, value.image);
  const mediaInfo = await fs.lstat(mediaPath);
  if (!mediaInfo.isFile() || mediaInfo.isSymbolicLink() || mediaInfo.size < 1)
    throw new Error("背景文件无效");
  const mediaKind = VIDEO_NAME.test(value.image) ? "video" : "image";
  const maximum = mediaKind === "video" ? 32 * 1024 * 1024 : 10 * 1024 * 1024;
  if (mediaInfo.size > maximum) throw new Error("背景文件超过大小限制");
  const realDirectory = await fs.realpath(directory);
  const realMedia = await fs.realpath(mediaPath);
  if (!realMedia.startsWith(`${realDirectory}${path.sep}`)) throw new Error("背景路径逃逸");

  return {
    libraryId: directoryId,
    id,
    name: cleanText(value.name, id, 80),
    tagline: cleanText(value.tagline, "", 120),
    appearance: cleanText(value.appearance, "auto", 16),
    art: art(value.art),
    directory: realDirectory,
    mediaPath: realMedia,
    mediaKind,
    coverPath: mediaKind === "video" ? await ensureVideoCover(realMedia, supportPath) : realMedia,
  };
}

export async function discoverThemes(root: string, supportPath: string): Promise<ThemeLibrary> {
  try {
    const rootInfo = await fs.lstat(root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error("主题库目录无效");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { themes: [], skipped: [] };
    throw error;
  }
  const entries = (await fs.readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const settled = await Promise.allSettled(
    entries.map((entry) => readTheme(path.join(root, entry.name), supportPath)),
  );
  const themes: ThemeRecord[] = [];
  const skipped: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") themes.push(result.value);
    else
      skipped.push(
        `${entries[index].name}: ${result.reason instanceof Error ? result.reason.message : "无效主题"}`,
      );
  });
  return { themes, skipped };
}
