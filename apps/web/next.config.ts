import type { NextConfig } from "next";

const apiProxyTarget =
  process.env.API_PROXY_TARGET?.replace(/\/$/, "") ??
  "http://telegram-api:4000/api";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
