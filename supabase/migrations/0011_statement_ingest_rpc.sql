create or replace function public.ingest_statement_payload(
  statement_upload_payload jsonb,
  transaction_rows_payload jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_statement_upload_id uuid;
begin
  insert into public.statement_uploads (
    household_id,
    uploaded_by,
    source_provider,
    provider_file_id,
    provider_file_name,
    bank_name,
    card_name,
    parser_profile_name,
    statement_password_key,
    billing_period_start,
    billing_period_end,
    uploaded_at,
    synced_at,
    parse_status,
    parse_confidence,
    parse_error,
    raw_metadata
  )
  values (
    (statement_upload_payload ->> 'household_id')::uuid,
    nullif(statement_upload_payload ->> 'uploaded_by', '')::uuid,
    coalesce(statement_upload_payload ->> 'source_provider', 'google_drive'),
    statement_upload_payload ->> 'provider_file_id',
    statement_upload_payload ->> 'provider_file_name',
    nullif(statement_upload_payload ->> 'bank_name', ''),
    nullif(statement_upload_payload ->> 'card_name', ''),
    nullif(statement_upload_payload ->> 'parser_profile_name', ''),
    nullif(statement_upload_payload ->> 'statement_password_key', ''),
    nullif(statement_upload_payload ->> 'billing_period_start', '')::date,
    nullif(statement_upload_payload ->> 'billing_period_end', '')::date,
    coalesce((statement_upload_payload ->> 'uploaded_at')::timestamptz, now()),
    coalesce((statement_upload_payload ->> 'synced_at')::timestamptz, now()),
    coalesce(
      (statement_upload_payload ->> 'parse_status')::public.statement_parse_status,
      'pending'::public.statement_parse_status
    ),
    nullif(statement_upload_payload ->> 'parse_confidence', '')::numeric,
    nullif(statement_upload_payload ->> 'parse_error', ''),
    coalesce(statement_upload_payload -> 'raw_metadata', '{}'::jsonb)
  )
  on conflict (household_id, provider_file_id)
  do update set
    uploaded_by = excluded.uploaded_by,
    source_provider = excluded.source_provider,
    provider_file_name = excluded.provider_file_name,
    bank_name = excluded.bank_name,
    card_name = excluded.card_name,
    parser_profile_name = excluded.parser_profile_name,
    statement_password_key = excluded.statement_password_key,
    billing_period_start = excluded.billing_period_start,
    billing_period_end = excluded.billing_period_end,
    uploaded_at = excluded.uploaded_at,
    synced_at = excluded.synced_at,
    parse_status = excluded.parse_status,
    parse_confidence = excluded.parse_confidence,
    parse_error = excluded.parse_error,
    raw_metadata = excluded.raw_metadata
  returning id into saved_statement_upload_id;

  insert into public.transactions (
    household_id,
    statement_upload_id,
    owner_member_id,
    owner_scope,
    source_type,
    source_reference,
    merchant_raw,
    merchant_normalized,
    description,
    amount,
    currency,
    transaction_date,
    posted_at,
    status,
    needs_review,
    review_reason,
    confidence,
    classification_method,
    category_id,
    fingerprint,
    metadata
  )
  select
    (row_payload ->> 'household_id')::uuid,
    saved_statement_upload_id,
    nullif(row_payload ->> 'owner_member_id', '')::uuid,
    coalesce(
      (row_payload ->> 'owner_scope')::public.transaction_owner_scope,
      'unknown'::public.transaction_owner_scope
    ),
    coalesce(
      (row_payload ->> 'source_type')::public.transaction_source_type,
      'credit_card_statement'::public.transaction_source_type
    ),
    nullif(row_payload ->> 'source_reference', ''),
    row_payload ->> 'merchant_raw',
    nullif(row_payload ->> 'merchant_normalized', ''),
    nullif(row_payload ->> 'description', ''),
    (row_payload ->> 'amount')::numeric,
    coalesce(row_payload ->> 'currency', 'INR'),
    (row_payload ->> 'transaction_date')::date,
    nullif(row_payload ->> 'posted_at', '')::date,
    coalesce(
      (row_payload ->> 'status')::public.transaction_status,
      'processed'::public.transaction_status
    ),
    coalesce((row_payload ->> 'needs_review')::boolean, false),
    nullif(row_payload ->> 'review_reason', ''),
    nullif(row_payload ->> 'confidence', '')::numeric,
    coalesce(
      (row_payload ->> 'classification_method')::public.classification_method,
      'llm'::public.classification_method
    ),
    nullif(row_payload ->> 'category_id', '')::uuid,
    row_payload ->> 'fingerprint',
    coalesce(row_payload -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(transaction_rows_payload, '[]'::jsonb)) row_payload
  on conflict (household_id, fingerprint)
  do update set
    statement_upload_id = excluded.statement_upload_id,
    owner_member_id = excluded.owner_member_id,
    owner_scope = excluded.owner_scope,
    source_type = excluded.source_type,
    source_reference = excluded.source_reference,
    merchant_raw = excluded.merchant_raw,
    merchant_normalized = excluded.merchant_normalized,
    description = excluded.description,
    amount = excluded.amount,
    currency = excluded.currency,
    transaction_date = excluded.transaction_date,
    posted_at = excluded.posted_at,
    status = excluded.status,
    needs_review = excluded.needs_review,
    review_reason = excluded.review_reason,
    confidence = excluded.confidence,
    classification_method = excluded.classification_method,
    category_id = excluded.category_id,
    metadata = excluded.metadata;

  return jsonb_build_object(
    'id', saved_statement_upload_id,
    'transactionCount', jsonb_array_length(coalesce(transaction_rows_payload, '[]'::jsonb))
  );
end;
$$;

revoke all on function public.ingest_statement_payload(jsonb, jsonb) from public;
revoke all on function public.ingest_statement_payload(jsonb, jsonb) from anon;
revoke all on function public.ingest_statement_payload(jsonb, jsonb) from authenticated;
grant execute on function public.ingest_statement_payload(jsonb, jsonb) to service_role;
