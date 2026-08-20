-- IFT LoadTrack database schema
-- Run this entire file once in the Supabase SQL editor (Project -> SQL Editor -> New query)

create extension if not exists "pgcrypto";

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  truck_id text,
  role text not null default 'driver' check (role in ('driver','dispatcher')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Dispatchers can view all profiles"
  on public.profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dispatcher'));

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, truck_id)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'truck_id');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============ LOADS ============
create table public.loads (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.profiles(id),
  pickup_name text not null,
  pickup_address text not null,
  pickup_window text,
  dropoff_name text not null,
  dropoff_address text not null,
  deadline timestamptz,
  weight_lbs integer,
  commodity text,
  hazmat boolean not null default false,
  temp_controlled boolean not null default false,
  status text not null default 'dispatched'
    check (status in ('dispatched','at_pickup','loaded_en_route','at_dropoff','delivered','closed')),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.loads enable row level security;

create policy "Drivers view own loads"
  on public.loads for select
  using (driver_id = auth.uid());

create policy "Dispatchers view all loads"
  on public.loads for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dispatcher'));

create policy "Dispatchers create loads"
  on public.loads for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dispatcher'));

create policy "Drivers update own loads"
  on public.loads for update
  using (driver_id = auth.uid());

create policy "Dispatchers update any load"
  on public.loads for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dispatcher'));

-- ============ LOAD EVENTS (stage history / timestamps) ============
create table public.load_events (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  notes text
);

alter table public.load_events enable row level security;

create policy "View events for accessible loads"
  on public.load_events for select
  using (
    exists (select 1 from public.loads l where l.id = load_id and l.driver_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dispatcher')
  );

create policy "Insert events for own loads"
  on public.load_events for insert
  with check (
    exists (select 1 from public.loads l where l.id = load_id and l.driver_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dispatcher')
  );

-- ============ DOCUMENTS (BOL photos, signatures) ============
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.loads(id) on delete cascade,
  doc_type text not null check (doc_type in ('bol','signature')),
  file_path text not null,
  uploaded_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "View documents for accessible loads"
  on public.documents for select
  using (
    exists (select 1 from public.loads l where l.id = load_id and l.driver_id = auth.uid())
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dispatcher')
  );

create policy "Insert documents for own loads"
  on public.documents for insert
  with check (
    exists (select 1 from public.loads l where l.id = load_id and l.driver_id = auth.uid())
  );

-- ============ HOURS OF SERVICE ============
create table public.hos_status (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  drive_minutes_remaining integer not null default 660,
  shift_minutes_remaining integer not null default 840,
  break_due_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.hos_status enable row level security;

create policy "Drivers view own HOS"
  on public.hos_status for select
  using (driver_id = auth.uid());

create policy "Drivers insert own HOS"
  on public.hos_status for insert
  with check (driver_id = auth.uid());

create policy "Drivers update own HOS"
  on public.hos_status for update
  using (driver_id = auth.uid());

create policy "Dispatchers view all HOS"
  on public.hos_status for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'dispatcher'));

-- ============ STORAGE (BOL photos + signature images) ============
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "Authenticated users can upload documents"
on storage.objects for insert
to authenticated
with check (bucket_id = 'documents');

create policy "Authenticated users can view documents"
on storage.objects for select
to authenticated
using (bucket_id = 'documents');

-- ============ MAKE YOURSELF A DISPATCHER ============
-- After you sign up in the app once, come back here, replace the email below,
-- and run this line to give that account dispatcher (admin) access:
--
-- update public.profiles set role = 'dispatcher'
-- where id = (select id from auth.users where email = 'you@example.com');
