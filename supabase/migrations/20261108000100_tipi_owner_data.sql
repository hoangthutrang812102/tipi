begin;

create schema if not exists private;
create table private.tipi_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null references auth.users(id) on delete cascade
);
revoke all on private.tipi_owner from public, anon, authenticated;
alter table private.tipi_owner enable row level security;

create function public.tipi_is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.tipi_owner where user_id = (select auth.uid())
  );
$$;
revoke all on function public.tipi_is_owner() from public, anon;
grant execute on function public.tipi_is_owner() to authenticated;

create table public.tipi_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  data jsonb not null check (
    jsonb_typeof(data) = 'object'
    and data ?& array['bookings','transactions','profile']
    and jsonb_typeof(data->'bookings') = 'array'
    and jsonb_typeof(data->'transactions') = 'array'
    and jsonb_typeof(data->'profile') = 'object'
  )
);
alter table public.tipi_state enable row level security;
revoke all on public.tipi_state from public, anon, authenticated;
grant select, insert, update on public.tipi_state to authenticated;
create policy "Tipi owner state" on public.tipi_state for all to authenticated
using (owner_id = (select auth.uid()) and (select public.tipi_is_owner()))
with check (owner_id = (select auth.uid()) and (select public.tipi_is_owner()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tipi-images','tipi-images',false,10485760,array['image/jpeg','image/png','image/webp']);

create policy "Tipi owner reads images" on storage.objects for select to authenticated
using (bucket_id = 'tipi-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.tipi_is_owner()));
create policy "Tipi owner uploads images" on storage.objects for insert to authenticated
with check (bucket_id = 'tipi-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.tipi_is_owner()));

commit;
