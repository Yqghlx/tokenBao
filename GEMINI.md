# TokenBao 项目指南

TokenBao 是一个基于 Electron 的桌面应用，旨在通过本地 HTTP 代理服务器优化 AI API（如 OpenAI、Anthropic）调用，从而减少 Token 消耗并降低成本。

## 项目概览

- **核心功能**: 拦截 AI API 请求，应用优化策略（缓存、压缩、路由、规则替换），并转发至目标服务器。
- **技术栈**:
  - **框架**: Electron + React 18
  - **语言**: TypeScript (主进程 CommonJS, 渲染进程 ESNext)
  - **构建工具**: Vite (渲染进程), tsc (主进程), electron-builder (打包)
  - **测试**: Jest + ts-jest

## 架构说明

### 进程模型
- **主进程 (`src/main/`)**: 管理应用生命周期、代理服务器启动/停止、IPC 通道注册及安全验证。
- **渲染进程 (`src/renderer/`)**: 用户界面，提供监控、配置、历史记录等功能页面。
- **代理服务器 (`src/proxy/`)**: 核心逻辑所在，处理 HTTP/HTTPS 请求转发、SSE 流式响应拦截、Token 统计及费用计算。

### 请求处理管线
1. **拦截**: 代理服务器监听端口（默认 3000）。
2. **优化 (`src/optimizations/`)**: 依次应用规则替换、文本压缩、模型路由、缓存策略。
3. **转发**: 转发优化后的请求至上游 API（OpenAI/Anthropic）。
4. **响应处理**: 统计实际消耗的 Token，更新历史记录和预算。

## 开发与运行

### 常用命令
- **开发模式**: `npm run dev` (构建并启动 Electron)
- **编译主进程**: `npm run build`
- **构建渲染进程**: `npm run build:renderer`
- **运行测试**: `npm test`
- **代码检查与修复**: `npm run lint:fix`
- **打包应用**:
  - macOS: `npm run package:mac`
  - Windows: `npm run package:win`

### 代理配置
将 AI 应用的 API Base 地址指向本地代理：
- OpenAI: `http://localhost:3000/v1`
- Anthropic: `http://localhost:3000/v1`

## 开发规范

- **命名规范**: 遵循 TypeScript 常用规范，类名 PascalCase，函数和变量 camelCase。
- **错误处理**: 主进程 IPC 处理函数需全量 `try-catch`，并对返回给渲染进程的错误信息进行脱敏。
- **性能优化**: 
  - 代理服务器使用 `https.Agent` 连接池复用 TLS 连接。
  - 非流式响应超过 1KB 自动开启 Gzip 压缩。
- **安全设计**:
  - API Key 使用 AES-256-GCM 加密存储。
  - Preload 层严格限制 IPC 通道白名单及参数校验。
  - 渲染进程开启沙箱模式 (`sandbox: true`)。

## 关键模块定义

- **定价信息**: `src/proxy/pricing.ts` 为唯一定价源，包含模型名归一化逻辑。
- **数据持久化**: 使用 `src/utils/storage.ts` 进行原子写入，支持备份与恢复。
- **测试用例**: 位于 `src/__tests__/`，涵盖从加密、存储到代理集成的全面测试。

更多详细技术细节请参考项目根目录下的 `CLAUDE.md`。
