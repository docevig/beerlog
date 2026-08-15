<script setup lang="ts">
import { computed } from 'vue'
import qrcode from 'qrcode-generator'

const props = defineProps<{ url: string }>()

/**
 * Код рисуем сами, картинкой из сервиса не подгружаем: приложение работает
 * в баре с плохой связью, а ссылка-приглашение — не тот адрес, который стоит
 * отдавать постороннему сервису.
 *
 * Уровень коррекции M: экран телефона читается легко, а запас в четверть
 * позволяет сканировать с бликами и под углом.
 */
const modules = computed(() => {
  const qr = qrcode(0, 'M')
  qr.addData(props.url)
  qr.make()

  const count = qr.getModuleCount()
  const rows: boolean[][] = []

  for (let row = 0; row < count; row++) {
    const cells: boolean[] = []
    for (let col = 0; col < count; col++) cells.push(qr.isDark(row, col))
    rows.push(cells)
  }

  return rows
})

/** Тихая зона по краям обязательна: без неё камера не находит код */
const QUIET = 2

const size = computed(() => modules.value.length + QUIET * 2)
</script>

<template>
  <svg
    class="qr"
    :viewBox="`0 0 ${size} ${size}`"
    shape-rendering="crispEdges"
    role="img"
    aria-label="код приглашения"
  >
    <rect :width="size" :height="size" fill="#F2E7D5" />
    <template v-for="(row, y) in modules" :key="y">
      <rect
        v-for="(dark, x) in row"
        v-show="dark"
        :key="x"
        :x="x + QUIET"
        :y="y + QUIET"
        width="1"
        height="1"
        fill="#14100C"
      />
    </template>
  </svg>
</template>

<style scoped>
.qr {
  width: 100%;
  max-width: 240px;
  align-self: center;
  border-radius: var(--radius);
}
</style>
