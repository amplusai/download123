import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["yt-dlp-exec", "ffmpeg-static"],
};

export default nextConfig;
