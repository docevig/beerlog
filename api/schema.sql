-- Схема beerlog, этап 3. Личный дневник остаётся в Telegram CloudStorage;
-- здесь лежит только то, что нужно другим людям.

CREATE TABLE IF NOT EXISTS users (
  tg_id      INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  photo_url  TEXT,
  created_at INTEGER NOT NULL
);

-- Витрина итогов: то, что видят друзья. Пересчитывается клиентом целиком
CREATE TABLE IF NOT EXISTS totals (
  tg_id      INTEGER NOT NULL,
  period     TEXT NOT NULL,
  ml         INTEGER NOT NULL,
  portions   INTEGER NOT NULL,
  styles     INTEGER NOT NULL,
  avg_srm    REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (tg_id, period)
);

-- Дружба хранится один раз: пара нормализована по возрастанию id
CREATE TABLE IF NOT EXISTS friendships (
  low_id  INTEGER NOT NULL,
  high_id INTEGER NOT NULL,
  since   INTEGER NOT NULL,
  PRIMARY KEY (low_id, high_id),
  CHECK (low_id < high_id)
);

-- Одноразовые приглашения со сроком жизни
CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  author_id  INTEGER NOT NULL,
  party_id   TEXT,
  expires_at INTEGER NOT NULL,
  used_by    INTEGER,
  used_at    INTEGER
);

CREATE TABLE IF NOT EXISTS parties (
  id         TEXT PRIMARY KEY,
  title      TEXT,
  host_id    INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id  TEXT NOT NULL,
  tg_id     INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (party_id, tg_id)
);

CREATE TABLE IF NOT EXISTS party_entries (
  id       TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  tg_id    INTEGER NOT NULL,
  ts       INTEGER NOT NULL,
  ml       INTEGER NOT NULL,
  style    TEXT NOT NULL,
  name     TEXT
);

CREATE INDEX IF NOT EXISTS idx_party_entries_party ON party_entries (party_id, ts);
CREATE INDEX IF NOT EXISTS idx_members_user ON party_members (tg_id);
CREATE INDEX IF NOT EXISTS idx_parties_host ON parties (host_id, started_at);
