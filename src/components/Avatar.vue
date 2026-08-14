<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { loadAvatar } from '../lib/api'

const props = defineProps<{
  tgId: number
  name: string
  /** Цвет обводки — средний оттенок месяца по шкале SRM */
  ring: string
}>()

const src = ref<string | null>(null)

/**
 * Фото всегда берём у своего сервера.
 *
 * Ссылка, которую Telegram кладёт в данные входа, ведёт на автоматическую
 * заглушку с инициалами: она успешно загружается, поэтому подмену нельзя
 * заметить по ошибке картинки — только не использовать её вовсе.
 */
async function fetchPhoto() {
  if (!props.tgId) return
  src.value = await loadAvatar(props.tgId)
}

function onImageError() {
  src.value = null
}

onMounted(fetchPhoto)
watch(() => props.tgId, fetchPhoto)

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?'
</script>

<template>
  <span class="avatar" :style="{ borderColor: ring }">
    <img v-if="src" :src="src" :alt="name" @error="onImageError" />
    <span v-else class="initial">{{ initial(name) }}</span>
  </span>
</template>

<style scoped>
.avatar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 2px solid var(--line);
  border-radius: 50%;
  overflow: hidden;
  background: var(--surface);
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.initial {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
  color: var(--text-dim);
}
</style>
