import { ref, computed } from 'vue'
import type { Entry } from '../types'
import { apiAvailable, listParties, pushPartyEntry, type PartySummary } from '../lib/api'

/** Идущий сейчас вечер: пока он открыт, отметки уходят ещё и на общий стол */
const active = ref<PartySummary | null>(null)
const known = ref<PartySummary[]>([])

export function useParty() {
  async function refresh(): Promise<void> {
    if (!apiAvailable()) return

    const { parties } = await listParties()
    known.value = parties
    active.value = parties.find((p) => p.ended_at === null) ?? null
  }

  /**
   * Отправляет отметку на стол. Ошибку глотаем намеренно: личный дневник
   * важнее общего, и сбой сети не должен мешать записать свою кружку.
   */
  async function mirror(entry: Entry): Promise<void> {
    if (!active.value || !apiAvailable()) return

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

  return {
    active: computed(() => active.value),
    parties: computed(() => known.value),
    refresh,
    mirror,
    setActive: (party: PartySummary | null) => (active.value = party),
  }
}
