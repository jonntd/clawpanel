#!/bin/bash
# ClawPanel macOS 安装脚本
# 自动安装应用并移除隔离标记
# 用法: ./install-mac.command [silent]
#   silent - 静默模式，不启动应用，不等待用户输入

# 检查是否为静默模式
SILENT_MODE=false
if [ "$1" = "silent" ]; then
    SILENT_MODE=true
fi

if [ "$SILENT_MODE" = false ]; then
    echo "========================================"
    echo "  ClawPanel 安装程序"
    echo "========================================"
    echo ""
fi

# 获取脚本所在目录（DMG 挂载目录）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="ClawPanel.app"
APP_PATH="$SCRIPT_DIR/$APP_NAME"
INSTALL_PATH="/Applications/$APP_NAME"

# 检查应用是否存在
if [ ! -d "$APP_PATH" ]; then
    echo "❌ 错误：找不到 $APP_NAME"
    echo "请确保此脚本与 $APP_NAME 在同一目录"
    read -p "按回车键退出..."
    exit 1
fi

echo "📦 找到应用: $APP_NAME"
echo ""

# 检查是否已安装
if [ -d "$INSTALL_PATH" ]; then
    echo "⚠️  检测到已安装版本"
    read -p "是否覆盖安装？(y/N): " confirm
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        echo "已取消安装"
        read -p "按回车键退出..."
        exit 0
    fi
    echo "🗑️  删除旧版本..."
    rm -rf "$INSTALL_PATH"
fi

echo ""
echo "📋 安装步骤:"
echo ""

# 1. 复制应用到 Applications
echo "1️⃣  复制应用到 /Applications..."
cp -R "$APP_PATH" "$INSTALL_PATH"
if [ $? -ne 0 ]; then
    echo "❌ 复制失败，可能需要管理员权限"
    read -p "按回车键退出..."
    exit 1
fi
echo "   ✅ 复制完成"
echo ""

# 2. 移除隔离标记
echo "2️⃣  移除安全隔离标记..."
xattr -rd com.apple.quarantine "$INSTALL_PATH" 2>/dev/null
if [ $? -eq 0 ]; then
    echo "   ✅ 隔离标记已移除"
else
    if [ "$SILENT_MODE" = false ]; then
        echo "   ⚠️  需要管理员权限移除隔离标记"
        echo "   正在尝试使用 sudo..."
        echo ""
    fi
    sudo xattr -rd com.apple.quarantine "$INSTALL_PATH"
    if [ $? -eq 0 ]; then
        if [ "$SILENT_MODE" = false ]; then
            echo "   ✅ 隔离标记已移除"
        fi
    else
        if [ "$SILENT_MODE" = false ]; then
            echo "   ❌ 无法移除隔离标记"
            echo ""
            echo "   请手动运行以下命令:"
            echo "   sudo xattr -rd com.apple.quarantine /Applications/ClawPanel.app"
        fi
    fi
fi

if [ "$SILENT_MODE" = false ]; then
    echo ""
    # 3. 验证安装
    echo "3️⃣  验证安装..."
    if [ -d "$INSTALL_PATH" ]; then
        echo "   ✅ 应用已安装到 /Applications"
    else
        echo "   ❌ 安装验证失败"
        read -p "按回车键退出..."
        exit 1
    fi
    echo ""

    echo "========================================"
    echo "  ✅ 安装完成！"
    echo "========================================"
    echo ""
    echo "🚀 正在启动 ClawPanel..."
    open "$INSTALL_PATH"
    echo ""
    echo "📖 使用说明:"
    echo "   - 应用已安装到 /Applications"
    echo "   - 可以在启动台或应用程序文件夹中找到"
    echo "   - 首次使用请参考文档: https://github.com/jonntd/clawpanel"
    echo ""
    read -p "按回车键关闭此窗口..."
fi
