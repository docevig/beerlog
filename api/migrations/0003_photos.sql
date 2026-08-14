-- Фото этикеток. Сами снимки хранит Telegram: объектное хранилище Cloudflare
-- требует платной подписки, а тут файлы лежат бесплатно и бессрочно.
-- У нас остаётся только идентификатор файла и его владелец.
CREATE TABLE IF NOT EXISTS photos (
  file_id    TEXT PRIMARY KEY,
  tg_id      INTEGER NOT NULL,
  -- Сорт, к которому относится снимок; в нижнем регистре, как в справочнике
  beer_key   TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos (tg_id, beer_key, created_at);
