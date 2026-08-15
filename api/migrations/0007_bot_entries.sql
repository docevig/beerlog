-- Отметки, сделанные прямо в переписке с ботом.
--
-- Дневник живёт в Telegram CloudStorage и доступен только клиентскому коду,
-- поэтому бот не может писать в него напрямую. Кружка ложится сюда, а
-- приложение забирает её при следующем открытии и вливает в дневник.
CREATE TABLE IF NOT EXISTS inbox (
  -- Идентификатор сразу тот, с которым запись будет жить в дневнике
  id         TEXT PRIMARY KEY,
  tg_id      INTEGER NOT NULL,
  ts         INTEGER NOT NULL,
  ml         INTEGER NOT NULL,
  style      TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inbox_user ON inbox (tg_id, ts);

-- Последний выбор человека: бот предлагает «ещё такое же», а справочника
-- предпочтений у него нет — дневник ему недоступен.
ALTER TABLE users ADD COLUMN last_ml INTEGER;
ALTER TABLE users ADD COLUMN last_style TEXT;
