import { app, BrowserWindow, ipcMain, safeStorage } from 'electron';
import * as path from 'path';
import ProxyServer from '../proxy/server';
import * as configService from '../services/config';
import * as apiKeyService from '../services/apiKey';
import * as historyService from '../services/history';
import * as budgetService from '../services/budget';
import * as statsService from '../services/stats';
import * as rulesModule from '../optimizations/rules';
import dlpModule from '../optimizations/dlp';
import cachingModule from '../optimizations/caching';
import * as pricingSync from '../services/pricingSync';
import { initSafeStorage, isSafeStorageAvailable } from '../utils/safeCrypto';
import { getOptimizationConfig, setOptimizationConfig } from '../services/config';

let mainWindow: BrowserWindow | null = null;
let proxyServer: ProxyServer | null = null;

/** 代理服务器崩溃后自动重启 */
async function restartProxy(): Promise<void> {
  if (!proxyServer) return;
  const port = proxyServer.getPort();
  console.warn(`代理服务器异常停止，尝试自动重启 (端口: ${port})...`);
  try {
    await proxyServer.stop();
  } catch (err) {
    console.warn('重启时代理停止失败:', (err as Error).message);
  }
  proxyServer = null;

  try {
    const openaiKey = await apiKeyService.getDecryptedKeyByType('openai');
    const anthropicKey = await apiKeyService.getDecryptedKeyByType('anthropic');
    proxyServer = new ProxyServer({ port, openaiKey, anthropicKey });
    await proxyServer.start();
    const optimConfig = await getOptimizationConfig();
    proxyServer.updateOptimizationConfig(optimConfig);
    console.info(`代理服务器自动重启成功 (端口: ${port})`);

    // 通知渲染进程状态变更
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('proxy:statusChanged', { running: true, port });
    }
  } catch (err) {
    console.error('代理服务器自动重启失败:', err);
    proxyServer = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('proxy:error', { message: '代理服务器崩溃后自动重启失败' });
    }
  }
}

/** 健康检查间隔（毫秒） */
const HEALTH_CHECK_INTERVAL = 10000;

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

function startHealthCheck(): void {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(() => {
    if (proxyServer && !proxyServer.isRunning()) {
      restartProxy().catch(err => console.error('健康检查重启失败:', err));
    }
  }, HEALTH_CHECK_INTERVAL);
}

function stopHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

/**
 * 对错误消息进行脱敏，防止内部路径/凭证等泄露到渲染进程
 * 仅保留错误类型和简短描述，移除文件路径和堆栈信息
 */
function sanitizeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // 移除常见路径模式（绝对路径、相对路径）
    const msg = err.message
      .replace(/\/[\w./-]+/g, '[path]')
      .replace(/\\[\w.\\-]+/g, '[path]')
      .slice(0, 200);
    return msg;
  }
  return '未知错误';
}

// 全局错误处理：防止单个请求错误导致进程崩溃
process.on('uncaughtException', (err) => {
  console.error('未捕获异常:', err);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('proxy:error', {
      message: `应用异常: ${sanitizeErrorMessage(err)}`
    });
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('proxy:error', {
      message: `异步操作异常: ${sanitizeErrorMessage(reason)}`
    });
  }
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'TokenBao',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('proxy:start', async (_, port?: number) => {
    try {
      // 重入保护：代理已在运行时先停止旧实例
      if (proxyServer) {
        stopHealthCheck();
        try { await proxyServer.stop(); } catch (err) { console.warn('重入停止旧代理失败:', (err as Error).message); }
        proxyServer = null;
      }

      // 优先使用传入端口，否则从配置读取，最终默认 3000
      const configPort = await configService.getConfig('proxyPort');
      const parsedConfigPort = configPort ? parseInt(configPort, 10) : NaN;
      const effectivePort = port || (Number.isFinite(parsedConfigPort) && parsedConfigPort >= 1024 && parsedConfigPort <= 65535 ? parsedConfigPort : 3000);

      const openaiKey = await apiKeyService.getDecryptedKeyByType('openai');
      const anthropicKey = await apiKeyService.getDecryptedKeyByType('anthropic');

      proxyServer = new ProxyServer({ port: effectivePort, openaiKey, anthropicKey });
      await proxyServer.start();

      // 并行获取配置，减少代理启动延迟
      const [cacheTTL, optimConfig] = await Promise.all([
        configService.getConfig('cacheTTL'),
        getOptimizationConfig()
      ]);
      if (cacheTTL) {
        cachingModule.setOptions({ ttl: cacheTTL as '5min' | '1hour' });
      }
      proxyServer.updateOptimizationConfig(optimConfig);
      startHealthCheck();
      // 事件驱动的崩溃检测：server error/close 立即触发重启，不依赖 10s 轮询
      proxyServer.onServerError(() => {
        console.warn('代理服务器异常事件，触发即时重启...');
        restartProxy().catch(err => console.error('事件驱动重启失败:', err));
      });

      return { success: true, port: proxyServer.getPort() };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('proxy:stop', async () => {
    try {
      stopHealthCheck();
      if (proxyServer) {
        try {
          await proxyServer.stop();
        } catch (err) {
          console.warn('代理服务器停止异常:', (err as Error).message);
        }
        proxyServer = null;
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('proxy:status', async () => {
    try {
      return {
        running: proxyServer?.isRunning() || false,
        port: proxyServer?.getPort() || 0,
        requests: proxyServer?.getStats()?.requests || 0
      };
    } catch (err) {
      console.error('proxy:status 错误:', err);
      return { running: false, port: 0, requests: 0, error: (err as Error).message };
    }
  });

  ipcMain.handle('proxy:health', async () => {
    try {
      if (!proxyServer?.isRunning()) {
        return { status: 'not_running', uptime: 0, activeConnections: 0, requestCount: 0 };
      }
      return {
        status: 'healthy',
        uptime: Math.floor(process.uptime()),
        activeConnections: proxyServer.getActiveConnections(),
        requestCount: proxyServer.getStats().requests
      };
    } catch (err) {
      console.error('proxy:health 错误:', err);
      return { status: 'not_running' as const, uptime: 0, activeConnections: 0, requestCount: 0 };
    }
  });

  ipcMain.handle('proxy:setKeys', async (_, openaiKey: string, anthropicKey: string) => {
    try {
      // 主进程二次校验，防御 preload 绕过
      const ctrlCharRe = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
      if (openaiKey) {
        if (!openaiKey.startsWith('sk-') || openaiKey.length < 10 || openaiKey.length > 500) {
          return { success: false, error: 'OpenAI Key 格式无效' };
        }
        if (ctrlCharRe.test(openaiKey)) {
          return { success: false, error: '密钥包含非法控制字符' };
        }
      }
      if (anthropicKey) {
        if (!anthropicKey.startsWith('sk-ant-') || anthropicKey.length < 10 || anthropicKey.length > 500) {
          return { success: false, error: 'Anthropic Key 格式无效' };
        }
        if (ctrlCharRe.test(anthropicKey)) {
          return { success: false, error: '密钥包含非法控制字符' };
        }
      }
      if (proxyServer) {
        proxyServer.setKeys(openaiKey, anthropicKey);
      }
      return { success: true };
    } catch (err) {
      console.error('proxy:setKeys 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('config:get', async (_, key: string) => {
    try {
      return await configService.getConfig(key);
    } catch (err) {
      console.error('config:get 错误:', err);
      return null;
    }
  });

  ipcMain.handle('config:set', async (_, key: string, value: string) => {
    try {
      await configService.setConfig(key, value);
      // 配置变更后同步到运行中的模块
      if (key === 'cacheTTL') {
        cachingModule.setOptions({ ttl: value as '5min' | '1hour' });
      }
      return { success: true };
    } catch (err) {
      console.error('config:set 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('config:getAll', async () => {
    try {
      return await configService.getAllConfig();
    } catch (err) {
      console.error('config:getAll 错误:', err);
      return {};
    }
  });

  ipcMain.handle('config:reset', async () => {
    try {
      await configService.resetConfig();
      return { success: true };
    } catch (err) {
      console.error('config:reset 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('apiKeys:list', async () => {
    try {
      return await apiKeyService.listApiKeys();
    } catch (err) {
      console.error('apiKeys:list 错误:', err);
      return [];
    }
  });

  ipcMain.handle('apiKeys:add', async (_, name: string, type: string, key: string) => {
    try {
      const result = await apiKeyService.addApiKey(name, type, key);

      if (proxyServer && proxyServer.isRunning()) {
        const openaiKey = await apiKeyService.getDecryptedKeyByType('openai');
        const anthropicKey = await apiKeyService.getDecryptedKeyByType('anthropic');
        proxyServer.setKeys(openaiKey, anthropicKey);
      }

      return result;
    } catch (err) {
      console.error('apiKeys:add 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('apiKeys:delete', async (_, id: number) => {
    try {
      if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        return { success: false, error: '无效的 API Key ID' };
      }
      const result = await apiKeyService.deleteApiKey(id);

      if (proxyServer && proxyServer.isRunning()) {
        const openaiKey = await apiKeyService.getDecryptedKeyByType('openai');
        const anthropicKey = await apiKeyService.getDecryptedKeyByType('anthropic');
        proxyServer.setKeys(openaiKey, anthropicKey);
      }

      return result;
    } catch (err) {
      console.error('apiKeys:delete 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('apiKeys:get', async (_, id: number) => {
    try {
      if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        console.warn('apiKeys:get: id 参数无效');
        return null;
      }
      return await apiKeyService.getApiKey(id);
    } catch (err) {
      console.error('apiKeys:get 错误:', err);
      return null;
    }
  });

  ipcMain.handle('history:list', async (_, options?) => {
    try {
      // 校验 options 结构，防止恶意输入
      if (options !== undefined && options !== null && typeof options !== 'object') {
        console.warn('history:list: options 参数类型无效');
        return [];
      }
      if (options) {
        if (options.limit !== undefined && (typeof options.limit !== 'number' || !Number.isFinite(options.limit))) {
          console.warn('history:list: limit 参数无效');
          return [];
        }
        if (options.offset !== undefined && (typeof options.offset !== 'number' || !Number.isFinite(options.offset))) {
          console.warn('history:list: offset 参数无效');
          return [];
        }
      }
      return await historyService.listRequests(options);
    } catch (err) {
      console.error('history:list 错误:', err);
      return [];
    }
  });

  ipcMain.handle('history:count', async (_, options?) => {
    try {
      return await historyService.getRequestCount(options);
    } catch (err) {
      console.error('history:count 错误:', err);
      return 0;
    }
  });

  ipcMain.handle('history:clear', async () => {
    try {
      await historyService.clearRequests();
      return { success: true };
    } catch (err) {
      console.error('history:clear 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('budget:get', async () => {
    try {
      return await budgetService.getBudget('monthly');
    } catch (err) {
      console.error('budget:get 错误:', err);
      return null;
    }
  });

  ipcMain.handle('budget:set', async (_, type: string, limit: number) => {
    try {
      // 主进程二次校验 type 参数，防御 preload 绕过
      if (type !== 'daily' && type !== 'monthly') {
        return { success: false, error: '无效的预算类型' };
      }
      const result = await budgetService.setBudgetLimit(type, limit);
      if (proxyServer) await proxyServer.loadBudgetSnapshot();
      // 主动通知渲染进程预算已变更，减少轮询延迟
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('budget:changed');
      }
      return result;
    } catch (err) {
      console.error('budget:set 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('budget:status', async () => {
    try {
      return await budgetService.getBudgetStatus();
    } catch (err) {
      console.error('budget:status 错误:', err);
      return { daily: { limit: 10, spent: 0, remaining: 10, percentage: 0 }, monthly: { limit: 100, spent: 0, remaining: 100, percentage: 0 } };
    }
  });

  ipcMain.handle('budget:resetSpent', async (_, type: string) => {
    try {
      if (type !== 'daily' && type !== 'monthly') {
        return { success: false, error: '无效的预算类型' };
      }
      await budgetService.resetSpent(type);
      if (proxyServer) await proxyServer.loadBudgetSnapshot();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('budget:changed');
      }
      return { success: true };
    } catch (err) {
      console.error('budget:resetSpent 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('stats:summary', async () => {
    try {
      return await statsService.getSummary();
    } catch (err) {
      console.error('stats:summary 错误:', err);
      return { totalRequests: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCachedTokens: 0, totalCost: 0, byApi: {}, byModel: {}, cacheMetrics: { hits: 0, misses: 0, size: 0, hitRate: 0 } };
    }
  });

  ipcMain.handle('stats:reset', async () => {
    try {
      await statsService.resetStats();
      return { success: true };
    } catch (err) {
      console.error('stats:reset 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('optimization:getConfig', async () => {
    try {
      return await getOptimizationConfig();
    } catch (err) {
      console.error('optimization:getConfig 错误:', err);
      return {};
    }
  });

  ipcMain.handle('optimization:setConfig', async (_, config: Record<string, unknown>) => {
    try {
      await setOptimizationConfig(config as Record<string, boolean>);
      // 同步到运行中的代理服务器，否则运行时修改优化开关不生效
      if (proxyServer) {
        proxyServer.updateOptimizationConfig(config as Record<string, boolean>);
      }
      return { success: true, config };
    } catch (err) {
      console.error('optimization:setConfig 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  // 规则管理
  ipcMain.handle('rules:list', async () => {
    try {
      return rulesModule.listRules();
    } catch (err) {
      console.error('rules:list 错误:', err);
      return [];
    }
  });

  ipcMain.handle('rules:add', async (_, rule: { name: string; type: 'replace' | 'filter' | 'route'; pattern: string; replacement: string; enabled: boolean; priority: number }) => {
    try {
      // 主进程二次校验 replacement 长度和 priority 范围
      if (typeof rule.replacement !== 'string' || rule.replacement.length > 1000) {
        return { success: false, error: '替换文本过长' };
      }
      if (typeof rule.priority !== 'number' || !Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 1000) {
        return { success: false, error: 'priority 必须是 0-1000 之间的整数' };
      }
      const result = rulesModule.addRule(rule);
      return { success: true, rule: result };
    } catch (err) {
      console.error('rules:add 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('rules:update', async (_, id: number, updates: Record<string, unknown>) => {
    try {
      // 字段白名单校验，防止注入非法字段
      const allowedFields = new Set(['name', 'type', 'pattern', 'replacement', 'enabled', 'priority']);
      const safeUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.has(key)) {
          safeUpdates[key] = value;
        }
      }
      const result = rulesModule.updateRule(id, safeUpdates);
      return result ? { success: true, rule: result } : { success: false, error: '规则不存在' };
    } catch (err) {
      console.error('rules:update 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('rules:delete', async (_, id: number) => {
    try {
      if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
        return { success: false, error: '无效的规则 ID' };
      }
      return { success: rulesModule.deleteRule(id) };
    } catch (err) {
      console.error('rules:delete 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('rules:validate', async (_, pattern: string) => {
    try {
      return { error: rulesModule.validatePattern(pattern) };
    } catch (err) {
      console.error('rules:validate 错误:', err);
      return { error: (err as Error).message };
    }
  });

  // DLP 敏感数据脱敏
  ipcMain.handle('dlp:getRules', async () => {
    try {
      return dlpModule.getRules();
    } catch (err) {
      console.error('dlp:getRules 错误:', err);
      return [];
    }
  });

  ipcMain.handle('dlp:setEnabled', async (_, ruleId: string, enabled: boolean) => {
    try {
      const success = dlpModule.setRuleEnabled(ruleId, enabled);
      return { success };
    } catch (err) {
      console.error('dlp:setEnabled 错误:', err);
      return { success: false, error: (err as Error).message };
    }
  });
}

// 单实例锁：防止多窗口并发写入同一组 JSON 文件导致数据损坏
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 用户再次启动时聚焦已有窗口，而非创建新实例
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  // 初始化系统级安全存储（macOS Keychain / Windows DPAPI）
  if (safeStorage.isEncryptionAvailable()) {
    initSafeStorage(safeStorage);
    console.info('系统安全存储已启用:', isSafeStorageAvailable() ? 'active' : 'unavailable');
  }
  registerIpcHandlers();
  createWindow();
  // 启动定价远程同步（从缓存加载 + 异步拉取最新 + 24h 定时刷新）
  pricingSync.initSync();
});

app.on('window-all-closed', () => {
  stopHealthCheck();
  // macOS 保持Dock运行，代理清理由 before-quit 统一处理
  // 非 macOS 先停止代理再退出（同步等待 before-quit 完成清理）
  if (process.platform !== 'darwin') {
    if (proxyServer) {
      proxyServer.stop().then(() => {
        proxyServer = null;
        app.quit();
      }).catch(() => {
        proxyServer = null;
        app.quit();
      });
    } else {
      app.quit();
    }
  }
});

// 确保应用退出前清理代理服务器（macOS Cmd+Q 等场景）
app.on('before-quit', async () => {
  stopHealthCheck();
  pricingSync.stopSync();
  if (proxyServer) {
    try {
      await proxyServer.stop();
    } catch (err) {
      console.warn('退出时代理停止失败:', (err as Error).message);
    }
    proxyServer = null;
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  }
});