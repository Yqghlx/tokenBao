# TokenBao 改进设计文档

## 概述

根据代码审查报告，改进 TokenBao 项目的测试覆盖、前端健壮性和数据持久化。

## 范围

### Task 1: 测试覆盖
- crypto.ts - 加密/解密测试
- optimizations/compression.ts - 压缩效果测试
- optimizations/routing.ts - 路由策略测试
- optimizations/caching.ts - 缓存标记测试
- utils/tokenCounter.ts - Token 计算测试
- utils/storage.ts - JSON 存取测试

### Task 2: 前端加固
- ErrorBoundary 组件捕获渲染错误
- API Key 格式验证
- 输入字段验证

### Task 3: 数据持久化
- caching.ts 缓存数据存储到文件
- rules.ts 规则数据存储到文件

## 架构

保持现有架构，仅添加：
- `src/__tests__/` 目录扩展测试
- `src/renderer/components/ErrorBoundary.tsx` 新组件
- 扩展 `src/utils/storage.ts` 功能

## 文件变更

| 文件 | 操作 |
|---|---|
| src/__tests__/crypto.test.ts | 新增 |
| src/__tests__/compression.test.ts | 新增 |
| src/__tests__/routing.test.ts | 新增 |
| src/__tests__/caching.test.ts | 新增 |
| src/__tests__/tokenCounter.test.ts | 新增 |
| src/__tests__/storage.test.ts | 新增 |
| src/renderer/components/ErrorBoundary.tsx | 新增 |
| src/renderer/App.tsx | 修改（添加 ErrorBoundary） |
| src/renderer/pages/ApiKeys.tsx | 修改（添加验证） |
| src/optimizations/caching.ts | 修改（持久化） |
| src/optimizations/rules.ts | 修改（持久化） |

## 成功标准

- `npm test` → 所有测试通过
- 前端错误不再导致白屏
- 应用重启后缓存和规则数据保留

## 约束

- 不改变现有 API 接口
- 保持向后兼容
- 不引入新外部依赖（测试框架已存在）