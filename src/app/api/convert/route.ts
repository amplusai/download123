import { NextResponse } from "next/server";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "변환할 파일을 선택하세요." }, { status: 400 });
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "convert-"));
  const originalName = file.name || "input";
  const baseName = path.basename(originalName, path.extname(originalName)) || "output";
  const inputPath = path.join(workDir, `input${path.extname(originalName)}`);
  const outputPath = path.join(workDir, "output.mp3");

  try {
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "2",
      outputPath,
    ]);

    const outBuffer = await readFile(outputPath);
    const downloadName = `${baseName}.mp3`.replace(/[\\/:*?"<>|]/g, "_");

    return new NextResponse(outBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Content-Length": String(outBuffer.length),
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "변환 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
