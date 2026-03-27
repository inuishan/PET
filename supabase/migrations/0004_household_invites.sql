create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  invite_code text not null unique check (char_length(trim(invite_code)) between 6 and 64),
  created_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (claimed_at is null and claimed_by is null)
    or (claimed_at is not null and claimed_by is not null)
  )
);

create index household_invites_household_id_idx
  on public.household_invites (household_id, created_at desc);

create index household_invites_active_code_idx
  on public.household_invites (invite_code)
  where claimed_at is null;

create trigger set_household_invites_updated_at
before update on public.household_invites
for each row
execute function public.set_updated_at();

alter table public.household_invites enable row level security;
alter table public.household_invites force row level security;

create policy household_invites_select_for_owners
on public.household_invites
for select
using (public.is_household_owner(household_id));

create or replace function public.ensure_household_invite(target_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  active_invite public.household_invites%rowtype;
  generated_invite_code text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.is_household_owner(target_household_id) then
    raise exception 'Only household owners can manage invites.';
  end if;

  select household_invites.*
  into active_invite
  from public.household_invites household_invites
  where household_invites.household_id = target_household_id
    and household_invites.claimed_at is null
    and household_invites.expires_at > now()
  order by household_invites.created_at desc
  limit 1;

  if not found then
    for invite_attempt in 1..5 loop
      begin
        generated_invite_code := upper(encode(gen_random_bytes(6), 'hex'));

        insert into public.household_invites (
          household_id,
          invite_code,
          created_by
        )
        values (
          target_household_id,
          generated_invite_code,
          auth.uid()
        )
        returning *
        into active_invite;

        exit;
      exception
        when unique_violation then
          if invite_attempt = 5 then
            raise;
          end if;
      end;
    end loop;
  end if;

  return jsonb_build_object(
    'householdId', active_invite.household_id,
    'inviteCode', active_invite.invite_code,
    'inviteExpiresAt', active_invite.expires_at
  );
end;
$$;

create or replace function public.create_household_with_owner(
  household_name text,
  owner_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_household_name text;
  normalized_display_name text;
  new_household public.households%rowtype;
  new_member public.household_members%rowtype;
  invite_payload jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if exists (
    select 1
    from public.household_members household_members
    where household_members.user_id = auth.uid()
  ) then
    raise exception 'This account is already linked to a household.';
  end if;

  normalized_household_name := trim(household_name);
  normalized_display_name := nullif(trim(owner_display_name), '');

  insert into public.households (
    name,
    created_by
  )
  values (
    normalized_household_name,
    auth.uid()
  )
  returning *
  into new_household;

  insert into public.household_members (
    household_id,
    user_id,
    role,
    display_name
  )
  values (
    new_household.id,
    auth.uid(),
    'owner',
    normalized_display_name
  )
  returning *
  into new_member;

  invite_payload := public.ensure_household_invite(new_household.id);

  return jsonb_build_object(
    'displayName', new_member.display_name,
    'householdId', new_household.id,
    'householdName', new_household.name,
    'inviteCode', invite_payload ->> 'inviteCode',
    'inviteExpiresAt', invite_payload ->> 'inviteExpiresAt',
    'role', new_member.role,
    'status', 'ready'
  );
end;
$$;

create or replace function public.join_household_with_invite(
  invite_code text,
  member_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  active_invite public.household_invites%rowtype;
  member_count integer;
  new_member public.household_members%rowtype;
  normalized_invite_code text;
  normalized_display_name text;
  target_household public.households%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  normalized_invite_code := upper(regexp_replace(trim(invite_code), '[^a-zA-Z0-9]', '', 'g'));
  normalized_display_name := nullif(trim(member_display_name), '');

  if coalesce(char_length(normalized_invite_code), 0) < 6 then
    raise exception 'A valid household invite code is required.';
  end if;

  if exists (
    select 1
    from public.household_members household_members
    where household_members.user_id = auth.uid()
  ) then
    raise exception 'This account is already linked to a household.';
  end if;

  select household_invites.*
  into active_invite
  from public.household_invites household_invites
  where household_invites.invite_code = normalized_invite_code
    and household_invites.claimed_at is null
    and household_invites.expires_at > now()
  order by household_invites.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'That household invite code is invalid or has expired.';
  end if;

  select households.*
  into target_household
  from public.households households
  where households.id = active_invite.household_id;

  select count(*)
  into member_count
  from public.household_members household_members
  where household_members.household_id = active_invite.household_id;

  if member_count >= 2 then
    raise exception 'This household already has the maximum number of members for Phase 1.';
  end if;

  insert into public.household_members (
    household_id,
    user_id,
    role,
    display_name
  )
  values (
    active_invite.household_id,
    auth.uid(),
    'member',
    normalized_display_name
  )
  returning *
  into new_member;

  update public.household_invites
  set
    claimed_at = now(),
    claimed_by = auth.uid()
  where public.household_invites.id = active_invite.id;

  return jsonb_build_object(
    'displayName', new_member.display_name,
    'householdId', target_household.id,
    'householdName', target_household.name,
    'inviteCode', null,
    'inviteExpiresAt', null,
    'role', new_member.role,
    'status', 'ready'
  );
end;
$$;
