import "server-only";
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { absPath } from "@/lib/storage";
import {
  buildDownloadArgs,
  parseProgressLine,
  parseProbeJson,
  type DownloadMode,
  type ProbeResult,
} from "@/lib/domain/ytdlp-args";

// yt-dlp binary management + invocation (pattern from aandrew-me/ytdownloader:
// spawn the binary, -f selectors, progress from stdout, marker file for the
// final path). The system yt-dlp is often too old for current YouTube, so we
// keep our own fresh binary under storage/bin unless YTDLP_PATH overrides it.

const FFMPEG = ffmpegPath as unknown as string;
const BIN_REL = path.join("bin", "yt-dlp");
const RELEASE_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

let ensured: string | null = null;

/** Resolve the yt-dlp binary: env override -> storage/bin -> download release. */
export async function ensureYtDlp(): Promise<string> {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const local = absPath(BIN_REL);
  if (ensured === local && existsSync(local)) return local;
  if (!existsSync(local)) {
    await mkdir(path.dirname(local), { recursive: true });
    const res = await fetch(RELEASE_URL, { redirect: "follow" });
    if (!res.ok || !res.body) {
      throw new Error(`не удалось скачать yt-dlp (${res.status}) — задайте YTDLP_PATH`);
    }
    const tmp = `${local}.part`;
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
    await chmod(tmp, 0o755);
    const { rename } = await import("node:fs/promises");
    await rename(tmp, local);
  }
  ensured = local;
  return local;
}

/** `yt-dlp -U` (standalone releases self-update in place). Best-effort. */
export async function updateYtDlp(): Promise<void> {
  const bin = await ensureYtDlp();
  await new Promise<void>((resolve) => {
    const proc = spawn(bin, ["-U"], { stdio: "ignore" });
    proc.on("error", () => resolve());
    proc.on("close", () => resolve());
  });
}

function runCapture(
  bin: string,
  args: string[],
  onStdoutLine?: (line: string) => void,
  register?: (proc: ChildProcess) => void,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    register?.(proc);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let tail = "";
    proc.stdout.on("data", (d: Buffer) => {
      out.push(d);
      if (onStdoutLine) {
        tail += d.toString();
        const lines = tail.split("\n");
        tail = lines.pop() ?? "";
        for (const line of lines) onStdoutLine(line);
      }
    });
    proc.stderr.on("data", (d: Buffer) => err.push(d));
    proc.on("error", reject);
    proc.on("close", (code) =>
      resolve({
        code,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
      }),
    );
  });
}

/** Optional proxy for all yt-dlp traffic (VPN escape hatch for blocked CDNs). */
function proxyEnv(): string | null {
  return process.env.YTDLP_PROXY?.trim() || null;
}

/** Fetch metadata: title, duration, size estimate for the planned download. */
export async function probeUrl(
  url: string,
  mode: DownloadMode,
  quality: number,
): Promise<ProbeResult> {
  const bin = await ensureYtDlp();
  const proxy = proxyEnv();
  const { code, stdout, stderr } = await runCapture(bin, [
    "-J",
    "--no-playlist",
    "--socket-timeout",
    "15",
    ...(proxy ? ["--proxy", proxy] : []),
    "--",
    url,
  ]);
  if (code !== 0) {
    const e = new Error(stderr || "probe failed");
    (e as Error & { stderr: string }).stderr = stderr;
    throw e;
  }
  return parseProbeJson(JSON.parse(stdout), mode, quality);
}

export interface DownloadResult {
  filePath: string; // absolute path of the downloaded file
}

/**
 * Download the media into `dir`; resolves with the final file path (read from
 * the marker file yt-dlp writes after the merge/move step).
 */
export async function downloadMedia(opts: {
  url: string;
  mode: DownloadMode;
  quality: number;
  dir: string;
  maxBytes: number | null;
  onProgress?: (p: number) => void;
  register?: (proc: ChildProcess) => void;
}): Promise<DownloadResult> {
  const bin = await ensureYtDlp();
  await mkdir(opts.dir, { recursive: true });
  const markerFile = path.join(opts.dir, "final-path.txt");
  await rm(markerFile, { force: true });

  const args = buildDownloadArgs({
    url: opts.url,
    mode: opts.mode,
    quality: opts.quality,
    dir: opts.dir,
    markerFile,
    ffmpegPath: FFMPEG,
    maxBytes: opts.maxBytes,
    proxy: proxyEnv(),
  });

  const { code, stdout, stderr } = await runCapture(
    bin,
    args,
    (line) => {
      const p = parseProgressLine(line);
      if (p != null) opts.onProgress?.(p);
    },
    opts.register,
  );
  if (code !== 0) {
    const e = new Error(stderr || `yt-dlp exited ${code}`);
    (e as Error & { stderr: string }).stderr = `${stderr}\n${stdout}`;
    throw e;
  }

  const finalPath = (await readFile(markerFile, "utf8").catch(() => ""))
    .trim()
    .split("\n")
    .pop();
  if (!finalPath || !existsSync(finalPath)) {
    // --max-filesize skips are printed to STDOUT with exit code 0 — surface
    // both streams so the error classifier sees the real reason.
    const e = new Error("download produced no file");
    (e as Error & { stderr: string }).stderr = `${stderr}\n${stdout}`;
    throw e;
  }
  return { filePath: finalPath };
}
