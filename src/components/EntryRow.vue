<script setup lang="ts">
import type { Entry } from '../types'
import { styleTitle } from '../data/styles'
import { formatPortion, formatTime } from '../lib/format'

defineProps<{ entry: Entry }>()
const emit = defineEmits<{ edit: [id: string]; remove: [id: string] }>()
</script>

<template>
  <div class="row">
    <button type="button" class="main" @click="emit('edit', entry.id)">
      <span class="title">
        {{ entry.name || styleTitle(entry.style) }}
        <span class="portion">{{ formatPortion(entry.ml) }}</span>
      </span>
      <span v-if="entry.name" class="sub">{{ styleTitle(entry.style) }}</span>
    </button>
    <span class="time">{{ formatTime(entry.ts) }}</span>
    <button type="button" class="remove" aria-label="удалить" @click="emit('remove', entry.id)">×</button>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--section-bg);
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.title {
  font-size: 15px;
}
.portion {
  color: var(--hint);
}
.sub {
  font-size: 12px;
  color: var(--hint);
}
.time {
  font-size: 12px;
  color: var(--hint);
}
.remove {
  padding: 2px 6px;
  border: 0;
  background: none;
  color: var(--hint);
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
</style>
