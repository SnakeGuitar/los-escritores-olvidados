CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('admin', 'official_reader')),
  discord_guild_id TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  discord_token_expires_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing installations predate the cached Discord authorization fields.
-- They stay nullable so an active legacy session can be validated and upgraded once.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('admin', 'official_reader'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS discord_guild_id TEXT;

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS reading_queues (
  id TEXT PRIMARY KEY CHECK (id IN ('community', 'professional')),
  label TEXT NOT NULL
);

INSERT INTO reading_queues (id, label)
VALUES ('community', 'Lista comunitaria'), ('professional', 'Lista profesional')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS reading_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id TEXT NOT NULL REFERENCES reading_queues(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  work_title TEXT,
  strike_count SMALLINT NOT NULL DEFAULT 0 CHECK (strike_count BETWEEN 0 AND 3),
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL CHECK (position > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (queue_id, position)
);

CREATE INDEX IF NOT EXISTS reading_entries_queue_idx ON reading_entries(queue_id, position);

CREATE TABLE IF NOT EXISTS contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  theme TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'judging', 'closed')),
  deadline DATE,
  prize TEXT NOT NULL DEFAULT '',
  month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year SMALLINT NOT NULL CHECK (year BETWEEN 2020 AND 2200),
  rules_url TEXT,
  discord_url TEXT,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contests_public_idx ON contests(published, year DESC, month DESC);

CREATE TABLE IF NOT EXISTS contest_texts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  distinction TEXT NOT NULL CHECK (distinction IN ('winner', 'finalist', 'honorable_mention')),
  position SMALLINT NOT NULL DEFAULT 1 CHECK (position BETWEEN 1 AND 3),
  title TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  discord_thread_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contest_id, distinction, position)
);

CREATE INDEX IF NOT EXISTS contest_texts_public_idx ON contest_texts(contest_id, status, distinction, position);
