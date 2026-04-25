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
    { sourceModel: 'gpt-4', targetModel: 'gpt-3.5-turbo', condition: 'simple' },
    { sourceModel: 'gpt-4', targetModel: 'gpt-3.5-turbo', condition: 'classification' },
    { sourceModel: 'gpt-4', targetModel: 'gpt-3.5-turbo', condition: 'extraction' },
    { sourceModel: 'claude-3-opus', targetModel: 'claude-3-haiku', condition: 'simple' },
    { sourceModel: 'claude-3-opus', targetModel: 'claude-3-haiku', condition: 'classification' }
  ]
};

const simpleKeywords = [
  'classify', 'categorize', 'list', 'what is', 'which', 'yes or no', 'true or false',
  'extract the', 'find all', 'summarize', 'translate'
];

const complexKeywords = [
  'analyze', 'reason', 'prove', 'derive', 'explain', 'why', 'think',
  'create', 'design', 'write code', 'implement', 'architect'
];

function getOptions(): RoutingOptions {
  return { ...defaultOptions };
}

function setOptions(options: Partial<RoutingOptions>): void {
  Object.assign(defaultOptions, options);
}

function detectComplexity(prompt: string): 'simple' | 'complex' {
  const lower = prompt.toLowerCase();
  
  let simpleCount = 0;
  for (const kw of simpleKeywords) {
    if (lower.includes(kw)) simpleCount++;
  }
  
  let complexCount = 0;
  for (const kw of complexKeywords) {
    if (lower.includes(kw)) complexCount++;
  }
  
  if (complexCount > simpleCount) return 'complex';
  return 'simple';
}

function routeModel(apiType: string, model: string, prompt: string): string {
  if (!defaultOptions.enabled) return model;
  
  const complexity = detectComplexity(prompt);
  
  for (const rule of defaultOptions.rules) {
    if (rule.sourceModel === model && rule.condition === complexity) {
      return rule.targetModel;
    }
  }
  
  return model;
}

export default {
  getOptions,
  setOptions,
  detectComplexity,
  routeModel
};