# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

TokenBao 是一个 Electron 桌面应用，通过本地 HTTP 代理服务器优化 AI API 调用（OpenAI、Anthropic），减少 Token 消耗和成本。代理监听 `localhost:3000`，拦截请求后应用优化策略（缓存、压缩、路由、批处理），再转发至目标 API。

## 常用命令

```bash
# 安装依赖（需分别安装主进程和渲染进程）
npm install
cd src/renderer && npm install && cd ../..

# 开发
npm run dev                # 构建 + 启动 Electron
npm run build              # 编译主进程 TypeScript
npm run build:renderer     # 构建 React 前端（Vite）

# 测试（基于编译后的 JS，需先 build）
npm test
npm run test:watch

# 代码质量
npm run lint               # ESLint 检查
npm run lint:fix           # 自动修复
npm run format             # Prettier 格式化
npm run check              # 完整检查（lint + build + test）

# 打包
npm run package:mac        # macOS DMG（arm64 + x64）
npm run package:win        # Windows NSIS
```

## 架构

### Electron 双进程模型

- **主进程** (`src/main/main.ts`): 应用入口，注册 IPC handlers，管理代理服务器生命周期
- **渲染进程** (`src/renderer/`): React 18 SPA，使用 HashRouter 路由，6 个页面（控制面板、监控、优化、历史、API Keys、设置）
- **Preload** (`src/main/preload.ts`): Context Bridge 暴露 `window.electronAPI`，IPC 通道按领域划分：`proxy:*`、`config:*`、`apiKeys:*`、`history:*`、`budget:*`、`stats:*`、`optimization:*`

### 请求处理流程

`Renderer → IPC → Main Process → ProxyServer → Interceptor → Optimization Pipeline → 上游 API`

优化管线执行顺序：规则替换 → 文本压缩 → 模型路由 → 缓存策略（`src/optimizations/index.ts`）

### 数据持久化

- 使用 JSON 文件存储（`src/utils/storage.ts`），数据目录：`~/Library/Application Support/tokenbao/data/`
- API Key 使用 AES-256-GCM 加密（`src/utils/crypto.ts`），密钥存储在 `~/.tokenbao/.encryption.key`
- Token 计数：OpenAI 使用 `js-tiktoken`（cl100k_base），Anthropic 使用自定义估算（1.5 字符/token）

### 渲染进程

独立的 `package.json`（`src/renderer/package.json`），使用 Vite 构建，输出到 `dist/renderer/`。前端无状态管理库，使用 `useState` + 3 秒轮询更新。

## 关键配置文件

| 文件 | 用途 |
|------|------|
| `tsconfig.json` | 主进程 TS 配置（CommonJS, ES2022） |
| `src/renderer/tsconfig.json` | 渲染进程 TS 配置（ESNext, bundler resolution） |
| `vite.config.ts` | 渲染进程 Vite 配置（base: `./`，相对路径） |
| `jest.config.js` | 测试配置（从 `dist/` 运行编译后的 JS） |
| `electron-builder.yml` | 打包配置（App ID: com.example.tokenbao） |
| `.eslintrc.js` | ESLint + Prettier 配置 |

## 测试

测试文件位于 `src/__tests__/`，包含 7 个测试套件（加密、压缩、路由、缓存、Token 计数、存储、集成测试）。测试基于自定义 runner（非标准 Jest），使用 `process.exit(1)` 处理失败。测试运行在编译后的 JS 上，需先 `npm run build`。

## 注意事项

- 渲染进程有独立的 `node_modules`，修改前端依赖需在 `src/renderer/` 目录操作
- 主进程和渲染进程使用不同的 TypeScript 模块系统（CommonJS vs ESNext）
- 代理端口硬编码为 3000，上游请求超时 60 秒，失败重试 3 次（间隔 1 秒）
