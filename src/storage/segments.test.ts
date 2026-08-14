import { describe, it, expect } from 'vitest'
import { splitIntoSegments } from './segments'

describe('splitIntoSegments', () => {
  it('умещает всё в один сегмент, когда лимит не мешает', () => {
    const parts = splitIntoSegments([1, 2, 3], 4096)
    expect(parts).toHaveLength(1)
    expect(JSON.parse(parts[0])).toEqual([1, 2, 3])
  })

  it('пустой список даёт один пустой сегмент', () => {
    const parts = splitIntoSegments([], 4096)
    expect(parts).toHaveLength(1)
    expect(JSON.parse(parts[0])).toEqual([])
  })

  it('режет на несколько сегментов при тесном лимите', () => {
    // "[1,2,3,4]" — это 9 символов, поэтому лимит должен быть строго меньше
    const parts = splitIntoSegments([1, 2, 3, 4], 8)
    expect(parts.length).toBeGreaterThan(1)
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(8))
    const restored = parts.flatMap((p) => JSON.parse(p))
    expect(restored).toEqual([1, 2, 3, 4])
  })

  it('не теряет ни одного элемента на длинной серии', () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: `e${i}`,
      ts: 1755000000000 + i,
      ml: 500,
      style: 'ipa',
    }))
    const parts = splitIntoSegments(items, 4096)
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(4096))
    const restored = parts.flatMap((p) => JSON.parse(p))
    expect(restored).toHaveLength(500)
    expect(restored).toEqual(items)
  })

  it('элемент, не влезающий в лимит, всё равно сохраняется', () => {
    const huge = { note: 'я'.repeat(200) }
    const parts = splitIntoSegments([huge], 50)
    const restored = parts.flatMap((p) => JSON.parse(p))
    expect(restored).toEqual([huge])
  })
})
