import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { coverCacheKey, discoverThemes, ensureVideoCover } from "../src/theme-library.ts";

const execFileAsync = promisify(execFile);

test("discovers themes with distinct runtime and library ids", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-raycast-themes."));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const support = path.join(root, "support");
  const valid = path.join(root, "local.valid");
  const invalid = path.join(root, "local.invalid");
  await fs.mkdir(valid);
  await fs.mkdir(invalid);
  await fs.writeFile(path.join(valid, "background.jpg"), "jpeg fixture");
  await fs.writeFile(
    path.join(valid, "theme.json"),
    JSON.stringify({
      schemaVersion: 1,
      id: "custom.runtime",
      name: "Valid",
      image: "background.jpg",
    }),
  );
  await fs.writeFile(
    path.join(invalid, "theme.json"),
    JSON.stringify({ schemaVersion: 1, id: "other.id", name: "Invalid", image: "missing.jpg" }),
  );

  const library = await discoverThemes(root, support);
  assert.deepEqual(
    library.themes.map((theme) => [theme.libraryId, theme.id]),
    [["local.valid", "custom.runtime"]],
  );
  assert.equal(library.skipped.length, 1);
});

test("video cover key changes with file identity", () => {
  const first = coverCacheKey("/tmp/theme.mp4", { dev: 1, ino: 2, size: 3, mtimeMs: 4 });
  const second = coverCacheKey("/tmp/theme.mp4", { dev: 1, ino: 2, size: 4, mtimeMs: 4 });
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
});

test("extracts and reuses a cached video cover", async (t) => {
  const ffmpeg = "/opt/homebrew/bin/ffmpeg";
  try {
    await fs.access(ffmpeg);
  } catch {
    t.skip("ffmpeg is not installed");
    return;
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamskin-raycast-cover."));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const video = path.join(root, "background.mp4");
  await execFileAsync(ffmpeg, [
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=320x180:d=2",
    "-pix_fmt",
    "yuv420p",
    "-y",
    video,
  ]);
  const first = await ensureVideoCover(video, path.join(root, "support"));
  const second = await ensureVideoCover(video, path.join(root, "support"));
  assert.equal(first, second);
  assert.ok(first);
  assert.ok((await fs.stat(first)).size > 0);
});
