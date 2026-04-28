interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  model: string;
}

/**
 * 将 API 返回的 usage 数值安全化：非正整数或 NaN 归零
 */
function safeToken(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/**
 * 从 SSE 流数据中提取 usage 统计（流式路径共用）
 * OpenAI: 最后一个包含 usage 的 data 事件
 * Anthropic: message_delta 事件中的 usage
 */
export function extractStreamUsage(sseData: string): UsageStats | null {
  if (!sseData || !sseData.includes('data: ')) return null;

  const lines = sseData.split('\n');
  let fallbackModel = 'unknown';

  // 先从 message_start 事件提取模型名（Anthropic 流式）
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'message_start' && parsed.message?.model) {
        fallbackModel = parsed.message.model;
        break;
      }
    } catch {
      console.warn('SSE message_start 解析失败，跳过:', data.slice(0, 100));
      continue;
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') continue;

    try {
      const parsed = JSON.parse(data);

      // Anthropic 格式优先检测：message_delta 事件也有 usage 字段，需先排除
      if (parsed.type === 'message_delta' && parsed.usage) {
        return {
          inputTokens: safeToken(parsed.usage.input_tokens),
          outputTokens: safeToken(parsed.usage.output_tokens),
          cacheReadTokens: safeToken(parsed.usage.cache_read_input_tokens),
          cacheCreationTokens: safeToken(parsed.usage.cache_creation_input_tokens),
          model: fallbackModel
        };
      }

      // OpenAI 格式
      if (parsed.usage) {
        return {
          inputTokens: safeToken(parsed.usage.prompt_tokens),
          outputTokens: safeToken(parsed.usage.completion_tokens),
          cacheReadTokens: safeToken(parsed.usage.prompt_tokens_details?.cached_tokens),
          cacheCreationTokens: 0,
          model: parsed.model || fallbackModel
        };
      }
    } catch {
      console.warn('SSE usage 解析失败，跳过:', data.slice(0, 100));
      continue;
    }
  }

  return null;
}

/**
 * 解析非流式响应的 usage（包含 Prompt Caching）
 */
function parseNonStreamUsage(body: string): UsageStats | null {
  if (!body || !body.trim()) return null;
  try {
    const parsed = JSON.parse(body);
    if (parsed.usage) {
      return {
        inputTokens: safeToken(parsed.usage.prompt_tokens ?? parsed.usage.input_tokens),
        outputTokens: safeToken(parsed.usage.completion_tokens ?? parsed.usage.output_tokens),
        // Anthropic: cache_read_input_tokens / cache_creation_input_tokens
        // OpenAI: prompt_tokens_details.cached_tokens
        cacheReadTokens: safeToken(parsed.usage.cache_read_input_tokens ?? parsed.usage.prompt_tokens_details?.cached_tokens),
        cacheCreationTokens: safeToken(parsed.usage.cache_creation_input_tokens),
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
  _apiType: string
): { stats: UsageStats | null; body: string } {
  const isStream = isStreamResponse(headers, responseBody);
  
  let stats: UsageStats | null = null;
  
  if (isStream) {
    stats = extractStreamUsage(responseBody);
  } else {
    stats = parseNonStreamUsage(responseBody);
  }
  
  return { stats, body: responseBody };
}

export default {
  handleResponse
};