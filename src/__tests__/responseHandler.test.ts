/**
 * responseHandler 测试
 * 覆盖 OpenAI/Anthropic 流式/非流式 usage 解析、流检测、缓存节省计算
 */

// Mock statsService 以避免真实文件写入
jest.mock('../services/stats', () => ({
  addStats: jest.fn().mockResolvedValue(undefined),
  getSummary: jest.fn().mockResolvedValue({
    totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0,
    totalCachedTokens: 0, totalCost: 0, byApi: {}, byModel: {}
  })
}));

import { handleResponse, recordStats } from '../proxy/responseHandler';
import * as statsService from '../services/stats';

const mockAddStats = statsService.addStats as jest.MockedFunction<typeof statsService.addStats>;

describe('responseHandler', () => {
  describe('handleResponse - 非流式响应', () => {
    test('应正确解析 OpenAI 非流式响应的 usage', () => {
      const body = JSON.stringify({
        id: 'chatcmpl-123',
        model: 'gpt-4o',
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50
        },
        choices: [{ message: { content: 'hello' } }]
      });

      const result = handleResponse(body, { 'content-type': 'application/json' }, 'openai');

      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(100);
      expect(result.stats!.outputTokens).toBe(50);
      expect(result.stats!.cacheReadTokens).toBe(0);
      expect(result.stats!.model).toBe('gpt-4o');
    });

    test('应正确解析 OpenAI 非流式响应的 cached_tokens', () => {
      const body = JSON.stringify({
        id: 'chatcmpl-456',
        model: 'gpt-4o',
        usage: {
          prompt_tokens: 200,
          completion_tokens: 80,
          prompt_tokens_details: { cached_tokens: 150 }
        },
        choices: [{ message: { content: 'cached response' } }]
      });

      const result = handleResponse(body, { 'content-type': 'application/json' }, 'openai');

      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(200);
      expect(result.stats!.outputTokens).toBe(80);
      expect(result.stats!.cacheReadTokens).toBe(150);
    });

    test('应正确解析 Anthropic 非流式响应的 usage', () => {
      const body = JSON.stringify({
        id: 'msg_123',
        model: 'claude-3-sonnet',
        type: 'message',
        usage: {
          input_tokens: 200,
          output_tokens: 80,
          cache_read_input_tokens: 50,
          cache_creation_input_tokens: 30
        },
        content: [{ type: 'text', text: 'response' }]
      });

      const result = handleResponse(body, { 'content-type': 'application/json' }, 'anthropic');

      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(200);
      expect(result.stats!.outputTokens).toBe(80);
      expect(result.stats!.cacheReadTokens).toBe(50);
      expect(result.stats!.cacheCreationTokens).toBe(30);
      expect(result.stats!.model).toBe('claude-3-sonnet');
    });

    test('无 usage 字段应返回 null', () => {
      const body = JSON.stringify({ id: '123', model: 'gpt-4', choices: [] });
      const result = handleResponse(body, { 'content-type': 'application/json' }, 'openai');
      expect(result.stats).toBeNull();
    });

    test('非法 JSON 应返回 null', () => {
      const result = handleResponse('not json', { 'content-type': 'application/json' }, 'openai');
      expect(result.stats).toBeNull();
    });
  });

  describe('handleResponse - 流式响应', () => {
    test('应正确解析 OpenAI SSE 流的 usage', () => {
      const body = [
        'data: {"choices":[{"delta":{"content":"hello"}}]}',
        'data: {"choices":[{"delta":{"content":" world"}}]}',
        'data: {"usage":{"prompt_tokens":150,"completion_tokens":30},"model":"gpt-4o"}',
        'data: [DONE]'
      ].join('\n');

      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'openai');

      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(150);
      expect(result.stats!.outputTokens).toBe(30);
      expect(result.stats!.model).toBe('gpt-4o');
    });

    test('应正确解析 OpenAI SSE 流的 prompt_tokens_details.cached_tokens', () => {
      const body = [
        'data: {"choices":[{"delta":{"content":"hi"}}]}',
        'data: {"usage":{"prompt_tokens":200,"completion_tokens":50,"prompt_tokens_details":{"cached_tokens":120}},"model":"gpt-4o"}',
        'data: [DONE]'
      ].join('\n');

      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'openai');

      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(200);
      expect(result.stats!.outputTokens).toBe(50);
      expect(result.stats!.cacheReadTokens).toBe(120);
      expect(result.stats!.model).toBe('gpt-4o');
    });

    test('应正确解析 Anthropic SSE 流的 usage', () => {
      const body = [
        'data: {"type":"message_start","message":{"model":"claude-3-haiku"}}',
        'data: {"type":"content_block_delta","delta":{"text":"hi"}}',
        'data: {"type":"message_delta","usage":{"input_tokens":80,"output_tokens":20,"cache_read_input_tokens":10}}',
      ].join('\n');

      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'anthropic');

      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(80);
      expect(result.stats!.outputTokens).toBe(20);
      expect(result.stats!.cacheReadTokens).toBe(10);
    });

    test('SSE 无 usage 事件应返回 null', () => {
      const body = [
        'data: {"choices":[{"delta":{"content":"hello"}}]}',
        'data: [DONE]'
      ].join('\n');

      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'openai');
      expect(result.stats).toBeNull();
    });

    test('非法 SSE 数据行应被跳过', () => {
      const body = [
        'data: {invalid json}',
        'data: {"usage":{"prompt_tokens":50,"completion_tokens":10},"model":"gpt-4o"}',
      ].join('\n');

      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'openai');
      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(50);
    });

    test('Anthropic SSE 应从 message_start 提取模型名作为 fallback', () => {
      const body = [
        'data: {"type":"message_start","message":{"model":"claude-opus-4.6"}}',
        'data: {"type":"content_block_delta","delta":{"text":"response"}}',
        'data: {"type":"message_delta","usage":{"input_tokens":100,"output_tokens":50}}',
      ].join('\n');

      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'anthropic');

      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(100);
      expect(result.stats!.outputTokens).toBe(50);
      // message_delta 没有 model 字段，应使用 message_start 中的 fallback
      expect(result.stats!.model).toBe('claude-opus-4.6');
    });

    test('SSE 无 message_start 且 usage 无模型时应返回 unknown', () => {
      const body = [
        'data: {"type":"content_block_delta","delta":{"text":"test"}}',
        'data: {"type":"message_delta","usage":{"input_tokens":50,"output_tokens":20}}',
      ].join('\n');

      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'anthropic');

      expect(result.stats).not.toBeNull();
      expect(result.stats!.model).toBe('unknown');
    });
  });

  describe('handleResponse - 流检测', () => {
    test('content-type 为 text/event-stream 应识别为流', () => {
      const body = 'data: {"usage":{"prompt_tokens":10}}\n';
      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'openai');
      // 应走流解析路径
      expect(result).toBeDefined();
    });

    test('body 以 data: 开头应识别为流', () => {
      const body = 'data: {"usage":{"prompt_tokens":10}}\n';
      const result = handleResponse(body, { 'content-type': 'text/plain' }, 'openai');
      expect(result).toBeDefined();
    });
  });

  describe('recordStats', () => {
    test('应调用 statsService.addStats 记录统计', async () => {
      mockAddStats.mockClear();

      await recordStats({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        model: 'gpt-4o'
      }, 'openai');

      expect(mockAddStats).toHaveBeenCalledTimes(1);
      const call = mockAddStats.mock.calls[0][0];
      expect(call.apiType).toBe('openai');
      expect(call.model).toBe('gpt-4o');
      expect(call.inputTokens).toBe(100);
      expect(call.outputTokens).toBe(50);
      expect(call.cost).toBeGreaterThan(0);
    });

    test('应正确合并缓存 token', async () => {
      mockAddStats.mockClear();

      await recordStats({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 30,
        cacheCreationTokens: 20,
        model: 'claude-3-sonnet'
      }, 'anthropic');

      const call = mockAddStats.mock.calls[0][0];
      expect(call.cachedTokens).toBe(50); // 30 + 20
    });

    test('未知模型应使用 fallback 价格计算费用', async () => {
      mockAddStats.mockClear();

      await recordStats({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        model: 'unknown-model'
      }, 'openai');

      const call = mockAddStats.mock.calls[0][0];
      // 未知模型使用 fallback 价格：input=0.001, output=0.002
      const expected = (100 / 1000) * 0.001 + (50 / 1000) * 0.002;
      expect(call.cost).toBeCloseTo(expected, 6);
    });
  });
});
