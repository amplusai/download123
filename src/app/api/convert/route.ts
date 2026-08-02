import { NextResponse } from "next/server";
import { access, mkdir } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";

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
  let body: { filePath?: string; outputDirectory?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const filePath = body.filePath?.trim();
  const outputDirectory = body.outputDirectory?.trim();

  if (!filePath) {
    return NextResponse.json(
      { error: "변환할 파일 경로를 입력하세요." },
      { status: 400 }
    );
  }

  try {
    await access(filePath);
  } catch {
    return NextResponse.json(
      { error: `파일을 찾을 수 없습니다: ${filePath}` },
      { status: 400 }
    );
  }

  const targetDirectory = outputDirectory || path.dirname(filePath);

  try {
    await mkdir(targetDirectory, { recursive: true });
  } catch {
    return NextResponse.json(
      { error: `디렉토리를 생성할 수 없습니다: ${targetDirectory}` },
      { status: 400 }
    );
  }

  const baseName = path.basename(filePath, path.extname(filePath));
  const outputPath = path.join(targetDirectory, `${baseName}.mp3`);

  try {
    await runFfmpeg([
      "-y",
      "-i",
      filePath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-q:a",
      "2",
      outputPath,
    ]);
    return NextResponse.json({ ok: true, outputPath });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "변환 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
