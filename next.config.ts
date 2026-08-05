import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // драйвер Postgres тримає нативні зʼєднання — не бандлимо його
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: {
      // STL/STEP моделі бувають важкі
      bodySizeLimit: "64mb",
    },
  },
};

export default nextConfig;
