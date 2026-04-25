function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function countTokens(text: string, apiType?: string): number {
  if (!text) return 0;
  
  if (apiType === 'openai') {
    return estimateTokens(text);
  }
  
  if (apiType === 'claude') {
    return estimateTokens(text);
  }
  
  return estimateTokens(text);
}

function countMessages(messages: any[]): number {
  if (!messages || !Array.isArray(messages)) return 0;
  
  return messages.reduce((total: number, msg: any) => {
    if (typeof msg.content === 'string') {
      return total + countTokens(msg.content);
    }
    if (Array.isArray(msg.content)) {
      return total + msg.content.reduce((msgTotal: number, block: any) => {
        if (block.type === 'text' && block.text) {
          return msgTotal + countTokens(block.text);
        }
        return msgTotal;
      }, 0);
    }
    return total;
  }, 0);
}

const modelPrices = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.001, output: 0.002 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 }
};

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const prices = modelPrices[model as keyof typeof modelPrices];
  if (!prices) return 0;
  
  const inputCost = (inputTokens / 1000) * prices.input;
  const outputCost = (outputTokens / 1000) * prices.output;
  
  return inputCost + outputCost;
}

function calculateSavings(
  inputTokens: number,
  cachedTokens: number,
  model: string
): number {
  const fullCost = estimateCost(inputTokens, 0, model);
  const cachedCost = estimateCost(cachedTokens, 0, model);
  return fullCost - cachedCost;
}

export default {
  estimateTokens,
  countTokens,
  countMessages,
  estimateCost,
  calculateSavings
};