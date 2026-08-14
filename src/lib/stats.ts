import type { Entry } from '../types'
import { findStyle } from '../data/styles'
import { pureAlcoholGrams } from './calc'
import { dayKey, daysBetween } from './day'

/** Крепость отметки: переопределённая или дефолтная для стиля */
export function entryAbv(entry: Entry): number {
  return entry.abv ?? findStyle(entry.style)?.abv ?? 0
}

export function totalMl(entries: Entry[]): number {
  return entries.reduce((sum, e) => sum + e.ml, 0)
}

export function totalAlcoholGrams(entries: Entry[]): number {
  return entries.reduce((sum, e) => sum + pureAlcoholGrams(e.ml, entryAbv(e)), 0)
}

export interface StyleShare {
  style: string
  ml: number
  count: number
  /** Доля от общего объёма, от 0 до 1 */
  share: number
}

/** Разбивка по стилям, отсортированная от большего объёма к меньшему */
export function styleBreakdown(entries: Entry[]): StyleShare[] {
  const total = totalMl(entries)
  const acc = new Map<string, { ml: number; count: number }>()

  for (const e of entries) {
    const prev = acc.get(e.style) ?? { ml: 0, count: 0 }
    acc.set(e.style, { ml: prev.ml + e.ml, count: prev.count + 1 })
  }

  return [...acc.entries()]
    .map(([style, v]) => ({ style, ml: v.ml, count: v.count, share: total ? v.ml / total : 0 }))
    .sort((a, b) => b.ml - a.ml)
}

/** Объём по дням; ключ — день с учётом границы в 06:00 */
export function byDay(entries: Entry[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of entries) {
    const key = dayKey(e.ts)
    map.set(key, (map.get(key) ?? 0) + e.ml)
  }
  return map
}

/** Сколько дней в интервале прошло без единой отметки */
export function soberDaysCount(entries: Entry[], from: string, to: string): number {
  const drinking = byDay(entries)
  return daysBetween(from, to).filter((d) => !drinking.has(d)).length
}

/** Самая длинная непрерывная серия трезвых дней внутри интервала */
export function longestSoberStreak(entries: Entry[], from: string, to: string): number {
  const drinking = byDay(entries)
  let best = 0
  let current = 0

  for (const day of daysBetween(from, to)) {
    if (drinking.has(day)) {
      current = 0
    } else {
      current += 1
      if (current > best) best = current
    }
  }

  return best
}

/** Сколько разных стилей попробовано */
export function distinctStyles(entries: Entry[]): number {
  return new Set(entries.map((e) => e.style)).size
}

/** День с наибольшим объёмом */
export function heaviestDay(entries: Entry[]): { day: string; ml: number } | undefined {
  let best: { day: string; ml: number } | undefined
  for (const [day, ml] of byDay(entries)) {
    if (!best || ml > best.ml) best = { day, ml }
  }
  return best
}
