import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { computeHash, buildCheckString, verifyInitDataDetailed } from './auth'

/** Эталон: та же схема, посчитанная независимо средствами Node */
function referenceHash(checkString: string, token: string): string {
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  return createHmac('sha256', secret).update(checkString).digest('hex')
}

const TOKEN = '8826831795:AAHtesttesttesttesttesttesttesttest'

describe('computeHash', () => {
  it('совпадает с независимой реализацией на Node', async () => {
    const checkString = 'auth_date=1755100000\nquery_id=AAHdF6IQ\nuser={"id":1,"first_name":"Игорь"}'
    expect(await computeHash(checkString, TOKEN)).toBe(referenceHash(checkString, TOKEN))
  })

  it('чувствителен к порядку строк', async () => {
    const a = await computeHash('a=1\nb=2', TOKEN)
    const b = await computeHash('b=2\na=1', TOKEN)
    expect(a).not.toBe(b)
  })
})

describe('buildCheckString', () => {
  it('сортирует по алфавиту и выбрасывает hash и signature', () => {
    const pairs = new Map([
      ['user', '{"id":1}'],
      ['hash', 'deadbeef'],
      ['auth_date', '1755100000'],
      ['signature', 'sig'],
    ])

    expect(buildCheckString(pairs)).toBe('auth_date=1755100000\nuser={"id":1}')
  })
})

describe('verifyInitDataDetailed', () => {
  /** Собирает подписанную строку так, как это делает Telegram */
  async function signed(fields: Record<string, string>, token = TOKEN): Promise<string> {
    const pairs = new Map(Object.entries(fields))
    const hash = referenceHash(buildCheckString(pairs), token)
    const query = [...pairs.entries()]
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&')
    return `${query}&hash=${hash}`
  }

  const nowSeconds = Math.floor(Date.now() / 1000)

  it('принимает корректно подписанные данные', async () => {
    const initData = await signed({
      auth_date: String(nowSeconds),
      query_id: 'AAHdF6IQ',
      user: JSON.stringify({ id: 42, first_name: 'Игорь' }),
    })

    const result = await verifyInitDataDetailed(initData, TOKEN)
    expect(result.reason).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.data?.user.id).toBe(42)
  })

  it('не спотыкается о плюс в значении', async () => {
    const initData = await signed({
      auth_date: String(nowSeconds),
      user: JSON.stringify({ id: 7, first_name: 'A+B' }),
    })

    expect((await verifyInitDataDetailed(initData, TOKEN)).ok).toBe(true)
  })

  it('отвергает подпись от чужого токена', async () => {
    const initData = await signed(
      { auth_date: String(nowSeconds), user: JSON.stringify({ id: 1 }) },
      '111111111:AAHotherotherotherotherotherother',
    )

    const result = await verifyInitDataDetailed(initData, TOKEN)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('hash-mismatch')
  })

  it('отвергает протухшие данные', async () => {
    const initData = await signed({
      auth_date: String(nowSeconds - 48 * 3600),
      user: JSON.stringify({ id: 1 }),
    })

    expect((await verifyInitDataDetailed(initData, TOKEN)).reason).toBe('stale')
  })
})
