import { verifyInitDataDetailed, type TgUser } from './auth'

/** Единственный источник, которому разрешено обращаться к API */
const ALLOWED_ORIGIN = 'https://docevig.github.io'

/** Приглашение живёт сутки: утёкшая в чужой чат ссылка протухает сама */
const INVITE_TTL_MS = 24 * 60 * 60 * 1000

/** Заброшенная вечеринка закрывается сама, чтобы не висеть активной вечно */
const PARTY_IDLE_MS = 12 * 60 * 60 * 1000

interface Ctx {
  env: Env
  user: TgUser
  startParam?: string
  url: URL
  request: Request
  /** Фоновая работа после ответа; привязан к платформенному контексту */
  waitUntil: (work: Promise<unknown>) => void
}

const CORS_HEADERS = {
  'access-control-allow-origin': ALLOWED_ORIGIN,
  'access-control-allow-headers': 'content-type, x-init-data',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-max-age': '86400',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  })
}

/**
 * Ответ на предварительный запрос. Тело здесь недопустимо: статус 204
 * означает «без содержимого», и Response с телом на нём падает —
 * из-за чего до самого запроса дело вообще не доходило.
 */
function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
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

/**
 * Свой профиль: имя и значок-аватарка.
 *
 * Имя пишется в отдельную колонку, а не поверх телеграмного: `ensureUser`
 * обновляет `name` из подписи при каждом входе и затёр бы своё имя сразу же.
 */
async function saveProfile(ctx: Ctx): Promise<Response> {
  const body = (await ctx.request.json()) as { name?: string | null; avatar?: string | null }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : null
  const avatar = typeof body.avatar === 'string' ? body.avatar.trim().slice(0, 32) : null

  // Значок хранится строкой «эмодзи|#цвет»; форму проверяем, чтобы не пустить произвольное
  if (avatar && !/^.{1,8}\|#[0-9A-Fa-f]{6}$/.test(avatar)) {
    return json({ error: 'непонятный значок' }, 400)
  }

  await ctx.env.DB.prepare(
    `UPDATE users SET custom_name = ?, avatar = ?, avatar_file_id = CASE WHEN ? IS NOT NULL THEN NULL ELSE avatar_file_id END
      WHERE tg_id = ?`,
  )
    .bind(name || null, avatar || null, avatar || null, ctx.user.id)
    .run()

  return json({ ok: true })
}

/**
 * Запоминает последний выбор — им бот предлагает «ещё такое же».
 * Дневник ему недоступен, так что иначе он про твои привычки не узнает.
 */
async function saveLastChoice(ctx: Ctx): Promise<Response> {
  const body = (await ctx.request.json()) as { ml?: number; style?: string }
  const ml = Math.round(body.ml ?? 0)

  if (!ml || ml < 10 || ml > 10_000) return json({ error: 'непонятный объём' }, 400)
  if (!body.style || !/^[a-z_]{1,24}$/.test(body.style)) return json({ error: 'непонятный стиль' }, 400)

  await ctx.env.DB.prepare(`UPDATE users SET last_ml = ?, last_style = ? WHERE tg_id = ?`)
    .bind(ml, body.style, ctx.user.id)
    .run()

  return json({ ok: true })
}

/** Отметки, сделанные в переписке и ещё не попавшие в дневник */
async function listInbox(ctx: Ctx): Promise<Response> {
  const { results } = await ctx.env.DB.prepare(
    `SELECT id, ts, ml, style FROM inbox WHERE tg_id = ? ORDER BY ts LIMIT 200`,
  )
    .bind(ctx.user.id)
    .all()

  return json({ entries: results })
}

/**
 * Подтверждение приёма: удаляем только то, что клиент назвал поимённо.
 * Чистить всё подряд нельзя — между выборкой и подтверждением человек мог
 * отметить ещё кружку, и она пропала бы, не доехав до дневника.
 */
async function ackInbox(ctx: Ctx): Promise<Response> {
  const body = (await ctx.request.json()) as { ids?: string[] }
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === 'string').slice(0, 200) : []
  if (ids.length === 0) return json({ ok: true })

  const marks = ids.map(() => '?').join(',')
  await ctx.env.DB.prepare(`DELETE FROM inbox WHERE tg_id = ? AND id IN (${marks})`)
    .bind(ctx.user.id, ...ids)
    .run()

  return json({ ok: true })
}

/** Аватарка своим фото. Хранит её Telegram — тем же приёмом, что и этикетки */
async function uploadAvatar(ctx: Ctx): Promise<Response> {
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return json({ error: 'это не изображение' }, 415)

  const bytes = await ctx.request.arrayBuffer()
  if (bytes.byteLength === 0) return json({ error: 'пустой файл' }, 400)
  if (bytes.byteLength > 300_000) return json({ error: 'аватарка слишком большая' }, 413)

  const api = `https://api.telegram.org/bot${ctx.env.BOT_TOKEN}`
  const form = new FormData()
  form.append('chat_id', String(ctx.user.id))
  form.append('disable_notification', 'true')
  // Обезличенные байты: с расширением .webp Telegram счёл бы файл стикером
  form.append('document', new Blob([bytes], { type: 'application/octet-stream' }), 'avatar.bin')

  const sent = (await (await fetch(`${api}/sendDocument`, { method: 'POST', body: form })).json()) as {
    ok: boolean
    description?: string
    result?: { message_id: number; document?: { file_id: string }; sticker?: { file_id: string } }
  }

  const message = sent.result
  const fileId = message?.document?.file_id ?? message?.sticker?.file_id

  if (message?.message_id) {
    ctx.waitUntil(
      fetch(`${api}/deleteMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: ctx.user.id, message_id: message.message_id }),
      }).then(() => undefined),
    )
  }

  if (!sent.ok || !fileId) {
    log('аватарка не сохранилась', { description: sent.description })
    return json({ error: 'аватарка не загрузилась' }, 502)
  }

  // Фото важнее значка: оставлять оба нельзя, иначе непонятно, что показывать
  await ctx.env.DB.prepare(`UPDATE users SET avatar_file_id = ?, avatar = NULL WHERE tg_id = ?`)
    .bind(fileId, ctx.user.id)
    .run()

  return json({ ok: true })
}

/**
 * Стирает всё, что о человеке знает сервер. Личный дневник остаётся:
 * он лежит в Telegram, и убрать его оттуда может только сам владелец.
 *
 * Свои вечера удаляем целиком — гость, оставшийся за столом без хозяина,
 * видел бы вечер, которого для остальных уже нет.
 */
async function deleteAccount(ctx: Ctx): Promise<Response> {
  const me = ctx.user.id

  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`DELETE FROM party_entries WHERE party_id IN (SELECT id FROM parties WHERE host_id = ?)`).bind(me),
    ctx.env.DB.prepare(`DELETE FROM party_members WHERE party_id IN (SELECT id FROM parties WHERE host_id = ?)`).bind(me),
    ctx.env.DB.prepare(`DELETE FROM parties WHERE host_id = ?`).bind(me),
    ctx.env.DB.prepare(`DELETE FROM party_entries WHERE tg_id = ?`).bind(me),
    ctx.env.DB.prepare(`DELETE FROM party_members WHERE tg_id = ?`).bind(me),
    ctx.env.DB.prepare(`DELETE FROM friendships WHERE low_id = ? OR high_id = ?`).bind(me, me),
    ctx.env.DB.prepare(`DELETE FROM invites WHERE author_id = ?`).bind(me),
    ctx.env.DB.prepare(`DELETE FROM photos WHERE tg_id = ?`).bind(me),
    ctx.env.DB.prepare(`DELETE FROM totals WHERE tg_id = ?`).bind(me),
    ctx.env.DB.prepare(`DELETE FROM users WHERE tg_id = ?`).bind(me),
  ])

  return json({ ok: true })
}

/** Витрина итогов перезаписывается целиком: правка по частям разошлась бы с дневником */
async function syncTotals(ctx: Ctx): Promise<Response> {
  const body = (await ctx.request.json()) as {
    period?: string
    ml?: number
    portions?: number
    styles?: number
    avgSrm?: number
    stylesList?: string[]
    stylesFirst?: Record<string, number>
  }

  if (!body.period || !/^\d{4}-\d{2}$/.test(body.period)) {
    return json({ error: 'период должен быть в формате YYYY-MM' }, 400)
  }

  // Коды стилей: чужие строки в витрину не пускаем, длину ограничиваем
  const stylesList = Array.isArray(body.stylesList)
    ? body.stylesList.filter((s) => typeof s === 'string' && /^[a-z_]{1,24}$/.test(s)).slice(0, 40)
    : []

  // Даты первого раза: только известные коды и разумные времена
  const stylesFirst: Record<string, number> = {}
  if (body.stylesFirst && typeof body.stylesFirst === 'object') {
    for (const [code, ts] of Object.entries(body.stylesFirst)) {
      if (/^[a-z_]{1,24}$/.test(code) && typeof ts === 'number' && Number.isFinite(ts)) {
        stylesFirst[code] = Math.round(ts)
      }
    }
  }

  await ctx.env.DB.prepare(
    `INSERT INTO totals (tg_id, period, ml, portions, styles, avg_srm, styles_list, styles_first, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (tg_id, period) DO UPDATE SET
       ml = excluded.ml, portions = excluded.portions, styles = excluded.styles,
       avg_srm = excluded.avg_srm, styles_list = excluded.styles_list,
       styles_first = excluded.styles_first, updated_at = excluded.updated_at`,
  )
    .bind(
      ctx.user.id,
      body.period,
      Math.max(0, Math.round(body.ml ?? 0)),
      Math.max(0, Math.round(body.portions ?? 0)),
      Math.max(0, Math.round(body.styles ?? 0)),
      body.avgSrm ?? 0,
      JSON.stringify(stylesList),
      JSON.stringify(stylesFirst),
      Date.now(),
    )
    .run()

  return json({ ok: true })
}

async function listFriends(ctx: Ctx): Promise<Response> {
  const period = ctx.url.searchParams.get('period') ?? ''
  const allTime = period === 'all'

  if (!allTime && !/^\d{4}-\d{2}$/.test(period)) {
    return json({ error: 'период должен быть YYYY-MM или all' }, 400)
  }

  /*
    Общее для обоих режимов: к каждому другу цепляем, сколько вечеров вы
    провели вместе и когда виделись в последний раз — это про отношения,
    и в интерфейсе стоит выше любых литров.
  */
  const shared = `
    LEFT JOIN (
      SELECT theirs.tg_id AS friend_id,
             COUNT(*) AS evenings,
             MAX(p.started_at) AS last_evening
        FROM party_members mine
        JOIN party_members theirs
          ON theirs.party_id = mine.party_id AND theirs.tg_id != mine.tg_id
        JOIN parties p ON p.id = mine.party_id
       WHERE mine.tg_id = ?1
       GROUP BY theirs.tg_id
    ) ev ON ev.friend_id = u.tg_id`

  // За всё время суммируем месяцы; список стилей склеиваем на клиенте
  const query = allTime
    ? `SELECT u.tg_id, COALESCE(u.custom_name, u.name) AS name, u.avatar, u.avatar_file_id IS NOT NULL AS has_photo,
              COALESCE(SUM(t.ml), 0) AS ml,
              COALESCE(SUM(t.portions), 0) AS portions,
              COALESCE(MAX(t.styles), 0) AS styles,
              COALESCE(AVG(NULLIF(t.avg_srm, 0)), 0) AS avg_srm,
              COALESCE(GROUP_CONCAT(t.styles_list, '|'), '') AS styles_list,
              COALESCE(MAX(t.updated_at), 0) AS updated_at,
              COALESCE(MAX(ev.evenings), 0) AS evenings,
              COALESCE(MAX(ev.last_evening), 0) AS last_evening
         FROM friendships f
         JOIN users u
           ON u.tg_id = CASE WHEN f.low_id = ?1 THEN f.high_id ELSE f.low_id END
         LEFT JOIN totals t ON t.tg_id = u.tg_id
         ${shared}
        WHERE f.low_id = ?1 OR f.high_id = ?1
        GROUP BY u.tg_id`
    : `SELECT u.tg_id, COALESCE(u.custom_name, u.name) AS name, u.avatar, u.avatar_file_id IS NOT NULL AS has_photo,
              COALESCE(t.ml, 0) AS ml,
              COALESCE(t.portions, 0) AS portions,
              COALESCE(t.styles, 0) AS styles,
              COALESCE(t.avg_srm, 0) AS avg_srm,
              COALESCE(t.styles_list, '[]') AS styles_list,
              COALESCE(t.styles_first, '{}') AS styles_first,
              COALESCE(t.updated_at, 0) AS updated_at,
              COALESCE(ev.evenings, 0) AS evenings,
              COALESCE(ev.last_evening, 0) AS last_evening
         FROM friendships f
         JOIN users u
           ON u.tg_id = CASE WHEN f.low_id = ?1 THEN f.high_id ELSE f.low_id END
         LEFT JOIN totals t ON t.tg_id = u.tg_id AND t.period = ?2
         ${shared}
        WHERE f.low_id = ?1 OR f.high_id = ?1`

  const statement = allTime
    ? ctx.env.DB.prepare(query).bind(ctx.user.id)
    : ctx.env.DB.prepare(query).bind(ctx.user.id, period)

  const { results } = await statement.all()
  return json({ friends: results })
}

/** Видеть фото можно только у своих: друзей и соседей по столу */
async function maySeeAvatar(ctx: Ctx, targetId: number): Promise<boolean> {
  if (targetId === ctx.user.id) return true

  const [low, high] = pair(ctx.user.id, targetId)
  const friend = await ctx.env.DB.prepare(
    `SELECT 1 AS ok FROM friendships WHERE low_id = ? AND high_id = ?`,
  )
    .bind(low, high)
    .first()

  if (friend) return true

  const together = await ctx.env.DB.prepare(
    `SELECT 1 AS ok
       FROM party_members mine
       JOIN party_members theirs ON theirs.party_id = mine.party_id
      WHERE mine.tg_id = ? AND theirs.tg_id = ?
      LIMIT 1`,
  )
    .bind(ctx.user.id, targetId)
    .first()

  return together !== null
}

/**
 * Отдаёт фото профиля картинкой.
 *
 * Напрямую ссылку Telegram отдать нельзя: она содержит токен бота
 * (api.telegram.org/file/bot<TOKEN>/...). Поэтому файл забирает Worker
 * и переливает клиенту, а токен остаётся на сервере.
 */
/** Переливает файл из Telegram клиенту: токен наружу отдавать нельзя */
async function sendTelegramFile(ctx: Ctx, fileId: string): Promise<Response> {
  const api = `https://api.telegram.org/bot${ctx.env.BOT_TOKEN}`

  const file = (await (await fetch(`${api}/getFile?file_id=${encodeURIComponent(fileId)}`)).json()) as {
    ok: boolean
    result?: { file_path: string }
  }

  if (!file.ok || !file.result) return json({ error: 'фото недоступно' }, 404)

  const image = await fetch(`https://api.telegram.org/file/bot${ctx.env.BOT_TOKEN}/${file.result.file_path}`)
  if (!image.ok) return json({ error: 'фото недоступно' }, 404)

  return new Response(image.body, {
    headers: {
      'content-type': image.headers.get('content-type') ?? 'image/jpeg',
      // Меняется редко, а новая аватарка получает свой идентификатор
      'cache-control': 'private, max-age=86400',
      ...CORS_HEADERS,
    },
  })
}

async function avatar(ctx: Ctx, targetId: number): Promise<Response> {
  if (!(await maySeeAvatar(ctx, targetId))) {
    return json({ error: 'это не ваш человек' }, 403)
  }

  const api = `https://api.telegram.org/bot${ctx.env.BOT_TOKEN}`

  /*
    Своя аватарка важнее телеграмной: её человек выбрал сам, а фото профиля
    в Telegram почти всегда закрыто приватностью и приходит пустым списком.
  */
  const own = await ctx.env.DB.prepare(`SELECT avatar_file_id FROM users WHERE tg_id = ?`)
    .bind(targetId)
    .first<{ avatar_file_id: string | null }>()

  if (own?.avatar_file_id) return sendTelegramFile(ctx, own.avatar_file_id)

  const photos = (await (await fetch(`${api}/getUserProfilePhotos?user_id=${targetId}&limit=1`)).json()) as {
    ok: boolean
    result?: { total_count: number; photos: { file_id: string; width: number }[][] }
  }

  const smallest = photos.result?.photos?.[0]?.[0]
  if (!photos.ok || !smallest) {
    // Частая причина — приватность: бот не входит в круг, которому видно фото
    log('фото профиля недоступно', {
      targetId,
      apiOk: photos.ok,
      totalCount: photos.result?.total_count ?? 0,
    })
    return json({ error: 'фото нет' }, 404)
  }

  const file = (await (await fetch(`${api}/getFile?file_id=${smallest.file_id}`)).json()) as {
    ok: boolean
    result?: { file_path: string }
  }

  if (!file.ok || !file.result) return json({ error: 'фото недоступно' }, 404)

  const image = await fetch(`https://api.telegram.org/file/bot${ctx.env.BOT_TOKEN}/${file.result.file_path}`)
  if (!image.ok) return json({ error: 'фото недоступно' }, 404)

  return new Response(image.body, {
    headers: {
      'content-type': image.headers.get('content-type') ?? 'image/jpeg',
      // Фото профиля меняется редко — сутки кэша экономят обращения к Bot API
      'cache-control': 'private, max-age=86400',
      ...CORS_HEADERS,
    },
  })
}

/** Больше сжатого снимка быть не должно: клиент шлёт 600 px в webp */
const MAX_PHOTO_BYTES = 600_000

/**
 * Принимает фото этикетки и складывает его в Telegram.
 *
 * Объектное хранилище Cloudflare требует платной подписки, а Telegram
 * держит файлы бесплатно и бессрочно. Снимок отправляется владельцу
 * документом (так он сохраняется байт-в-байт, без пережатия), сообщение
 * сразу удаляется, а идентификатор файла продолжает работать.
 */
async function uploadPhoto(ctx: Ctx): Promise<Response> {
  const beerKey = (ctx.url.searchParams.get('beer') ?? '').trim().toLowerCase().slice(0, 120)
  if (!beerKey) return json({ error: 'не указан сорт' }, 400)

  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return json({ error: 'это не изображение' }, 415)

  const bytes = await ctx.request.arrayBuffer()
  if (bytes.byteLength === 0) return json({ error: 'пустой файл' }, 400)
  if (bytes.byteLength > MAX_PHOTO_BYTES) return json({ error: 'снимок слишком большой' }, 413)

  /*
    Имя и тип нарочно обезличены. Файл с расширением .webp Telegram считает
    стикером и возвращает его полем sticker, а не document — из-за чего снимок
    терялся сразу после отправки. Настоящий тип хранится у нас и подставляется
    при выдаче.
  */
  const api = `https://api.telegram.org/bot${ctx.env.BOT_TOKEN}`
  const form = new FormData()
  form.append('chat_id', String(ctx.user.id))
  form.append('disable_notification', 'true')
  form.append('document', new Blob([bytes], { type: 'application/octet-stream' }), 'label.bin')

  const sent = (await (
    await fetch(`${api}/sendDocument`, { method: 'POST', body: form })
  ).json()) as {
    ok: boolean
    description?: string
    result?: {
      message_id: number
      document?: { file_id: string }
      sticker?: { file_id: string }
      photo?: { file_id: string }[]
    }
  }

  // Разбор классификации на стороне Telegram: она задана не нами, поэтому смотрим все поля
  const message = sent.result
  const photo = message?.photo
  const fileId =
    message?.document?.file_id ??
    message?.sticker?.file_id ??
    (photo && photo.length ? photo[photo.length - 1].file_id : undefined)

  // Сообщение убираем при любом исходе, иначе неудача оставляет снимок в переписке
  if (message?.message_id) {
    ctx.waitUntil(
      fetch(`${api}/deleteMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: ctx.user.id, message_id: message.message_id }),
      }).then(() => undefined),
    )
  }

  if (!sent.ok || !fileId) {
    log('не удалось сохранить снимок', {
      description: sent.description,
      // Поля ответа: по ним видно, чем Telegram счёл файл на этот раз
      fields: message ? Object.keys(message) : [],
    })
    // Другая частая причина — пользователь запретил боту писать ему
    return json({ error: 'не удалось сохранить снимок' }, 502)
  }

  await ctx.env.DB.prepare(
    `INSERT INTO photos (file_id, tg_id, beer_key, bytes, mime, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (file_id) DO UPDATE SET beer_key = excluded.beer_key`,
  )
    .bind(fileId, ctx.user.id, beerKey, bytes.byteLength, type, Date.now())
    .run()

  return json({ fileId })
}

/** Отдаёт снимок. Владельца проверяем по базе: идентификатор чужим не отдаём */
async function getPhoto(ctx: Ctx, fileId: string): Promise<Response> {
  const own = await ctx.env.DB.prepare(`SELECT mime FROM photos WHERE file_id = ? AND tg_id = ?`)
    .bind(fileId, ctx.user.id)
    .first<{ mime: string | null }>()

  if (!own) return json({ error: 'это не ваш снимок' }, 403)

  const api = `https://api.telegram.org/bot${ctx.env.BOT_TOKEN}`
  const file = (await (await fetch(`${api}/getFile?file_id=${encodeURIComponent(fileId)}`)).json()) as {
    ok: boolean
    result?: { file_path: string }
  }

  if (!file.ok || !file.result) return json({ error: 'снимок недоступен' }, 404)

  const image = await fetch(`https://api.telegram.org/file/bot${ctx.env.BOT_TOKEN}/${file.result.file_path}`)
  if (!image.ok) return json({ error: 'снимок недоступен' }, 404)

  return new Response(image.body, {
    headers: {
      // Тип берём из базы: файловый сервер отдаёт обезличенные байты
      'content-type': own.mime ?? 'image/webp',
      // Снимок неизменен: каждый новый получает свой идентификатор
      'cache-control': 'private, max-age=31536000, immutable',
      ...CORS_HEADERS,
    },
  })
}

/**
 * Мини-справочник стилей для кнопок бота. Полный лежит на клиенте и сюда
 * не нужен: в переписке предлагаются только самые ходовые, всё остальное
 * человек выберет в приложении.
 */
const BOT_STYLES: Record<string, string> = {
  lager: 'Лагер',
  ipa: 'IPA',
  wheat: 'Пшеничное',
  stout: 'Стаут',
  pilsner: 'Пилснер',
  sour: 'Сауэр',
  neipa: 'NEIPA',
  porter: 'Портер',
}

/** Объёмы в кнопках: те же три, что зашиты в приложении по умолчанию */
const BOT_VOLUMES = [330, 500, 1000]

function formatMl(ml: number): string {
  return ml >= 1000 ? `${(ml / 1000).toFixed(1).replace('.0', '').replace('.', ',')} л` : `${ml} мл`
}

/** Отправляет сообщение боту; ошибки только логируем — переписка не критична */
async function botSend(env: Env, chatId: number, text: string, keyboard?: unknown): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup: keyboard }),
  })
}

/**
 * Первый шаг быстрой отметки: выбор объёма.
 *
 * Смысл всей затеи — записать кружку, не открывая приложение: в шумном месте
 * это разница между «отмечу потом» и одним тапом.
 */
async function offerVolumes(env: Env, chatId: number, userId: number): Promise<void> {
  const last = await env.DB.prepare(`SELECT last_ml, last_style FROM users WHERE tg_id = ?`)
    .bind(userId)
    .first<{ last_ml: number | null; last_style: string | null }>()

  const row = BOT_VOLUMES.map((ml) => ({ text: formatMl(ml), callback_data: `v:${ml}` }))
  const keyboard: { text: string; callback_data: string }[][] = [row]

  // Повтор последнего — самая частая нужда: в баре берут то же самое
  if (last?.last_ml && last.last_style) {
    keyboard.push([
      {
        text: `ещё такое же: ${BOT_STYLES[last.last_style] ?? last.last_style} ${formatMl(last.last_ml)}`,
        callback_data: `s:${last.last_ml}:${last.last_style}`,
      },
    ])
  }

  await botSend(env, chatId, 'сколько?', { inline_keyboard: keyboard })
}

/** Второй шаг: стиль. Последний выбор идёт первым — обычно берут его же */
async function offerStyles(env: Env, chatId: number, userId: number, ml: number): Promise<void> {
  const last = await env.DB.prepare(`SELECT last_style FROM users WHERE tg_id = ?`)
    .bind(userId)
    .first<{ last_style: string | null }>()

  const codes = [...new Set([last?.last_style, 'lager', 'ipa', 'wheat', 'stout'].filter(Boolean))]
    .slice(0, 4) as string[]

  const buttons = codes.map((code) => ({
    text: BOT_STYLES[code] ?? code,
    callback_data: `s:${ml}:${code}`,
  }))

  await botSend(env, chatId, `${formatMl(ml)} — что пьём?`, {
    inline_keyboard: [buttons.slice(0, 2), buttons.slice(2)],
  })
}

/**
 * Записывает отметку, сделанную в переписке.
 *
 * Дневник лежит в CloudStorage и боту недоступен, поэтому кружка ждёт
 * во «входящих», пока приложение не откроют. На общий стол она попадает
 * сразу — иначе компания не увидела бы её весь вечер.
 */
async function saveBotEntry(env: Env, userId: number, ml: number, style: string): Promise<void> {
  const id = crypto.randomUUID()
  const now = Date.now()

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO inbox (id, tg_id, ts, ml, style, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, userId, now, ml, style, now),
    env.DB.prepare(`UPDATE users SET last_ml = ?, last_style = ? WHERE tg_id = ?`)
      .bind(ml, style, userId),
  ])

  const party = await env.DB.prepare(
    `SELECT p.id FROM parties p
       JOIN party_members m ON m.party_id = p.id AND m.tg_id = ?
      WHERE p.ended_at IS NULL
      ORDER BY p.started_at DESC LIMIT 1`,
  )
    .bind(userId)
    .first<{ id: string }>()

  if (party) {
    await env.DB.prepare(
      `INSERT INTO party_entries (id, party_id, tg_id, ts, ml, style, name) VALUES (?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT (id) DO NOTHING`,
    )
      .bind(id, party.id, userId, now, ml, style)
      .run()
  }
}

/**
 * Инлайн-режим: человек пишет «@beerlogs_bot» в любом чате и выбирает свой
 * вариант. Для компании это честнее кнопок под общим сообщением — вопрос
 * задаёт каждый сам, и запись уходит тому, кто выбрал, а не тому, кто первым
 * нажал. Работает и там, где бота нет в участниках: добавлять его не нужно.
 */
/**
 * Действующий код приглашения, а если такого нет — новый.
 *
 * Инлайн-подсказки Telegram запрашивает на каждый набранный символ, поэтому
 * заводить свежий код на каждый запрос нельзя: таблица распухнет мусором.
 * Пока прошлый жив, переиспользуем его — приглашения у нас многоразовые.
 */
async function reusableInvite(env: Env, userId: number, partyId?: string): Promise<string> {
  const kind = partyId ? 'party' : 'friend'

  const found = await env.DB.prepare(
    `SELECT code FROM invites
      WHERE author_id = ? AND kind = ? AND expires_at > ?
        AND (party_id IS ? OR party_id = ?)
      ORDER BY expires_at DESC LIMIT 1`,
  )
    .bind(userId, kind, Date.now(), partyId ?? null, partyId ?? null)
    .first<{ code: string }>()

  if (found) return found.code

  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  const code = [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20)

  await env.DB.prepare(
    `INSERT INTO invites (code, kind, author_id, party_id, expires_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(code, kind, userId, partyId ?? null, Date.now() + INVITE_TTL_MS)
    .run()

  return code
}

/** Идущий вечер этого человека, если он сейчас за столом */
async function activePartyOf(env: Env, userId: number): Promise<string | undefined> {
  const party = await env.DB.prepare(
    `SELECT p.id FROM parties p
       JOIN party_members m ON m.party_id = p.id AND m.tg_id = ?
      WHERE p.ended_at IS NULL
      ORDER BY p.started_at DESC LIMIT 1`,
  )
    .bind(userId)
    .first<{ id: string }>()

  return party?.id
}

async function answerInline(env: Env, queryId: string, userId: number, query: string): Promise<void> {
  const last = await env.DB.prepare(`SELECT last_ml, last_style FROM users WHERE tg_id = ?`)
    .bind(userId)
    .first<{ last_ml: number | null; last_style: string | null }>()

  const lastMl = last?.last_ml ?? 500
  const lastStyle = last?.last_style ?? 'lager'

  const options: { ml: number; style: string }[] = []

  // Повтор последнего идёт первым: в компании обычно берут то же самое
  if (last?.last_ml && last.last_style) options.push({ ml: lastMl, style: lastStyle })

  for (const style of ['lager', 'ipa', 'wheat', 'stout']) {
    if (!options.some((o) => o.ml === lastMl && o.style === style)) options.push({ ml: lastMl, style })
  }

  for (const ml of BOT_VOLUMES) {
    if (!options.some((o) => o.ml === ml && o.style === lastStyle)) options.push({ ml, style: lastStyle })
  }

  // Набранное после имени бота сужает список: «@beerlogs_bot стаут»
  const needle = query.trim().toLowerCase()
  const matching = needle
    ? options.filter((o) => {
        const title = (BOT_STYLES[o.style] ?? o.style).toLowerCase()
        return title.includes(needle) || String(o.ml).startsWith(needle)
      })
    : options

  const results: unknown[] = (matching.length ? matching : options).slice(0, 8).map((o) => ({
    type: 'article',
    // Идентификатор несёт сам выбор: при подтверждении придёт только он
    id: `${o.ml}:${o.style}`,
    title: `${BOT_STYLES[o.style] ?? o.style} ${formatMl(o.ml)}`,
    description: 'записать в дневник',
    input_message_content: { message_text: `🍺 ${BOT_STYLES[o.style] ?? o.style} ${formatMl(o.ml)}` },
  }))

  /*
    Приглашения — вторым делом, чтобы не мешать главному сценарию, но в том же
    списке: звать удобнее оттуда же, откуда отмечаешься. Оба многоразовые,
    поэтому сообщение можно кинуть в общий чат — примут все, кто нажмёт.
  */
  const wantsInvite = !needle || 'друг компания позвать добавить'.includes(needle)
  const wantsParty = !needle || 'вечер вечеринка позвать'.includes(needle)

  if (wantsInvite) {
    const code = await reusableInvite(env, userId)

    results.push({
      type: 'article',
      id: 'invite:friend',
      title: 'добавить друга',
      description: 'позвать в компанию — увидите, кто что пьёт',
      input_message_content: { message_text: 'веду дневник пива — давай сравним, кто что берёт' },
      reply_markup: {
        inline_keyboard: [
          [{ text: 'войти в компанию', url: `https://t.me/beerlogs_bot/app?startapp=${code}` }],
        ],
      },
    })
  }

  const partyId = wantsParty ? await activePartyOf(env, userId) : undefined
  if (partyId) {
    const code = await reusableInvite(env, userId, partyId)

    results.push({
      type: 'article',
      id: 'invite:party',
      title: 'позвать на вечеринку',
      description: 'вечер идёт прямо сейчас',
      input_message_content: { message_text: 'сегодня пьём вместе — заходи за стол' },
      reply_markup: {
        inline_keyboard: [
          [{ text: 'зайти за стол', url: `https://t.me/beerlogs_bot/app?startapp=${code}` }],
        ],
      },
    })
  }

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerInlineQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      inline_query_id: queryId,
      results,
      // Ответ у каждого свой, общий кэш тут недопустим
      is_personal: true,
      cache_time: 0,
    }),
  })
}

/** Сколько звёзд можно отправить за раз: рамки, чтобы не промахнуться нулём */
const MIN_STARS = 1
const MAX_STARS = 2500

/**
 * Счёт на поддержку звёздами.
 *
 * Для Stars платёжный провайдер не нужен: валюта внутренняя, `provider_token`
 * не передаётся вовсе. Ссылку открывает сам клиент методом openInvoice.
 */
async function createDonation(ctx: Ctx): Promise<Response> {
  const body = (await ctx.request.json()) as { stars?: number }
  const stars = Math.round(body.stars ?? 0)

  if (!Number.isFinite(stars) || stars < MIN_STARS || stars > MAX_STARS) {
    return json({ error: 'непонятное число звёзд' }, 400)
  }

  const api = `https://api.telegram.org/bot${ctx.env.BOT_TOKEN}`

  const created = (await (
    await fetch(`${api}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'создателю на пиво',
        description: 'поддержка beerlog — на пиво тому, кто это написал',
        // Пейлоад вернётся в успешном платеже: по нему видно, кто и сколько
        payload: `beer:${ctx.user.id}:${stars}`,
        currency: 'XTR',
        prices: [{ label: 'на пиво', amount: stars }],
      }),
    })
  ).json()) as { ok: boolean; description?: string; result?: string }

  if (!created.ok || !created.result) {
    log('счёт не создался', { description: created.description })
    return json({ error: 'счёт не создался' }, 502)
  }

  return json({ link: created.result })
}

/**
 * Обновления от Telegram. Нужны ровно для платежей: без ответа на
 * pre_checkout_query оплата не проходит вовсе — Telegram ждёт подтверждения
 * от бота и отменяет платёж по таймауту.
 *
 * Подпись initData здесь неприменима: запрос шлёт сервер Telegram, а не
 * приложение, поэтому подлинность проверяется секретом из заголовка.
 */
async function telegramUpdate(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('x-telegram-bot-api-secret-token') !== env.WEBHOOK_SECRET) {
    log('вебхук с чужим секретом')
    return new Response('нет', { status: 403 })
  }

  const update = (await request.json()) as {
    pre_checkout_query?: { id: string }
    inline_query?: { id: string; query: string; from: { id: number } }
    chosen_inline_result?: { result_id: string; from: { id: number } }
    callback_query?: {
      id: string
      data?: string
      from: { id: number }
      message?: { chat: { id: number } }
    }
    message?: {
      chat: { id: number }
      from?: { id: number }
      text?: string
      successful_payment?: { total_amount: number; telegram_payment_charge_id: string }
    }
  }

  const api = `https://api.telegram.org/bot${env.BOT_TOKEN}`

  // Подтверждаем сразу: проверять нечего, товара с остатками у нас нет
  if (update.pre_checkout_query) {
    await fetch(`${api}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true }),
    })

    return new Response('ok')
  }

  // Подсказки инлайн-режима: их спрашивают на каждый набранный символ
  if (update.inline_query) {
    await answerInline(env, update.inline_query.id, update.inline_query.from.id, update.inline_query.query)
    return new Response('ok')
  }

  /*
    Выбранный вариант — и есть отметка. Это обновление приходит, только если
    у бота включён сбор статистики инлайн-режима (BotFather, setinlinefeedback):
    без него человек увидит сообщение в чате, а в дневник ничего не попадёт.
  */
  const picked = update.chosen_inline_result
  if (picked) {
    const choice = picked.result_id.match(/^(\d{2,5}):([a-z_]{1,24})$/)
    if (choice) await saveBotEntry(env, picked.from.id, Number(choice[1]), choice[2])

    return new Response('ok')
  }

  /*
    Нажатие кнопки. Отвечаем на callback обязательно и первым делом: пока
    ответа нет, в клиенте крутится часик, даже если запись уже прошла.
  */
  const press = update.callback_query
  if (press) {
    const chatId = press.message?.chat.id ?? press.from.id
    const data = press.data ?? ''

    const volume = data.match(/^v:(\d{2,5})$/)
    const choice = data.match(/^s:(\d{2,5}):([a-z_]{1,24})$/)

    await fetch(`${api}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: press.id }),
    })

    if (volume) {
      await offerStyles(env, chatId, press.from.id, Number(volume[1]))
    } else if (choice) {
      const ml = Number(choice[1])
      const style = choice[2]

      await saveBotEntry(env, press.from.id, ml, style)
      await botSend(env, chatId, `записано: ${BOT_STYLES[style] ?? style} ${formatMl(ml)} 🍺`)
    }

    return new Response('ok')
  }

  // Любое слово в переписке трактуем как «хочу отметить»: другого дела у бота нет
  const text = update.message?.text
  if (text && update.message) {
    const chatId = update.message.chat.id
    const userId = update.message.from?.id ?? chatId

    if (text.startsWith('/start')) {
      await botSend(env, chatId, 'открой приложение кнопкой меню — или отметь кружку прямо здесь')
    }

    await offerVolumes(env, chatId, userId)
    return new Response('ok')
  }

  const payment = update.message?.successful_payment
  if (payment && update.message) {
    const chatId = update.message.chat.id

    await env.DB.prepare(
      `INSERT INTO donations (charge_id, tg_id, stars, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (charge_id) DO NOTHING`,
    )
      .bind(payment.telegram_payment_charge_id, update.message.from?.id ?? chatId, payment.total_amount, Date.now())
      .run()

    await fetch(`${api}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'спасибо! пиво засчитано 🍺',
      }),
    })
  }

  return new Response('ok')
}

/**
 * Готовит приглашение как сообщение с кнопкой.
 *
 * Текстовая ссылка требует от человека заметить её, нажать и дождаться
 * запуска — на каждом шаге кто-то теряется. Подготовленное сообщение
 * Telegram отправляет сам, а получателю остаётся одна кнопка.
 */
async function prepareInvite(ctx: Ctx): Promise<Response> {
  const body = (await ctx.request.json()) as { kind?: string; partyId?: string }
  const toParty = body.kind === 'party'

  if (toParty && !body.partyId) return json({ error: 'нужен идентификатор вечера' }, 400)
  if (toParty && !(await isMember(ctx, body.partyId!))) {
    return json({ error: 'звать можно только на свой вечер' }, 403)
  }

  const code = await reusableInvite(ctx.env, ctx.user.id, toParty ? body.partyId : undefined)

  const prepared = (await (
    await fetch(`https://api.telegram.org/bot${ctx.env.BOT_TOKEN}/savePreparedInlineMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_id: ctx.user.id,
        result: {
          type: 'article',
          id: crypto.randomUUID(),
          title: toParty ? 'позвать на вечеринку' : 'добавить друга',
          input_message_content: {
            message_text: toParty
              ? 'сегодня пьём вместе — заходи за стол'
              : 'веду дневник пива — давай сравним, кто что берёт',
          },
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: toParty ? 'зайти за стол' : 'войти в компанию',
                  url: `https://t.me/beerlogs_bot/app?startapp=${code}`,
                },
              ],
            ],
          },
        },
        // В том числе в группы: приглашение многоразовое, примут все, кто нажмёт
        allow_user_chats: true,
        allow_bot_chats: false,
        allow_group_chats: true,
        allow_channel_chats: false,
      }),
    })
  ).json()) as { ok: boolean; description?: string; result?: { id: string } }

  if (!prepared.ok || !prepared.result) {
    log('приглашение не подготовилось', { description: prepared.description })
    return json({ error: 'приглашение не подготовилось' }, 502)
  }

  return json({ preparedMessageId: prepared.result.id, code })
}

/** Карточка месяца рисуется в 1080 пикселей; больше сюда приехать не должно */
const MAX_CARD_BYTES = 2_000_000

/**
 * Готовит карточку итогов к отправке в чат.
 *
 * Своей картинкой поделиться напрямую мини-приложение не может: Telegram
 * отправляет только сообщение, заранее подготовленное ботом. Поэтому
 * картинка сначала уезжает боту (так у неё появляется идентификатор),
 * сообщение убирается из переписки, а идентификатор попадает
 * в подготовленное сообщение, которое клиент и покажет в диалоге выбора чата.
 */
async function prepareCard(ctx: Ctx): Promise<Response> {
  const type = ctx.request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return json({ error: 'это не изображение' }, 415)

  const bytes = await ctx.request.arrayBuffer()
  if (bytes.byteLength === 0) return json({ error: 'пустая карточка' }, 400)
  if (bytes.byteLength > MAX_CARD_BYTES) return json({ error: 'карточка слишком большая' }, 413)

  const api = `https://api.telegram.org/bot${ctx.env.BOT_TOKEN}`

  // Именно фотографией, а не документом: подготовленное сообщение ждёт фото
  const form = new FormData()
  form.append('chat_id', String(ctx.user.id))
  form.append('disable_notification', 'true')
  form.append('photo', new Blob([bytes], { type }), 'card.jpg')

  const sent = (await (await fetch(`${api}/sendPhoto`, { method: 'POST', body: form })).json()) as {
    ok: boolean
    description?: string
    result?: { message_id: number; photo?: { file_id: string }[] }
  }

  const photo = sent.result?.photo
  const fileId = photo && photo.length ? photo[photo.length - 1].file_id : undefined

  if (sent.result?.message_id) {
    ctx.waitUntil(
      fetch(`${api}/deleteMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: ctx.user.id, message_id: sent.result.message_id }),
      }).then(() => undefined),
    )
  }

  if (!sent.ok || !fileId) {
    log('карточку не удалось загрузить', { description: sent.description })
    return json({ error: 'карточка не отправилась' }, 502)
  }

  const prepared = (await (
    await fetch(`${api}/savePreparedInlineMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user_id: ctx.user.id,
        result: {
          type: 'photo',
          id: crypto.randomUUID(),
          photo_file_id: fileId,
        },
        // Куда разрешено пересылать: личные чаты и группы, каналы ни к чему
        allow_user_chats: true,
        allow_bot_chats: false,
        allow_group_chats: true,
        allow_channel_chats: false,
      }),
    })
  ).json()) as { ok: boolean; description?: string; result?: { id: string } }

  if (!prepared.ok || !prepared.result) {
    log('подготовить сообщение не вышло', { description: prepared.description })
    return json({ error: 'карточка не отправилась' }, 502)
  }

  return json({ preparedMessageId: prepared.result.id })
}

/**
 * Перевешивает снимок на другое название. Нужно при правке: человек
 * исправляет опечатку в названии, и этикетка должна уехать следом,
 * иначе она остаётся на слове, которого больше нет ни в одной записи.
 */
async function retagPhoto(ctx: Ctx, fileId: string): Promise<Response> {
  const body = (await ctx.request.json()) as { beer?: string }
  const beerKey = (body.beer ?? '').trim().toLowerCase().slice(0, 120)
  if (!beerKey) return json({ error: 'не указано название' }, 400)

  await ctx.env.DB.prepare(`UPDATE photos SET beer_key = ? WHERE file_id = ? AND tg_id = ?`)
    .bind(beerKey, fileId, ctx.user.id)
    .run()

  return json({ ok: true })
}

/** Снимки по названиям — чтобы показать их в карточках коллекции */
async function listPhotos(ctx: Ctx): Promise<Response> {
  const { results } = await ctx.env.DB.prepare(
    `SELECT beer_key, file_id FROM photos WHERE tg_id = ? ORDER BY created_at DESC LIMIT 200`,
  )
    .bind(ctx.user.id)
    .all()

  return json({ photos: results })
}

async function deletePhoto(ctx: Ctx, fileId: string): Promise<Response> {
  await ctx.env.DB.prepare(`DELETE FROM photos WHERE file_id = ? AND tg_id = ?`)
    .bind(fileId, ctx.user.id)
    .run()

  // Сам файл остаётся у Telegram, но без записи он недостижим
  return json({ ok: true })
}

/** Дружба рвётся с обеих сторон сразу: односторонней она не бывает */
async function removeFriend(ctx: Ctx, friendId: number): Promise<Response> {
  const [low, high] = pair(ctx.user.id, friendId)

  await ctx.env.DB.prepare(`DELETE FROM friendships WHERE low_id = ? AND high_id = ?`)
    .bind(low, high)
    .run()

  return json({ ok: true })
}

/** Общий код приглашения: непредсказуемый, по нему открывается доступ к вечеру */
function newInviteCode(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20)
}

/**
 * Зовёт друзей на идущий вечер сообщением от бота.
 *
 * Раньше приглашение нужно было переслать руками, и до тех, кто рядом,
 * оно часто не доходило. Право писать у бота уже есть: его дал каждый,
 * кто хоть раз открыл приложение.
 */
async function summonFriends(ctx: Ctx, partyId: string): Promise<Response> {
  if (!(await isMember(ctx, partyId))) return json({ error: 'звать можно только на свой вечер' }, 403)

  const party = await ctx.env.DB.prepare(`SELECT ended_at FROM parties WHERE id = ?`)
    .bind(partyId)
    .first<{ ended_at: number | null }>()

  if (!party) return json({ error: 'вечеринка не найдена' }, 404)
  if (party.ended_at !== null) return json({ error: 'вечер уже закрыт' }, 409)

  const body = (await ctx.request.json()) as { ids?: number[] }
  const wanted = Array.isArray(body.ids) ? body.ids.filter((id) => Number.isFinite(id)).slice(0, 50) : []
  if (wanted.length === 0) return json({ error: 'некого звать' }, 400)

  // Писать можно только своим: рассылка чужим людям — это спам от нашего имени
  const { results } = await ctx.env.DB.prepare(
    `SELECT CASE WHEN low_id = ?1 THEN high_id ELSE low_id END AS friend_id
       FROM friendships WHERE low_id = ?1 OR high_id = ?1`,
  )
    .bind(ctx.user.id)
    .all<{ friend_id: number }>()

  const friends = new Set(results.map((r) => r.friend_id))
  const targets = wanted.filter((id) => friends.has(id))
  if (targets.length === 0) return json({ error: 'эти люди не в твоей компании' }, 403)

  const me = await ctx.env.DB.prepare(`SELECT COALESCE(custom_name, name) AS name FROM users WHERE tg_id = ?`)
    .bind(ctx.user.id)
    .first<{ name: string }>()

  // Код один на всю рассылку: это приглашение на вечер, а не персональный пропуск
  const code = newInviteCode()
  await ctx.env.DB.prepare(
    `INSERT INTO invites (code, kind, author_id, party_id, expires_at) VALUES (?, 'party', ?, ?, ?)`,
  )
    .bind(code, ctx.user.id, partyId, Date.now() + INVITE_TTL_MS)
    .run()

  const api = `https://api.telegram.org/bot${ctx.env.BOT_TOKEN}`
  const text = `${me?.name ?? 'кто-то'} открыл вечер — заходи за стол`
  const keyboard = {
    inline_keyboard: [[{ text: 'зайти за стол', url: `https://t.me/beerlogs_bot/app?startapp=${code}` }]],
  }

  let sent = 0
  for (const id of targets) {
    const answer = (await (
      await fetch(`${api}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: id, text, reply_markup: keyboard }),
      })
    ).json()) as { ok: boolean; description?: string }

    // Человек мог заблокировать бота — это не повод рушить всю рассылку
    if (answer.ok) sent += 1
    else log('позвать не вышло', { target: id, description: answer.description })
  }

  return json({ sent })
}

async function createInvite(ctx: Ctx): Promise<Response> {
  const body = (await ctx.request.json()) as { kind?: string; partyId?: string }
  const kind = body.kind === 'party' ? 'party' : 'friend'

  if (kind === 'party') {
    if (!body.partyId) {
      return json({ error: 'для приглашения в вечеринку нужен её идентификатор' }, 400)
    }

    /*
      Звать может любой за столом, но именно за столом: без этой проверки
      пропуск на чужой вечер мог выписать кто угодно, зная идентификатор.
    */
    if (!(await isMember(ctx, body.partyId))) {
      return json({ error: 'звать можно только на свой вечер' }, 403)
    }

    const party = await ctx.env.DB.prepare(`SELECT ended_at FROM parties WHERE id = ?`)
      .bind(body.partyId)
      .first<{ ended_at: number | null }>()

    if (!party) return json({ error: 'вечеринка не найдена' }, 404)
    if (party.ended_at !== null) return json({ error: 'вечер уже закрыт' }, 409)
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
  if (invite.expires_at < Date.now()) return json({ error: 'срок приглашения истёк' }, 410)
  if (invite.author_id === ctx.user.id) return json({ error: 'нельзя принять своё приглашение' }, 400)

  /*
    Оба вида приглашений многоразовые: одну ссылку удобно кинуть в общий чат.
    Ограничивает их время — сутки для дружбы, конец вечера для вечеринки.
    Если по ссылке зашёл лишний человек, его убирают из компании вручную.
  */
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

  // Вечер закончился — ссылка недействительна, даже если её сохранили
  const party = await ctx.env.DB.prepare(`SELECT ended_at FROM parties WHERE id = ?`)
    .bind(invite.party_id)
    .first<{ ended_at: number | null }>()

  if (!party) return json({ error: 'вечеринка не найдена' }, 404)
  if (party.ended_at !== null) return json({ error: 'этот вечер уже закончился' }, 410)

  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `INSERT INTO party_members (party_id, tg_id, joined_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
    ).bind(invite.party_id, ctx.user.id, now),
    // Отмечаем последнего вошедшего, но код продолжает работать для остальных
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

/**
 * Правка своей отметки на столе. Вечер спрашивать незачем: строка
 * принадлежит человеку, а не вечеру, и «это была не такая кружка» должно
 * доезжать до общего стола так же, как до дневника, — хоть неделю спустя.
 * Чужую строку запрос не найдёт: владелец в условии.
 */
async function updateOwnEntry(ctx: Ctx, entryId: string): Promise<Response> {
  const body = (await ctx.request.json()) as { ts?: number; ml?: number; style?: string; name?: string }
  if (!body.ml || body.ml <= 0 || !body.style) return json({ error: 'нужны объём и стиль' }, 400)

  await ctx.env.DB.prepare(
    `UPDATE party_entries SET ts = ?, ml = ?, style = ?, name = ? WHERE id = ? AND tg_id = ?`,
  )
    .bind(body.ts ?? Date.now(), Math.round(body.ml), body.style, body.name ?? null, entryId, ctx.user.id)
    .run()

  return json({ ok: true })
}

/** Удаление своей отметки со стола. Итоги вечера считаются на лету и сойдутся сами */
async function removeOwnEntry(ctx: Ctx, entryId: string): Promise<Response> {
  await ctx.env.DB.prepare(`DELETE FROM party_entries WHERE id = ? AND tg_id = ?`)
    .bind(entryId, ctx.user.id)
    .run()

  return json({ ok: true })
}

async function addPartyEntry(ctx: Ctx, partyId: string): Promise<Response> {
  if (!(await isMember(ctx, partyId))) return json({ error: 'вы не за этим столом' }, 403)

  const party = await ctx.env.DB.prepare(`SELECT ended_at FROM parties WHERE id = ?`)
    .bind(partyId)
    .first<{ ended_at: number | null }>()

  if (!party) return json({ error: 'вечеринка не найдена' }, 404)
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

  if (!party) return json({ error: 'вечеринка не найдена' }, 404)

  const [members, entries] = await Promise.all([
    ctx.env.DB.prepare(
      `SELECT u.tg_id, COALESCE(u.custom_name, u.name) AS name, u.avatar, u.avatar_file_id IS NOT NULL AS has_photo
         FROM party_members m JOIN users u ON u.tg_id = m.tg_id WHERE m.party_id = ?`,
    )
      .bind(partyId)
      .all(),
    ctx.env.DB.prepare(`SELECT id, tg_id, ts, ml, style, name FROM party_entries WHERE party_id = ? ORDER BY ts`)
      .bind(partyId)
      .all(),
  ])

  return json({ party, members: members.results, entries: entries.results })
}

/**
 * Список вечеринок: активная сверху, остальные — свежими вперёд.
 * Заодно отдаём состояние активного стола, чтобы клиенту не пришлось
 * ходить за ним вторым запросом — по медленной сети это заметно.
 */
async function listParties(ctx: Ctx): Promise<Response> {
  const { results } = await ctx.env.DB.prepare(
    `SELECT p.id, p.title, p.host_id, p.started_at, p.ended_at,
            (SELECT COUNT(*) FROM party_members m2 WHERE m2.party_id = p.id) AS members,
            COALESCE((SELECT SUM(e.ml) FROM party_entries e WHERE e.party_id = p.id), 0) AS ml,
            COALESCE((SELECT COUNT(*) FROM party_entries e WHERE e.party_id = p.id), 0) AS portions
       FROM parties p
       JOIN party_members m ON m.party_id = p.id AND m.tg_id = ?
      ORDER BY (p.ended_at IS NULL) DESC, p.started_at DESC
      LIMIT 50`,
  )
    .bind(ctx.user.id)
    .all()

  const parties = results as unknown as { id: string; ended_at: number | null }[]
  const open = parties.find((p) => p.ended_at === null)

  // Активный стол прикладываем сразу: иначе клиент шёл бы за ним вторым кругом
  if (!open) return json({ parties, active: null })

  const [members, entries] = await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `SELECT u.tg_id, COALESCE(u.custom_name, u.name) AS name, u.avatar, u.avatar_file_id IS NOT NULL AS has_photo
         FROM party_members m JOIN users u ON u.tg_id = m.tg_id WHERE m.party_id = ?`,
    ).bind(open.id),
    ctx.env.DB.prepare(
      `SELECT id, tg_id, ts, ml, style, name FROM party_entries WHERE party_id = ? ORDER BY ts`,
    ).bind(open.id),
  ])

  return json({
    parties,
    active: { party: open, members: members.results, entries: entries.results },
  })
}

/**
 * Итоги по вечеринкам считаем про ВСТРЕЧИ, а не про объёмы:
 * сколько раз собирались, с кем чаще, что берут в этой компании.
 * Рекорды — по длительности и людям за столом, но не по выпитому.
 */
async function partyStats(ctx: Ctx): Promise<Response> {
  const [totals, companions, styles, longest, crowded] = await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      `SELECT COUNT(*) AS evenings FROM party_members WHERE tg_id = ?`,
    ).bind(ctx.user.id),

    ctx.env.DB.prepare(
      // tg_id нужен клиенту: у себя человек мог подписать друга по-своему
      `SELECT theirs.tg_id, COALESCE(u.custom_name, u.name) AS name, COUNT(*) AS evenings
         FROM party_members mine
         JOIN party_members theirs ON theirs.party_id = mine.party_id AND theirs.tg_id != mine.tg_id
         JOIN users u ON u.tg_id = theirs.tg_id
        WHERE mine.tg_id = ?
        GROUP BY theirs.tg_id
        ORDER BY evenings DESC
        LIMIT 3`,
    ).bind(ctx.user.id),

    ctx.env.DB.prepare(
      `SELECT e.style, COUNT(*) AS times
         FROM party_entries e
         JOIN party_members m ON m.party_id = e.party_id AND m.tg_id = ?
        GROUP BY e.style
        ORDER BY times DESC
        LIMIT 3`,
    ).bind(ctx.user.id),

    ctx.env.DB.prepare(
      `SELECT p.id, p.started_at, p.ended_at, (p.ended_at - p.started_at) AS duration
         FROM parties p
         JOIN party_members m ON m.party_id = p.id AND m.tg_id = ?
        WHERE p.ended_at IS NOT NULL
        ORDER BY duration DESC
        LIMIT 1`,
    ).bind(ctx.user.id),

    ctx.env.DB.prepare(
      `SELECT p.id, p.started_at,
              (SELECT COUNT(*) FROM party_members m2 WHERE m2.party_id = p.id) AS members
         FROM parties p
         JOIN party_members m ON m.party_id = p.id AND m.tg_id = ?
        ORDER BY members DESC
        LIMIT 1`,
    ).bind(ctx.user.id),
  ])

  return json({
    evenings: (totals.results[0] as { evenings: number } | undefined)?.evenings ?? 0,
    companions: companions.results,
    styles: styles.results,
    longest: longest.results[0] ?? null,
    crowded: crowded.results[0] ?? null,
  })
}

/**
 * Удаляет вечер целиком — для случаев «нажал по ошибке» и «вечера не было».
 * Личные отметки участников не трогаются: они живут в дневниках, а выпито
 * было по-настоящему. Стирается только общий стол.
 */
async function deleteParty(ctx: Ctx, partyId: string): Promise<Response> {
  const party = await ctx.env.DB.prepare(`SELECT host_id FROM parties WHERE id = ?`)
    .bind(partyId)
    .first<{ host_id: number }>()

  if (!party) return json({ error: 'вечеринка не найдена' }, 404)
  if (party.host_id !== ctx.user.id) {
    return json({ error: 'удалить вечер может только тот, кто его начал' }, 403)
  }

  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`DELETE FROM party_entries WHERE party_id = ?`).bind(partyId),
    ctx.env.DB.prepare(`DELETE FROM party_members WHERE party_id = ?`).bind(partyId),
    ctx.env.DB.prepare(`DELETE FROM invites WHERE party_id = ?`).bind(partyId),
    ctx.env.DB.prepare(`DELETE FROM parties WHERE id = ?`).bind(partyId),
  ])

  return json({ ok: true })
}

/**
 * Уйти со стола: вечер пропадает у тебя вместе с твоими отметками в нём,
 * у остальных остаётся. Общий вечер стирать в одиночку нельзя — это чужая
 * история тоже. Если после ухода не осталось никого, вечер удаляется сам.
 */
async function leaveParty(ctx: Ctx, partyId: string): Promise<Response> {
  if (!(await isMember(ctx, partyId))) return json({ error: 'вы не за этим столом' }, 404)

  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`DELETE FROM party_entries WHERE party_id = ? AND tg_id = ?`).bind(partyId, ctx.user.id),
    ctx.env.DB.prepare(`DELETE FROM party_members WHERE party_id = ? AND tg_id = ?`).bind(partyId, ctx.user.id),
  ])

  const left = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM party_members WHERE party_id = ?`)
    .bind(partyId)
    .first<{ n: number }>()

  if ((left?.n ?? 0) === 0) {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`DELETE FROM party_entries WHERE party_id = ?`).bind(partyId),
      ctx.env.DB.prepare(`DELETE FROM invites WHERE party_id = ?`).bind(partyId),
      ctx.env.DB.prepare(`DELETE FROM parties WHERE id = ?`).bind(partyId),
    ])
  }

  return json({ ok: true })
}

async function closeParty(ctx: Ctx, partyId: string): Promise<Response> {
  const party = await ctx.env.DB.prepare(`SELECT host_id, ended_at FROM parties WHERE id = ?`)
    .bind(partyId)
    .first<{ host_id: number; ended_at: number | null }>()

  if (!party) return json({ error: 'вечеринка не найдена' }, 404)
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
  if (method === 'GET' && pathname === '/parties') return listParties(ctx)
  if (method === 'GET' && pathname === '/parties/stats') return partyStats(ctx)

  const friend = pathname.match(/^\/friends\/(\d{1,20})$/)
  if (method === 'DELETE' && friend) return removeFriend(ctx, Number(friend[1]))

  const avatarPath = pathname.match(/^\/avatar\/(\d{1,20})$/)
  if (method === 'GET' && avatarPath) return avatar(ctx, Number(avatarPath[1]))

  if (method === 'POST' && pathname === '/me/last') return saveLastChoice(ctx)
  if (method === 'GET' && pathname === '/inbox') return listInbox(ctx)
  if (method === 'POST' && pathname === '/inbox/ack') return ackInbox(ctx)
  if (method === 'POST' && pathname === '/donate') return createDonation(ctx)
  if (method === 'POST' && pathname === '/me') return saveProfile(ctx)
  if (method === 'DELETE' && pathname === '/me') return deleteAccount(ctx)
  if (method === 'POST' && pathname === '/me/avatar') return uploadAvatar(ctx)
  if (method === 'POST' && pathname === '/share-invite') return prepareInvite(ctx)
  if (method === 'POST' && pathname === '/share-card') return prepareCard(ctx)
  if (method === 'POST' && pathname === '/photos') return uploadPhoto(ctx)
  if (method === 'GET' && pathname === '/photos') return listPhotos(ctx)

  const photoPath = pathname.match(/^\/photos\/([A-Za-z0-9_-]{10,200})$/)
  if (method === 'GET' && photoPath) return getPhoto(ctx, photoPath[1])
  if (method === 'POST' && photoPath) return retagPhoto(ctx, photoPath[1])
  if (method === 'DELETE' && photoPath) return deletePhoto(ctx, photoPath[1])

  const accept = pathname.match(/^\/invites\/([A-Za-z0-9_-]{1,64})\/accept$/)
  if (method === 'POST' && accept) return acceptInvite(ctx, accept[1])

  const party = pathname.match(/^\/parties\/([A-Za-z0-9-]{36})$/)
  if (method === 'GET' && party) return getParty(ctx, party[1])
  if (method === 'DELETE' && party) return deleteParty(ctx, party[1])

  const partyEntries = pathname.match(/^\/parties\/([A-Za-z0-9-]{36})\/entries$/)
  if (method === 'POST' && partyEntries) return addPartyEntry(ctx, partyEntries[1])

  const partyClose = pathname.match(/^\/parties\/([A-Za-z0-9-]{36})\/close$/)
  if (method === 'POST' && partyClose) return closeParty(ctx, partyClose[1])

  const partySummon = pathname.match(/^\/parties\/([A-Za-z0-9-]{36})\/summon$/)
  if (method === 'POST' && partySummon) return summonFriends(ctx, partySummon[1])

  const partyLeave = pathname.match(/^\/parties\/([A-Za-z0-9-]{36})\/leave$/)
  if (method === 'POST' && partyLeave) return leaveParty(ctx, partyLeave[1])

  // Своя отметка правится и стирается без указания вечера: идентификатор общий с дневником
  const ownEntry = pathname.match(/^\/entries\/([A-Za-z0-9-]{1,64})$/)
  if (method === 'POST' && ownEntry) return updateOwnEntry(ctx, ownEntry[1])
  if (method === 'DELETE' && ownEntry) return removeOwnEntry(ctx, ownEntry[1])

  return json({ error: 'неизвестный метод' }, 404)
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return preflight()

    /*
      Обновления от Telegram приходят без initData: их шлёт сервер, а не
      мини-приложение. Поэтому маршрут стоит до проверки подписи, а его
      подлинность подтверждает секрет в заголовке.
    */
    if (request.method === 'POST' && new URL(request.url).pathname === '/tg/update') {
      return telegramUpdate(request, env)
    }

    try {
      const initData = request.headers.get('x-init-data') ?? ''
      const verified = await verifyInitDataDetailed(initData, env.BOT_TOKEN)

      if (!verified.ok || !verified.data) {
        log('отклонена неподписанная попытка', {
          path: new URL(request.url).pathname,
          reason: verified.reason,
          ...verified.details,
        })
        return json({ error: 'подпись не подтверждена', reason: verified.reason }, 401)
      }

      const context: Ctx = {
        env,
        user: verified.data.user,
        startParam: verified.data.startParam,
        url: new URL(request.url),
        request,
        // Именно так: ctx нельзя разбирать по полям, waitUntil потеряет привязку
        waitUntil: (work) => ctx.waitUntil(work),
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

    log('закрыты заброшенные вечеринки', { count: result.meta.changes })
  },
}
