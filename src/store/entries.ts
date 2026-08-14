import { ref, computed } from 'vue'
import type { Entry, Profile } from '../types'
import type { KeyValueStore } from '../storage/types'
import { VALUE_LIMIT } from '../storage/types'
import { splitIntoSegments, monthKey, parseMonthKey } from '../storage/segments'

const PROFILE_KEY = 'profile'

const entries = ref<Entry[]>([])
const profile = ref<Profile>({})
const loading = ref(false)

let store: KeyValueStore | null = null

/** Месяц отметки в виде пары чисел */
function monthOf(ts: number): { year: number; month: number } {
  const d = new Date(ts)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Сохраняет один месяц целиком: собирает все его отметки, режет на сегменты
 * и записывает. Лишние сегменты, оставшиеся от прошлого раза, удаляются —
 * иначе после удаления отметок в конце месяца всплывут призраки.
 */
async function saveMonth(year: number, month: number): Promise<void> {
  if (!store) return

  const monthEntries = entries.value
    .filter((e) => {
      const m = monthOf(e.ts)
      return m.year === year && m.month === month
    })
    .sort((a, b) => a.ts - b.ts)

  const segments = splitIntoSegments(monthEntries, VALUE_LIMIT)

  for (let i = 0; i < segments.length; i++) {
    await store.set(monthKey(year, month, i), segments[i])
  }

  // Подчищаем хвост от предыдущей, более длинной версии месяца
  const allKeys = await store.keys()
  for (const key of allKeys) {
    const parsed = parseMonthKey(key)
    if (parsed && parsed.year === year && parsed.month === month && parsed.segment >= segments.length) {
      await store.remove(key)
    }
  }
}

async function saveProfile(): Promise<void> {
  if (!store) return
  await store.set(PROFILE_KEY, JSON.stringify(profile.value))
}

export function useEntries() {
  /** Загружает всю историю: статистика смотрит на все месяцы сразу */
  async function load(handle: KeyValueStore): Promise<void> {
    store = handle
    loading.value = true

    try {
      const keys = await store.keys()
      const monthKeys = keys.filter((k) => parseMonthKey(k) !== undefined).sort()

      const collected: Entry[] = []
      for (const key of monthKeys) {
        const raw = await store.get(key)
        if (!raw) continue
        try {
          const chunk = JSON.parse(raw) as Entry[]
          collected.push(...chunk)
        } catch {
          // Битый сегмент не должен уронить всю историю
        }
      }

      collected.sort((a, b) => a.ts - b.ts)
      entries.value = collected

      const rawProfile = await store.get(PROFILE_KEY)
      if (rawProfile) {
        try {
          profile.value = JSON.parse(rawProfile) as Profile
        } catch {
          profile.value = {}
        }
      }
    } finally {
      loading.value = false
    }
  }

  async function add(entry: Omit<Entry, 'id'>): Promise<Entry> {
    const created: Entry = { ...entry, id: newId() }
    entries.value = [...entries.value, created].sort((a, b) => a.ts - b.ts)

    const m = monthOf(created.ts)
    await saveMonth(m.year, m.month)

    profile.value.lastMl = created.ml
    profile.value.lastStyle = created.style
    await saveProfile()

    return created
  }

  async function update(id: string, patch: Partial<Entry>): Promise<void> {
    const index = entries.value.findIndex((e) => e.id === id)
    if (index === -1) return

    const before = entries.value[index]
    const after = { ...before, ...patch, id: before.id }

    const next = [...entries.value]
    next[index] = after
    entries.value = next.sort((a, b) => a.ts - b.ts)

    // Правка времени может перенести отметку в другой месяц — сохраняем оба
    const oldMonth = monthOf(before.ts)
    const newMonth = monthOf(after.ts)
    await saveMonth(oldMonth.year, oldMonth.month)
    if (oldMonth.year !== newMonth.year || oldMonth.month !== newMonth.month) {
      await saveMonth(newMonth.year, newMonth.month)
    }
  }

  async function remove(id: string): Promise<void> {
    const target = entries.value.find((e) => e.id === id)
    if (!target) return

    entries.value = entries.value.filter((e) => e.id !== id)
    const m = monthOf(target.ts)
    await saveMonth(m.year, m.month)
  }

  /** Возвращает удалённую отметку целиком, сохраняя её исходный id и время */
  async function restore(entry: Entry): Promise<void> {
    if (entries.value.some((e) => e.id === entry.id)) return

    entries.value = [...entries.value, entry].sort((a, b) => a.ts - b.ts)
    const m = monthOf(entry.ts)
    await saveMonth(m.year, m.month)
  }

  return {
    entries: computed(() => entries.value),
    profile,
    loading: computed(() => loading.value),
    load,
    add,
    update,
    remove,
    restore,
    saveProfile,
  }
}

/** Идентификатор отметки: времени и случайного хвоста достаточно для локальной уникальности */
function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
