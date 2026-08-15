<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Avatar from '../components/Avatar.vue'
import { useEntries } from '../store/entries'
import {
  apiAvailable,
  saveMyProfile,
  uploadAvatar,
  deleteAccount,
  forgetAvatar,
  createDonation,
} from '../lib/api'
import { compressImage } from '../lib/image'
import { parseVolume, volumeHint } from '../lib/volume'
import { VOLUME_PRESETS } from '../data/styles'
import { VALUE_LIMIT } from '../storage/types'
import { withPlural } from '../lib/format'
import { tg } from '../lib/telegram'

const props = defineProps<{
  meId: number
  /** Сколько записей ждут сети — про них человек должен знать здесь */
  waiting: number
  synced: boolean
  keys: number
}>()

const emit = defineEmits<{ close: []; flush: [] }>()

const { entries, profile, saveProfile } = useEntries()

/** Значки для аватарки: пивная тема плюс пара нейтральных, чтобы был выбор */
const ICONS = ['🍺', '🍻', '🍷', '🥃', '🌾', '🍋', '🔥', '🐻', '🐱', '🎸', '⚓', '🌙']

/** Цвета фона — те же, что у пива по шкале SRM, от светлого к тёмному */
const COLORS = ['#FFBF42', '#E58500', '#C35900', '#9B3200', '#5E0B00', '#36080A', '#0F6E56', '#185FA5']

const icon = ref(profile.value.avatarIcon ?? '')
const color = ref(profile.value.avatarColor ?? COLORS[1])
const name = ref(profile.value.displayName ?? '')

/** Три поля объёмов; пустое — значит вернуть зашитое значение */
const volumes = ref<string[]>(
  (profile.value.volumes ?? VOLUME_PRESETS).map((v) => String(v / 1000).replace('.', ',')),
)

const busy = ref('')
const failure = ref('')
const done = ref('')
const photoInput = ref<HTMLInputElement | null>(null)
const confirmingWipe = ref(false)

const badge = computed(() => (icon.value ? `${icon.value}|${color.value}` : null))

/** Старый клиент счёт не откроет, а вне Telegram платить попросту негде */
const canTip = computed(() => Boolean(tg()?.openInvoice) && apiAvailable())

const volumeHints = computed(() => volumes.value.map((v) => volumeHint(v)))

/**
 * Запас места в кружках, а не в ключах: «3 из 1024 ключей» — язык хранилища,
 * а человеку важно, что писать можно ещё очень долго.
 *
 * Считаем по своим же записям: средняя длина берётся из последних пятидесяти,
 * потому что она зависит от привычек — тот, кто заполняет название, пивоварню
 * и заметку, тратит символы вдвое быстрее любителя двух тапов.
 */
const capacity = computed(() => {
  const free = Math.max(0, 1024 - props.keys)

  const sample = entries.value.slice(-50)
  const average = sample.length ? JSON.stringify(sample).length / sample.length : 90
  const perKey = Math.max(1, Math.floor(VALUE_LIMIT / average))

  const total = free * perKey
  // Точность тут ни к чему: округляем до тысяч, чтобы читалось как оценка
  return total >= 10_000 ? Math.round(total / 1000) * 1000 : Math.round(total / 100) * 100
})

const storageLine = computed(
  () =>
    `в дневнике ${withPlural(entries.value.length, 'запись', 'записи', 'записей')} · влезет ещё около ${capacity.value.toLocaleString('ru-RU')}`,
)

/**
 * Техническая строка — для разбора жалоб, а не для чтения. Занятые ключи
 * хранилища тоже здесь: предел в 1024 недостижим на любом мыслимом темпе,
 * и выносить его в текст значит пугать цифрой, с которой нечего делать.
 */
const diagnostics = computed(() => {
  const app = tg()
  const parts = [`сборка ${__BUILD_ID__}`]

  if (app?.version) parts.push(`Telegram ${app.version}`)
  parts.push(`окно ${window.innerWidth}×${window.innerHeight}`)
  parts.push(withPlural(props.keys, 'ключ', 'ключа', 'ключей'))
  if (!props.synced) parts.push('без облака')

  return parts.join(' · ')
})

function flash(text: string) {
  done.value = text
  setTimeout(() => (done.value = ''), 2500)
}

async function applyProfile() {
  busy.value = 'profile'
  failure.value = ''

  try {
    profile.value = {
      ...profile.value,
      displayName: name.value.trim() || undefined,
      avatarIcon: icon.value || undefined,
      avatarColor: icon.value ? color.value : undefined,
    }
    await saveProfile()

    // Друзья видят имя и значок только через сервер — витрину обновляем сразу
    if (apiAvailable()) {
      await saveMyProfile({ name: name.value.trim() || null, avatar: badge.value })
      forgetAvatar(props.meId)
    }

    flash('сохранено')
  } catch (e) {
    failure.value = e instanceof Error ? e.message : 'не сохранилось'
  } finally {
    busy.value = ''
  }
}

async function onPhoto(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  busy.value = 'photo'
  failure.value = ''

  try {
    // Аватарке хватает маленькой стороны: она нигде не показывается крупнее 40 px
    const compressed = await compressImage(file, 200)
    await uploadAvatar(compressed.blob)

    // Фото важнее значка, иначе непонятно, что из двух показывать
    icon.value = ''
    profile.value = { ...profile.value, avatarIcon: undefined, avatarColor: undefined }
    await saveProfile()
    forgetAvatar(props.meId)

    flash('аватарка обновлена')
  } catch (e) {
    failure.value = e instanceof Error ? e.message : 'аватарка не загрузилась'
  } finally {
    busy.value = ''
    target.value = ''
  }
}

async function applyVolumes() {
  const parsed = volumes.value.map((v) => parseVolume(v)).filter((v): v is number => v !== undefined)

  busy.value = 'volumes'
  failure.value = ''

  try {
    // Меньше двух своих значений — толку нет, возвращаем зашитые
    profile.value = {
      ...profile.value,
      volumes: parsed.length >= 2 ? [...new Set(parsed)].sort((a, b) => a - b) : undefined,
    }
    await saveProfile()
    flash(parsed.length >= 2 ? 'объёмы сохранены' : 'вернули обычные объёмы')
  } catch (e) {
    failure.value = e instanceof Error ? e.message : 'не сохранилось'
  } finally {
    busy.value = ''
  }
}

function resetVolumes() {
  volumes.value = VOLUME_PRESETS.map((v) => String(v / 1000).replace('.', ','))
  void applyVolumes()
}

/**
 * Номиналы поддержки. Звёзды — внутренняя валюта Telegram, и платёж целиком
 * проходит внутри него: ни карты, ни имени, ни телефона никто не увидит.
 */
const TIPS = [25, 50, 100]

const tipped = ref(false)

async function tip(stars: number) {
  const app = tg()
  if (!app?.openInvoice || !apiAvailable()) return

  busy.value = `tip-${stars}`
  failure.value = ''

  try {
    const { link } = await createDonation(stars)

    app.openInvoice(link, (status) => {
      if (status === 'paid') {
        tipped.value = true
        flash('спасибо! 🍺')
      }
    })
  } catch (e) {
    failure.value = e instanceof Error ? e.message : 'счёт не открылся'
  } finally {
    busy.value = ''
  }
}

async function wipe() {
  if (!confirmingWipe.value) {
    confirmingWipe.value = true
    setTimeout(() => (confirmingWipe.value = false), 4000)
    return
  }

  confirmingWipe.value = false
  busy.value = 'wipe'
  failure.value = ''

  try {
    if (apiAvailable()) await deleteAccount()
    flash('данные на сервере стёрты')
  } catch (e) {
    failure.value = e instanceof Error ? e.message : 'не удалось стереть'
  } finally {
    busy.value = ''
  }
}

onMounted(() => {
  // Поля заполняются из профиля, а он мог догрузиться позже открытия экрана
  name.value = profile.value.displayName ?? ''
  icon.value = profile.value.avatarIcon ?? ''
  color.value = profile.value.avatarColor ?? COLORS[1]
})
</script>

<template>
  <div class="sheet" @click.self="emit('close')">
    <section class="panel">
      <header class="head">
        <span class="title">настройки</span>
        <button type="button" class="close" @click="emit('close')" aria-label="закрыть">✕</button>
      </header>

      <div class="block">
        <div class="eyebrow">как тебя видят</div>
        <div class="profile">
          <Avatar :tg-id="meId" :name="name || 'ты'" ring="var(--accent)" :avatar="badge" />
          <input v-model="name" class="input" maxlength="40" placeholder="имя" />
        </div>

        <div class="icons">
          <button
            v-for="i in ICONS"
            :key="i"
            type="button"
            class="icon"
            :class="{ on: icon === i }"
            @click="icon = icon === i ? '' : i"
          >
            {{ i }}
          </button>
        </div>

        <div v-if="icon" class="colors">
          <button
            v-for="c in COLORS"
            :key="c"
            type="button"
            class="color"
            :class="{ on: color === c }"
            :style="{ background: c }"
            @click="color = c"
          />
        </div>

        <div class="row">
          <button type="button" class="primary" :disabled="busy === 'profile'" @click="applyProfile">
            {{ busy === 'profile' ? 'сохраняем…' : 'сохранить' }}
          </button>
          <button
            type="button"
            class="link"
            :disabled="busy === 'photo' || !apiAvailable()"
            @click="photoInput?.click()"
          >
            {{ busy === 'photo' ? 'загружаем…' : 'загрузить фото' }}
          </button>
        </div>

        <input ref="photoInput" type="file" accept="image/*" class="hidden" @change="onPhoto" />
      </div>

      <div class="block">
        <div class="eyebrow">свои объёмы</div>
        <div class="volumes">
          <label v-for="(_, i) in volumes" :key="i" class="volume">
            <input v-model="volumes[i]" type="text" inputmode="decimal" class="input" />
            <span class="hint">{{ volumeHints[i] || 'пусто' }}</span>
          </label>
        </div>
        <div class="row">
          <button type="button" class="primary" :disabled="busy === 'volumes'" @click="applyVolumes">
            сохранить
          </button>
          <button type="button" class="link" @click="resetVolumes">вернуть обычные</button>
        </div>
      </div>

      <div class="block">
        <div class="eyebrow">синхронизация</div>
        <p class="text">
          <template v-if="!synced">данные лежат только на этом устройстве</template>
          <template v-else-if="waiting > 0">
            {{ withPlural(waiting, 'запись ждёт', 'записи ждут', 'записей ждут') }} сети
          </template>
          <template v-else>всё уехало в облако</template>
        </p>
        <button v-if="waiting > 0" type="button" class="link" @click="emit('flush')">дослать сейчас</button>
      </div>

      <div v-if="canTip" class="block">
        <div class="eyebrow">создателю на пиво</div>
        <p class="text">
          <template v-if="tipped">уже угостил — спасибо, зачтётся 🍺</template>
          <template v-else>если приложение пригодилось, можно скинуться звёздами</template>
        </p>
        <div class="tips">
          <button
            v-for="stars in TIPS"
            :key="stars"
            type="button"
            class="tip"
            :disabled="busy === `tip-${stars}`"
            @click="tip(stars)"
          >
            {{ busy === `tip-${stars}` ? '…' : `★ ${stars}` }}
          </button>
        </div>
      </div>

      <div class="block">
        <div class="eyebrow">о приложении</div>
        <p class="text">
          Дневник хранится в Telegram и привязан к твоему аккаунту: он переживёт переустановку
          и виден с любого устройства. На сервер уезжают только итоги месяца, общие вечера
          и снимки этикеток — чтобы их видели друзья.
        </p>
        <p class="text">{{ storageLine }}</p>
        <p class="tech">{{ diagnostics }}</p>

        <button type="button" class="danger" :disabled="busy === 'wipe'" @click="wipe">
          {{ confirmingWipe ? 'точно? нажми ещё раз' : 'стереть мои данные' }}
        </button>
        <p class="hint">
          сотрёт витрину, вечера, друзей и снимки. Дневник останется в Telegram — его чистит
          только сам Telegram
        </p>
      </div>

      <p v-if="failure" class="failure">{{ failure }}</p>
      <p v-if="done" class="done">{{ done }}</p>
    </section>
  </div>
</template>

<style scoped>
.sheet {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10px;
  background: rgba(10, 8, 6, 0.72);
  overflow-y: auto;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  max-width: 520px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--bg);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  color: var(--accent-bright);
}
.close {
  padding: 4px 8px;
  border: 0;
  background: none;
  color: var(--text-faint);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.profile {
  display: flex;
  align-items: center;
  gap: 10px;
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
.icons {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}
.icon {
  padding: 7px 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: none;
  font-size: 19px;
  line-height: 1;
  cursor: pointer;
}
.icon.on {
  border-color: var(--accent);
  background: var(--surface-high);
}
.colors {
  display: flex;
  gap: 7px;
}
.color {
  width: 28px;
  height: 28px;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}
.color.on {
  border-color: var(--text);
}
.tips {
  display: flex;
  gap: 8px;
}
.tip {
  padding: 9px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: none;
  color: var(--accent-bright);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.tip:disabled {
  opacity: 0.6;
  cursor: default;
}
.volumes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
}
.volume {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.primary {
  padding: 9px 18px;
  border: 0;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.6;
  cursor: default;
}
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-bright);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.link:disabled {
  opacity: 0.5;
  cursor: default;
}
.danger {
  align-self: flex-start;
  padding: 9px 14px;
  border: 1px solid #7B1A00;
  border-radius: var(--radius);
  background: none;
  color: #E58500;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.text {
  margin: 0;
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1.45;
}
.hint,
.tech {
  margin: 0;
  color: var(--text-faint);
  font-size: 11px;
  line-height: 1.4;
}
.failure {
  margin: 0;
  color: #E58500;
  font-size: 13px;
}
.done {
  margin: 0;
  color: var(--accent-bright);
  font-size: 13px;
}
.hidden {
  display: none;
}
</style>
