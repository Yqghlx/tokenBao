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

  test('预算 NaN/Infinity 时应仍允许请求', async () => {
    // 模拟预算状态为 NaN
    (server as any).budgetState.monthlyLimit = 100;
    (server as any).budgetState.monthlySpent = NaN;
    (server as any).budgetState.dailyLimit = 10;
    (server as any).budgetState.dailySpent = Infinity;

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

    // NaN/Infinity 被 isFinite 重置为 0，不应触发预算拦截
    expect(response.statusCode).not.toBe(429);

    // 恢复
    (server as any).budgetState.monthlyLimit = 100;
    (server as any).budgetState.monthlySpent = 0;
    (server as any).budgetState.dailyLimit = 10;
    (server as any).budgetState.dailySpent = 0;
  });

  test('熔断器对 unknown 类型不应触发', () => {
    // 先让 unknown 类型的熔断器进入 open 状态
    for (let i = 0; i < 10; i++) {
      (server as any).recordUpstreamFailure('unknown');
    }
    // unknown 类型不应被熔断
    expect((server as any).isCircuitOpen('unknown')).toBe(false);
    // 清理
    (server as any).recordUpstreamSuccess('unknown');
  });

  test('非 JSON Content-Type 的 POST 应返回 415', async () => {
    const response = await new Promise<{ statusCode: number; body: string }>((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: 18091,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        timeout: 5000
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => { resolve({ statusCode: res.statusCode ?? 0, body }); });
      });
      req.on('error', () => resolve({ statusCode: 0, body: '' }));
      req.write('<xml>test</xml>');
      req.end();
    });
    expect(response.statusCode).toBe(415);
    const data = JSON.parse(response.body);
    expect(data.error).toBe('Unsupported Media Type');
  });

  test('熔断器冷却后应自动恢复', () => {
    // 触发 openai 熔断器
    for (let i = 0; i < 6; i++) {
      (server as any).recordUpstreamFailure('openai');
    }
    expect((server as any).isCircuitOpen('openai')).toBe(true);

    // 手动将 openUntil 设为已过期的时间
    const cb = (server as any).getCircuitBreaker('openai');
    cb.openUntil = Date.now() - 1000;
    // 冷却已过，熔断器应自动关闭
    expect((server as any).isCircuitOpen('openai')).toBe(false);

    // 清理
    (server as any).recordUpstreamSuccess('openai');
  });

  test('熔断器成功请求应重置计数', () => {
    // 积累部分失败
    for (let i = 0; i < 3; i++) {
      (server as any).recordUpstreamFailure('anthropic');
    }
    const cb = (server as any).getCircuitBreaker('anthropic');
    expect(cb.failures).toBe(3);

    // 成功请求应重置
    (server as any).recordUpstreamSuccess('anthropic');
    expect(cb.failures).toBe(0);
    expect(cb.openUntil).toBe(0);
  });

  test('GET /v1/models 应跳过预算检查（只读请求）', async () => {
    // 将预算设为超限状态
    (server as any).budgetState.monthlyLimit = 1;
    (server as any).budgetState.monthlySpent = 2;

    const response = await new Promise<number>((resolve) => {
      http.get('http://localhost:18091/v1/models', (res) => {
        resolve(res.statusCode ?? 0);
      }).on('error', () => resolve(0));
    });

    // 只读 GET 请求应跳过预算检查，不会被 429 拦截
    // 实际返回取决于上游 API 响应（可能是 401/502），但不应是 429
    expect(response).not.toBe(429);

    // 恢复
    (server as any).budgetState.monthlyLimit = 100;
    (server as any).budgetState.monthlySpent = 0;
  });

  test('GET / 应返回健康状态', async () => {
    const response = await new Promise<{ statusCode: number; body: string }>((resolve) => {
      http.get('http://localhost:18091/', (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => { resolve({ statusCode: res.statusCode ?? 0, body }); });
      }).on('error', () => resolve({ statusCode: 0, body: '' }));
    });
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.status).toBe('healthy');
  });
});
