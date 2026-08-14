<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { StyleShare } from '../lib/stats'
import { styleTitle } from '../data/styles'
import { styleColor } from '../lib/srm'

defineProps<{ shares: StyleShare[] }>()

/** Столбики вырастают из нуля при появлении вкладки */
const grown = ref(false)
onMounted(() => requestAnimationFrame(() => (grown.value = true)))
</script>

<template>
  <div class="bars">
    <div v-for="(s, i) in shares" :key="s.style" class="bar">
      <span class="name">{{ styleTitle(s.style) }}</span>
      <span class="track">
        <span
          class="fill"
          :style="{
            width: grown ? `${Math.round(s.share * 100)}%` : '0%',
            background: styleColor(s.style),
            transitionDelay: `${i * 60}ms`,
          }"
        />
      </span>
      <span class="value">{{ Math.round(s.share * 100) }}%</span>
    </div>
  </div>
</template>

<style scoped>
.bars {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.bar {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) 36px;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-dim);
}
.track {
  height: 9px;
  border-radius: 3px;
  background: var(--surface-high);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width 620ms cubic-bezier(0.22, 1, 0.36, 1);
}
.value {
  color: var(--text-faint);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
