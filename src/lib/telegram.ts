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
  onEvent(event: string, cb: () => void): void
  openTelegramLink(url: string): void
  initDataUnsafe?: { start_param?: string }
  colorScheme: 'light' | 'dark'
  themeParams: Record<string, string>
  version: string
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
