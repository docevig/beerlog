import { srmColor } from './srm'

export interface CardShare {
  title: string
  /** Доля от объёма месяца, 0–1 */
  share: number
  /** Цвет стиля по шкале SRM */
  color: string
}

export interface CardData {
  /** «август 2026» — именительный падеж, склонять нечего */
  period: string
  litres: string
  subtitle: string
  shares: CardShare[]
  footnote: string
  /** Средний цвет месяца — им заливается стакан */
  avgSrm: number
}

const SIZE = 1080
const BG = '#14100C'
const ACCENT = '#FFBF42'
const TEXT = '#F2E7D5'
const FAINT = '#8A7B66'
const LINE = '#2E2519'

const DISPLAY = '"Unbounded", sans-serif'
const BODY = '-apple-system, "Segoe UI", Roboto, sans-serif'

/**
 * Рисует квадратную карточку месяца для отправки в чат.
 *
 * Композиция повторяет экран итогов: крупная цифра, спектр выпитого
 * по шкале SRM и стакан того самого среднего цвета. Картинка должна
 * читаться в ленте с одного взгляда, поэтому подписей минимум.
 */
export async function drawMonthCard(data: CardData): Promise<Blob> {
  // Ждём шрифт: без этого первый вызов нарисует цифры системным начертанием
  await ensureFont()

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('не удалось нарисовать карточку')

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Шапка
  ctx.fillStyle = FAINT
  ctx.font = `600 26px ${DISPLAY}`
  ctx.letterSpacing = '6px'
  ctx.fillText('BEERLOG', 72, 108)
  ctx.letterSpacing = '0px'

  ctx.font = `24px ${BODY}`
  ctx.textAlign = 'right'
  ctx.fillText(data.period, SIZE - 72, 108)
  ctx.textAlign = 'left'

  // Главная цифра
  ctx.fillStyle = ACCENT
  ctx.font = `600 148px ${DISPLAY}`
  ctx.fillText(data.litres, 72, 300)

  ctx.fillStyle = TEXT
  ctx.font = `30px ${BODY}`
  ctx.fillText(data.subtitle, 76, 360)

  drawGlass(ctx, data.avgSrm)
  drawShares(ctx, data.shares)

  ctx.fillStyle = FAINT
  ctx.font = `26px ${BODY}`
  ctx.fillText(data.footnote, 72, SIZE - 132)

  ctx.fillStyle = LINE
  ctx.fillRect(72, SIZE - 108, SIZE - 144, 2)

  ctx.fillStyle = FAINT
  ctx.font = `24px ${BODY}`
  ctx.fillText('t.me/beerlogs_bot', 72, SIZE - 56)

  return toBlob(canvas)
}

/** Стакан-трапеция, как на экране отметки; заливка — средний цвет месяца */
function drawGlass(ctx: CanvasRenderingContext2D, avgSrm: number): void {
  const top = 150
  const height = 240
  const halfTop = 78
  const halfBottom = 60
  const cx = SIZE - 190

  const path = new Path2D()
  path.moveTo(cx - halfTop, top)
  path.lineTo(cx + halfTop, top)
  path.lineTo(cx + halfBottom, top + height)
  path.lineTo(cx - halfBottom, top + height)
  path.closePath()

  // Пиво занимает четыре пятых: полный до краёв стакан выглядит как ошибка отрисовки
  const fillTop = top + height * 0.2

  ctx.save()
  ctx.clip(path)
  ctx.fillStyle = srmColor(avgSrm)
  ctx.fillRect(cx - halfTop, fillTop, halfTop * 2, height)

  // Шапка пены
  ctx.fillStyle = 'rgba(255,246,230,0.92)'
  ctx.fillRect(cx - halfTop, fillTop - 26, halfTop * 2, 30)
  ctx.restore()

  ctx.strokeStyle = LINE
  ctx.lineWidth = 4
  ctx.stroke(path)
}

/** Спектр месяца: сегменты цветов по долям, под ними — три главных стиля */
function drawShares(ctx: CanvasRenderingContext2D, shares: CardShare[]): void {
  const left = 72
  const width = SIZE - 144
  const top = 520
  const height = 54

  if (shares.length === 0) return

  let x = left
  for (const s of shares) {
    const w = Math.max(6, width * s.share)
    ctx.fillStyle = s.color
    ctx.fillRect(x, top, w, height)
    x += w
  }

  ctx.font = `28px ${BODY}`
  let y = top + 116

  for (const s of shares.slice(0, 3)) {
    ctx.fillStyle = s.color
    ctx.beginPath()
    ctx.arc(left + 12, y - 10, 12, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = TEXT
    ctx.fillText(`${s.title} — ${Math.round(s.share * 100)}%`, left + 40, y)
    y += 58
  }
}

/**
 * Шрифт грузится лениво, а canvas ждать не умеет — он молча подставит
 * системный. Просим оба нужных начертания и только потом рисуем.
 */
async function ensureFont(): Promise<void> {
  if (!document.fonts) return

  try {
    await Promise.all([
      document.fonts.load(`600 148px "Unbounded"`),
      document.fonts.load(`600 26px "Unbounded"`),
    ])
  } catch {
    // Без своего шрифта карточка тоже читается — рисуем системным
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // JPEG, а не webp: Telegram принимает картинку как фото, и webp он таким не считает
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('не удалось нарисовать карточку'))),
      'image/jpeg',
      0.92,
    )
  })
}
