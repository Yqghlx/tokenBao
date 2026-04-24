import { app, BrowserWindow } from 'electron';
import * as path from 'path';

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'TokenBao',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 尝试加载本地 HTML 文件，如果失败使用内联最简单的页面
  const indexPath = path.join(__dirname, 'index.html');
  win.loadFile(indexPath).catch(() => {
    const simple = `<!doctype html><html><head><meta charset="utf-8"><title>TokenBao</title></head><body><h1>TokenBao</h1><p>Electron 应用已启动</p></body></html>`;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(simple)}`);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
