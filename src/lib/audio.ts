// Server-only media service. Uses the bundled ffmpeg binary (ffmpeg-static) so no
// system ffmpeg is required. Decodes PCM for RMS analysis, probes stream layout,
// extracts video posters and cuts audio/video fragments for the render.
import "server-only";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";
import { selectActiveSnippet, type Snippet } from "./domain/rms";

const FFMPEG = ffmpegPath as unknown as string;
/** Low sample rate is plenty for energy analysis and keeps decoding fast. */
const ANALYSIS_RATE = 8000;

function run(args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (d) => out.push(d));
    proc.stderr.on("data", (d) => err.push(d));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString()}`));
    });
    if (input) {
      proc.stdin.write(input);
      proc.stdin.end();
    }
  });
}

/** Probe a media file's duration in seconds (parsed from ffmpeg output). */
export function probeDurationSec(inputPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    // `ffmpeg -i <file>` with no output exits non-zero but prints "Duration:".
    const proc = spawn(FFMPEG, ["-i", inputPath], { stdio: ["ignore", "ignore", "pipe"] });
    const err: Buffer[] = [];
    proc.stderr.on("data", (d) => err.push(d));
    proc.on("error", () => resolve(null));
    proc.on("close", () => {
      const text = Buffer.concat(err).toString();
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
      if (!m) return resolve(null);
      const [, h, min, s] = m;
      resolve(Number(h) * 3600 + Number(min) * 60 + Number(s));
    });
  });
}

export interface MediaInfo {
  durationSec: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
}

/**
 * Probe a media file's stream layout via ffmpeg stderr. Cover art embedded in
 * audio files shows up as an "attached pic" video stream and is not counted.
 */
export function probeMediaInfo(inputPath: string): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG, ["-i", inputPath], { stdio: ["ignore", "ignore", "pipe"] });
    const err: Buffer[] = [];
    proc.stderr.on("data", (d) => err.push(d));
    proc.on("error", () => resolve({ durationSec: null, hasAudio: false, hasVideo: false }));
    proc.on("close", () => {
      const text = Buffer.concat(err).toString();
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
      const durationSec = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
      const streams = text.split("\n").filter((l) => /Stream #\d+/.test(l));
      resolve({
        durationSec,
        hasAudio: streams.some((l) => /:\s*Audio:/.test(l)),
        hasVideo: streams.some((l) => /:\s*Video:/.test(l) && !l.includes("attached pic")),
      });
    });
  });
}

/** Extract a poster frame (jpg). Seeks ~0.5s in; falls back to the first frame. */
export async function extractPoster(inputPath: string, outputPath: string): Promise<void> {
  const wrote = async () =>
    ((await stat(outputPath).catch(() => null))?.size ?? 0) > 0;
  try {
    await run(["-y", "-ss", "0.5", "-i", inputPath, "-frames:v", "1", "-q:v", "3", outputPath]);
    if (await wrote()) return;
  } catch {
    // very short video: 0.5s seek lands past the end -> retry from frame 0
  }
  await run(["-y", "-i", inputPath, "-frames:v", "1", "-q:v", "3", outputPath]);
}

/** Decode a file to mono float32 PCM at ANALYSIS_RATE for RMS analysis. */
export async function decodePcm(
  inputPath: string,
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const raw = await run([
    "-i",
    inputPath,
    "-ac",
    "1",
    "-ar",
    String(ANALYSIS_RATE),
    "-f",
    "f32le",
    "-",
  ]);
  const samples = new Float32Array(
    raw.buffer,
    raw.byteOffset,
    Math.floor(raw.byteLength / 4),
  );
  return { samples, sampleRate: ANALYSIS_RATE };
}

/** Compute the most active snippet of `windowSec` seconds in a track. */
export async function findActiveSnippet(
  inputPath: string,
  windowSec: number,
): Promise<Snippet> {
  const { samples, sampleRate } = await decodePcm(inputPath);
  return selectActiveSnippet(samples, sampleRate, windowSec);
}

/** Cut [startSec, startSec+durationSec] from a track with in/out fades to a file. */
export async function clipAudio(
  inputPath: string,
  startSec: number,
  durationSec: number,
  outputPath: string,
  fadeSec = 1,
): Promise<void> {
  const outFadeStart = Math.max(0, durationSec - fadeSec);
  await run([
    "-y",
    "-ss",
    String(startSec),
    "-t",
    String(durationSec),
    "-i",
    inputPath,
    "-af",
    `afade=t=in:st=0:d=${fadeSec},afade=t=out:st=${outFadeStart}:d=${fadeSec}`,
    "-ac",
    "2",
    outputPath,
  ]);
}

/** Write `durationSec` of silence — the audio fallback for soundless video tracks. */
export async function writeSilence(durationSec: number, outputPath: string): Promise<void> {
  await run([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=44100:cl=stereo",
    "-t",
    String(durationSec),
    outputPath,
  ]);
}

/**
 * Cut [startSec, startSec+durationSec] of a video's footage to an H.264 mp4
 * (no audio — the composition always plays audio from its own <Audio> element).
 * Re-encodes for frame-accurate seeking and predictable playback in Chrome.
 */
export async function clipVideo(
  inputPath: string,
  startSec: number,
  durationSec: number,
  outputPath: string,
): Promise<void> {
  await run([
    "-y",
    "-ss",
    String(startSec),
    "-t",
    String(durationSec),
    "-i",
    inputPath,
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}
