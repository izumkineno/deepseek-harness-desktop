import path from 'node:path'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST
// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': '/src',
      '@dshmarket': path.resolve(__dirname, 'packages/dsh-market/src'),
      '@market-compat': path.resolve(__dirname, 'packages/market-compat/src'),
      '@desktop/market-compat': path.resolve(__dirname, 'packages/market-compat/src'),
    },
  },

  optimizeDeps: {
    exclude: [
      '@dshmarket/profile',
      '@dshmarket/registry',
      '@dshmarket/install',
      '@dshmarket/check',
      '@dshmarket/net',
      '@dshmarket/dsh-cli',
    ],
  },

  // Vite options tailored for Tauri development.
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}))
