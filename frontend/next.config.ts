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
    ];
  },
};

export default nextConfig;
