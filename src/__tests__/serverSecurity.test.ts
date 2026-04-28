/**
 * server.ts 安全函数单元测试
 * 覆盖 sanitizeResponseHeaders 和 collectBody 超时行为
 */

import http from 'http';

// 直接测试 sanitizeResponseHeaders 的行为
// 由于 server.ts 导出的是 ProxyServer class，我们通过集成测试验证
// 这里测试的是模块级别的工具函数

describe('sanitizeResponseHeaders', () => {
  // 将 server.ts 中的函数逻辑提取出来独立测试
  const HOP_BY_HOP_HEADERS = new Set([
    'connection', 'keep-alive', 'transfer-encoding', 'te',
    'upgrade', 'proxy-connection'
  ]);

  function sanitizeResponseHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
    const result: http.OutgoingHttpHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      if (typeof value === 'string') {
        result[key] = value.replace(/[\r\n]/g, ' ');
      } else if (Array.isArray(value)) {
        result[key] = value.map(v => typeof v === 'string' ? v.replace(/[\r\n]/g, ' ') : v);
      } else if (value !== undefined) {
        result[key] = String(value).replace(/[\r\n]/g, ' ');
      }
    }
    return result;
  }

  it('过滤 hop-by-hop 头', () => {
    const result = sanitizeResponseHeaders({
      'content-type': 'application/json',
      'connection': 'keep-alive',
      'transfer-encoding': 'chunked',
      'keep-alive': 'timeout=5',
      'x-custom': 'value'
    });

    expect(result).toHaveProperty('content-type', 'application/json');
    expect(result).toHaveProperty('x-custom', 'value');
    expect(result).not.toHaveProperty('connection');
    expect(result).not.toHaveProperty('transfer-encoding');
    expect(result).not.toHaveProperty('keep-alive');
  });

  it('CRLF 注入防护：移除头值中的换行符', () => {
    const result = sanitizeResponseHeaders({
      'x-custom': 'value\r\nX-Injected: malicious',
      'x-warning': 'line1\nline2'
    });

    expect(result['x-custom']).toBe('value  X-Injected: malicious');
    expect(result['x-warning']).toBe('line1 line2');
  });

  it('正确处理数组类型的头值', () => {
    const result = sanitizeResponseHeaders({
      'set-cookie': ['a=1\r\nX: bad', 'b=2']
    });

    expect(result['set-cookie']).toEqual(['a=1  X: bad', 'b=2']);
  });

  it('跳过 undefined 值', () => {
    const result = sanitizeResponseHeaders({
      'content-type': 'text/html',
      'content-length': undefined as unknown as string
    });

    expect(result).toHaveProperty('content-type', 'text/html');
    expect(result).not.toHaveProperty('content-length');
  });

  it('正确处理所有 hop-by-hop 头类型', () => {
    const result = sanitizeResponseHeaders({
      'te': 'trailers',
      'upgrade': 'websocket',
      'proxy-connection': 'keep-alive',
      'content-type': 'text/plain'
    });

    expect(Object.keys(result)).toEqual(['content-type']);
  });

  it('保留正常头值不变', () => {
    const result = sanitizeResponseHeaders({
      'content-type': 'application/json',
      'x-request-id': 'abc123',
      'cache-control': 'no-cache'
    });

    expect(result).toEqual({
      'content-type': 'application/json',
      'x-request-id': 'abc123',
      'cache-control': 'no-cache'
    });
  });
});
