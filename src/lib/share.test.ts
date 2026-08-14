import { describe, it, expect } from 'vitest'
import type { Entry } from '../types'
import { monthSummaryText, shareUrl } from './share'

const entries: Entry[] = [
  { id: 'a', ts: new Date(2026, 7, 3, 20, 0).getTime(), ml: 500, style: 'lager' },
  { id: 'b', ts: new Date(2026, 7, 5, 21, 0).getTime(), ml: 500, style: 'stout' },
  { id: 'c', ts: new Date(2026, 7, 6, 19, 0).getTime(), ml: 330, style: 'ipa' },
]

describe('monthSummaryText', () => {
  it('склоняет месяц и порции', () => {
    const text = monthSummaryText(entries, 8)
    expect(text).toContain('в августе')
    expect(text).not.toContain('мой августе')
    expect(text).toContain('3 порции')
  })

  it('находит самое тёмное и самое крепкое', () => {
    const text = monthSummaryText(entries, 8)
    expect(text).toContain('стаут')
    expect(text).toContain('6,5%')
  })

  it('пустой месяц не притворяется полным', () => {
    expect(monthSummaryText([], 8)).toBe('в августе пока ни одной кружки')
  })
})

describe('shareUrl', () => {
  it('кодирует текст и ведёт на приложение', () => {
    const url = shareUrl('привет, мир')
    expect(url.startsWith('https://t.me/share/url?url=')).toBe(true)
    expect(decodeURIComponent(url)).toContain('t.me/beerlogs_bot/app')
    expect(decodeURIComponent(url)).toContain('привет, мир')
  })
})
