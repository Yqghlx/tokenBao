import { loadJson, saveJson } from '../utils/storage';

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

export function applyRules(content: string): string {
  let result = content;
  
  for (const rule of rules.values()) {
    if (!rule.enabled) continue;
    
    if (rule.type === 'replace') {
      try {
        const regex = new RegExp(rule.pattern, 'g');
        result = result.replace(regex, rule.replacement);
      } catch {
        result = result.split(rule.pattern).join(rule.replacement);
      }
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