import { NextResponse } from "next/server";
import { mkdtemp, readFile, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import ytdlp from "yt-dlp-exec";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONTENT_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  webm: "video/webm",
  mp4: "video/mp4",
  mkv: "video/x-matroska",
};

export async function POST(request: Request) {
  let body: { url?: string; audioOnly?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const url = body.url?.trim();
  const audioOnly = Boolean(body.audioOnly);

  if (!url) {
    return NextResponse.json({ error: "URL을 입력하세요." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "유효한 URL이 아닙니다." }, { status: 400 });
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "유효한 URL이 아닙니다." }, { status: 400 });
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "ytdl-"));

  try {
    await ytdlp(url, {
      output: path.join(workDir, "%(title)s.%(ext)s"),
      noPlaylist: true,
      noCheckCertificate: true,
      noWarnings: true,
      restrictFilenames: true,
      ffmpegLocation: ffmpegPath as string,
      extractorArgs: "youtube:player_client=android,web",
      ...(audioOnly
        ? { extractAudio: true, audioFormat: "mp3", format: "bestaudio/best" }
        : { format: "bestvideo+bestaudio/best" }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const files = await readdir(workDir);
    if (files.length === 0) {
      return NextResponse.json(
        { error: "다운로드된 파일을 찾을 수 없습니다." },
        { status: 500 }
      );
    }

    const outputFile = files[0];
    const buffer = await readFile(path.join(workDir, outputFile));
    const ext = path.extname(outputFile).slice(1).toLowerCase();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${outputFile}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "다운로드 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
