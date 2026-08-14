/** Колбэчный интерфейс CloudStorage из telegram-web-app.js */
export interface TgCloudStorage {
  getItem(key: string, cb: (err: string | null, value?: string) => void): void
  setItem(key: string, value: string, cb?: (err: string | null, ok?: boolean) => void): void
  removeItem(key: string, cb?: (err: string | null, ok?: boolean) => void): void
  getKeys(cb: (err: string | null, keys?: string[]) => void): void
}

export interface TgWebApp {
  ready(): void
  expand(): void
  /**
   * Подписка на события клиента. У viewportChanged есть полезная нагрузка:
   * isStateStable отличает промежуточные кадры анимации от конечного размера.
   */
  onEvent(event: string, cb: (payload?: { isStateStable?: boolean }) => void): void
  openTelegramLink(url: string): void
  /** Подписанная строка для сервера; передаётся как есть, разбирает её Worker */
  initData?: string
  /**
   * Неподписанная копия данных. Годится только для оформления —
   * отличить «меня» от других в списке. Для доступа к чужим данным
   * сервер всегда проверяет подпись сам.
   */
  initDataUnsafe?: {
    start_param?: string
    user?: { id: number; first_name?: string; photo_url?: string }
  }
  /**
   * Диалог выбора чата для сообщения, заранее подготовленного ботом.
   * Появился в Bot API 8.0, поэтому версию проверяем перед вызовом.
   */
  shareMessage?(preparedMessageId: string, cb?: (sent: boolean) => void): void
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  version: string
  /** Высота окна мини-приложения; уменьшается, когда открыта клавиатура */
  viewportHeight?: number
  /** Она же без учёта клавиатуры — по ней считать раскладку спокойнее */
  viewportStableHeight?: number
  CloudStorage?: TgCloudStorage
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp }
  }
}

/** Доступ к API Telegram; вне Telegram возвращает undefined */
export function tg(): TgWebApp | undefined {
  return window.Telegram?.WebApp
}

/** Версия Bot API, в которой появился CloudStorage */
export const CLOUD_STORAGE_SINCE = '6.9'

/** Версия, начиная с которой мини-приложение умеет делиться сообщением */
export const SHARE_MESSAGE_SINCE = '8.0'

/**
 * Сравнивает версию WebApp с требуемой.
 *
 * Проверять наличие самого объекта бесполезно: вне Telegram скрипт всё равно
 * создаёт заглушку версии 6.0, где CloudStorage присутствует, но каждый его
 * вызов бросает WebAppMethodUnsupported.
 */
export function isVersionAtLeast(target: string): boolean {
  const current = tg()?.version
  if (!current) return false

  const a = current.split('.').map(Number)
  const b = target.split('.').map(Number)

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i] ?? 0
    const right = b[i] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return true
}
