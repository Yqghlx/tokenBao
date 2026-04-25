import { loadJson, saveJson } from '../utils/storage';

export interface RequestLog {
  id: number;
  apiType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  cached: boolean;
  timestamp: string;
  requestBody?: string;
  responseBody?: string;
}

interface HistoryStore {
  requests: RequestLog[];
  nextId: number;
}

const STORAGE_FILE = 'history.json';
const MAX_HISTORY = 1000;

function getStore(): HistoryStore {
  return loadJson<HistoryStore>(STORAGE_FILE, { requests: [], nextId: 1 });
}

function saveStore(store: HistoryStore): void {
  if (store.requests.length > MAX_HISTORY) {
    store.requests = store.requests.slice(-MAX_HISTORY);
  }
  saveJson(STORAGE_FILE, store);
}

export async function addRequest(log: Omit<RequestLog, 'id'>): Promise<RequestLog> {
  const store = getStore();
  const request: RequestLog = { ...log, id: store.nextId++ };
  store.requests.push(request);
  saveStore(store);
  return request;
}

export async function listRequests(options?: { limit?: number; offset?: number; apiType?: string }): Promise<RequestLog[]> {
  const store = getStore();
  let filtered = store.requests;
  
  if (options?.apiType) {
    filtered = filtered.filter(r => r.apiType === options.apiType);
  }
  
  if (options?.offset) {
    filtered = filtered.slice(options.offset);
  }
  
  if (options?.limit) {
    filtered = filtered.slice(0, options.limit);
  }
  
  return filtered;
}

export async function getRequest(id: number): Promise<RequestLog | undefined> {
  const store = getStore();
  return store.requests.find(r => r.id === id);
}

export async function clearRequests(): Promise<void> {
  saveStore({ requests: [], nextId: 1 });
}

export async function getRecentRequests(limit: number = 10): Promise<RequestLog[]> {
  const store = getStore();
  return store.requests.slice(-limit);
}

export default {
  addRequest,
  listRequests,
  getRequest,
  clearRequests,
  getRecentRequests
};