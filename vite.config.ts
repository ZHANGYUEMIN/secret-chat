import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: { env: Record<string, string | undefined> }

// 部署到 GitHub Pages 时，base 需要是仓库名。
// 这里用环境变量自动注入，本地开发时为 "/"。
const base = process.env.VITE_BASE_PATH || '/'

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
