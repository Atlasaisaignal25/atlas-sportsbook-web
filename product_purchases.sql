create table if not exists public.product_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_code text not null,
  sport text,
  status text not null default 'paid',
  stripe_customer_id text,
  stripe_payment_intent_id text,
  stripe_checkout_session_id text unique,
  stripe_price_id text,
  access_date date not null,
  amount_total integer,
  currency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_purchases_user_date_idx
  on public.product_purchases(user_id, access_date);

create index if not exists product_purchases_product_date_idx
  on public.product_purchases(product_code, access_date);

create unique index if not exists product_purchases_one_paid_daily_product_per_user
  on public.product_purchases(user_id, product_code, access_date)
  where status = 'paid';
