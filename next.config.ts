import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite та fs-операції з файлами задач живуть тільки на сервері
  serverExternalPackages: ["node:sqlite"],
  experimental: {
    serverActions: {
      // STL/STEP моделі бувають важкі
      bodySizeLimit: "64mb",
    },
  },
};

export default nextConfig;
