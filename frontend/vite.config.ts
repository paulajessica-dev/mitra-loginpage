import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  // Proxy de desenvolvimento (equivale ao proxy.conf.json do Angular):
  // toda chamada a /mge e repassada ao Sankhya, resolvendo mixed-content/CORS em dev.
  server: {
    proxy: {
      '/mge': {
        target: 'http://calviva.nuvemdatacom.com.br:9860',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
})
