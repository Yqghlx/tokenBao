export { default as caching } from './caching';
export { default as compression } from './compression';
export { default as routing } from './routing';
export { default as rules } from './rules';
export { default as batch } from './batch';

import cachingModule from './caching';
import compressionModule from './compression';
import routingModule from './routing';
import tokenCounterModule from '../utils/tokenCounter';

interface OptimizationConfig {
  caching: boolean;
  compression: boolean;
  routing: boolean;
  batching: boolean;
}

interface OptimizationResult {
  modifiedBody: any;
  originalTokens: number;
  optimizedTokens: number;
  savedTokens: number;
  appliedStrategies: string[];
}

const config: OptimizationConfig = {
  caching: true,
  compression: true,
  routing: true,
  batching: false
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

export function applyOptimizations(apiType: string, body: any): OptimizationResult {
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

  result.originalTokens = tokenCounterModule.countMessages(body.messages);

  let modifiedBody = { ...body };

  if (config.compression) {
    modifiedBody.messages = body.messages.map((msg: any) => {
      if (typeof msg.content === 'string') {
        const compressed = compressionModule.compress(msg.content);
        return { ...msg, content: compressed.text };
      }
      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((block: any) => {
            if (block.type === 'text' && block.text) {
              const compressed = compressionModule.compress(block.text);
              return { ...block, text: compressed.text };
            }
            return block;
          })
        };
      }
      return msg;
    });
    result.appliedStrategies.push('compression');
  }

  if (config.routing && body.model) {
    const prompt = messagesToText(body.messages);
    const routedModel = routingModule.routeModel(apiType, body.model, prompt);
    if (routedModel !== body.model) {
      modifiedBody.model = routedModel;
      result.appliedStrategies.push(`routing:${body.model}→${routedModel}`);
    }
  }

  // Anthropic 支持 Prompt Caching，需要添加 cache_control 标记
  if (config.caching && apiType === 'anthropic') {
    modifiedBody = cachingModule.addCacheControl(modifiedBody);
    if (modifiedBody.system || hasCacheMarkers(modifiedBody.messages)) {
      result.appliedStrategies.push('caching');
    }
  }

  result.optimizedTokens = tokenCounterModule.countMessages(modifiedBody.messages);
  result.savedTokens = result.originalTokens - result.optimizedTokens;
  result.modifiedBody = modifiedBody;

  return result;
}

function messagesToText(messages: any[]): string {
  return messages
    .map((msg: any) => {
      if (typeof msg.content === 'string') return msg.content;
      if (Array.isArray(msg.content)) {
        return msg.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join(' ');
      }
      return '';
    })
    .join(' ');
}

function hasCacheMarkers(messages: any[]): boolean {
  return messages.some((msg: any) => {
    if (Array.isArray(msg.content)) {
      return msg.content.some((block: any) => block.cache === true);
    }
    return false;
  });
}