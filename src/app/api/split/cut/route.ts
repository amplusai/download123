import { NextResponse } from "next/server";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { parseTimeToSeconds, runFfmpeg, sanitizeFilename } from "@/lib/audio-split";
import { guessTitleFromAudio } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const startRaw = formData.get("start");
  const endRaw = formData.get("end");
  const titleRaw = formData.get("title");
  const indexRaw = formData.get("index");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "분할할 mp3 파일을 선택하세요." }, { status: 400 });
  }
  if (typeof startRaw !== "string") {
    return NextResponse.json({ error: "시작 시간이 없습니다." }, { status: 400 });
  }

  const start = parseTimeToSeconds(startRaw);
  if (start === null || start < 0) {
    return NextResponse.json(
      { error: `시작 시간이 올바르지 않습니다. (예: 1:23)` },
      { status: 400 }
    );
  }

  let end: number | null = null;
  if (typeof endRaw === "string" && endRaw.trim()) {
    end = parseTimeToSeconds(endRaw);
    if (end === null || end <= start) {
      return NextResponse.json({ error: "종료 시간이 올바르지 않습니다." }, { status: 400 });
    }
  }

  const clientTitle = typeof titleRaw === "string" ? titleRaw.trim() : "";
  const index = typeof indexRaw === "string" && indexRaw.trim() ? indexRaw.trim() : null;

  const workDir = await mkdtemp(path.join(tmpdir(), "cut-"));
  const inputPath = path.join(workDir, `input${path.extname(file.name) || ".mp3"}`);
  const outputPath = path.join(workDir, "output.mp3");

  try {
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    const args = ["-y", "-i", inputPath, "-ss", String(start)];
    if (end !== null) {
      args.push("-to", String(end));
    }
    args.push("-vn", "-acodec", "libmp3lame", "-q:a", "2", outputPath);

    await runFfmpeg(args);

    const lyricsTitle = await guessTitleFromAudio(outputPath);
    const resolvedTitle = lyricsTitle || clientTitle || `Track ${index ?? ""}`.trim();
    const title = sanitizeFilename(resolvedTitle);
    const outputName = index ? `${index.padStart(2, "0")}_${title}.mp3` : `${title}.mp3`;

    const buffer = await readFile(outputPath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "Content-Length": String(buffer.length),
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
