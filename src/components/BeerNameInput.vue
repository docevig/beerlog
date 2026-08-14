<script setup lang="ts">
import { ref, computed } from 'vue'
import { suggest, type KnownBeer } from '../lib/catalog'
import { styleTitle } from '../data/styles'
import { styleColor } from '../lib/srm'

const props = defineProps<{ modelValue: string; catalog: KnownBeer[] }>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** Выбран знакомый сорт — вместе с ним подставляются стиль и объём */
  pick: [beer: KnownBeer]
}>()

const focused = ref(false)

/** Подсказки прячем, когда введённое уже точно совпало с сортом */
const hints = computed(() => {
  if (!focused.value) return []
  const found = suggest(props.catalog, props.modelValue)
  if (found.length === 1 && found[0].name.toLowerCase() === props.modelValue.trim().toLowerCase()) return []
  return found
})

/** Закрываем с задержкой: иначе список исчезнет раньше, чем сработает выбор */
function closeSoon() {
  setTimeout(() => (focused.value = false), 150)
}

function choose(beer: KnownBeer) {
  emit('update:modelValue', beer.name)
  emit('pick', beer)
  focused.value = false
}
</script>

<template>
  <div class="wrap">
    <input
      :value="modelValue"
      class="input"
      placeholder="название"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @focus="focused = true"
      @blur="closeSoon"
    />

    <div v-if="hints.length" class="hints">
      <button v-for="beer in hints" :key="beer.name" type="button" class="hint" @mousedown.prevent="choose(beer)">
        <span class="swatch" :style="{ background: styleColor(beer.style) }" />
        <span class="hint-body">
          <span class="hint-name">{{ beer.name }}</span>
          <span class="hint-meta">
            {{ styleTitle(beer.style) }}<template v-if="beer.brewery"> · {{ beer.brewery }}</template>
            <template v-if="beer.times > 1"> · брал {{ beer.times }} раза</template>
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
}
.input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.input::placeholder {
  color: var(--text-faint);
}
/* Подсказки поверх формы: они не должны толкать поля вниз при вводе */
.hints {
  position: absolute;
  z-index: 5;
  left: 0;
  right: 0;
  top: calc(100% + 4px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface-high);
  overflow: hidden;
}
.hint {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.hint:last-child {
  border-bottom: 0;
}
.swatch {
  flex: none;
  width: 4px;
  height: 26px;
  border-radius: 2px;
}
.hint-body {
  display: flex;
  flex-direction: column;
}
.hint-name {
  font-size: 14px;
}
.hint-meta {
  font-size: 11px;
  color: var(--text-faint);
}
</style>
