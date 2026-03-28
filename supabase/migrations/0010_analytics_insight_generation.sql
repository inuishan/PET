create or replace function public.get_household_analytics_snapshot(
  target_household_id uuid,
  target_start_on date,
  target_end_on date,
  target_bucket public.analytics_bucket default 'month',
  target_comparison_start_on date default null,
  target_comparison_end_on date default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth
as $$
declare
  effective_comparison_end_on date;
  effective_comparison_start_on date;
  period_day_count integer;
  snapshot_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_member(target_household_id) then
    raise exception 'Household member access required';
  end if;

  if target_start_on is null or target_end_on is null then
    raise exception 'Analytics window is required';
  end if;

  if target_end_on < target_start_on then
    raise exception 'Analytics end date must be on or after the start date';
  end if;

  period_day_count := greatest((target_end_on - target_start_on) + 1, 1);
  effective_comparison_end_on := coalesce(target_comparison_end_on, target_start_on - 1);
  effective_comparison_start_on := coalesce(
    target_comparison_start_on,
    effective_comparison_end_on - (period_day_count - 1)
  );

  with current_period as (
    select *
    from public.household_transaction_analytics_facts analytics_facts
    where analytics_facts.household_id = target_household_id
      and analytics_facts.transaction_date >= target_start_on
      and analytics_facts.transaction_date <= target_end_on
  ),
  previous_period as (
    select *
    from public.household_transaction_analytics_facts analytics_facts
    where analytics_facts.household_id = target_household_id
      and analytics_facts.transaction_date >= effective_comparison_start_on
      and analytics_facts.transaction_date <= effective_comparison_end_on
  ),
  trend_boundaries as (
    select
      case
        when target_bucket = 'week' then date_trunc('week', target_start_on::timestamp)::date
        when target_bucket = 'year' then date_trunc('year', target_start_on::timestamp)::date
        else date_trunc('month', target_start_on::timestamp)::date
      end as first_bucket_start,
      case
        when target_bucket = 'week' then interval '1 week'
        when target_bucket = 'year' then interval '1 year'
        else interval '1 month'
      end as bucket_interval
  ),
  trend_buckets as (
    select
      generated.bucket_start::date as bucket_start_on,
      case
        when target_bucket = 'week' then least((generated.bucket_start::date + 6), target_end_on)
        when target_bucket = 'year' then least((((generated.bucket_start + interval '1 year')::date) - 1), target_end_on)
        else least((((generated.bucket_start + interval '1 month')::date) - 1), target_end_on)
      end as bucket_end_on,
      case
        when target_bucket = 'week' then to_char(generated.bucket_start, 'DD Mon')
        when target_bucket = 'year' then to_char(generated.bucket_start, 'YYYY')
        else to_char(generated.bucket_start, 'Mon YYYY')
      end as bucket_label
    from trend_boundaries
    cross join lateral generate_series(
      trend_boundaries.first_bucket_start::timestamp,
      target_end_on::timestamp,
      trend_boundaries.bucket_interval
    ) as generated(bucket_start)
  ),
  trend_series as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucketStartOn', trend_buckets.bucket_start_on,
          'bucketEndOn', trend_buckets.bucket_end_on,
          'bucketLabel', trend_buckets.bucket_label,
          'transactionCount', coalesce(aggregated.transaction_count, 0),
          'reviewCount', coalesce(aggregated.review_count, 0),
          'totalSpend', coalesce(aggregated.total_spend, 0::numeric)
        )
        order by trend_buckets.bucket_start_on asc
      ),
      '[]'::jsonb
    ) as payload
    from trend_buckets
    left join lateral (
      select
        count(*)::bigint as transaction_count,
        count(*) filter (where current_period.needs_review = true or current_period.status in ('flagged', 'needs_review'))::bigint as review_count,
        coalesce(sum(current_period.amount), 0::numeric) as total_spend
      from current_period
      where current_period.transaction_date >= trend_buckets.bucket_start_on
        and current_period.transaction_date <= trend_buckets.bucket_end_on
    ) aggregated on true
  ),
  comparison_metrics as (
    select jsonb_build_object(
      'currentSpend', coalesce((select sum(amount) from current_period), 0::numeric),
      'currentTransactionCount', coalesce((select count(*) from current_period), 0),
      'previousSpend', coalesce((select sum(amount) from previous_period), 0::numeric),
      'previousTransactionCount', coalesce((select count(*) from previous_period), 0),
      'deltaSpend', coalesce((select sum(amount) from current_period), 0::numeric) - coalesce((select sum(amount) from previous_period), 0::numeric),
      'deltaPercentage', case
        when coalesce((select sum(amount) from previous_period), 0::numeric) = 0::numeric then null
        else round(
          (
            (
              coalesce((select sum(amount) from current_period), 0::numeric) - coalesce((select sum(amount) from previous_period), 0::numeric)
            ) / nullif(coalesce((select sum(amount) from previous_period), 0::numeric), 0::numeric)
          ) * 100,
          1
        )
      end
    ) as payload
  ),
  category_allocation as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'categoryId', ranked.category_id,
          'categoryName', ranked.category_name,
          'transactionCount', ranked.transaction_count,
          'reviewCount', ranked.review_count,
          'totalSpend', ranked.total_spend,
          'shareBps', ranked.share_bps
        )
        order by ranked.total_spend desc, ranked.category_name asc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        current_period.category_id,
        current_period.category_name,
        count(*)::bigint as transaction_count,
        count(*) filter (where current_period.needs_review = true or current_period.status in ('flagged', 'needs_review'))::bigint as review_count,
        coalesce(sum(current_period.amount), 0::numeric) as total_spend,
        case
          when coalesce((select sum(amount) from current_period), 0::numeric) = 0::numeric then 0
          else round((coalesce(sum(current_period.amount), 0::numeric) / nullif((select sum(amount) from current_period), 0::numeric)) * 10000)
        end::integer as share_bps
      from current_period
      group by current_period.category_id, current_period.category_name
    ) ranked
  ),
  spend_by_person as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'ownerScope', ranked.owner_scope,
          'ownerMemberId', ranked.owner_member_id,
          'ownerDisplayName', ranked.owner_display_name,
          'transactionCount', ranked.transaction_count,
          'totalSpend', ranked.total_spend,
          'shareBps', ranked.share_bps
        )
        order by ranked.total_spend desc, ranked.owner_display_name asc nulls last
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        current_period.owner_scope,
        current_period.owner_member_id,
        current_period.owner_display_name,
        count(*)::bigint as transaction_count,
        coalesce(sum(current_period.amount), 0::numeric) as total_spend,
        case
          when coalesce((select sum(amount) from current_period), 0::numeric) = 0::numeric then 0
          else round((coalesce(sum(current_period.amount), 0::numeric) / nullif((select sum(amount) from current_period), 0::numeric)) * 10000)
        end::integer as share_bps
      from current_period
      group by current_period.owner_scope, current_period.owner_member_id, current_period.owner_display_name
    ) ranked
  ),
  spend_by_payment_source as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'sourceType', ranked.source_type,
          'paymentSourceLabel', ranked.payment_source_label,
          'transactionCount', ranked.transaction_count,
          'totalSpend', ranked.total_spend,
          'shareBps', ranked.share_bps
        )
        order by ranked.total_spend desc, ranked.payment_source_label asc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        current_period.source_type,
        current_period.payment_source_label,
        count(*)::bigint as transaction_count,
        coalesce(sum(current_period.amount), 0::numeric) as total_spend,
        case
          when coalesce((select sum(amount) from current_period), 0::numeric) = 0::numeric then 0
          else round((coalesce(sum(current_period.amount), 0::numeric) / nullif((select sum(amount) from current_period), 0::numeric)) * 10000)
        end::integer as share_bps
      from current_period
      group by current_period.source_type, current_period.payment_source_label
    ) ranked
  ),
  recurring_charge_candidates as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'merchantName', ranked.merchant_name,
          'categoryName', ranked.category_name,
          'paymentSourceLabel', ranked.payment_source_label,
          'transactionCount', ranked.transaction_count,
          'monthsActive', ranked.months_active,
          'averageAmount', ranked.average_amount,
          'averageCadenceDays', ranked.average_cadence_days,
          'lastChargedOn', ranked.last_charged_on
        )
        order by ranked.transaction_count desc, ranked.average_amount desc, ranked.merchant_name asc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        recurring_window.merchant_name,
        recurring_window.category_name,
        recurring_window.payment_source_label,
        count(*)::bigint as transaction_count,
        count(distinct recurring_window.transaction_month)::integer as months_active,
        round(avg(recurring_window.amount), 2) as average_amount,
        round(stddev_samp(recurring_window.amount), 2) as amount_stddev,
        case
          when count(*) < 2 then null
          else round(((max(recurring_window.transaction_date) - min(recurring_window.transaction_date))::numeric) / (count(*) - 1), 0)::integer
        end as average_cadence_days,
        max(recurring_window.transaction_date) as last_charged_on
      from public.household_transaction_analytics_facts recurring_window
      where recurring_window.household_id = target_household_id
        and recurring_window.transaction_date >= (target_end_on - 365)
        and recurring_window.transaction_date <= target_end_on
      group by
        recurring_window.merchant_name,
        recurring_window.category_name,
        recurring_window.payment_source_label
      having count(*) >= 2
         and count(distinct recurring_window.transaction_month) >= 2
    ) ranked
  ),
  published_insights as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ranked.id,
          'type', ranked.insight_type,
          'title', ranked.title,
          'summary', ranked.summary,
          'recommendation', ranked.recommendation,
          'estimatedMonthlyImpact', ranked.estimated_monthly_impact,
          'evidencePayload', ranked.evidence_payload,
          'generatedFrom', ranked.generated_from,
          'generatedAt', ranked.generated_at
        )
        order by ranked.generated_at desc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        insights.id,
        insights.insight_type,
        insights.title,
        insights.summary,
        insights.recommendation,
        insights.estimated_monthly_impact,
        insights.evidence_payload,
        insights.generated_from,
        insights.generated_at
      from public.insights insights
      where insights.household_id = target_household_id
        and insights.status = 'published'
        and (insights.expires_at is null or insights.expires_at >= now())
        and nullif(insights.generated_from ->> 'periodStart', '') = target_start_on::text
        and nullif(insights.generated_from ->> 'periodEnd', '') = target_end_on::text
      order by insights.generated_at desc
      limit 5
    ) ranked
  ),
  latest_report as (
    select jsonb_build_object(
      'id', analytics_reports.id,
      'title', analytics_reports.title,
      'generatedAt', analytics_reports.generated_at,
      'periodStart', analytics_reports.period_start,
      'periodEnd', analytics_reports.period_end
    ) as payload
    from public.analytics_reports analytics_reports
    where analytics_reports.household_id = target_household_id
      and analytics_reports.status = 'published'
      and analytics_reports.period_start = target_start_on
      and analytics_reports.period_end = target_end_on
    order by analytics_reports.generated_at desc
    limit 1
  )
  select jsonb_build_object(
    'householdId', target_household_id,
    'period', jsonb_build_object(
      'startOn', target_start_on,
      'endOn', target_end_on,
      'comparisonStartOn', effective_comparison_start_on,
      'comparisonEndOn', effective_comparison_end_on,
      'bucket', target_bucket
    ),
    'comparison', comparison_metrics.payload,
    'trendSeries', trend_series.payload,
    'categoryAllocation', category_allocation.payload,
    'spendByPerson', spend_by_person.payload,
    'spendByPaymentSource', spend_by_payment_source.payload,
    'recurringChargeCandidates', recurring_charge_candidates.payload,
    'insights', published_insights.payload,
    'latestReport', latest_report.payload
  )
  into snapshot_payload
  from comparison_metrics
  cross join trend_series
  cross join category_allocation
  cross join spend_by_person
  cross join spend_by_payment_source
  cross join recurring_charge_candidates
  cross join published_insights
  left join latest_report on true;

  return snapshot_payload;
end;
$$;

create or replace function public.get_household_analytics_report(
  target_household_id uuid,
  target_report_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, auth
as $$
declare
  resolved_report_id uuid;
  report_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_member(target_household_id) then
    raise exception 'Household member access required';
  end if;

  if target_report_id is null then
    select analytics_reports.id
    into resolved_report_id
    from public.analytics_reports analytics_reports
    where analytics_reports.household_id = target_household_id
      and analytics_reports.status = 'published'
    order by analytics_reports.generated_at desc
    limit 1;
  else
    resolved_report_id := target_report_id;
  end if;

  if resolved_report_id is null then
    return null;
  end if;

  with selected_report as (
    select *
    from public.analytics_reports analytics_reports
    where analytics_reports.id = resolved_report_id
      and analytics_reports.household_id = target_household_id
  ),
  linked_insights as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', insights.id,
          'type', insights.insight_type,
          'title', insights.title,
          'summary', insights.summary,
          'recommendation', insights.recommendation,
          'estimatedMonthlyImpact', insights.estimated_monthly_impact,
          'evidencePayload', insights.evidence_payload,
          'generatedFrom', insights.generated_from,
          'generatedAt', insights.generated_at
        )
        order by insights.generated_at desc
      ),
      '[]'::jsonb
    ) as payload
    from public.insights insights
    where insights.household_id = target_household_id
      and insights.analytics_report_id = resolved_report_id
      and insights.status in ('draft', 'published', 'superseded')
  )
  select jsonb_build_object(
    'id', selected_report.id,
    'title', selected_report.title,
    'summary', selected_report.summary,
    'reportType', selected_report.report_type,
    'generatedAt', selected_report.generated_at,
    'periodStart', selected_report.period_start,
    'periodEnd', selected_report.period_end,
    'comparison', jsonb_build_object(
      'previousSpend', coalesce(((selected_report.generation_metadata -> 'comparison') ->> 'previousSpend')::numeric, 0::numeric),
      'deltaSpend', coalesce(((selected_report.generation_metadata -> 'comparison') ->> 'deltaSpend')::numeric, 0::numeric),
      'deltaPercentage', ((selected_report.generation_metadata -> 'comparison') ->> 'deltaPercentage')::numeric
    ),
    'payload', coalesce(
      selected_report.report_payload,
      jsonb_build_object(
        'sections', '[]'::jsonb,
        'summaryInsightIds', '[]'::jsonb
      )
    ),
    'insights', linked_insights.payload
  )
  into report_payload
  from selected_report
  cross join linked_insights;

  return report_payload;
end;
$$;
