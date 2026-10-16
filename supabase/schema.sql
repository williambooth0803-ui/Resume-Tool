-- Run in your Supabase project's SQL editor. No service-role key is used by the app.
create table if not exists public.resume_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.resume_workspaces enable row level security;
alter table public.resume_workspaces force row level security;
revoke all on public.resume_workspaces from anon;
grant select, insert, update, delete on public.resume_workspaces to authenticated;
drop policy if exists "Own workspace only" on public.resume_workspaces;
create policy "Own workspace only" on public.resume_workspaces
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create or replace function public.resume_workspace_revision_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' and NEW.revision <> 1 then raise exception 'Initial revision must be 1'; end if;
  if TG_OP = 'UPDATE' and (NEW.revision <> OLD.revision + 1 or NEW.user_id <> OLD.user_id) then
    raise exception 'Invalid workspace revision';
  end if;
  NEW.updated_at = now();
  return NEW;
end;
$$;
drop trigger if exists workspace_revision_guard on public.resume_workspaces;
create trigger workspace_revision_guard before insert or update on public.resume_workspaces
  for each row execute function public.resume_workspace_revision_guard();
