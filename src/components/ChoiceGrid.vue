<script setup lang="ts">
interface Option {
  value: string | number
  title: string
  hint?: string
}

defineProps<{
  options: Option[]
  modelValue: string | number | undefined
  columns?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string | number] }>()

function pick(value: string | number) {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="grid" :style="{ gridTemplateColumns: `repeat(${columns ?? 3}, 1fr)` }">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="cell"
      :class="{ active: opt.value === modelValue }"
      @click="pick(opt.value)"
    >
      <span class="title">{{ opt.title }}</span>
      <span v-if="opt.hint" class="hint">{{ opt.hint }}</span>
    </button>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  gap: 6px;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  border: 1px solid var(--section-bg);
  border-radius: var(--radius);
  background: var(--section-bg);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.cell.active {
  border-color: var(--button);
  background: color-mix(in srgb, var(--button) 12%, transparent);
  color: var(--button);
}
.title {
  font-size: 14px;
}
.hint {
  font-size: 11px;
  color: var(--hint);
}
.cell.active .hint {
  color: var(--button);
}
</style>
