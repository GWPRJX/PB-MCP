import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/dashboard/',
  server: {
    port: 5173,
    proxy: {
      '/admin': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
  },
})
