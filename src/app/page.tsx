"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FolderInput,
  Link2,
  Loader2,
  Music,
  SquarePlay,
} from "lucide-react";

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "success"; message: string }
  | { state: "error"; message: string };

const inputClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-700";

function StatusBanner({ status }: { status: Status }) {
  if (status.state === "success") {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 dark:ring-emerald-900">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{status.message}</span>
      </div>
    );
  }
  if (status.state === "error") {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100 dark:bg-red-950/50 dark:text-red-400 dark:ring-red-900">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{status.message}</span>
      </div>
    );
  }
  return null;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [directory, setDirectory] = useState("");
  const [audioOnly, setAudioOnly] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<Status>({ state: "idle" });

  const [filePath, setFilePath] = useState("");
  const [outputDirectory, setOutputDirectory] = useState("");
  const [convertStatus, setConvertStatus] = useState<Status>({ state: "idle" });

  const isDownloading = downloadStatus.state === "loading";
  const isConverting = convertStatus.state === "loading";

  const handleDownloadClick = async () => {
    const trimmedUrl = url.trim();
    const trimmedDirectory = directory.trim();
    if (!trimmedUrl || !trimmedDirectory || isDownloading) return;

    setDownloadStatus({ state: "loading" });
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl, directory: trimmedDirectory, audioOnly }),
      });
      const data = await res.json();

      if (!res.ok) {
        setDownloadStatus({ state: "error", message: data.error ?? "다운로드에 실패했습니다." });
        return;
      }
      setDownloadStatus({
        state: "success",
        message: `${audioOnly ? "MP3" : "영상"} 다운로드가 완료되었습니다. (저장 위치: ${trimmedDirectory})`,
      });
    } catch {
      setDownloadStatus({ state: "error", message: "서버와 통신할 수 없습니다." });
    }
  };

  const handleConvertClick = async () => {
    const trimmedFilePath = filePath.trim();
    const trimmedOutputDirectory = outputDirectory.trim();
    if (!trimmedFilePath || isConverting) return;

    setConvertStatus({ state: "loading" });
    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: trimmedFilePath,
          outputDirectory: trimmedOutputDirectory || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setConvertStatus({ state: "error", message: data.error ?? "변환에 실패했습니다." });
        return;
      }
      setConvertStatus({
        state: "success",
        message: `MP3 변환이 완료되었습니다. (저장 위치: ${data.outputPath})`,
      });
    } catch {
      setConvertStatus({ state: "error", message: "서버와 통신할 수 없습니다." });
    }
  };

  return (
    <div className="relative flex flex-1 flex-col items-center overflow-hidden bg-zinc-50 px-4 py-16 font-sans dark:bg-zinc-950">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-red-300/30 via-fuchsia-300/20 to-violet-300/30 blur-3xl dark:from-red-900/20 dark:via-fuchsia-900/10 dark:to-violet-900/20"
      />

      <header className="relative z-10 mb-10 flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/20">
          <SquarePlay className="h-6 w-6 text-white" strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          다운로더123
        </h1>
        <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
          URL을 붙여넣고 원하는 위치에 영상이나 MP3로 저장하세요.
        </p>
      </header>

      <div className="relative z-10 flex w-full max-w-xl flex-col gap-6">
        <section className="rounded-3xl border border-zinc-200/80 bg-white/80 p-8 shadow-xl shadow-zinc-200/50 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <Download className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                영상 다운로드
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                URL과 저장 디렉토리를 입력하세요
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="url"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                URL
              </label>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  id="url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={isDownloading}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="directory"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                다운로드 디렉토리
              </label>
              <div className="relative">
                <FolderInput className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  id="directory"
                  type="text"
                  value={directory}
                  onChange={(e) => setDirectory(e.target.value)}
                  placeholder="예: C:\Users\me\Downloads"
                  disabled={isDownloading}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>

            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={audioOnly}
                onChange={(e) => setAudioOnly(e.target.checked)}
                disabled={isDownloading}
                className="h-4 w-4 rounded border-zinc-300 text-red-600 focus:ring-red-500 dark:border-zinc-600"
              />
              MP3로 다운로드 (오디오만)
            </label>

            <button
              type="button"
              onClick={handleDownloadClick}
              disabled={!url.trim() || !directory.trim() || isDownloading}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-red-500/25 transition-all hover:shadow-lg hover:shadow-red-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  다운로드 중...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  다운로드
                </>
              )}
            </button>
          </div>

          {downloadStatus.state !== "idle" && downloadStatus.state !== "loading" && (
            <div className="mt-4">
              <StatusBanner status={downloadStatus} />
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-zinc-200/80 bg-white/80 p-8 shadow-xl shadow-zinc-200/50 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
              <Music className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                동영상 → MP3 변환
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                가지고 있는 webm, mp4 파일을 MP3로 변환하세요
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="filePath"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                변환할 파일 경로
              </label>
              <input
                id="filePath"
                type="text"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                placeholder="예: C:\Users\me\Downloads\video.webm"
                disabled={isConverting}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="outputDirectory"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                저장 디렉토리 (선택, 비워두면 원본과 같은 위치)
              </label>
              <input
                id="outputDirectory"
                type="text"
                value={outputDirectory}
                onChange={(e) => setOutputDirectory(e.target.value)}
                placeholder="예: C:\Users\me\Music"
                disabled={isConverting}
                className={inputClass}
              />
            </div>

            <button
              type="button"
              onClick={handleConvertClick}
              disabled={!filePath.trim() || isConverting}
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-violet-500/25 transition-all hover:shadow-lg hover:shadow-violet-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {isConverting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  변환 중...
                </>
              ) : (
                <>
                  <Music className="h-4 w-4" />
                  MP3로 변환
                </>
              )}
            </button>
          </div>

          {convertStatus.state !== "idle" && convertStatus.state !== "loading" && (
            <div className="mt-4">
              <StatusBanner status={convertStatus} />
            </div>
          )}
        </section>
      </div>

      <footer className="relative z-10 mt-10 text-xs text-zinc-400 dark:text-zinc-600">
        yt-dlp · ffmpeg 기반 · 로컬에서만 동작합니다
      </footer>
    </div>
  );
}
