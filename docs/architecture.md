# ClawPanel 项目架构分析

## 一、整体架构

### 1.1 技术栈

| 层级 | 技术选型 | 版本 |
|------|----------|------|
| **前端** | Vanilla JavaScript + Vite | Vite 6.x |
| **后端** | Tauri (Rust) | v2.x |
| **构建** | Vite + Tauri CLI | - |
| **UI** | 原生 CSS + CSS 变量 | - |

### 1.2 架构模式

```
┌─────────────────────────────────────────────────────────────┐
│                    ClawPanel 桌面应用                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐      ┌─────────────────────────────┐  │
│  │   前端 (Web)    │◄────►│      后端 (Rust)            │  │
│  │  Vanilla JS     │ IPC  │      Tauri Runtime          │  │
│  │  + Vite         │      │      + 系统命令调用          │  │
│  └─────────────────┘      └─────────────────────────────┘  │
│           │                           │                     │
│           ▼                           ▼                     │
│  ┌─────────────────┐      ┌─────────────────────────────┐  │
│  │  UI 组件层      │      │  OpenClaw CLI 管理          │  │
│  │  路由系统       │      │  系统服务控制                │  │
│  │  状态管理       │      │  文件系统操作                │  │
│  └─────────────────┘      └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**前后端分工**：
- **前端**: 负责 UI 渲染、用户交互、状态管理
- **后端**: 负责系统调用、文件操作、服务管理、安全配置

---

## 二、前端架构

### 2.1 框架选择：Vanilla JS

**为什么不使用 React/Vue？**

1. **包体积**: 无框架依赖，构建产物极小
2. **性能**: 无虚拟 DOM 开销，直接操作 DOM
3. **简单性**: 项目规模适中，不需要复杂的状态管理
4. **Tauri 集成**: 原生 JS 与 Tauri API 集成更直接

### 2.2 路由系统

文件: `src/router.js`

```javascript
// 极简 Hash 路由实现
const routes = {}
const _moduleCache = {}

export function registerRoute(path, loader) {
  routes[path] = loader
}

export function navigate(path) {
  window.location.hash = path
}

async function loadRoute() {
  const hash = window.location.hash.slice(1) || _defaultRoute
  const loader = routes[hash]
  
  // 模块缓存：避免重复加载
  let mod = _moduleCache[hash]
  if (!mod) {
    mod = await loader()
    _moduleCache[hash] = mod
  }
  
  // 渲染页面
  const page = mod.render ? await mod.render() : mod
  _contentEl.appendChild(page)
}
```

**特点**：
- Hash 路由（`#/dashboard`）
- 模块级缓存
- 竞态防护（防止快速切换导致的问题）
- 清理函数支持（页面卸载时清理资源）

### 2.3 状态管理

文件: `src/lib/app-state.js`

```javascript
// 全局状态
let _openclawReady = false
let _gatewayRunning = false
let _platform = ''
let _listeners = []

// 发布-订阅模式
export function onGatewayChange(fn) {
  _gwListeners.push(fn)
  return () => { /* 取消订阅 */ }
}

// 状态更新通知
function _setGatewayRunning(val) {
  _gatewayRunning = val
  _gwListeners.forEach(fn => fn(val))
}
```

**状态管理策略**：
- **全局状态**: OpenClaw 安装状态、Gateway 运行状态
- **局部状态**: 页面级状态由各页面自行管理
- **订阅模式**: 组件订阅状态变化，自动更新 UI

### 2.4 组件设计

**组件类型**：

| 组件 | 文件 | 职责 |
|------|------|------|
| **Sidebar** | `src/components/sidebar.js` | 导航菜单、路由切换 |
| **Modal** | `src/components/modal.js` | 模态框、弹窗管理 |
| **Toast** | `src/components/toast.js` | 消息提示、通知 |

**组件设计原则**：
- 函数式组件，返回 HTMLElement
- 支持配置参数和回调函数
- 自动清理事件监听

```javascript
// Modal 组件示例
export function showModal(options) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  // ... 创建 DOM
  
  return {
    close: () => overlay.remove(),
    update: (newContent) => { /* 更新内容 */ }
  }
}
```

---

## 三、后端架构

### 3.1 技术选型：Tauri v2 + Rust

**选择理由**：
- **性能**: Rust 编译为机器码，执行效率高
- **安全**: 内存安全，无运行时开销
- **体积**: 比 Electron 构建体积小 90%+
- **原生能力**: 直接调用系统 API

### 3.2 模块划分

目录: `src-tauri/src/commands/`

```
src-tauri/src/commands/
├── mod.rs           # 模块导出
├── config.rs        # 配置管理（核心）
├── service.rs       # 服务控制
├── agent.rs         # Agent 管理
├── assistant.rs     # AI 助手
├── device.rs        # 设备配对
├── pairing.rs       # 配对管理
├── logs.rs          # 日志管理
├── memory.rs        # 记忆文件
└── extensions.rs    # 扩展功能
```

### 3.3 核心功能

**1. 配置管理**

文件: `src-tauri/src/commands/config.rs`

```rust
// 读取 OpenClaw 配置
#[tauri::command]
pub async fn read_openclaw_config() -> Result<Value, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("读取配置失败: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("解析配置失败: {}", e))
}

// 写入配置（带备份）
#[tauri::command]
pub async fn write_openclaw_config(config: Value) -> Result<(), String> {
    // 1. 创建备份
    create_backup().await?;
    // 2. 写入文件
    fs::write(&path, content)
        .map_err(|e| format!("写入配置失败: {}", e))
}
```

**2. 服务管理**

文件: `src-tauri/src/commands/service.rs`

```rust
// 跨平台服务控制
#[tauri::command]
pub async fn start_service(name: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // macOS: launchctl
        run_shell(format!("launchctl start {}", name)).await
    }
    
    #[cfg(target_os = "windows")]
    {
        // Windows: sc
        run_shell(format!("sc start {}", name)).await
    }
}
```

**3. AI 助手**

文件: `src-tauri/src/commands/assistant.rs`

- 文件系统操作（读/写/列表）
- 系统信息获取
- 进程管理
- 端口检查

---

## 四、数据流

### 4.1 前后端通信

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   前端页面   │────►│  tauri-api  │────►│ Tauri invoke │
│  ( Vanilla )│     │  (封装层)    │     │  (IPC 通信)  │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                                │
                                        ┌───────▼───────┐
                                        │  Rust Command  │
                                        │  (config.rs)   │
                                        └───────┬───────┘
                                                │
                                        ┌───────▼───────┐
                                        │  OpenClaw CLI  │
                                        │  (系统命令)     │
                                        └───────────────┘
```

### 4.2 API 封装层

文件: `src/lib/tauri-api.js`

```javascript
// 统一 API 调用
async function invoke(cmd, args = {}) {
  if (isTauri) {
    // 生产环境：Tauri invoke
    const tauriInvoke = await import('@tauri-apps/api/core')
    return tauriInvoke.invoke(cmd, args)
  } else {
    // 开发环境：Web API
    return webInvoke(cmd, args)
  }
}

// 带缓存的调用
function cachedInvoke(cmd, args = {}, ttl = 15000) {
  const key = cmd + JSON.stringify(args)
  const cached = _cache.get(key)
  if (cached && Date.now() - cached.ts < ttl) {
    return Promise.resolve(cached.val)
  }
  return invoke(cmd, args).then(val => {
    _cache.set(key, { val, ts: Date.now() })
    return val
  })
}
```

### 4.3 开发模式支持

文件: `scripts/dev-api.js`

开发时无需编译 Rust，Vite 插件提供真实 API：

```javascript
// Vite 插件：开发服务器 API
export default function devApiPlugin() {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/__api', (req, res) => {
        // 直接操作 OpenClaw 配置文件
        // 模拟 Tauri 后端行为
      })
    }
  }
}
```

### 4.4 数据流转示例

**场景：修改配置并保存**

```
用户操作 ──► 前端页面 ──► tauri-api.invoke()
                              │
                              ▼
                    ┌─────────────────┐
                    │  write_openclaw │
                    │    _config()    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌─────────┐    ┌─────────┐    ┌─────────┐
        │创建备份  │    │写入文件  │    │返回结果  │
        └─────────┘    └─────────┘    └─────────┘
```

---

## 五、设计特点

### 5.1 设计模式

| 模式 | 应用位置 | 说明 |
|------|----------|------|
| **命令模式** | `src-tauri/src/lib.rs` | 所有功能封装为 Tauri command |
| **发布-订阅** | `src/lib/app-state.js` | 状态变化通知机制 |
| **代理模式** | `src/lib/tauri-api.js` | 统一封装底层调用 |
| **缓存模式** | `src/lib/tauri-api.js` | API 请求缓存 |
| **守护模式** | `src/lib/app-state.js` | Gateway 自动重启保护 |

### 5.2 架构优势

| 优势 | 说明 |
|------|------|
| **轻量级** | 无前端框架，包体积小（< 10MB） |
| **高性能** | Rust 后端，启动快、资源占用低 |
| **跨平台** | 一套代码支持 Windows/macOS/Linux |
| **开发友好** | 浏览器开发模式，无需编译 Rust |
| **安全可靠** | 多层安全防护，命令注入防护 |

### 5.3 安全机制

```rust
// 1. 输入验证
pub async fn write_memory_file(path: String, content: String) -> Result<(), String> {
    // 路径遍历防护
    if path.contains("..") || path.starts_with('/') {
        return Err("非法路径".to_string());
    }
    // ...
}

// 2. 访问控制
async fn checkAuth() {
    // 密码保护 + Session 管理
    // 登录限速（防暴力破解）
}

// 3. 命令安全
fn sanitize_input(input: &str) -> String {
    // 参数转义，防止命令注入
    input.replace(";", "").replace("&", "").replace("|", "")
}
```

### 5.4 扩展性设计

**添加新页面的步骤**：

1. 创建页面文件：`src/pages/new-feature.js`
2. 注册路由：`router.registerRoute('/new-feature', loader)`
3. 添加菜单项：`src/components/sidebar.js`
4. 添加后端命令（如需）：`src-tauri/src/commands/new_feature.rs`

**模块化解耦**：
- 页面独立，互不影响
- 组件复用，统一接口
- 后端命令原子化，易于测试

---

## 六、总结

ClawPanel 采用 **Tauri + Vanilla JS** 的轻量级架构，核心特点：

1. **简洁高效**: 无重型框架，启动快、体积小
2. **前后端分离**: 清晰的分层，易于维护
3. **开发友好**: 支持浏览器开发，调试便捷
4. **安全可靠**: 多层防护，生产级安全
5. **跨平台**: 一套代码，三端运行

这种架构特别适合**系统管理工具**类应用，既能提供现代化的 Web UI 体验，又能获得原生应用的性能和系统访问能力。
