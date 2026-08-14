import { describe, it, expect } from 'vitest'
import { plural, formatLitres, formatAbv, formatDay } from './format'

describe('plural', () => {
  it('единственное число', () => {
    expect(plural(1, 'порция', 'порции', 'порций')).toBe('порция')
    expect(plural(21, 'порция', 'порции', 'порций')).toBe('порция')
    expect(plural(101, 'порция', 'порции', 'порций')).toBe('порция')
  })

  it('малое множественное', () => {
    expect(plural(2, 'порция', 'порции', 'порций')).toBe('порции')
    expect(plural(3, 'порция', 'порции', 'порций')).toBe('порции')
    expect(plural(24, 'порция', 'порции', 'порций')).toBe('порции')
  })

  it('большое множественное', () => {
    expect(plural(0, 'порция', 'порции', 'порций')).toBe('порций')
    expect(plural(5, 'порция', 'порции', 'порций')).toBe('порций')
    expect(plural(11, 'порция', 'порции', 'порций')).toBe('порций')
    expect(plural(14, 'порция', 'порции', 'порций')).toBe('порций')
    expect(plural(112, 'порция', 'порции', 'порций')).toBe('порций')
  })
})

describe('formatLitres', () => {
  it('пишет литры через запятую', () => {
    expect(formatLitres(500)).toBe('0,5 л')
    expect(formatLitres(330)).toBe('0,33 л')
    expect(formatLitres(1000)).toBe('1 л')
    expect(formatLitres(1330)).toBe('1,33 л')
  })
})

describe('formatAbv', () => {
  it('крепость с запятой', () => {
    expect(formatAbv(4.5)).toBe('4,5%')
    expect(formatAbv(10)).toBe('10%')
  })
})

describe('formatDay', () => {
  it('день с названием месяца', () => {
    expect(formatDay('2026-08-14')).toBe('14 августа')
    expect(formatDay('2026-01-01')).toBe('1 января')
  })
})
