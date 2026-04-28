/**
 * 定价远程同步服务
 * 定期从远程 JSON 拉取最新模型定价，覆盖本地内置定价表
 * 使用内置 https 模块，无额外依赖
 */
import * as https from 'https';
import { loadJson, saveJson } from '../utils/storage';
import { updateRemotePricing, getRemotePricingInfo } from '../proxy/pricing';

const STORAGE_FILE = 'remote-pricing.json';
const DEFAULT_REMOTE_URL = 'https://raw.githubusercontent.com/anthropics/tokenbao-pricing/main/pricing.json';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 小时
const REQUEST_TIMEOUT_MS = 10000; // 10 秒超时
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 缓存最多保留 7 天
const MAX_RESPONSE_SIZE = 1024 * 1024; // 远程响应体最大 1MB

interface RemotePricingData {
  /** 定价数据 */
  pricing: Record<string, { input: number; output: number }>;
  /** 数据更新时间（ISO 8601） */
  updatedAt: string;
  /** 数据版本号 */
  version: number;
}

interface CachedPricing {
  data: RemotePricingData;
  fetchedAt: number;
  source: string;
}

let syncTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 从远程 URL 拉取定价数据
 * @param maxRedirects 剩余允许的重定向次数，防止无限循环
 * @param visited 已访问 URL 集合，检测多跳循环（A→B→C→A）
 */
function fetchRemote(url: string, maxRedirects = 5, visited = new Set<string>()): Promise<RemotePricingData> {
  return new Promise((resolve, reject) => {
    // 仅允许 HTTPS 协议，防止明文传输定价数据被篡改
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        reject(new Error(`不支持的协议: ${parsed.protocol}，仅允许 HTTPS`));
        return;
      }
    } catch {
      reject(new Error(`无效的 URL 格式: ${url.slice(0, 100)}`));
      return;
    }

    // 检测重定向循环
    if (visited.has(url)) {
      reject(new Error('检测到重定向循环'));
      return;
    }
    visited.add(url);

    const req = https.get(url, { timeout: REQUEST_TIMEOUT_MS }, (res) => {
      // 校验 Content-Type 为 JSON，防止下载非预期内容
      const contentType = res.headers['content-type'] || '';
      if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
        reject(new Error(`远程响应类型无效: ${contentType}`));
        res.resume();
        return;
      }
      // 跟随重定向（有深度限制）
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) {
          reject(new Error('重定向次数超限'));
          return;
        }
        fetchRemote(res.headers.location, maxRedirects - 1, visited).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let body = '';
      let bodySize = 0;
      res.on('data', (chunk: Buffer) => {
        bodySize += chunk.length;
        if (bodySize > MAX_RESPONSE_SIZE) {
          reject(new Error(`远程响应超过大小限制 (${MAX_RESPONSE_SIZE / 1024 / 1024}MB)`));
          res.destroy();
          return;
        }
        body += chunk.toString();
      });
      res.on('error', (err) => { reject(new Error(`响应流错误: ${err.message}`)); });
      res.on('end', () => {
        try {
          const data = JSON.parse(body) as RemotePricingData;
          // 基本结构验证
          if (!data.pricing || typeof data.pricing !== 'object') {
            reject(new Error('远程定价数据格式错误：缺少 pricing 字段'));
            return;
          }
          if (!data.version || typeof data.version !== 'number') {
            reject(new Error('远程定价数据格式错误：缺少 version 字段'));
            return;
          }
          resolve(data);
        } catch (err) {
          reject(new Error(`远程定价 JSON 解析失败: ${(err as Error).message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
  });
}

/** 将远程定价缓存到本地文件 */
function saveCache(data: RemotePricingData, source: string): void {
  const cached: CachedPricing = {
    data,
    fetchedAt: Date.now(),
    source
  };
  saveJson(STORAGE_FILE, cached);
}

/** 从本地缓存加载远程定价（启动时使用，避免等待网络） */
function loadCache(): CachedPricing | null {
  try {
    return loadJson<CachedPricing | null>(STORAGE_FILE, null as unknown as CachedPricing);
  } catch {
    return null;
  }
}

/**
 * 执行一次远程定价同步
 * @returns 更新的模型数量
 */
export async function sync(remoteUrl?: string): Promise<number> {
  const url = remoteUrl || DEFAULT_REMOTE_URL;
  try {
    const data = await fetchRemote(url);
    const updated = updateRemotePricing(data.pricing, url, Date.now());
    if (updated > 0) {
      saveCache(data, url);
      console.log(`定价远程同步成功: ${updated} 个模型已更新 (version: ${data.version})`);
    }
    return updated;
  } catch (err) {
    console.warn(`定价远程同步失败 (${url}): ${(err as Error).message}`);
    return 0;
  }
}

/**
 * 初始化定价同步
 * 1. 先从本地缓存加载上次同步的定价（零延迟）
 * 2. 异步尝试拉取最新定价
 * 3. 启动定时同步（每 24 小时）
 */
export function initSync(remoteUrl?: string): void {
  // 加载缓存（跳过过期数据，避免使用过旧的定价）
  const cached = loadCache();
  if (cached?.data?.pricing && (Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS)) {
    const updated = updateRemotePricing(cached.data.pricing, cached.source, cached.fetchedAt);
    if (updated > 0) {
      console.log(`从缓存加载远程定价: ${updated} 个模型 (fetched: ${new Date(cached.fetchedAt).toISOString()})`);
    }
  }

  // 启动时异步同步一次（不阻塞）
  sync(remoteUrl).catch(() => { /* 已在 sync 内部处理 */ });

  // 定时同步
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    sync(remoteUrl).catch(() => { /* 忽略 */ });
  }, SYNC_INTERVAL_MS);
  if (syncTimer && typeof syncTimer === 'object' && 'unref' in syncTimer) {
    syncTimer.unref();
  }
}

/** 停止定时同步（用于测试或关闭） */
export function stopSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

/** 获取同步状态信息 */
export function getSyncStatus(): { lastSync: number; source: string; nextSyncIn: number } {
  const info = getRemotePricingInfo();
  return {
    lastSync: info.timestamp,
    source: info.source,
    nextSyncIn: syncTimer ? SYNC_INTERVAL_MS : 0
  };
}

export default {
  sync,
  initSync,
  stopSync,
  getSyncStatus
};
