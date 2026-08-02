import { NextResponse } from "next/server";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { analyzeSilence, computeAutoSplitPoints } from "@/lib/audio-split";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "분석할 mp3 파일을 선택하세요." }, { status: 400 });
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "detect-"));
  const inputPath = path.join(workDir, `input${path.extname(file.name) || ".mp3"}`);

  try {
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    const { duration, silences } = await analyzeSilence(inputPath);
    const points = computeAutoSplitPoints(duration, silences);

    if (points.length <= 1) {
      return NextResponse.json(
        {
          error:
            "곡 사이 무음 구간을 찾지 못했습니다. 곡 사이에 끊김이 없거나 소리가 겹치면 자동 감지가 어려워요. 직접 입력 방식을 사용해보세요.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ tracks: points });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "무음 구간 분석 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
