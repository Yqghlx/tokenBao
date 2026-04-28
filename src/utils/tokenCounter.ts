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
  } catch (err) {
    console.warn('tiktoken 编码失败，使用估算 fallback:', (err as Error).message);
    // 编码器异常后重置，下次调用重新初始化
    encoder = null;
    return estimateTokensFallback(text);
  }
}
/**
 * Anthropic token 估算：按字符类型分别计算
 * CJK 字符约 1.5 chars/token，拉丁字母约 3.5 chars/token，代码/符号约 4 chars/token
 */
function countTokensAnthropic(text: string): number {
  if (!text) return 0;

  const cjkChars = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
  // emoji 和宽字符：代理对形式的补充平面字符
  const emojiChars = (text.match(/[\ud800-\udbff][\udc00-\udfff]/g) || []).length;
  const codeAndSymbols = (text.match(/[`{}[\]()<>|/\\@#$%^&*~+=_-]/g) || []).length;
  const whitespace = (text.match(/\s/g) || []).length;
  const otherChars = text.length - cjkChars - emojiChars * 2 - codeAndSymbols - whitespace;

  return Math.ceil(cjkChars / 1.5) + Math.ceil(emojiChars / 2) + Math.ceil(codeAndSymbols / 4) + Math.ceil(whitespace / 4) + Math.ceil(Math.max(0, otherChars) / 3.5) + 3;
}

/**
 * Token 估算 fallback：tiktoken 不可用时使用，采用与 Anthropic 相同的多类型字符估算
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

  // 每条消息的固定格式开销（role 标记 + 分隔符等）
  const formatOverhead = 4;
  // 角色标记开销（system/user/assistant 等）
  const roleOverhead = 1;

  // 初始值 3：消息列表整体的 priming 开销（<|im_start|> 等边界标记）
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

function cleanup(): void {
  encoder = null;
}

export default {
  countTokens,
  countMessages,
  cleanup,
  countTokensOpenAI,
  countTokensAnthropic
};