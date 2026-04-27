import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import ProxyServer from '../proxy/server';
import * as configService from '../services/config';
import * as apiKeyService from '../services/apiKey';
import * as historyService from '../services/history';
import * as budgetService from '../services/budget';
import * as statsService from '../services/stats';
import * as rulesModule from '../optimizations/rules';
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
      const effectivePort = port || (configPort ? parseInt(configPort, 10) : 3000);

      const openaiKey = await apiKeyService.getDecryptedKeyByType('openai');
      const anthropicKey = await apiKeyService.getDecryptedKeyByType('anthropic');

      proxyServer = new ProxyServer({ port: effectivePort, openaiKey, anthropicKey });
      await proxyServer.start();

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
    return {
      running: proxyServer?.isRunning() || false,
      port: proxyServer?.getPort() || 0,
      requests: proxyServer?.getStats()?.requests || 0
    };
  });

  ipcMain.handle('proxy:health', async () => {
    if (!proxyServer?.isRunning()) {
      return { status: 'not_running', uptime: 0, activeConnections: 0, requestCount: 0 };
    }
    return {
      status: 'healthy',
      uptime: Math.floor(process.uptime()),
      activeConnections: proxyServer.getActiveConnections(),
      requestCount: proxyServer.getStats().requests
    };
  });

  ipcMain.handle('proxy:setKeys', async (_, openaiKey: string, anthropicKey: string) => {
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
  });

  ipcMain.handle('config:get', async (_, key: string) => {
    return await configService.getConfig(key);
  });

  ipcMain.handle('config:set', async (_, key: string, value: string) => {
    await configService.setConfig(key, value);
    return { success: true };
  });

  ipcMain.handle('config:getAll', async () => {
    return await configService.getAllConfig();
  });

  ipcMain.handle('config:reset', async () => {
    await configService.resetConfig();
    return { success: true };
  });

  ipcMain.handle('apiKeys:list', async () => {
    return await apiKeyService.listApiKeys();
  });

  ipcMain.handle('apiKeys:add', async (_, name: string, type: string, key: string) => {
    const result = await apiKeyService.addApiKey(name, type, key);
    
    if (proxyServer && proxyServer.isRunning()) {
      const openaiKey = await apiKeyService.getDecryptedKeyByType('openai');
      const anthropicKey = await apiKeyService.getDecryptedKeyByType('anthropic');
      proxyServer.setKeys(openaiKey, anthropicKey);
    }
    
    return result;
  });

  ipcMain.handle('apiKeys:delete', async (_, id: number) => {
    const result = await apiKeyService.deleteApiKey(id);
    
    if (proxyServer && proxyServer.isRunning()) {
      const openaiKey = await apiKeyService.getDecryptedKeyByType('openai');
      const anthropicKey = await apiKeyService.getDecryptedKeyByType('anthropic');
      proxyServer.setKeys(openaiKey, anthropicKey);
    }
    
    return result;
  });

  ipcMain.handle('apiKeys:get', async (_, id: number) => {
    return await apiKeyService.getApiKey(id);
  });

  ipcMain.handle('history:list', async (_, options?) => {
    return await historyService.listRequests(options);
  });

  ipcMain.handle('history:count', async (_, options?) => {
    return await historyService.getRequestCount(options);
  });

  ipcMain.handle('history:clear', async () => {
    await historyService.clearRequests();
    return { success: true };
  });

  ipcMain.handle('budget:get', async () => {
    return await budgetService.getBudget('monthly');
  });

  ipcMain.handle('budget:set', async (_, type: string, limit: number) => {
    const result = await budgetService.setBudgetLimit(type as 'daily' | 'monthly', limit);
    if (proxyServer) await proxyServer.loadBudgetSnapshot();
    return result;
  });

  ipcMain.handle('budget:status', async () => {
    return await budgetService.getBudgetStatus();
  });

  ipcMain.handle('budget:resetSpent', async (_, type: string) => {
    await budgetService.resetSpent(type as 'daily' | 'monthly');
    if (proxyServer) await proxyServer.loadBudgetSnapshot();
    return { success: true };
  });

  ipcMain.handle('stats:summary', async () => {
    return await statsService.getSummary();
  });

  ipcMain.handle('stats:reset', async () => {
    await statsService.resetStats();
    return { success: true };
  });

  ipcMain.handle('optimization:getConfig', async () => {
    return await getOptimizationConfig();
  });

  ipcMain.handle('optimization:setConfig', async (_, config: Record<string, unknown>) => {
    await setOptimizationConfig(config as Record<string, boolean>);
    // 同步到运行中的代理服务器，否则运行时修改优化开关不生效
    if (proxyServer) {
      proxyServer.updateOptimizationConfig(config as Record<string, boolean>);
    }
    return { success: true, config };
  });

  // 规则管理
  ipcMain.handle('rules:list', async () => {
    return rulesModule.listRules();
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
    return { success: rulesModule.deleteRule(id) };
  });

  ipcMain.handle('rules:validate', async (_, pattern: string) => {
    return { error: rulesModule.validatePattern(pattern) };
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

app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  }
});