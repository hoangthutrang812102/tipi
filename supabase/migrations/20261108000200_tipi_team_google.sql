begin;

-- The legacy account ID is a storage anchor, not the new business owner.
alter table private.tipi_owner drop constraint tipi_owner_user_id_fkey;
alter table private.tipi_owner add constraint tipi_owner_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete restrict;

create table private.tipi_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role = 'owner')
);
create unique index tipi_one_business_owner on private.tipi_members(role);
alter table private.tipi_members enable row level security;
revoke all on private.tipi_members from public, anon, authenticated;

-- Keep the original namespace so old clients and existing image paths still work.
create function public.tipi_workspace() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('workspace_id', o.user_id, 'role',
    case when m.user_id is not null then 'owner' else 'support' end)
  from private.tipi_owner o
  left join private.tipi_members m on m.user_id = (select auth.uid())
  where o.user_id = (select auth.uid()) or m.user_id is not null;
$$;
revoke all on function public.tipi_workspace() from public, anon;
grant execute on function public.tipi_workspace() to authenticated;

create policy "Tipi team state" on public.tipi_state for all to authenticated
using (owner_id::text = (select public.tipi_workspace()->>'workspace_id'))
with check (owner_id::text = (select public.tipi_workspace()->>'workspace_id'));

create policy "Tipi team reads images" on storage.objects for select to authenticated
using (bucket_id = 'tipi-images' and (storage.foldername(name))[1] =
  (select public.tipi_workspace()->>'workspace_id'));
create policy "Tipi team uploads images" on storage.objects for insert to authenticated
with check (bucket_id = 'tipi-images' and (storage.foldername(name))[1] =
  (select public.tipi_workspace()->>'workspace_id'));

create table public.tipi_google (
  workspace_id uuid primary key references auth.users(id) on delete cascade,
  config jsonb not null default '{}',
  lease uuid,
  lease_until timestamptz
);
alter table public.tipi_google enable row level security;
revoke all on public.tipi_google from public, anon, authenticated;
grant select, insert, update on public.tipi_google to service_role;
grant select on public.tipi_state to service_role;

create function public.tipi_google_lock(p_workspace uuid, p_lease uuid) returns boolean
language sql set search_path = ''
as $$
  with locked as (
    insert into public.tipi_google(workspace_id, lease, lease_until)
    values (p_workspace, p_lease, now() + interval '5 minutes')
    on conflict (workspace_id) do update
    set lease = excluded.lease, lease_until = excluded.lease_until
    where public.tipi_google.lease_until is null or public.tipi_google.lease_until < now()
    returning 1
  ) select exists(select 1 from locked);
$$;
revoke all on function public.tipi_google_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tipi_google_lock(uuid, uuid) to service_role;

create function public.tipi_google_owner(p_user uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('workspace_id', o.user_id, 'email', u.email)
  from private.tipi_owner o cross join private.tipi_members m
  join auth.users u on u.id = m.user_id
  where u.id = p_user and u.email_confirmed_at is not null;
$$;
revoke all on function public.tipi_google_owner(uuid) from public, anon, authenticated;
grant execute on function public.tipi_google_owner(uuid) to service_role;

commit;
