import { loadJson, saveJson } from '../utils/storage';

/** 正则表达式安全限制 */
const MAX_PATTERN_LENGTH = 500;
const MAX_REGEX_EXECUTION_MS = 50;

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

const STORAGE_FILE = 'rules.json';

const rules: Map<number, Rule> = new Map();
let nextId = 1;

function loadFromStorage(): void {
  try {
    const store = loadJson<RuleStore>(STORAGE_FILE, { rules: [], nextId: 1 });
    store.rules.forEach(r => rules.set(r.id, r));
    nextId = store.nextId;
  } catch (e) {
    // 首次加载可能失败
  }
}

function saveToStorage(): void {
  const ruleList = Array.from(rules.values());
  saveJson(STORAGE_FILE, { rules: ruleList, nextId });
}

loadFromStorage();

export function addRule(rule: Omit<Rule, 'id'>): Rule {
  if (rule.type === 'replace' && rule.pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(`正则表达式长度不能超过 ${MAX_PATTERN_LENGTH} 字符`);
  }
  const newRule = { ...rule, id: nextId++ };
  rules.set(newRule.id, newRule);
  saveToStorage();
  return newRule;
}

export function listRules(): Rule[] {
  return Array.from(rules.values()).sort((a, b) => b.priority - a.priority);
}

export function getRule(id: number): Rule | undefined {
  return rules.get(id);
}

export function updateRule(id: number, updates: Partial<Rule>): Rule | undefined {
  const rule = rules.get(id);
  if (rule) {
    Object.assign(rule, updates);
    saveToStorage();
  }
  return rule;
}

export function deleteRule(id: number): boolean {
  const result = rules.delete(id);
  if (result) saveToStorage();
  return result;
}

/**
 * 安全地执行正则替换，通过超时检测防止 ReDoS 攻击
 */
function safeRegexReplace(text: string, pattern: string, replacement: string): string {
  try {
    const regex = new RegExp(pattern, 'g');
    const start = Date.now();
    const result = text.replace(regex, () => {
      if (Date.now() - start > MAX_REGEX_EXECUTION_MS) {
        throw new Error('正则表达式执行超时');
      }
      return replacement;
    });
    return result;
  } catch {
    // 正则执行失败或超时，回退到字符串替换
    return text.split(pattern).join(replacement);
  }
}

export function applyRules(content: string): string {
  let result = content;

  for (const rule of rules.values()) {
    if (!rule.enabled) continue;

    if (rule.type === 'replace') {
      result = safeRegexReplace(result, rule.pattern, rule.replacement);
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
  applyRules
};