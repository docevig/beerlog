/**
 * Час, с которого начинаются «пивные сутки».
 *
 * Кружка, выпитая в час ночи, относится к предыдущему вечеру. Без этого
 * теплокарта и подсчёт трезвых дней врут на каждой нормальной пятнице.
 */
export const DAY_START_HOUR = 6

/** Календарный день отметки в формате YYYY-MM-DD с учётом границы в 06:00 */
export function dayKey(ts: number): string {
  const shifted = new Date(ts - DAY_START_HOUR * 3600_000)
  const y = shifted.getFullYear()
  const m = String(shifted.getMonth() + 1).padStart(2, '0')
  const d = String(shifted.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Момент начала суток с ключом day, в миллисекундах */
export function dayStart(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, DAY_START_HOUR, 0, 0, 0).getTime()
}

/** Ключ дня для «сейчас» */
export function todayKey(now: number = Date.now()): string {
  return dayKey(now)
}

/** Перебор всех дней от начала до конца включительно */
export function daysBetween(from: string, to: string): string[] {
  const result: string[] = []
  let cursor = dayStart(from)
  const last = dayStart(to)
  while (cursor <= last) {
    result.push(dayKey(cursor))
    cursor += 24 * 3600_000
  }
  return result
}
