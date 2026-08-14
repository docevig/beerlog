import { ref, computed } from 'vue'
import type { Entry } from '../types'
import {
  apiAvailable,
  listParties,
  fetchParty,
  pushPartyEntry,
  updatePartyEntry,
  removePartyEntry,
  type PartySummary,
  type PartyState,
} from '../lib/api'

/** Идущий сейчас вечер: пока он открыт, отметки уходят ещё и на общий стол */
const active = ref<PartySummary | null>(null)
const known = ref<PartySummary[]>([])
const activeState = ref<PartyState | null>(null)

export function useParty() {
  async function refresh(): Promise<void> {
    if (!apiAvailable()) return

    // Состояние стола приходит тем же запросом — второй круг не нужен
    const { parties, active: state } = await listParties()
    known.value = parties
    active.value = parties.find((p) => p.ended_at === null) ?? null
    activeState.value = state
  }

  /**
   * Отправляет отметку на стол. Ошибку глотаем намеренно: личный дневник
   * важнее общего, и сбой сети не должен мешать записать свою кружку.
   */
  async function mirror(entry: Entry): Promise<void> {
    if (!active.value || !apiAvailable()) return

    /*
      Отметка старше начала вечера к этому столу не относится. Условие нужно
      для отмены удаления: вчерашняя запись, восстановленная во время нового
      вечера, иначе приехала бы на сегодняшний стол.
    */
    if (entry.ts < active.value.started_at) return

    try {
      await pushPartyEntry(active.value.id, {
        id: entry.id,
        ts: entry.ts,
        ml: entry.ml,
        style: entry.style,
        name: entry.name,
      })
    } catch {
      // Молча: отметка уже в дневнике, стол догонит при следующем открытии
    }
  }

  /**
   * Отправляет отметку в конкретный вечер, а не в тот, что считается активным.
   * Нужно для догона: кружка, записанная до того, как приложение узнало
   * о вечере, иначе так и осталась бы только в личном дневнике.
   */
  async function mirrorInto(partyId: string, entry: Entry): Promise<boolean> {
    if (!apiAvailable()) return false

    try {
      await pushPartyEntry(partyId, {
        id: entry.id,
        ts: entry.ts,
        ml: entry.ml,
        style: entry.style,
        name: entry.name,
      })
      return true
    } catch {
      // Закрытый вечер сервер не примет — это нормально, просто не догоняем
      return false
    }
  }

  /**
   * Догоняет стол правкой. Идущий вечер для этого не нужен: отметка могла
   * уехать в уже закрытый, а расходиться с дневником стол не должен.
   */
  async function mirrorUpdate(entry: Entry): Promise<void> {
    if (!apiAvailable()) return

    try {
      await updatePartyEntry(entry.id, {
        ts: entry.ts,
        ml: entry.ml,
        style: entry.style,
        name: entry.name,
      })
    } catch {
      // Молча, по той же причине: дневник важнее общего стола
    }
  }

  /**
   * Сверяет свои строки идущего вечера с дневником: досылает то, что не
   * уехало, правит разошедшееся, убирает удалённое.
   *
   * Зовётся при запуске приложения, а не только на вкладке компании: кружку
   * записывают на первом экране, и требовать ради синхронизации зайти
   * куда-то ещё — значит терять записи у тех, кто туда не заходит.
   *
   * Возвращает true, если стол изменился и его стоит перечитать.
   */
  async function reconcile(table: PartyState, meId: number, diary: Entry[]): Promise<boolean> {
    // Пустой дневник — не повод сносить стол: вероятнее, что он не загрузился
    if (diary.length === 0) return false

    const byId = new Map(diary.map((e) => [e.id, e]))
    let changed = false

    for (const row of table.entries) {
      if (row.tg_id !== meId) continue

      const mine = byId.get(row.id)

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

    // Закрытый вечер не догоняем: сервер новые строки в него не примет
    if (table.party.ended_at === null) {
      const onTable = new Set(table.entries.filter((e) => e.tg_id === meId).map((e) => e.id))

      for (const mine of diary) {
        if (mine.ts < table.party.started_at || onTable.has(mine.id)) continue
        if (await mirrorInto(table.party.id, mine)) changed = true
      }
    }

    return changed
  }

  /** Сверка идущего вечера сразу после запуска — без открытия вкладки компании */
  async function catchUpActive(meId: number, diary: Entry[]): Promise<void> {
    if (!apiAvailable() || !active.value) return

    try {
      const table = await fetchParty(active.value.id)
      if (await reconcile(table, meId, diary)) {
        activeState.value = await fetchParty(active.value.id)
      }
    } catch {
      // Не вышло сейчас — выйдет при следующем открытии
    }
  }

  /** Убирает отметку со стола вслед за удалением из дневника */
  async function mirrorRemove(id: string): Promise<void> {
    if (!apiAvailable()) return

    try {
      await removePartyEntry(id)
    } catch {
      // Молча: запись уже исчезла оттуда, где она важнее
    }
  }

  return {
    active: computed(() => active.value),
    activeState: computed(() => activeState.value),
    parties: computed(() => known.value),
    refresh,
    mirror,
    mirrorInto,
    mirrorUpdate,
    mirrorRemove,
    reconcile,
    catchUpActive,
    setActive: (party: PartySummary | null) => (active.value = party),
  }
}
