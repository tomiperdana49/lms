import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/simas/books': {
        target: 'https://simas.nusa.id',
        changeOrigin: true,
        rewrite: () => '/api/v2/book?hasHolder=false',
        configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
                // Ensure the API key is passed correctly on proxy
                // The actual value would come from env ideally, but for dev proxy hardcoding is fine
                proxyReq.setHeader('x-api-key', 'k0fipxf232vbm0q4fcszt81975s2qptsxwyr7hi3f9l1gdclfl77p28zuu3l0jd9');
            });
        }
      }
    }
  }
})
