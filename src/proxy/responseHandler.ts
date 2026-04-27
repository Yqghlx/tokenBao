import * as statsService from '../services/stats';
import { calculateCost } from './server';

interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
}

/**
 * 解析 OpenAI 流式响应的 usage（最后一个 SSE 事件）
 */
function parseOpenAIStreamUsage(lines: string[]): UsageStats | null {
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(data);
        if (parsed.usage) {
          return {
            inputTokens: parsed.usage.prompt_tokens || 0,
            outputTokens: parsed.usage.completion_tokens || 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            model: parsed.model || 'unknown'
          };
        }
      } catch (e) {
        // SSE 数据行 JSON 解析失败，跳过该行继续处理
        continue;
      }
    }
  }
  return null;
}

/**
 * 解析 Anthropic 流式响应的 usage（message_stop 事件）
 */
function parseAnthropicStreamUsage(lines: string[]): UsageStats | null {
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'message_delta' && parsed.usage) {
          return {
            inputTokens: parsed.usage.input_tokens || 0,
            outputTokens: parsed.usage.output_tokens || 0,
            cacheReadTokens: parsed.usage.cache_read_input_tokens || 0,
            cacheCreationTokens: parsed.usage.cache_creation_input_tokens || 0,
            model: parsed.model || 'unknown'
          };
        }
      } catch (e) {
        // SSE 数据行 JSON 解析失败，跳过该行继续处理
        continue;
      }
    }
  }
  return null;
}

/**
 * 解析非流式响应的 usage（包含 Prompt Caching）
 */
function parseNonStreamUsage(body: string): UsageStats | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed.usage) {
      return {
        inputTokens: parsed.usage.prompt_tokens || parsed.usage.input_tokens || 0,
        outputTokens: parsed.usage.completion_tokens || parsed.usage.output_tokens || 0,
        cacheReadTokens: parsed.usage.cache_read_input_tokens || 0,
        cacheCreationTokens: parsed.usage.cache_creation_input_tokens || 0,
        model: parsed.model || 'unknown'
      };
    }
  } catch (e) {
    console.warn('解析非流式响应 usage 失败:', e);
    return null;
  }
  return null;
}

/**
 * 检测是否为流式响应
 */
function isStreamResponse(headers: Record<string, string>, body: string): boolean {
  const contentType = headers['content-type'] || '';
  if (contentType.includes('text/event-stream')) {
    return true;
  }
  if (body.startsWith('data: ') || body.includes('\ndata: ')) {
    return true;
  }
  return false;
}

/**
 * 处理响应并提取 usage 统计
 */
export function handleResponse(
  responseBody: string,
  headers: Record<string, string>,
  apiType: string
): { stats: UsageStats | null; body: string } {
  const isStream = isStreamResponse(headers, responseBody);
  
  let stats: UsageStats | null = null;
  
  if (isStream) {
    const lines = responseBody.split('\n');
    
    if (apiType === 'openai') {
      stats = parseOpenAIStreamUsage(lines);
    } else if (apiType === 'anthropic') {
      stats = parseAnthropicStreamUsage(lines);
    }
  } else {
    stats = parseNonStreamUsage(responseBody);
  }
  
  return { stats, body: responseBody };
}

/**
 * 记录统计数据到服务
 */
export async function recordStats(stats: UsageStats, apiType: string): Promise<void> {
  if (!stats) return;
  
  const cost = calculateCost(stats.model, stats.inputTokens, stats.outputTokens);
  
  // 缓存节省费用（Prompt Caching）
  const cacheSavings = calculateCacheSavings(stats.cacheReadTokens, stats.model);
  
  await statsService.addStats({
    apiType,
    model: stats.model,
    inputTokens: stats.inputTokens,
    outputTokens: stats.outputTokens,
    cachedTokens: stats.cacheReadTokens + stats.cacheCreationTokens,
    cost
  });
  
  console.log(`响应 Token: 输入=${stats.inputTokens}, 输出=${stats.outputTokens}, 缓存读取=${stats.cacheReadTokens}, 费用=$${cost.toFixed(4)}`);
  
  if (stats.cacheReadTokens > 0) {
    console.log(`Prompt Caching 节省: ${stats.cacheReadTokens} tokens, 费用节省=$${cacheSavings.toFixed(4)}`);
  }
}

/**
 * 计算缓存节省费用
 */
function calculateCacheSavings(cacheReadTokens: number, model: string): number {
  // Anthropic Prompt Caching: 缓存读取费用是正常的 10%
  const normalInputCost = calculateCost(model, cacheReadTokens, 0);
  const cachedInputCost = normalInputCost * 0.1;
  return normalInputCost - cachedInputCost;
}

export default {
  handleResponse,
  recordStats
};