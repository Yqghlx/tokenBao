import crypto from 'crypto';
import fs from 'fs';

// 加密算法：AES-256-GCM
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// 从环境变量或文件加载密钥
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.ENCRYPTION_KEY;
  if (keyEnv && keyEnv.length > 0) {
    return Buffer.from(keyEnv, 'hex');
  }
  // 如果没有密钥，生成一个并保存到文件
  const newKey = crypto.randomBytes(32);
  // 保存到项目根目录的 .encryption.key 文件，便于重复使用
  try {
    fs.writeFileSync('.encryption.key', newKey.toString('hex'), { encoding: 'utf8' });
  } catch (e) {
    // 忽略写入失败，只要能够继续使用生成的密钥即可
  }
  return newKey;
}

// 加密函数
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // 返回格式：iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

// 解密函数
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }
  const [ivHex, authTagHex, encrypted] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// 生成随机 ID
export function generateId(): string {
  return crypto.randomBytes(16).toString('hex');
}
