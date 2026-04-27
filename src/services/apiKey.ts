import { encrypt, decrypt } from '../utils/crypto';
import { loadJson, saveJson } from '../utils/storage';
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
const mutex = getMutex(STORAGE_FILE);

function getStore(): ApiKeyStore {
  return loadJson<ApiKeyStore>(STORAGE_FILE, { keys: [], nextId: 1 });
}

function saveStore(store: ApiKeyStore): void {
  saveJson(STORAGE_FILE, store);
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

  return mutex.runExclusive(() => {
    const store = getStore();
    const encryptedKey = encrypt(key);
    const now = new Date().toISOString();
    const apiKey: ApiKey = {
      id: store.nextId++,
      name,
      type,
      encryptedKey,
      createdAt: now,
      updatedAt: now
    };
    store.keys.push(apiKey);
    saveStore(store);
    return apiKey;
  });
}

export async function deleteApiKey(id: number): Promise<boolean> {
  return mutex.runExclusive(() => {
    const store = getStore();
    const index = store.keys.findIndex(k => k.id === id);
    if (index === -1) return false;
    store.keys.splice(index, 1);
    saveStore(store);
    return true;
  });
}

export async function listApiKeys(): Promise<Omit<ApiKey, 'encryptedKey'>[]> {
  const store = getStore();
  return store.keys.map(k => ({
    id: k.id,
    name: k.name,
    type: k.type,
    encryptedKey: '***',
    createdAt: k.createdAt,
    updatedAt: k.updatedAt
  }));
}

export async function getApiKey(id: number): Promise<ApiKey | undefined> {
  const store = getStore();
  return store.keys.find(k => k.id === id);
}

export async function getDecryptedKey(id: number): Promise<string | undefined> {
  const store = getStore();
  const key = store.keys.find(k => k.id === id);
  if (!key) return undefined;
  return decrypt(key.encryptedKey);
}

export async function getDecryptedKeyByType(apiType: string): Promise<string | undefined> {
  const store = getStore();
  const key = store.keys.find(k => k.type === apiType);
  if (!key) return undefined;
  return decrypt(key.encryptedKey);
}

export default {
  addApiKey,
  deleteApiKey,
  listApiKeys,
  getApiKey,
  getDecryptedKey,
  getDecryptedKeyByType
};