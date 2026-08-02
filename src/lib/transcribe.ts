import { spawn } from "child_process";
import { tmpdir } from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";

const WINDOW_SECONDS = 8;
const TITLE_MAX_CHARS = 30;
// Scan several windows across the start of the track looking for vocals,
// since many songs open with an instrumental intro. Fast-seek (-ss before
// -i) keeps each probe cheap even on long files.
const SCAN_OFFSETS_SEC = [0, 8, 16, 24, 32, 45, 60];
// Cap full-lyrics scanning to a reasonable ceiling (a typical song length)
// so a multi-hour file can't turn into an unbounded number of windows.
const MAX_FULL_SCAN_SECONDS = 8 * 60;

function getAudioDuration(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    // `ffmpeg -i <file>` with no output prints the input's Duration to
    // stderr and exits non-zero (no output specified) — that's fine, we
    // only want the header info, not to decode anything.
    const proc = spawn(ffmpegPath as string, ["-i", inputPath]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", () => resolve(0));
    proc.on("close", () => {
      const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
      if (!match) {
        resolve(0);
        return;
      }
      resolve(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
    });
  });
}

function extractPcmWindow(inputPath: string, offsetSeconds: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, [
      "-ss",
      String(offsetSeconds),
      "-i",
      inputPath,
      "-t",
      String(WINDOW_SECONDS),
      "-ar",
      "16000",
      "-ac",
      "1",
      "-f",
      "f32le",
      "-",
    ]);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg가 코드 ${code}로 종료되었습니다.`));
        return;
      }
      const buffer = Buffer.concat(chunks);
      const floatCount = Math.floor(buffer.length / 4);
      const aligned = buffer.subarray(0, floatCount * 4);
      resolve(new Float32Array(aligned.buffer, aligned.byteOffset, floatCount));
    });
  });
}

type Transcriber = (
  audio: Float32Array,
  options?: Record<string, unknown>
) => Promise<{ text: string }>;

// Lazily loaded and cached across warm invocations of the same serverless instance.
let transcriberPromise: Promise<Transcriber> | null = null;

async function getTranscriber(): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.cacheDir = path.join(tmpdir(), "transformers-cache");
      const transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
      return transcriber as unknown as Transcriber;
    })();
  }
  return transcriberPromise;
}

function cleanTranscript(text: string): string {
  return text
    .trim()
    // Whisper emits bracketed non-speech tags like "(upbeat music)" or
    // "[Music]" for instrumental sections; strip those out so an
    // instrumental window can't masquerade as recognized vocals.
    .replace(/[([][^)\]]*[)\]]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "");
}

async function transcribeWindow(
  transcriber: Transcriber,
  inputPath: string,
  offsetSeconds: number
): Promise<string | null> {
  const pcm = await extractPcmWindow(inputPath, offsetSeconds);
  if (pcm.length === 0) return null; // seeked past the end of the file

  const result = await transcriber(pcm, {
    chunk_length_s: WINDOW_SECONDS,
    // whisper-tiny's language auto-detection frequently misfires on
    // sung/musical audio and silently returns an empty transcript, so
    // force English rather than auto-detect. Non-English lyrics will
    // be transcribed poorly, but that beats no output at all.
    language: "english",
    task: "transcribe",
  });

  return cleanTranscript(result.text ?? "");
}

/**
 * Best-effort: scans a handful of windows across the start of the track
 * (to skip past instrumental intros) and transcribes each with Whisper,
 * using its own silence/no-speech detection as a cheap vocal-vs-instrument
 * classifier — the first window that yields real recognized text wins.
 * Returns "" if no window produced usable text, so callers can fall back
 * to a generic name.
 */
export async function guessTitleFromAudio(inputPath: string): Promise<string> {
  let transcriber: Transcriber;
  try {
    transcriber = await getTranscriber();
  } catch (err) {
    console.error("guessTitleFromAudio: failed to load model:", err);
    return "";
  }

  for (const offset of SCAN_OFFSETS_SEC) {
    try {
      const text = await transcribeWindow(transcriber, inputPath, offset);
      if (text === null) break; // seeked past the end of the file
      if (text) return text.slice(0, TITLE_MAX_CHARS);
    } catch (err) {
      console.error(`guessTitleFromAudio: window at ${offset}s failed:`, err);
    }
  }

  return "";
}

/**
 * Best-effort: transcribes the whole track (capped at MAX_FULL_SCAN_SECONDS)
 * in consecutive windows and stitches the recognized text together, so the
 * full lyrics come back instead of just whatever the first vocal window
 * caught. Instrumental-only windows are skipped. Returns "" if no window
 * produced usable text.
 */
export async function transcribeVocalsText(inputPath: string): Promise<string> {
  let transcriber: Transcriber;
  try {
    transcriber = await getTranscriber();
  } catch (err) {
    console.error("transcribeVocalsText: failed to load model:", err);
    return "";
  }

  const duration = await getAudioDuration(inputPath);
  const scanLimit = duration > 0 ? Math.min(duration, MAX_FULL_SCAN_SECONDS) : MAX_FULL_SCAN_SECONDS;

  const lines: string[] = [];
  for (let offset = 0; offset < scanLimit; offset += WINDOW_SECONDS) {
    try {
      const text = await transcribeWindow(transcriber, inputPath, offset);
      if (text === null) break; // seeked past the end of the file
      if (text) lines.push(text);
    } catch (err) {
      console.error(`transcribeVocalsText: window at ${offset}s failed:`, err);
    }
  }

  return lines.join(" ");
}
