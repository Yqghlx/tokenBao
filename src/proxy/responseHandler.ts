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

/** SSE 解析最大行数，防止畸形数据消耗过多内存 */
const MAX_SSE_LINES = 100000;

/**
 * 从 SSE 流数据中提取 usage 统计（流式路径共用）
 * 单次反向遍历：先收集末尾的 usage，再继续向前扫描 message_start 模型名
 */
export function extractStreamUsage(sseData: string): UsageStats | null {
  if (!sseData || !sseData.includes('data: ')) return null;

  // 截断超长数据防止内存耗尽，usage 信息通常在流末尾，截掉头部不影响结果
  let dataToProcess = sseData;
  if (dataToProcess.length > 10 * 1024 * 1024) {
    // 保留末尾 5MB，usage 和 message_start 通常在流末尾
    dataToProcess = dataToProcess.slice(-5 * 1024 * 1024);
  }

  const lines = dataToProcess.split('\n');
  // 防御畸形数据产生过多行
  const effectiveLines = lines.length > MAX_SSE_LINES ? lines.slice(-MAX_SSE_LINES) : lines;
  let fallbackModel = 'unknown';
  let foundUsage: UsageStats | null = null;
  let foundModel = false;

  // 反向遍历：先遇到末尾的 usage，再向前寻找 message_start 的模型名
  for (let i = effectiveLines.length - 1; i >= 0; i--) {
    const line = effectiveLines[i];
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6);
    if (data === '[DONE]') continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }

    // 提取 message_start 模型名（Anthropic 格式）
    if (!foundModel && parsed.type === 'message_start' && (parsed as { message?: { model?: string } }).message?.model) {
      fallbackModel = (parsed as { message: { model: string } }).message.model;
      foundModel = true;
      // 已收集 usage 和模型名，提前退出
      if (foundUsage) {
        foundUsage.model = fallbackModel;
        break;
      }
      continue;
    }

    // 首次遇到的 usage 来自流末尾（最完整的数据）
    if (!foundUsage) {
      // Anthropic 格式：message_delta 中的 usage
      if (parsed.type === 'message_delta' && parsed.usage) {
        const usage = parsed.usage as Record<string, unknown>;
        foundUsage = {
          inputTokens: safeToken(usage.input_tokens),
          outputTokens: safeToken(usage.output_tokens),
          cacheReadTokens: safeToken(usage.cache_read_input_tokens),
          cacheCreationTokens: safeToken(usage.cache_creation_input_tokens),
          model: fallbackModel
        };
        if (foundModel) break;
        continue;
      }

      // OpenAI 格式
      if (parsed.usage) {
        const usage = parsed.usage as Record<string, unknown>;
        const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
        foundUsage = {
          inputTokens: safeToken(usage.prompt_tokens),
          outputTokens: safeToken(usage.completion_tokens),
          cacheReadTokens: safeToken(details?.cached_tokens),
          cacheCreationTokens: 0,
          model: (parsed.model as string) || fallbackModel
        };
        if (foundModel) break;
        continue;
      }
    }
  }

  return foundUsage;
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
 * 优先使用 content-type 判断，避免 JSON 响应中包含 "data: " 文本时误判
 */
function isStreamResponse(headers: Record<string, string>, body: string): boolean {
  const contentType = headers['content-type'] || '';
  if (contentType.includes('text/event-stream')) {
    return true;
  }
  // 明确的 JSON 响应不可能是流式，跳过文本内容匹配防止误判
  if (contentType.includes('application/json')) {
    return false;
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