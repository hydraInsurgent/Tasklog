import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output creates a self-contained build for the distributable package.
  // The .next/standalone directory includes a minimal Node.js server and only
  // the dependencies needed to run - no full node_modules required.
  output: "standalone",
  // Allow the local-network IP so the app works when accessed from a phone on the same WiFi.
  allowedDevOrigins: ["192.168.1.41"],
};

export default nextConfig;
