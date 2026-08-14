import { describe, it, expect } from 'vitest'
import type { Entry } from '../types'
import { totalMl, totalAlcoholGrams, styleBreakdown, byDay, soberDaysCount, longestSoberStreak, distinctStyles } from './stats'

/** Три отметки: две в пятницу вечером, одна ночью — она тоже пятничная */
const entries: Entry[] = [
  { id: 'a', ts: new Date(2026, 7, 14, 19, 30).getTime(), ml: 500, style: 'lager' },
  { id: 'b', ts: new Date(2026, 7, 14, 21, 40).getTime(), ml: 500, style: 'ipa' },
  { id: 'c', ts: new Date(2026, 7, 15, 1, 10).getTime(), ml: 330, style: 'ipa' },
]

describe('totalMl', () => {
  it('складывает объёмы', () => {
    expect(totalMl(entries)).toBe(1330)
  })
})

describe('totalAlcoholGrams', () => {
  it('берёт крепость из справочника стилей', () => {
    // 500×4,5% + 500×6,5% + 330×6,5% = 22,5 + 32,5 + 21,45 = 76,45 мл спирта
    // 76,45 × 0,789 = 60,32 г
    expect(totalAlcoholGrams(entries)).toBeCloseTo(60.32, 1)
  })

  it('уважает переопределённую крепость', () => {
    const strong: Entry[] = [{ id: 'x', ts: Date.now(), ml: 500, style: 'lager', abv: 10 }]
    expect(totalAlcoholGrams(strong)).toBeCloseTo(39.45, 2)
  })
})

describe('styleBreakdown', () => {
  it('считает доли по объёму и сортирует по убыванию', () => {
    const result = styleBreakdown(entries)
    expect(result[0].style).toBe('ipa')
    expect(result[0].ml).toBe(830)
    expect(result[1].style).toBe('lager')
    expect(result[1].ml).toBe(500)
    expect(result[0].share).toBeCloseTo(830 / 1330, 4)
  })
})

describe('byDay', () => {
  it('ночную отметку относит к пятнице', () => {
    const map = byDay(entries)
    expect(map.get('2026-08-14')).toBe(1330)
    expect(map.has('2026-08-15')).toBe(false)
  })
})

describe('soberDaysCount', () => {
  it('считает дни без отметок в интервале', () => {
    // 14–18 августа это пять дней, отметки только 14-го
    expect(soberDaysCount(entries, '2026-08-14', '2026-08-18')).toBe(4)
  })
})

describe('longestSoberStreak', () => {
  it('находит самую длинную трезвую серию', () => {
    const spread: Entry[] = [
      { id: 'a', ts: new Date(2026, 7, 1, 20, 0).getTime(), ml: 500, style: 'lager' },
      { id: 'b', ts: new Date(2026, 7, 6, 20, 0).getTime(), ml: 500, style: 'lager' },
      { id: 'c', ts: new Date(2026, 7, 8, 20, 0).getTime(), ml: 500, style: 'lager' },
    ]
    // между 1 и 6 августа четыре трезвых дня, между 6 и 8 — один
    expect(longestSoberStreak(spread, '2026-08-01', '2026-08-08')).toBe(4)
  })
})

describe('distinctStyles', () => {
  it('считает попробованные стили без повторов', () => {
    expect(distinctStyles(entries)).toBe(2)
  })
})
