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

关键：预算只在响应后用实际 token 更新一次。非流式重试区分客户端/服务端错误，指数退避含 jitter。优雅关闭追踪上游请求，`shuttingDown` 标志拒绝新请求（503）。GET 只读请求（/v1/models 等）跳过预算/熔断检查。流式请求检测客户端断连，自动销毁 PassThrough 和上游请求防资源泄漏。非流式响应 >1KB 自动 gzip 压缩（含错误回退）。`before-quit` 事件确保 macOS Cmd+Q 触发代理清理。

### 模型定价与归一化

`src/proxy/pricing.ts` 是唯一定价源（23 个模型，含 o1-preview/o1-mini），`server.ts`、`responseHandler.ts`、`tokenCounter.ts` 均从此导入 `normalizeModelName()` 和 `calculateCost()`。别名表 + 前缀匹配（按 key 长度降序排列防前缀碰撞，如 gpt-4o-mini 不会误匹配 gpt-4o）将 API 返回的模型名归一化到定价表标准名。

### 数据流与持久化

- **统计** (`src/services/stats.ts`): `recordOptimization` 记录节省 token，`addStats` 记录完整请求统计（含 NaN/负值校验 + 累加后 Infinity/NaN 二次校验）
- **历史** (`src/services/history.ts`): 输入校验（apiType/model/tokens/cost），`dataRetentionDays` 缓存（60s TTL），自动清理过期记录，上限 1000 条
- **预算** (`src/services/budget.ts`): 日/月预算自动重置（本地时区），深拷贝默认值防引用污染，`resetSpent` 支持，`updateSpent` 含溢出保护和 isFinite 校验
- **配置** (`src/services/config.ts`): 深拷贝默认值防引用污染，CONFIG_VALIDATORS 验证写入值
- **存储** (`src/utils/storage.ts`): JSON 文件 + 原子写入（fsync 持久化保证）+ 备份恢复 + `.bak` 清理，`loadJson` 返回深拷贝默认值
- **加密** (`src/utils/crypto.ts`): AES-256-GCM，密钥文件权限 0o600
- **互斥** (`src/utils/mutex.ts`): 按文件名粒度的写入串行化，异常时自动释放锁，队列上限 100 防积压

### 优化模块

- **rules** (`src/optimizations/rules.ts`): 正则替换规则引擎，ReDoS 防护（500 字符限制 + 50ms 超时 + 替换迭代计数器上限 10000），非法正则降级为字符串替换，优先级校验（0-1000 整数）
- **compression** (`src/optimizations/compression.ts`): 21 条替换规则 + 空白压缩（先合并连续空行再压缩水平空白，保留段落结构）+ 膨胀安全检查（压缩后更大则回退原文），代码块保护
- **routing** (`src/optimizations/routing.ts`): 4 级复杂度检测（simple/classification/extraction/complex），27 条路由规则覆盖 GPT-4.1/o3/o4-mini/Claude Opus 4.6 等，关键词布尔命中（防重复计数），fallback 链（extraction→classification→simple）
- **caching** (`src/optimizations/caching.ts`): Anthropic Prompt Caching，LRU 淘汰（MAX_CACHE_SIZE=1000），SHA-256 缓存键，`beforeExit` 处理器刷盘脏数据
- **batch** (`src/optimizations/batch.ts`): 实验性，仅用于统计
- **pipeline** (`src/optimizations/index.ts`): 统一管线，`JSON.parse(JSON.stringify())` 深拷贝隔离原始请求体，精确类型（`ApiRequestBody`/`ChatMessage`/`TextContentBlock`），每个策略 try-catch 错误隔离，管线结束验证 body 完整性，执行计时（>10ms 日志输出）

### 安全设计

- Preload 层 IPC 输入验证 + 主进程二次校验（proxy:setKeys API Key 格式验证 + 控制字符检测）
- 渲染进程 `sandbox: true` 沙箱隔离，CSP 含 `base-uri`/`form-action` 限制
- 服务层输入校验：history（apiType/model/tokens/cost）、apiKey（名称非空+长度+trim+mutex）、stats（NaN/负值含日志）
- API Key 格式校验（正则匹配前缀 + 长度 + 控制字符过滤）
- 错误响应信息脱敏：非流式路径不暴露上游错误细节（`errMsg` → 通用消息）
- 规则引擎 ReDoS 防护（500 字符 + 50ms 超时 + 替换迭代上限 10000）+ updateRule 校验（priority 范围 + pattern 长度）
- 请求 Content-Type 校验（415 拒绝非 JSON）
- macOS hardenedRuntime 打包
- 类型声明（`electronAPI.d.ts`）与 preload 实际返回保持同步，含 `PreloadError` 联合类型

### 渲染进程

独立 `package.json`，Vite 构建。Toast 通知（滑入动画、手动关闭、堆叠上限 5、定时器清理防泄漏、`×` 关闭符号），所有页面骨架屏 shimmer 加载态。响应式断点（1024px/768px），`focus-visible` 无障碍焦点样式，`aria-live` 动态区域（Monitor 统计卡片），`aria-label` 表格/按钮/表单。ConfirmDialog 焦点陷阱（Tab 循环）+ Escape 取消 + Enter 仅确认按钮聚焦时触发 + 背景点击关闭，支持 `ReactNode` 消息，`aria-describedby` 无障碍。ErrorBoundary 含返回首页 + 复制反馈 + 剪贴板不可用时回退选中文本。ControlPanel 预算进度条（`role="progressbar"`），Monitor 数据导出 JSON + aria-live，Optimization 规则表单 label 通过 `htmlFor`/`id` 关联 input + 批量启用/禁用规则 + 删除确认弹窗 + 实时正则校验 + 防双击 + 优先级范围（0-1000），ApiKeys 类型切换自动清空 key + 骨架屏 + 删除确认含 Key 名称 + 删除 loading 保护 + 无障碍表单。Budget 轮询不覆盖编辑中字段（useRef 追踪编辑状态）。History 分页边界自动修正 + CSV 导出含成功提示 + blob URL 延迟释放。Settings 表单 label 通过 `htmlFor`/`id` 关联 input + 变更检测（isDirty）+ 恢复默认确认弹窗。Layout 含 skip-nav 链接 + 语义化 nav/footer。

## 关键配置文件

| 文件 | 用途 |
|------|------|
| `tsconfig.json` | 主进程 TS 配置（CommonJS, ES2022） |
| `src/renderer/tsconfig.json` | 渲染进程 TS 配置（ESNext, bundler resolution） |
| `jest.config.js` | Jest + ts-jest 测试配置 |
| `electron-builder.yml` | 打包配置（App ID: com.tokenbao.app） |

## 测试

测试文件位于 `src/__tests__/`，19 个测试套件，301 测试用例：

| 套件 | 用途 |
|------|------|
| crypto | 加密解密、ID 生成、长文本/空字符串/篡改密文 |
| storage | JSON 文件读写 |
| storageBackup | 备份恢复机制 |
| mutex | 写入串行化、并发安全、异常恢复、队列溢出拒绝 |
| compression | 21 条替换规则、代码块保护、膨胀安全 |
| routing | 4 级复杂度检测、27 条路由规则 |
| caching | Prompt Caching、LRU 淘汰 |
| batch | 批量优化（实验性） |
| normalizeModel | 模型名称归一化和费用计算 |
| pricing | 23 个模型定价完整性、归一化、各模型费用计算 |
| pipeline | 优化管线端到端（压缩/路由/caching/禁用/token 计算） |
| services | API Key/历史/统计/预算服务 + 输入验证拒绝 |
| config | 配置服务（get/set/reset/optimization/引用隔离/值验证） |
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
- 代理超时/error 处理器会清理 `activeUpstreamRequests`，SSE 缓冲有 1MB 硬上限
- 非流式错误响应不暴露上游错误细节（统一返回"上游 API 请求失败"）
- 优化管线错误隔离：单个策略失败不影响其他策略，body 完整性异常时回退原始数据
- 优化管线深拷贝：`JSON.parse(JSON.stringify(body))` 确保原始请求体不被修改
- `normalizeModelName()` 按 key 长度降序排列进行前缀匹配（模块级缓存），防止 gpt-4o-mini 被误匹配为 gpt-4o
- IPC handlers 全量 try-catch 包裹，主进程异常不会导致渲染进程无响应
- SSE 流式响应 `extractStreamUsage` 从 `message_start` 事件提取模型名作为 fallback
- requestTracker 请求 ID 使用 `crypto.randomUUID()`，僵尸 pending 请求清理（>10 分钟）含日志
- stats Infinity/NaN 后置检查回退到累加前有效值（而非直接清零）
- apiKey `getDecryptedKey`/`getDecryptedKeyByType` 使用 mutex 保护防并发读取，列表接口真正 omit encryptedKey
- `config:set` 检测 `cacheTTL` 变更并同步到 caching 模块，代理启动时也同步
- 健康检查端点 `GET /health` 返回 uptime/connections/requestCount/shuttingDown
- 懒加载 ChunkErrorBoundary 捕获 chunk 加载失败并提供重试
