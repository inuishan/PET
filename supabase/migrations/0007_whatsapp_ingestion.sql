alter table public.transactions
  add constraint transactions_household_id_id_key unique (household_id, id);

create table public.whatsapp_participants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid,
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  display_name text check (
    display_name is null
    or char_length(trim(display_name)) between 1 and 80
  ),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz not null default now(),
  revoked_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, phone_e164),
  unique (household_id, id),
  foreign key (household_id, member_id)
    references public.household_members (household_id, id)
    on delete set null (member_id),
  check (revoked_at is null or revoked_at >= approved_at)
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  participant_id uuid not null,
  provider_message_id text not null check (char_length(trim(provider_message_id)) > 0),
  message_type text not null default 'text' check (char_length(trim(message_type)) > 0),
  raw_message_text text not null check (char_length(trim(raw_message_text)) > 0),
  normalized_message_text text not null check (char_length(trim(normalized_message_text)) > 0),
  provider_sent_at timestamptz,
  received_at timestamptz not null default now(),
  parse_status text not null default 'pending' check (
    parse_status in (
      'pending',
      'processing',
      'parsed',
      'posted',
      'needs_review',
      'failed',
      'ignored'
    )
  ),
  parse_metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  transaction_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, provider_message_id),
  foreign key (household_id, participant_id)
    references public.whatsapp_participants (household_id, id)
    on delete cascade,
  foreign key (household_id, transaction_id)
    references public.transactions (household_id, id)
    on delete set null (transaction_id),
  check (provider_sent_at is null or provider_sent_at <= received_at)
);

create index whatsapp_participants_household_active_idx
  on public.whatsapp_participants (household_id, approved_at desc)
  where revoked_at is null;

create index whatsapp_participants_member_idx
  on public.whatsapp_participants (household_id, member_id);

create index whatsapp_messages_household_received_at_idx
  on public.whatsapp_messages (household_id, received_at desc);

create index whatsapp_messages_participant_received_at_idx
  on public.whatsapp_messages (participant_id, received_at desc);

create index whatsapp_messages_transaction_idx
  on public.whatsapp_messages (transaction_id)
  where transaction_id is not null;

create trigger set_whatsapp_participants_updated_at
before update on public.whatsapp_participants
for each row
execute function public.set_updated_at();

create trigger set_whatsapp_messages_updated_at
before update on public.whatsapp_messages
for each row
execute function public.set_updated_at();
