import dlp from '../optimizations/dlp';

describe('DLP 敏感数据脱敏', () => {
  afterEach(() => {
    dlp.setOptions({ enabled: false });
  });

  describe('模块配置', () => {
    test('默认应禁用', () => {
      expect(dlp.getOptions().enabled).toBe(false);
    });

    test('setOptions 应更新配置', () => {
      dlp.setOptions({ enabled: true });
      expect(dlp.getOptions().enabled).toBe(true);
    });
  });

  describe('禁用时行为', () => {
    test('禁用时 scan 应返回原文', () => {
      dlp.setOptions({ enabled: false });
      const result = dlp.scan('我的手机号是 13812345678');
      expect(result.text).toBe('我的手机号是 13812345678');
      expect(result.modified).toBe(false);
      expect(result.detections).toHaveLength(0);
    });

    test('禁用时空字符串不应报错', () => {
      dlp.setOptions({ enabled: false });
      const result = dlp.scan('');
      expect(result.text).toBe('');
    });
  });

  describe('中国手机号脱敏', () => {
    beforeEach(() => dlp.setOptions({ enabled: true }));

    test('应脱敏中国手机号', () => {
      const result = dlp.scan('请联系 13812345678 了解详情');
      expect(result.modified).toBe(true);
      expect(result.text).not.toContain('13812345678');
      expect(result.text).toContain('138****5678');
      expect(result.detections).toHaveLength(1);
      expect(result.detections[0].ruleId).toBe('cn_phone');
    });

    test('应脱敏多个手机号', () => {
      const result = dlp.scan('手机1: 13812345678，手机2: 15987654321');
      expect(result.detections[0].count).toBe(2);
    });
  });

  describe('中国身份证号脱敏', () => {
    beforeEach(() => dlp.setOptions({ enabled: true }));

    test('应脱敏 18 位身份证号', () => {
      const result = dlp.scan('身份证号: 110101199001011234');
      expect(result.modified).toBe(true);
      expect(result.text).not.toContain('110101199001011234');
      expect(result.detections[0].ruleId).toBe('cn_id_card');
    });

    test('末位 X 的身份证号也应脱敏', () => {
      const result = dlp.scan('身份证号: 11010119900101123X');
      expect(result.modified).toBe(true);
    });
  });

  describe('邮箱脱敏', () => {
    beforeEach(() => dlp.setOptions({ enabled: true }));

    test('应脱敏邮箱地址', () => {
      const result = dlp.scan('发送到 user@example.com');
      expect(result.modified).toBe(true);
      expect(result.text).not.toContain('user@example.com');
      expect(result.text).toContain('***@example.com');
      expect(result.detections[0].ruleId).toBe('email');
    });
  });

  describe('私钥脱敏', () => {
    beforeEach(() => dlp.setOptions({ enabled: true }));

    test('应脱敏 PEM 格式私钥', () => {
      const input = '这是密钥:\n-----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRiMLAHudeSA\n-----END RSA PRIVATE KEY-----\n结束';
      const result = dlp.scan(input);
      expect(result.modified).toBe(true);
      expect(result.text).not.toContain('MIIBogIBAAJBALRiMLAHudeSA');
      expect(result.text).toContain('PRIVATE KEY REDACTED');
    });

    test('应脱敏非 RSA 私钥', () => {
      const input = '-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----';
      const result = dlp.scan(input);
      expect(result.modified).toBe(true);
      expect(result.text).toContain('PRIVATE KEY REDACTED');
    });
  });

  describe('API Key 脱敏', () => {
    beforeEach(() => dlp.setOptions({ enabled: true }));

    test('应脱敏 OpenAI API Key', () => {
      const result = dlp.scan('key=sk-abcdefghijklmnopqrstuvwxyz123456');
      expect(result.modified).toBe(true);
      expect(result.text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
      expect(result.text).toContain('API_KEY_REDACTED');
    });

    test('应脱敏 Anthropic API Key', () => {
      const result = dlp.scan('key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890');
      expect(result.modified).toBe(true);
      expect(result.text).toContain('API_KEY_REDACTED');
    });

    test('短 Key 前缀不应被脱敏', () => {
      const result = dlp.scan('使用 sk-abc 进行测试');
      expect(result.text).toContain('sk-abc');
    });
  });

  describe('AWS Key 脱敏', () => {
    beforeEach(() => dlp.setOptions({ enabled: true }));

    test('应脱敏 AWS Access Key', () => {
      const result = dlp.scan('AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE');
      expect(result.modified).toBe(true);
      expect(result.text).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result.text).toContain('AWS_KEY_REDACTED');
    });
  });

  describe('混合内容脱敏', () => {
    beforeEach(() => dlp.setOptions({ enabled: true }));

    test('应同时脱敏多种 PII', () => {
      const input = '姓名张三，手机 13812345678，邮箱 test@example.com，身份证 110101199001011234';
      const result = dlp.scan(input);
      expect(result.modified).toBe(true);
      expect(result.text).not.toContain('13812345678');
      expect(result.text).not.toContain('test@example.com');
      expect(result.text).not.toContain('110101199001011234');
      expect(result.detections.length).toBeGreaterThanOrEqual(3);
    });

    test('无 PII 时不应修改文本', () => {
      const input = '这是一段普通的文本，没有任何敏感信息。';
      const result = dlp.scan(input);
      expect(result.modified).toBe(false);
      expect(result.text).toBe(input);
      expect(result.detections).toHaveLength(0);
    });
  });

  describe('getRules', () => {
    test('应返回所有内置规则', () => {
      const rules = dlp.getRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every(r => r.id && r.name && typeof r.enabled === 'boolean' && r.severity)).toBe(true);
    });
  });

  describe('边界情况', () => {
    beforeEach(() => dlp.setOptions({ enabled: true }));

    test('空字符串应安全处理', () => {
      const result = dlp.scan('');
      expect(result.text).toBe('');
      expect(result.modified).toBe(false);
    });

    test('纯数字不应误判为手机号（长度不足）', () => {
      const result = dlp.scan('数量: 12345');
      // 12345 不会被误判为手机号
      expect(result.text).toContain('12345');
    });

    test('超长文本不应导致性能问题', () => {
      const longText = '手机号 13812345678 '.repeat(100);
      const start = Date.now();
      const result = dlp.scan(longText);
      const duration = Date.now() - start;
      expect(result.modified).toBe(true);
      // 100 次扫描应在 100ms 内完成
      expect(duration).toBeLessThan(100);
    });
  });
});
