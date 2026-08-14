import { describe, it, expect } from 'vitest'
import type { Entry } from '../types'
import { mergeImport } from './importer'

const existing: Entry[] = [
  { id: 'a', ts: 1_755_000_000_000, ml: 500, style: 'lager' },
  { id: 'b', ts: 1_755_100_000_000, ml: 330, style: 'ipa' },
]

describe('mergeImport', () => {
  it('добавляет только незнакомые отметки', () => {
    const result = mergeImport(existing, {
      entries: [
        { id: 'a', ts: 1_755_000_000_000, ml: 500, style: 'lager' },
        { id: 'c', ts: 1_755_200_000_000, ml: 500, style: 'stout' },
      ],
    })

    expect(result.added.map((e) => e.id)).toEqual(['c'])
    expect(result.skipped).toBe(1)
  })

  it('не теряет записи, сделанные после выгрузки', () => {
    // Файл выгружен до того, как появилась отметка b
    const result = mergeImport(existing, { entries: [{ id: 'a', ts: 1_755_000_000_000, ml: 500, style: 'lager' }] })

    expect(result.added).toHaveLength(0)
    expect(existing.map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('отбраковывает мусор вместо того, чтобы класть его в дневник', () => {
    const result = mergeImport(existing, {
      entries: [
        { id: 'ok', ts: 1_755_300_000_000, ml: 500, style: 'porter' },
        { id: 'нет времени', ml: 500, style: 'ipa' },
        { id: 'нулевой объём', ts: 1_755_300_000_000, ml: 0, style: 'ipa' },
        'строка вместо объекта',
        null,
      ],
    })

    expect(result.added.map((e) => e.id)).toEqual(['ok'])
    expect(result.broken).toBe(4)
  })

  it('принимает и голый массив, и объект выгрузки', () => {
    const asArray = mergeImport([], [{ id: 'x', ts: 1_755_000_000_000, ml: 500, style: 'ale' }])
    expect(asArray.added).toHaveLength(1)
  })

  it('внутри одного файла дубликаты тоже схлопываются', () => {
    const result = mergeImport([], {
      entries: [
        { id: 'dup', ts: 1_755_000_000_000, ml: 500, style: 'ale' },
        { id: 'dup', ts: 1_755_000_000_000, ml: 500, style: 'ale' },
      ],
    })

    expect(result.added).toHaveLength(1)
    expect(result.skipped).toBe(1)
  })

  it('на чужом файле падает понятной ошибкой', () => {
    expect(() => mergeImport([], { что: 'то' })).toThrow('нет списка отметок')
  })
})
