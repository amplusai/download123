import { NextResponse } from "next/server";
import { mkdir } from "fs/promises";
import path from "path";
import ytdlp from "yt-dlp-exec";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { url?: string; directory?: string; audioOnly?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const url = body.url?.trim();
  const directory = body.directory?.trim();
  const audioOnly = Boolean(body.audioOnly);

  if (!url || !directory) {
    return NextResponse.json(
      { error: "URL과 다운로드 디렉토리를 모두 입력하세요." },
      { status: 400 }
    );
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

  try {
    await mkdir(directory, { recursive: true });
  } catch {
    return NextResponse.json(
      { error: `디렉토리를 생성할 수 없습니다: ${directory}` },
      { status: 400 }
    );
  }

  try {
    const result = await ytdlp(url, {
      output: path.join(directory, "%(title)s.%(ext)s"),
      noPlaylist: true,
      noCheckCertificate: true,
      noWarnings: true,
      ffmpegLocation: ffmpegPath as string,
      ...(audioOnly
        ? { extractAudio: true, audioFormat: "mp3", format: "bestaudio/best" }
        : { format: "bestvideo+bestaudio/best" }),
    });

    return NextResponse.json({ ok: true, output: String(result) });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "다운로드 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
