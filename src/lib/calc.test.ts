import { describe, it, expect } from 'vitest'
import { pureAlcoholGrams } from './calc'

describe('pureAlcoholGrams', () => {
  it('считает граммы чистого спирта для полулитра пятиградусного', () => {
    // 500 мл × 5% × 0,789 = 19,725 г
    expect(pureAlcoholGrams(500, 5)).toBeCloseTo(19.725, 3)
  })

  it('для безалкогольного даёт почти ноль', () => {
    expect(pureAlcoholGrams(500, 0.5)).toBeCloseTo(1.9725, 3)
  })

  it('нулевой объём даёт ноль', () => {
    expect(pureAlcoholGrams(0, 6.5)).toBe(0)
  })
})
