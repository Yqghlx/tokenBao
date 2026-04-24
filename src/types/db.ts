// 配置项
export interface Config {
  id: number;
  key: string;
  value: string;
  updatedAt: string;
}

// 预算配置
export interface BudgetConfig {
  id: number;
  type: 'daily' | 'monthly';
  limit: number;
  current: number;
  resetAt: string;
}

// 自定义规则
export interface CustomRule {
  id: number;
  name: string;
  type: 'replace' | 'filter' | 'route';
  pattern: string;
  replacement: string;
  enabled: boolean;
  priority: number;
  createdAt: string;
}
