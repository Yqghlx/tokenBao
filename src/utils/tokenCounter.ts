import { getEncoding, Tiktoken } from 'js-tiktoken';

interface ContentBlock {
  type: string;
  text?: string;
}

interface Message {
  content: string | ContentBlock[];
}

let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = getEncoding('cl100k_base');
  }
  return encoder;
}
function countTokensOpenAI(text: string): number {
  if (!text) return 0;
  try {
    const enc = getEncoder();
    const tokens = enc.encode(text);
    return tokens.length;
  } catch {
    return estimateTokensFallback(text);
  }
}
function countTokensAnthropic(text: string): number {
  if (!text) return 0;
  
  const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const nonChineseLength = text.length - chineseChars;
  
  const chineseTokens = Math.ceil(chineseChars / 1.5);
  const nonChineseTokens = Math.ceil(nonChineseLength / 3.5);
  
  return chineseTokens + nonChineseTokens + 3;
}
function estimateTokensFallback(text: string): number {
  if (!text) return 0;
  
  const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const nonChineseLength = text.length - chineseChars;
  
  const chineseTokens = Math.ceil(chineseChars / 1.5);
  const nonChineseTokens = Math.ceil(nonChineseLength / 4);
  
  return chineseTokens + nonChineseTokens + 3;
}

function countTokens(text: string, apiType?: string): number {
  if (!text) return 0;
  
  if (apiType === 'openai') {
    return countTokensOpenAI(text);
  }
  
  if (apiType === 'anthropic' || apiType === 'claude') {
    return countTokensAnthropic(text);
  }
  
  return countTokensOpenAI(text);
}
function countMessages(messages: Message[], apiType?: string): number {
  if (!messages || !Array.isArray(messages)) return 0;
  
  const formatOverhead = 4;
  const roleOverhead = 1;
  
  return messages.reduce((total: number, msg: Message) => {
    let contentTokens = 0;
    
    if (typeof msg.content === 'string') {
      contentTokens = countTokens(msg.content, apiType);
    } else if (Array.isArray(msg.content)) {
      contentTokens = msg.content.reduce((msgTotal: number, block: ContentBlock) => {
        if (block.type === 'text' && block.text) {
          return msgTotal + countTokens(block.text, apiType);
        }
        if (block.type === 'image') {
          return msgTotal + 85;
        }
        return msgTotal;
      }, 0);
    }
    
    return total + contentTokens + roleOverhead + formatOverhead;
  }, 3);
}

const modelPrices = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 }
};

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const prices = modelPrices[model as keyof typeof modelPrices];
  if (!prices) return (inputTokens + outputTokens) / 1000 * 0.001;
  
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

function cleanup(): void {
  encoder = null;
}

export default {
  countTokens,
  countMessages,
  estimateCost,
  calculateSavings,
  cleanup,
  countTokensOpenAI,
  countTokensAnthropic
};