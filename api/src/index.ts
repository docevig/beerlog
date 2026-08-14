import { verifyInitData, type TgUser } from './auth'

/** Единственный источник, которому разрешено обращаться к API */
const ALLOWED_ORIGIN = 'https://docevig.github.io'

/** Приглашение живёт сутки: утёкшая в чужой чат ссылка протухает сама */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000

/** Заброшенная попойка закрывается сама, чтобы не висеть активной вечно */
const PARTY_IDLE_MS = 12 * 60 * 60 * 1000

interface Ctx {
  env: Env
  user: TgUser
  startParam?: string
  url: URL
  request: Request
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': ALLOWED_ORIGIN,
      'access-control-allow-headers': 'content-type, x-init-data',
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    },
  })
}

function log(message: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ message, ...extra }))
}

/** Пара для таблицы дружбы всегда упорядочена, чтобы связь не задвоилась */
function pair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a]
}

async function ensureUser(ctx: Ctx): Promise<void> {
  await ctx.env.DB.prepare(
    `INSERT INTO users (tg_id, name, photo_url, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (tg_id) DO UPDATE SET name = excluded.name, photo_url = excluded.photo_url`,
  )
    .bind(ctx.user.id, ctx.user.name, ctx.user.photoUrl ?? null, Date.now())
    .run()
}

/** Витрина итогов перезаписывается целиком: правка по частям разошлась бы с дневником */
async function syncTotals(ctx: Ctx): Promise<Response> {
  const body = (await ctx.request.json()) as {
    period?: string
    ml?: number
    portions?: number
    styles?: number
    avgSrm?: number
  }

  if (!body.period || !/^\d{4}-\d{2}$/.test(body.period)) {
    return json({ error: 'период должен быть в формате YYYY-MM' }, 400)
  }

  await ctx.env.DB.prepare(
    `INSERT INTO totals (tg_id, period, ml, portions, styles, avg_srm, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (tg_id, period) DO UPDATE SET
       ml = excluded.ml, portions = excluded.portions, styles = excluded.styles,
       avg_srm = excluded.avg_srm, updated_at = excluded.updated_at`,
  )
    .bind(
      ctx.user.id,
      body.period,
      Math.max(0, Math.round(body.ml ?? 0)),
      Math.max(0, Math.round(body.portions ?? 0)),
      Math.max(0, Math.round(body.styles ?? 0)),
      body.avgSrm ?? 0,
      Date.now(),
    )
    .run()

  return json({ ok: true })
}

async function listFriends(ctx: Ctx): Promise<Response> {
  const period = ctx.url.searchParams.get('period') ?? ''
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return json({ error: 'период должен быть в формате YYYY-MM' }, 400)
  }

  const { results } = await ctx.env.DB.prepare(
    `SELECT u.tg_id, u.name, u.photo_url,
            COALESCE(t.ml, 0) AS ml,
            COALESCE(t.portions, 0) AS portions,
            COALESCE(t.styles, 0) AS styles,
            COALESCE(t.avg_srm, 0) AS avg_srm
       FROM friendships f
       JOIN users u
         ON u.tg_id = CASE WHEN f.low_id = ?1 THEN f.high_id ELSE f.low_id END
       LEFT JOIN totals t ON t.tg_id = u.tg_id AND t.period = ?2
      WHERE f.low_id = ?1 OR f.high_id = ?1
      ORDER BY ml DESC`,
  )
    .bind(ctx.user.id, period)
    .all()

  return json({ friends: results })
}

async function createInvite(ctx: Ctx): Promise<Response> {
  const body = (await ctx.request.json()) as { kind?: string; partyId?: string }
  const kind = body.kind === 'party' ? 'party' : 'friend'

  if (kind === 'party' && !body.partyId) {
    return json({ error: 'для приглашения в попойку нужен её идентификатор' }, 400)
  }

  // Код должен быть непредсказуемым: по нему открывается доступ к статистике
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const code = [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20)

  await ctx.env.DB.prepare(
    `INSERT INTO invites (code, kind, author_id, party_id, expires_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(code, kind, ctx.user.id, body.partyId ?? null, Date.now() + INVITE_TTL_MS)
    .run()

  return json({ code, expiresAt: Date.now() + INVITE_TTL_MS })
}

async function acceptInvite(ctx: Ctx, code: string): Promise<Response> {
  const invite = await ctx.env.DB.prepare(
    `SELECT code, kind, author_id, party_id, expires_at, used_by FROM invites WHERE code = ?`,
  )
    .bind(code)
    .first<{ kind: string; author_id: number; party_id: string | null; expires_at: number; used_by: number | null }>()

  if (!invite) return json({ error: 'приглашение не найдено' }, 404)
  if (invite.used_by !== null) return json({ error: 'приглашение уже использовано' }, 409)
  if (invite.expires_at < Date.now()) return json({ error: 'срок приглашения истёк' }, 410)
  if (invite.author_id === ctx.user.id) return json({ error: 'нельзя принять своё приглашение' }, 400)

  const now = Date.now()

  if (invite.kind === 'friend') {
    const [low, high] = pair(invite.author_id, ctx.user.id)
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(
        `INSERT INTO friendships (low_id, high_id, since) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
      ).bind(low, high, now),
      ctx.env.DB.prepare(`UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?`).bind(ctx.user.id, now, code),
    ])
    return json({ ok: true, kind: 'friend' })
  }

  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `INSERT INTO party_members (party_id, tg_id, joined_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    ).bind(invite.party_id, ctx.user.id, now),
    ctx.env.DB.prepare(`UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?`).bind(ctx.user.id, now, code),
  ])

  return json({ ok: true, kind: 'party', partyId: invite.party_id })
}

async function createParty(ctx: Ctx): Promise<Response> {
  const body = (await ctx.request.json().catch(() => ({}))) as { title?: string }
  const id = crypto.randomUUID()
  const now = Date.now()

  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO parties (id, title, host_id, started_at) VALUES (?, ?, ?, ?)`).bind(
      id,
      body.title ?? null,
      ctx.user.id,
      now,
    ),
    ctx.env.DB.prepare(`INSERT INTO party_members (party_id, tg_id, joined_at) VALUES (?, ?, ?)`).bind(
      id,
      ctx.user.id,
      now,
    ),
  ])

  return json({ id, startedAt: now })
}

async function isMember(ctx: Ctx, partyId: string): Promise<boolean> {
  const row = await ctx.env.DB.prepare(`SELECT 1 AS ok FROM party_members WHERE party_id = ? AND tg_id = ?`)
    .bind(partyId, ctx.user.id)
    .first<{ ok: number }>()
  return row !== null
}

async function addPartyEntry(ctx: Ctx, partyId: string): Promise<Response> {
  if (!(await isMember(ctx, partyId))) return json({ error: 'вы не за этим столом' }, 403)

  const party = await ctx.env.DB.prepare(`SELECT ended_at FROM parties WHERE id = ?`)
    .bind(partyId)
    .first<{ ended_at: number | null }>()

  if (!party) return json({ error: 'попойка не найдена' }, 404)
  if (party.ended_at !== null) return json({ error: 'вечер уже закрыт' }, 409)

  const body = (await ctx.request.json()) as { id?: string; ts?: number; ml?: number; style?: string; name?: string }
  if (!body.ml || body.ml <= 0 || !body.style) {
    return json({ error: 'нужны объём и стиль' }, 400)
  }

  await ctx.env.DB.prepare(
    `INSERT INTO party_entries (id, party_id, tg_id, ts, ml, style, name) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO NOTHING`,
  )
    .bind(
      body.id ?? crypto.randomUUID(),
      partyId,
      ctx.user.id,
      body.ts ?? Date.now(),
      Math.round(body.ml),
      body.style,
      body.name ?? null,
    )
    .run()

  return json({ ok: true })
}

async function getParty(ctx: Ctx, partyId: string): Promise<Response> {
  if (!(await isMember(ctx, partyId))) return json({ error: 'вы не за этим столом' }, 403)

  const party = await ctx.env.DB.prepare(`SELECT id, title, host_id, started_at, ended_at FROM parties WHERE id = ?`)
    .bind(partyId)
    .first()

  if (!party) return json({ error: 'попойка не найдена' }, 404)

  const [members, entries] = await Promise.all([
    ctx.env.DB.prepare(
      `SELECT u.tg_id, u.name, u.photo_url FROM party_members m JOIN users u ON u.tg_id = m.tg_id WHERE m.party_id = ?`,
    )
      .bind(partyId)
      .all(),
    ctx.env.DB.prepare(`SELECT id, tg_id, ts, ml, style, name FROM party_entries WHERE party_id = ? ORDER BY ts`)
      .bind(partyId)
      .all(),
  ])

  return json({ party, members: members.results, entries: entries.results })
}

async function closeParty(ctx: Ctx, partyId: string): Promise<Response> {
  const party = await ctx.env.DB.prepare(`SELECT host_id, ended_at FROM parties WHERE id = ?`)
    .bind(partyId)
    .first<{ host_id: number; ended_at: number | null }>()

  if (!party) return json({ error: 'попойка не найдена' }, 404)
  if (party.host_id !== ctx.user.id) return json({ error: 'закрыть вечер может только тот, кто его начал' }, 403)

  await ctx.env.DB.prepare(`UPDATE parties SET ended_at = ? WHERE id = ? AND ended_at IS NULL`)
    .bind(Date.now(), partyId)
    .run()

  return json({ ok: true })
}

async function route(ctx: Ctx): Promise<Response> {
  const { pathname } = ctx.url
  const method = ctx.request.method

  if (method === 'POST' && pathname === '/sync/totals') return syncTotals(ctx)
  if (method === 'GET' && pathname === '/friends') return listFriends(ctx)
  if (method === 'POST' && pathname === '/invites') return createInvite(ctx)
  if (method === 'POST' && pathname === '/parties') return createParty(ctx)

  const accept = pathname.match(/^\/invites\/([A-Za-z0-9_-]{1,64})\/accept$/)
  if (method === 'POST' && accept) return acceptInvite(ctx, accept[1])

  const party = pathname.match(/^\/parties\/([A-Za-z0-9-]{36})$/)
  if (method === 'GET' && party) return getParty(ctx, party[1])

  const partyEntries = pathname.match(/^\/parties\/([A-Za-z0-9-]{36})\/entries$/)
  if (method === 'POST' && partyEntries) return addPartyEntry(ctx, partyEntries[1])

  const partyClose = pathname.match(/^\/parties\/([A-Za-z0-9-]{36})\/close$/)
  if (method === 'POST' && partyClose) return closeParty(ctx, partyClose[1])

  return json({ error: 'неизвестный метод' }, 404)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return json({}, 204)

    try {
      const initData = request.headers.get('x-init-data') ?? ''
      const verified = await verifyInitData(initData, env.BOT_TOKEN)

      if (!verified) {
        log('отклонена неподписанная попытка', { path: new URL(request.url).pathname })
        return json({ error: 'подпись не подтверждена' }, 401)
      }

      const context: Ctx = {
        env,
        user: verified.user,
        startParam: verified.startParam,
        url: new URL(request.url),
        request,
      }

      // Профиль обновляем в фоне: ответ не должен ждать записи имени
      ctx.waitUntil(ensureUser(context))

      return await route(context)
    } catch (error) {
      log('необработанная ошибка', { error: error instanceof Error ? error.message : String(error) })
      return json({ error: 'внутренняя ошибка' }, 500)
    }
  },

  /** Раз в час закрываем вечера, о которых все забыли */
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const cutoff = Date.now() - PARTY_IDLE_MS
    const result = await env.DB.prepare(
      `UPDATE parties SET ended_at = ?1
        WHERE ended_at IS NULL
          AND COALESCE((SELECT MAX(ts) FROM party_entries WHERE party_id = parties.id), started_at) < ?2`,
    )
      .bind(Date.now(), cutoff)
      .run()

    log('закрыты заброшенные попойки', { count: result.meta.changes })
  },
}
