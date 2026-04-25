import { encrypt, decrypt } from '../utils/crypto';
import { loadJson, saveJson } from '../utils/storage';

interface ApiKey {
  id: number;
  name: string;
  type: string;
  encryptedKey: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiKeyStore {
  keys: ApiKey[];
  nextId: number;
}

const STORAGE_FILE = 'apiKeys.json';

function getStore(): ApiKeyStore {
  return loadJson<ApiKeyStore>(STORAGE_FILE, { keys: [], nextId: 1 });
}

function saveStore(store: ApiKeyStore): void {
  saveJson(STORAGE_FILE, store);
}

export async function addApiKey(name: string, type: string, key: string): Promise<ApiKey> {
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
}

export async function deleteApiKey(id: number): Promise<boolean> {
  const store = getStore();
  const index = store.keys.findIndex(k => k.id === id);
  if (index === -1) return false;
  store.keys.splice(index, 1);
  saveStore(store);
  return true;
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