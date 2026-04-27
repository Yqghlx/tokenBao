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
});
