import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'

// 复制遗留非模块脚本到构建输出 — Vite 不处理非 type="module" 的 script 标签
function copyLegacyAssets() {
  const FILES = [
    'utils.js', 'holidays.js', 'lunar.js', 'web-api.js',
    'supabase.js', 'social.js', 'calendar.js', 'todos.js',
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

export default defineConfig({
  plugins: [vue(), copyLegacyAssets()],
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