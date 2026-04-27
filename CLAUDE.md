# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

TokenBao 是一个 Electron 桌面应用，通过本地 HTTP 代理服务器优化 AI API 调用（OpenAI、Anthropic），减少 Token 消耗和成本。代理监听可配置端口（默认 3000），拦截请求后应用优化策略（缓存、压缩、路由、批处理），再转发至目标 API。支持 SSE 流式响应透传。

## 常用命令

```bash
# 安装依赖（需分别安装主进程和渲染进程）
npm install
cd src/renderer && npm install && cd ../..

# 开发
npm run dev                # 构建 + 启动 Electron
npm run build              # 编译主进程 TypeScript
npm run build:renderer     # 构建 React 前端（Vite）

# 测试（基于 ts-jest，可直接运行 TypeScript）
npm test
npm run test:watch

# 代码质量
npm run lint               # ESLint 检查
npm run lint:fix           # 自动修复
npm run format             # Prettier 格式化
npm run check              # 完整检查（lint + build + test）

# 打包
npm run package:mac        # macOS DMG
npm run package:win        # Windows NSIS

# LSP
typescript-language-server --version  # 需全局安装
```

## 架构

### Electron 双进程模型

- **主进程** (`src/main/main.ts`): 应用入口，注册 IPC handlers，管理代理服务器生命周期
- **渲染进程** (`src/renderer/`): React 18 SPA，使用 HashRouter 路由，6 个页面（控制面板、监控、优化、历史、API Keys、设置）
- **Preload** (`src/main/preload.ts`): Context Bridge 暴露 `window.electronAPI`，IPC 通道白名单限制

### 请求处理流程

```
Renderer → IPC → Main Process → ProxyServer
  → 检测 stream:true?
    → 是: 直接 pipe 上游响应（流式透传）
    → 否: 优化管线 → 重试 → 统计记录 → 返回响应
```

优化管线：规则替换 → 文本压缩 → 模型路由 → 缓存策略（`src/optimizations/index.ts`）

### 模型名称归一化

API 返回的 model 可能是 `gpt-4-0613`、`claude-3-5-sonnet-20241022` 等。`server.ts` 中的 `normalizeModelName()` 会通过别名表和前缀匹配归一化到定价表标准名，确保费用计算准确。

### 数据持久化

- 使用 JSON 文件存储（`src/utils/storage.ts`），原子写入（临时文件+重命名）
- 数据目录：`~/Library/Application Support/tokenbao/data/`
- API Key 使用 AES-256-GCM 加密（`src/utils/crypto.ts`），密钥文件权限 0o600
- Token 计数：区分中文（1.5 字符/token）和英文（4 字符/token）

### 渲染进程

独立的 `package.json`（`src/renderer/package.json`），使用 Vite 构建，输出到 `dist/renderer/`。前端使用 Toast 通知组件（`src/renderer/components/Toast.tsx`），所有页面有 loading 状态，无 `alert()`/`confirm()` 调用。类型声明在 `src/types/electronAPI.d.ts`。

## 关键配置文件

| 文件 | 用途 |
|------|------|
| `tsconfig.json` | 主进程 TS 配置（CommonJS, ES2022） |
| `src/renderer/tsconfig.json` | 渲染进程 TS 配置（ESNext, bundler resolution） |
| `jest.config.js` | Jest + ts-jest 测试配置 |
| `electron-builder.yml` | 打包配置（App ID: com.tokenbao.app） |

## 测试

测试文件位于 `src/__tests__/`，7 个测试套件（crypto、compression、routing、caching、storage、services、integration），共 48 个测试。使用标准 Jest API（`describe`/`it`/`expect`）。集成测试会启动真实 HTTP 代理服务器。

## 注意事项

- 渲染进程有独立的 `node_modules`，修改前端依赖需在 `src/renderer/` 目录操作
- 主进程和渲染进程使用不同的 TypeScript 模块系统（CommonJS vs ESNext）
- 端口优先级：启动参数 > config.proxyPort > 默认 3000
- 类型声明在 `src/types/electronAPI.d.ts`，修改 preload API 后需同步更新
