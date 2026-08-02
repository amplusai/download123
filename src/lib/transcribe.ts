import { spawn } from "child_process";
import { tmpdir } from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";

const SNIPPET_SECONDS = 8;
const TITLE_MAX_CHARS = 15;

function extractPcmSnippet(inputPath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, [
      "-i",
      inputPath,
      "-t",
      String(SNIPPET_SECONDS),
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

// Lazily loaded and cached across warm invocations of the same serverless instance.
let transcriberPromise: Promise<
  (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string }>
> | null = null;

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.cacheDir = path.join(tmpdir(), "transformers-cache");
      const transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny");
      return transcriber as unknown as (
        audio: Float32Array,
        options?: Record<string, unknown>
      ) => Promise<{ text: string }>;
    })();
  }
  return transcriberPromise;
}

function deriveTitleFromText(text: string): string {
  const cleaned = text
    .trim()
    // Whisper emits bracketed non-speech tags like "(upbeat music)" or
    // "[Music]" for instrumental sections; strip those out so they don't
    // masquerade as a real title.
    .replace(/[([][^)\]]*[)\]]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "");
  if (!cleaned) return "";
  return cleaned.slice(0, TITLE_MAX_CHARS);
}

/**
 * Best-effort: transcribes the first few seconds of an audio file and returns
 * a short title derived from the recognized lyrics. Returns "" on any failure
 * (missing/garbled speech, model load failure, etc.) so callers can fall back.
 */
export async function guessTitleFromAudio(inputPath: string): Promise<string> {
  try {
    const pcm = await extractPcmSnippet(inputPath);
    if (pcm.length === 0) return "";

    const transcriber = await getTranscriber();
    // whisper-tiny's language auto-detection frequently misfires on sung/
    // musical audio and silently returns an empty transcript, so force
    // English rather than auto-detect. Non-English lyrics will be
    // transcribed poorly, but that beats always falling back to "Track N".
    const result = await transcriber(pcm, {
      chunk_length_s: SNIPPET_SECONDS,
      language: "english",
      task: "transcribe",
    });
    return deriveTitleFromText(result.text ?? "");
  } catch (err) {
    console.error("guessTitleFromAudio failed:", err);
    return "";
  }
}
