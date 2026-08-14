/** Данные пользователя, подтверждённые подписью Telegram */
export interface TgUser {
  id: number
  name: string
  photoUrl?: string
}

export interface VerifiedInit {
  user: TgUser
  startParam?: string
}

/** Дольше суток initData не принимаем — защита от повторного проигрывания */
const MAX_AGE_SECONDS = 24 * 60 * 60

const encoder = new TextEncoder()

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Сравнение за постоянное время: обычное === на строках утекает информацию
 * через время выполнения и позволяет подбирать подпись побайтово.
 */
async function equalsSafely(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  return crypto.subtle.timingSafeEqual(left, right)
}

/**
 * Проверяет initData, пришедшую от Mini App.
 *
 * Схема Telegram: секрет — HMAC от токена бота с ключом «WebAppData»,
 * подпись — HMAC от строки проверки этим секретом. Идентификатор
 * пользователя берётся ТОЛЬКО отсюда и никогда из тела запроса.
 */
export async function verifyInitData(initData: string, botToken: string): Promise<VerifiedInit | null> {
  if (!initData) return null

  const params = new URLSearchParams(initData)
  const providedHash = params.get('hash')
  if (!providedHash) return null

  params.delete('hash')
  // Signature относится к третьесторонней проверке Ed25519 и в строку не входит
  params.delete('signature')

  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n')

  const secret = await hmac(encoder.encode('WebAppData'), botToken)
  const expected = toHex(await hmac(secret, checkString))

  if (!(await equalsSafely(expected, providedHash))) return null

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate)) return null
  if (Math.floor(Date.now() / 1000) - authDate > MAX_AGE_SECONDS) return null

  const rawUser = params.get('user')
  if (!rawUser) return null

  let parsed: { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string }
  try {
    parsed = JSON.parse(rawUser)
  } catch {
    return null
  }

  if (typeof parsed.id !== 'number') return null

  const name =
    [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') ||
    parsed.username ||
    `id${parsed.id}`

  return {
    user: { id: parsed.id, name, photoUrl: parsed.photo_url },
    startParam: params.get('start_param') ?? undefined,
  }
}
