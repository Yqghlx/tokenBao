import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 从根目录 package.json 读取版本号
let appVersion = '0.0.0';
try {
  const rootPkg = JSON.parse(
    readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
  );
  appVersion = rootPkg.version || appVersion;
} catch {
  // package.json 不存在或格式错误时使用默认版本号，不阻塞构建
}

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});