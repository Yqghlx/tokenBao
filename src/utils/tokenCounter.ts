import { getEncoding, Tiktoken } from 'js-tiktoken';
import { MODEL_PRICING } from '../proxy/pricing';

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

  // Anthropic \u5b98\u65b9\u5efa\u8bae\uff1a\u82f1\u6587\u7ea6 4 chars/token\uff0c\u4e2d\u6587\u7ea6 2 chars/token
  const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const nonChineseLength = text.length - chineseChars;

  const chineseTokens = Math.ceil(chineseChars / 2);
  const nonChineseTokens = Math.ceil(nonChineseLength / 4);

  return chineseTokens + nonChineseTokens + 3;
}
/**
 * Token \u4f30\u7b97 fallback\uff1atiktoken \u4e0d\u53ef\u7528\u65f6\u4f7f\u7528
 * \u82f1\u6587 4 chars/token\uff0c\u4e2d\u6587 2 chars/token\uff08\u4e0e countTokensAnthropic \u4e00\u81f4\uff09
 */
function estimateTokensFallback(text: string): number {
  if (!text) return 0;

  const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const nonChineseLength = text.length - chineseChars;

  const chineseTokens = Math.ceil(chineseChars / 2);
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

function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): number {
  const prices = MODEL_PRICING[model];
  if (!prices) return (inputTokens + outputTokens) / 1000 * 0.001;

  return (inputTokens / 1000) * prices.input + (outputTokens / 1000) * prices.output;
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