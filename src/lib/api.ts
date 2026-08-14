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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const initData = tg()?.initData
  if (!initData) throw new Error('доступно только внутри Telegram')

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      // Подпись Telegram — единственное удостоверение личности для сервера
      'x-init-data': initData,
      ...(init.headers ?? {}),
    },
  })

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

export function listParties(): Promise<{ parties: PartySummary[] }> {
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

export function partyInvite(partyId: string): Promise<{ code: string; expiresAt: number }> {
  return request('/invites', { method: 'POST', body: JSON.stringify({ kind: 'party', partyId }) })
}

export function acceptInvite(code: string): Promise<{ ok: boolean; kind: string }> {
  return request(`/invites/${encodeURIComponent(code)}/accept`, { method: 'POST' })
}

/** Ссылка-приглашение: код уезжает в start_param и прилетает обратно при открытии */
export function inviteLink(code: string): string {
  return `https://t.me/beerlogs_bot/app?startapp=${code}`
}
