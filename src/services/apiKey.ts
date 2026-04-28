import { encrypt, decrypt, isSafeStorageFormat, isSafeStorageAvailable } from '../utils/safeCrypto';
import { loadJson, saveJsonAsync } from '../utils/storage';
import { getMutex } from '../utils/mutex';

interface ApiKey {
  id: number;
  name: string;
  type: string;
  encryptedKey: string;
  createdAt: string;
  updatedAt: string;
}

/** API 密钥格式校验规则 */
const KEY_PATTERNS: Record<string, RegExp> = {
  openai: /^sk-[A-Za-z0-9_-]{20,}$/,
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/
};

/** 校验密钥格式，通过返回 null，失败返回错误信息 */
function validateKeyFormat(type: string, key: string): string | null {
  const pattern = KEY_PATTERNS[type];
  if (!pattern) return null; // 未知类型不做校验
  if (pattern.test(key)) return null;
  const prefix = type === 'openai' ? 'sk-' : 'sk-ant-';
  return `密钥格式无效，${type} 密钥应以 "${prefix}" 开头且至少 20 个字符`;
}

interface ApiKeyStore {
  keys: ApiKey[];
  nextId: number;
}

const STORAGE_FILE = 'apiKeys.json';
const MAX_KEYS = 50;
const mutex = getMutex(STORAGE_FILE);

function getStore(): ApiKeyStore {
  return loadJson<ApiKeyStore>(STORAGE_FILE, { keys: [], nextId: 1 });
}

async function saveStore(store: ApiKeyStore): Promise<void> {
  await saveJsonAsync(STORAGE_FILE, store);
}

export async function addApiKey(name: string, type: string, key: string): Promise<ApiKey> {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('名称不能为空');
  }
  if (name.length > 100) {
    throw new Error('名称不能超过 100 个字符');
  }
  const validationError = validateKeyFormat(type, key);
  if (validationError) {
    throw new Error(validationError);
  }

  return mutex.runExclusive(async () => {
    const store = getStore();
    if (store.keys.length >= MAX_KEYS) {
      throw new Error(`API Key 数量已达上限 (${MAX_KEYS})，请删除不需要的 Key 后再添加`);
    }
    const encryptedKey = encrypt(key);
    const now = new Date().toISOString();
    const apiKey: ApiKey = {
      id: store.nextId++,
      name: name.trim(),
      type,
      encryptedKey,
      createdAt: now,
      updatedAt: now
    };
    store.keys.push(apiKey);
    await saveStore(store);
    return apiKey;
  });
}

export async function deleteApiKey(id: number): Promise<boolean> {
  return mutex.runExclusive(async () => {
    const store = getStore();
    const index = store.keys.findIndex(k => k.id === id);
    if (index === -1) return false;
    store.keys.splice(index, 1);
    await saveStore(store);
    return true;
  });
}

export async function listApiKeys(): Promise<Omit<ApiKey, 'encryptedKey'>[]> {
  return mutex.runExclusive(() => {
    const store = getStore();
    // 解构排除 encryptedKey，不返回占位符，类型与返回声明一致
    return store.keys.map(({ encryptedKey: _, ...rest }) => rest);
  });
}

export async function getApiKey(id: number): Promise<Omit<ApiKey, 'encryptedKey'> | undefined> {
  return mutex.runExclusive(() => {
    const store = getStore();
    const key = store.keys.find(k => k.id === id);
    if (!key) return undefined;
    const { encryptedKey: _, ...rest } = key;
    return rest;
  });
}

/** 解密并尝试自动迁移到 safeStorage */
async function decryptWithMigration(store: ApiKeyStore, key: ApiKey): Promise<string | undefined> {
  try {
    const decrypted = decrypt(key.encryptedKey);
    if (!decrypted || decrypted.length < 10) {
      console.warn(`apiKey: ID=${key.id} 解密结果异常，已跳过`);
      return undefined;
    }
    // 自动迁移：AES 格式密钥在 safeStorage 可用时重新加密
    if (!isSafeStorageFormat(key.encryptedKey) && isSafeStorageAvailable()) {
      try {
        key.encryptedKey = encrypt(decrypted);
        key.updatedAt = new Date().toISOString();
        await saveStore(store);
        console.info(`apiKey: ID=${key.id} 已自动迁移到系统安全存储`);
      } catch (migrateErr) {
        console.warn(`apiKey: ID=${key.id} 迁移失败，继续使用 AES:`, (migrateErr as Error).message);
      }
    }
    return decrypted;
  } catch (err) {
    console.error(`apiKey: ID=${key.id} 解密失败:`, (err instanceof Error ? err.message : String(err)));
    return undefined;
  }
}

export async function getDecryptedKey(id: number): Promise<string | undefined> {
  return mutex.runExclusive(async () => {
    const store = getStore();
    const key = store.keys.find(k => k.id === id);
    if (!key) return undefined;
    return decryptWithMigration(store, key);
  });
}

export async function getDecryptedKeyByType(apiType: string): Promise<string | undefined> {
  return mutex.runExclusive(async () => {
    const store = getStore();
    const key = store.keys.find(k => k.type === apiType);
    if (!key) return undefined;
    return decryptWithMigration(store, key);
  });
}

export default {
  addApiKey,
  deleteApiKey,
  listApiKeys,
  getApiKey,
  getDecryptedKey,
  getDecryptedKeyByType
};