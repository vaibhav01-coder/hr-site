alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists dob date;
alter table public.profiles add column if not exists gender text check (gender in ('male', 'female', 'other'));
alter table public.profiles add column if not exists address text;
alter table public.profiles add column if not exists qualification text;
alter table public.profiles add column if not exists experience_years integer;
alter table public.profiles add column if not exists current_title text;
alter table public.profiles add column if not exists skills text[] default '{}';
alter table public.profiles add column if not exists linkedin_url text;
alter table public.profiles add column if not exists resume_path text;
alter table public.profiles add column if not exists resume_url text;

alter table public.jobs add column if not exists company_name text default 'Raicam Industries';
alter table public.jobs add column if not exists is_active boolean not null default true;

update public.profiles p
set email = lower(u.email)
from auth.users u
where p.id = u.id
  and (p.email is null or p.email = '');

create unique index if not exists profiles_email_unique_idx on public.profiles(lower(email));
create unique index if not exists applications_candidate_job_unique_idx on public.applications(candidate_id, job_id);
