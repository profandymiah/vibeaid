-- Vibe Aid: database setup for Supabase.
-- Every name starts with va_ so it can share a Supabase project with other sites.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- It is safe to run once on a new project.

-- ---------------------------------------------------------------
-- People
-- ---------------------------------------------------------------
create table public.va_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 60),
  organisation  text not null default '' check (char_length(organisation) <= 100),
  location      text not null default '' check (char_length(location) <= 80),
  github        text not null default '' check (github = '' or github ~ '^[A-Za-z0-9-]{1,39}$'),
  website       text not null default '' check (website = '' or website ~* '^https?://'),
  over_16       boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.va_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.va_is_moderator()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.va_moderators where user_id = auth.uid()) $$;

-- ---------------------------------------------------------------
-- Projects. Every project starts as 'pending' and appears publicly
-- once a moderator approves it. Authors always see their own.
-- ---------------------------------------------------------------
create table public.va_projects (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title         text not null check (char_length(title) between 2 and 80),
  tagline       text not null check (char_length(tagline) between 10 and 160),
  cause         text not null check (cause in ('health','food','shelter','access','climate','education','refugees','mutual-aid','civic','safety','other')),
  helps         text not null default '' check (char_length(helps) <= 300),
  problem       text not null default '' check (char_length(problem) <= 2000),
  what_it_does  text not null default '' check (char_length(what_it_does) <= 2000),
  prompt        text not null default '' check (char_length(prompt) <= 4000),
  tools         text[] not null default '{}' check (cardinality(tools) <= 8),
  build_time    text not null default '' check (build_time in ('','hours','a-day','a-week','weeks','months')),
  lessons       text not null default '' check (char_length(lessons) <= 2000),
  live_url      text not null default '' check (live_url = '' or live_url ~* '^https?://'),
  repo_url      text not null default '' check (repo_url = '' or repo_url ~* '^https://(github\.com|gitlab\.com|codeberg\.org)/'),
  image_path    text check (image_path is null or char_length(image_path) <= 300),
  image_url     text not null default '' check (image_url = '' or image_url ~* '^https://'),
  image_alt     text not null default '' check (char_length(image_alt) <= 300),
  licence       text not null default '' check (char_length(licence) <= 60),
  location      text not null default '' check (char_length(location) <= 80),
  team          text not null default '' check (char_length(team) <= 200),
  checks        jsonb not null default '{}'::jsonb,
  status        text not null default 'pending' check (status in ('pending','approved','hidden')),
  featured      boolean not null default false,
  reviewed      boolean not null default false,
  mod_note      text not null default '' check (char_length(mod_note) <= 500),
  created_by    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index va_projects_status_created on public.va_projects (status, created_at desc);

-- "This is useful": one per person per project.
create table public.va_useful (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.va_projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create view public.va_useful_counts as
  select project_id, count(*)::int as n from public.va_useful group by project_id;

-- ---------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------
-- New projects are pending (unless a moderator posts them); nobody sets
-- someone else as author, or features/reviews their own work.
create or replace function public.va_guard_new_project()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  if not public.va_is_moderator() then
    new.status := 'pending'; new.featured := false; new.reviewed := false; new.mod_note := '';
  end if;
  return new;
end $$;
create trigger va_projects_guard before insert on public.va_projects for each row execute function public.va_guard_new_project();

-- Authors may edit their own project; any author edit sends it back to
-- 'pending' for a moderator to re-approve. Moderators can change anything.
create or replace function public.va_guard_project_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if not public.va_is_moderator() then
    if old.created_by <> auth.uid() then raise exception 'You can only edit your own projects'; end if;
    new.status := 'pending'; new.featured := old.featured; new.reviewed := false; new.mod_note := old.mod_note; new.slug := old.slug;
  end if;
  return new;
end $$;
create trigger va_projects_update before update on public.va_projects for each row execute function public.va_guard_project_update();

create or replace function public.va_guard_useful()
returns trigger language plpgsql security definer set search_path = public
as $$
declare author uuid; st text;
begin
  new.user_id := auth.uid();
  select created_by, status into author, st from public.va_projects where id = new.project_id;
  if author is null then raise exception 'That project does not exist'; end if;
  if st <> 'approved' then raise exception 'Only published projects can be marked useful'; end if;
  if author = auth.uid() then raise exception 'You cannot mark your own project'; end if;
  return new;
end $$;
create trigger va_useful_guard before insert on public.va_useful for each row execute function public.va_guard_useful();

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------
alter table public.va_profiles   enable row level security;
alter table public.va_moderators enable row level security;
alter table public.va_projects   enable row level security;
alter table public.va_useful     enable row level security;

create policy "va profiles readable"   on public.va_profiles for select using (true);
create policy "va profiles insert own" on public.va_profiles for insert to authenticated with check (id = auth.uid());
create policy "va profiles update own" on public.va_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "va moderators see self" on public.va_moderators for select to authenticated using (user_id = auth.uid());

create policy "va projects read"   on public.va_projects for select using (status = 'approved' or created_by = auth.uid() or public.va_is_moderator());
create policy "va projects insert" on public.va_projects for insert to authenticated
  with check (exists (select 1 from public.va_profiles p where p.id = auth.uid() and p.over_16));
create policy "va projects update" on public.va_projects for update to authenticated using (created_by = auth.uid() or public.va_is_moderator());
create policy "va projects delete" on public.va_projects for delete to authenticated using (created_by = auth.uid() or public.va_is_moderator());

create policy "va useful own read"   on public.va_useful for select to authenticated using (user_id = auth.uid());
create policy "va useful own add"    on public.va_useful for insert to authenticated with check (user_id = auth.uid());
create policy "va useful own remove" on public.va_useful for delete to authenticated using (user_id = auth.uid());
grant select on public.va_useful_counts to anon, authenticated;

-- ---------------------------------------------------------------
-- Screenshots. Files go in a folder named after the uploader's id.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('va-shots', 'va-shots', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "va shots upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'va-shots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "va shots delete own or moderator" on storage.objects for delete to authenticated
  using (bucket_id = 'va-shots' and ((storage.foldername(name))[1] = auth.uid()::text or public.va_is_moderator()));

-- Trigger functions are only for the database to call.
revoke execute on function public.va_guard_new_project() from public, anon, authenticated;
revoke execute on function public.va_guard_project_update() from public, anon, authenticated;
revoke execute on function public.va_guard_useful() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Real accounts only. If this project allows anonymous sign-ins
-- (SignStories does), these stop anonymous accounts posting here.
-- ---------------------------------------------------------------
create or replace function public.va_is_real_user()
returns boolean language sql stable
as $$ select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean, false) $$;

drop policy "va profiles insert own" on public.va_profiles;
create policy "va profiles insert own" on public.va_profiles for insert to authenticated with check (id = auth.uid() and public.va_is_real_user());
drop policy "va projects insert" on public.va_projects;
create policy "va projects insert" on public.va_projects for insert to authenticated
  with check (public.va_is_real_user() and exists (select 1 from public.va_profiles p where p.id = auth.uid() and p.over_16));
drop policy "va useful own add" on public.va_useful;
create policy "va useful own add" on public.va_useful for insert to authenticated with check (user_id = auth.uid() and public.va_is_real_user());
drop policy "va shots upload own folder" on storage.objects;
create policy "va shots upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'va-shots' and public.va_is_real_user() and (storage.foldername(name))[1] = auth.uid()::text);
