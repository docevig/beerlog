/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * Метка сборки. Нужна для разбора жалоб: Telegram держит мини-приложение
 * в кэше подолгу, и «глючит» чаще всего означает «открыта вчерашняя версия».
 * По метке в справке сразу видно, обновился клиент или нет.
 */
const BUILD_ID = new Date().toISOString().slice(0, 16).replace('T', ' ')

export default defineConfig({
  // GitHub Pages раздаёт репозиторий по пути /beerlog/, а не из корня домена
  base: '/beerlog/',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
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
