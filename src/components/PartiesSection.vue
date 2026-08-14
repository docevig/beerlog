<script setup lang="ts">
import { ref, onMounted } from 'vue'
import PartyTable from './PartyTable.vue'
import {
  apiAvailable,
  startParty,
  fetchParty,
  closeParty,
  deleteParty,
  leaveParty,
  partyInvite,
  fetchPartyStats,
  inviteLink,
  type PartyState,
  type PartyStats,
  type PartySummary,
} from '../lib/api'
import { useParty } from '../store/party'
import { useEntries } from '../store/entries'
import { useFriendNames } from '../store/friends'
import { styleTitle } from '../data/styles'
import { styleColor, textOn } from '../lib/srm'
import { formatLitres, formatDay, withPlural } from '../lib/format'
import { dayKey } from '../lib/day'
import { tg } from '../lib/telegram'

const props = defineProps<{ meId: number }>()

const { active, parties, refresh, mirrorUpdate, mirrorRemove } = useParty()
const { entries } = useEntries()
const { nameOf } = useFriendNames()

const state = ref<PartyState | null>(null)
const stats = ref<PartyStats | null>(null)
const demoPast = ref<PartySummary[]>([])
const busy = ref(false)
const failure = ref('')

/**
 * Пример для просмотра в браузере: вне Telegram сервер недоступен.
 * С ?demo=idle показывает состояние «вечера нет» — чтобы видеть и кнопку старта.
 */
function loadDemo() {
  const idle = new URLSearchParams(location.search).get('demo') === 'idle'
  const started = Date.now() - 2.5 * 3600_000
  state.value = idle ? null : {
    party: {
      id: 'demo',
      title: null,
      host_id: props.meId,
      started_at: started,
      ended_at: null,
      members: 3,
      ml: 2330,
      portions: 5,
    },
    members: [
      { tg_id: props.meId, name: 'ты', photo_url: null },
      { tg_id: 1, name: 'Паша', photo_url: null },
      { tg_id: 2, name: 'Марина', photo_url: null },
    ],
    entries: [
      { id: 'd1', tg_id: props.meId, ts: started + 600_000, ml: 500, style: 'ipa', name: null },
      { id: 'd2', tg_id: 1, ts: started + 900_000, ml: 500, style: 'lager', name: null },
      { id: 'd3', tg_id: 2, ts: started + 1_500_000, ml: 330, style: 'stout', name: null },
      { id: 'd4', tg_id: 1, ts: started + 3_600_000, ml: 500, style: 'neipa', name: null },
      { id: 'd5', tg_id: props.meId, ts: started + 5_400_000, ml: 500, style: 'porter', name: null },
    ],
  }

  stats.value = {
    evenings: 12,
    companions: [
      { tg_id: 1, name: 'Паша', evenings: 8 },
      { tg_id: 2, name: 'Марина', evenings: 5 },
    ],
    styles: [
      { style: 'ipa', times: 21 },
      { style: 'lager', times: 14 },
      { style: 'stout', times: 6 },
    ],
    longest: { id: 'x', started_at: Date.now() - 20 * 86400_000, ended_at: 0, duration: 6.5 * 3600_000 },
    crowded: { id: 'y', started_at: Date.now() - 40 * 86400_000, members: 6 },
  }

  if (idle) {
    demoPast.value = [
      { id: 'p1', title: null, host_id: props.meId, started_at: Date.now() - 3 * 86400_000, ended_at: Date.now() - 3 * 86400_000 + 4.2 * 3600_000, members: 3, ml: 3160, portions: 7 },
      { id: 'p2', title: null, host_id: 1, started_at: Date.now() - 11 * 86400_000, ended_at: Date.now() - 11 * 86400_000 + 2.6 * 3600_000, members: 2, ml: 1500, portions: 3 },
    ]
  }
}

/**
 * Подтягивает свои строки стола к дневнику. Зеркалирование правок глотает
 * ошибки молча — иначе сбой сети мешал бы записать кружку, — поэтому одно
 * неудавшееся удаление осталось бы на столе навсегда. Здесь стол догоняет сам.
 *
 * Возвращает true, если что-то поменялось и состояние стоит перечитать.
 */
async function reconcile(table: PartyState): Promise<boolean> {
  // Пустой дневник — не повод сносить стол: вероятнее, что он просто не загрузился
  if (entries.value.length === 0) return false

  const diary = new Map(entries.value.map((e) => [e.id, e]))
  let changed = false

  for (const row of table.entries) {
    if (row.tg_id !== props.meId) continue

    const mine = diary.get(row.id)

    if (!mine) {
      await mirrorRemove(row.id)
      changed = true
    } else if (
      mine.ml !== row.ml ||
      mine.style !== row.style ||
      mine.ts !== row.ts ||
      (mine.name ?? null) !== row.name
    ) {
      await mirrorUpdate(mine)
      changed = true
    }
  }

  return changed
}

async function load() {
  if (!apiAvailable()) {
    if (import.meta.env.DEV) loadDemo()
    return
  }

  try {
    // Список и статистика независимы — спрашиваем разом, а не по очереди
    const [, freshStats] = await Promise.all([refresh(), fetchPartyStats()])
    stats.value = freshStats

    // Состояние стола можно узнать только после того, как выяснили активный вечер
    if (active.value) {
      const table = await fetchParty(active.value.id)
      state.value = (await reconcile(table)) ? await fetchParty(active.value.id) : table
    }
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
  }
}

async function begin() {
  busy.value = true
  failure.value = ''

  try {
    const { id } = await startParty()
    await refresh()
    state.value = await fetchParty(id)
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function invite() {
  if (!state.value) return

  try {
    const { code } = await partyInvite(state.value.party.id)
    const text = 'сегодня пьём вместе — заходи за стол, ссылка работает до конца вечера'
    const url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink(code))}&text=${encodeURIComponent(text)}`
    const app = tg()
    if (app) app.openTelegramLink(url)
    else window.open(url, '_blank')
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
  }
}

async function finish() {
  if (!state.value) return

  busy.value = true
  try {
    await closeParty(state.value.party.id)
    state.value = null
    await load()
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

/** Открытый прошлый вечер: тот же стол, но закрытый и только для чтения */
const past = ref<PartyState | null>(null)

/** Удаление подтверждается вторым нажатием — отменить его уже нельзя */
const confirmingId = ref<string | null>(null)

async function removeParty(id: string, isHost: boolean) {
  if (confirmingId.value !== id) {
    confirmingId.value = id
    setTimeout(() => {
      if (confirmingId.value === id) confirmingId.value = null
    }, 4000)
    return
  }

  confirmingId.value = null

  try {
    await (isHost ? deleteParty(id) : leaveParty(id))
    past.value = null
    demoPast.value = demoPast.value.filter((p) => p.id !== id)
    await load()
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
  }
}

async function openPast(summary: PartySummary) {
  if (!apiAvailable()) {
    // В браузере сервера нет, но экран должен открываться и здесь
    if (import.meta.env.DEV) past.value = demoPastState(summary)
    return
  }

  try {
    const table = await fetchParty(summary.id)
    // Прошлый вечер сверяем так же: расхождение могло остаться и в нём
    past.value = (await reconcile(table)) ? await fetchParty(summary.id) : table
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e)
  }
}

/** Разворачивает карточку демо-вечера в правдоподобный стол */
function demoPastState(summary: PartySummary): PartyState {
  const span = (summary.ended_at ?? summary.started_at) - summary.started_at
  const cast = [
    { tg_id: props.meId, name: 'ты', photo_url: null },
    { tg_id: 1, name: 'Паша', photo_url: null },
    { tg_id: 2, name: 'Марина', photo_url: null },
  ].slice(0, summary.members)

  const styles = ['ipa', 'lager', 'stout', 'neipa', 'porter', 'wheat', 'apa']
  const entries = Array.from({ length: summary.portions || cast.length }, (_, i) => ({
    id: `${summary.id}-${i}`,
    tg_id: cast[i % cast.length].tg_id,
    ts: summary.started_at + Math.round((span * (i + 1)) / ((summary.portions || cast.length) + 1)),
    ml: i % 3 === 2 ? 330 : 500,
    style: styles[i % styles.length],
    name: null,
  }))

  return { party: summary, members: cast, entries }
}

/** Прошедшие вечера — то, что приятно листать через полгода */
function pastParties(list: PartySummary[]): PartySummary[] {
  return list.filter((p) => p.ended_at !== null).slice(0, 10)
}

function partyDay(p: PartySummary): string {
  return formatDay(dayKey(p.started_at))
}

/** Короткий вечер должен читаться минутами, а не «0 ч» */
function humanDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const hours = Math.floor(minutes / 60)
  if (hours === 0) return `${minutes} мин`
  return minutes % 60 === 0 ? `${hours} ч` : `${hours} ч ${minutes % 60} мин`
}

function partyDuration(p: PartySummary): string {
  if (!p.ended_at) return ''
  return humanDuration(p.ended_at - p.started_at)
}

onMounted(load)
</script>

<template>
  <section class="parties">
    <p v-if="failure" class="hint">{{ failure }}</p>

    <PartyTable
      v-if="state && state.party.ended_at === null"
      :state="state"
      :me-id="props.meId"
      @invite="invite"
      @close="finish"
    />

    <button v-else type="button" class="start" :disabled="busy" @click="begin">
      {{ busy ? 'собираем стол…' : 'начать вечеринку' }}
    </button>

    <!-- Итоги про встречи, а не про литры: сколько раз собирались и с кем -->
    <div v-if="stats && stats.evenings > 0" class="block">
      <div class="eyebrow">вместе</div>
      <div class="figure evenings">{{ withPlural(stats.evenings, 'вечер', 'вечера', 'вечеров') }}</div>

      <!-- Без предлога: «с Игорь» требует падежа, а склонять имена ненадёжно -->
      <div v-if="stats.companions.length" class="line">
        чаще всего:
        <span v-for="(c, i) in stats.companions" :key="c.name">
          {{ i > 0 ? ', ' : '' }}{{ nameOf(c.tg_id, c.name) }} — {{ withPlural(c.evenings, 'вечер', 'вечера', 'вечеров') }}
        </span>
      </div>

      <div v-if="stats.styles.length" class="chips">
        <span class="line-label">в компании берут</span>
        <span v-for="s in stats.styles" :key="s.style" class="chip" :style="{ background: styleColor(s.style), color: textOn(s.style) }">
          {{ styleTitle(s.style) }}
        </span>
      </div>

      <div v-if="stats.longest" class="line dim">
        самый долгий вечер — {{ humanDuration(stats.longest.duration) }},
        {{ formatDay(dayKey(stats.longest.started_at)) }}
      </div>
      <div v-if="stats.crowded && stats.crowded.members > 2" class="line dim">
        самый людный стол — {{ withPlural(stats.crowded.members, 'человек', 'человека', 'человек') }}
      </div>
    </div>

    <div v-if="pastParties([...parties, ...demoPast]).length" class="block">
      <div class="eyebrow">прошлые вечера</div>
      <button v-for="p in pastParties([...parties, ...demoPast])" :key="p.id" type="button" class="card" @click="openPast(p)">
        <div class="card-head">
          <span>{{ partyDay(p) }}</span>
          <span class="card-total">{{ formatLitres(p.ml) }}</span>
        </div>
        <!-- Счёт записей убран: люди, время и литры уже всё говорят -->
        <div class="card-sub">
          {{ withPlural(p.members, 'человек', 'человека', 'человек') }} · {{ partyDuration(p) }}
        </div>
      </button>
    </div>

    <Teleport to="body">
      <div v-if="past" class="sheet" @click.self="past = null">
        <div class="sheet-inner">
          <PartyTable :state="past" :me-id="props.meId" />

          <!-- Свой вечер стираем целиком, чужой можно только убрать у себя -->
          <button type="button" class="danger" @click="removeParty(past.party.id, past.party.host_id === props.meId)">
            <template v-if="confirmingId === past.party.id">точно? нажми ещё раз</template>
            <template v-else-if="past.party.host_id === props.meId">удалить вечер</template>
            <template v-else>убрать у себя</template>
          </button>

          <button type="button" class="dismiss" @click="past = null">закрыть</button>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.parties {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.start {
  padding: 14px;
  border: 1px solid var(--border-accent, var(--accent));
  border-radius: var(--radius);
  background: none;
  color: var(--accent-bright);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
  cursor: pointer;
}
.start:disabled {
  opacity: 0.6;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.evenings {
  font-size: 26px;
  color: var(--accent-bright);
}
.line {
  font-size: 13px;
  color: var(--text-dim);
}
.line.dim {
  font-size: 12px;
  color: var(--text-faint);
}
.line-label {
  font-size: 12px;
  color: var(--text-faint);
  margin-right: 4px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.chip {
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 12px;
}
.card {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: transform 100ms ease;
}
.card:active {
  transform: scale(0.99);
}
/* Прошлый вечер открывается поверх: возвращаться в список удобнее, чем листать */
.sheet {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: flex-end;
  padding: 12px;
  background: rgba(10, 8, 5, 0.72);
  overflow-y: auto;
}
.sheet-inner {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dismiss {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-dim);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
/* Удаление необратимо, поэтому требует второго нажатия */
.danger {
  width: 100%;
  padding: 12px;
  border: 1px solid #7b1a00;
  border-radius: var(--radius);
  background: none;
  color: #e0975f;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.card-head {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}
.card-total {
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}
.card-sub {
  font-size: 12px;
  color: var(--text-faint);
}
.hint {
  margin: 0;
  font-size: 13px;
  color: var(--text-faint);
}
</style>
