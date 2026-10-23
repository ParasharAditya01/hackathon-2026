-- AidFlow PostgreSQL schema, version 1.
-- This schema intentionally contains no public write endpoints. Authenticated
-- service routes must enforce domain rules and transactions before mutations.

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('operator', 'admin')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aid_batches (
  id TEXT PRIMARY KEY,
  donor TEXT NOT NULL,
  name TEXT NOT NULL,
  aid_type TEXT NOT NULL CHECK (aid_type IN ('prepared', 'perishable', 'raw', 'medical', 'infant_formula', 'essential')),
  original_quantity INTEGER NOT NULL CHECK (original_quantity > 0),
  available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  picked_quantity INTEGER NOT NULL DEFAULT 0 CHECK (picked_quantity >= 0),
  delivered_quantity INTEGER NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0),
  rejected_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  pickup_at TIMESTAMPTZ NOT NULL,
  safe_use_deadline TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  handling_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (pickup_at < safe_use_deadline),
  CHECK (available_quantity + reserved_quantity + picked_quantity + delivered_quantity + rejected_quantity = original_quantity)
);

CREATE TABLE IF NOT EXISTS riders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  transport TEXT NOT NULL,
  zone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'unavailable')),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Also upgrade databases created before rider phone numbers were introduced.
ALTER TABLE riders ADD COLUMN IF NOT EXISTS phone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS riders_phone_unique_idx ON riders(phone) WHERE phone IS NOT NULL AND phone <> '';

CREATE TABLE IF NOT EXISTS receiving_sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  zone TEXT NOT NULL,
  demand INTEGER NOT NULL CHECK (demand >= 0),
  delivered_quantity INTEGER NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0 AND delivered_quantity <= demand),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'limited', 'closed')),
  has_clean_water BOOLEAN NOT NULL DEFAULT FALSE,
  has_cooking_fuel BOOLEAN NOT NULL DEFAULT FALSE,
  has_cold_storage BOOLEAN NOT NULL DEFAULT FALSE,
  has_medical_storage BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_aid_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES aid_batches(id) ON DELETE RESTRICT,
  rider_id TEXT NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
  receiving_site_id TEXT NOT NULL REFERENCES receiving_sites(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  travel_minutes INTEGER NOT NULL CHECK (travel_minutes >= 0),
  safety_buffer_minutes INTEGER NOT NULL CHECK (safety_buffer_minutes >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled', 'accepted', 'picked_up', 'delivered', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS reservations_status_expiry_idx ON reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS reservations_batch_idx ON reservations(batch_id);
CREATE INDEX IF NOT EXISTS reservations_rider_idx ON reservations(rider_id);
CREATE INDEX IF NOT EXISTS reservations_site_idx ON reservations(receiving_site_id);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  reservation_id TEXT UNIQUE REFERENCES reservations(id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL REFERENCES aid_batches(id) ON DELETE RESTRICT,
  rider_id TEXT NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
  receiving_site_id TEXT NOT NULL REFERENCES receiving_sites(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL CHECK (status IN ('accepted', 'picked_up', 'in_transit', 'reroute_required', 'escalated', 'delivered', 'cancelled', 'failed', 'spoiled', 'rejected')),
  history JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(history) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assignments_status_idx ON assignments(status);
CREATE INDEX IF NOT EXISTS assignments_batch_idx ON assignments(batch_id);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS alerts_status_created_idx ON alerts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'critical')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);


-- Opaque, server-verifiable records for successful user operations.
CREATE TABLE IF NOT EXISTS submission_confirmations (
 token UUID PRIMARY KEY DEFAULT gen_random_uuid(), action TEXT NOT NULL, reference_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS submission_confirmations_created_idx ON submission_confirmations(created_at DESC);
