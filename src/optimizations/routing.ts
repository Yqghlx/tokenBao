/** 复杂度检测的 prompt 长度阈值 */
const LENGTH_THRESHOLD_MEDIUM = 500;
const LENGTH_THRESHOLD_COMPLEX = 1000;

interface RoutingRule {
  sourceModel: string;
  targetModel: string;
  condition: 'simple' | 'classification' | 'extraction' | 'complex' | 'unknown';
}

interface RoutingOptions {
  enabled: boolean;
  rules: RoutingRule[];
}

const defaultOptions: RoutingOptions = {
  enabled: true,
  rules: [
    // OpenAI 路由规则
    { sourceModel: 'gpt-4', targetModel: 'gpt-4o-mini', condition: 'simple' },
    { sourceModel: 'gpt-4', targetModel: 'gpt-4o-mini', condition: 'classification' },
    { sourceModel: 'gpt-4', targetModel: 'gpt-4o-mini', condition: 'extraction' },
    { sourceModel: 'gpt-4-turbo', targetModel: 'gpt-4o-mini', condition: 'simple' },
    { sourceModel: 'gpt-4-turbo', targetModel: 'gpt-4o-mini', condition: 'classification' },
    { sourceModel: 'gpt-4-turbo', targetModel: 'gpt-4o-mini', condition: 'extraction' },
    { sourceModel: 'gpt-4o', targetModel: 'gpt-4o-mini', condition: 'simple' },
    { sourceModel: 'gpt-4o', targetModel: 'gpt-4o-mini', condition: 'classification' },
    { sourceModel: 'gpt-4o', targetModel: 'gpt-4o-mini', condition: 'extraction' },
    { sourceModel: 'gpt-4.1', targetModel: 'gpt-4.1-mini', condition: 'simple' },
    { sourceModel: 'gpt-4.1', targetModel: 'gpt-4.1-mini', condition: 'classification' },
    { sourceModel: 'gpt-4.1', targetModel: 'gpt-4.1-mini', condition: 'extraction' },
    { sourceModel: 'o3', targetModel: 'o4-mini', condition: 'simple' },
    { sourceModel: 'o3', targetModel: 'o4-mini', condition: 'classification' },
    { sourceModel: 'o1-preview', targetModel: 'o4-mini', condition: 'simple' },
    { sourceModel: 'o1-preview', targetModel: 'o4-mini', condition: 'classification' },
    { sourceModel: 'o1-preview', targetModel: 'o4-mini', condition: 'extraction' },
    { sourceModel: 'o1-mini', targetModel: 'o4-mini', condition: 'simple' },
    { sourceModel: 'o1-mini', targetModel: 'o4-mini', condition: 'classification' },
    // Anthropic 路由规则
    { sourceModel: 'claude-3-opus', targetModel: 'claude-3-haiku', condition: 'simple' },
    { sourceModel: 'claude-3-opus', targetModel: 'claude-3-haiku', condition: 'classification' },
    { sourceModel: 'claude-3-sonnet', targetModel: 'claude-3-haiku', condition: 'simple' },
    { sourceModel: 'claude-3-sonnet', targetModel: 'claude-3-haiku', condition: 'classification' },
    { sourceModel: 'claude-3.5-sonnet', targetModel: 'claude-3.5-haiku', condition: 'simple' },
    { sourceModel: 'claude-3.5-sonnet', targetModel: 'claude-3.5-haiku', condition: 'classification' },
    { sourceModel: 'claude-3.7-sonnet', targetModel: 'claude-3.5-haiku', condition: 'simple' },
    { sourceModel: 'claude-3.7-sonnet', targetModel: 'claude-3.5-haiku', condition: 'classification' },
    { sourceModel: 'claude-sonnet-4', targetModel: 'claude-haiku-4.5', condition: 'simple' },
    { sourceModel: 'claude-sonnet-4', targetModel: 'claude-haiku-4.5', condition: 'classification' },
    { sourceModel: 'claude-opus-4', targetModel: 'claude-haiku-4.5', condition: 'simple' },
    { sourceModel: 'claude-opus-4', targetModel: 'claude-haiku-4.5', condition: 'classification' },
    { sourceModel: 'claude-opus-4.1', targetModel: 'claude-haiku-4.5', condition: 'simple' },
    { sourceModel: 'claude-opus-4.1', targetModel: 'claude-haiku-4.5', condition: 'classification' },
    { sourceModel: 'claude-sonnet-4.6', targetModel: 'claude-haiku-4.5', condition: 'simple' },
    { sourceModel: 'claude-sonnet-4.6', targetModel: 'claude-haiku-4.5', condition: 'classification' },
    { sourceModel: 'claude-opus-4.6', targetModel: 'claude-haiku-4.5', condition: 'simple' },
    { sourceModel: 'claude-opus-4.6', targetModel: 'claude-haiku-4.5', condition: 'classification' }
  ]
};

const simpleKeywords = [
  'classify', 'categorize', 'list', 'what is', 'which', 'yes or no', 'true or false',
  'summarize', 'translate', 'define', 'name', 'count',
  // 中文关键词
  '分类', '列举', '定义', '总结', '翻译', '判断', '计数', '选择', '命名'
];

const extractionKeywords = [
  'extract', 'parse', 'identify', 'find all', 'retrieve', 'pull', 'locate', 'select',
  // 中文关键词
  '提取', '解析', '识别', '查找', '检索', '定位', '筛选'
];

const complexKeywords = [
  'analyze', 'reason', 'prove', 'derive', 'explain why', 'think step',
  'create', 'design', 'write code', 'implement', 'architect',
  'synthesize', 'evaluate', 'compare', 'refactor',
  // 中文关键词
  '分析', '推理', '证明', '推导', '解释为什么', '逐步思考',
  '创建', '设计', '写代码', '实现', '架构',
  '综合', '评估', '比较', '重构', '优化', '调试'
];

function getOptions(): RoutingOptions {
  return { ...defaultOptions };
}

function setOptions(options: Partial<RoutingOptions>): void {
  Object.assign(defaultOptions, options);
}

function detectComplexity(prompt: string): 'simple' | 'classification' | 'extraction' | 'complex' | 'unknown' {
  if (typeof prompt !== 'string') return 'unknown';
  const lower = prompt.toLowerCase();

  // 累计各类别命中关键词数量，多关键词匹配提高分类准确度
  let simpleScore = 0;
  let extractionScore = 0;
  let complexScore = 0;

  for (const kw of simpleKeywords) {
    if (lower.includes(kw)) simpleScore++;
  }

  for (const kw of extractionKeywords) {
    if (lower.includes(kw)) extractionScore++;
  }

  for (const kw of complexKeywords) {
    if (lower.includes(kw)) complexScore++;
  }

  // 长度因子：长 prompt 倾向于复杂任务
  if (prompt.length > LENGTH_THRESHOLD_MEDIUM) complexScore += 2;
  if (prompt.length > LENGTH_THRESHOLD_COMPLEX) complexScore += 3;

  const maxScore = Math.max(simpleScore, extractionScore, complexScore);

  // 所有关键词评分为 0，无法确定复杂度，保持原模型不降级
  if (maxScore === 0) return 'unknown';

  // 复杂度优先级：complex > extraction > classification
  // 平局时偏向高级别，避免含复杂关键词的 prompt 被错误降级
  if (complexScore > 0 && complexScore >= extractionScore && complexScore >= simpleScore) return 'complex';
  if (extractionScore > 0 && extractionScore >= simpleScore) return 'extraction';
  // simpleScore > 0 必然成立（maxScore > 0 已排除全零情况），返回 classification
  return 'classification';
}

function routeModel(model: string, prompt: string): string {
  if (!defaultOptions.enabled || !model || !prompt || typeof prompt !== 'string') return model;

  const condition = detectComplexity(prompt);

  // 无法判断复杂度时保持原模型，避免盲目降级影响输出质量
  if (condition === 'unknown') return model;

  // 精确匹配 condition（模型名大小写不敏感，兼容 "GPT-4" / "gpt-4" 等变体）
  const modelLower = model.toLowerCase();
  for (const rule of defaultOptions.rules) {
    if (rule.sourceModel.toLowerCase() === modelLower && rule.condition === condition) {
      return rule.targetModel;
    }
  }

  // 降级匹配：extraction → classification → simple，classification → simple
  const fallbackChain: Array<'classification' | 'simple'> = condition === 'extraction'
    ? ['classification', 'simple']
    : condition === 'classification'
      ? ['simple']
      : [];

  for (const fallback of fallbackChain) {
    for (const rule of defaultOptions.rules) {
      if (rule.sourceModel.toLowerCase() === modelLower && rule.condition === fallback) {
        return rule.targetModel;
      }
    }
  }

  // 复杂任务不降级（保持原模型）
  return model;
}

export default {
  getOptions,
  setOptions,
  detectComplexity,
  routeModel
};