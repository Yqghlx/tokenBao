/**
 * server.ts 安全函数单元测试
 * 直接测试 server.ts 中导出的 sanitizeResponseHeaders 生产代码
 */

import { sanitizeResponseHeaders, HOP_BY_HOP_HEADERS } from '../proxy/server';

describe('sanitizeResponseHeaders', () => {
  it('HOP_BY_HOP_HEADERS 集合应包含所有标准 hop-by-hop 头', () => {
    const expected = [
      'connection', 'keep-alive', 'transfer-encoding', 'te',
      'upgrade', 'proxy-connection', 'proxy-authenticate', 'proxy-authorization',
      'trailer'
    ];
    for (const header of expected) {
      expect(HOP_BY_HOP_HEADERS.has(header)).toBe(true);
    }
  });



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
      'proxy-authenticate': 'Basic realm="test"',
      'proxy-authorization': 'Basic dGVzdDp0ZXN0',
      'trailer': 'X-Custom-Trailer',
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
