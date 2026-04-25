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

- [x] 1. Electron 项目初始化 + 配置

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

- [x] 2. React 前端项目初始化

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

- [x] 3. SQLite 数据库设计 + 初始化

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

- [x] 4. 类型定义 + 共享接口

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

- [x] 5. 测试基础设施搭建

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

- [x] 6. API Key 加密模块

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

- [x] 7. HTTP 代理服务器核心
- [x] 8. API 请求拦截器
- [x] 9. 配置管理服务
- [x] 10. API Key 管理服务
- [x] 11. 请求历史记录服务
- [x] 12. 成本预算服务
- [x] 13. 统计数据服务
- [x] 14. Prompt Caching 模块
- [x] 15. Prompt 压缩模块
- [x] 16. 智能模型路由模块
- [x] 17. 请求批处理模块
- [x] 18. 自定义规则引擎
- [x] 19. Token 计数器
- [x] 20. 主窗口布局 + 导航
- [x] 21. 控制面板页面
- [x] 22. 监控仪表盘页面
- [x] 23. 设置页面
- [x] 24. API Key 管理页面
- [x] 25. 历史记录页面
- [x] 26. 优化策略配置页面

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

## Plan Completion

✅ **ALL TASKS COMPLETED** - 30/30

| Wave | Tasks | Status |
|------|-------|---------|
| Wave 1 | 6 | ✅ Complete |
| Wave 2 | 7 | ✅ Complete |
| Wave 3 | 6 | ✅ Complete |
| Wave 4 | 7 | ✅ Complete |
| Final | 4 | ✅ Complete |

- [x] F1. **Plan Compliance Audit** — `oracle`
- [x] F2. **Code Quality Review** — `unspecified-high`
- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
- [x] F4. **Scope Fidelity Check** — `deep`
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