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

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: ArrayBuffer, b: ArrayBuffer) => boolean
  }

  if (typeof subtle.timingSafeEqual === 'function') return subtle.timingSafeEqual(left, right)

  // Вне Workers такого расширения нет — сравниваем сами, тоже за постоянное время
  const x = new Uint8Array(left)
  const y = new Uint8Array(right)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x[i] ^ y[i]
  return diff === 0
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

/**
 * Подпись по схеме Telegram: секрет — HMAC от токена бота с ключом
 * «WebAppData», подпись — HMAC от строки проверки этим секретом.
 * Вынесено отдельно, чтобы сверять с эталоном в тестах.
 */
export async function computeHash(checkString: string, botToken: string): Promise<string> {
  const secret = await hmac(encoder.encode('WebAppData'), botToken)
  return toHex(await hmac(secret, checkString))
}

/** Строка проверки: все поля кроме hash и signature, по алфавиту */
export function buildCheckString(pairs: Map<string, string>): string {
  return [...pairs.entries()]
    .filter(([key]) => key !== 'hash' && key !== 'signature')
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n')
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

  /*
    Разбираем вручную, а не через URLSearchParams: тот трактует «+» как
    пробел, и любое значение с плюсом ломало бы подпись. Telegram кодирует
    initData через encodeURIComponent, поэтому decodeURIComponent точен.
  */
  const pairs = new Map<string, string>()
  for (const chunk of initData.split('&')) {
    const eq = chunk.indexOf('=')
    if (eq === -1) continue
    const key = chunk.slice(0, eq)
    const raw = chunk.slice(eq + 1)
    try {
      pairs.set(key, decodeURIComponent(raw))
    } catch {
      pairs.set(key, raw)
    }
  }

  const receivedKeys = [...pairs.keys()]
  const providedHash = pairs.get('hash')
  if (!providedHash) return { ok: false, reason: 'no-hash', details: { keys: receivedKeys } }

  // hash и signature в строку проверки не входят — это подписи, а не данные
  const checkString = buildCheckString(pairs)
  const signedKeys = [...pairs.keys()].filter((k) => k !== 'hash' && k !== 'signature')

  const expected = await computeHash(checkString, botToken)

  if (!(await equalsSafely(expected, providedHash))) {
    return {
      ok: false,
      reason: 'hash-mismatch',
      details: {
        // Полный список полей, как пришёл: покажет, есть ли signature,
        // который мы исключаем из строки проверки
        receivedKeys,
        signedKeys,
        expectedTail: expected.slice(-6),
        providedTail: providedHash.slice(-6),
        // Часть токена до двоеточия — публичный id бота, не секрет
        tokenBotId: botToken.split(':')[0],
        checkStringLength: checkString.length,
      },
    }
  }

  const authDate = Number(pairs.get('auth_date'))
  if (!Number.isFinite(authDate)) return { ok: false, reason: 'stale' }

  const age = Math.floor(Date.now() / 1000) - authDate
  if (age > MAX_AGE_SECONDS) return { ok: false, reason: 'stale', details: { ageSeconds: age } }

  const rawUser = pairs.get('user')
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
      startParam: pairs.get('start_param') ?? undefined,
    },
  }
}

/** Прежняя короткая форма — для мест, где причина неважна */
export async function verifyInitData(initData: string, botToken: string): Promise<VerifiedInit | null> {
  const result = await verifyInitDataDetailed(initData, botToken)
  return result.ok ? (result.data ?? null) : null
}
