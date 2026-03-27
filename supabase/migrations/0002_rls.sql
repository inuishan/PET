create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.household_members household_members
      where household_members.household_id = target_household_id
        and household_members.user_id = auth.uid()
    );
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.household_members household_members
      where household_members.household_id = target_household_id
        and household_members.user_id = auth.uid()
        and household_members.role = 'owner'
    );
$$;

create or replace function public.can_insert_household_member(target_household_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and (
      public.is_household_owner(target_household_id)
      or (
        target_user_id = auth.uid()
        and exists (
          select 1
          from public.households households
          where households.id = target_household_id
            and households.created_by = auth.uid()
        )
        and not exists (
          select 1
          from public.household_members household_members
          where household_members.household_id = target_household_id
        )
      )
    );
$$;

alter table public.households enable row level security;
alter table public.households force row level security;
alter table public.household_members enable row level security;
alter table public.household_members force row level security;
alter table public.statement_uploads enable row level security;
alter table public.statement_uploads force row level security;
alter table public.transactions enable row level security;
alter table public.transactions force row level security;
alter table public.categories enable row level security;
alter table public.categories force row level security;
alter table public.merchant_aliases enable row level security;
alter table public.merchant_aliases force row level security;
alter table public.classification_events enable row level security;
alter table public.classification_events force row level security;
alter table public.notifications enable row level security;
alter table public.notifications force row level security;

create policy households_select_for_members
on public.households
for select
using (public.is_household_member(id));

create policy households_insert_for_authenticated_users
on public.households
for insert
with check (auth.uid() is not null and created_by = auth.uid());

create policy households_update_for_owners
on public.households
for update
using (public.is_household_owner(id))
with check (public.is_household_owner(id));

create policy households_delete_for_owners
on public.households
for delete
using (public.is_household_owner(id));

create policy household_members_select_for_members
on public.household_members
for select
using (public.is_household_member(household_id));

create policy household_members_insert_via_owner_or_bootstrap
on public.household_members
for insert
with check (public.can_insert_household_member(household_id, user_id));

create policy household_members_update_for_owner_or_self
on public.household_members
for update
using (public.is_household_owner(household_id) or user_id = auth.uid())
with check (public.is_household_owner(household_id) or user_id = auth.uid());

create policy household_members_delete_for_owner_or_self
on public.household_members
for delete
using (public.is_household_owner(household_id) or user_id = auth.uid());

create policy statement_uploads_select_for_members
on public.statement_uploads
for select
using (public.is_household_member(household_id));

create policy statement_uploads_insert_for_members
on public.statement_uploads
for insert
with check (
  auth.uid() is not null
  and public.is_household_member(household_id)
  and (uploaded_by is null or uploaded_by = auth.uid())
);

create policy statement_uploads_update_for_members
on public.statement_uploads
for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy statement_uploads_delete_for_owners
on public.statement_uploads
for delete
using (public.is_household_owner(household_id));

create policy transactions_select_for_members
on public.transactions
for select
using (public.is_household_member(household_id));

create policy transactions_insert_for_members
on public.transactions
for insert
with check (auth.uid() is not null and public.is_household_member(household_id));

create policy transactions_update_for_members
on public.transactions
for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy transactions_delete_for_owners
on public.transactions
for delete
using (public.is_household_owner(household_id));

create policy categories_select_for_system_or_members
on public.categories
for select
using (is_system = true or public.is_household_member(household_id));

create policy categories_insert_for_members
on public.categories
for insert
with check (
  auth.uid() is not null
  and is_system = false
  and household_id is not null
  and public.is_household_member(household_id)
);

create policy categories_update_for_members
on public.categories
for update
using (is_system = false and public.is_household_member(household_id))
with check (is_system = false and public.is_household_member(household_id));

create policy categories_delete_for_members
on public.categories
for delete
using (is_system = false and public.is_household_member(household_id));

create policy merchant_aliases_select_for_members
on public.merchant_aliases
for select
using (public.is_household_member(household_id));

create policy merchant_aliases_insert_for_members
on public.merchant_aliases
for insert
with check (auth.uid() is not null and public.is_household_member(household_id));

create policy merchant_aliases_update_for_members
on public.merchant_aliases
for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy merchant_aliases_delete_for_members
on public.merchant_aliases
for delete
using (public.is_household_owner(household_id));

create policy classification_events_select_for_members
on public.classification_events
for select
using (public.is_household_member(household_id));

create policy classification_events_insert_for_members
on public.classification_events
for insert
with check (auth.uid() is not null and public.is_household_member(household_id));

create policy notifications_select_for_recipients
on public.notifications
for select
using (
  auth.uid() is not null
  and recipient_user_id = auth.uid()
  and public.is_household_member(household_id)
);

create policy notifications_update_for_recipients
on public.notifications
for update
using (
  auth.uid() is not null
  and recipient_user_id = auth.uid()
  and public.is_household_member(household_id)
)
with check (
  auth.uid() is not null
  and recipient_user_id = auth.uid()
  and public.is_household_member(household_id)
);
