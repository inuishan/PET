create extension if not exists pgcrypto;

create type public.household_member_role as enum ('owner', 'member');
create type public.statement_parse_status as enum ('pending', 'processing', 'parsed', 'partial', 'failed');
create type public.transaction_source_type as enum (
  'credit_card_statement',
  'upi_whatsapp',
  'manual_entry',
  'system_adjustment'
);
create type public.transaction_status as enum ('processed', 'flagged', 'needs_review', 'failed');
create type public.transaction_owner_scope as enum ('member', 'shared', 'unknown');
create type public.classification_method as enum ('rules', 'llm', 'manual', 'inherited');
create type public.notification_channel as enum ('push', 'email');
create type public.notification_status as enum ('queued', 'sent', 'failed', 'dismissed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  base_currency char(3) not null default 'INR',
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  color_token text,
  icon_name text,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (is_system = true and household_id is null)
    or (is_system = false and household_id is not null)
  )
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.household_member_role not null default 'member',
  display_name text,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, user_id),
  unique (household_id, id)
);

create table public.statement_uploads (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  source_provider text not null default 'google_drive',
  provider_file_id text not null check (char_length(trim(provider_file_id)) > 0),
  provider_file_name text not null check (char_length(trim(provider_file_name)) > 0),
  bank_name text,
  card_name text,
  parser_profile_name text,
  statement_password_key text,
  billing_period_start date,
  billing_period_end date,
  uploaded_at timestamptz not null default now(),
  synced_at timestamptz,
  parse_status public.statement_parse_status not null default 'pending',
  parse_confidence numeric(4,3) check (parse_confidence is null or parse_confidence between 0 and 1),
  parse_error text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, provider_file_id),
  check (
    billing_period_start is null
    or billing_period_end is null
    or billing_period_end >= billing_period_start
  )
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  statement_upload_id uuid references public.statement_uploads (id) on delete set null,
  owner_member_id uuid,
  owner_scope public.transaction_owner_scope not null default 'unknown',
  source_type public.transaction_source_type not null default 'credit_card_statement',
  source_reference text,
  merchant_raw text not null check (char_length(trim(merchant_raw)) > 0),
  merchant_normalized text,
  description text,
  amount numeric(12,2) not null check (amount > 0),
  currency char(3) not null default 'INR',
  transaction_date date not null,
  posted_at date,
  status public.transaction_status not null default 'processed',
  needs_review boolean not null default false,
  review_reason text,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  classification_method public.classification_method not null default 'rules',
  category_id uuid references public.categories (id) on delete set null,
  fingerprint text not null check (char_length(trim(fingerprint)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, owner_member_id)
    references public.household_members (household_id, id)
    on delete set null (owner_member_id),
  unique (household_id, fingerprint),
  check (
    (owner_scope = 'member' and owner_member_id is not null)
    or (owner_scope <> 'member' and owner_member_id is null)
  )
);

create table public.merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  raw_merchant_name text not null check (char_length(trim(raw_merchant_name)) > 0),
  normalized_merchant_name text not null check (char_length(trim(normalized_merchant_name)) > 0),
  category_id uuid references public.categories (id) on delete set null,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, raw_merchant_name)
);

create table public.classification_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  classifier_user_id uuid references auth.users (id) on delete set null,
  method public.classification_method not null,
  previous_category_id uuid references public.categories (id) on delete set null,
  next_category_id uuid references public.categories (id) on delete set null,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  rationale text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  related_statement_upload_id uuid references public.statement_uploads (id) on delete set null,
  related_transaction_id uuid references public.transactions (id) on delete set null,
  notification_type text not null check (char_length(trim(notification_type)) > 0),
  channel public.notification_channel not null,
  status public.notification_status not null default 'queued',
  title text not null check (char_length(trim(title)) > 0),
  body text not null check (char_length(trim(body)) > 0),
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_system_name_idx
  on public.categories (lower(name))
  where household_id is null;

create unique index categories_household_name_idx
  on public.categories (household_id, lower(name))
  where household_id is not null;

create index household_members_user_id_idx on public.household_members (user_id);
create index statement_uploads_household_uploaded_at_idx on public.statement_uploads (household_id, uploaded_at desc);
create index statement_uploads_household_parse_status_idx on public.statement_uploads (household_id, parse_status);
create index transactions_household_transaction_date_idx on public.transactions (household_id, transaction_date desc);
create index transactions_household_category_idx on public.transactions (household_id, category_id);
create index transactions_household_review_idx on public.transactions (household_id, needs_review);
create index merchant_aliases_household_normalized_idx on public.merchant_aliases (household_id, normalized_merchant_name);
create index classification_events_transaction_created_at_idx on public.classification_events (transaction_id, created_at desc);
create index notifications_recipient_created_at_idx on public.notifications (recipient_user_id, created_at desc);

create trigger set_households_updated_at
before update on public.households
for each row
execute function public.set_updated_at();

create trigger set_categories_updated_at
before update on public.categories
for each row
execute function public.set_updated_at();

create trigger set_household_members_updated_at
before update on public.household_members
for each row
execute function public.set_updated_at();

create trigger set_statement_uploads_updated_at
before update on public.statement_uploads
for each row
execute function public.set_updated_at();

create trigger set_transactions_updated_at
before update on public.transactions
for each row
execute function public.set_updated_at();

create trigger set_merchant_aliases_updated_at
before update on public.merchant_aliases
for each row
execute function public.set_updated_at();

create trigger set_notifications_updated_at
before update on public.notifications
for each row
execute function public.set_updated_at();

insert into public.categories (
  name,
  color_token,
  icon_name,
  is_system,
  sort_order
)
values
  ('Food & Dining', 'amber', 'utensils', true, 10),
  ('Groceries', 'green', 'shopping-basket', true, 20),
  ('Transport', 'blue', 'car', true, 30),
  ('Shopping', 'rose', 'shopping-bag', true, 40),
  ('Bills & Utilities', 'slate', 'receipt', true, 50),
  ('Home', 'orange', 'home', true, 60),
  ('Health', 'red', 'heart-pulse', true, 70),
  ('Entertainment', 'violet', 'film', true, 80),
  ('Travel', 'sky', 'plane', true, 90),
  ('Subscriptions', 'indigo', 'repeat', true, 100),
  ('Uncategorized', 'stone', 'circle-help', true, 110)
on conflict do nothing;
