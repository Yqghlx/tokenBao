export { default as caching } from './caching';
export { default as compression } from './compression';
export { default as routing } from './routing';
export { default as rules } from './rules';
export { default as batch } from './batch';

import cachingModule from './caching';
import compressionModule from './compression';
import routingModule from './routing';
import rulesModule from './rules';
import tokenCounterModule from '../utils/tokenCounter';

interface OptimizationConfig {
  caching: boolean;
  compression: boolean;
  routing: boolean;
  batching: boolean;
  rules: boolean;
}

/** 聊天消息中的文本内容块 */
interface TextContentBlock {
  type: 'text';
  text: string;
  cache?: boolean;
}

/** 聊天消息中的其他内容块（图片等） */
interface OtherContentBlock {
  type: string;
  [key: string]: unknown;
}

/** 聊天消息的内容：纯字符串或内容块数组 */
type MessageContent = string | Array<TextContentBlock | OtherContentBlock>;

/** API 请求中的单条消息 */
interface ChatMessage {
  role: string;
  content: MessageContent;
}

/** API 请求体结构 */
interface ApiRequestBody {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  system?: string | unknown;
  [key: string]: unknown;
}

interface OptimizationResult {
  modifiedBody: ApiRequestBody;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  appliedStrategies: string[];
}

const config: OptimizationConfig = {
  caching: true,
  compression: true,
  routing: true,
  batching: false,
  rules: true
};

export function setOptimizationConfig(newConfig: Partial<OptimizationConfig>): void {
  Object.assign(config, newConfig);
  cachingModule.setOptions({ enabled: newConfig.caching ?? config.caching });
  compressionModule.setOptions({ enabled: newConfig.compression ?? config.compression });
  routingModule.setOptions({ enabled: newConfig.routing ?? config.routing });
}

export function getOptimizationConfig(): OptimizationConfig {
  return { ...config };
}

export function applyOptimizations(apiType: string, body: ApiRequestBody): OptimizationResult {
  const startTime = Date.now();
  const result: OptimizationResult = {
    modifiedBody: body,
    originalTokens: 0,
    optimizedTokens: 0,
    savedTokens: 0,
    appliedStrategies: []
  };

  if (!body || !body.messages) {
    return result;
  }

  result.originalTokens = tokenCounterModule.countMessages(body.messages, apiType);

  // 深拷贝请求体，防止优化失败时污染原始数据
  let modifiedBody = structuredClone(body) as ApiRequestBody;

  // 规则替换 —— 错误隔离，失败则跳过
  if (config.rules) {
    try {
      modifiedBody.messages = modifiedBody.messages.map((msg: ChatMessage) => {
        if (typeof msg.content === 'string') {
          const processed = rulesModule.applyRules(msg.content);
          if (processed !== msg.content) {
            return { ...msg, content: processed };
          }
        }
        if (Array.isArray(msg.content)) {
          return {
            ...msg,
            content: msg.content.map((block) => {
              if (block.type === 'text' && (block as TextContentBlock).text) {
                const textBlock = block as TextContentBlock;
                const processed = rulesModule.applyRules(textBlock.text);
                if (processed !== textBlock.text) {
                  return { ...block, text: processed };
                }
              }
              return block;
            })
          };
        }
        return msg;
      });
      const enabledRules = rulesModule.listRules().filter(r => r.enabled);
      if (enabledRules.length > 0) {
        result.appliedStrategies.push(`rules(${enabledRules.length})`);
      }
    } catch (err) {
      console.warn('规则替换优化失败，已跳过:', (err as Error).message);
    }
  }

  // 文本压缩 —— 错误隔离，失败则跳过
  if (config.compression) {
    try {
      modifiedBody.messages = modifiedBody.messages.map((msg: ChatMessage) => {
        if (typeof msg.content === 'string') {
          const compressed = compressionModule.compress(msg.content);
          return { ...msg, content: compressed.text };
        }
        if (Array.isArray(msg.content)) {
          return {
            ...msg,
            content: msg.content.map((block) => {
              if (block.type === 'text' && (block as TextContentBlock).text) {
                const textBlock = block as TextContentBlock;
                const compressed = compressionModule.compress(textBlock.text);
                return { ...block, text: compressed.text };
              }
              return block;
            })
          };
        }
        return msg;
      });
      result.appliedStrategies.push('compression');
    } catch (err) {
      console.warn('文本压缩优化失败，已跳过:', (err as Error).message);
    }
  }

  // 模型路由 —— 错误隔离，失败则跳过
  if (config.routing && modifiedBody.model) {
    try {
      const prompt = messagesToText(modifiedBody.messages);
      const routedModel = routingModule.routeModel(modifiedBody.model, prompt);
      if (routedModel !== modifiedBody.model) {
        modifiedBody.model = routedModel;
        result.appliedStrategies.push(`routing:${body.model}→${routedModel}`);
      }
    } catch (err) {
      console.warn('模型路由优化失败，已跳过:', (err as Error).message);
    }
  }

  // Prompt Caching —— 错误隔离，失败则跳过
  if (config.caching && apiType === 'anthropic') {
    try {
      modifiedBody = cachingModule.addCacheControl(modifiedBody);
      if (modifiedBody.system || hasCacheMarkers(modifiedBody.messages)) {
        result.appliedStrategies.push('caching');
      }
    } catch (err) {
      console.warn('Prompt Caching 优化失败，已跳过:', (err as Error).message);
    }
  }

  // 管线完整性验证：优化后 body 结构异常则回退原始数据
  if (!modifiedBody.messages || !Array.isArray(modifiedBody.messages)) {
    console.warn('优化管线输出异常，回退原始请求体');
    modifiedBody = { ...body };
    result.savedTokens = 0;
    result.appliedStrategies = [];
  }

  result.optimizedTokens = tokenCounterModule.countMessages(modifiedBody.messages, apiType);
  result.savedTokens = result.originalTokens - result.optimizedTokens;
  result.modifiedBody = modifiedBody;

  const duration = Date.now() - startTime;
  if (duration > 10) {
    console.log(`优化管线耗时: ${duration}ms, 策略: [${result.appliedStrategies.join(', ')}]`);
  }

  return result;
}

function messagesToText(messages: ChatMessage[]): string {
  return messages
    .map((msg) => {
      if (typeof msg.content === 'string') return msg.content;
      if (Array.isArray(msg.content)) {
        return msg.content
          .filter((block): block is TextContentBlock => block.type === 'text')
          .map((block) => block.text)
          .join(' ');
      }
      return '';
    })
    .join(' ');
}

function hasCacheMarkers(messages: ChatMessage[]): boolean {
  return messages.some((msg) => {
    if (Array.isArray(msg.content)) {
      return msg.content.some((block) => block.type === 'text' && (block as TextContentBlock).cache === true);
    }
    return false;
  });
}