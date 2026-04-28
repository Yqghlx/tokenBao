/**
 * responseHandler 测试
 * 覆盖 OpenAI/Anthropic 流式/非流式 usage 解析、流检测
 */

import { handleResponse } from '../proxy/responseHandler';

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

    test('空字符串应返回 null', () => {
      const result = handleResponse('', { 'content-type': 'application/json' }, 'openai');
      expect(result.stats).toBeNull();
    });

    test('纯空白 body 应返回 null', () => {
      const result = handleResponse('   \n\t  ', { 'content-type': 'application/json' }, 'openai');
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

  describe('extractStreamUsage - 边界场景', () => {
    test('畸形 SSE JSON 应返回 null 而不崩溃', () => {
      const malformedSse = 'data: {invalid json}\ndata: more bad {json}\n\n';
      const { handleResponse } = require('../proxy/responseHandler');
      const result = handleResponse(malformedSse, { 'content-type': 'text/event-stream' }, 'openai');
      expect(result.stats).toBeNull();
    });

    test('data: [DONE] 应跳过不报错', () => {
      const sseData = 'data: [DONE]\n\n';
      const { handleResponse } = require('../proxy/responseHandler');
      const result = handleResponse(sseData, { 'content-type': 'text/event-stream' }, 'openai');
      expect(result.stats).toBeNull();
    });

    test('空 SSE 数据应返回 null', () => {
      const { extractStreamUsage } = require('../proxy/responseHandler');
      expect(extractStreamUsage('')).toBeNull();
      expect(extractStreamUsage('   ')).toBeNull();
    });

    test('无 data: 行的 SSE 应返回 null', () => {
      const { extractStreamUsage } = require('../proxy/responseHandler');
      expect(extractStreamUsage('just some text\nno data here')).toBeNull();
    });
  });

  describe('usage 数值安全化', () => {
    test('null/undefined usage 值应归零', () => {
      const body = JSON.stringify({
        model: 'gpt-4o',
        usage: {
          prompt_tokens: null,
          completion_tokens: undefined
        }
      });
      const result = handleResponse(body, { 'content-type': 'application/json' }, 'openai');
      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(0);
      expect(result.stats!.outputTokens).toBe(0);
    });

    test('负数 token 值应归零', () => {
      const body = JSON.stringify({
        model: 'gpt-4o',
        usage: {
          prompt_tokens: -10,
          completion_tokens: 50
        }
      });
      const result = handleResponse(body, { 'content-type': 'application/json' }, 'openai');
      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(0);
      expect(result.stats!.outputTokens).toBe(50);
    });

    test('小数 token 值应取整', () => {
      const body = JSON.stringify({
        model: 'gpt-4o',
        usage: {
          prompt_tokens: 100.7,
          completion_tokens: 50.3
        }
      });
      const result = handleResponse(body, { 'content-type': 'application/json' }, 'openai');
      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(100);
      expect(result.stats!.outputTokens).toBe(50);
    });

    test('SSE 流中 null usage 值应归零', () => {
      const body = [
        'data: {"type":"message_delta","usage":{"input_tokens":null,"output_tokens":20}}',
      ].join('\n');
      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'anthropic');
      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(0);
      expect(result.stats!.outputTokens).toBe(20);
    });
  });

  describe('safeToken 边界情况', () => {
    test('负数 token 应归零', () => {
      const body = JSON.stringify({
        model: 'gpt-4',
        usage: { prompt_tokens: -10, completion_tokens: -5 }
      });
      const result = handleResponse(body, { 'content-type': 'application/json' }, 'openai');
      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(0);
      expect(result.stats!.outputTokens).toBe(0);
    });

    test('小数 token 应向下取整', () => {
      const body = JSON.stringify({
        model: 'gpt-4',
        usage: { prompt_tokens: 100.7, completion_tokens: 50.3 }
      });
      const result = handleResponse(body, { 'content-type': 'application/json' }, 'openai');
      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(100);
      expect(result.stats!.outputTokens).toBe(50);
    });

    test('NaN token 应归零', () => {
      const body = JSON.stringify({
        model: 'gpt-4',
        usage: { prompt_tokens: NaN, completion_tokens: Infinity }
      });
      const result = handleResponse(body, { 'content-type': 'application/json' }, 'openai');
      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(0);
    });

    test('缺失 usage 的非流式响应应返回 null', () => {
      const body = JSON.stringify({
        model: 'gpt-4',
        choices: [{ message: { content: 'hello' } }]
      });
      const result = handleResponse(body, { 'content-type': 'application/json' }, 'openai');
      expect(result.stats).toBeNull();
    });
  });

  describe('SSE 大数据截断', () => {
    test('超过 10 万行的 SSE 应正确提取末尾 usage', () => {
      // 回归测试：effectiveLines 切片后索引必须用 effectiveLines[i] 而非 lines[i]
      const paddingLines = 'data: {}\n'.repeat(100001);
      const usageLine = 'data: {"usage":{"prompt_tokens":42,"completion_tokens":7}}\n';
      const body = paddingLines + usageLine;
      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'openai');
      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(42);
      expect(result.stats!.outputTokens).toBe(7);
    });

    test('超过 10MB 的 SSE 应截断后仍提取 usage', () => {
      const paddingData = 'data: ' + 'x'.repeat(500) + '\n';
      const bigPadding = paddingData.repeat(25000); // ~12.5MB
      const usageLine = 'data: {"usage":{"prompt_tokens":99}}\n';
      const body = bigPadding + usageLine;
      const result = handleResponse(body, { 'content-type': 'text/event-stream' }, 'openai');
      expect(result.stats).not.toBeNull();
      expect(result.stats!.inputTokens).toBe(99);
    });
  });
});
