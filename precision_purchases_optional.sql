-- Optional future table.
-- public.product_purchases already supports current daily purchases with:
-- user_id, product_code, sport, access_date, stripe_checkout_session_id, status.
-- It does not include product_type or access_until. If Precision Engine needs
-- stricter daily access windows later, use this non-destructive table.

create extension if not exists pgcrypto;

create table if not exists public.precision_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_type text not null check (product_type in ('top_signal', 'top_play')),
  sport text,
  access_date date not null,
  access_until timestamptz not null,
  status text not null default 'paid',
  stripe_customer_id text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_price_id text,
  precision_snapshot_id uuid references public.precision_snapshots(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists precision_purchases_user_date_idx
  on public.precision_purchases(user_id, access_date);

create index if not exists precision_purchases_product_date_idx
  on public.precision_purchases(product_type, sport, access_date);

create index if not exists precision_purchases_access_until_idx
  on public.precision_purchases(access_until);
