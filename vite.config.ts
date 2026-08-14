/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // GitHub Pages раздаёт репозиторий по пути /beerlog/, а не из корня домена
  base: '/beerlog/',
  plugins: [vue()],
  server: {
    // По умолчанию Vite поднимается только на ::1, и инструменты,
    // которые ходят по 127.0.0.1, до него не достучатся
    host: '127.0.0.1',
    port: 5174,
  },
  test: {
    environment: 'node',
  },
})
