import type { Entry } from '../types'
import { BEER_STYLES } from '../data/styles'
import { totalMl, distinctStyles, byDay, longestSoberStreak } from './stats'
import { dayKey } from './day'
import { withPlural } from './format'

export interface Achievement {
  title: string
  detail?: string
}

/** Объём стандартной ванны, литров — для сравнения, которое человек чувствует */
const BATH_LITRES = 170

export function achievements(entries: Entry[]): Achievement[] {
  if (entries.length === 0) return []

  const result: Achievement[] = []
  const litres = totalMl(entries) / 1000

  result.push({
    title: `стилей попробовано: ${distinctStyles(entries)} из ${BEER_STYLES.length}`,
  })

  if (litres >= BATH_LITRES) {
    const baths = Math.floor(litres / BATH_LITRES)
    result.push({
      title: baths === 1 ? 'выпита целая ванна' : `выпито ванн: ${baths}`,
      detail: `${Math.round(litres)} литров за всё время`,
    })
  } else {
    result.push({
      title: `до полной ванны осталось ${Math.round(BATH_LITRES - litres)} л`,
      detail: `${Math.round(litres)} из ${BATH_LITRES}`,
    })
  }

  const days = [...byDay(entries).keys()].sort()
  if (days.length > 0) {
    const first = days[0]
    const last = dayKey(Date.now())
    const sober = longestSoberStreak(entries, first, last)
    if (sober > 0) {
      result.push({ title: `самая длинная трезвая серия: ${withPlural(sober, 'день', 'дня', 'дней')}` })
    }

    result.push({ title: `дней с отметками: ${days.length}` })
  }

  return result
}
