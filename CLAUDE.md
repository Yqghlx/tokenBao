# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

TokenBao 是一个 Electron 桌面应用，通过本地 HTTP 代理服务器优化 AI API 调用（OpenAI、Anthropic），减少 Token 消耗和成本。代理监听可配置端口（默认 3000），拦截请求后应用优化策略（缓存、压缩、路由、批处理、规则替换），再转发至目标 API。同时支持 SSE 流式和非流式响应，均有完整的 token/费用统计和历史记录。

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

- **主进程** (`src/main/main.ts`): 应用入口，注册 IPC handlers，管理代理服务器生命周期，全局异常 → 渲染进程通知
- **渲染进程** (`src/renderer/`): React 18 SPA，HashRouter 路由，7 个页面（控制面板、监控、优化、历史、预算管理、API Keys、设置）。React.lazy 代码分割，骨架屏 shimmer 加载态
- **Preload** (`src/main/preload.ts`): Context Bridge 暴露 `window.electronAPI`，IPC 通道白名单 + 全面的输入参数验证

### 请求处理流程

```
客户端请求 → ProxyServer（HTTPS 连接池 keepAlive）
  → Content-Type 校验 → 请求体大小限制（10MB）
  → 优化管线（规则替换 → 文本压缩 → 模型路由 → 缓存策略）
  → 检测 stream:true?
    → 是: SSE pipe 转发 + PassThrough 拦截提取 usage → 记录统计/历史/预算
    → 否: 缓冲响应 + 智能重试（4xx 不重试，5xx/408/429 指数退避）→ 解析 usage → 记录统计/历史/预算
```

关键：预算只在响应后用实际 token 更新一次。非流式重试区分客户端/服务端错误，指数退避含 jitter。优雅关闭追踪上游请求，`shuttingDown` 标志拒绝新请求（503）。

### 模型定价与归一化

`src/proxy/pricing.ts` 是唯一定价源（21 个模型），`server.ts`、`responseHandler.ts`、`tokenCounter.ts` 均从此导入 `normalizeModelName()` 和 `calculateCost()`。别名表 + 前缀匹配将 API 返回的模型名归一化到定价表标准名。

### 数据流与持久化

- **统计** (`src/services/stats.ts`): `recordOptimization` 记录节省 token，`addStats` 记录完整请求统计（含 NaN/负值校验）
- **历史** (`src/services/history.ts`): 输入校验（apiType/model/tokens/cost），`dataRetentionDays` 缓存（60s TTL），自动清理过期记录，上限 1000 条
- **预算** (`src/services/budget.ts`): 日/月预算自动重置（本地时区），深拷贝默认值防引用污染，`resetSpent` 支持
- **配置** (`src/services/config.ts`): 深拷贝默认值防引用污染
- **存储** (`src/utils/storage.ts`): JSON 文件 + 原子写入 + 备份恢复 + `.bak` 清理
- **加密** (`src/utils/crypto.ts`): AES-256-GCM，密钥文件权限 0o600
- **互斥** (`src/utils/mutex.ts`): 按文件名粒度的写入串行化，异常时自动释放锁

### 优化模块

- **rules** (`src/optimizations/rules.ts`): 正则替换规则引擎，ReDoS 防护（500 字符限制 + 50ms 超时），非法正则降级为字符串替换
- **compression** (`src/optimizations/compression.ts`): 21 条替换规则 + 空白压缩 + 膨胀安全检查（压缩后更大则回退原文），代码块保护
- **routing** (`src/optimizations/routing.ts`): 4 级复杂度检测（simple/classification/extraction/complex），27 条路由规则覆盖 GPT-4.1/o3/o4-mini/Claude Opus 4.6 等
- **caching** (`src/optimizations/caching.ts`): Anthropic Prompt Caching，LRU 淘汰（MAX_CACHE_SIZE=1000），SHA-256 缓存键
- **batch** (`src/optimizations/batch.ts`): 实验性，仅用于统计
- **pipeline** (`src/optimizations/index.ts`): 统一管线，精确类型（`ApiRequestBody`/`ChatMessage`/`TextContentBlock`），执行计时（>10ms 日志输出）

### 安全设计

- Preload 层 IPC 输入验证 + 主进程二次校验（proxy:setKeys API Key 格式验证）
- 服务层输入校验：history（apiType/model/tokens/cost）、apiKey（名称非空+长度）、stats（NaN/负值）
- API Key 格式校验（正则匹配前缀 + 长度）
- 规则引擎 ReDoS 防护（500 字符 + 50ms 超时）
- 请求 Content-Type 校验（415 拒绝非 JSON）
- macOS hardenedRuntime 打包

### 渲染进程

独立 `package.json`，Vite 构建。Toast 通知（滑入动画、手动关闭、堆叠上限 5），所有页面骨架屏 shimmer 加载态。响应式断点（1024px/768px），`focus-visible` 无障碍焦点样式。ConfirmDialog 确认弹窗替代 `window.confirm`，支持 `ReactNode` 消息。ErrorBoundary 含返回首页 + 复制错误信息。ControlPanel 预算进度条，Monitor 数据导出 JSON，Optimization 批量启用/禁用规则 + 删除确认弹窗。

## 关键配置文件

| 文件 | 用途 |
|------|------|
| `tsconfig.json` | 主进程 TS 配置（CommonJS, ES2022） |
| `src/renderer/tsconfig.json` | 渲染进程 TS 配置（ESNext, bundler resolution） |
| `jest.config.js` | Jest + ts-jest 测试配置 |
| `electron-builder.yml` | 打包配置（App ID: com.tokenbao.app） |

## 测试

测试文件位于 `src/__tests__/`，18 个测试套件，242+ 测试用例：

| 套件 | 用途 |
|------|------|
| crypto | 加密解密、ID 生成、长文本/空字符串/篡改密文 |
| storage | JSON 文件读写 |
| storageBackup | 备份恢复机制 |
| mutex | 写入串行化、并发安全、异常恢复 |
| compression | 21 条替换规则、代码块保护、膨胀安全 |
| routing | 4 级复杂度检测、27 条路由规则 |
| caching | Prompt Caching、LRU 淘汰 |
| batch | 批量优化（实验性） |
| normalizeModel | 模型名称归一化和费用计算 |
| pricing | 21 个模型定价完整性、归一化、各模型费用计算 |
| pipeline | 优化管线端到端（压缩/路由/caching/禁用/token 计算） |
| services | API Key/历史/统计/预算服务 + 输入验证拒绝 |
| config | 配置服务（get/set/reset/optimization/引用隔离） |
| requestTracker | 请求生命周期、指数退避重试、自动清理、容量淘汰 |
| responseHandler | OpenAI/Anthropic 流式非流式 usage 解析 |
| rules | 规则引擎（增删改查/正则替换/优先级/降级） |
| tokenCounter | Token 计数和费用估算（tiktoken + fallback） |
| integration | 真实 HTTP 代理服务器集成测试 |

使用标准 Jest API（`describe`/`it`/`expect`）。集成测试会启动真实 HTTP 代理服务器。

## 注意事项

- 渲染进程有独立的 `node_modules`，修改前端依赖需在 `src/renderer/` 目录操作
- 主进程和渲染进程使用不同的 TypeScript 模块系统（CommonJS vs ESNext）
- 端口优先级：启动参数 > config.proxyPort > 默认 3000
- 类型声明在 `src/types/electronAPI.d.ts`，修改 preload API 后需同步更新
- `MODEL_PRICING` 唯一定价源在 `src/proxy/pricing.ts`，更新模型定价只修改此文件
- 所有费用计算均通过 `normalizeModelName()` 归一化后再查定价表
- 预算自动重置使用本地时区（非 UTC），避免午夜边界问题
- config/budget 服务默认值使用 `JSON.parse(JSON.stringify())` 深拷贝防引用污染
- HTTPS 连接池 `httpsAgent` 全局共享，keepAlive + maxSockets:50
- requestTracker 每 5 分钟自动清理，完成记录上限 50 条，`unref()` 不阻塞进程退出
