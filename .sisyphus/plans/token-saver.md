# TokenBao - AI API Token 节省工具

## TL;DR

> **Quick Summary**: 开发一个 Electron 桌面应用，通过 Prompt Caching、智能路由、Prompt 压缩等策略，自动优化 AI API 调用，节省 Token 消耗和成本。
>
> **Deliverables**:
> - 可运行的 Electron 桌面应用（打包后可分发）
> - 6大核心优化模块（Caching、监控、压缩、路由、批处理、代理）
> - 4项数据管理功能（API Key管理、历史记录、预算限额、自定义规则）
> - SQLite 本地数据库
> - React 前端界面（详细控制面板风格）
>
> **Estimated Effort**: Large（大型项目，约15-25个工作任务）
> **Parallel Execution**: YES - 4 waves（分4波并行执行）
> **Critical Path**: 项目骨架 → 代理核心 → 优化策略 → UI集成 → 最终验证

---

## Context

### Original Request
用户希望开发一个能节省 AI API Token 的桌面工具，针对 token 越来越贵的现状，实现自动优化和成本监控。

### Interview Summary
**Key Discussions**:
- **Token 类型**: AI API Token（LLM API 计费 token），非区块链 token
- **框架选择**: Electron（成熟生态，完全 Node.js/TS 支持）+ React 前端
- **数据存储**: SQLite（本地数据库，结构化查询）
- **UI 设计**: 详细控制面板风格（非简洁仪表盘）
- **测试策略**: Tests-after（实现功能后补充测试）
- **API 服务**: 多个（Claude、OpenAI 及其他国产模型）
- **使用场景**: 个人使用（非团队协作）

**Research Findings**:
- **Prompt Caching**: 最高效优化策略，Claude 90%节省，OpenAI 50%节省
- **Electron**: 包体积 80-200MB，内存 ~200MB，启动 1-2秒，适合 Node.js/TS 团队
- **Tauri**: 包体积 2-10MB，性能更好，但需要 Rust 后端
- **智能路由**: 简单任务路由到低价模型可节省 60-95%
- **Prompt 压缩**: 可节省 20-40% tokens

### Gap Analysis (Self-Performed)
**Identified Gaps** (addressed):
- **代理端口配置**: 默认使用 localhost:8080，用户可在设置中修改
- **支持的 API 服务**: 第一版支持 OpenAI 和 Claude，后续扩展其他服务
- **模型路由规则**: 默认规则：分类/提取任务→低价模型，复杂推理→高价模型
- **数据保留策略**: 历史记录保留30天，可配置
- **加密方案**: API Key 使用 AES-256-GCM 加密存储

---

## Work Objectives

### Core Objective
构建一个 Electron 桌面应用，作为 AI API 调用的代理中间层，自动应用多种优化策略（Prompt Caching、智能路由、Prompt 压缩、批处理等），并提供可视化监控和控制界面，帮助用户节省 Token 消耗和 API 成本。

### Concrete Deliverables
1. Electron 主进程架构（代理服务器、配置管理、数据库）
2. React 前端界面（控制面板、监控仪表盘、设置页面）
3. SQLite 数据库（请求历史、配置、统计数据）
4. API 代理中间层（拦截请求、应用优化）
5. 6大优化模块实现
6. 打包配置（macOS/Windows 可分发应用）

### Definition of Done
- [ ] 应用可正常启动并运行
- [ ] 代理服务器正常拦截 API 请求
- [ ] 所有优化策略可独立启用/禁用
- [ ] Token 使用统计可视化展示
- [ ] API Key 加密存储并可管理
- [ ] 预算限额功能正常提醒
- [ ] 历史记录可查询和导出
- [ ] 应用可打包为可分发安装包

### Must Have
- Electron + React + SQLite 技术栈
- API 代理中间层（核心功能）
- Prompt Caching 自动优化
- Token 使用监控可视化
- API Key 加密管理
- 支持 OpenAI 和 Claude API

### Must NOT Have (Guardrails)
- 不支持移动端（纯桌面应用）
- 不支持团队协作/多用户（纯个人使用）
- 不支持实时语音/视频 API
- 不自动发送未经用户确认的请求
- 不存储明文 API Key
- 不在未加密状态下持久化敏感数据
- 不引入过度抽象的"AI slop"代码模式
- 不添加超出需求的功能（如 AI 对话界面）

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO（新建项目，需搭建）
- **Automated tests**: Tests-after（实现功能后补充）
- **Framework**: Vitest（轻量快速，适合 Electron/React 项目）
- **Test setup task**: 包含在 Wave 1 项目骨架任务中

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright - Navigate, interact, assert DOM, screenshot
- **Backend/API**: Use Bash (curl) - Send requests to proxy, assert status + response
- **Database**: Use Bash (sqlite3) - Query database, assert data structure
- **Electron App**: Use interactive_bash (tmux) - Launch app, verify window appears

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - 项目骨架 + 基础设施):
├── Task 1: Electron 项目初始化 + 配置 [quick]
├── Task 2: React 前端项目初始化 [visual-engineering]
├── Task 3: SQLite 数据库设计 + 初始化 [quick]
├── Task 4: 类型定义 + 共享接口 [quick]
├── Task 5: 测试基础设施搭建 [quick]
└── Task 6: API Key 加密模块 [quick]

Wave 2 (After Wave 1 - 代理核心 + 数据管理):
├── Task 7: HTTP 代理服务器核心 [deep]
├── Task 8: API 请求拦截器 [unspecified-high]
├── Task 9: 配置管理服务 [quick]
├── Task 10: API Key 管理服务 [quick]
├── Task 11: 请求历史记录服务 [quick]
├── Task 12: 成本预算服务 [quick]
└── Task 13: 统计数据服务 [quick]

Wave 3 (After Wave 2 - 优化策略模块):
├── Task 14: Prompt Caching 模块 [deep]
├── Task 15: Prompt 压缩模块 [unspecified-high]
├── Task 16: 智能模型路由模块 [deep]
├── Task 17: 请求批处理模块 [unspecified-high]
├── Task 18: 自定义规则引擎 [unspecified-high]
└── Task 19: Token 计数器 [quick]

Wave 4 (After Wave 3 - UI界面 + 集成):
├── Task 20: 主窗口布局 + 导航 [visual-engineering]
├── Task 21: 控制面板页面 [visual-engineering]
├── Task 22: 监控仪表盘页面 [visual-engineering]
├── Task 23: 设置页面 [visual-engineering]
├── Task 24: API Key 管理页面 [visual-engineering]
├── Task 25: 历史记录页面 [visual-engineering]
└── Task 26: 优化策略配置页面 [visual-engineering]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T7 → T14 → T20 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Wave 1 & 2)
```

### Dependency Matrix (abbreviated)

- **1-6**: - - 7-13, 20
- **7**: 1, 4 - 8, 14-19
- **8**: 7, 4 - 14-19
- **9-13**: 3, 4 - 20-26
- **14-19**: 7, 8, 4 - 20, 26
- **20-26**: 1, 2, 9-13 - F1-F4
- **F1-F4**: ALL - user okay

### Agent Dispatch Summary

- **Wave 1**: **6** - T1 → `quick`, T2 → `visual-engineering`, T3-T6 → `quick`
- **Wave 2**: **7** - T7 → `deep`, T8 → `unspecified-high`, T9-T13 → `quick`
- **Wave 3**: **6** - T14 → `deep`, T15, T17, T18 → `unspecified-high`, T16 → `deep`, T19 → `quick`
- **Wave 4**: **7** - T20-T26 → `visual-engineering`
- **FINAL**: **4** - F1 → `oracle`, F2, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Electron 项目初始化 + 配置

  **What to do**:
  - 创建 Electron 主进程入口 (`main.ts`)
  - 配置 `package.json`（依赖、脚本、打包配置）
  - 设置 `tsconfig.json`（Node.js 主进程配置）
  - 配置 `electron-builder` 打包设置（macOS/Windows）
  - 创建基础窗口管理逻辑
  - 设置 IPC 通信桥接层

  **Must NOT do**:
  - 不引入多余的开发依赖
  - 不创建复杂的窗口管理器（保持简单）
  - 不预先配置热更新（后续任务）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 项目初始化是标准化任务，配置文件模板可直接使用
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Task 7, 20
  - **Blocked By**: None

  **References**:
  - Electron 官方文档: `https://www.electronjs.org/docs/latest/tutorial/quick-start` - 主进程结构
  - electron-builder: `https://www.electronjs.org/docs/latest/tutorial/building-distributables` - 打包配置

  **Acceptance Criteria**:
  - [ ] `package.json` 存在，包含 electron、electron-builder 依赖
  - [ ] `main.ts` 可启动 Electron 窗口
  - [ ] `npm start` 成功启动应用

  **QA Scenarios**:
  ```
  Scenario: Electron 应用启动
    Tool: interactive_bash (tmux)
    Preconditions: 项目目录存在，依赖已安装
    Steps:
      1. npm install
      2. npm start
      3. 等待 5 秒
      4. tmux capture-pane -p
    Expected Result: 窗口标题包含 "TokenBao"，无启动错误
    Evidence: .sisyphus/evidence/task-01-startup.log
  ```

  **Commit**: YES (Wave 1)
  - Message: `feat(init): electron project scaffolding`
  - Files: `package.json`, `main.ts`, `tsconfig.json`

- [ ] 2. React 前端项目初始化

  **What to do**:
  - 创建 React 项目结构（使用 Vite 构建）
  - 配置 TypeScript 前端（`tsconfig.node.json`）
  - 设置基础路由（React Router）
  - 创建 App 组件骨架
  - 配置 TailwindCSS 或基础样式方案
  - 设置 Electron preload 脚本（桥接主进程）

  **Must NOT do**:
  - 不引入 Material-UI/Ant Design 等重型 UI 库（保持轻量）
  - 不创建复杂的组件库（按需创建）
  - 不预先实现具体页面（后续任务）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 前端项目架构需要考虑 UI 设计风格和组件组织
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: 用于设计合理的组件结构和样式方案
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Task 20-26
  - **Blocked By**: None

  **References**:
  - Vite + React: `https://vitejs.dev/guide/#scaffolding-your-first-vite-project` - 项目模板
  - Electron preload: `https://www.electronjs.org/docs/latest/tutorial/tutorial-preload` - IPC 桥接

  **Acceptance Criteria**:
  - [ ] `src/renderer/` 目录存在
  - [ ] React App 组件可渲染
  - [ ] Vite 开发服务器可启动

  **QA Scenarios**:
  ```
  Scenario: React 前端构建
    Tool: Bash
    Preconditions: 项目已初始化
    Steps:
      1. cd src/renderer && npm run dev
      2. curl http://localhost:5173
    Expected Result: 返回 HTML 包含 React root element
    Evidence: .sisyphus/evidence/task-02-frontend.html
  ```

  **Commit**: YES (Wave 1)
  - Message: `feat(init): react frontend scaffolding`
  - Files: `src/renderer/**`, `vite.config.ts`

- [ ] 3. SQLite 数据库设计 + 初始化

  **What to do**:
  - 设计数据库表结构：
    - `api_keys`: 存储 API Key（加密）
    - `requests`: 存储请求历史
    - `stats`: 存储统计数据
    - `config`: 存储配置
    - `budget`: 存储预算设置
    - `rules`: 存储自定义规则
  - 创建数据库初始化脚本
  - 使用 better-sqlite3 或 sqlite3 库
  - 创建数据库连接管理器
  - 定义基础 CRUD 接口

  **Must NOT do**:
  - 不使用 ORM（直接 SQL 更轻量）
  - 不创建复杂的迁移系统（单脚本初始化）
  -不预先填充测试数据

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 数据库设计是结构化任务，有明确的表结构
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Task 9-13
  - **Blocked By**: None

  **References**:
  - better-sqlite3: `https://github.com/WiseLibs/better-sqlite3` - 高性能 SQLite 库
  - SQLite 文档: `https://www.sqlite.org/docs.html` - SQL 语法

  **Acceptance Criteria**:
  - [ ] `src/db/schema.sql` 存在
  - [ ] `src/db/database.ts` 连接器存在
  - [ ] 数据库文件 `tokenbao.db` 可创建

  **QA Scenarios**:
  ```
  Scenario: 数据库初始化
    Tool: Bash
    Preconditions: 项目已初始化
    Steps:
      1. npm run db:init
      2. sqlite3 tokenbao.db ".tables"
    Expected Result: 输出包含 api_keys, requests, stats, config
    Evidence: .sisyphus/evidence/task-03-db-tables.log
  ```

  **Commit**: YES (Wave 1)
  - Message: `feat(init): sqlite database setup`
  - Files: `src/db/**`, `schema.sql`

- [ ] 4. 类型定义 + 共享接口

  **What to do**:
  - 创建 `src/types/` 目录
  - 定义核心类型：
    - `ApiKey`: API Key 结构
    - `RequestLog`: 请求日志结构
    - `OptimizationConfig`: 优化配置
    - `StatsData`: 统计数据
    - `BudgetConfig`: 预算配置
    - `CustomRule`: 自定义规则
    - `ProxyRequest`: 代理请求结构
    - `ProxyResponse`: 代理响应结构
  - 创建 IPC 接口定义（主进程-渲染进程通信）
  - 创建服务接口定义

  **Must NOT do**:
  - 不创建过度泛型的类型（保持具体）
  - 不定义未确定的类型（按需求定义）

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 类型定义是标准化任务
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: Task 7-8, 9-13, 14-19
  - **Blocked By**: None

  **References**:
  - TypeScript handbook: `https://www.typescriptlang.org/docs/handbook/2/everyday-types.html` - 类型定义

  **Acceptance Criteria**:
  - [ ] `src/types/index.ts` 存在并导出所有类型
  - [ ] TypeScript 编译无类型错误

  **QA Scenarios**:
  ```
  Scenario: 类型定义编译
    Tool: Bash
    Preconditions: 类型文件已创建
    Steps:
      1. tsc --noEmit src/types/index.ts
    Expected Result: 无编译错误输出
    Evidence: .sisyphus/evidence/task-04-types-compile.log
  ```

  **Commit**: YES (Wave 1)
  - Message: `feat(init): type definitions`
  - Files: `src/types/**`

- [ ] 5. 测试基础设施搭建

  **What to do**:
  - 安装 Vitest 测试框架
  - 配置 `vitest.config.ts`
  - 创建测试目录结构 `src/__tests__/`
  - 编写示例测试文件（验证测试框架工作）
  - 配置 npm test 脚本
  - 配置测试覆盖率报告

  **Must NOT do**:
  - 不预先编写大量测试（Tests-after 策略）
  - 不引入复杂的测试工具链

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 测试基础设施是配置任务
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: None（后续测试按需编写）
  - **Blocked By**: None

  **References**:
  - Vitest 文档: `https://vitest.dev/guide/` - 配置和使用

  **Acceptance Criteria**:
  - [ ] `vitest.config.ts` 存在
  - [ ] `npm test` 可运行示例测试

  **QA Scenarios**:
  ```
  Scenario: 测试框架运行
    Tool: Bash
    Preconditions: Vitest 已配置
    Steps:
      1. npm test
    Expected Result: 输出包含 "passed"，无失败测试
    Evidence: .sisyphus/evidence/task-05-test-run.log
  ```

  **Commit**: YES (Wave 1)
  - Message: `feat(init): test infrastructure`
  - Files: `vitest.config.ts`, `src/__tests__/example.test.ts`

- [ ] 6. API Key 加密模块

  **What to do**:
  - 使用 Node.js crypto 模块实现 AES-256-GCM 加密
  - 创建加密密钥生成和管理逻辑
  - 创建 `encryptApiKey()` 和 `decryptApiKey()` 函数
  - 创建密钥存储位置（Electron safeStorage 或本地文件）
  - 实现安全密钥派生（从用户密码或系统特征）

  **Must NOT do**:
  - 不使用明文存储 API Key
  - 不使用弱加密算法（如 MD5、SHA1）
  - 不在日志中输出加密密钥

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 加密模块是标准化安全实现
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:
  - Node.js crypto: `https://nodejs.org/api/crypto.html` - AES-GCM 加密
  - Electron safeStorage: `https://www.electronjs.org/docs/latest/api/safe-storage` - 安全存储

  **Acceptance Criteria**:
  - [ ] `src/utils/crypto.ts` 存在
  - [ ] encrypt/decrypt 函数正常工作
  - [ ] 加密后数据不可逆向（需密钥）

  **QA Scenarios**:
  ```
  Scenario: 加密解密测试
    Tool: Bash (Node REPL)
    Preconditions: 加密模块已实现
    Steps:
      1. node -e "const {encrypt, decrypt} = require('./src/utils/crypto'); const key = encrypt('test-api-key'); console.log(decrypt(key));"
    Expected Result: 输出 "test-api-key"
    Evidence: .sisyphus/evidence/task-06-encrypt.log
  ```

  **Commit**: YES (Wave 1)
  - Message: `feat(init): api key encryption module`
  - Files: `src/utils/crypto.ts`

- [ ] 7. HTTP 代理服务器核心

  **What to do**:
  - 创建 HTTP 代理服务器（使用 Node.js http/https 模块）
  - 实现请求拦截和转发逻辑
  - 支持配置代理端口（默认 8080）
  - 实现请求/响应日志记录
  - 支持 OpenAI API 格式（/v1/chat/completions）
  - 支持 Claude API 格式（/v1/messages）
  - 实现错误处理和重试逻辑
  - 添加请求超时配置

  **Must NOT do**:
  - 不修改请求的 body 内容（除非应用优化策略）
  - 不阻断正常请求流程
  - 不泄露敏感信息到日志

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 代理服务器是核心模块，需要仔细设计架构
  - **Skills**: [`aliyun-bailian-coding`]
    - `aliyun-bailian-coding`: 复杂架构设计，需要权衡多种因素
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: NO（核心模块，依赖 Task 1, 4）
  - **Parallel Group**: Sequential
  - **Blocks**: Task 8, 14-19
  - **Blocked By**: Task 1, 4

  **References**:
  - Node.js http: `https://nodejs.org/api/http.html` - HTTP 服务器
  - HTTP Proxy 设计: `https://nodejs.org/api/http.html#http_http_request_options_callback` - 代理转发

  **Acceptance Criteria**:
  - [ ] `src/proxy/server.ts` 存在
  - [ ] 代理服务器可启动并监听端口
  - [ ] curl 请求代理端点可转发到真实 API

  **QA Scenarios**:
  ```
  Scenario: 代理服务器启动
    Tool: Bash
    Preconditions: 代理模块已实现
    Steps:
      1. npm run proxy:start
      2. curl -X POST http://localhost:8080/v1/chat/completions -H "Authorization: Bearer test" -d '{"model":"gpt-4","messages":[]}'
    Expected Result: 返回代理响应（可能错误但服务器正常处理）
    Evidence: .sisyphus/evidence/task-07-proxy-start.log
  ```

  **Commit**: YES (Wave 2)
  - Message: `feat(core): http proxy server`
  - Files: `src/proxy/server.ts`

- [ ] 8. API 请求拦截器

  **What to do**:
  - 创建请求拦截器中间件架构
  - 实现 pre-request hook（请求前处理）
  - 实现 post-response hook（响应后处理）
  - 支持注册多个拦截器（优化策略）
  - 实现拦截器执行链（按顺序执行）
  - 添加拦截器配置接口（启用/禁用）
  - 实现拦截器日志记录

  **Must NOT do**:
  - 不阻塞拦截器执行链
  - 不在拦截器中修改非必要内容
  - 不跳过错误处理

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 拦截器架构需要设计灵活的中间件系统
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9-13，但依赖 Task 7)
  - **Blocks**: Task 14-19
  - **Blocked By**: Task 7, 4

  **References**:
  - Middleware pattern: 参考 Express/Koa 中间件设计
  - Interceptor chain: `https://expressjs.com/en/guide/using-middleware.html` - 中间件链

  **Acceptance Criteria**:
  - [ ] `src/proxy/interceptor.ts` 存在
  - [ ] 拦截器链可正常执行
  - [ ] 可注册多个拦截器

  **QA Scenarios**:
  ```
  Scenario: 拦截器链执行
    Tool: Bash
    Preconditions: 拦截器已实现
    Steps:
      1. 添加测试拦截器到链
      2. 发送请求通过代理
      3. 检查拦截器日志
    Expected Result: 日志显示拦截器按顺序执行
    Evidence: .sisyphus/evidence/task-08-interceptor-chain.log
  ```

  **Commit**: YES (Wave 2)
  - Message: `feat(core): api request interceptor`
  - Files: `src/proxy/interceptor.ts`

- [ ] 9. 配置管理服务

  **What to do**:
  - 创建配置 CRUD 服务
  - 实现配置读取（从 SQLite）
  - 实现配置写入（更新 SQLite）
  - 支持默认配置值
  - 实现配置验证逻辑
  - 创建 IPC 接口供渲染进程调用
  - 支持配置导出/导入

  **Must NOT do**:
  - 不存储敏感配置到未加密文件
  - 不使用硬编码配置值
  - 不跳过配置验证

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 配置服务是标准 CRUD 实现
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 10-13，但依赖 Task 3)
  - **Blocks**: Task 20-26
  - **Blocked By**: Task 3, 4

  **References**:
  - SQLite CRUD: `https://github.com/WiseLibs/better-sqlite3/wiki/API` - 数据操作

  **Acceptance Criteria**:
  - [ ] `src/services/config.ts` 存在
  - [ ] 可读取和写入配置
  - [ ] IPC 接口正常工作

  **QA Scenarios**:
  ```
  Scenario: 配置读写
    Tool: Bash (sqlite3)
    Preconditions: 配置服务已实现
    Steps:
      1. sqlite3 tokenbao.db "SELECT * FROM config WHERE key='proxy_port'"
      2. npm run config:set -- --key proxy_port --value 9090
      3. sqlite3 tokenbao.db "SELECT * FROM config WHERE key='proxy_port'"
    Expected Result: 初始值 8080，更新后 9090
    Evidence: .sisyphus/evidence/task-09-config.log
  ```

  **Commit**: YES (Wave 2)
  - Message: `feat(core): config management service`
  - Files: `src/services/config.ts`

- [ ] 10. API Key 管理服务

  **What to do**:
  - 创建 API Key CRUD 服务
  - 实现添加 API Key（加密存储）
  - 实现删除 API Key
  - 实现列出所有 API Key（返回脱敏列表）
  - 实现获取单个 API Key（解密）
  - 支持 API Key 标签命名
  - 支持 API Key 类型标记（OpenAI/Claude/其他）
  - 创建 IPC 接口

  **Must NOT do**:
  - 不返回明文 API Key 到渲染进程（除非请求解密）
  - 不存储明文 API Key
  - 不删除未验证的 API Key

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: API Key 管理是标准 CRUD 实现
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7-9, 11-13)
  - **Blocks**: Task 24
  - **Blocked By**: Task 3, 4, 6

  **References**:
  - 加密模块: `src/utils/crypto.ts` - 使用已实现的加密函数

  **Acceptance Criteria**:
  - [ ] `src/services/apiKey.ts` 存在
  - [ ] 可加密添加 API Key
  - [ ] 可列出脱敏 API Key 列表

  **QA Scenarios**:
  ```
  Scenario: API Key 添加
    Tool: Bash (sqlite3)
    Preconditions: 服务已实现
    Steps:
      1. npm run apikey:add -- --name "OpenAI" --type openai --key "sk-test-123"
      2. sqlite3 tokenbao.db "SELECT name, type FROM api_keys"
    Expected Result: 显示 "OpenAI | openai"，key 字段为加密值
    Evidence: .sisyphus/evidence/task-10-apikey.log
  ```

  **Commit**: YES (Wave 2)
  - Message: `feat(core): api key management service`
  - Files: `src/services/apiKey.ts`

- [ ] 11. 请求历史记录服务

  **What to do**:
  - 创建请求历史 CRUD 服务
  - 实现请求记录存储（请求体、响应体、token 数、成本、时间）
  - 实现历史查询（按时间、按 API、按模型）
  - 实现历史导出（JSON/CSV）
  - 实现历史删除（单条/批量/按时间）
  - 实现数据保留策略（自动清理超过30天记录）
  - 创建 IPC 接口

  **Must NOT do**:
  - 不存储敏感请求内容（如包含密码的请求）
  - 不保留无限历史记录
  - 不阻塞请求流程记录历史

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 历史记录服务是标准 CRUD 实现
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7-10, 12, 13)
  - **Blocks**: Task 25
  - **Blocked By**: Task 3, 4

  **References**:
  - SQLite CRUD: `https://github.com/WiseLibs/better-sqlite3/wiki/API`

  **Acceptance Criteria**:
  - [ ] `src/services/history.ts` 存在
  - [ ] 可记录请求历史
  - [ ] 可查询历史记录

  **QA Scenarios**:
  ```
  Scenario: 请求历史记录
    Tool: Bash (sqlite3)
    Preconditions: 服务已实现，代理已发送测试请求
    Steps:
      1. sqlite3 tokenbao.db "SELECT COUNT(*) FROM requests"
    Expected Result: 计数 >= 1（有历史记录）
    Evidence: .sisyphus/evidence/task-11-history.log
  ```

  **Commit**: YES (Wave 2)
  - Message: `feat(core): request history service`
  - Files: `src/services/history.ts`

- [ ] 12. 成本预算服务

  **What to do**:
  - 创建预算管理服务
  - 实现预算设置（月度限额、日限额）
  - 实现成本累计（从请求历史汇总）
  - 实现预算检查（当前使用 vs 限额）
  - 实现超限提醒（通知渲染进程）
  - 实现预算报告生成
  - 创建 IPC 接口

  **Must NOT do**:
  - 不阻断请求仅因预算警告（用户选择）
  -不使用硬编码成本价格（应可配置）
  - 不存储敏感预算信息到未加密文件

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 预算服务是标准数据汇总实现
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7-11, 13)
  - **Blocks**: Task 21
  - **Blocked By**: Task 3, 4, 11

  **References**:
  - OpenAI Pricing: `https://openai.com/pricing` - 成本计算参考
  - Claude Pricing: `https://www.anthropic.com/pricing` - 成本计算参考

  **Acceptance Criteria**:
  - [ ] `src/services/budget.ts` 存在
  - [ ] 可设置预算限额
  - [ ] 可计算当前成本使用

  **QA Scenarios**:
  ```
  Scenario: 预算设置和检查
    Tool: Bash
    Preconditions: 服务已实现
    Steps:
      1. npm run budget:set -- --monthly 100
      2. npm run budget:status
    Expected Result: 显示预算限额和当前使用
    Evidence: .sisyphus/evidence/task-12-budget.log
  ```

  **Commit**: YES (Wave 2)
  - Message: `feat(core): budget management service`
  - Files: `src/services/budget.ts`

- [ ] 13. 统计数据服务

  **What to do**:
  - 创建统计数据汇总服务
  - 实现 Token 使用统计（按 API、按模型、按时间）
  - 实现成本统计（按 API、按模型、按时间）
  - 实现请求统计（成功/失败/缓存命中）
  - 实现优化效果统计（节省的 token 和成本）
  - 实现统计数据可视化接口（返回图表数据格式）
  - 创建 IPC 接口

  **Must NOT do**:
  - 不计算实时统计（使用缓存或定期更新）
  - 不返回过度详细统计（保持简洁）
  - 不阻塞请求流程计算统计

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 统计服务是数据聚合实现
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7-12)
  - **Blocks**: Task 22
  - **Blocked By**: Task 3, 4, 11

  **References**:
  - SQLite Aggregation: `https://www.sqlite.org/lang_aggfunc.html` - 聚合函数

  **Acceptance Criteria**:
  - [ ] `src/services/stats.ts` 存在
  - [ ] 可汇总 Token 使用统计
  - [ ] 可汇总成本统计

  **QA Scenarios**:
  ```
  Scenario: 统计数据汇总
    Tool: Bash
    Preconditions: 服务已实现，有请求历史
    Steps:
      1. npm run stats:summary
    Expected Result: 输出包含 totalTokens, totalCost, byApi, byModel
    Evidence: .sisyphus/evidence/task-13-stats.log
  ```

  **Commit**: YES (Wave 2)
  - Message: `feat(core): statistics service`
  - Files: `src/services/stats.ts`

- [ ] 14. Prompt Caching 模块

  **What to do**:
  - 创建 Prompt Caching 拦截器
  - 实现 Claude cache_control 添加逻辑：
    - 标记 system prompt 为可缓存
    - 标记对话历史前 N 轮为可缓存
    - 设置 TTL（5分钟或1小时）
  - 实现 OpenAI 自动缓存检测：
    - 检测 ≥1024 tokens 的重复前缀
    - 添加缓存提示到请求
  - 实现缓存命中检测和日志记录
  - 实现缓存配置接口（启用/禁用、TTL 选择）

  **Must NOT do**:
  - 不缓存用户消息（仅缓存 system 和历史）
  - 不强制缓存不满足条件的请求
  - 不跳过缓存命中记录（用于统计）

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Prompt Caching 是核心优化策略，需要理解各 API 的 caching 机制
  - **Skills**: [`aliyun-bailian-coding`]
    - `aliyun-bailian-coding`: 需要权衡不同 API 的 caching 实现差异
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 15-19)
  - **Blocks**: Task 26
  - **Blocked By**: Task 7, 8, 4

  **References**:
  - Claude Caching: `https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching` - Anthropic 官方文档
  - OpenAI Caching: `https://platform.openai.com/docs/api-reference/chat/create` - 自动缓存说明

  **Acceptance Criteria**:
  - [ ] `src/optimizations/caching.ts` 存在
  - [ ] Claude 请求包含 cache_control
  - [ ] 缓存命中可检测和记录

  **QA Scenarios**:
  ```
  Scenario: Claude Caching 应用
    Tool: Bash (curl)
    Preconditions: 模块已实现，代理已启动
    Steps:
      1. curl -X POST http://localhost:8080/v1/messages -H "Authorization: Bearer test-claude" -d '{"model":"claude-3-opus","system":"Long system prompt...","messages":[]}'
      2. 检查请求日志
    Expected Result: 日志显示 cache_control 已添加
    Evidence: .sisyphus/evidence/task-14-caching.log

  Scenario: OpenAI 自动缓存检测
    Tool: Bash (curl)
    Preconditions: 模块已实现，代理已启动
    Steps:
      1. 发送 ≥1024 tokens 的相同前缀请求两次
      2. 检查第二次请求响应
    Expected Result: 第二次响应显示 cache hit 标记
    Evidence: .sisyphus/evidence/task-14-caching-openai.log
  ```

  **Commit**: YES (Wave 3)
  - Message: `feat(optimization): prompt caching module`
  - Files: `src/optimizations/caching.ts`

- [ ] 15. Prompt 压缩模块

  **What to do**:
  - 创建 Prompt 压缩拦截器
  - 实现冗余文本移除：
    - 移除礼貌用语（"please", "I would like"）
    - 移除重复描述
    - 简化指令表达
  - 实现缩写替换：
    - "response in JSON format" → "resp: JSON"
    - "field name is string type" → "name: str"
  - 实现上下文精简：
    - 提取关键段落而非全文
    - 去除不必要的示例
  - 实现压缩配置接口（启用/禁用、压缩级别）
  - 实现 token 计数对比（压缩前后）

  **Must NOT do**:
  - 不压缩关键语义（保持功能完整）
  - 不过度压缩导致模型理解困难
  - 不压缩用户输入消息（仅压缩 system prompt）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Prompt 压缩需要平衡语义保留和 token 减少
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 16-19)
  - **Blocks**: Task 26
  - **Blocked By**: Task 7, 8, 4

  **References**:
  - Prompt Engineering: `https://platform.openai.com/docs/guides/prompt-engineering` - Prompt 设计原则

  **Acceptance Criteria**:
  - [ ] `src/optimizations/compression.ts` 存在
  - [ ] 可压缩 system prompt
  - [ ] 压缩后 token 数减少

  **QA Scenarios**:
  ```
  Scenario: Prompt 压缩效果
    Tool: Bash (Node REPL)
    Preconditions: 模块已实现
    Steps:
      1. node -e "const {compress} = require('./src/optimizations/compression'); const result = compress('I would like you to please help me by generating a response in JSON format'); console.log(result.text, result.tokensSaved);"
    Expected Result: 压缩后文本更短，tokensSaved > 0
    Evidence: .sisyphus/evidence/task-15-compression.log
  ```

  **Commit**: YES (Wave 3)
  - Message: `feat(optimization): prompt compression module`
  - Files: `src/optimizations/compression.ts`

- [ ] 16. 智能模型路由模块

  **What to do**:
  - 创建模型路由拦截器
  - 实现任务类型检测：
    - 分类任务 → 路由到低价模型
    - 提取任务 → 路由到低价模型
    - 简单问答 → 路由到低价模型
    - 复杂推理 → 保留高价模型
    - 代码生成 → 保留高价模型
  - 实现模型映射配置：
    - OpenAI: gpt-4 → gpt-3.5-turbo
    - Claude: claude-3-opus → claude-3-haiku
  - 实现路由规则配置接口
  - 实现路由日志记录

  **Must NOT do**:
  - 不路由所有请求到低价模型（保持质量）
  - 不改变用户明确指定的模型
  - 不路由复杂任务到低价模型

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 模型路由需要智能判断任务复杂度
  - **Skills**: [`aliyun-bailian-coding`]
    - `aliyun-bailian-coding`: 需要设计任务复杂度判断逻辑
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14, 15, 17-19)
  - **Blocks**: Task 26
  - **Blocked By**: Task 7, 8, 4

  **References**:
  - Model Pricing: OpenAI/Claude 官方定价页面

  **Acceptance Criteria**:
  - [ ] `src/optimizations/routing.ts` 存在
  - [ ] 可检测任务类型
  - [ ] 可路由到低价模型

  **QA Scenarios**:
  ```
  Scenario: 简单任务路由
    Tool: Bash (curl)
    Preconditions: 模块已实现，代理已启动
    Steps:
      1. curl -X POST http://localhost:8080/v1/chat/completions -H "Authorization: Bearer test" -d '{"model":"gpt-4","messages":[{"role":"user","content":"classify this: apple"}]}'
      2. 检查请求日志
    Expected Result: 日志显示路由到 gpt-3.5-turbo
    Evidence: .sisyphus/evidence/task-16-routing.log

  Scenario: 复杂任务保留原模型
    Tool: Bash (curl)
    Preconditions: 模块已实现
    Steps:
      1. curl -X POST http://localhost:8080/v1/chat/completions -H "Authorization: Bearer test" -d '{"model":"gpt-4","messages":[{"role":"user","content":"solve this complex math problem: ..."}]}'
    Expected Result: 日志显示保留 gpt-4
    Evidence: .sisyphus/evidence/task-16-routing-complex.log
  ```

  **Commit**: YES (Wave 3)
  - Message: `feat(optimization): smart model routing module`
  - Files: `src/optimizations/routing.ts`

- [ ] 17. 请求批处理模块

  **What to do**:
  - 创建批处理拦截器
  - 实现请求收集机制：
    - 相同类型的请求合并
    - 相似 prompt 的请求合并
  - 实现 OpenAI Batch API 调用：
    - 创建 batch 请求文件
    - 提交 batch 任务
    - 获取 batch 结果
  - 实现 Claude Messages Batches API 调用
  - 实现批处理状态跟踪
  - 实现批处理配置接口（启用/禁用、批处理窗口时间）

  **Must NOT do**:
  - 不批处理实时请求（仅批处理非紧急请求）
  - 不无限等待批处理窗口（设置超时）
  - 不跳过批处理失败处理（返回单个请求）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 批处理需要设计复杂的请求合并和状态管理逻辑
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14-16, 18, 19)
  - **Blocks**: Task 26
  - **Blocked By**: Task 7, 8, 4

  **References**:
  - OpenAI Batch API: `https://platform.openai.com/docs/api-reference/batch` - 批处理 API
  - Claude Batches: `https://docs.anthropic.com/en/docs/build-with-claude/message-batches` - Anthropic 批处理

  **Acceptance Criteria**:
  - [ ] `src/optimizations/batch.ts` 存在
  - [ ] 可收集相似请求
  - [ ] 可提交批处理任务

  **QA Scenarios**:
  ```
  Scenario: 批处理任务提交
    Tool: Bash
    Preconditions: 模块已实现
    Steps:
      1. npm run batch:add -- --prompt "test prompt 1"
      2. npm run batch:add -- --prompt "test prompt 2"
      3. npm run batch:submit
      4. npm run batch:status
    Expected Result: 显示批处理任务状态（pending/completed）
    Evidence: .sisyphus/evidence/task-17-batch.log
  ```

  **Commit**: YES (Wave 3)
  - Message: `feat(optimization): request batching module`
  - Files: `src/optimizations/batch.ts`

- [ ] 18. 自定义规则引擎

  **What to do**:
  - 创建规则引擎服务
  - 实现规则定义接口：
    - 规则类型（替换、过滤、路由）
    - 规则条件（匹配模式）
    - 规则动作（执行操作）
  - 实现规则 CRUD
  - 实现规则执行引擎：
    - 规则匹配（正则/条件）
    - 规则应用（修改请求）
  - 实现规则优先级排序
  - 实现规则测试接口

  **Must NOT do**:
  - 不执行未验证的规则
  - 不允许规则删除核心请求字段
  - 不创建过度复杂的规则语法（保持简单）

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 规则引擎需要设计灵活但安全的规则执行系统
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14-17, 19)
  - **Blocks**: Task 26
  - **Blocked By**: Task 7, 8, 4

  **References**:
  - Rule Engine Pattern: 参考 JSON rule engine 设计

  **Acceptance Criteria**:
  - [ ] `src/optimizations/rules.ts` 存在
  - [ ] 可定义和存储规则
  - [ ] 可执行规则匹配和应用

  **QA Scenarios**:
  ```
  Scenario: 自定义规则应用
    Tool: Bash
    Preconditions: 规则引擎已实现
    Steps:
      1. npm run rule:add -- --type replace --pattern "old-value" --replacement "new-value"
      2. curl 请求包含 "old-value"
      3. 检查请求日志
    Expected Result: 日志显示 "old-value" 替换为 "new-value"
    Evidence: .sisyphus/evidence/task-18-rules.log
  ```

  **Commit**: YES (Wave 3)
  - Message: `feat(optimization): custom rules engine`
  - Files: `src/optimizations/rules.ts`

- [ ] 19. Token 计数器

  **What to do**:
  - 创建 Token 计数服务
  - 实现 OpenAI token 计数（使用 tiktoken 库）
  - 实现 Claude token 计数（估算或使用官方库）
  - 实现请求 token 计数（输入）
  - 实现响应 token 计数（输出）
  - 实现缓存 token 计数（缓存命中）
  - 实现成本估算（基于 token 数和模型价格）

  **Must NOT do**:
  - 不使用不准确计数方法（尽可能精确）
  - 不跳过缓存 token 计数
  - 不返回误差过大的估算值

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Token 计数是标准化计算实现
  - **Skills**: []
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14-18)
  - **Blocks**: Task 22, 26
  - **Blocked By**: Task 7, 8, 4

  **References**:
  - tiktoken: `https://github.com/openai/tiktoken` - OpenAI token 计数库
  - Claude Token Counting: `https://docs.anthropic.com/en/docs/build-with-claude/tokens` - Anthropic 文档

  **Acceptance Criteria**:
  - [ ] `src/utils/tokenCounter.ts` 存在
  - [ ] 可计数 OpenAI tokens
  - [ ] 可计数 Claude tokens

  **QA Scenarios**:
  ```
  Scenario: Token 计数测试
    Tool: Bash (Node REPL)
    Preconditions: 计数器已实现
    Steps:
      1. node -e "const {countTokens} = require('./src/utils/tokenCounter'); console.log(countTokens('This is a test sentence', 'openai'));"
    Expected Result: 输出 token 数（约 5-6）
    Evidence: .sisyphus/evidence/task-19-token.log
  ```

  **Commit**: YES (Wave 3)
  - Message: `feat(optimization): token counter`
  - Files: `src/utils/tokenCounter.ts`

- [ ] 20. 主窗口布局 + 导航

  **What to do**:
  - 创建主布局组件
  - 实现侧边栏导航（控制面板、监控、设置、历史、API Keys）
  - 实现顶部标题栏（应用名称、状态指示）
  - 实现主内容区域（路由切换）
  - 使用 TailwindCSS 或 CSS 样式
  - 实现响应式布局（适应窗口大小）

  **Must NOT do**:
  - 不使用重型 UI 库（保持轻量）
  - 不创建过度复杂的动画效果
  - 不使用 AI slop 代码模式（如过度抽象）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 布局需要设计美观的用户界面
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: 用于设计合理的布局和导航结构
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 21-26)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1, 2, 9-13

  **References**:
  - React Router: `https://reactrouter.com/en/main` - 路由实现
  - TailwindCSS: `https://tailwindcss.com/docs/layout` - 布局样式

  **Acceptance Criteria**:
  - [ ] `src/renderer/components/Layout.tsx` 存在
  - [ ] 导航可切换不同页面
  - [ ] 布局美观无错位

  **QA Scenarios**:
  ```
  Scenario: 主窗口布局渲染
    Tool: Playwright
    Preconditions: 应用已启动
    Steps:
      1. page.goto('http://localhost:5173')
      2. page.waitForSelector('.sidebar')
      3. page.click('[data-testid="nav-monitor"]')
      4. page.waitForSelector('.monitor-page')
    Expected Result: 页面切换到监控页面，无布局错位
    Evidence: .sisyphus/evidence/task-20-layout.png (screenshot)
  ```

  **Commit**: YES (Wave 4)
  - Message: `feat(ui): main layout and navigation`
  - Files: `src/renderer/components/Layout.tsx`

- [ ] 21. 控制面板页面

  **What to do**:
  - 创建控制面板组件
  - 实现优化策略开关：
    - Prompt Caching 启用/禁用
    - Prompt 压缩启用/禁用
    - 模型路由启用/禁用
    - 请求批处理启用/禁用
  - 实现代理状态显示（运行/停止、端口）
  - 实现预算状态显示（当前使用/限额）
  - 实现快速操作按钮（启动/停止代理）

  **Must NOT do**:
  - 不添加多余的控制项
  - 不使用复杂的开关动画
  - 不跳过状态同步（实时更新）

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 控制面板是核心 UI，需要清晰的操作界面
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: 用于设计清晰的控制面板布局
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 20, 22-26)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 20, 12

  **References**:
  - IPC Call: 使用 preload 脚本调用主进程服务

  **Acceptance Criteria**:
  - [ ] `src/renderer/pages/ControlPanel.tsx` 存在
  - [ ] 可切换优化策略开关
  - [ ] 代理状态实时显示

  **QA Scenarios**:
  ```
  Scenario: 控制面板交互
    Tool: Playwright
    Preconditions: 应用已启动
    Steps:
      1. page.goto('http://localhost:5173/control')
      2. page.click('[data-testid="toggle-caching"]')
      3. 等待 1 秒
      4. page.click('[data-testid="start-proxy"]')
      5. 等待 2 秒
      6. 检查状态显示
    Expected Result: 开关状态改变，代理启动成功
    Evidence: .sisyphus/evidence/task-21-control.png (screenshot)
  ```

  **Commit**: YES (Wave 4)
  - Message: `feat(ui): control panel page`
  - Files: `src/renderer/pages/ControlPanel.tsx`

- [ ] 22. 监控仪表盘页面

  **What to do**:
  - 创建监控仪表盘组件
  - 实现统计图表显示：
    - Token 使用趋势图（时间线）
    - 成本分布图（按 API/模型）
    - 请求成功率图
    - 缓存命中率图
  - 实现实时数据更新（定时刷新或事件推送）
  - 实现时间范围选择（今日/本周/本月）
  - 使用简单图表库（如 recharts）

  **Must NOT do**:
  - 不使用重型图表库（保持轻量）
  -不显示过度详细数据（保持简洁）
  - 不阻塞 UI 刷新数据

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 监控仪表盘需要设计数据可视化界面
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: 用于设计美观的图表布局
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 20, 21, 23-26)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 20, 13, 19

  **References**:
  - recharts: `https://recharts.org/en-US/` - React 图表库
  - IPC Call: 获取统计数据

  **Acceptance Criteria**:
  - [ ] `src/renderer/pages/Monitor.tsx` 存在
  - [ ] 可显示 Token 使用图表
  - [ ] 可显示成本分布图表

  **QA Scenarios**:
  ```
  Scenario: 监控仪表盘渲染
    Tool: Playwright
    Preconditions: 应用已启动，有统计数据
    Steps:
      1. page.goto('http://localhost:5173/monitor')
      2. page.waitForSelector('.token-chart')
      3. page.waitForSelector('.cost-chart')
      4. 截图
    Expected Result: 图表正常渲染，显示数据
    Evidence: .sisyphus/evidence/task-22-monitor.png (screenshot)
  ```

  **Commit**: YES (Wave 4)
  - Message: `feat(ui): monitor dashboard page`
  - Files: `src/renderer/pages/Monitor.tsx`

- [ ] 23. 设置页面

  **What to do**:
  - 创建设置页面组件
  - 实现配置项编辑：
    - 代理端口设置
    - 数据保留天数设置
    - 默认模型映射设置
    - 缓存 TTL 设置
  - 实现配置保存按钮
  - 实现配置导入/导出按钮
  - 实现配置验证（无效值提示）

  **Must NOT do**:
  - 不添加多余配置项
  - 不跳过配置验证
  - 不保存未验证的配置

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 设置页面需要清晰的配置界面
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: 用于设计清晰的设置表单
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 20-22, 24-26)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 20, 9

  **References**:
  - IPC Call: 配置读写

  **Acceptance Criteria**:
  - [ ] `src/renderer/pages/Settings.tsx` 存在
  - [ ] 可编辑和保存配置
  - [ ] 配置验证正常工作

  **QA Scenarios**:
  ```
  Scenario: 设置保存
    Tool: Playwright
    Preconditions: 应用已启动
    Steps:
      1. page.goto('http://localhost:5173/settings')
      2. page.fill('[data-testid="proxy-port"]', '9090')
      3. page.click('[data-testid="save-settings"]')
      4. 等待 1 秒
      5. 检查保存成功提示
    Expected Result: 显示保存成功，端口更新为 9090
    Evidence: .sisyphus/evidence/task-23-settings.png (screenshot)
  ```

  **Commit**: YES (Wave 4)
  - Message: `feat(ui): settings page`
  - Files: `src/renderer/pages/Settings.tsx`

- [ ] 24. API Key 管理页面

  **What to do**:
  - 创建 API Key 管理组件
  - 实现添加 API Key 表单：
    - 名称输入
    - 类型选择（OpenAI/Claude/其他）
    - Key 输入
  - 实现删除 API Key 按钮
  - 实现列出 API Key 表格（脱敏显示）
  - 实现编辑 API Key 按钮（更新名称）
  - 实现安全提示（加密存储说明）

  **Must NOT do**:
  - 不显示明文 API Key（仅显示脱敏）
  - 不跳过添加验证
  - 不允许未确认删除

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: API Key 管理需要安全且清晰的界面
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: 用于设计安全的 Key 管理界面
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 20-23, 25, 26)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 20, 10

  **References**:
  - IPC Call: API Key CRUD

  **Acceptance Criteria**:
  - [ ] `src/renderer/pages/ApiKeys.tsx` 存在
  - [ ] 可添加和删除 API Key
  - [ ] API Key 脱敏显示

  **QA Scenarios**:
  ```
  Scenario: API Key 添加
    Tool: Playwright
    Preconditions: 应用已启动
    Steps:
      1. page.goto('http://localhost:5173/api-keys')
      2. page.click('[data-testid="add-key"]')
      3. page.fill('[data-testid="key-name"]', 'Test Key')
      4. page.selectOption('[data-testid="key-type"]', 'openai')
      5. page.fill('[data-testid="key-value"]', 'sk-test-123')
      6. page.click('[data-testid="save-key"]')
      7. 等待 1 秒
      8. 检查表格显示新 Key
    Expected Result: 表格显示 "Test Key | openai | sk-tes..."
    Evidence: .sisyphus/evidence/task-24-apikeys.png (screenshot)

  Scenario: API Key 删除确认
    Tool: Playwright
    Preconditions: 有已存在的 API Key
    Steps:
      1. page.goto('http://localhost:5173/api-keys')
      2. page.click('[data-testid="delete-key-1"]')
      3. 等待确认对话框
      4. page.click('[data-testid="confirm-delete"]')
      5. 等待 1 秒
      6. 检查表格
    Expected Result: Key 从表格中移除
    Evidence: .sisyphus/evidence/task-24-apikeys-delete.png (screenshot)
  ```

  **Commit**: YES (Wave 4)
  - Message: `feat(ui): api keys management page`
  - Files: `src/renderer/pages/ApiKeys.tsx`

- [ ] 25. 历史记录页面

  **What to do**:
  - 创建历史记录组件
  - 实现请求历史表格：
    - 时间、API、模型、输入 tokens、输出 tokens、成本、缓存命中
  - 实现筛选功能：
    - 按时间范围筛选
    - 按 API 类型筛选
    - 按模型筛选
  - 实现搜索功能（搜索 prompt 内容）
  - 实现导出功能（JSON/CSV）
  - 实现分页显示

  **Must NOT do**:
  - 不显示敏感请求内容（如有密码）
  - 不加载所有历史记录（分页加载）
  - 不跳过筛选和搜索

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 历史记录页面需要设计数据表格和筛选界面
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: 用于设计清晰的数据表格
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 20-24, 26)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 20, 11

  **References**:
  - IPC Call: 历史记录查询

  **Acceptance Criteria**:
  - [ ] `src/renderer/pages/History.tsx` 存在
  - [ ] 可显示历史记录表格
  - [ ] 可筛选和搜索

  **QA Scenarios**:
  ```
  Scenario: 历史记录筛选
    Tool: Playwright
    Preconditions: 应用已启动，有历史记录
    Steps:
      1. page.goto('http://localhost:5173/history')
      2. page.waitForSelector('.history-table')
      3. page.selectOption('[data-testid="filter-api"]', 'openai')
      4. 等待 1 秒
      5. 检查表格仅显示 OpenAI 记录
    Expected Result: 表格仅包含 OpenAI API 记录
    Evidence: .sisyphus/evidence/task-25-history.png (screenshot)
  ```

  **Commit**: YES (Wave 4)
  - Message: `feat(ui): request history page`
  - Files: `src/renderer/pages/History.tsx`

- [ ] 26. 优化策略配置页面

  **What to do**:
  - 创建优化策略配置组件
  - 实现各策略详细配置：
    - Prompt Caching: TTL 选择、缓存范围选择
    - Prompt 压缩: 压缩级别选择
    - 模型路由: 任务类型映射配置
    - 请求批处理: 批处理窗口时间、最大批次大小
    - 自定义规则: 规则列表、添加/编辑/删除规则
  - 实现配置保存按钮
  - 实现策略测试按钮（验证配置效果）

  **Must NOT do**:
  - 不添加多余配置项
  - 不跳过配置验证
  - 不允许未测试的规则保存

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 优化策略配置需要清晰的配置界面
  - **Skills**: [`/frontend-ui-ux`]
    - `/frontend-ui-ux`: 用于设计清晰的配置表单
  - **Skills Evaluated but Omitted**: 无

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 20-25)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 20, 14-19

  **References**:
  - IPC Call: 优化策略配置

  **Acceptance Criteria**:
  - [ ] `src/renderer/pages/Optimization.tsx` 存在
  - [ ] 可配置各优化策略
  - [ ] 配置可保存

  **QA Scenarios**:
  ```
  Scenario: 优化策略配置
    Tool: Playwright
    Preconditions: 应用已启动
    Steps:
      1. page.goto('http://localhost:5173/optimization')
      2. page.waitForSelector('.optimization-config')
      3. page.selectOption('[data-testid="caching-ttl"]', '1hour')
      4. page.click('[data-testid="save-optimization"]')
      5. 等待 1 秒
      6. 检查保存成功提示
    Expected Result: 显示保存成功
    Evidence: .sisyphus/evidence/task-26-optimization.png (screenshot)

  Scenario: 自定义规则添加
    Tool: Playwright
    Preconditions: 应用已启动
    Steps:
      1. page.goto('http://localhost:5173/optimization')
      2. page.click('[data-testid="add-rule"]')
      3. page.fill('[data-testid="rule-pattern"]', 'test-pattern')
      4. page.fill('[data-testid="rule-replacement"]', 'replacement')
      5. page.click('[data-testid="test-rule"]')
      6. 检查测试结果
      7. page.click('[data-testid="save-rule"]')
    Expected Result: 规则测试成功并保存
    Evidence: .sisyphus/evidence/task-26-optimization-rule.png (screenshot)
  ```

  **Commit**: YES (Wave 4)
  - Message: `feat(ui): optimization strategy configuration page`
  - Files: `src/renderer/pages/Optimization.tsx`

---

## Final Verification Wave (MANDATORY)

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist.

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + tests. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, unused imports. Check AI slop patterns.

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance.

---

## Commit Strategy

- **Wave 1**: `feat(init): project scaffolding and infrastructure` - 多文件
- **Wave 2**: `feat(core): proxy server and data management` - 多文件
- **Wave 3**: `feat(optimization): optimization strategy modules` - 多文件
- **Wave 4**: `feat(ui): React frontend pages` - 多文件
- **Final**: `release: v1.0.0 ready for distribution`

---

## Success Criteria

### Verification Commands
```bash
# 启动应用
npm start  # Expected: Electron window appears

# 运行代理
curl http://localhost:8080/v1/chat/completions  # Expected: proxy response

# 运行测试
npm test  # Expected: all tests pass

# 构建打包
npm run build  # Expected: distributable installer created
```

### Final Checklist
- [ ] 应用可正常启动
- [ ] 代理服务器正常运行
- [ ] 所有优化策略可配置
- [ ] Token 统计可视化
- [ ] API Key 加密存储
- [ ] 预算限额正常提醒
- [ ] 历史记录可查询
- [ ] 可打包分发