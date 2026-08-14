<script setup lang="ts">
import type { StyleShare } from '../lib/stats'
import { styleTitle } from '../data/styles'

defineProps<{ shares: StyleShare[] }>()
</script>

<template>
  <div class="bars">
    <div v-for="s in shares" :key="s.style" class="bar">
      <span class="name">{{ styleTitle(s.style) }}</span>
      <span class="track"><span class="fill" :style="{ width: `${Math.round(s.share * 100)}%` }" /></span>
      <span class="value">{{ Math.round(s.share * 100) }}%</span>
    </div>
  </div>
</template>

<style scoped>
.bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bar {
  display: grid;
  grid-template-columns: 96px 1fr 38px;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track {
  height: 8px;
  border-radius: 4px;
  background: var(--section-bg);
}
.fill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--button);
}
.value {
  color: var(--hint);
  text-align: right;
}
</style>
