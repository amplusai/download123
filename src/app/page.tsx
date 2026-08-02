"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileVideo,
  Link2,
  Loader2,
  Music,
  Plus,
  Scissors,
  SquarePlay,
  Trash2,
  X,
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

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1] : null;
}

async function triggerBrowserDownload(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const filename =
    filenameFromContentDisposition(res.headers.get("Content-Disposition")) ?? fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

type Toast = { type: "success" | "error"; message: string };

function ToastBanner({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div
      className={`pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-2xl ring-1 ${
        toast.type === "success"
          ? "bg-emerald-600 text-white ring-emerald-500"
          : "bg-red-600 text-white ring-red-500"
      }`}
    >
      {toast.type === "success" ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="rounded-md p-0.5 opacity-80 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

const URL_INPUT_COUNT = 5;

type SplitTrack = { start: string; title: string };

const emptySplitTracks = (): SplitTrack[] => [
  { start: "", title: "" },
  { start: "", title: "" },
];

export default function Home() {
  const [urls, setUrls] = useState<string[]>(Array(URL_INPUT_COUNT).fill(""));
  const [audioOnly, setAudioOnly] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<Status>({ state: "idle" });

  const [file, setFile] = useState<File | null>(null);
  const [convertStatus, setConvertStatus] = useState<Status>({ state: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [splitFile, setSplitFile] = useState<File | null>(null);
  const [splitMode, setSplitMode] = useState<"auto" | "manual">("auto");
  const [splitTracks, setSplitTracks] = useState<SplitTrack[]>(emptySplitTracks());
  const [splitStatus, setSplitStatus] = useState<Status>({ state: "idle" });
  const splitFileInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<Toast | null>(null);

  const isDownloading = downloadStatus.state === "loading";
  const isConverting = convertStatus.state === "loading";
  const isSplitting = splitStatus.state === "loading";
  const filledUrls = urls.map((u) => u.trim()).filter(Boolean);
  const validSplitTracks = splitTracks.filter(
    (t) => t.start.trim() && t.title.trim()
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const setUrlAt = (index: number, value: string) => {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  };

  const handleDownloadClick = async () => {
    if (filledUrls.length === 0 || isDownloading) return;

    setDownloadStatus({ state: "loading" });
    let successCount = 0;
    const failed: string[] = [];

    for (const trimmedUrl of filledUrls) {
      try {
        const res = await fetch("/api/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmedUrl, audioOnly }),
        });

        if (!res.ok) {
          failed.push(trimmedUrl);
          continue;
        }

        await triggerBrowserDownload(res, audioOnly ? "download.mp3" : "download.mp4");
        successCount += 1;
      } catch {
        failed.push(trimmedUrl);
      }
    }

    if (failed.length === 0) {
      const message = `다운로드 완료! ${audioOnly ? "MP3" : "영상"} ${successCount}개를 내려받았습니다.`;
      setDownloadStatus({ state: "success", message });
      setToast({ type: "success", message });
      setUrls(Array(URL_INPUT_COUNT).fill(""));
    } else {
      const message = `${successCount}개 성공, ${failed.length}개 실패했습니다.`;
      setDownloadStatus({ state: "error", message });
      setToast({ type: "error", message });
    }
  };

  const handleConvertClick = async () => {
    if (!file || isConverting) return;

    setConvertStatus({ state: "loading" });
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/convert", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setConvertStatus({ state: "error", message: data?.error ?? "변환에 실패했습니다." });
        return;
      }

      await triggerBrowserDownload(res, "converted.mp3");
      setConvertStatus({
        state: "success",
        message: "MP3 변환이 완료되어 다운로드가 시작되었습니다.",
      });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setConvertStatus({ state: "error", message: "서버와 통신할 수 없습니다." });
    }
  };

  const setSplitTrackAt = (index: number, field: keyof SplitTrack, value: string) => {
    setSplitTracks((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const addSplitTrackRow = () => {
    setSplitTracks((prev) => [...prev, { start: "", title: "" }]);
  };

  const removeSplitTrackRow = (index: number) => {
    setSplitTracks((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleSplitClick = async () => {
    if (!splitFile || isSplitting) return;
    if (splitMode === "manual" && validSplitTracks.length === 0) return;

    setSplitStatus({ state: "loading" });

    try {
      let points: { seconds: number; title: string }[];

      if (splitMode === "auto") {
        const detectForm = new FormData();
        detectForm.append("file", splitFile);
        const detectRes = await fetch("/api/split/detect", {
          method: "POST",
          body: detectForm,
        });
        const detectData = await detectRes.json().catch(() => null);
        if (!detectRes.ok) {
          const message = detectData?.error ?? "무음 구간 분석에 실패했습니다.";
          setSplitStatus({ state: "error", message });
          setToast({ type: "error", message });
          return;
        }
        points = detectData.tracks;
      } else {
        points = validSplitTracks
          .map((t) => ({ seconds: parseTimeToSeconds(t.start), title: t.title }))
          .filter((t): t is { seconds: number; title: string } => t.seconds !== null)
          .sort((a, b) => a.seconds - b.seconds);

        if (points.length === 0) {
          const message = "시작 시간을 올바르게 입력하세요. (예: 1:23)";
          setSplitStatus({ state: "error", message });
          setToast({ type: "error", message });
          return;
        }
      }

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < points.length; i++) {
        const { seconds, title } = points[i];
        const nextSeconds = i + 1 < points.length ? points[i + 1].seconds : null;

        const cutForm = new FormData();
        cutForm.append("file", splitFile);
        cutForm.append("start", String(seconds));
        if (nextSeconds !== null) cutForm.append("end", String(nextSeconds));
        cutForm.append("title", title);
        cutForm.append("index", String(i + 1));

        try {
          const res = await fetch("/api/split/cut", { method: "POST", body: cutForm });
          if (!res.ok) {
            failCount += 1;
            continue;
          }
          await triggerBrowserDownload(res, `${title}.mp3`);
          successCount += 1;
        } catch {
          failCount += 1;
        }
      }

      if (failCount === 0) {
        const message = `분할 완료! ${successCount}개 파일을 다운로드 폴더에 저장했습니다.`;
        setSplitStatus({ state: "success", message });
        setToast({ type: "success", message });
        setSplitFile(null);
        setSplitTracks(emptySplitTracks());
        if (splitFileInputRef.current) splitFileInputRef.current.value = "";
      } else {
        const message = `${successCount}개 성공, ${failCount}개 실패했습니다.`;
        setSplitStatus({ state: "error", message });
        setToast({ type: "error", message });
      }
    } catch {
      setSplitStatus({ state: "error", message: "서버와 통신할 수 없습니다." });
    }
  };

  return (
    <div className="relative flex flex-1 flex-col items-center overflow-hidden bg-zinc-50 px-4 py-16 font-sans dark:bg-zinc-950">
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
        {toast && (
          <div className="w-full max-w-sm">
            <ToastBanner toast={toast} onClose={() => setToast(null)} />
          </div>
        )}
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-red-300/30 via-fuchsia-300/20 to-violet-300/30 blur-3xl dark:from-red-900/20 dark:via-fuchsia-900/10 dark:to-violet-900/20"
      />

      <header className="relative z-10 mb-10 flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/20">
          <SquarePlay className="h-6 w-6 text-white" strokeWidth={2} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          다운로드123
        </h1>
        <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
          URL을 붙여넣으면 영상이나 MP3를 브라우저로 바로 다운로드합니다.
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
                URL을 입력하면 브라우저로 다운로드됩니다
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                URL (최대 {URL_INPUT_COUNT}개)
              </label>
              {urls.map((value, index) => (
                <div key={index} className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    id={index === 0 ? "url" : undefined}
                    type="url"
                    value={value}
                    onChange={(e) => setUrlAt(index, e.target.value)}
                    placeholder={`https://www.youtube.com/watch?v=... (${index + 1})`}
                    disabled={isDownloading}
                    className={`${inputClass} pl-9`}
                  />
                </div>
              ))}
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
              disabled={filledUrls.length === 0 || isDownloading}
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
                  다운로드{filledUrls.length > 1 ? ` (${filledUrls.length}개)` : ""}
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
                htmlFor="file"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                변환할 파일
              </label>
              <label
                htmlFor="file"
                className={`flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3.5 py-3 text-sm transition-colors ${
                  file
                    ? "border-violet-300 bg-violet-50/60 text-violet-700 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300"
                    : "border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500"
                } ${isConverting ? "pointer-events-none opacity-60" : ""}`}
              >
                <FileVideo className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {file ? file.name : "webm, mp4 등 동영상 파일 선택"}
                </span>
                <input
                  ref={fileInputRef}
                  id="file"
                  type="file"
                  accept="video/*,.webm,.mp4,.mkv,.mov,.avi"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={isConverting}
                  className="sr-only"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={handleConvertClick}
              disabled={!file || isConverting}
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

        <section className="rounded-3xl border border-zinc-200/80 bg-white/80 p-8 shadow-xl shadow-zinc-200/50 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Scissors className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                MP3 노래별 분할
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                여러 곡이 이어진 MP3를 곡별로 나눠 개별 파일로 다운로드하세요
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="splitFile"
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                분할할 MP3 파일
              </label>
              <label
                htmlFor="splitFile"
                className={`flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3.5 py-3 text-sm transition-colors ${
                  splitFile
                    ? "border-amber-300 bg-amber-50/60 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                    : "border-zinc-300 text-zinc-500 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500"
                } ${isSplitting ? "pointer-events-none opacity-60" : ""}`}
              >
                <Music className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {splitFile ? splitFile.name : "여러 곡이 담긴 mp3 파일 선택"}
                </span>
                <input
                  ref={splitFileInputRef}
                  id="splitFile"
                  type="file"
                  accept="audio/*,.mp3"
                  onChange={(e) => setSplitFile(e.target.files?.[0] ?? null)}
                  disabled={isSplitting}
                  className="sr-only"
                />
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                분할 방식
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSplitMode("auto")}
                  disabled={isSplitting}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    splitMode === "auto"
                      ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-300"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400"
                  }`}
                >
                  자동 (무음 감지)
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("manual")}
                  disabled={isSplitting}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    splitMode === "manual"
                      ? "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-300"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400"
                  }`}
                >
                  직접 입력
                </button>
              </div>
              {splitMode === "auto" && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  곡 사이의 무음 구간을 자동으로 찾아 나눕니다. 곡끼리 끊김 없이 이어지면 정확하지 않을 수 있어요.
                </p>
              )}
            </div>

            {splitMode === "manual" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                곡 목록 (시작 시간, 제목)
              </label>
              {splitTracks.map((track, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={track.start}
                    onChange={(e) => setSplitTrackAt(index, "start", e.target.value)}
                    placeholder="0:00"
                    disabled={isSplitting}
                    className={`${inputClass} w-20 shrink-0`.replace("w-full", "")}
                  />
                  <input
                    type="text"
                    value={track.title}
                    onChange={(e) => setSplitTrackAt(index, "title", e.target.value)}
                    placeholder={`${index + 1}번째 곡 제목`}
                    disabled={isSplitting}
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => removeSplitTrackRow(index)}
                    disabled={isSplitting || splitTracks.length <= 1}
                    aria-label="곡 삭제"
                    className="shrink-0 rounded-lg p-2 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSplitTrackRow}
                disabled={isSplitting}
                className="flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-400 dark:hover:bg-amber-950/40"
              >
                <Plus className="h-4 w-4" />곡 추가
              </button>
            </div>
            )}

            <button
              type="button"
              onClick={handleSplitClick}
              disabled={
                !splitFile ||
                isSplitting ||
                (splitMode === "manual" && validSplitTracks.length === 0)
              }
              className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-amber-500/25 transition-all hover:shadow-lg hover:shadow-amber-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {isSplitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  분할 중...
                </>
              ) : (
                <>
                  <Scissors className="h-4 w-4" />
                  곡별로 분할
                </>
              )}
            </button>
          </div>

          {splitStatus.state !== "idle" && splitStatus.state !== "loading" && (
            <div className="mt-4">
              <StatusBanner status={splitStatus} />
            </div>
          )}
        </section>
      </div>

      <footer className="relative z-10 mt-10 text-xs text-zinc-400 dark:text-zinc-600">
        yt-dlp · ffmpeg 기반
      </footer>
    </div>
  );
}
