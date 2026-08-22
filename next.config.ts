import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",

  // Static export for Tauri/Capacitor — use relative paths
  basePath: "",
  images: { unoptimized: true },

  // Security: strip source maps in production (harder to reverse)
  productionBrowserSourceMaps: false,
};

export default nextConfig;
