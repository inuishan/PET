create or replace function public.reassign_transaction_category(
  target_transaction_id uuid,
  next_category_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  current_transaction public.transactions%rowtype;
  next_category public.categories%rowtype;
  updated_transaction public.transactions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into current_transaction
  from public.transactions
  where id = target_transaction_id;

  if not found then
    raise exception 'Transaction not found';
  end if;

  select *
  into next_category
  from public.categories
  where id = next_category_id;

  if not found then
    raise exception 'Category not found';
  end if;

  if next_category.is_system = false and next_category.household_id <> current_transaction.household_id then
    raise exception 'Category does not belong to this household';
  end if;

  update public.transactions
  set category_id = next_category.id,
      needs_review = false,
      review_reason = null,
      status = case
        when status in ('flagged', 'needs_review') then 'processed'::public.transaction_status
        else status
      end,
      classification_method = 'manual'::public.classification_method
  where id = current_transaction.id
  returning *
  into updated_transaction;

  insert into public.classification_events (
    household_id,
    transaction_id,
    classifier_user_id,
    method,
    previous_category_id,
    next_category_id,
    confidence,
    rationale,
    metadata
  )
  values (
    updated_transaction.household_id,
    updated_transaction.id,
    auth.uid(),
    'manual'::public.classification_method,
    current_transaction.category_id,
    updated_transaction.category_id,
    updated_transaction.confidence,
    case
      when current_transaction.category_id is distinct from updated_transaction.category_id
        then 'category_reassigned_from_mobile_review'
      else 'review_cleared_from_mobile_review'
    end,
    jsonb_build_object(
      'clearedReviewState', true,
      'learnedAlias', true,
      'source', 'mobile_transactions_tab'
    )
  );

  if current_transaction.merchant_raw is not null and current_transaction.merchant_normalized is not null then
    insert into public.merchant_aliases (
      household_id,
      raw_merchant_name,
      normalized_merchant_name,
      category_id,
      confidence,
      created_by,
      confirmation_count,
      last_confirmed_at,
      source_transaction_id,
      active
    )
    values (
      updated_transaction.household_id,
      current_transaction.merchant_raw,
      current_transaction.merchant_normalized,
      updated_transaction.category_id,
      1.000,
      auth.uid(),
      1,
      now(),
      updated_transaction.id,
      true
    )
    on conflict (household_id, raw_merchant_name)
    do update
    set normalized_merchant_name = excluded.normalized_merchant_name,
        category_id = excluded.category_id,
        confidence = greatest(coalesce(public.merchant_aliases.confidence, 0), excluded.confidence),
        confirmation_count = coalesce(public.merchant_aliases.confirmation_count, 0) + 1,
        last_confirmed_at = now(),
        source_transaction_id = excluded.source_transaction_id,
        active = true,
        updated_at = now();
  end if;

  return jsonb_build_object(
    'transactionId', updated_transaction.id
  );
end;
$$;

revoke all on function public.reassign_transaction_category(uuid, uuid) from public;
revoke all on function public.reassign_transaction_category(uuid, uuid) from anon;
grant execute on function public.reassign_transaction_category(uuid, uuid) to authenticated;
