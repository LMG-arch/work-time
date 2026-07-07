import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'

// 复制遗留非模块脚本到构建输出 — Vite 不处理非 type="module" 的 script 标签
function copyLegacyAssets() {
  const FILES = [
    'utils.js', 'holidays.js', 'lunar.js', 'web-api.js',
    'social.js', 'calendar.js', 'todos.js',
    'reminders.js', 'stats.js', 'settings.js', 'updater.js',
    'renderer.js', 'styles.css', 'social.css',
  ]
  return {
    name: 'copy-legacy-assets',
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'src')
      const outDir = path.resolve(__dirname, 'dist')
      for (const f of FILES) {
        const src = path.join(srcDir, f)
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, f))
      }
      // 复制 lib 目录
      const libOut = path.join(outDir, 'lib')
      if (!fs.existsSync(libOut)) fs.mkdirSync(libOut, { recursive: true })
      const libSrc = path.join(srcDir, 'lib')
      if (fs.existsSync(libSrc)) {
        for (const f of fs.readdirSync(libSrc)) {
          fs.copyFileSync(path.join(libSrc, f), path.join(libOut, f))
        }
      }
      // 复制 holidays.js 和 lunar.js 的依赖文件（如果有额外资源）
      console.log('[copy-legacy-assets] Legacy scripts copied to dist/')
    },
  }
}

// 跳过 lib/ 下第三方 JS 的 Vite 转换（supabase.min.js 含 import("@opentelemetry/api") 导致转换失败）
function serveLibRaw() {
  return {
    name: 'serve-lib-raw',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/lib/')) {
          const filePath = path.join(__dirname, 'src', req.url.split('?')[0]);
          if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath);
            const ct = ext === '.css' ? 'text/css' : 'application/javascript';
            res.setHeader('Content-Type', ct + '; charset=utf-8');
            res.statusCode = 200;
            res.end(fs.readFileSync(filePath));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), serveLibRaw(), copyLegacyAssets()],
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})