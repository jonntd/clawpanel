#!/usr/bin/env bash
# ClawPanel 本地构建脚本（macOS / Linux）
# 用法:
#   ./build.sh           — 构建当前平台安装包（默认）
#   ./build.sh --debug   — Debug 构建（快，不打包）
#   ./build.sh --clean   — 清理 Rust 编译缓存后构建
set -euo pipefail

DEBUG=false
CLEAN=false

for arg in "$@"; do
  case "$arg" in
    --debug) DEBUG=true ;;
    --clean) CLEAN=true ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'
MAGENTA='\033[0;35m'; GRAY='\033[0;90m'; RESET='\033[0m'

step()  { echo -e "\n${CYAN}▶ $1${RESET}"; }
ok()    { echo -e "  ${GREEN}✓ $1${RESET}"; }
fail()  { echo -e "  ${RED}✗ $1${RESET}"; exit 1; }

echo ""
echo -e "  ${MAGENTA}ClawPanel 构建工具${RESET}"
echo -e "  ${GRAY}─────────────────────────────────────${RESET}"
if [[ "$(uname)" == "Darwin" ]]; then
  ARCH=$(uname -m)
  if [[ "$ARCH" == "arm64" ]]; then
    echo -e "  ${GRAY}平台: macOS Apple Silicon (aarch64)${RESET}"
  else
    echo -e "  ${GRAY}平台: macOS Intel (x86_64)${RESET}"
  fi
else
  echo -e "  ${GRAY}平台: Linux x86_64${RESET}"
fi
echo -e "  ${GRAY}跨平台构建 (其他平台) 请推送 tag 触发 GitHub Actions${RESET}"
echo ""

# ── 环境检测 ──────────────────────────────────────────────────────────────────

step "检查构建依赖"

if ! command -v node &>/dev/null; then
  fail "未找到 Node.js，请从 https://nodejs.org 安装 v18+"
fi
ok "Node.js $(node --version)"

if ! command -v cargo &>/dev/null; then
  fail "未找到 Rust/Cargo，请从 https://rustup.rs 安装"
fi
ok "Rust $(rustc --version)"

# macOS 额外检测
if [[ "$(uname)" == "Darwin" ]]; then
  if ! command -v xcode-select &>/dev/null || ! xcode-select -p &>/dev/null 2>&1; then
    echo -e "  ${YELLOW}⚠ 未找到 Xcode Command Line Tools${RESET}"
    echo -e "    运行: xcode-select --install"
  fi
fi

# Linux 额外检测
if [[ "$(uname)" == "Linux" ]]; then
  MISSING=()
  for pkg in libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev; do
    if ! dpkg -s "$pkg" &>/dev/null 2>&1; then
      MISSING+=("$pkg")
    fi
  done
  if [ ${#MISSING[@]} -gt 0 ]; then
    echo -e "  ${RED}✗ 缺少系统依赖: ${MISSING[*]}${RESET}"
    echo -e "    运行: sudo apt-get install -y ${MISSING[*]} libayatana-appindicator3-dev librsvg2-dev patchelf"
    exit 1
  fi
fi

# ── 依赖安装 ──────────────────────────────────────────────────────────────────

step "安装前端依赖"
if [ ! -d "node_modules" ]; then
  npm ci --silent
  ok "依赖安装完成"
else
  ok "依赖已存在，跳过"
fi

# ── 清理缓存 ──────────────────────────────────────────────────────────────────

if [ "$CLEAN" = true ]; then
  step "清理 Rust 编译缓存"
  (cd src-tauri && cargo clean)
  ok "缓存已清理"
fi

# ── 构建 ──────────────────────────────────────────────────────────────────────

START_TIME=$(date +%s)

if [ "$DEBUG" = true ]; then
  step "Debug 构建（不打包安装器）"
  npm run tauri build -- --debug
else
  step "Release 构建"
  # macOS Apple Silicon: 同时构建 ARM64 + Intel Universal Binary（可选）
  if [[ "$(uname)" == "Darwin" ]] && [[ "$(uname -m)" == "arm64" ]]; then
    # 确保 Intel target 已安装
    rustup target add x86_64-apple-darwin 2>/dev/null || true
    echo -e "  ${GRAY}构建 ARM64 版本...${RESET}"
    npm run tauri build -- --target aarch64-apple-darwin
  else
    npm run tauri build
  fi
fi

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

# ── 输出结果 ──────────────────────────────────────────────────────────────────

echo ""
echo -e "  ${GREEN}✅ 构建成功！耗时 ${ELAPSED}s${RESET}"
echo -e "  ${GRAY}─────────────────────────────────────${RESET}"

if [ "$DEBUG" = true ]; then
  echo -e "  可执行文件: src-tauri/target/debug/clawpanel"
else
  BUNDLE_DIR="src-tauri/target/release/bundle"
  if [[ "$(uname)" == "Darwin" ]]; then
    DMG=$(find "$BUNDLE_DIR/dmg" -name "*.dmg" 2>/dev/null | head -1)
    APP=$(find "$BUNDLE_DIR/macos" -name "*.app" -maxdepth 1 2>/dev/null | head -1)
    [ -n "$DMG" ] && echo -e "  DMG: ${GRAY}$DMG${RESET}"
    [ -n "$APP" ] && echo -e "  APP: ${GRAY}$APP${RESET}"
  else
    APPIMAGE=$(find "$BUNDLE_DIR/appimage" -name "*.AppImage" 2>/dev/null | head -1)
    DEB=$(find "$BUNDLE_DIR/deb" -name "*.deb" 2>/dev/null | head -1)
    [ -n "$APPIMAGE" ] && echo -e "  AppImage: ${GRAY}$APPIMAGE${RESET}"
    [ -n "$DEB" ] && echo -e "  DEB: ${GRAY}$DEB${RESET}"
  fi
fi

echo ""
echo -e "  ${GRAY}提示: 发布跨平台版本请推送 tag，例如:${RESET}"
echo -e "  ${GRAY}  git tag v1.0.0 && git push origin v1.0.0${RESET}"
echo ""
