/**
 * 安全加密桥接层
 * 优先使用 Electron safeStorage（系统 Keychain/DPAPI），不可用时回退到 AES-256-GCM
 *
 * 加密数据格式标识：
 * - safeStorage: "ss:" 前缀 + base64 编码
 * - AES fallback: "iv:authTag:encrypted" 三段式
 */
import { encrypt as aesEncrypt, decrypt as aesDecrypt } from './crypto';

type SafeStorageLike = {
  encryptString(plaintext: string): Buffer;
  decryptString(buffer: Buffer): string;
  isEncryptionAvailable(): boolean;
};

let safeStorage: SafeStorageLike | null = null;
let initialized = false;

/** 初始化 safeStorage 实例（仅主进程 app.whenReady 后调用，多次调用视为空操作） */
export function initSafeStorage(storage: SafeStorageLike | null): void {
  if (initialized) {
    console.warn('safeStorage 已初始化，忽略重复调用');
    return;
  }
  safeStorage = storage;
  initialized = true;
}

/** 判断 safeStorage 是否可用 */
export function isSafeStorageAvailable(): boolean {
  return safeStorage !== null && safeStorage.isEncryptionAvailable();
}

/** safeStorage 加密数据的前缀标识 */
const SS_PREFIX = 'ss:';

/**
 * 加密字符串
 * 优先使用 safeStorage，不可用时回退到 AES-256-GCM
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== 'string') {
    throw new Error('加密输入必须为字符串');
  }

  if (isSafeStorageAvailable()) {
    try {
      const encrypted = (safeStorage as Electron.SafeStorage).encryptString(plaintext);
      return SS_PREFIX + encrypted.toString('base64');
    } catch (err) {
      console.warn('safeStorage 加密失败，回退到 AES:', (err as Error).message);
    }
  }

  return aesEncrypt(plaintext);
}

/**
 * 解密字符串
 * 自动识别加密格式（safeStorage 或 AES），选择对应解密方式
 */
export function decrypt(ciphertext: string): string {
  if (typeof ciphertext !== 'string') {
    throw new Error('密文必须为字符串');
  }

  // safeStorage 格式：ss: + base64
  if (ciphertext.startsWith(SS_PREFIX)) {
    if (!isSafeStorageAvailable()) {
      throw new Error('密文使用系统安全存储加密，但当前环境不支持 safeStorage');
    }
    try {
      const buffer = Buffer.from(ciphertext.slice(SS_PREFIX.length), 'base64');
      return (safeStorage as Electron.SafeStorage).decryptString(buffer);
    } catch (err) {
      throw new Error(`safeStorage 解密失败: ${(err as Error).message}`);
    }
  }

  // AES 格式：iv:authTag:encrypted
  return aesDecrypt(ciphertext);
}

/**
 * 检测密文是否为 safeStorage 格式
 * 用于迁移判断：AES 格式的密钥可自动迁移到 safeStorage
 */
export function isSafeStorageFormat(ciphertext: string): boolean {
  return ciphertext.startsWith(SS_PREFIX);
}

export default {
  initSafeStorage,
  isSafeStorageAvailable,
  encrypt,
  decrypt,
  isSafeStorageFormat
};
