import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",

  // Static export for Tauri/Capacitor — use relative paths
  // GitHub Pages 部署时 CI 注入 NEXT_PUBLIC_BASE_PATH=/keyboard-dev-toolkit
  // 桌面版/Tauri 本地构建不设该环境变量，保持 ""（根路径），行为不变
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: { unoptimized: true },

  // Security: strip source maps in production (harder to reverse)
  productionBrowserSourceMaps: false,
};

export default nextConfig;
