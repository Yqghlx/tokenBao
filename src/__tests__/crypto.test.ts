import { encrypt, decrypt, generateId } from '../utils/crypto';

describe('crypto 模块', () => {
  test('加密后解密应还原原文', () => {
    const original = 'sk-test-key-123456';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  test('相同文本每次加密结果不同（随机 IV）', () => {
    const original = 'test-key';
    const encrypted1 = encrypt(original);
    const encrypted2 = encrypt(original);
    expect(encrypted1).not.toBe(encrypted2);
  });

  test('解密无效格式应抛出异常', () => {
    expect(() => decrypt('invalid-format')).toThrow('密文格式无效');
  });

  test('generateId 应生成唯一且长度为 32 的 ID', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1).toHaveLength(32);
  });

  test('加密解密应支持中文字符', () => {
    const original = '中文密钥测试';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  test('加密解密应支持长文本', () => {
    const original = 'a'.repeat(10000);
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  test('加密解密应支持空字符串', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  test('解密被篡改的密文应抛出异常', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    // 篡改密文部分
    parts[2] = parts[2].replace(/./g, '0');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  test('generateId 应只包含十六进制字符', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  test('解密畸形 IV 应抛出格式错误', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    // IV 截断为奇数长度
    parts[0] = '0123456789abcde';
    expect(() => decrypt(parts.join(':'))).toThrow('IV 长度或格式错误');
  });

  test('解密畸形认证标签应抛出格式错误', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    // 认证标签替换为非 hex 字符
    parts[1] = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
    expect(() => decrypt(parts.join(':'))).toThrow('认证标签长度或格式错误');
  });

  test('解密两段式密文应抛出格式错误', () => {
    expect(() => decrypt('abcdef:123456')).toThrow('密文格式无效');
  });

  test('解密四段式密文应抛出格式错误', () => {
    expect(() => decrypt('a:b:c:d')).toThrow('密文格式无效');
  });

  test('解密空字符串应抛出格式错误', () => {
    expect(() => decrypt('')).toThrow('密文格式无效');
  });

  test('解密 IV 过短应抛出格式错误', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    parts[0] = 'abcd';
    expect(() => decrypt(parts.join(':'))).toThrow('IV 长度或格式错误');
  });

  test('加密空字符串应成功', () => {
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  test('篡改认证标签后解密应失败', () => {
    const encrypted = encrypt('sensitive data');
    const parts = encrypted.split(':');
    // 翻转认证标签的第一个字节
    const bytes = Buffer.from(parts[1], 'hex');
    bytes[0] ^= 0xff;
    parts[1] = bytes.toString('hex');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  test('篡改密文内容后解密应失败', () => {
    const encrypted = encrypt('secret');
    const parts = encrypted.split(':');
    const bytes = Buffer.from(parts[2], 'hex');
    bytes[0] ^= 0xff;
    parts[2] = bytes.toString('hex');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });
});
