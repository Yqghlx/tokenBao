import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import ProxyServer from '../proxy/server';
import * as configService from '../services/config';
import * as apiKeyService from '../services/apiKey';
import * as historyService from '../services/history';
import * as budgetService from '../services/budget';
import * as statsService from '../services/stats';
import { getOptimizationConfig, setOptimizationConfig } from '../services/config';

let mainWindow: BrowserWindow | null = null;
let proxyServer: ProxyServer | null = null;

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

      return { success: true, port: proxyServer.getPort() };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('proxy:stop', async () => {
    try {
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

  ipcMain.handle('proxy:setKeys', async (_, openaiKey: string, anthropicKey: string) => {
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

  ipcMain.handle('history:clear', async () => {
    await historyService.clearRequests();
    return { success: true };
  });

  ipcMain.handle('budget:get', async () => {
    return await budgetService.getBudget('monthly');
  });

  ipcMain.handle('budget:set', async (_, type: string, limit: number) => {
    return await budgetService.setBudgetLimit(type as 'daily' | 'monthly', limit);
  });

  ipcMain.handle('budget:status', async () => {
    return await budgetService.getBudgetStatus();
  });

  ipcMain.handle('stats:summary', async () => {
    return await statsService.getSummary();
  });

  ipcMain.handle('optimization:getConfig', async () => {
    return await getOptimizationConfig();
  });

  ipcMain.handle('optimization:setConfig', async (_, config: Record<string, unknown>) => {
    await setOptimizationConfig(config as Record<string, boolean>);
    return { success: true, config };
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (proxyServer) {
    proxyServer.stop();
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