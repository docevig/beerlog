/** Одна отметка выпитого */
export interface Entry {
  /** Локально уникальный идентификатор; понадобится для синхронизации с сервером */
  id: string
  /** Время, когда выпито, в миллисекундах */
  ts: number
  /** Объём в миллилитрах */
  ml: number
  /** Код стиля из справочника */
  style: string
  /** Крепость; пишется только при ручном переопределении дефолта стиля */
  abv?: number
  name?: string
  brewery?: string
  rating?: number
  price?: number
  place?: string
  note?: string
}

/** Настройки и запомненные предпочтения */
export interface Profile {
  lastMl?: number
  lastStyle?: string
  /** Свои пресеты объёма, если пользователь их менял */
  volumes?: number[]
  /**
   * Как ты подписал друзей у себя: id в Telegram → своё имя.
   * Живёт только в твоём хранилище — другого человека это не касается,
   * у него останется имя из его же профиля.
   */
  friendNames?: Record<string, string>
}
