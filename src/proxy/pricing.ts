/**
 * 模型定价与名称归一化（项目唯一定价源）
 * server.ts、responseHandler.ts、tokenCounter.ts 均从此模块导入
 */

/**
 * 模型定价表（每 1000 tokens 价格，美元）
 * 数据来源：OpenAI / Anthropic 官方定价，2026 年 4 月更新
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'o3': { input: 0.002, output: 0.008 },
  'o4-mini': { input: 0.0011, output: 0.0044 },
  // Anthropic
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3.5-haiku': { input: 0.001, output: 0.005 },
  'claude-sonnet-4': { input: 0.003, output: 0.015 },
  'claude-opus-4': { input: 0.005, output: 0.025 },
};

/**
 * 模型名称归一化映射
 * API 返回的 model 可能包含日期后缀（如 gpt-4-0613）或变体名，需归一化到定价表标准名
 */
const MODEL_ALIASES: Record<string, string> = {
  // OpenAI 变体
  'gpt-4-0314': 'gpt-4', 'gpt-4-0613': 'gpt-4', 'gpt-4-1106-preview': 'gpt-4-turbo',
  'gpt-4-0125-preview': 'gpt-4-turbo', 'gpt-4-turbo-preview': 'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09': 'gpt-4-turbo',
  'gpt-4o-2024-05-13': 'gpt-4o', 'gpt-4o-2024-08-06': 'gpt-4o', 'gpt-4o-2024-11-20': 'gpt-4o',
  'gpt-4o-mini-2024-07-18': 'gpt-4o-mini',
  'gpt-3.5-turbo-0125': 'gpt-3.5-turbo', 'gpt-3.5-turbo-1106': 'gpt-3.5-turbo',
  'gpt-3.5-turbo-16k': 'gpt-3.5-turbo',
  // Anthropic 变体
  'claude-3-opus-20240229': 'claude-3-opus',
  'claude-3-sonnet-20240229': 'claude-3-sonnet',
  'claude-3-haiku-20240307': 'claude-3-haiku',
  'claude-3-5-sonnet-20240620': 'claude-3.5-sonnet',
  'claude-3-5-sonnet-20241022': 'claude-3.5-sonnet',
  'claude-3-5-haiku-20241022': 'claude-3.5-haiku',
};

export function normalizeModelName(model: string): string {
  if (!model) return 'unknown';
  const lower = model.toLowerCase();
  if (MODEL_ALIASES[lower]) return MODEL_ALIASES[lower];
  if (MODEL_PRICING[lower]) return lower;
  for (const key of Object.keys(MODEL_PRICING)) {
    if (lower.startsWith(key)) return key;
  }
  return model;
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const normalized = normalizeModelName(model);
  const pricing = MODEL_PRICING[normalized] || { input: 0.001, output: 0.002 };
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}
