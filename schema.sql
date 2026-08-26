CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'super_admin')),
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
  fulfiller_wallet TEXT,
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
  escrow_asset TEXT NOT NULL CHECK (escrow_asset IN ('USDC', 'USDT', 'BTC')),
  escrow_mode TEXT NOT NULL DEFAULT 'real' CHECK (escrow_mode IN ('sandbox', 'real')),
  cdp_account_id TEXT,
  cdp_transaction_id TEXT,
  deposit_address TEXT,
  deposit_memo TEXT,
  escrow_tx_hash TEXT,
  deposit_amount NUMERIC(28,8),
  required_confirmations INTEGER NOT NULL DEFAULT 3,
  confirmations INTEGER NOT NULL DEFAULT 0,
  deposit_status TEXT NOT NULL DEFAULT 'pending' CHECK (deposit_status IN ('pending', 'confirming', 'confirmed', 'rejected')),
  status TEXT NOT NULL DEFAULT 'awaiting_deposit' CHECK (status IN ('draft', 'awaiting_deposit', 'deposit_confirming', 'funded', 'open', 'accepted', 'payment_pending', 'payment_proof_submitted', 'payment_received', 'confirmed', 'released', 'in_progress', 'awaiting_confirmation', 'under_admin_review', 'completed', 'disputed', 'cancelled')),
  proof_details TEXT,
  proof_submitted_at TIMESTAMPTZ,
  dispute_reason TEXT,
  completed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES users(id),
  escrow_status TEXT NOT NULL DEFAULT 'pending',
  release_status TEXT NOT NULL DEFAULT 'not_released',
  provider_transaction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS requests_marketplace_idx ON requests (status, deposit_status, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_requester_idx ON requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS requests_fulfiller_idx ON requests (fulfiller_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL CHECK (asset IN ('USDC', 'USDT', 'BTC')),
  available_balance NUMERIC(28,8) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  locked_balance NUMERIC(28,8) NOT NULL DEFAULT 0 CHECK (locked_balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, asset)
);

CREATE TABLE IF NOT EXISTS deposit_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL UNIQUE REFERENCES requests(id) ON DELETE CASCADE,
  asset TEXT NOT NULL CHECK (asset IN ('USDC', 'USDT', 'BTC')),
  address TEXT NOT NULL,
  memo TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  request_id UUID REFERENCES requests(id),
  asset TEXT NOT NULL CHECK (asset IN ('USDC', 'USDT', 'BTC')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('deposit', 'escrow_lock', 'escrow_release', 'withdrawal', 'withdrawal_failed', 'adjustment')),
  amount NUMERIC(28,8) NOT NULL CHECK (amount > 0),
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'failed')),
  confirmations INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES requests(id),
  user_id UUID NOT NULL REFERENCES users(id),
  asset TEXT NOT NULL CHECK (asset IN ('USDC', 'USDT', 'BTC')),
  destination_address TEXT NOT NULL,
  amount NUMERIC(28,8) NOT NULL CHECK (amount > 0),
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'broadcast', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ledger_user_idx ON ledger_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_request_idx ON ledger_entries (request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deposit_addresses_lookup_idx ON deposit_addresses (address, memo, active);

CREATE TABLE IF NOT EXISTS payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  transaction_reference TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_proofs_one_submitted_idx ON payment_proofs (request_id) WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS request_status_history_idx ON request_status_history (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_action_logs_request_idx ON admin_action_logs (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset TEXT NOT NULL CHECK (asset IN ('USDC', 'USDT', 'BTC')),
  destination_address TEXT NOT NULL,
  amount NUMERIC(28,8) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wallet_withdrawals_user_idx ON wallet_withdrawals (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  body TEXT,
  attachment_path TEXT,
  attachment_name TEXT,
  attachment_mime TEXT,
  attachment_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NULLIF(trim(body), '') IS NOT NULL OR attachment_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS chat_messages_request_idx ON chat_messages (request_id, created_at ASC);
