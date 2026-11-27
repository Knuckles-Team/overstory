import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The page and the arbora host share one origin through this proxy, so the browser
// reaches the host-log routes exactly as a deployed page would: same origin, with the signed-in session cookie.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../../src', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    port: 5207,
    strictPort: true,
    proxy: { '/host/logs': { target: 'http://127.0.0.1:5209', changeOrigin: false } },
  },
})
