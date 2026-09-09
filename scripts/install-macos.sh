#!/usr/bin/env bash
# ============================================================================
# Keyboard Dev Toolkit — macOS 一键安装脚本
#
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/709208969/keyboard-dev-toolkit/main/scripts/install-macos.sh | bash
#   bash scripts/install-macos.sh            # 安装最新版
#   bash scripts/install-macos.sh v1.0.29    # 安装指定版本
#
# 功能: 自动检测架构 → 下载 .dmg → 挂载 → 复制到 /Applications（无权限时
#       降级 ~/Applications）→ 解除 quarantine（未签名社区构建）
# ============================================================================
set -euo pipefail

REPO="709208969/keyboard-dev-toolkit"
BASE_URL="https://raw.githubusercontent.com/$REPO/main"
API_URL="https://api.github.com/repos/$REPO/releases"

APP_NAME="Keyboard Dev Toolkit"
APP_BUNDLE="/Applications/$APP_NAME.app"
DEST_DIR="/Applications"

# ── 0. 参数:可选 tag ────────────────────────────────────────────────────────
TAG="${1:-}"

# ── 1. 检测架构 ────────────────────────────────────────────────────────────
ARCH="$(uname -m)"
case "$ARCH" in
  arm64)                       DMG_SUFFIX="aarch64.dmg" ;;
  x86_64|i386|i686)            DMG_SUFFIX="x64.dmg" ;;
  *) echo "✗ 不支持的架构: $ARCH"; exit 1 ;;
esac
echo "✓ 架构: $ARCH ($DMG_SUFFIX)"

# ── 2. 解析版本与下载地址 ──────────────────────────────────────────────────
if [ -n "$TAG" ]; then
  echo ">>> 查询指定版本 $TAG 的安装包..."
  RELEASE_JSON="$(curl -fsSL "$API_URL/tags/$TAG")"
else
  echo ">>> 查询最新版本..."
  RELEASE_JSON="$(curl -fsSL "$API_URL/latest")"
  TAG="$(printf '%s' "$RELEASE_JSON" | grep -m1 '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
fi
echo "✓ 版本: $TAG"

URL="$(printf '%s' "$RELEASE_JSON" | grep -oE 'https://[^"]*\.dmg' | grep "$DMG_SUFFIX" | head -1)"
if [ -z "$URL" ]; then
  echo "✗ 未找到 $DMG_SUFFIX 的安装包（$TAG 可能没有 macOS 产物）"
  echo "  手动下载: https://github.com/$REPO/releases/tag/$TAG"
  exit 1
fi

# ── 3. 下载 ────────────────────────────────────────────────────────────────
TMP_DIR="$(mktemp -d)"
TMP_DMG="$TMP_DIR/kdt.dmg"
trap 'rm -rf "$TMP_DIR"' EXIT

echo ">>> 下载: $(basename "$URL")"
if ! curl -L --fail --progress-bar -o "$TMP_DMG" "$URL"; then
  echo "✗ 下载失败（GitHub 连接困难时可手动下载再拖入：github.com/$REPO/releases）"
  exit 1
fi

# ── 4. 挂载 dmg → 定位 .app ────────────────────────────────────────────────
MOUNT_POINT="$(hdiutil attach "$TMP_DMG" -nobrowse -noverify | grep -oE '/Volumes/.*' | head -1)"
if [ -z "$MOUNT_POINT" ]; then
  echo "✗ 挂载失败，镜像可能损坏"; exit 1
fi
trap 'hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true; rm -rf "$TMP_DIR"' EXIT

SRC_APP="$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -print -quit)"
if [ -z "$SRC_APP" ]; then
  echo "✗ 镜像内未找到 .app"; exit 1
fi

# ── 5. 复制到 Applications ─────────────────────────────────────────────────
if [ ! -w "$DEST_DIR" ]; then
  DEST_DIR="$HOME/Applications"
  mkdir -p "$DEST_DIR"
  echo "… /Applications 无权限，使用用户目录: $DEST_DIR"
fi
APP_BUNDLE="$DEST_DIR/$APP_NAME.app"
echo ">>> 安装到: $APP_BUNDLE"
echo "    提示: 若应用正在运行，请先在菜单/⌘Q 退出"
rm -rf "$APP_BUNDLE"
ditto "$SRC_APP" "$APP_BUNDLE"

# ── 6. 解除 quarantine（未签名社区构建，让系统放行）───────────────────────
echo ">>> 解除隔离属性..."
xattr -dr com.apple.quarantine "$APP_BUNDLE" 2>/dev/null || true

# ── 7. 完成 ────────────────────────────────────────────────────────────────
echo ""
echo "==================================================="
echo " ✓ $APP_NAME $TAG 安装完成 ($ARCH)"
echo "   位置: $APP_BUNDLE"
echo "==================================================="
echo "  若仍未通过系统验证（macOS 15 及以上），请按提示:"
echo "  系统设置 → 隐私与安全性 →『仍然打开』"
open "$APP_BUNDLE"
