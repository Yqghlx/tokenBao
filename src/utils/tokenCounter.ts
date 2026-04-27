import { getEncoding, Tiktoken } from 'js-tiktoken';
import { MODEL_PRICING, normalizeModelName } from '../proxy/pricing';

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
  } catch (err) {
    console.warn('tiktoken 编码失败，使用估算 fallback:', (err as Error).message);
    // 编码器异常后重置，下次调用重新初始化
    encoder = null;
    return estimateTokensFallback(text);
  }
}
/**
 * Anthropic token \u4f30\u7b97\uff1a\u6309\u5b57\u7b26\u7c7b\u578b\u5206\u522b\u8ba1\u7b97
 * CJK \u5b57\u7b26\u7ea6 1.5 chars/token\uff0c\u62c9\u4e01\u5b57\u6bcd\u7ea6 3.5 chars/token\uff0c\u4ee3\u7801/\u7b26\u53f7\u7ea6 4 chars/token
 */
function countTokensAnthropic(text: string): number {
  if (!text) return 0;

  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
  // emoji \u548c\u5bbd\u5b57\u7b26\uff1a\u4ee3\u7406\u5bf9\u5f62\u5f0f\u7684\u8865\u5145\u5e73\u9762\u5b57\u7b26
  const emojiChars = (text.match(/[\ud800-\udbff][\udc00-\udfff]/g) || []).length;
  const codeAndSymbols = (text.match(/[`{}[\]()<>|/\\@#$%^&*~+=_-]/g) || []).length;
  const whitespace = (text.match(/\s/g) || []).length;
  const otherChars = text.length - cjkChars - emojiChars * 2 - codeAndSymbols - whitespace;

  return Math.ceil(cjkChars / 1.5) + Math.ceil(emojiChars / 2) + Math.ceil(codeAndSymbols / 4) + Math.ceil(whitespace / 4) + Math.ceil(Math.max(0, otherChars) / 3.5) + 3;
}

/**
 * Token \u4f30\u7b97 fallback\uff1atiktoken \u4e0d\u53ef\u7528\u65f6\u4f7f\u7528\uff0c\u91c7\u7528\u4e0e Anthropic \u76f8\u540c\u7684\u591a\u7c7b\u578b\u5b57\u7b26\u4f30\u7b97
 */
function estimateTokensFallback(text: string): number {
  return countTokensAnthropic(text);
}

function countTokens(text: string, apiType?: string): number {
  if (!text) return 0;

  try {
    if (apiType === 'openai') {
      return countTokensOpenAI(text);
    }

    if (apiType === 'anthropic' || apiType === 'claude') {
      return countTokensAnthropic(text);
    }

    return countTokensOpenAI(text);
  } catch (err) {
    console.warn('Token 计数失败，使用 fallback:', err);
    return estimateTokensFallback(text);
  }
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
  const normalized = normalizeModelName(model);
  const prices = MODEL_PRICING[normalized];
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