import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

export const AUTO_SILENCE_DB = -30;
export const AUTO_MIN_SILENCE_SEC = 1;
export const AUTO_MIN_TRACK_SEC = 8;

export function parseTimeToSeconds(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || Number.isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}

export function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  return (trimmed || "track").replace(/[\\/:*?"<>|]/g, "_");
}

export function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      reject(new Error(`ffmpeg를 실행할 수 없습니다: ${err.message}`));
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg가 코드 ${code}로 종료되었습니다.`));
    });
  });
}

export function analyzeSilence(
  inputPath: string
): Promise<{ duration: number; silences: { start: number; end: number }[] }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, [
      "-i",
      inputPath,
      "-af",
      `silencedetect=noise=${AUTO_SILENCE_DB}dB:d=${AUTO_MIN_SILENCE_SEC}`,
      "-f",
      "null",
      "-",
    ]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      reject(new Error(`무음 구간 분석에 실패했습니다: ${err.message}`));
    });
    proc.on("close", () => {
      const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
      const duration = durationMatch
        ? Number(durationMatch[1]) * 3600 +
          Number(durationMatch[2]) * 60 +
          Number(durationMatch[3])
        : 0;

      const starts: number[] = [];
      const ends: number[] = [];
      for (const line of stderr.split("\n")) {
        const s = /silence_start:\s*([0-9.]+)/.exec(line);
        if (s) starts.push(Number(s[1]));
        const e = /silence_end:\s*([0-9.]+)/.exec(line);
        if (e) ends.push(Number(e[1]));
      }

      const silences = starts
        .map((start, i) => ({ start, end: ends[i] }))
        .filter((s): s is { start: number; end: number } => s.end !== undefined);

      resolve({ duration, silences });
    });
  });
}

export type SplitPoint = { seconds: number; title: string };

export function computeAutoSplitPoints(
  duration: number,
  silences: { start: number; end: number }[]
): SplitPoint[] {
  const boundaries = [0];
  for (const s of silences) {
    const mid = (s.start + s.end) / 2;
    const last = boundaries[boundaries.length - 1];
    if (mid - last >= AUTO_MIN_TRACK_SEC && duration - mid >= AUTO_MIN_TRACK_SEC) {
      boundaries.push(mid);
    }
  }
  return boundaries.map((seconds, i) => ({
    seconds,
    title: `Track ${String(i + 1).padStart(2, "0")}`,
  }));
}
