import { describe, it, expect } from 'vitest'
import { parseVolume, volumeHint } from './volume'

describe('parseVolume', () => {
  it('читает литры, когда число маленькое', () => {
    expect(parseVolume('0,25')).toBe(250)
    expect(parseVolume('0.5')).toBe(500)
    expect(parseVolume('1')).toBe(1000)
    expect(parseVolume('1,5')).toBe(1500)
  })

  it('читает миллилитры, когда число большое', () => {
    expect(parseVolume('330')).toBe(330)
    expect(parseVolume('568')).toBe(568)
    expect(parseVolume(500)).toBe(500)
  })

  it('отбрасывает мусор и опечатки', () => {
    expect(parseVolume('')).toBeUndefined()
    expect(parseVolume('пиво')).toBeUndefined()
    expect(parseVolume('0')).toBeUndefined()
    expect(parseVolume('-3')).toBeUndefined()
    // Ровно тот случай, что записал «Пилснер 0»: четверть миллилитра
    expect(parseVolume('0,0002')).toBeUndefined()
    expect(parseVolume('99999')).toBeUndefined()
  })
})

describe('volumeHint', () => {
  it('проговаривает, как понято введённое', () => {
    expect(volumeHint('0,25')).toBe('= 250 мл')
    expect(volumeHint('1,5')).toBe('= 1,50 л')
    expect(volumeHint('330')).toBe('= 330 мл')
    expect(volumeHint('чепуха')).toBe('')
  })
})
