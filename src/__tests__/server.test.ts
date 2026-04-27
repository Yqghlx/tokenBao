import ProxyServer from '../proxy/server';

describe('ProxyServer 核心逻辑', () => {
  // 使用随机高端口避免冲突
  const getRandomPort = () => 18000 + Math.floor(Math.random() * 1000);
  let server: ProxyServer;

  afterEach(async () => {
    if (server) {
      try { await server.stop(); } catch { /* 忽略 */ }
    }
  });

  describe('熔断器按提供商独立', () => {
    test('OpenAI 连续失败不应阻断 Anthropic', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();

      // 模拟 OpenAI 连续失败 5 次
      for (let i = 0; i < 5; i++) {
        server['recordUpstreamFailure']('openai');
      }
      expect(server['isCircuitOpen']('openai')).toBe(true);

      // Anthropic 应完全不受影响
      expect(server['isCircuitOpen']('anthropic')).toBe(false);
    });

    test('成功后重置熔断器', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();

      // 触发熔断
      for (let i = 0; i < 5; i++) {
        server['recordUpstreamFailure']('openai');
      }
      expect(server['isCircuitOpen']('openai')).toBe(true);

      // 成功后重置
      server['recordUpstreamSuccess']('openai');
      expect(server['isCircuitOpen']('openai')).toBe(false);
    });

    test('未达到阈值不应触发熔断', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();

      for (let i = 0; i < 4; i++) {
        server['recordUpstreamFailure']('openai');
      }
      expect(server['isCircuitOpen']('openai')).toBe(false);
    });
  });

  describe('预算快照', () => {
    test('updateBudgetSnapshot 累加费用', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();

      server['updateBudgetSnapshot'](1.5);
      server['updateBudgetSnapshot'](2.5);
      expect(server['budgetState'].monthlySpent).toBeCloseTo(4.0, 6);
      expect(server['budgetState'].dailySpent).toBeCloseTo(4.0, 6);
    });

    test('月预算超限时 checkBudget 返回 allowed: false', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();

      server['budgetState'].monthlyLimit = 10;
      server['budgetState'].monthlySpent = 10;
      const result = server['checkBudget']();
      expect(result.allowed).toBe(false);
    });

    test('日预算超限时 checkBudget 返回 allowed: false', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();

      server['budgetState'].dailyLimit = 5;
      server['budgetState'].dailySpent = 5;
      const result = server['checkBudget']();
      expect(result.allowed).toBe(false);
    });

    test('预算 80% 时返回警告', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();

      server['budgetState'].monthlyLimit = 100;
      server['budgetState'].monthlySpent = 85;
      const result = server['checkBudget']();
      expect(result.allowed).toBe(true);
      expect(result.warning).toContain('85%');
    });

    test('预算充足时无警告', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();

      server['budgetState'].monthlyLimit = 100;
      server['budgetState'].monthlySpent = 50;
      const result = server['checkBudget']();
      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });

  describe('基本状态', () => {
    test('启动后 isRunning 返回 true', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      expect(server.isRunning()).toBe(true);
    });

    test('停止后 isRunning 返回 false', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    test('getActiveConnections 初始为 0', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      expect(server.getActiveConnections()).toBe(0);
    });

    test('getStats 初始为 0', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      const stats = server.getStats();
      expect(stats.requests).toBe(0);
      expect(stats.savedTokens).toBe(0);
    });
  });

  describe('API 类型检测', () => {
    test('OpenAI 路径正确识别', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      expect(server['detectApiType']('/v1/chat/completions')).toBe('openai');
      expect(server['detectApiType']('/v1/models')).toBe('openai');
      expect(server['detectApiType']('/v1/embeddings')).toBe('openai');
    });

    test('Anthropic 路径正确识别', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      expect(server['detectApiType']('/v1/messages')).toBe('anthropic');
      expect(server['detectApiType']('/v1/complete')).toBe('anthropic');
    });

    test('未知路径返回 unknown', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      expect(server['detectApiType']('/unknown')).toBe('unknown');
    });
  });
});
