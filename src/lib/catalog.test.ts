import { describe, it, expect } from 'vitest'
import type { Entry } from '../types'
import { buildCatalog, suggest } from './catalog'

const entries: Entry[] = [
  { id: '1', ts: 1_755_000_000_000, ml: 500, style: 'stout', name: 'Guinness', brewery: 'Guinness', rating: 5 },
  { id: '2', ts: 1_755_100_000_000, ml: 330, style: 'ipa', name: 'Пивоварня Х IPA', price: 300 },
  { id: '3', ts: 1_755_200_000_000, ml: 440, style: 'stout', name: 'guinness', price: 400 },
  { id: '4', ts: 1_755_300_000_000, ml: 500, style: 'lager', name: 'Жигулёвское' },
  { id: '5', ts: 1_755_400_000_000, ml: 500, style: 'lager' },
]

describe('buildCatalog', () => {
  it('пропускает записи без названия', () => {
    expect(buildCatalog(entries).some((b) => !b.name)).toBe(false)
  })

  it('склеивает один сорт при разном регистре', () => {
    const guinness = buildCatalog(entries).filter((b) => b.name.toLowerCase() === 'guinness')
    expect(guinness).toHaveLength(1)
    expect(guinness[0].times).toBe(2)
  })

  it('берёт объём и стиль из самой свежей записи', () => {
    const guinness = buildCatalog(entries).find((b) => b.name.toLowerCase() === 'guinness')!
    expect(guinness.ml).toBe(440)
  })

  it('не теряет пивоварню и оценку из старой записи', () => {
    const guinness = buildCatalog(entries).find((b) => b.name.toLowerCase() === 'guinness')!
    expect(guinness.brewery).toBe('Guinness')
    expect(guinness.rating).toBe(5)
  })

  it('усредняет цену только по записям, где она была', () => {
    const guinness = buildCatalog(entries).find((b) => b.name.toLowerCase() === 'guinness')!
    expect(guinness.price).toBe(400)
  })

  it('сортирует свежими вперёд', () => {
    expect(buildCatalog(entries)[0].name).toBe('Жигулёвское')
  })
})

describe('suggest', () => {
  const catalog = buildCatalog(entries)

  it('совпадение с начала идёт раньше вхождения', () => {
    const found = suggest(catalog, 'пивоварня')
    expect(found[0].name).toBe('Пивоварня Х IPA')
  })

  it('находит по части слова в середине', () => {
    expect(suggest(catalog, 'ipa').map((b) => b.name)).toContain('Пивоварня Х IPA')
  })

  it('не зависит от регистра', () => {
    expect(suggest(catalog, 'GUIN')).toHaveLength(1)
  })

  it('на пустой запрос отдаёт последние', () => {
    expect(suggest(catalog, '')[0].name).toBe('Жигулёвское')
  })
})
