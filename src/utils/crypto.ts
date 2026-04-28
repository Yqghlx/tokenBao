import crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKeyFilePath(): string {
  const isElectron = process.versions?.electron !== undefined;
  const baseDir = isElectron 
    ? path.join(os.homedir(), '.tokenbao')
    : path.join(process.cwd(), '.keys');
  return path.join(baseDir, '.encryption.key');
}

/** 验证字符串是否为有效的 64 字符 hex 编码 */
function isValidHexKey(str: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(str);
}

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  // 优先从环境变量获取密钥
  const keyEnv = process.env.ENCRYPTION_KEY;
  if (keyEnv && isValidHexKey(keyEnv)) {
    cachedKey = Buffer.from(keyEnv, 'hex');
    return cachedKey;
  }

  const keyPath = getKeyFilePath();

  try {
    if (fs.existsSync(keyPath)) {
      // 校验密钥文件权限未被意外放宽，防止密钥暴露
      try {
        const stat = fs.statSync(keyPath);
        const mode = stat.mode & 0o777;
        if (mode !== 0o600) {
          console.warn(`密钥文件权限不安全 (${mode.toString(8)})，预期 600，已自动修复`);
          fs.chmodSync(keyPath, 0o600);
        }
      } catch {
        // 权限检查失败不影响正常读取
      }
      const savedKey = fs.readFileSync(keyPath, 'utf8').trim();
      if (isValidHexKey(savedKey)) {
        cachedKey = Buffer.from(savedKey, 'hex');
        return cachedKey;
      }
      console.warn('加密密钥文件格式无效，将重新生成');
    }
  } catch (e) {
    // 文件读取失败，生成新密钥
  }

  const newKey = crypto.randomBytes(32);
  cachedKey = newKey;

  try {
    // recursive 选项自动处理已存在的目录，无需先 existsSync 检查
    const dir = path.dirname(keyPath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // 原子写入：先写临时文件再重命名，防止写入中断导致密钥损坏
    const tmpPath = keyPath + '.tmp';
    fs.writeFileSync(tmpPath, newKey.toString('hex'), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, keyPath);
  } catch (e) {
    console.error('写入加密密钥文件失败，将仅使用内存缓存:', e);
  }

  return cachedKey;
}

export function encrypt(plaintext: string): string {
  if (typeof plaintext !== 'string') {
    throw new Error('加密输入必须为字符串');
  }
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  if (typeof ciphertext !== 'string') {
    throw new Error('密文必须为字符串');
  }
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('密文格式无效');
  }
  const [ivHex, authTagHex, encrypted] = parts;

  // 校验 hex 字符串长度和格式，防止 Buffer.from 静默截断畸形输入
  const HEX_32 = /^[0-9a-fA-F]{32}$/;
  if (!HEX_32.test(ivHex)) {
    throw new Error('密文格式无效');
  }
  if (!HEX_32.test(authTagHex)) {
    throw new Error('密文格式无效');
  }

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
