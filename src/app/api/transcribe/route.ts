import { NextResponse } from "next/server";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { transcribeVocalsText } from "@/lib/transcribe";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "변환할 오디오 파일을 선택하세요." }, { status: 400 });
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "transcribe-"));
  const inputPath = path.join(workDir, `input${path.extname(file.name) || ".mp3"}`);

  try {
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(inputPath, Buffer.from(arrayBuffer));

    const text = await transcribeVocalsText(inputPath);
    if (!text) {
      return NextResponse.json(
        {
          error:
            "보컬을 인식하지 못했습니다. 반주만 있거나 음성이 불분명할 수 있어요.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "변환 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
