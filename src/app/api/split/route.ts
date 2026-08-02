import { NextResponse } from "next/server";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { createWriteStream } from "fs";
import { tmpdir } from "os";
import path from "path";
import { spawn } from "child_process";
import { ZipArchive } from "archiver";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";
export const maxDuration = 60;

type Track = { start: string; title: string };

function parseTimeToSeconds(input: string): number | null {
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

function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  return (trimmed || "track").replace(/[\\/:*?"<>|]/g, "_");
}

function runFfmpeg(args: string[]) {
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

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const tracksRaw = formData.get("tracks");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "분할할 mp3 파일을 선택하세요." }, { status: 400 });
  }
  if (typeof tracksRaw !== "string") {
    return NextResponse.json({ error: "곡 목록이 없습니다." }, { status: 400 });
  }

  let rawTracks: Track[];
  try {
    rawTracks = JSON.parse(tracksRaw);
  } catch {
    return NextResponse.json({ error: "곡 목록 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
    return NextResponse.json({ error: "곡을 1개 이상 입력하세요." }, { status: 400 });
  }

  const parsed = rawTracks.map((t) => ({
    seconds: parseTimeToSeconds(String(t.start ?? "")),
    title: sanitizeFilename(String(t.title ?? "")),
  }));

  const invalidIndex = parsed.findIndex((t) => t.seconds === null || t.seconds < 0);
  if (invalidIndex !== -1) {
    return NextResponse.json(
      { error: `${invalidIndex + 1}번째 곡의 시작 시간이 올바르지 않습니다. (예: 1:23)` },
      { status: 400 }
    );
  }

  const sorted = [...(parsed as { seconds: number; title: string }[])].sort(
    (a, b) => a.seconds - b.seconds
  );

  const workDir = await mkdtemp(path.join(tmpdir(), "split-"));
  const inputPath = path.join(workDir, `input${path.extname(file.name) || ".mp3"}`);

  try {
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    const outputFiles: string[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const { seconds, title } = sorted[i];
      const nextSeconds = i + 1 < sorted.length ? sorted[i + 1].seconds : null;
      const outputName = `${String(i + 1).padStart(2, "0")}_${title}.mp3`;
      const outputPath = path.join(workDir, outputName);

      const args = ["-y", "-i", inputPath, "-ss", String(seconds)];
      if (nextSeconds !== null) {
        args.push("-to", String(nextSeconds));
      }
      args.push("-vn", "-acodec", "libmp3lame", "-q:a", "2", outputPath);

      await runFfmpeg(args);
      outputFiles.push(outputPath);
    }

    const zipPath = path.join(workDir, "tracks.zip");
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = new ZipArchive({ zlib: { level: 9 } });
      output.on("close", () => resolve());
      archive.on("error", (err: Error) => reject(err));
      archive.pipe(output);
      for (const filePath of outputFiles) {
        archive.file(filePath, { name: path.basename(filePath) });
      }
      archive.finalize();
    });

    const zipBuffer = await readFile(zipPath);

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="tracks.zip"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "분할 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
