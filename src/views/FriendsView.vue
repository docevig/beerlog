<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useEntries } from '../store/entries'
import {
  apiAvailable,
  fetchFriends,
  createInvite,
  inviteLink,
  pushTotals,
  removeFriend as removeFriendApi,
  type FriendTotals,
} from '../lib/api'
import { totalMl, distinctStyles, styleBreakdown } from '../lib/stats'
import { findStyle, styleTitle } from '../data/styles'
import { srmColor, styleColor, textOn } from '../lib/srm'
import { dayKey } from '../lib/day'
import { formatLitres, formatDay, withPlural } from '../lib/format'
import { tg } from '../lib/telegram'
import PartiesSection from '../components/PartiesSection.vue'
import Avatar from '../components/Avatar.vue'
import { useFriendNames } from '../store/friends'
import { useParty } from '../store/party'

const { entries, profile, saveProfile } = useEntries()
// Свои имена друзей живут в одном месте: их читают и стол вечера, и статистика
const { nameOf, rename } = useFriendNames()
// Пока вечер идёт, стол важнее списка друзей и показывается первым

const { active: activeParty } = useParty()

const isDev = import.meta.env.DEV
const friends = ref<FriendTotals[]>([])

/** Только чтобы подписать «ты» в списке; правами это не управляет */
const myId = tg()?.initDataUnsafe?.user?.id ?? 0
const myInitial = (tg()?.initDataUnsafe?.user?.first_name ?? 'я').trim().charAt(0).toUpperCase()
const loading = ref(false)
const failure = ref('')
const inviting = ref(false)

const now = new Date()
const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

/** Месяц или вся история: в начале месяца сравнивать особо нечего */
const scope = ref<'month' | 'all'>('month')

async function setScope(next: 'month' | 'all') {
  if (scope.value === next) return
  scope.value = next
  openId.value = null
  await load()
}

/** Своя выборка следует за переключателем: сравнение должно быть за один период */
const monthEntries = computed(() => {
  if (scope.value === 'all') return entries.value
  return entries.value.filter((e) => {
    const [y, m] = dayKey(e.ts).split('-').map(Number)
    return `${y}-${String(m).padStart(2, '0')}` === period
  })
})

/** Средний цвет месяца — та же мера, по которой сравниваются вкусы */
const myAvgSrm = computed(() => {
  let weighted = 0
  let volume = 0
  for (const e of monthEntries.value) {
    const srm = findStyle(e.style)?.srm
    if (srm === undefined) continue
    weighted += srm * e.ml
    volume += e.ml
  }
  return volume ? weighted / volume : 0
})

/** Мои стили месяца — вторая половина сравнения вкусов */
const myStyles = computed(() => [...new Set(monthEntries.value.map((e) => e.style))])

const mine = computed(() => ({
  styles: distinctStyles(monthEntries.value),
  ml: totalMl(monthEntries.value),
  avgSrm: myAvgSrm.value,
  topStyle: styleBreakdown(monthEntries.value)[0]?.style,
}))

/** Свой значок собираем из профиля: на сервер за собственной аватаркой не ходим */
const myBadge = computed(() =>
  profile.value.avatarIcon ? `${profile.value.avatarIcon}|${profile.value.avatarColor ?? '#E58500'}` : null,
)

const openId = ref<number | null>(null)

function toggle(id: number) {
  openId.value = openId.value === id ? null : id
}

interface TasteCompare {
  common: string[]
  onlyTheirs: string[]
  onlyMine: string[]
}

/**
 * Сравнение вкусов, а не объёмов: что вы оба берёте, что есть у него
 * и чего нет у тебя — последнее и есть повод попробовать новое.
 */
function compareTastes(friend: FriendTotals): TasteCompare {
  let theirs: string[] = []
  try {
    // За всё время сервер склеивает месяцы через «|» — разбираем каждый кусок
    const chunks = (friend.styles_list || '[]').split('|')
    const collected = chunks.flatMap((chunk) => {
      const parsed = JSON.parse(chunk || '[]')
      return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : []
    })
    theirs = [...new Set(collected)]
  } catch {
    theirs = []
  }

  const mineSet = new Set(myStyles.value)
  const theirSet = new Set(theirs)

  return {
    common: theirs.filter((s) => mineSet.has(s)),
    onlyTheirs: theirs.filter((s) => !mineSet.has(s)),
    onlyMine: myStyles.value.filter((s) => !theirSet.has(s)),
  }
}

/**
 * Порядок — по имени, не по литрам. Список, отсортированный по объёму,
 * читается как турнирная таблица, даже если нигде не написано «место».
 */
const sortedFriends = computed(() =>
  [...friends.value].sort((a, b) => displayName(a).localeCompare(displayName(b), 'ru')),
)

/** Поиск нужен не всем: до полутора десятков имён он только занимает место */
const SEARCH_FROM = 15

/** Сколько показываем, пока список не развернули */
const PREVIEW = 10

const query = ref('')
const expanded = ref(false)

const foundFriends = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return sortedFriends.value
  return sortedFriends.value.filter((f) => displayName(f).toLowerCase().includes(needle))
})

/** При поиске показываем всё найденное: прятать результаты поиска бессмысленно */
const shownFriends = computed(() =>
  expanded.value || query.value.trim() ? foundFriends.value : foundFriends.value.slice(0, PREVIEW),
)

const hiddenCount = computed(() => foundFriends.value.length - shownFriends.value.length)

/** Кого можно позвать на вечер — с теми же именами, что в списке компании */
const summonList = computed(() =>
  sortedFriends.value.map((f) => ({ tg_id: f.tg_id, name: displayName(f) })),
)

/**
 * Вне Telegram сервер недоступен по определению — подписи нет.
 * В режиме разработки показываем пример, чтобы экран можно было
 * верстать и обсуждать в браузере; в сборке для прода этого нет.
 */
const DEMO_FRIENDS: FriendTotals[] = [
  {
    tg_id: 1,
    name: 'Паша',
    avatar: null,
      has_photo: 0,
    ml: 4200,
    portions: 9,
    styles: 5,
    avg_srm: 7,
    styles_list: '["ipa","lager","neipa","gose","apa"]',
    styles_first: '{"ipa":1750000000000,"lager":1740000000000}',
    updated_at: Date.now() - 3 * 3600_000,
    evenings: 8,
    last_evening: Date.now() - 3 * 86400_000,
  },
  {
    tg_id: 2,
    name: 'Марина',
    avatar: null,
      has_photo: 0,
    ml: 1800,
    portions: 4,
    styles: 4,
    avg_srm: 24,
    styles_list: '["stout","porter","bock","sour"]',
    styles_first: '{"stout":1700000000000}',
    updated_at: Date.now() - 9 * 86400_000,
    evenings: 5,
    last_evening: Date.now() - 11 * 86400_000,
  },
  {
    tg_id: 3,
    name: 'Костя',
    avatar: null,
      has_photo: 0,
    ml: 6100,
    portions: 13,
    styles: 2,
    avg_srm: 4,
    styles_list: '["lager","pilsner"]',
    styles_first: '{"lager":1730000000000}',
    updated_at: 0,
    evenings: 0,
    last_evening: 0,
  },
]

async function load() {
  if (!apiAvailable()) {
    if (import.meta.env.DEV) friends.value = DEMO_FRIENDS
    return
  }

  loading.value = true
  failure.value = ''

  try {
    /*
      Витрину отправляем, но не ждём: она нужна друзьям, а не этому экрану —
      свои цифры берутся из локальной истории. Ожидание удваивало задержку.
    */
    void pushTotals({
      period,
      ml: mine.value.ml,
      portions: monthEntries.value.length,
      styles: mine.value.styles,
      avgSrm: mine.value.avgSrm,
      stylesList: myStyles.value,
      stylesFirst: myFirsts.value,
    }).catch(() => {})

    friends.value = (await fetchFriends(scope.value === 'all' ? 'all' : period)).friends
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function invite() {
  inviting.value = true
  failure.value = ''

  try {
    const { code } = await createInvite()
    const link = inviteLink(code)
    const text = 'веду дневник пива, давай сравним — ссылка живёт сутки'
    const app = tg()
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`
    if (app) app.openTelegramLink(url)
    else window.open(url, '_blank')
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
  } finally {
    inviting.value = false
  }
}

onMounted(load)

function chipStyle(code: string) {
  return { background: styleColor(code), color: textOn(code) }
}

/** Доля общих стилей от объединения — одна цифра вместо трёх списков */
function matchPercent(friend: FriendTotals): number | null {
  const c = compareTastes(friend)
  const union = c.common.length + c.onlyTheirs.length + c.onlyMine.length
  if (union === 0) return null
  return Math.round((c.common.length / union) * 100)
}

/** Мои даты первого раза по каждому стилю */
const myFirsts = computed(() => {
  const first: Record<string, number> = {}
  for (const e of entries.value) {
    if (first[e.style] === undefined || e.ts < first[e.style]) first[e.style] = e.ts
  }
  return first
})

/** Кто раньше открыл общий стиль — забавная деталь про вкусы */
function pioneer(friend: FriendTotals): string {
  let theirFirst: Record<string, number> = {}
  try {
    theirFirst = JSON.parse(friend.styles_first || '{}')
  } catch {
    return ''
  }

  for (const style of compareTastes(friend).common) {
    const mine = myFirsts.value[style]
    const theirs = theirFirst[style]
    if (!mine || !theirs) continue
    const title = styleTitle(style).toLowerCase()
    if (mine < theirs) return `${title} ты попробовал раньше`
    if (theirs < mine) return `${title} он попробовал раньше`
  }
  return ''
}

/** Свежесть витрины: иначе непонятно, почему у человека ноль */
function freshness(friend: FriendTotals): string {
  if (!friend.updated_at) return 'ещё ни разу не заходил'
  const days = Math.floor((Date.now() - friend.updated_at) / 86_400_000)
  if (days === 0) return 'обновлено сегодня'
  if (days === 1) return 'обновлено вчера'
  return `обновлено ${formatDay(dayKey(friend.updated_at))}`
}

/** Имя, под которым ты сам подписал человека, иначе — из его профиля */
function displayName(friend: FriendTotals): string {
  return nameOf(friend.tg_id, friend.name)
}

const renamingId = ref<number | null>(null)
const draftName = ref('')

function startRename(friend: FriendTotals) {
  renamingId.value = friend.tg_id
  draftName.value = displayName(friend)
}

async function saveName(friend: FriendTotals) {
  const next = draftName.value.trim()

  // Совпало с тем, как человек назвался сам — своё имя ни к чему
  const names = rename(friend.tg_id, next === friend.name ? '' : next)

  profile.value = { ...profile.value, friendNames: names }
  await saveProfile()
  renamingId.value = null
}

async function unfriend(friend: FriendTotals) {
  try {
    await removeFriendApi(friend.tg_id)
    friends.value = friends.value.filter((f) => f.tg_id !== friend.tg_id)
    openId.value = null
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
  }
}

/** Насколько крепче или мягче пьёт друг — по среднему градусу цвета */
function tasteHint(friend: FriendTotals): string {
  const diff = friend.avg_srm - mine.value.avgSrm
  if (!friend.avg_srm || !mine.value.avgSrm) return ''
  if (Math.abs(diff) < 2) return 'вкусы сходятся'
  return diff > 0 ? 'берёт темнее' : 'берёт светлее'
}
</script>

<template>
  <section class="view">
    <div v-if="!apiAvailable() && !isDev" class="empty">
      <p class="empty-title">компания живёт в Telegram</p>
      <p class="empty-body">открой приложение через бота — в браузере друзья недоступны, там некому подтвердить, что это ты</p>
    </div>

    <template v-else>
      <p v-if="!apiAvailable()" class="demo">это пример: вне Telegram сервер недоступен</p>
      <p v-if="loading" class="hint">спрашиваем сервер…</p>
      <p v-else-if="failure" class="hint">{{ failure }}</p>

      <div v-if="sortedFriends.length" class="list">
        <div class="period">
          <div class="eyebrow">компания</div>
          <div class="switch">
            <button type="button" :class="{ on: scope === 'month' }" @click="setScope('month')">месяц</button>
            <button type="button" :class="{ on: scope === 'all' }" @click="setScope('all')">всё время</button>
          </div>
        </div>

        <!-- Поиск появляется только когда список стал длинным -->
        <input
          v-if="sortedFriends.length > SEARCH_FROM"
          v-model="query"
          class="search"
          type="search"
          placeholder="найти по имени"
        />

        <!-- Свои цифры стоят в том же списке: это точка отсчёта для сравнения,
             а не второй экран итогов -->
        <div class="friend self">
          <div class="friend-head static">
            <Avatar
              :tg-id="myId"
              :name="profile.displayName || myInitial"
              :ring="srmColor(mine.avgSrm || 4)"
              :avatar="myBadge"
            />
            <span class="friend-body">
              <span class="friend-name">ты</span>
              <span class="friend-numbers">
                {{ withPlural(mine.styles, 'стиль', 'стиля', 'стилей') }} · {{ formatLitres(mine.ml) }}
              </span>
              <span v-if="mine.topStyle" class="friend-taste">
                чаще всего — {{ styleTitle(mine.topStyle).toLowerCase() }}
              </span>
            </span>
          </div>
        </div>
        <div v-for="f in shownFriends" :key="f.tg_id" class="friend">
          <button type="button" class="friend-head" @click="toggle(f.tg_id)">
            <!-- Обводка аватара — средний цвет месяца: вкус виден до раскрытия -->
            <Avatar
              :tg-id="f.tg_id"
              :name="displayName(f)"
              :ring="srmColor(f.avg_srm || 4)"
              :avatar="f.avatar"
              :has-photo="Boolean(f.has_photo)"
            />
            <span class="friend-body">
              <span class="friend-name">{{ displayName(f) }}</span>
              <span class="friend-numbers">
                {{ withPlural(f.styles, 'стиль', 'стиля', 'стилей') }} · {{ formatLitres(f.ml) }}
              </span>
              <span v-if="tasteHint(f)" class="friend-taste">{{ tasteHint(f) }}</span>
            </span>
            <span class="chevron" :class="{ turned: openId === f.tg_id }">⌄</span>
          </button>

          <Transition name="compare">
            <div v-if="openId === f.tg_id" class="compare">
              <div class="scale">
                <span class="scale-label">ты</span>
                <span class="scale-chip" :style="{ background: srmColor(mine.avgSrm || 4) }" />
                <span class="scale-label">{{ f.name }}</span>
                <span class="scale-chip" :style="{ background: srmColor(f.avg_srm || 4) }" />
              </div>

              <div v-if="compareTastes(f).common.length" class="row">
                <span class="row-label">оба берёте</span>
                <span class="chips">
                  <span v-for="s in compareTastes(f).common" :key="s" class="chip" :style="chipStyle(s)">
                    {{ styleTitle(s) }}
                  </span>
                </span>
              </div>

              <div v-if="compareTastes(f).onlyTheirs.length" class="row">
                <span class="row-label">есть у него, нет у тебя</span>
                <span class="chips">
                  <span v-for="s in compareTastes(f).onlyTheirs" :key="s" class="chip" :style="chipStyle(s)">
                    {{ styleTitle(s) }}
                  </span>
                </span>
              </div>

              <div v-if="compareTastes(f).onlyMine.length" class="row">
                <span class="row-label">только у тебя</span>
                <span class="chips">
                  <span v-for="s in compareTastes(f).onlyMine" :key="s" class="chip" :style="chipStyle(s)">
                    {{ styleTitle(s) }}
                  </span>
                </span>
              </div>

              <div class="facts">
                <span v-if="f.evenings > 0">
                  вместе {{ withPlural(f.evenings, 'вечер', 'вечера', 'вечеров') }}<template v-if="f.last_evening">,
                  последний — {{ formatDay(dayKey(f.last_evening)) }}</template>
                </span>
                <span v-if="matchPercent(f) !== null">общих стилей {{ matchPercent(f) }}%</span>
                <span v-if="pioneer(f)">{{ pioneer(f) }}</span>
                <span class="stale">{{ freshness(f) }}</span>
              </div>

              <div v-if="renamingId === f.tg_id" class="rename">
                <input v-model="draftName" class="rename-input" :placeholder="f.name" @keyup.enter="saveName(f)" />
                <button type="button" class="rename-save" @click="saveName(f)">сохранить</button>
              </div>

              <div class="row-actions">
                <button type="button" class="minor" @click="startRename(f)">переименовать</button>
                <button type="button" class="minor" @click="unfriend(f)">убрать из компании</button>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <div v-else-if="!loading" class="empty">
        <p class="empty-title">пока никого</p>
        <p class="empty-body">позови друга — увидите, кто что открывает и чем отличаются вкусы</p>
      </div>

      <button v-if="hiddenCount > 0" type="button" class="more" @click="expanded = true">
        показать всех ({{ foundFriends.length }})
      </button>
      <button
        v-else-if="expanded && foundFriends.length > PREVIEW"
        type="button"
        class="more"
        @click="expanded = false"
      >
        свернуть список
      </button>

      <button type="button" class="primary" :disabled="inviting" @click="invite">
        {{ inviting ? 'готовим ссылку…' : 'добавить друга' }}
      </button>
      <p class="fineprint">ссылка работает сутки — по ней зайдут все, кому её переслали</p>

      <PartiesSection
        :me-id="myId"
        :friends="summonList"
        :class="{ first: activeParty }"
      />
    </template>
  </section>
</template>

<style scoped>
/* Пока вечер идёт, стол переезжает наверх — перестраивать дерево ради этого незачем */
.first {
  order: -1;
}
.search {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
.more {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent-bright);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.view {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px 16px 24px;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.friend {
  border-bottom: 1px solid var(--line);
}
.friend-head {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 9px 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
/* Своя строка ничего не раскрывает: сравнивать себя с собой не с чем */
.friend-head.static {
  cursor: default;
}
.self .friend-name {
  color: var(--accent-bright);
}
.self .initial {
  font-size: 12px;
  color: var(--accent-bright);
}
/* Обводка — средний оттенок месяца: сравниваем вкус, а не количество */
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
.friend-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.friend-name {
  font-size: 15px;
}
.friend-numbers {
  font-size: 13px;
  color: var(--text-dim);
}
.friend-taste {
  font-size: 12px;
  color: var(--text-faint);
}
.chevron {
  color: var(--text-faint);
  font-size: 13px;
  transition: transform 200ms ease;
}
.chevron.turned {
  transform: rotate(180deg);
}
.compare {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 4px 0 14px 49px;
  overflow: hidden;
}
.scale {
  display: flex;
  align-items: center;
  gap: 7px;
}
.scale-label {
  font-size: 11px;
  color: var(--text-faint);
}
.scale-chip {
  width: 34px;
  height: 12px;
  border-radius: 3px;
}
.row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.row-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 12px;
}
.facts {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--text-dim);
}
.stale {
  color: var(--text-faint);
}
.row-actions {
  display: flex;
  gap: 16px;
  margin-top: 6px;
}
.minor {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-faint);
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}
/* Имя, под которым ты подписал человека у себя — на сервер не уезжает */
.rename {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.rename-input {
  flex: 1;
  padding: 7px 9px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
.rename-save {
  padding: 7px 12px;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: none;
  color: var(--accent-bright);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.period {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.switch {
  display: flex;
  gap: 3px;
}
.switch button {
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: none;
  color: var(--text-faint);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.switch button.on {
  border-color: var(--accent);
  color: var(--accent-bright);
}
.compare-enter-active,
.compare-leave-active {
  transition: opacity 200ms ease, max-height 260ms ease;
  max-height: 400px;
}
.compare-enter-from,
.compare-leave-to {
  opacity: 0;
  max-height: 0;
}
.primary {
  padding: 14px;
  border: 0;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.6;
}
.fineprint {
  margin: -12px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
}
.hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-faint);
}
.demo {
  margin: 0;
  padding: 7px 10px;
  border-radius: var(--radius);
  background: var(--surface-high);
  font-size: 12px;
  color: var(--text-dim);
}
.empty {
  padding: 28px 0;
}
.empty-title {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 17px;
  margin: 0 0 8px;
}
.empty-body {
  margin: 0;
  color: var(--text-dim);
  font-size: 14px;
}
</style>
