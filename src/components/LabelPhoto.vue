<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { loadPhoto, uploadPhoto, deletePhoto, apiAvailable } from '../lib/api'
import { compressImage } from '../lib/image'

const props = defineProps<{
  /** Ключ сорта — к нему привязывается снимок */
  beerKey: string
  fileId?: string | null
}>()

const emit = defineEmits<{ uploaded: [fileId: string]; removed: [] }>()

const src = ref<string | null>(null)
const busy = ref(false)
const failure = ref('')
const input = ref<HTMLInputElement | null>(null)

/** Снимок стирается вторым нажатием — как вечер в списке вечеринок */
const confirming = ref(false)

async function show() {
  if (!props.fileId) {
    src.value = null
    return
  }
  src.value = await loadPhoto(props.fileId)
}

async function onFile(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  busy.value = true
  failure.value = ''

  try {
    // Сжимаем до отправки: снимок с камеры весит в тридцать раз больше нужного
    const compressed = await compressImage(file)
    const { fileId } = await uploadPhoto(props.beerKey, compressed.blob)

    src.value = URL.createObjectURL(compressed.blob)
    emit('uploaded', fileId)
  } catch (e) {
    failure.value = e instanceof Error ? e.message : 'снимок не загрузился'
  } finally {
    busy.value = false
    target.value = ''
  }
}

async function drop() {
  if (!props.fileId) return

  if (!confirming.value) {
    confirming.value = true
    setTimeout(() => (confirming.value = false), 3000)
    return
  }

  confirming.value = false
  busy.value = true
  failure.value = ''

  try {
    await deletePhoto(props.fileId)
    src.value = null
    emit('removed')
  } catch (e) {
    failure.value = e instanceof Error ? e.message : 'снимок не удалился'
  } finally {
    busy.value = false
  }
}

onMounted(show)
watch(() => props.fileId, show)
</script>

<template>
  <div class="label-photo">
    <template v-if="src">
      <img :src="src" alt="этикетка" class="shot" @click="input?.click()" />
      <div class="under">
        <button type="button" class="link" :disabled="busy" @click="drop">
          {{ confirming ? 'точно? нажми ещё раз' : 'убрать этикетку' }}
        </button>
        <span class="hint">тап по снимку — переснять</span>
      </div>
    </template>

    <button v-else type="button" class="add" :disabled="busy || !apiAvailable()" @click="input?.click()">
      {{ busy ? 'загружаем…' : 'снять этикетку' }}
    </button>

    <input
      ref="input"
      type="file"
      accept="image/*"
      capture="environment"
      class="hidden"
      @change="onFile"
    />

    <p v-if="failure" class="failure">{{ failure }}</p>
  </div>
</template>

<style scoped>
.label-photo {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.shot {
  width: 100%;
  max-height: 220px;
  object-fit: cover;
  border-radius: var(--radius);
  cursor: pointer;
}
.add {
  padding: 10px;
  border: 1px dashed var(--line);
  border-radius: var(--radius);
  background: none;
  color: var(--text-dim);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.add:disabled {
  opacity: 0.5;
  cursor: default;
}
.under {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-dim);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.link:disabled {
  opacity: 0.5;
  cursor: default;
}
.hint {
  font-size: 11px;
  color: var(--text-faint);
}
.failure {
  margin: 0;
  font-size: 12px;
  color: var(--text-faint);
}
.hidden {
  display: none;
}
</style>
