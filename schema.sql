CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  completed_requests INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id),
  fulfiller_id UUID REFERENCES users(id),
  method TEXT NOT NULL CHECK (method IN ('venmo', 'paypal', 'zelle', 'cashapp')),
  recipient_name TEXT NOT NULL,
  recipient_contact TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reward NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (reward >= 0),
  fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  total NUMERIC(12,2) NOT NULL CHECK (total > 0),
  reason TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  escrow_asset TEXT NOT NULL CHECK (escrow_asset IN ('BTC', 'USDT')),
  escrow_tx_hash TEXT,
  deposit_status TEXT NOT NULL DEFAULT 'pending' CHECK (deposit_status IN ('pending', 'confirming', 'confirmed', 'rejected')),
  status TEXT NOT NULL DEFAULT 'awaiting_deposit' CHECK (status IN ('draft', 'awaiting_deposit', 'deposit_confirming', 'open', 'accepted', 'in_progress', 'awaiting_confirmation', 'under_admin_review', 'completed', 'disputed', 'cancelled')),
  proof_details TEXT,
  proof_submitted_at TIMESTAMPTZ,
  dispute_reason TEXT,
  completed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS requests_marketplace_idx ON requests (status, deposit_status, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_requester_idx ON requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_fulfiller_idx ON requests (fulfiller_id, created_at DESC);
