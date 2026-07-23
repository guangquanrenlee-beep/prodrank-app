import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://72.11.140.241/api/:path*",
      },
    ];
  },
};

export default nextConfig;
