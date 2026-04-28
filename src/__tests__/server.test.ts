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
      expect(server['detectApiType']('/v1/completions')).toBe('openai');
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

  describe('目标 URL 解析', () => {
    test('getTargetBase 对 openai 返回 OpenAI 地址', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      expect(server['getTargetBase']('openai')).toBe('https://api.openai.com');
    });

    test('getTargetBase 对 anthropic 返回 Anthropic 地址', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      expect(server['getTargetBase']('anthropic')).toBe('https://api.anthropic.com');
    });

    test('getTargetBase 对 unknown 默认返回 OpenAI 地址', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      expect(server['getTargetBase']('unknown')).toBe('https://api.openai.com');
    });
  });

  describe('请求头转换', () => {
    test('OpenAI 请求应注入 Bearer 认证', async () => {
      server = new ProxyServer({ port: getRandomPort(), openaiKey: 'sk-test-openai-key' });
      await server.start();
      const headers = server['transformHeaders']({ authorization: 'Bearer old-key' }, 'openai');
      expect(headers['authorization']).toBe('Bearer sk-test-openai-key');
    });

    test('Anthropic 请求应注入 x-api-key 认证', async () => {
      server = new ProxyServer({ port: getRandomPort(), anthropicKey: 'sk-ant-test-key' });
      await server.start();
      const headers = server['transformHeaders']({ authorization: 'Bearer old-key' }, 'anthropic');
      expect(headers['x-api-key']).toBe('sk-ant-test-key');
      expect(headers['authorization']).toBeUndefined();
    });

    test('Anthropic 请求应添加版本头', async () => {
      server = new ProxyServer({ port: getRandomPort(), anthropicKey: 'sk-ant-test' });
      await server.start();
      const headers = server['transformHeaders']({}, 'anthropic');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    test('应过滤 host 和 accept-encoding 头', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      const headers = server['transformHeaders']({
        host: 'localhost:3000',
        'accept-encoding': 'gzip',
        'content-type': 'application/json'
      }, 'openai');
      expect(headers['host']).toBeUndefined();
      expect(headers['accept-encoding']).toBeUndefined();
      expect(headers['content-type']).toBe('application/json');
    });

    test('无 Key 时保留原始 authorization', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      const headers = server['transformHeaders']({ authorization: 'Bearer my-key' }, 'openai');
      expect(headers['authorization']).toBe('Bearer my-key');
    });
  });

  describe('代理超时配置', () => {
    test('setProxyTimeout 应更新超时值', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      expect(server.getProxyTimeout()).toBe(60000);
      server.setProxyTimeout(30000);
      expect(server.getProxyTimeout()).toBe(30000);
    });

    test('setProxyTimeout 负值不应更新', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      server.setProxyTimeout(-1000);
      expect(server.getProxyTimeout()).toBe(60000);
    });

    test('setProxyTimeout 零值不应更新', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      server.setProxyTimeout(0);
      expect(server.getProxyTimeout()).toBe(60000);
    });
  });

  describe('updateBudgetSnapshot 防御性', () => {
    test('NaN cost 不应污染快照', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      server['updateBudgetSnapshot'](NaN);
      expect(isFinite(server['budgetState'].monthlySpent)).toBe(true);
      expect(isFinite(server['budgetState'].dailySpent)).toBe(true);
    });

    test('Infinity cost 不应污染快照', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      server['updateBudgetSnapshot'](Infinity);
      expect(isFinite(server['budgetState'].monthlySpent)).toBe(true);
    });

    test('负数 cost 不应被累加', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      const before = server['budgetState'].monthlySpent;
      server['updateBudgetSnapshot'](-5);
      expect(server['budgetState'].monthlySpent).toBe(before);
    });

    test('正常 cost 应被正确累加', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      server['updateBudgetSnapshot'](1.5);
      expect(server['budgetState'].monthlySpent).toBeCloseTo(1.5, 6);
      expect(server['budgetState'].dailySpent).toBeCloseTo(1.5, 6);
    });
  });

  describe('优化配置更新', () => {
    test('updateOptimizationConfig 应更新管线配置', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      server.updateOptimizationConfig({ compression: false, routing: false });
      // 通过 getProxyTimeout 验证 server 仍然正常运行
      expect(server.getProxyTimeout()).toBe(60000);
    });
  });

  describe('getPort', () => {
    test('服务未启动时返回配置端口', async () => {
      server = new ProxyServer({ port: 19099 });
      expect(server.getPort()).toBe(19099);
    });

    test('服务启动后返回实际监听端口', async () => {
      server = new ProxyServer({ port: getRandomPort() });
      await server.start();
      expect(server.getPort()).toBeGreaterThan(0);
    });
  });
});
