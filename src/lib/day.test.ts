import { describe, it, expect } from 'vitest'
import { dayKey, dayStart } from './day'

describe('dayKey', () => {
  it('час ночи относит к предыдущему дню', () => {
    const night = new Date(2026, 7, 15, 1, 30).getTime()
    expect(dayKey(night)).toBe('2026-08-14')
  })

  it('семь утра — уже новый день', () => {
    const morning = new Date(2026, 7, 15, 7, 0).getTime()
    expect(dayKey(morning)).toBe('2026-08-15')
  })

  it('ровно шесть утра — новый день', () => {
    const border = new Date(2026, 7, 15, 6, 0).getTime()
    expect(dayKey(border)).toBe('2026-08-15')
  })

  it('без пяти шесть — ещё вчерашний', () => {
    const border = new Date(2026, 7, 15, 5, 55).getTime()
    expect(dayKey(border)).toBe('2026-08-14')
  })

  it('вечер остаётся своим днём', () => {
    const evening = new Date(2026, 7, 15, 21, 40).getTime()
    expect(dayKey(evening)).toBe('2026-08-15')
  })

  it('ночь на первое число уходит в прошлый месяц', () => {
    const night = new Date(2026, 8, 1, 2, 0).getTime()
    expect(dayKey(night)).toBe('2026-08-31')
  })
})

describe('dayStart', () => {
  it('начало пивных суток — шесть утра того же дня', () => {
    const evening = new Date(2026, 7, 15, 21, 40).getTime()
    const start = new Date(dayStart('2026-08-15'))
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(7)
    expect(start.getDate()).toBe(15)
    expect(start.getHours()).toBe(6)
    expect(dayKey(evening)).toBe('2026-08-15')
  })
})
