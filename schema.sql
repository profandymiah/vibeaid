-- Vibe Aid: database setup for Supabase
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- It is safe to run once on a new project.

-- ---------------------------------------------------------------
-- People
-- ---------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 60),
  organisation  text not null default '' check (char_length(organisation) <= 100),
  location      text not null default '' check (char_length(location) <= 80),
  github        text not null default '' check (github = '' or github ~ '^[A-Za-z0-9-]{1,39}$'),
  website       text not null default '' check (website = '' or website ~* '^https?://'),
  over_16       boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.moderators (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_moderator()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.moderators where user_id = auth.uid()) $$;

-- ---------------------------------------------------------------
-- Projects. Every project starts as 'pending' and appears publicly
-- once a moderator approves it. Authors always see their own.
-- ---------------------------------------------------------------
create table public.projects (
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

create index projects_status_created on public.projects (status, created_at desc);

-- "This is useful": one per person per project.
create table public.useful (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create view public.useful_counts as
  select project_id, count(*)::int as n from public.useful group by project_id;

-- ---------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------
-- New projects are pending (unless a moderator posts them); nobody sets
-- someone else as author, or features/reviews their own work.
create or replace function public.guard_new_project()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  if not public.is_moderator() then
    new.status := 'pending'; new.featured := false; new.reviewed := false; new.mod_note := '';
  end if;
  return new;
end $$;
create trigger projects_guard before insert on public.projects for each row execute function public.guard_new_project();

-- Authors may edit their own project; any author edit sends it back to
-- 'pending' for a moderator to re-approve. Moderators can change anything.
create or replace function public.guard_project_update()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  if not public.is_moderator() then
    if old.created_by <> auth.uid() then raise exception 'You can only edit your own projects'; end if;
    new.status := 'pending'; new.featured := old.featured; new.reviewed := false; new.mod_note := old.mod_note; new.slug := old.slug;
  end if;
  return new;
end $$;
create trigger projects_update before update on public.projects for each row execute function public.guard_project_update();

create or replace function public.guard_useful()
returns trigger language plpgsql security definer set search_path = public
as $$
declare author uuid; st text;
begin
  new.user_id := auth.uid();
  select created_by, status into author, st from public.projects where id = new.project_id;
  if author is null then raise exception 'That project does not exist'; end if;
  if st <> 'approved' then raise exception 'Only published projects can be marked useful'; end if;
  if author = auth.uid() then raise exception 'You cannot mark your own project'; end if;
  return new;
end $$;
create trigger useful_guard before insert on public.useful for each row execute function public.guard_useful();

-- ---------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.moderators enable row level security;
alter table public.projects   enable row level security;
alter table public.useful     enable row level security;

create policy "profiles readable"   on public.profiles for select using (true);
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "moderators see self" on public.moderators for select to authenticated using (user_id = auth.uid());

create policy "projects read"   on public.projects for select using (status = 'approved' or created_by = auth.uid() or public.is_moderator());
create policy "projects insert" on public.projects for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.over_16));
create policy "projects update" on public.projects for update to authenticated using (created_by = auth.uid() or public.is_moderator());
create policy "projects delete" on public.projects for delete to authenticated using (created_by = auth.uid() or public.is_moderator());

create policy "useful own read"   on public.useful for select to authenticated using (user_id = auth.uid());
create policy "useful own add"    on public.useful for insert to authenticated with check (user_id = auth.uid());
create policy "useful own remove" on public.useful for delete to authenticated using (user_id = auth.uid());
grant select on public.useful_counts to anon, authenticated;

-- ---------------------------------------------------------------
-- Screenshots. Files go in a folder named after the uploader's id.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shots', 'shots', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "shots upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'shots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "shots delete own or moderator" on storage.objects for delete to authenticated
  using (bucket_id = 'shots' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator()));
