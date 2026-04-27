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

  result.originalTokens = tokenCounterModule.countMessages(body.messages, apiType);

  let modifiedBody = { ...body };

  if (config.rules) {
    modifiedBody.messages = body.messages.map((msg: any) => {
      if (typeof msg.content === 'string') {
        const processed = rulesModule.applyRules(msg.content);
        if (processed !== msg.content) {
          return { ...msg, content: processed };
        }
      }
      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((block: any) => {
            if (block.type === 'text' && block.text) {
              const processed = rulesModule.applyRules(block.text);
              if (processed !== block.text) {
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
  }

  if (config.compression) {
    modifiedBody.messages = modifiedBody.messages.map((msg: any) => {
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

  if (config.routing && modifiedBody.model) {
    const prompt = messagesToText(modifiedBody.messages);
    const routedModel = routingModule.routeModel(modifiedBody.model, prompt);
    if (routedModel !== modifiedBody.model) {
      modifiedBody.model = routedModel;
      result.appliedStrategies.push(`routing:${body.model}→${routedModel}`);
    }
  }

  if (config.caching && apiType === 'anthropic') {
    modifiedBody = cachingModule.addCacheControl(modifiedBody);
    if (modifiedBody.system || hasCacheMarkers(modifiedBody.messages)) {
      result.appliedStrategies.push('caching');
    }
  }

  result.optimizedTokens = tokenCounterModule.countMessages(modifiedBody.messages, apiType);
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