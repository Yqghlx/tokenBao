interface RoutingRule {
  sourceModel: string;
  targetModel: string;
  condition: 'simple' | 'classification' | 'extraction' | 'complex';
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
    { sourceModel: 'gpt-4o', targetModel: 'gpt-4o-mini', condition: 'simple' },
    { sourceModel: 'gpt-4o', targetModel: 'gpt-4o-mini', condition: 'classification' },
    { sourceModel: 'gpt-4o', targetModel: 'gpt-4o-mini', condition: 'extraction' },
    { sourceModel: 'gpt-4.1', targetModel: 'gpt-4.1-mini', condition: 'simple' },
    { sourceModel: 'gpt-4.1', targetModel: 'gpt-4.1-mini', condition: 'classification' },
    { sourceModel: 'gpt-4.1', targetModel: 'gpt-4.1-mini', condition: 'extraction' },
    { sourceModel: 'o3', targetModel: 'o4-mini', condition: 'simple' },
    { sourceModel: 'o3', targetModel: 'o4-mini', condition: 'classification' },
    // Anthropic 路由规则
    { sourceModel: 'claude-3-opus', targetModel: 'claude-3-haiku', condition: 'simple' },
    { sourceModel: 'claude-3-opus', targetModel: 'claude-3-haiku', condition: 'classification' },
    { sourceModel: 'claude-3.5-sonnet', targetModel: 'claude-3.5-haiku', condition: 'simple' },
    { sourceModel: 'claude-3.5-sonnet', targetModel: 'claude-3.5-haiku', condition: 'classification' },
    { sourceModel: 'claude-sonnet-4', targetModel: 'claude-3.5-haiku', condition: 'simple' },
    { sourceModel: 'claude-sonnet-4', targetModel: 'claude-3.5-haiku', condition: 'classification' },
    { sourceModel: 'claude-opus-4', targetModel: 'claude-3.5-haiku', condition: 'simple' },
    { sourceModel: 'claude-opus-4', targetModel: 'claude-3.5-haiku', condition: 'classification' },
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
  'summarize', 'translate', 'define', 'name', 'count'
];

const extractionKeywords = [
  'extract', 'parse', 'identify', 'find all', 'retrieve', 'pull', 'locate', 'select'
];

const complexKeywords = [
  'analyze', 'reason', 'prove', 'derive', 'explain why', 'think step',
  'create', 'design', 'write code', 'implement', 'architect',
  'synthesize', 'evaluate', 'compare', 'refactor'
];

function getOptions(): RoutingOptions {
  return { ...defaultOptions };
}

function setOptions(options: Partial<RoutingOptions>): void {
  Object.assign(defaultOptions, options);
}

function detectComplexity(prompt: string): 'simple' | 'classification' | 'extraction' | 'complex' {
  const lower = prompt.toLowerCase();

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

  // 取最高分类别
  if (complexScore > simpleScore && complexScore > extractionScore) return 'complex';
  if (extractionScore > simpleScore) return 'extraction';
  if (simpleScore > 0) return 'classification';
  return 'simple';
}

function routeModel(model: string, prompt: string): string {
  if (!defaultOptions.enabled) return model;

  const condition = detectComplexity(prompt);

  // 精确匹配 condition
  for (const rule of defaultOptions.rules) {
    if (rule.sourceModel === model && rule.condition === condition) {
      return rule.targetModel;
    }
  }

  // 降级匹配：extraction → classification → simple
  if (condition === 'extraction') {
    for (const rule of defaultOptions.rules) {
      if (rule.sourceModel === model && rule.condition === 'classification') {
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