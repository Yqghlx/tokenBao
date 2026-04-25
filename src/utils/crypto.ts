import crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKeyFilePath(): string {
  const isElectron = process.versions?.electron != null;
  const baseDir = isElectron 
    ? path.join(os.homedir(), '.tokenbao')
    : path.join(process.cwd(), '.keys');
  return path.join(baseDir, '.encryption.key');
}

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  
  const keyEnv = process.env.ENCRYPTION_KEY;
  if (keyEnv && keyEnv.length === 64) {
    cachedKey = Buffer.from(keyEnv, 'hex');
    return cachedKey;
  }
  
  const keyPath = getKeyFilePath();
  
  try {
    if (fs.existsSync(keyPath)) {
      const savedKey = fs.readFileSync(keyPath, 'utf8').trim();
      if (savedKey.length === 64) {
        cachedKey = Buffer.from(savedKey, 'hex');
        return cachedKey;
      }
    }
  } catch (e) {
    // 文件读取失败，生成新密钥
  }
  
  const newKey = crypto.randomBytes(32);
  cachedKey = newKey;
  
  try {
    const dir = path.dirname(keyPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(keyPath, newKey.toString('hex'), { encoding: 'utf8' });
  } catch (e) {
    // 写入失败，使用内存缓存
  }
  
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

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

export function generateId(): string {
  return crypto.randomBytes(16).toString('hex');
}
