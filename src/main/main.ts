import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import ProxyServer from '../proxy/server';
import * as configService from '../services/config';
import * as apiKeyService from '../services/apiKey';
import * as historyService from '../services/history';
import * as budgetService from '../services/budget';
import * as statsService from '../services/stats';
import * as rulesModule from '../optimizations/rules';
import cachingModule from '../optimizations/caching';
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
  } catch {
    /* 停止失败忽略 */
  }
  proxyServer = null;

  try {
    const openaiKey = await apiKeyService.getDecryptedKeyByType('openai');
    const anthropicKey = await apiKeyService.getDecryptedKeyByType('anthropic');
    proxyServer = new ProxyServer({ port, openaiKey, anthropicKey });
    await proxyServer.start();
    const optimConfig = await getOptimizationConfig();
    proxyServer.updateOptimizationConfig(optimConfig);
    console.log(`代理服务器自动重启成功 (端口: ${port})`);

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

/** 每 10 秒检查代理服务器健康状态 */
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

function startHealthCheck(): void {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(() => {
    if (proxyServer && !proxyServer.isRunning()) {
      restartProxy().catch(err => console.error('健康检查重启失败:', err));
    }
  }, 10000);
}

function stopHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// 全局错误处理：防止单个请求错误导致进程崩溃
process.on('uncaughtException', (err) => {
  console.error('未捕获异常:', err);
  // 通知渲染进程显示错误提示
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('proxy:error', {
      message: `应用异常: ${err instanceof Error ? err.message : String(err)}`
    });
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('proxy:error', {
      message: `异步操作异常: ${reason instanceof Error ? reason.message : String(reason)}`
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
      nodeIntegration: false
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
      // 优先使用传入端口，否则从配置读取，最终默认 3000
      const configPort = await configService.getConfig('proxyPort');
      const parsedConfigPort = configPort ? parseInt(configPort, 10) : NaN;
      const effectivePort = port || (Number.isFinite(parsedConfigPort) && parsedConfigPort >= 1024 && parsedConfigPort <= 65535 ? parsedConfigPort : 3000);

      const openaiKey = await apiKeyService.getDecryptedKeyByType('openai');
      const anthropicKey = await apiKeyService.getDecryptedKeyByType('anthropic');

      proxyServer = new ProxyServer({ port: effectivePort, openaiKey, anthropicKey });
      await proxyServer.start();

      // 应用当前配置到缓存模块
      const cacheTTL = await configService.getConfig('cacheTTL');
      if (cacheTTL) {
        cachingModule.setOptions({ ttl: cacheTTL as '5min' | '1hour' });
      }

      const optimConfig = await getOptimizationConfig();
      proxyServer.updateOptimizationConfig(optimConfig);
      startHealthCheck();

      return { success: true, port: proxyServer.getPort() };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('proxy:stop', async () => {
    try {
      stopHealthCheck();
      if (proxyServer) {
        await proxyServer.stop();
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
      return { status: 'error', uptime: 0, activeConnections: 0, requestCount: 0 };
    }
  });

  ipcMain.handle('proxy:setKeys', async (_, openaiKey: string, anthropicKey: string) => {
    try {
      // 主进程二次校验，防御 preload 绕过
      if (openaiKey && (!openaiKey.startsWith('sk-') || openaiKey.length < 20)) {
        return { success: false, error: 'OpenAI Key 格式无效' };
      }
      if (anthropicKey && (!anthropicKey.startsWith('sk-ant-') || anthropicKey.length < 20)) {
        return { success: false, error: 'Anthropic Key 格式无效' };
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
      return await apiKeyService.getApiKey(id);
    } catch (err) {
      console.error('apiKeys:get 错误:', err);
      return null;
    }
  });

  ipcMain.handle('history:list', async (_, options?) => {
    try {
      return await historyService.listRequests(options);
    } catch (err) {
      console.error('history:list 错误:', err);
      return { requests: [], total: 0 };
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
      const result = await budgetService.setBudgetLimit(type as 'daily' | 'monthly', limit);
      if (proxyServer) await proxyServer.loadBudgetSnapshot();
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
      await budgetService.resetSpent(type as 'daily' | 'monthly');
      if (proxyServer) await proxyServer.loadBudgetSnapshot();
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
      return { totalRequests: 0, totalTokens: 0, totalSaved: 0, totalCost: 0 };
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
      const result = rulesModule.addRule(rule);
      return { success: true, rule: result };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('rules:update', async (_, id: number, updates: Record<string, unknown>) => {
    try {
      const result = rulesModule.updateRule(id, updates);
      return result ? { success: true, rule: result } : { success: false, error: '规则不存在' };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('rules:delete', async (_, id: number) => {
    try {
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
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', async () => {
  stopHealthCheck();
  if (proxyServer) {
    await proxyServer.stop();
    proxyServer = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 确保应用退出前清理代理服务器（macOS Cmd+Q 等场景）
app.on('before-quit', async () => {
  stopHealthCheck();
  if (proxyServer) {
    try {
      await proxyServer.stop();
    } catch {
      /* 退出时忽略停止失败 */
    }
    proxyServer = null;
  }
});

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  }
});