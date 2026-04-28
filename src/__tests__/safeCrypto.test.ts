import { encrypt, decrypt, initSafeStorage, isSafeStorageAvailable, isSafeStorageFormat } from '../utils/safeCrypto';
import { encrypt as aesEncrypt, decrypt as aesDecrypt } from '../utils/crypto';

describe('safeCrypto 安全加密桥接层', () => {
  describe('AES 回退模式（无 safeStorage）', () => {
    test('encrypt 应回退到 AES 加密', () => {
      const plaintext = 'sk-test-key-12345678';
      const encrypted = encrypt(plaintext);
      // AES 格式：iv:authTag:encrypted（不含 ss: 前缀）
      expect(!encrypted.startsWith('ss:')).toBe(true);
      expect(encrypted.split(':').length).toBe(3);
    });

    test('decrypt 应解密 AES 格式密文', () => {
      const plaintext = 'sk-test-key-12345678';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    test('AES 密文格式应可被原 crypto.ts 解密', () => {
      const plaintext = 'sk-test-key-12345678';
      const encrypted = encrypt(plaintext);
      // 回退模式下 encrypt === aesEncrypt
      expect(aesDecrypt(encrypted)).toBe(plaintext);
    });

    test('原 crypto.ts 加密的密文应可被 decrypt 解密', () => {
      const plaintext = 'sk-test-key-12345678';
      const aesEncrypted = aesEncrypt(plaintext);
      expect(decrypt(aesEncrypted)).toBe(plaintext);
    });
  });

  describe('safeStorage 模拟', () => {
    // 模拟 safeStorage API
    const mockSafeStorage = {
      encryptString: (plaintext: string) => Buffer.from(`MOCK:${plaintext}`, 'utf8'),
      decryptString: (buffer: Buffer) => buffer.toString('utf8').replace('MOCK:', ''),
      isEncryptionAvailable: () => true
    };

    beforeEach(() => {
      initSafeStorage(mockSafeStorage);
    });

    afterEach(() => {
      // 重置为无 safeStorage 状态
      initSafeStorage(null);
    });

    test('encrypt 应使用 safeStorage', () => {
      const encrypted = encrypt('test-key');
      expect(encrypted.startsWith('ss:')).toBe(true);
      expect(isSafeStorageFormat(encrypted)).toBe(true);
    });

    test('decrypt 应解密 safeStorage 格式', () => {
      const encrypted = encrypt('test-key');
      expect(decrypt(encrypted)).toBe('test-key');
    });

    test('decrypt 仍应支持 AES 格式密文', () => {
      const aesEncrypted = aesEncrypt('sk-test-1234567890');
      expect(decrypt(aesEncrypted)).toBe('sk-test-1234567890');
    });

    test('isSafeStorageAvailable 应返回 true', () => {
      expect(isSafeStorageAvailable()).toBe(true);
    });
  });

  describe('isSafeStorageFormat', () => {
    test('ss: 前缀应返回 true', () => {
      expect(isSafeStorageFormat('ss:dGVzdA==')).toBe(true);
    });

    test('AES 格式应返回 false', () => {
      expect(isSafeStorageFormat('abc123:def456:ghi789')).toBe(false);
    });
  });

  describe('边界情况', () => {
    test('空字符串加密解密应正常', () => {
      const encrypted = encrypt('');
      expect(decrypt(encrypted)).toBe('');
    });

    test('非字符串输入应抛异常', () => {
      expect(() => encrypt(123 as any)).toThrow('加密输入必须为字符串');
      expect(() => decrypt(123 as any)).toThrow('密文必须为字符串');
    });

    test('无效密文应抛异常', () => {
      expect(() => decrypt('not-valid-ciphertext')).toThrow();
    });
  });
});
