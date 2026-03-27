create or replace function public.month_start_for(reference_on date default current_date)
returns date
language sql
immutable
as $$
  select date_trunc('month', reference_on::timestamp)::date;
$$;

create or replace function public.next_month_start_for(reference_on date default current_date)
returns date
language sql
immutable
as $$
  select (date_trunc('month', reference_on::timestamp) + interval '1 month')::date;
$$;

create or replace view public.household_month_to_date_totals
with (security_invoker = true) as
with month_window as (
  select
    public.month_start_for(current_date) as month_start,
    public.next_month_start_for(current_date) as next_month_start
)
select
  transactions.household_id,
  month_window.month_start,
  count(*)::bigint as transaction_count,
  count(*) filter (
    where transactions.needs_review = true
      or transactions.status in ('flagged', 'needs_review')
  )::bigint as review_count,
  coalesce(sum(transactions.amount), 0::numeric) as total_spend,
  coalesce(
    sum(transactions.amount) filter (
      where transactions.needs_review = false
        and transactions.status not in ('flagged', 'needs_review')
    ),
    0::numeric
  ) as cleared_spend,
  max(transactions.transaction_date) as latest_transaction_date,
  max(transactions.created_at) as latest_ingested_at
from public.transactions transactions
cross join month_window
where transactions.transaction_date >= month_window.month_start
  and transactions.transaction_date < month_window.next_month_start
group by transactions.household_id, month_window.month_start;

create or replace view public.household_category_month_to_date
with (security_invoker = true) as
with month_window as (
  select
    public.month_start_for(current_date) as month_start,
    public.next_month_start_for(current_date) as next_month_start
)
select
  transactions.household_id,
  month_window.month_start,
  transactions.category_id,
  coalesce(categories.name, 'Uncategorized') as category_name,
  count(*)::bigint as transaction_count,
  count(*) filter (
    where transactions.needs_review = true
      or transactions.status in ('flagged', 'needs_review')
  )::bigint as review_count,
  coalesce(sum(transactions.amount), 0::numeric) as total_spend
from public.transactions transactions
cross join month_window
left join public.categories categories
  on categories.id = transactions.category_id
where transactions.transaction_date >= month_window.month_start
  and transactions.transaction_date < month_window.next_month_start
group by
  transactions.household_id,
  month_window.month_start,
  transactions.category_id,
  coalesce(categories.name, 'Uncategorized');

create or replace view public.household_statement_sync_status
with (security_invoker = true) as
select
  statement_uploads.household_id,
  max(statement_uploads.uploaded_at) as last_statement_upload_at,
  max(statement_uploads.synced_at) as last_statement_sync_at,
  max(statement_uploads.synced_at) filter (
    where statement_uploads.parse_status in ('parsed', 'partial')
  ) as last_successful_sync_at,
  (
    array_agg(
      statement_uploads.parse_status
      order by coalesce(statement_uploads.synced_at, statement_uploads.uploaded_at) desc
    )
  )[1] as latest_parse_status,
  count(*) filter (where statement_uploads.parse_status = 'pending')::bigint as pending_statement_count,
  count(*) filter (where statement_uploads.parse_status = 'failed')::bigint as failed_statement_count,
  count(*) filter (where statement_uploads.parse_status = 'partial')::bigint as needs_review_statement_count
from public.statement_uploads statement_uploads
group by statement_uploads.household_id;

create or replace function public.get_household_dashboard_summary(
  target_household_id uuid,
  reference_on date default current_date
)
returns jsonb
language sql
stable
as $$
  with month_window as (
    select
      public.month_start_for(reference_on) as month_start,
      public.next_month_start_for(reference_on) as next_month_start
  ),
  totals as (
    select jsonb_build_object(
      'monthStart', month_window.month_start,
      'transactionCount', count(transactions.id),
      'reviewCount', count(*) filter (
        where transactions.needs_review = true
          or transactions.status in ('flagged', 'needs_review')
      ),
      'totalSpend', coalesce(sum(transactions.amount), 0::numeric),
      'clearedSpend', coalesce(
        sum(transactions.amount) filter (
          where transactions.needs_review = false
            and transactions.status not in ('flagged', 'needs_review')
        ),
        0::numeric
      )
    ) as payload
    from month_window
    left join public.transactions transactions
      on transactions.household_id = target_household_id
     and transactions.transaction_date >= month_window.month_start
     and transactions.transaction_date < month_window.next_month_start
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
  sync_status as (
    select jsonb_build_object(
      'lastStatementUploadAt', household_statement_sync_status.last_statement_upload_at,
      'lastStatementSyncAt', household_statement_sync_status.last_statement_sync_at,
      'lastSuccessfulSyncAt', household_statement_sync_status.last_successful_sync_at,
      'latestParseStatus', household_statement_sync_status.latest_parse_status,
      'pendingStatementCount', household_statement_sync_status.pending_statement_count,
      'failedStatementCount', household_statement_sync_status.failed_statement_count,
      'needsReviewStatementCount', household_statement_sync_status.needs_review_statement_count
    ) as payload
    from public.household_statement_sync_status household_statement_sync_status
    where household_statement_sync_status.household_id = target_household_id
  )
  select jsonb_build_object(
    'householdId', target_household_id,
    'totals', totals.payload,
    'categories', categories.payload,
    'syncStatus', coalesce(
      sync_status.payload,
      jsonb_build_object(
        'lastStatementUploadAt', null,
        'lastStatementSyncAt', null,
        'lastSuccessfulSyncAt', null,
        'latestParseStatus', null,
        'pendingStatementCount', 0,
        'failedStatementCount', 0,
        'needsReviewStatementCount', 0
      )
    )
  )
  from totals
  cross join categories
  left join sync_status on true;
$$;
