#!/bin/bash
# ============================================================
# Keyboard Editor — Cross-platform Build Script
# ============================================================
# Usage:
#   ./scripts/build-all.sh              # Build all (if on Linux with cross-compilation)
#   ./scripts/build-all.sh win          # Windows only (runs on Windows)
#   ./scripts/build-all.sh mac          # macOS only (runs on macOS)
#   ./scripts/build-all.sh linux        # Linux only (runs on Linux)
#   ./scripts/build-all.sh current      # Current platform only
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🔨 Keyboard Editor — Cross-platform Build"
echo "======================================"

# Step 1: Build Next.js static export
echo ""
echo "📦 Step 1: Building Next.js static export..."
npm run build

# Step 2: Tauri build
PLATFORM="${1:-all}"

build_tauri() {
  local target="$1"
  local bundle="$2"
  local label="$3"

  echo ""
  echo "🖥️  Building Tauri for $label ($target)..."
  npx tauri build --target "$target" --bundles "$bundle"
  echo "✅ $label build complete!"
}

case "$PLATFORM" in
  win|windows)
    build_tauri "x86_64-pc-windows-msvc" "msi" "Windows x64"
    ;;
  mac|macos|darwin)
    build_tauri "aarch64-apple-darwin" "dmg" "macOS Apple Silicon"
    build_tauri "x86_64-apple-darwin" "dmg" "macOS Intel"
    ;;
  linux)
    build_tauri "x86_64-unknown-linux-gnu" "appimage" "Linux x64"
    ;;
  current)
    echo ""
    echo "🖥️  Building Tauri for current platform..."
    npx tauri build
    echo "✅ Current platform build complete!"
    ;;
  all)
    echo ""
    echo "⚠️  Cross-platform build requires appropriate toolchains."
    echo "   Building for current platform only."
    echo "   For multi-platform builds, use CI (GitHub Actions)."
    npx tauri build
    echo "✅ Build complete!"
    ;;
  *)
    echo "❌ Unknown platform: $PLATFORM"
    echo "   Usage: $0 {win|mac|linux|current|all}"
    exit 1
    ;;
esac

echo ""
echo "======================================"
echo "✅ Build complete!"
