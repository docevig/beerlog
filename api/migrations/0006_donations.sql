-- Поддержка звёздами. Храним факт платежа, а не деньги: расчёты ведёт Telegram,
-- нам эта таблица нужна, чтобы поблагодарить и знать, что оплата дошла.
CREATE TABLE IF NOT EXISTS donations (
  -- Идентификатор платежа в Telegram: по нему же оформляется возврат
  charge_id TEXT PRIMARY KEY,
  tg_id     INTEGER NOT NULL,
  stars     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_donations_user ON donations (tg_id, created_at);
