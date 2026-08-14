<script setup lang="ts">
export interface Choice {
  value: string | number
  title: string
  hint?: string
  /** Заливка цветом напитка; если не задана — нейтральная кнопка */
  fill?: string
  ink?: string
  subInk?: string
}

defineProps<{
  options: Choice[]
  modelValue: string | number | undefined
  columns?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()
</script>

<template>
  <div class="grid" :style="{ gridTemplateColumns: `repeat(${columns ?? 3}, minmax(0, 1fr))` }">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="cell"
      :class="{ active: opt.value === modelValue, filled: !!opt.fill }"
      :style="opt.fill ? { background: opt.fill, color: opt.ink } : undefined"
      @click="emit('update:modelValue', opt.value)"
    >
      <span class="title">{{ opt.title }}</span>
      <span v-if="opt.hint" class="hint" :style="opt.subInk ? { color: opt.subInk } : undefined">{{ opt.hint }}</span>
    </button>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  gap: 5px;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-dim);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cell.filled {
  border-color: transparent;
}
/* Выбранное кольцо не перекрашивает пиво, а обводит его */
.cell.active {
  box-shadow: 0 0 0 2px var(--accent-bright);
}
.cell.active:not(.filled) {
  border-color: var(--accent);
  color: var(--accent-bright);
}
.title {
  font-size: 13px;
}
.hint {
  font-size: 10px;
  color: var(--text-faint);
}
</style>
