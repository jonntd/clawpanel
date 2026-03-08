#!/bin/bash
# 预提交检查脚本
# 用法: ./scripts/pre-commit.sh 或复制到 .git/hooks/pre-commit

set -e

echo "🔍 运行预提交检查..."
echo ""

# 检查是否在项目根目录
if [ ! -f "package.json" ] || [ ! -d "src-tauri" ]; then
    echo "❌ 请在项目根目录运行此脚本"
    exit 1
fi

# Rust 检查
echo "📋 检查 Rust 代码格式..."
cd src-tauri
if ! cargo fmt --check; then
    echo ""
    echo "❌ Rust 代码格式检查失败"
    echo "💡 请运行: cargo fmt"
    exit 1
fi
echo "   ✅ Rust 格式检查通过"
echo ""

echo "🔨 检查 Rust 编译..."
if ! cargo check 2>&1 | tail -5; then
    echo ""
    echo "❌ Rust 编译检查失败"
    exit 1
fi
echo "   ✅ Rust 编译检查通过"
echo ""

# 可选: Clippy 检查
# echo "🔍 运行 Clippy..."
# cargo clippy -- -D warnings
# echo "   ✅ Clippy 检查通过"
# echo ""

cd ..

# 前端检查（如果有 lint 脚本）
if grep -q "\"lint\"" package.json 2>/dev/null; then
    echo "📋 运行前端代码检查..."
    npm run lint
    echo "   ✅ 前端代码检查通过"
    echo ""
fi

echo "========================================"
echo "✅ 所有检查通过！可以提交代码了"
echo "========================================"
