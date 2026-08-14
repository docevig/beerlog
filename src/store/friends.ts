import { useEntries } from './entries'

/**
 * Как человек подписан у тебя. Свои имена живут в профиле и раньше
 * применялись только в списке компании: на столе вечера тот же друг
 * выходил под именем из Telegram и выглядел вторым участником.
 */
export function useFriendNames() {
  const { profile } = useEntries()

  /** fallback — имя из Telegram; своё, если оно задано, важнее */
  function nameOf(tgId: number, fallback: string): string {
    return profile.value.friendNames?.[String(tgId)] || fallback
  }

  function rename(tgId: number, name: string): Record<string, string> {
    const names = { ...(profile.value.friendNames ?? {}) }
    const trimmed = name.trim()

    // Пустое имя — не пустая подпись, а отказ от своей: возвращаемся к телеграмному
    if (trimmed) names[String(tgId)] = trimmed
    else delete names[String(tgId)]

    return names
  }

  return { nameOf, rename }
}
