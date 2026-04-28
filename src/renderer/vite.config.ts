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
    // 使用 esbuild 压缩（Vite 内置，无需额外依赖）
    minify: 'esbuild',
    // 单 chunk 超过 500KB 时告警
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // 将 react/react-dom 拆分为独立 vendor chunk，利用浏览器缓存
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-router': ['react-router-dom'],
        },
      },
    },
    // CSS 代码分割
    cssCodeSplit: true,
    // 生成 sourcemap 用于生产调试
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});