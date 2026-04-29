export { default as caching } from './caching';
export { default as compression } from './compression';
export { default as routing } from './routing';
export { default as rules } from './rules';
export { default as batch } from './batch';
export { default as dlp } from './dlp';

import cachingModule from './caching';
import compressionModule from './compression';
import routingModule from './routing';
import rulesModule from './rules';
import dlpModule from './dlp';
import tokenCounterModule from '../utils/tokenCounter';

interface OptimizationConfig {
  caching: boolean;
  compression: boolean;
  routing: boolean;
  batching: boolean;
  rules: boolean;
  dlp: boolean;
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
  rules: true,
  dlp: false
};

export function setOptimizationConfig(newConfig: Partial<OptimizationConfig>): void {
  Object.assign(config, newConfig);
  cachingModule.setOptions({ enabled: newConfig.caching ?? config.caching });
  compressionModule.setOptions({ enabled: newConfig.compression ?? config.compression });
  routingModule.setOptions({ enabled: newConfig.routing ?? config.routing });
  dlpModule.setOptions({ enabled: newConfig.dlp ?? config.dlp });
}

export function getOptimizationConfig(): OptimizationConfig {
  return { ...config };
}

/**
 * 对消息列表中的文本内容统一应用变换函数
 * 逐条处理，单条失败不影响其他消息的数据完整性
 * 快速路径：若所有消息均未变更则返回原数组，避免不必要的对象创建
 */
function processMessageTexts(
  messages: ChatMessage[],
  transform: (text: string) => string
): ChatMessage[] {
  let changed = false;
  const result = new Array<ChatMessage>(messages.length);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    try {
      if (typeof msg.content === 'string') {
        const newContent = transform(msg.content);
        if (newContent !== msg.content) {
          changed = true;
          result[i] = { ...msg, content: newContent };
        } else {
          result[i] = msg;
        }
      } else if (Array.isArray(msg.content)) {
        let blockChanged = false;
        const newBlocks = new Array(msg.content.length);
        for (let j = 0; j < msg.content.length; j++) {
          const block = msg.content[j];
          if (block.type === 'text' && (block as TextContentBlock).text) {
            const newText = transform((block as TextContentBlock).text);
            if (newText !== (block as TextContentBlock).text) {
              blockChanged = true;
              newBlocks[j] = { ...block, text: newText };
            } else {
              newBlocks[j] = block;
            }
          } else {
            newBlocks[j] = block;
          }
        }
        if (blockChanged) {
          changed = true;
          result[i] = { ...msg, content: newBlocks };
        } else {
          result[i] = msg;
        }
      } else {
        result[i] = msg;
      }
    } catch (err) {
      console.warn('单条消息处理失败，保留原文:', (err as Error).message);
      result[i] = msg;
    }
  }

  return changed ? result : messages;
}

/** 计算 Anthropic system 字段的 token 数（支持 string 和 array 格式） */
function countSystemTokens(system: unknown, apiType: string): number {
  if (!system) return 0;
  if (typeof system === 'string' && system.length > 0) {
    return tokenCounterModule.countTokens(system, apiType);
  }
  if (Array.isArray(system)) {
    return system.reduce((total: number, block: Record<string, unknown>) => {
      if (typeof block.text === 'string' && block.text.length > 0) {
        return total + tokenCounterModule.countTokens(block.text, apiType);
      }
      return total;
    }, 0);
  }
  return 0;
}

/** 检查是否有任何优化策略处于启用状态 */
function hasEnabledStrategy(): boolean {
  return config.dlp || config.rules || config.compression || config.routing || config.caching;
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

  // 无策略启用时跳过昂贵的 structuredClone 和 token 计数，直接返回原 body
  if (!hasEnabledStrategy()) {
    return result;
  }

  // 空消息数组无需优化，直接返回
  if (body.messages.length === 0) {
    return result;
  }

  try {
    result.originalTokens = tokenCounterModule.countMessages(body.messages, apiType);
    // Anthropic system prompt 作为顶级字段独立于 messages，需额外计算
    result.originalTokens += countSystemTokens(body.system, apiType);
  } catch (err) {
    console.warn('原始 token 计数失败，使用默认值 0:', (err as Error).message);
    result.originalTokens = 0;
  }

  // 深拷贝请求体，防止优化失败时污染原始数据
  let modifiedBody = structuredClone(body) as ApiRequestBody;

  // DLP 敏感数据脱敏 —— 优先于其他策略执行，确保 PII 不泄露到上游
  if (config.dlp) {
    try {
      let totalDetections = 0;
      modifiedBody.messages = processMessageTexts(modifiedBody.messages, (text) => {
        const scanResult = dlpModule.scan(text);
        totalDetections += scanResult.detections.reduce((sum, d) => sum + d.count, 0);
        return scanResult.text;
      });
      if (totalDetections > 0) {
        result.appliedStrategies.push(`dlp(${totalDetections})`);
      }
    } catch (err) {
      console.warn('DLP 脱敏扫描失败，已跳过:', (err as Error).message);
    }
  }

  // 规则替换 —— 错误隔离，失败则跳过
  if (config.rules) {
    try {
      modifiedBody.messages = processMessageTexts(modifiedBody.messages, (text) => rulesModule.applyRules(text));
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
      modifiedBody.messages = processMessageTexts(modifiedBody.messages, (text) => compressionModule.compress(text).text);
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

  // 管线完整性验证：优化后 body 关键字段异常则回退原始数据
  if (!modifiedBody.messages || !Array.isArray(modifiedBody.messages) || !modifiedBody.model) {
    console.warn('优化管线输出异常，回退原始请求体');
    modifiedBody = structuredClone(body) as ApiRequestBody;
    result.savedTokens = 0;
    result.appliedStrategies = [];
  }

  // 无策略应用时 body 未修改，跳过昂贵的 token 重计数
  if (result.appliedStrategies.length > 0) {
    try {
      result.optimizedTokens = tokenCounterModule.countMessages(modifiedBody.messages, apiType);
      // Anthropic system prompt 作为顶级字段独立于 messages，需额外计算
      result.optimizedTokens += countSystemTokens(
        (modifiedBody as Record<string, unknown>).system, apiType
      );
    } catch (err) {
      console.warn('优化后 token 计数失败，使用原始值:', (err as Error).message);
      result.optimizedTokens = result.originalTokens;
    }
    result.savedTokens = result.originalTokens - result.optimizedTokens;
  } else {
    result.optimizedTokens = result.originalTokens;
    result.savedTokens = 0;
  }
  result.modifiedBody = modifiedBody;

  const duration = Date.now() - startTime;
  if (duration > 10) {
    console.info(`优化管线耗时: ${duration}ms, 策略: [${result.appliedStrategies.join(', ')}]`);
  }

  return result;
}

/** 将消息列表拼接为纯文本，单次遍历避免 filter+map 中间数组 */
function messagesToText(messages: ChatMessage[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      parts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text' && (block as TextContentBlock).text) {
          parts.push((block as TextContentBlock).text);
        }
      }
    }
  }
  return parts.join(' ');
}

function hasCacheMarkers(messages: ChatMessage[]): boolean {
  return messages.some((msg) => {
    if (Array.isArray(msg.content)) {
      return msg.content.some((block) => block.type === 'text' && (block as TextContentBlock).cache === true);
    }
    return false;
  });
}