import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: { env: Record<string, string | undefined> }

// 使用相对路径，使静态资源始终相对当前 index.html 解析：
// - GitHub Pages 项目页（/仓库名/）与任意子目录部署均正确
// - 本地直接打开 dist/index.html 时 CSS/JS 也能加载（绝对路径 /assets/ 会 404）
// 若需固定 CDN 根路径，可设置环境变量 VITE_BASE_PATH（须以 / 结尾）。
const base = (() => {
  const raw = process.env.VITE_BASE_PATH?.trim()
  if (!raw) return './'
  return raw.charAt(raw.length - 1) === '/' ? raw : `${raw}/`
})()

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          peer: ['peerjs'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
})
