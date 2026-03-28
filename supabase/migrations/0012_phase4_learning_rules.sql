alter table public.merchant_aliases
  add column if not exists confirmation_count integer not null default 1
    check (confirmation_count >= 0),
  add column if not exists last_confirmed_at timestamptz,
  add column if not exists source_transaction_id uuid references public.transactions (id) on delete set null,
  add column if not exists active boolean not null default true;

update public.merchant_aliases
set confirmation_count = greatest(coalesce(confirmation_count, 0), 1),
    last_confirmed_at = coalesce(last_confirmed_at, updated_at, created_at),
    active = coalesce(active, true)
where category_id is not null;

create index if not exists merchant_aliases_household_active_normalized_idx
  on public.merchant_aliases (household_id, active, normalized_merchant_name, updated_at desc);
