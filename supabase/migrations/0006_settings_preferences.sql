create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type text not null check (char_length(trim(notification_type)) > 0),
  channel public.notification_channel not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, user_id, notification_type, channel)
);

create index notification_preferences_user_household_idx
  on public.notification_preferences (user_id, household_id, created_at desc);

create trigger set_notification_preferences_updated_at
before update on public.notification_preferences
for each row
execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

create policy notification_preferences_select_for_recipient
on public.notification_preferences
for select
using (
  auth.uid() is not null
  and user_id = auth.uid()
  and public.is_household_member(household_id)
);

create policy notification_preferences_insert_for_recipient
on public.notification_preferences
for insert
with check (
  auth.uid() is not null
  and user_id = auth.uid()
  and public.is_household_member(household_id)
);

create policy notification_preferences_update_for_recipient
on public.notification_preferences
for update
using (
  auth.uid() is not null
  and user_id = auth.uid()
  and public.is_household_member(household_id)
)
with check (
  auth.uid() is not null
  and user_id = auth.uid()
  and public.is_household_member(household_id)
);

create or replace function public.get_household_settings_summary(
  target_household_id uuid,
  reference_on date default current_date
)
returns jsonb
language sql
stable
security invoker
as $$
  with month_window as (
    select
      public.month_start_for(reference_on) as month_start,
      public.next_month_start_for(reference_on) as next_month_start
  ),
  categories as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'categoryId', ranked.category_id,
          'categoryName', ranked.category_name,
          'transactionCount', ranked.transaction_count,
          'reviewCount', ranked.review_count,
          'totalSpend', ranked.total_spend
        )
        order by ranked.total_spend desc, ranked.category_name asc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        transactions.category_id,
        coalesce(categories.name, 'Uncategorized') as category_name,
        count(*)::bigint as transaction_count,
        count(*) filter (
          where transactions.needs_review = true
            or transactions.status in ('flagged', 'needs_review')
        )::bigint as review_count,
        coalesce(sum(transactions.amount), 0::numeric) as total_spend
      from month_window
      join public.transactions transactions
        on transactions.household_id = target_household_id
       and transactions.transaction_date >= month_window.month_start
       and transactions.transaction_date < month_window.next_month_start
      left join public.categories categories
        on categories.id = transactions.category_id
      group by transactions.category_id, coalesce(categories.name, 'Uncategorized')
    ) ranked
  ),
  parser_profiles as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ranked.profile_id,
          'issuer', ranked.issuer,
          'lastUsedAt', ranked.last_used_at,
          'name', ranked.profile_name,
          'status', ranked.profile_status,
          'successRate', ranked.success_rate
        )
        order by ranked.profile_sort_rank asc, ranked.last_used_at desc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        lower(regexp_replace(trim(coalesce(statement_uploads.parser_profile_name, concat_ws(' ', statement_uploads.bank_name, statement_uploads.card_name, 'parser'))), '[^a-zA-Z0-9]+', '-', 'g')) as profile_id,
        coalesce(nullif(trim(statement_uploads.bank_name), ''), 'Unknown issuer') as issuer,
        max(coalesce(statement_uploads.synced_at, statement_uploads.uploaded_at)) as last_used_at,
        coalesce(
          nullif(trim(statement_uploads.parser_profile_name), ''),
          concat_ws(
            ' ',
            nullif(trim(statement_uploads.bank_name), ''),
            nullif(trim(statement_uploads.card_name), ''),
            'statement parser'
          )
        ) as profile_name,
        case
          when count(*) filter (where statement_uploads.parse_status = 'failed') > 0 then 'needs_attention'
          when count(*) filter (where statement_uploads.parse_status in ('partial', 'pending', 'processing')) > 0 then 'fallback'
          else 'active'
        end as profile_status,
        round(
          (
            count(*) filter (where statement_uploads.parse_status in ('parsed', 'partial'))::numeric
            / nullif(count(*)::numeric, 0)
          ) * 100
        )::integer as success_rate,
        case
          when count(*) filter (where statement_uploads.parse_status = 'failed') > 0 then 0
          when count(*) filter (where statement_uploads.parse_status in ('partial', 'pending', 'processing')) > 0 then 1
          else 2
        end as profile_sort_rank
      from public.statement_uploads statement_uploads
      where statement_uploads.household_id = target_household_id
        and coalesce(
          nullif(trim(statement_uploads.parser_profile_name), ''),
          nullif(trim(statement_uploads.bank_name), ''),
          nullif(trim(statement_uploads.card_name), '')
        ) is not null
      group by
        lower(regexp_replace(trim(coalesce(statement_uploads.parser_profile_name, concat_ws(' ', statement_uploads.bank_name, statement_uploads.card_name, 'parser'))), '[^a-zA-Z0-9]+', '-', 'g')),
        coalesce(nullif(trim(statement_uploads.bank_name), ''), 'Unknown issuer'),
        coalesce(
          nullif(trim(statement_uploads.parser_profile_name), ''),
          concat_ws(
            ' ',
            nullif(trim(statement_uploads.bank_name), ''),
            nullif(trim(statement_uploads.card_name), ''),
            'statement parser'
          )
        )
    ) ranked
  ),
  sync_status as (
    select jsonb_build_object(
      'lastAttemptAt', max(coalesce(statement_uploads.synced_at, statement_uploads.uploaded_at)),
      'lastError', (
        array_agg(statement_uploads.parse_error order by coalesce(statement_uploads.synced_at, statement_uploads.uploaded_at) desc)
        filter (where statement_uploads.parse_error is not null)
      )[1],
      'lastSuccessfulSyncAt', max(statement_uploads.synced_at) filter (
        where statement_uploads.parse_status in ('parsed', 'partial')
      ),
      'latestParseStatus', (
        array_agg(statement_uploads.parse_status order by coalesce(statement_uploads.synced_at, statement_uploads.uploaded_at) desc)
      )[1],
      'pendingStatementCount', count(*) filter (where statement_uploads.parse_status = 'pending'),
      'failedStatementCount', count(*) filter (where statement_uploads.parse_status = 'failed'),
      'needsReviewStatementCount', count(*) filter (where statement_uploads.parse_status = 'partial')
    ) as payload
    from public.statement_uploads statement_uploads
    where statement_uploads.household_id = target_household_id
  )
  select jsonb_build_object(
    'householdId', target_household_id,
    'categories', categories.payload,
    'parserProfiles', parser_profiles.payload,
    'syncStatus', coalesce(
      sync_status.payload,
      jsonb_build_object(
        'lastAttemptAt', null,
        'lastError', null,
        'lastSuccessfulSyncAt', null,
        'latestParseStatus', null,
        'pendingStatementCount', 0,
        'failedStatementCount', 0,
        'needsReviewStatementCount', 0
      )
    )
  )
  from categories
  cross join parser_profiles
  left join sync_status on true;
$$;

revoke all on function public.get_household_settings_summary(uuid, date) from public;
revoke all on function public.get_household_settings_summary(uuid, date) from anon;
grant execute on function public.get_household_settings_summary(uuid, date) to authenticated;

create or replace function public.upsert_notification_preference(
  target_household_id uuid,
  target_notification_type text,
  target_channel public.notification_channel,
  next_enabled boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  saved_preference public.notification_preferences%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_member(target_household_id) then
    raise exception 'Household access required';
  end if;

  insert into public.notification_preferences (
    household_id,
    user_id,
    notification_type,
    channel,
    enabled
  )
  values (
    target_household_id,
    auth.uid(),
    trim(target_notification_type),
    target_channel,
    next_enabled
  )
  on conflict (household_id, user_id, notification_type, channel)
  do update
  set enabled = excluded.enabled
  returning *
  into saved_preference;

  return jsonb_build_object(
    'channel', saved_preference.channel,
    'enabled', saved_preference.enabled,
    'notificationType', saved_preference.notification_type
  );
end;
$$;

revoke all on function public.upsert_notification_preference(uuid, text, public.notification_channel, boolean) from public;
revoke all on function public.upsert_notification_preference(uuid, text, public.notification_channel, boolean) from anon;
grant execute on function public.upsert_notification_preference(uuid, text, public.notification_channel, boolean) to authenticated;
