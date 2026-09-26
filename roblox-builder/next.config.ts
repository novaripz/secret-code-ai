import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core"],
  // The workspace UI is a single live client; strict mode's double effects would double-subscribe SSE in dev.
  reactStrictMode: false,
};

export default nextConfig;
