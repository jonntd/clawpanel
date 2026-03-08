# ClawPanel 开发规范

## 提交代码前检查清单

### Rust 代码
```bash
cd src-tauri

# 1. 格式化代码（必须）
cargo fmt

# 2. 检查编译错误
cargo check

# 3. 运行 Clippy 检查（推荐）
cargo clippy -- -D warnings
```

### JavaScript/前端代码
```bash
# 1. 检查代码风格
npm run lint

# 2. 运行测试
npm run test
```

## Git 提交规范

使用 Conventional Commits 格式：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Type 类型
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具相关

### 示例
```bash
git commit -m "feat(updater): add auto-update system"
git commit -m "fix: resolve memory leak in logs"
git commit -m "style: fix rustfmt formatting"
git commit -m "docs: update README installation guide"
```

## CI/CD 注意事项

### 自动检查流程
1. **Rust 格式检查** - `cargo fmt --check`
2. **Rust 编译检查** - `cargo check`
3. **Tauri 构建** - 多平台构建

### 常见失败原因
1. ❌ 忘记运行 `cargo fmt`
2. ❌ 代码编译错误
3. ❌ Clippy 警告未处理

### 本地预提交检查脚本

创建 `scripts/pre-commit.sh`：

```bash
#!/bin/bash
set -e

echo "🔍 运行预提交检查..."

cd src-tauri

echo "📋 检查 Rust 格式..."
cargo fmt --check

echo "🔨 检查编译..."
cargo check

echo "✅ 所有检查通过！"
```

添加到 git hooks：
```bash
chmod +x scripts/pre-commit.sh
cp scripts/pre-commit.sh .git/hooks/pre-commit
```

## 发布流程

1. 更新版本号（package.json 和 Cargo.toml）
2. 运行完整测试
3. 创建 Git tag: `git tag v2.0.1`
4. 推送 tag: `git push origin v2.0.1`
5. GitHub Actions 自动构建并发布

## 开发环境要求

- Node.js 18+
- Rust 1.70+
- macOS: Xcode Command Line Tools
- Linux: libwebkit2gtk-4.1-dev 等依赖
