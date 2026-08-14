<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { loadAvatar } from '../lib/api'

const props = defineProps<{
  tgId: number
  name: string
  /** Цвет обводки — средний оттенок месяца по шкале SRM */
  ring: string
  /** Выбранный значок в виде «🍺|#E58500» — показывается вместо фото */
  avatar?: string | null
  /** Есть ли у человека своё фото: без этого не ходим за ним впустую */
  hasPhoto?: boolean
}>()

const src = ref<string | null>(null)

/** Значок разбираем сами: строка приходит с сервера одним полем */
const badge = computed(() => {
  const [icon, color] = (props.avatar ?? '').split('|')
  return icon && color ? { icon, color } : null
})

/**
 * Цвета заглушек. У большинства фото закрыто настройками приватности,
 * поэтому кружок с буквой — обычное состояние, а не исключение:
 * пусть он хотя бы будет узнаваемым.
 */
const PLACEHOLDER_COLORS = [
  { bg: '#8E2900', ink: '#FFD9B8' },
  { bg: '#0F6E56', ink: '#CFF3E6' },
  { bg: '#534AB7', ink: '#DCD9FA' },
  { bg: '#993C1D', ink: '#FFDCCB' },
  { bg: '#185FA5', ink: '#CFE4FB' },
  { bg: '#993556', ink: '#FBD5E2' },
  { bg: '#3B6D11', ink: '#DCF0C2' },
  { bg: '#854F0B', ink: '#FBE3BC' },
]

/** Цвет закреплён за человеком: один и тот же id всегда даёт один оттенок */
const palette = computed(() => PLACEHOLDER_COLORS[Math.abs(props.tgId) % PLACEHOLDER_COLORS.length])

/**
 * Фото всегда берём у своего сервера.
 *
 * Ссылка, которую Telegram кладёт в данные входа, ведёт на автоматическую
 * заглушку с инициалами: она успешно загружается, поэтому подмену нельзя
 * заметить по ошибке картинки — только не использовать её вовсе.
 */
async function fetchPhoto() {
  // Значок рисуется на месте, а за фото ходим только если оно есть
  if (!props.tgId || badge.value || props.hasPhoto === false) {
    src.value = null
    return
  }

  src.value = await loadAvatar(props.tgId)
}

function onImageError() {
  src.value = null
}

onMounted(fetchPhoto)
watch(() => [props.tgId, props.avatar, props.hasPhoto], fetchPhoto)

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?'
</script>

<template>
  <span
    class="avatar"
    :style="{ borderColor: ring, background: badge ? badge.color : src ? undefined : palette.bg }"
  >
    <span v-if="badge" class="badge">{{ badge.icon }}</span>
    <img v-else-if="src" :src="src" :alt="name" @error="onImageError" />
    <span v-else class="initial" :style="{ color: palette.ink }">{{ initial(name) }}</span>
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
}
.badge {
  font-size: 19px;
  line-height: 1;
}
</style>
