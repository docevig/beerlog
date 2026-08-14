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
export type VerifyFailure =
  | 'no-init-data'
  | 'no-hash'
  | 'bad-token'
  | 'hash-mismatch'
  | 'stale'
  | 'no-user'

export interface VerifyResult {
  ok: boolean
  reason?: VerifyFailure
  data?: VerifiedInit
  /** Диагностика без секретов: помогает понять, что не так, по логам */
  details?: Record<string, unknown>
}

/** Токен бота выглядит как «1234567890:AA...» — проверяем форму, не значение */
function looksLikeToken(token: string): boolean {
  return /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)
}

export async function verifyInitDataDetailed(initData: string, botToken: string): Promise<VerifyResult> {
  if (!initData) return { ok: false, reason: 'no-init-data' }

  if (!looksLikeToken(botToken)) {
    return {
      ok: false,
      reason: 'bad-token',
      details: { tokenLength: botToken.length, hasColon: botToken.includes(':') },
    }
  }

  const params = new URLSearchParams(initData)
  const providedHash = params.get('hash')
  if (!providedHash) return { ok: false, reason: 'no-hash', details: { keys: [...params.keys()] } }

  params.delete('hash')
  // Signature относится к третьесторонней проверке Ed25519 и в строку не входит
  params.delete('signature')

  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n')

  const secret = await hmac(encoder.encode('WebAppData'), botToken)
  const expected = toHex(await hmac(secret, checkString))

  if (!(await equalsSafely(expected, providedHash))) {
    return {
      ok: false,
      reason: 'hash-mismatch',
      // Хвосты хешей безопасны и позволяют отличить «не тот токен» от «сломанной строки»
      details: {
        keys: [...params.keys()],
        expectedTail: expected.slice(-6),
        providedTail: providedHash.slice(-6),
      },
    }
  }

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate)) return { ok: false, reason: 'stale' }

  const age = Math.floor(Date.now() / 1000) - authDate
  if (age > MAX_AGE_SECONDS) return { ok: false, reason: 'stale', details: { ageSeconds: age } }

  const rawUser = params.get('user')
  if (!rawUser) return { ok: false, reason: 'no-user' }

  let parsed: { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string }
  try {
    parsed = JSON.parse(rawUser)
  } catch {
    return { ok: false, reason: 'no-user' }
  }

  if (typeof parsed.id !== 'number') return { ok: false, reason: 'no-user' }

  const name =
    [parsed.first_name, parsed.last_name].filter(Boolean).join(' ') ||
    parsed.username ||
    `id${parsed.id}`

  return {
    ok: true,
    data: {
      user: { id: parsed.id, name, photoUrl: parsed.photo_url },
      startParam: params.get('start_param') ?? undefined,
    },
  }
}

/** Прежняя короткая форма — для мест, где причина неважна */
export async function verifyInitData(initData: string, botToken: string): Promise<VerifiedInit | null> {
  const result = await verifyInitDataDetailed(initData, botToken)
  return result.ok ? (result.data ?? null) : null
}
