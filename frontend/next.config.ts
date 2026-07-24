import type { NextConfig } from "next";

const API_URL = process.env.API_URL || "https://prodrank-api.keywordslends.workers.dev";

const nextConfig: NextConfig = {
  output: "export",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
      {
        source: "/inject.js",
        destination: `${API_URL}/api/inject.js`,
      },
    ];
  },
};

export default nextConfig;
