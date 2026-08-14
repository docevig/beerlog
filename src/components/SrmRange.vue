<script setup lang="ts">
import { computed } from 'vue'
import type { Entry } from '../types'
import { BEER_STYLES, findStyle, styleTitle } from '../data/styles'
import { srmColor } from '../lib/srm'

const props = defineProps<{ entries: Entry[] }>()

/**
 * Личная шкала SRM: все попробованные стили, разложенные от светлого
 * к тёмному. Показывает не «сколько выпито», а широту вкуса.
 */
const tried = computed(() => {
  const codes = [...new Set(props.entries.map((e) => e.style))]
  return codes
    .map((code) => ({ code, srm: findStyle(code)?.srm ?? 0 }))
    .filter((s) => s.srm > 0)
    .sort((a, b) => a.srm - b.srm)
})

/**
 * Подпись собирается без предлогов: «от пилснера до имперского стаута»
 * требует родительного падежа, а склонять названия стилей программно
 * надёжно нельзя — стрелка решает это без грамматики.
 */
const caption = computed(() => {
  if (tried.value.length === 0) return ''
  const lightest = styleTitle(tried.value[0].code).toLowerCase()
  if (tried.value.length === 1) return `пока только ${lightest}`
  const darkest = styleTitle(tried.value[tried.value.length - 1].code).toLowerCase()
  return `${lightest} → ${darkest}`
})
</script>

<template>
  <div v-if="tried.length" class="range">
    <div class="strip">
      <span
        v-for="(s, i) in tried"
        :key="s.code"
        class="sample"
        :style="{ background: srmColor(s.srm), animationDelay: `${i * 45}ms` }"
        :title="styleTitle(s.code)"
      />
    </div>
    <div class="caption">{{ caption }} · {{ tried.length }} из {{ BEER_STYLES.length }}</div>
  </div>
</template>

<style scoped>
.range {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.strip {
  display: flex;
  height: 28px;
  border-radius: 5px;
  overflow: hidden;
}
.sample {
  flex: 1;
  animation: rise 420ms cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
@keyframes rise {
  from {
    transform: scaleY(0.2);
    opacity: 0;
  }
}
.caption {
  font-size: 11px;
  color: var(--text-faint);
}
@media (prefers-reduced-motion: reduce) {
  .sample {
    animation: none;
  }
}
</style>
