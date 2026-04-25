# TokenBao 改进实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升 TokenBao 项目质量：测试覆盖、前端健壮性、数据持久化

**Architecture:** 保持现有架构，添加测试、ErrorBoundary组件、持久化功能

**Tech Stack:** TypeScript, Jest, React, Electron, Node.js

---

## 文件结构

| 文件 | 操作 | 负责 |
|---|---|---|
| `src/__tests__/crypto.test.ts` | 创建 | crypto 加密测试 |
| `src/__tests__/compression.test.ts` | 创建 | 压缩策略测试 |
| `src/__tests__/routing.test.ts` | 创建 | 路由策略测试 |
| `src/__tests__/caching.test.ts` | 创建 | 缓存策略测试 |
| `src/__tests__/tokenCounter.test.ts` | 创建 | Token计算测试 |
| `src/__tests__/storage.test.ts` | 创建 | 存储模块测试 |
| `src/renderer/components/ErrorBoundary.tsx` | 创建 | 错误边界组件 |
| `src/renderer/App.tsx` | 修改 | 包裹 ErrorBoundary |
| `src/renderer/pages/ApiKeys.tsx` | 修改 | API Key验证 |
| `src/optimizations/caching.ts` | 修改 | 缓存持久化 |
| `src/optimizations/rules.ts` | 修改 | 规则持久化 |

---

## Task 1: crypto.ts 测试

**Files:**
- Create: `src/__tests__/crypto.test.ts`
- Reference: `src/utils/crypto.ts`

- [ ] **Step 1: 编写加密解密测试**

```typescript
import { encrypt, decrypt, generateId } from '../utils/crypto';

describe('crypto', () => {
  test('encrypt and decrypt should work correctly', () => {
    const original = 'sk-test-key-123456';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  test('encrypt should produce different outputs for same input', () => {
    const original = 'test-key';
    const encrypted1 = encrypt(original);
    const encrypted2 = encrypt(original);
    expect(encrypted1).not.toBe(encrypted2);
  });

  test('decrypt should throw for invalid format', () => {
    expect(() => decrypt('invalid-format')).toThrow('Invalid ciphertext format');
  });

  test('generateId should produce unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1.length).toBe(32);
  });

  test('encrypt should handle Chinese characters', () => {
    const original = '中文密钥测试';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao && npm test -- --testPathPattern=crypto`
Expected: 5 tests passed

- [ ] **Step 3: 提交**

```bash
git add src/__tests__/crypto.test.ts
git commit -m "test: add crypto module tests"
```

---

## Task 2: compression.ts 测试

**Files:**
- Create: `src/__tests__/compression.test.ts`
- Reference: `src/optimizations/compression.ts`

- [ ] **Step 1: 编写压缩策略测试**

```typescript
import compression from '../optimizations/compression';

describe('compression', () => {
  test('compress should remove "please"', () => {
    const result = compression.compress('Please help me with this task');
    expect(result.text).not.toContain('Please');
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  test('compress should remove "Could you"', () => {
    const result = compression.compress('Could you please analyze this data');
    expect(result.text).not.toContain('Could you');
  });

  test('compress should replace "in JSON format"', () => {
    const result = compression.compress('Return response in JSON format');
    expect(result.text).toContain('resp: JSON');
  });

  test('compress should handle empty string', () => {
    const result = compression.compress('');
    expect(result.text).toBe('');
    expect(result.tokensSaved).toBe(0);
  });

  test('compressPrompt should handle array format', () => {
    const prompt = [
      { type: 'text', text: 'Please help me' },
      { type: 'image', data: 'base64...' }
    ];
    const result = compression.compressPrompt(prompt);
    expect(result[0].text).not.toContain('Please');
    expect(result[1].type).toBe('image');
  });

  test('compress should be disabled when enabled=false', () => {
    compression.setOptions({ enabled: false });
    const result = compression.compress('Please help me');
    expect(result.text).toBe('Please help me');
    expect(result.tokensSaved).toBe(0);
    compression.setOptions({ enabled: true });
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao && npm test -- --testPathPattern=compression`
Expected: 6 tests passed

- [ ] **Step 3: 提交**

```bash
git add src/__tests__/compression.test.ts
git commit -m "test: add compression strategy tests"
```

---

## Task 3: routing.ts 测试

**Files:**
- Create: `src/__tests__/routing.test.ts`
- Reference: `src/optimizations/routing.ts`

- [ ] **Step 1: 编写路由策略测试**

```typescript
import routing from '../optimizations/routing';

describe('routing', () => {
  test('detectComplexity should return simple for classify task', () => {
    const result = routing.detectComplexity('Classify this text as positive or negative');
    expect(result).toBe('simple');
  });

  test('detectComplexity should return simple for summarize task', () => {
    const result = routing.detectComplexity('Summarize this article in 3 sentences');
    expect(result).toBe('simple');
  });

  test('detectComplexity should return complex for analyze task', () => {
    const result = routing.detectComplexity('Analyze why this algorithm fails and suggest improvements');
    expect(result).toBe('complex');
  });

  test('detectComplexity should return complex for design task', () => {
    const result = routing.detectComplexity('Design a scalable architecture for this system');
    expect(result).toBe('complex');
  });

  test('routeModel should downgrade gpt-4 for simple task', () => {
    const result = routing.routeModel('openai', 'gpt-4', 'Classify this feedback');
    expect(result).toBe('gpt-3.5-turbo');
  });

  test('routeModel should keep gpt-4 for complex task', () => {
    const result = routing.routeModel('openai', 'gpt-4', 'Design a new feature');
    expect(result).toBe('gpt-4');
  });

  test('routeModel should downgrade claude-3-opus for simple task', () => {
    const result = routing.routeModel('anthropic', 'claude-3-opus', 'Summarize this text');
    expect(result).toBe('claude-3-haiku');
  });

  test('routeModel should return original model when disabled', () => {
    routing.setOptions({ enabled: false });
    const result = routing.routeModel('openai', 'gpt-4', 'Simple task');
    expect(result).toBe('gpt-4');
    routing.setOptions({ enabled: true });
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao && npm test -- --testPathPattern=routing`
Expected: 8 tests passed

- [ ] **Step 3: 提交**

```bash
git add src/__tests__/routing.test.ts
git commit -m "test: add routing strategy tests"
```

---

## Task 4: caching.ts 测试

**Files:**
- Create: `src/__tests__/caching.test.ts`
- Reference: `src/optimizations/caching.ts`

- [ ] **Step 1: 编写缓存策略测试**

```typescript
import caching from '../optimizations/caching';

describe('caching', () => {
  beforeEach(() => {
    caching.setOptions({ enabled: true, ttl: '5min', scope: 'both' });
  });

  test('addCacheControl should add cache to system prompt', () => {
    const content = { system: 'You are a helpful assistant', messages: [] };
    const result = caching.addCacheControl(content);
    expect(Array.isArray(result.system)).toBe(true);
    expect(result.system[0].cache).toBe(true);
  });

  test('addCacheControl should not modify when disabled', () => {
    caching.setOptions({ enabled: false });
    const content = { system: 'You are helpful', messages: [] };
    const result = caching.addCacheControl(content);
    expect(result.system).toBe('You are helpful');
  });

  test('addCache should store cache entry', () => {
    caching.addCache('anthropic', 'test content');
    const hasCache = caching.checkCache('anthropic', 'test content');
    expect(hasCache).toBe(true);
  });

  test('checkCache should return false for non-existent entry', () => {
    const result = caching.checkCache('anthropic', 'non-existent');
    expect(result).toBe(false);
  });

  test('isEnabled should return current state', () => {
    expect(caching.isEnabled()).toBe(true);
    caching.setOptions({ enabled: false });
    expect(caching.isEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao && npm test -- --testPathPattern=caching`
Expected: 5 tests passed

- [ ] **Step 3: 提交**

```bash
git add src/__tests__/caching.test.ts
git commit -m "test: add caching strategy tests"
```

---

## Task 5: tokenCounter.ts 测试

**Files:**
- Create: `src/__tests__/tokenCounter.test.ts`
- Reference: `src/utils/tokenCounter.ts`

- [ ] **Step 1: 编写 Token 计算测试**

```typescript
import tokenCounter from '../utils/tokenCounter';

describe('tokenCounter', () => {
  test('estimateTokens should return correct count', () => {
    const result = tokenCounter.estimateTokens('Hello world');
    expect(result).toBe(3);
  });

  test('estimateTokens should handle empty string', () => {
    const result = tokenCounter.estimateTokens('');
    expect(result).toBe(0);
  });

  test('countTokens should work for different apiType', () => {
    const openaiResult = tokenCounter.countTokens('Test', 'openai');
    const claudeResult = tokenCounter.countTokens('Test', 'claude');
    expect(openaiResult).toBeGreaterThan(0);
    expect(claudeResult).toBeGreaterThan(0);
  });

  test('countMessages should count array of messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' }
    ];
    const result = tokenCounter.countMessages(messages);
    expect(result).toBeGreaterThan(0);
  });

  test('countMessages should handle nested content', () => {
    const messages = [
      { role: 'user', content: [
        { type: 'text', text: 'Hello' },
        { type: 'image', data: 'base64' }
      ]}
    ];
    const result = tokenCounter.countMessages(messages);
    expect(result).toBeGreaterThan(0);
  });

  test('estimateCost should calculate gpt-4 cost', () => {
    const result = tokenCounter.estimateCost(1000, 500, 'gpt-4');
    expect(result).toBeCloseTo(0.06, 0.001);
  });

  test('estimateCost should calculate gpt-3.5-turbo cost', () => {
    const result = tokenCounter.estimateCost(1000, 500, 'gpt-3.5-turbo');
    expect(result).toBeCloseTo(0.002, 0.001);
  });

  test('calculateSavings should return positive value', () => {
    const result = tokenCounter.calculateSavings(1000, 500, 'gpt-4');
    expect(result).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao && npm test -- --testPathPattern=tokenCounter`
Expected: 8 tests passed

- [ ] **Step 3: 提交**

```bash
git add src/__tests__/tokenCounter.test.ts
git commit -m "test: add tokenCounter tests"
```

---

## Task 6: storage.ts 测试

**Files:**
- Create: `src/__tests__/storage.test.ts`
- Reference: `src/utils/storage.ts`

- [ ] **Step 1: 编写存储模块测试**

```typescript
import { loadJson, saveJson, deleteJson, listJsonFiles } from '../utils/storage';
import * as fs from 'fs';
import * as path from 'path';

describe('storage', () => {
  const testDir = path.join(process.cwd(), 'test-data');
  const testFile = 'test-storage.json';

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    const filePath = path.join(testDir, testFile);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });

  test('saveJson should write file', () => {
    const data = { name: 'test', value: 123 };
    saveJson(testFile, data);
    const filePath = path.join(testDir, testFile);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('loadJson should read file', () => {
    const data = { name: 'test', value: 123 };
    saveJson(testFile, data);
    const loaded = loadJson(testFile, {});
    expect(loaded.name).toBe('test');
    expect(loaded.value).toBe(123);
  });

  test('loadJson should return default when file missing', () => {
    const defaultData = { default: true };
    const loaded = loadJson('non-existent.json', defaultData);
    expect(loaded.default).toBe(true);
  });

  test('listJsonFiles should list json files', () => {
    saveJson(testFile, { test: true });
    const files = listJsonFiles();
    expect(files.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行测试验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao && npm test -- --testPathPattern=storage`
Expected: 4 tests passed

- [ ] **Step 3: 提交**

```bash
git add src/__tests__/storage.test.ts
git commit -m "test: add storage module tests"
```

---

## Task 7: ErrorBoundary 组件

**Files:**
- Create: `src/renderer/components/ErrorBoundary.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: 创建 ErrorBoundary 组件**

```typescript
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#1a1a2e',
          color: '#eee',
          minHeight: '100vh'
        }}>
          <h1 style={{ color: '#ff6b6b', marginBottom: '20px' }}>出错了</h1>
          <p style={{ marginBottom: '20px', color: '#888' }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '10px 20px',
              background: '#00d4ff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

- [ ] **Step 2: 修改 App.tsx 包裹 ErrorBoundary**

```typescript
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          ...
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 3: 构建前端验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao/src/renderer && npm run build`
Expected: Build success

- [ ] **Step 4: 提交**

```bash
git add src/renderer/components/ErrorBoundary.tsx src/renderer/App.tsx
git commit -m "feat: add ErrorBoundary for error handling"
```

---

## Task 8: API Key 验证

**Files:**
- Modify: `src/renderer/pages/ApiKeys.tsx`

- [ ] **Step 1: 添加 API Key 格式验证**

在 ApiKeys.tsx 的 addApiKey 函数中添加验证：

```typescript
const addApiKey = async () => {
  if (!newKey.name || !newKey.key) {
    alert('请填写名称和 Key');
    return;
  }

  // 验证 Key 格式
  if (newKey.type === 'openai' && !newKey.key.startsWith('sk-')) {
    alert('OpenAI API Key 应以 sk- 开头');
    return;
  }

  if (newKey.type === 'anthropic' && newKey.key.length < 20) {
    alert('Anthropic API Key 度过短');
    return;
  }

  // 继续添加...
};
```

- [ ] **Step 2: 构建前端验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao/src/renderer && npm run build`
Expected: Build success

- [ ] **Step 3: 提交**

```bash
git add src/renderer/pages/ApiKeys.tsx
git commit -m "feat: add API Key validation"
```

---

## Task 9: 缓存持久化

**Files:**
- Modify: `src/optimizations/caching.ts`

- [ ] **Step 1: 添加缓存持久化功能**

```typescript
import { loadJson, saveJson } from '../utils/storage';

interface CacheStore {
  patterns: Array<{ key: string; content: string; timestamp: number }>;
}

const CACHE_FILE = 'cache.json';

function loadCache(): CacheStore {
  return loadJson<CacheStore>(CACHE_FILE, { patterns: [] });
}

function saveCache(store: CacheStore): void {
  saveJson(CACHE_FILE, store);
}

// 替换原有的 Map 实现
let cachePatterns: Map<string, { content: string; timestamp: number }>;

function initCache(): void {
  const store = loadCache();
  cachePatterns = new Map(store.patterns.map(p => [p.key, { content: p.content, timestamp: p.timestamp }]));
}

function persistCache(): void {
  const patterns = Array.from(cachePatterns.entries()).map(([key, value]) => ({
    key, content: value.content, timestamp: value.timestamp
  }));
  saveCache({ patterns });
}

// 在 addCache 中调用 persistCache
export function addCache(apiType: string, content: string): void {
  if (!defaultOptions.enabled) return;
  
  const key = getCacheKey(apiType, content);
  cachePatterns.set(key, {
    content: content.slice(0, 1000),
    timestamp: Date.now()
  });
  persistCache();
}

// 模块初始化时加载缓存
initCache();
```

- [ ] **Step 2: 构建验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao && npm run build`
Expected: Build success

- [ ] **Step 3: 提交**

```bash
git add src/optimizations/caching.ts
git commit -m "feat: add cache persistence"
```

---

## Task 10: 规则持久化

**Files:**
- Modify: `src/optimizations/rules.ts`

- [ ] **Step 1: 添加规则持久化功能**

```typescript
import { loadJson, saveJson } from '../utils/storage';

interface RuleStore {
  rules: Array<{ id: number; pattern: string; action: string; enabled: boolean }>;
}

const RULES_FILE = 'rules.json';

function loadRules(): RuleStore {
  return loadJson<RuleStore>(RULES_FILE, { rules: [] });
}

function saveRules(store: RuleStore): void {
  saveJson(RULES_FILE, store);
}

// 替换原有的 Map 实现
let rules: Map<number, Rule>;

function initRules(): void {
  const store = loadRules();
  rules = new Map(store.rules.map(r => [r.id, r]));
}

function persistRules(): void {
  const ruleList = Array.from(rules.values());
  saveRules({ rules: ruleList });
}

// 模块初始化时加载规则
initRules();
```

- [ ] **Step 2: 构建验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao && npm run build`
Expected: Build success

- [ ] **Step 3: 提交**

```bash
git add src/optimizations/rules.ts
git commit -m "feat: add rules persistence"
```

---

## 验证步骤

- [ ] **运行全部测试**

Run: `cd /Users/yqgmac/yqg/project/tokenBao && npm test`
Expected: All tests pass

- [ ] **构建验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao && npm run build`
Expected: EXIT_CODE: 0

- [ ] **前端构建验证**

Run: `cd /Users/yqgmac/yqg/project/tokenBao/src/renderer && npm run build`
Expected: Build success

---

## 成功标准

- ✅ 测试覆盖率提升（核心模块有测试）
- ✅ 前端错误不再导致白屏
- ✅ 应用重启后缓存和规则数据保留