#!/bin/bash
# 创建包含安装脚本的 DMG

set -e

APP_NAME="ClawPanel"
APP_PATH="$1"
INSTALLER_SCRIPT="$2"
OUTPUT_DMG="$3"

if [ -z "$APP_PATH" ] || [ -z "$INSTALLER_SCRIPT" ] || [ -z "$OUTPUT_DMG" ]; then
    echo "用法: $0 <app路径> <安装脚本路径> <输出dmg路径>"
    exit 1
fi

# 检查依赖
if ! command -v create-dmg &> /dev/null; then
    echo "正在安装 create-dmg..."
    brew install create-dmg
fi

# 创建临时目录
TMP_DIR=$(mktemp -d)
DMG_CONTENTS="$TMP_DIR/dmg-contents"
mkdir -p "$DMG_CONTENTS"

# 复制应用
cp -R "$APP_PATH" "$DMG_CONTENTS/"

# 复制安装脚本
cp "$INSTALLER_SCRIPT" "$DMG_CONTENTS/安装ClawPanel.command"
chmod +x "$DMG_CONTENTS/安装ClawPanel.command"

# 创建 Applications 快捷链接
ln -s /Applications "$DMG_CONTENTS/Applications"

# 创建 README
 cat > "$DMG_CONTENTS/说明.txt" << 'EOF'
ClawPanel 安装说明
==================

方法1（推荐）: 使用安装脚本
----------------------------
双击 "安装ClawPanel.command" 脚本，自动完成安装并移除安全限制

方法2: 手动安装
----------------
1. 将 ClawPanel.app 拖到 Applications 文件夹
2. 打开终端运行: sudo xattr -rd com.apple.quarantine /Applications/ClawPanel.app
3. 从启动台打开 ClawPanel

遇到问题?
---------
访问 https://github.com/jonntd/clawpanel/issues 获取帮助
EOF

# 创建 DMG
create-dmg \
    --volname "$APP_NAME" \
    --window-pos 200 120 \
    --window-size 800 400 \
    --icon-size 100 \
    --icon "$APP_NAME.app" 200 200 \
    --icon "Applications" 600 200 \
    --icon "安装ClawPanel.command" 400 100 \
    --icon "说明.txt" 400 280 \
    --hide-extension "安装ClawPanel.command" \
    --app-drop-link 600 200 \
    "$OUTPUT_DMG" \
    "$DMG_CONTENTS"

# 清理
rm -rf "$TMP_DIR"

echo "DMG 创建完成: $OUTPUT_DMG"
