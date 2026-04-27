import ProxyServer from '../proxy/server';
import { applyOptimizations } from '../optimizations/index';
import http from 'http';

describe('集成测试', () => {
  let server: ProxyServer;

  beforeAll(async () => {
    server = new ProxyServer({ port: 18091 });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  test('优化策略应正确应用', () => {
    const requestBody = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Please help me analyze this data' }]
    };
    const result = applyOptimizations('openai', requestBody);
    expect(result.appliedStrategies.length).toBeGreaterThan(0);
  });

  test('代理服务器统计接口应正常', () => {
    const stats = server.getStats();
    expect(stats).toHaveProperty('requests');
    expect(stats).toHaveProperty('savedTokens');
  });

  test('API Key 设置应生效', () => {
    server.setKeys('sk-test-openai', 'sk-test-anthropic');
    expect((server as any).openaiKey).toBe('sk-test-openai');
    expect((server as any).anthropicKey).toBe('sk-test-anthropic');
  });

  test('代理应处于运行状态', () => {
    expect(server.isRunning()).toBe(true);
  });

  test('GET /health 应返回健康状态', async () => {
    const response = await new Promise<{ statusCode: number; body: string }>((resolve) => {
      http.get('http://localhost:18091/health', (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => { resolve({ statusCode: res.statusCode ?? 0, body }); });
      }).on('error', () => resolve({ statusCode: 0, body: '' }));
    });
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.status).toBe('healthy');
    expect(typeof data.uptime).toBe('number');
    expect(typeof data.activeConnections).toBe('number');
    expect(typeof data.requestCount).toBe('number');
    expect(data.shuttingDown).toBe(false);
  });

  test('API 类型检测应正确', () => {
    expect(server.detectApiType('/v1/chat/completions')).toBe('openai');
    expect(server.detectApiType('/v1/messages')).toBe('anthropic');
  });

  test('代理请求应返回错误状态码（无有效上游 Key）', async () => {
    const response = await new Promise<number>((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 18091,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test' },
        timeout: 10000
      }, (res) => {
        resolve(res.statusCode ?? 0);
      });
      req.on('error', () => resolve(0));
      req.write(JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'test' }] }));
      req.end();
    });
    // 无有效 Key 时应返回 502（上游连接失败）或 504（超时）
    expect([0, 401, 502, 504]).toContain(response);
  });

  test('预算超限时应返回 429', async () => {
    // 将预算设为超限状态
    (server as any).budgetState.monthlyLimit = 1;
    (server as any).budgetState.monthlySpent = 2;

    const response = await new Promise<{ statusCode: number; body: string }>((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 18091,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => { resolve({ statusCode: res.statusCode ?? 0, body }); });
      });
      req.on('error', () => resolve({ statusCode: 0, body: '' }));
      req.write(JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'test' }] }));
      req.end();
    });

    expect(response.statusCode).toBe(429);
    const data = JSON.parse(response.body);
    expect(data.error).toBe('Budget Exceeded');
    expect(data.requestId).toBeTruthy();

    // 恢复预算状态
    (server as any).budgetState.monthlyLimit = 100;
    (server as any).budgetState.monthlySpent = 0;
  });

  test('请求体过大时应返回 413 或连接中断', async () => {
    // 构造超过 10MB 的请求体
    const largeBody = 'x'.repeat(11 * 1024 * 1024);

    const response = await new Promise<number>((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 18091,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(largeBody) },
        timeout: 5000
      }, (res) => {
        resolve(res.statusCode ?? 0);
      });
      req.on('error', () => resolve(0));
      req.write(largeBody);
      req.end();
    });

    // 请求体超限时服务端会 destroy 连接，客户端收到 413 或连接错误（statusCode=0）
    expect([0, 413]).toContain(response);
  });
});
