-- Run this in Supabase SQL Editor for existing projects.
-- It enables static frontend admin access via RLS and keeps candidate access scoped.

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_admin_select" on public.profiles;
create policy "profiles_admin_select"
on public.profiles
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'hr_admin'
    )
);

drop policy if exists "jobs_admin_select_all" on public.jobs;
create policy "jobs_admin_select_all"
on public.jobs
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'hr_admin'
    )
);

drop policy if exists "jobs_admin_insert" on public.jobs;
create policy "jobs_admin_insert"
on public.jobs
for insert
to authenticated
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'hr_admin'
    )
);

drop policy if exists "jobs_admin_update" on public.jobs;
create policy "jobs_admin_update"
on public.jobs
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'hr_admin'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'hr_admin'
    )
);

drop policy if exists "applications_admin_select" on public.applications;
create policy "applications_admin_select"
on public.applications
for select
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'hr_admin'
    )
);

drop policy if exists "applications_admin_update" on public.applications;
create policy "applications_admin_update"
on public.applications
for update
to authenticated
using (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'hr_admin'
    )
)
with check (
    exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'hr_admin'
    )
);

drop policy if exists "resume_read_admin" on storage.objects;
create policy "resume_read_admin"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'resumes'
    and exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role = 'hr_admin'
    )
);

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'applications'
    ) then
        execute 'alter publication supabase_realtime add table public.applications';
    end if;

    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'jobs'
    ) then
        execute 'alter publication supabase_realtime add table public.jobs';
    end if;
end $$;

-- Optional cleanup: remove known sample/demo jobs.
-- Uncomment only if those records are not genuine listings.
-- delete from public.jobs
-- where title in ('Production Operator', 'Quality Inspector', 'Warehouse Assistant', 'HR Executive');
