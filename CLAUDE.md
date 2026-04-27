# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

TokenBao 是一个 Electron 桌面应用，通过本地 HTTP 代理服务器优化 AI API 调用（OpenAI、Anthropic），减少 Token 消耗和成本。代理监听可配置端口（默认 3000），拦截请求后应用优化策略（缓存、压缩、路由、批处理），再转发至目标 API。同时支持 SSE 流式和非流式响应，均有完整的 token/费用统计和历史记录。

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
- **Preload** (`src/main/preload.ts`): Context Bridge 暴露 `window.electronAPI`，IPC 通道白名单 + 全面的输入参数验证

### 请求处理流程

```
客户端请求 → ProxyServer
  → 优化管线（规则替换 → 文本压缩 → 模型路由 → 缓存策略）
  → 检测 stream:true?
    → 是: SSE pipe 转发 + PassThrough 拦截提取 usage → 记录统计/历史/预算
    → 否: 缓冲响应 + 重试 → 解析 usage → 记录统计/历史/预算
```

关键：预算只在响应后用实际 token（输入+输出）更新一次，避免双重计算。

### 模型定价与归一化

`src/proxy/server.ts` 中 `MODEL_PRICING` 是唯一定价源（17 个模型），`tokenCounter.ts` 和 `responseHandler.ts` 均从此导入。`normalizeModelName()` 通过别名表 + 前缀匹配将 API 返回的模型名（如 `gpt-4-0613`）归一化到定价表标准名。

### 数据流与持久化

- **统计** (`src/services/stats.ts`): `recordOptimization` 记录节省 token，`addStats` 记录完整请求统计（token/费用），两者各司其职不重复
- **历史** (`src/services/history.ts`): 每次 API 响应后调用 `addRequest` 持久化，支持按 API 类型过滤和模型名搜索，最新请求在前
- **预算** (`src/services/budget.ts`): 日/月预算自动重置，记录 `lastResetDate` 检测周期
- **存储** (`src/utils/storage.ts`): JSON 文件 + 原子写入（临时文件+重命名）
- **加密** (`src/utils/crypto.ts`): AES-256-GCM，密钥文件权限 0o600

### 安全设计

- Preload 层 IPC 输入验证（端口范围、密钥格式、配置键白名单等）
- API Key 格式校验（OpenAI: `sk-` 开头, Anthropic: `sk-ant-` 开头）
- 规则引擎正则长度限制（500字符）+ 执行超时（50ms）防止 ReDoS
- ErrorBoundary 不暴露错误详情给用户

### 渲染进程

独立的 `package.json`（`src/renderer/package.json`），使用 Vite 构建，输出到 `dist/renderer/`。Toast 通知（手动关闭、堆叠上限 5 个、error 类型 5s），所有页面有 loading 状态和错误处理。版本号通过 Vite `define` 从 `package.json` 注入。类型声明在 `src/types/electronAPI.d.ts` 和 `src/renderer/env.d.ts`。

## 关键配置文件

| 文件 | 用途 |
|------|------|
| `tsconfig.json` | 主进程 TS 配置（CommonJS, ES2022） |
| `src/renderer/tsconfig.json` | 渲染进程 TS 配置（ESNext, bundler resolution） |
| `jest.config.js` | Jest + ts-jest 测试配置 |
| `electron-builder.yml` | 打包配置（App ID: com.tokenbao.app） |

## 测试

测试文件位于 `src/__tests__/`，9 个测试套件，共 73 个测试：

| 套件 | 用途 |
|------|------|
| crypto | 加密解密、ID 生成 |
| storage | JSON 文件读写 |
| compression | Prompt 压缩 |
| routing | 模型路由和复杂度检测 |
| caching | Prompt Caching |
| batch | 批量优化（实验性） |
| normalizeModel | 模型名称归一化和费用计算 |
| services | API Key/历史/统计/预算服务 |
| integration | 真实 HTTP 代理服务器集成测试 |

使用标准 Jest API（`describe`/`it`/`expect`）。集成测试会启动真实 HTTP 代理服务器。

## 注意事项

- 渲染进程有独立的 `node_modules`，修改前端依赖需在 `src/renderer/` 目录操作
- 主进程和渲染进程使用不同的 TypeScript 模块系统（CommonJS vs ESNext）
- 端口优先级：启动参数 > config.proxyPort > 默认 3000
- 类型声明在 `src/types/electronAPI.d.ts`，修改 preload API 后需同步更新
- `MODEL_PRICING` 是唯一定价源，更新模型定价只需修改 `src/proxy/server.ts`
- 优化模块 `batch.ts` 标记为实验性，仅用于统计
