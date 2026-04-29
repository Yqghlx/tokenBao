import { loadJson, saveJson } from '../utils/storage';

const STORAGE_FILE = 'rules.json';

/** 正则表达式安全限制 */
const MAX_PATTERN_LENGTH = 500;
const MAX_REGEX_EXECUTION_MS = 50;
const MAX_REPLACE_ITERATIONS = 10000;

interface Rule {
  id: number;
  name: string;
  type: 'replace' | 'filter' | 'route';
  pattern: string;
  replacement: string;
  enabled: boolean;
  priority: number;
}

interface RuleStore {
  rules: Array<Rule>;
  nextId: number;
}

const rules: Map<number, Rule> = new Map();
let nextId = 1;
// 排序缓存：add/update/delete 时失效，applyRules 时按需重建
let sortedRulesCache: Rule[] | null = null;

function loadFromStorage(): void {
  try {
    const store = loadJson<RuleStore>(STORAGE_FILE, { rules: [], nextId: 1 });
    store.rules.forEach(r => {
      // 跳过损坏的规则记录（缺少必要字段或 priority 越界）
      if (!r.id || !r.type || !r.pattern || typeof r.priority !== 'number') {
        console.warn(`规则加载跳过: ID=${r.id}，缺少必要字段`);
        return;
      }
      if (r.priority < 0 || r.priority > 1000 || !Number.isInteger(r.priority)) {
        console.warn(`规则加载修正: ID=${r.id}，priority=${r.priority} 超出范围，重置为 0`);
        r.priority = 0;
      }
      rules.set(r.id, r);
    });
    nextId = store.nextId;
  } catch (err) {
    if (err instanceof Error && !err.message.includes('ENOENT')) {
      console.error('加载规则存储失败:', err);
    }
  }
}

function saveToStorage(): void {
  const ruleList = Array.from(rules.values());
  saveJson(STORAGE_FILE, { rules: ruleList, nextId });
}

loadFromStorage();

/**
 * 验证正则表达式语法是否合法
 * 返回 null 表示合法，否则返回错误信息
 */
export function validatePattern(pattern: string): string | null {
  if (!pattern || pattern.trim().length === 0) {
    return '正则表达式不能为空';
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `正则表达式长度不能超过 ${MAX_PATTERN_LENGTH} 字符`;
  }
  try {
    const regex = new RegExp(pattern);
    // 检测空匹配模式（如 a*、|），在替换回调中无法推进位置导致大量迭代
    // 不硬性拒绝（.* 等模式有合法用途），仅在运行时由迭代上限保护
    if (regex.test('')) {
      console.warn(`正则表达式 "${pattern.slice(0, 30)}" 可匹配空字符串，替换时可能触发迭代上限`);
    }
    return null;
  } catch {
    return '正则表达式语法错误';
  }
}

export function addRule(rule: Omit<Rule, 'id'>): Rule {
  // 校验 name 字段
  if (!rule.name || typeof rule.name !== 'string' || rule.name.trim().length === 0 || rule.name.length > 100) {
    throw new Error('规则名称无效（1-100 字符）');
  }
  // 校验 enabled 字段
  if (typeof rule.enabled !== 'boolean') {
    throw new Error('enabled 必须为布尔值');
  }
  // 类型为 replace 时验证正则语法
  if (rule.type === 'replace') {
    const err = validatePattern(rule.pattern);
    if (err) throw new Error(err);
  }
  // 验证 replacement 长度
  if (typeof rule.replacement !== 'string' || rule.replacement.length > 1000) {
    throw new Error('替换文本不能超过 1000 字符');
  }
  // 验证 priority 范围
  if (!Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 1000) {
    throw new Error('priority 必须是 0-1000 之间的整数');
  }
  const newRule = { ...rule, id: nextId++ };
  rules.set(newRule.id, newRule);
  sortedRulesCache = null;
  saveToStorage();
  return newRule;
}

export function listRules(): Rule[] {
  return Array.from(rules.values()).sort((a, b) => b.priority - a.priority);
}

export function getRule(id: number): Rule | undefined {
  const rule = rules.get(id);
  return rule ? { ...rule } : undefined;
}

export function updateRule(id: number, updates: Partial<Rule>): Rule | undefined {
  const rule = rules.get(id);
  if (rule) {
    // 校验 priority 范围（与 addRule 一致：必须为整数）
    if (updates.priority !== undefined && (!Number.isInteger(updates.priority) || updates.priority < 0 || updates.priority > 1000)) {
      throw new Error('优先级范围应为 0-1000 的整数');
    }
    // 校验 pattern 长度 + 正则语法（与 addRule 保持一致）
    if (updates.pattern !== undefined && typeof updates.pattern === 'string' && updates.pattern.length > 500) {
      throw new Error('正则表达式过长');
    }
    if (updates.pattern !== undefined && typeof updates.pattern === 'string') {
      const err = validatePattern(updates.pattern);
      if (err) throw new Error(err);
    }
    // 校验 type 合法性
    if (updates.type !== undefined && !['replace', 'filter', 'route'].includes(updates.type)) {
      throw new Error('不支持的规则类型');
    }
    // 校验 name 长度
    if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim().length === 0 || updates.name.length > 100)) {
      throw new Error('规则名称无效（1-100 字符）');
    }
    // 校验 replacement 长度
    if (updates.replacement !== undefined && (typeof updates.replacement !== 'string' || updates.replacement.length > 1000)) {
      throw new Error('替换文本不能超过 1000 字符');
    }
    // 校验 enabled 类型
    if (updates.enabled !== undefined && typeof updates.enabled !== 'boolean') {
      throw new Error('enabled 必须为布尔值');
    }
    Object.assign(rule, updates);
    sortedRulesCache = null;
    saveToStorage();
  }
  return rule ? { ...rule } : undefined;
}

export function deleteRule(id: number): boolean {
  const result = rules.delete(id);
  if (result) {
    sortedRulesCache = null;
    saveToStorage();
  }
  return result;
}

/**
 * 安全地执行正则替换，通过超时检测防止 ReDoS 攻击
 */
function safeRegexReplace(text: string, pattern: string, replacement: string): string {
  try {
    const regex = new RegExp(pattern, 'g');
    const start = Date.now();
    let iterations = 0;
    const result = text.replace(regex, () => {
      iterations++;
      // 迭代次数超限或执行超时，立即中断防止 ReDoS
      if (iterations > MAX_REPLACE_ITERATIONS || Date.now() - start > MAX_REGEX_EXECUTION_MS) {
        throw new Error('正则表达式执行超时');
      }
      return replacement;
    });
    return result;
  } catch {
    // 正则执行失败或超时，回退到字符串替换（非正则语义）
    console.warn(`规则正则执行失败，降级为字符串替换: pattern="${pattern.slice(0, 50)}"`);
    return text.split(pattern).join(replacement);
  }
}

export function applyRules(content: string): string {
  let result = content;

  // 使用排序缓存，避免每次请求重排序
  if (!sortedRulesCache) {
    sortedRulesCache = Array.from(rules.values()).sort((a, b) => b.priority - a.priority);
  }

  for (const rule of sortedRulesCache) {
    if (!rule.enabled) continue;

    if (rule.type === 'replace') {
      result = safeRegexReplace(result, rule.pattern, rule.replacement);
    } else if (rule.type === 'filter') {
      // filter 类型：移除匹配到的内容（等同于替换为空字符串）
      result = safeRegexReplace(result, rule.pattern, '');
    }
  }

  return result;
}

export default {
  addRule,
  listRules,
  getRule,
  updateRule,
  deleteRule,
  applyRules,
  validatePattern
};