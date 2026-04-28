import { getEncoding, Tiktoken } from 'js-tiktoken';

/** 图片 token 固定成本估算值（基于 Claude 3.5 Sonnet 1080x1080 约 85 tokens） */
const IMAGE_TOKEN_ESTIMATE = 85;

interface ContentBlock {
  type: string;
  text?: string;
}

interface Message {
  content: string | ContentBlock[];
}

let encoder: Tiktoken | null = null;
let encoderFailed = false;
let encodeFailCount = 0;
const MAX_ENCODE_FAILS = 5;

function getEncoder(): Tiktoken | null {
  if (encoderFailed) return null;
  if (!encoder) {
    try {
      encoder = getEncoding('cl100k_base');
      encodeFailCount = 0;
    } catch (err) {
      console.warn('tiktoken 初始化失败，后续将使用估算:', (err as Error).message);
      encoderFailed = true;
      return null;
    }
  }
  return encoder;
}
function countTokensOpenAI(text: string): number {
  if (!text) return 0;
  const enc = getEncoder();
  if (!enc) return estimateTokensFallback(text);
  try {
    return enc.encode(text).length;
  } catch (err) {
    console.warn('tiktoken 编码失败，使用估算 fallback:', (err as Error).message);
    encodeFailCount++;
    // 连续失败超过阈值后彻底降级，避免反复创建失败的编码器
    if (encodeFailCount >= MAX_ENCODE_FAILS) {
      encoder = null;
      encoderFailed = true;
      console.warn(`tiktoken 连续 ${MAX_ENCODE_FAILS} 次编码失败，永久降级为估算模式`);
    }
    return estimateTokensFallback(text);
  }
}
/**
 * Anthropic token 估算：单次遍历按字符类型分类计数
 * CJK 字符约 1.5 chars/token，拉丁字母约 3.5 chars/token，代码/符号约 4 chars/token
 */
function countTokensAnthropic(text: string): number {
  if (!text) return 0;

  let cjkChars = 0;
  let surrogatePairs = 0;
  let codeAndSymbols = 0;
  let whitespace = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // 代理对（高代理项 + 低代理项），如 emoji 和 CJK 扩展字符
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xDC00 && low <= 0xDFFF) {
        surrogatePairs++;
        i++; // 跳过低代理项
        continue;
      }
    }
    // CJK 统一汉字 + 平假名 + 片假名 + 韩文
    if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3040 && code <= 0x309F) ||
        (code >= 0x30A0 && code <= 0x30FF) || (code >= 0xAC00 && code <= 0xD7AF)) {
      cjkChars++;
    } else if (code === 0x09 || code === 0x0A || code === 0x0D || code === 0x20 ||
               (code >= 0x2000 && code <= 0x200A) || code === 0x2028 || code === 0x2029 || code === 0x205F || code === 0x3000) {
      whitespace++;
    } else if ((code >= 0x21 && code <= 0x2F) || (code >= 0x3A && code <= 0x40) ||
               (code >= 0x5B && code <= 0x60) || (code >= 0x7B && code <= 0x7E)) {
      codeAndSymbols++;
    }
  }

  const otherChars = text.length - cjkChars - surrogatePairs * 2 - codeAndSymbols - whitespace;

  return Math.ceil(cjkChars / 1.5) + Math.ceil(surrogatePairs / 2) + Math.ceil(codeAndSymbols / 4) + Math.ceil(whitespace / 4) + Math.ceil(Math.max(0, otherChars) / 3.5) + 3;
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
          return msgTotal + IMAGE_TOKEN_ESTIMATE;
        }
        return msgTotal;
      }, 0);
    }

    return total + contentTokens + roleOverhead + formatOverhead;
  }, 3);
}

function cleanup(): void {
  // js-tiktoken 使用纯 JS 实现，无 WASM 内存需释放，置空即可让 GC 回收
  encoder = null;
}

export default {
  countTokens,
  countMessages,
  cleanup,
  countTokensOpenAI,
  countTokensAnthropic
};
