create or replace function public.normalize_whatsapp_phone(raw_phone text)
returns text
language sql
immutable
as $$
  select regexp_replace(trim(coalesce(raw_phone, '')), '[^0-9+]', '', 'g');
$$;

alter table public.whatsapp_participants enable row level security;
alter table public.whatsapp_participants force row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_messages force row level security;

create policy whatsapp_participants_select_for_members
on public.whatsapp_participants
for select
using (public.is_household_member(household_id));

create policy whatsapp_participants_insert_for_owners
on public.whatsapp_participants
for insert
with check (
  auth.uid() is not null
  and public.is_household_owner(household_id)
);

create policy whatsapp_participants_update_for_owners
on public.whatsapp_participants
for update
using (
  auth.uid() is not null
  and public.is_household_owner(household_id)
)
with check (
  auth.uid() is not null
  and public.is_household_owner(household_id)
);

create policy whatsapp_messages_select_for_members
on public.whatsapp_messages
for select
using (public.is_household_member(household_id));

create policy whatsapp_messages_insert_for_service_role
on public.whatsapp_messages
for insert
with check (auth.role() = 'service_role');

create policy whatsapp_messages_update_for_service_role
on public.whatsapp_messages
for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

revoke all on table public.whatsapp_participants from public;
revoke all on table public.whatsapp_participants from anon;
revoke all on table public.whatsapp_participants from authenticated;
grant select on table public.whatsapp_participants to authenticated;
grant select, insert, update on table public.whatsapp_participants to service_role;

revoke all on table public.whatsapp_messages from public;
revoke all on table public.whatsapp_messages from anon;
revoke all on table public.whatsapp_messages from authenticated;
grant select on table public.whatsapp_messages to authenticated;
grant select, insert, update on table public.whatsapp_messages to service_role;

create or replace function public.approve_whatsapp_participant(
  target_household_id uuid,
  target_phone_e164 text,
  target_display_name text default null,
  target_member_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_phone text;
  saved_participant public.whatsapp_participants%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_owner(target_household_id) then
    raise exception 'Household owner access required';
  end if;

  normalized_phone := public.normalize_whatsapp_phone(target_phone_e164);

  if not normalized_phone ~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'WhatsApp participant phone must be valid E.164';
  end if;

  if target_member_id is not null
     and not exists (
       select 1
       from public.household_members household_members
       where household_members.household_id = target_household_id
         and household_members.id = target_member_id
     ) then
    raise exception 'Participant member must belong to this household';
  end if;

  insert into public.whatsapp_participants (
    household_id,
    member_id,
    phone_e164,
    display_name,
    approved_by,
    approved_at,
    revoked_by,
    revoked_at
  )
  values (
    target_household_id,
    target_member_id,
    normalized_phone,
    nullif(trim(target_display_name), ''),
    auth.uid(),
    now(),
    null,
    null
  )
  on conflict (household_id, phone_e164)
  do update set
    member_id = coalesce(excluded.member_id, public.whatsapp_participants.member_id),
    display_name = coalesce(excluded.display_name, public.whatsapp_participants.display_name),
    approved_by = auth.uid(),
    approved_at = now(),
    revoked_by = null,
    revoked_at = null
  returning *
  into saved_participant;

  return jsonb_build_object(
    'displayName', saved_participant.display_name,
    'householdId', saved_participant.household_id,
    'memberId', saved_participant.member_id,
    'participantId', saved_participant.id,
    'phoneE164', saved_participant.phone_e164,
    'status', case
      when saved_participant.revoked_at is null then 'approved'
      else 'revoked'
    end
  );
end;
$$;

create or replace function public.revoke_whatsapp_participant(
  target_household_id uuid,
  target_phone_e164 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_phone text;
  saved_participant public.whatsapp_participants%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_household_owner(target_household_id) then
    raise exception 'Household owner access required';
  end if;

  normalized_phone := public.normalize_whatsapp_phone(target_phone_e164);

  if not normalized_phone ~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'WhatsApp participant phone must be valid E.164';
  end if;

  update public.whatsapp_participants
  set revoked_by = auth.uid(),
      revoked_at = now()
  where household_id = target_household_id
    and phone_e164 = normalized_phone
    and revoked_at is null
  returning *
  into saved_participant;

  if not found then
    select *
    into saved_participant
    from public.whatsapp_participants
    where household_id = target_household_id
      and phone_e164 = normalized_phone;

    if not found then
      raise exception 'WhatsApp participant not found';
    end if;
  end if;

  return jsonb_build_object(
    'displayName', saved_participant.display_name,
    'householdId', saved_participant.household_id,
    'memberId', saved_participant.member_id,
    'participantId', saved_participant.id,
    'phoneE164', saved_participant.phone_e164,
    'status', case
      when saved_participant.revoked_at is null then 'approved'
      else 'revoked'
    end
  );
end;
$$;

revoke all on function public.approve_whatsapp_participant(uuid, text, text, uuid) from public;
revoke all on function public.approve_whatsapp_participant(uuid, text, text, uuid) from anon;
grant execute on function public.approve_whatsapp_participant(uuid, text, text, uuid) to authenticated;

revoke all on function public.revoke_whatsapp_participant(uuid, text) from public;
revoke all on function public.revoke_whatsapp_participant(uuid, text) from anon;
grant execute on function public.revoke_whatsapp_participant(uuid, text) to authenticated;
