import { tg } from './telegram'

const API_URL = 'https://beerlog-api.docevig.workers.dev'

export interface FriendTotals {
  tg_id: number
  name: string
  photo_url: string | null
  ml: number
  portions: number
  styles: number
  avg_srm: number
  /** JSON-массив кодов стилей за месяц — по нему сравниваются вкусы */
  styles_list: string
  /** JSON {код стиля: время первого раза} — кто открыл стиль раньше */
  styles_first?: string
  /** Когда друг последний раз обновлял свою витрину */
  updated_at: number
  /** Сколько вечеров провели вместе и когда виделись в последний раз */
  evenings: number
  last_evening: number
}

export interface MonthTotals {
  period: string
  ml: number
  portions: number
  styles: number
  avgSrm: number
  stylesList: string[]
  stylesFirst: Record<string, number>
}

/** Сервер доступен только внутри Telegram: без подписи он ничего не отдаст */
export function apiAvailable(): boolean {
  return Boolean(tg()?.initData)
}

/**
 * Дольше ждать нет смысла: без предела запрос по капризной сети висит
 * бесконечно, и экран навсегда застревает на «спрашиваем сервер».
 */
const TIMEOUT_MS = 12_000

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const initData = tg()?.initData
  if (!initData) throw new Error('доступно только внутри Telegram')

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        // Подпись Telegram — единственное удостоверение личности для сервера
        'x-init-data': initData,
        ...(init.headers ?? {}),
      },
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      throw new Error('сервер не ответил — проверь связь и попробуй ещё раз')
    }
    throw new Error('нет связи с сервером')
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(detail.error ?? `сервер ответил ${response.status}`)
  }

  return (await response.json()) as T
}

/** Витрина итогов перезаписывается целиком — так она не разойдётся с дневником */
export function pushTotals(totals: MonthTotals): Promise<{ ok: boolean }> {
  return request('/sync/totals', { method: 'POST', body: JSON.stringify(totals) })
}

/** period — «YYYY-MM» либо «all» для всего времени */
export function fetchFriends(period: string): Promise<{ friends: FriendTotals[] }> {
  return request(`/friends?period=${encodeURIComponent(period)}`)
}

export function removeFriend(id: number): Promise<{ ok: boolean }> {
  return request(`/friends/${id}`, { method: 'DELETE' })
}

export function createInvite(): Promise<{ code: string; expiresAt: number }> {
  return request('/invites', { method: 'POST', body: JSON.stringify({ kind: 'friend' }) })
}

export interface PartySummary {
  id: string
  title: string | null
  host_id: number
  started_at: number
  ended_at: number | null
  members: number
  ml: number
  portions: number
}

export interface PartyMember {
  tg_id: number
  name: string
  photo_url: string | null
}

export interface PartyEntry {
  id: string
  tg_id: number
  ts: number
  ml: number
  style: string
  name: string | null
}

export interface PartyState {
  party: PartySummary
  members: PartyMember[]
  entries: PartyEntry[]
}

export interface PartyStats {
  evenings: number
  companions: { name: string; evenings: number }[]
  styles: { style: string; times: number }[]
  longest: { id: string; started_at: number; ended_at: number; duration: number } | null
  crowded: { id: string; started_at: number; members: number } | null
}

/** Список приходит вместе с состоянием активного стола — одним запросом */
export function listParties(): Promise<{ parties: PartySummary[]; active: PartyState | null }> {
  return request('/parties')
}

export function fetchPartyStats(): Promise<PartyStats> {
  return request('/parties/stats')
}

export function startParty(title?: string): Promise<{ id: string; startedAt: number }> {
  return request('/parties', { method: 'POST', body: JSON.stringify({ title }) })
}

export function fetchParty(id: string): Promise<PartyState> {
  return request(`/parties/${id}`)
}

export function pushPartyEntry(
  id: string,
  entry: { id: string; ts: number; ml: number; style: string; name?: string },
): Promise<{ ok: boolean }> {
  return request(`/parties/${id}/entries`, { method: 'POST', body: JSON.stringify(entry) })
}

export function closeParty(id: string): Promise<{ ok: boolean }> {
  return request(`/parties/${id}/close`, { method: 'POST' })
}

/** Стирает вечер у всех участников; личные дневники не затрагиваются */
export function deleteParty(id: string): Promise<{ ok: boolean }> {
  return request(`/parties/${id}`, { method: 'DELETE' })
}

/** Убирает вечер только у себя — у остальных он остаётся */
export function leaveParty(id: string): Promise<{ ok: boolean }> {
  return request(`/parties/${id}/leave`, { method: 'POST' })
}

export function partyInvite(partyId: string): Promise<{ code: string; expiresAt: number }> {
  return request('/invites', { method: 'POST', body: JSON.stringify({ kind: 'party', partyId }) })
}

export function acceptInvite(code: string): Promise<{ ok: boolean; kind: string }> {
  return request(`/invites/${encodeURIComponent(code)}/accept`, { method: 'POST' })
}

/**
 * Фото профиля. Запрашиваем через fetch, а не подставляем адрес в img:
 * серверу нужна подпись в заголовке, а тег картинки её передать не умеет.
 */
const avatarCache = new Map<number, string | null>()

export async function loadAvatar(tgId: number): Promise<string | null> {
  if (avatarCache.has(tgId)) return avatarCache.get(tgId) ?? null

  const initData = tg()?.initData
  if (!initData) return null

  try {
    const response = await fetch(`${API_URL}/avatar/${tgId}`, {
      headers: { 'x-init-data': initData },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      avatarCache.set(tgId, null)
      return null
    }

    const url = URL.createObjectURL(await response.blob())
    avatarCache.set(tgId, url)
    return url
  } catch {
    // Нет фото — не беда, останется кружок с инициалом
    avatarCache.set(tgId, null)
    return null
  }
}

/** Ссылка-приглашение: код уезжает в start_param и прилетает обратно при открытии */
export function inviteLink(code: string): string {
  return `https://t.me/beerlogs_bot/app?startapp=${code}`
}
