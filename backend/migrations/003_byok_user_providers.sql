-- BYOK: User LLM Provider Configuration
-- Stores encrypted API keys and provider preferences per user.

-- ── user_providers ──────────────────────────────────────────────
create table if not exists public.user_providers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- Provider config
  provider     text not null,
  model        text not null default '',
  base_url     text not null default '',

  -- Encrypted credentials (AES-256-GCM)
  api_key_enc  text not null default '',

  -- Status
  is_active    boolean not null default true,
  is_default   boolean not null default false,
  last_used_at timestamptz,
  last_error   text,

  -- Metadata
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One config per provider per user
  unique(user_id, provider)
);

-- RLS: users can ONLY access their own rows
alter table public.user_providers enable row level security;

drop policy if exists "Users manage own providers" on public.user_providers;
create policy "Users manage own providers"
  on public.user_providers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast lookup during LLM calls
create index if not exists idx_user_providers_active
  on public.user_providers(user_id, is_default, is_active);


-- ── api_key_audit_log ───────────────────────────────────────────
create table if not exists public.api_key_audit_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null,     -- 'created' | 'deleted' | 'tested' | 'failed' | 'rotated'
  provider   text not null,
  ip_address text,
  user_agent text,
  metadata   jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table public.api_key_audit_log enable row level security;

-- Users can view their own audit log
drop policy if exists "Users view own audit log" on public.api_key_audit_log;
create policy "Users view own audit log"
  on public.api_key_audit_log for select
  using (auth.uid() = user_id);

-- Backend inserts via service key (users cannot insert/update/delete)
