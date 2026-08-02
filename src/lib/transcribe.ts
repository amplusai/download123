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

function deriveTitleFromText(text: string): string {
  const cleaned = text
    .trim()
    // Whisper emits bracketed non-speech tags like "(upbeat music)" or
    // "[Music]" for instrumental sections; strip those out so an
    // instrumental window can't masquerade as a real title.
    .replace(/[([][^)\]]*[)\]]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "");
  if (!cleaned) return "";
  return cleaned.slice(0, TITLE_MAX_CHARS);
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
      const pcm = await extractPcmWindow(inputPath, offset);
      if (pcm.length === 0) break; // seeked past the end of the file

      const result = await transcriber(pcm, {
        chunk_length_s: WINDOW_SECONDS,
        // whisper-tiny's language auto-detection frequently misfires on
        // sung/musical audio and silently returns an empty transcript, so
        // force English rather than auto-detect. Non-English lyrics will
        // be transcribed poorly, but that beats no output at all.
        language: "english",
        task: "transcribe",
      });

      const title = deriveTitleFromText(result.text ?? "");
      if (title) return title;
    } catch (err) {
      console.error(`guessTitleFromAudio: window at ${offset}s failed:`, err);
    }
  }

  return "";
}
