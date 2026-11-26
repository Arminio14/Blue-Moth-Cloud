-- Blue Moth 2.2 – Backend einrichten (im Supabase SQL Editor ausführen, darf mehrfach ausgeführt werden)

-- 1) Tabelle für die Bibliothek
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'web',
  url text,
  file_path text,
  file_url text,                       -- veraltet, wird nicht mehr verwendet
  created_at timestamptz not null default now()
);
create index if not exists items_owner_idx on public.items(owner, created_at desc);
alter table public.items enable row level security;

drop policy if exists "Owners can read own items"   on public.items;
drop policy if exists "Owners can insert own items" on public.items;
drop policy if exists "Owners can delete own items" on public.items;
create policy "Owners can read own items"   on public.items for select to authenticated using (auth.uid() = owner);
create policy "Owners can insert own items" on public.items for insert to authenticated with check (auth.uid() = owner);
create policy "Owners can delete own items" on public.items for delete to authenticated using (auth.uid() = owner);

-- 2) PRIVATER Speicher für Dateien (jeder sieht nur seinen eigenen Ordner)
insert into storage.buckets (id, name, public) values ('blue-moth-files', 'blue-moth-files', false)
on conflict (id) do update set public = false;

drop policy if exists "Authenticated upload to own folder" on storage.objects;
drop policy if exists "Public read Blue Moth files"        on storage.objects;
drop policy if exists "Owner read own files"               on storage.objects;
drop policy if exists "Owner delete own files"             on storage.objects;
create policy "Authenticated upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'blue-moth-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Owner read own files" on storage.objects for select to authenticated
  using (bucket_id = 'blue-moth-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Owner delete own files" on storage.objects for delete to authenticated
  using (bucket_id = 'blue-moth-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Live-Synchronisierung zwischen Geräten (Realtime)
do $$ begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;
