#!/bin/bash
set -e

echo "=========================================="
echo "  ClawPanel Web 版 一键部署脚本"
echo "  在 Linux 上通过浏览器管理 OpenClaw"
echo "=========================================="
echo ""

INSTALL_DIR="/opt/clawpanel"
PANEL_PORT=1420
REPO_URL="https://github.com/qingchencloud/clawpanel.git"
NPM_REGISTRY="https://registry.npmmirror.com"

# 检测系统
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_LIKE=$ID_LIKE
    elif [ -f /etc/redhat-release ]; then
        OS="centos"
    else
        OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    fi
    echo "🖥️  系统: $OS $(uname -m)"
}

# 安装 Node.js
install_node() {
    if command -v node &> /dev/null; then
        local node_major=$(node -v | sed 's/v//' | cut -d. -f1)
        if [ "$node_major" -ge 18 ]; then
            echo "✅ Node.js $(node -v) 已安装"
            return 0
        else
            echo "⚠️  Node.js $(node -v) 版本过低，需要 18+"
        fi
    fi

    echo "📦 安装 Node.js 22 LTS..."
    case "$OS" in
        ubuntu|debian|linuxmint|pop)
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        centos|rhel|fedora|rocky|alma)
            curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
            sudo yum install -y nodejs
            ;;
        alpine)
            sudo apk add nodejs npm git
            ;;
        arch|manjaro)
            sudo pacman -Sy --noconfirm nodejs npm git
            ;;
        *)
            echo "❌ 不支持自动安装 Node.js，请手动安装后重试"
            echo "   参考: https://nodejs.org/en/download/"
            exit 1
            ;;
    esac
    echo "✅ Node.js $(node -v) 安装完成"
}

# 安装 Git
install_git() {
    if command -v git &> /dev/null; then
        echo "✅ Git 已安装"
        return 0
    fi

    echo "📦 安装 Git..."
    case "$OS" in
        ubuntu|debian|linuxmint|pop)
            sudo apt-get update && sudo apt-get install -y git
            ;;
        centos|rhel|fedora|rocky|alma)
            sudo yum install -y git
            ;;
        alpine)
            sudo apk add git
            ;;
        arch|manjaro)
            sudo pacman -Sy --noconfirm git
            ;;
    esac
    echo "✅ Git 安装完成"
}

# 安装 OpenClaw
install_openclaw() {
    if command -v openclaw &> /dev/null; then
        echo "✅ OpenClaw 已安装: $(openclaw --version 2>/dev/null || echo '未知版本')"
    else
        echo "📦 安装 OpenClaw 汉化版..."
        npm install -g @qingchencloud/openclaw-zh --registry "$NPM_REGISTRY"
        echo "✅ OpenClaw 安装完成"
    fi

    # 初始化配置（如果不存在）
    if [ ! -f "$HOME/.openclaw/openclaw.json" ]; then
        echo "🔧 初始化 OpenClaw 配置..."
        openclaw init 2>/dev/null || true
    fi
}

# 克隆并安装 ClawPanel
install_clawpanel() {
    if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/package.json" ]; then
        echo "📦 ClawPanel 已存在，更新中..."
        cd "$INSTALL_DIR"
        git pull origin main 2>/dev/null || true
        npm install
    else
        echo "📦 克隆 ClawPanel..."
        sudo mkdir -p "$INSTALL_DIR"
        sudo chown -R $(whoami) "$INSTALL_DIR"
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        npm install
    fi
    echo "✅ ClawPanel 安装完成: $INSTALL_DIR"
}

# 创建 systemd 服务
setup_systemd() {
    if ! command -v systemctl &> /dev/null; then
        echo "⚠️  systemd 不可用，请手动启动："
        echo "   cd $INSTALL_DIR && npx vite --port $PANEL_PORT --host 0.0.0.0"
        return 0
    fi

    echo "🔧 创建 systemd 服务..."
    sudo tee /etc/systemd/system/clawpanel.service > /dev/null << EOF
[Unit]
Description=ClawPanel Web - OpenClaw Management Panel
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which npx) vite --port $PANEL_PORT --host 0.0.0.0
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=HOME=$HOME

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable clawpanel
    sudo systemctl start clawpanel
    echo "✅ systemd 服务已创建并启动"
}

# 获取本机 IP
get_local_ip() {
    ip route get 1 2>/dev/null | awk '{print $7; exit}' || \
    hostname -I 2>/dev/null | awk '{print $1}' || \
    echo "localhost"
}

# 主流程
main() {
    detect_os
    echo ""
    install_git
    install_node
    install_openclaw
    install_clawpanel
    setup_systemd

    local ip=$(get_local_ip)
    echo ""
    echo "=========================================="
    echo "  ✅ ClawPanel Web 版部署完成！"
    echo "=========================================="
    echo ""
    echo "  🌐 访问地址: http://${ip}:${PANEL_PORT}"
    echo "  📁 安装目录: $INSTALL_DIR"
    echo "  📋 配置目录: $HOME/.openclaw/"
    echo ""
    echo "  常用命令："
    echo "    systemctl status clawpanel    # 查看状态"
    echo "    systemctl restart clawpanel   # 重启面板"
    echo "    journalctl -u clawpanel -f    # 查看日志"
    echo ""
    echo "  用浏览器打开上面的地址，即可管理 OpenClaw。"
    echo "=========================================="
}

main "$@"
