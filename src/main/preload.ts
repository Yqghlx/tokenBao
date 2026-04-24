import { contextBridge, ipcRenderer } from 'electron';

// 在渲染进程中暴露一个受控的 IPC 桥梁，确保上下文隔离安全
contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, data?: any) => {
    ipcRenderer.send(channel, data);
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  }
});
