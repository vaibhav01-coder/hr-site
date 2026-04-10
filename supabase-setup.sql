create extension if not exists "pgcrypto";

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    email text,
    phone text,
    role text not null default 'candidate' check (role in ('candidate', 'hr_admin')),
    dob date,
    gender text check (gender in ('male', 'female', 'other')),
    address text,
    qualification text,
    experience_years integer,
    current_title text,
    skills text[] not null default '{}',
    linkedin_url text,
    resume_path text,
    resume_url text,
    created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (
        id,
        full_name,
        email,
        phone,
        role
    )
    values (
        new.id,
        new.raw_user_meta_data ->> 'full_name',
        lower(new.email),
        new.raw_user_meta_data ->> 'phone',
        coalesce(new.raw_user_meta_data ->> 'role', 'candidate')
    )
    on conflict (id) do update
    set
        full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        role = excluded.role;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.jobs (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    company_name text not null default 'Raicam Industries',
    description text,
    department text,
    location text not null,
    job_type text not null default 'full_time' check (job_type in ('full_time', 'part_time', 'contract')),
    salary_range text,
    skills_required text[] not null default '{}',
    perks text,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.applications (
    id uuid primary key default gen_random_uuid(),
    candidate_id uuid not null references public.profiles(id) on delete cascade,
    job_id uuid not null references public.jobs(id) on delete cascade,
    dob date,
    gender text check (gender in ('male', 'female', 'other')),
    address text,
    qualification text,
    experience_years integer,
    current_title text,
    skills text[] not null default '{}',
    resume_url text,
    cover_letter text,
    linkedin_url text,
    status text not null default 'under_review' check (status in ('under_review', 'shortlisted', 'hired', 'rejected')),
    created_at timestamptz not null default now()
);

create unique index if not exists profiles_email_unique_idx on public.profiles(lower(email));
create unique index if not exists applications_candidate_job_unique_idx on public.applications(candidate_id, job_id);

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

drop policy if exists "jobs_public_read" on public.jobs;
create policy "jobs_public_read"
on public.jobs
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "applications_self_select" on public.applications;
create policy "applications_self_select"
on public.applications
for select
to authenticated
using (candidate_id = auth.uid());

drop policy if exists "applications_self_insert" on public.applications;
create policy "applications_self_insert"
on public.applications
for insert
to authenticated
with check (candidate_id = auth.uid());

insert into public.jobs (
    title,
    company_name,
    description,
    department,
    location,
    job_type,
    salary_range,
    skills_required,
    perks
)
select * from (
    values
    (
        'Production Operator',
        'Raicam Industries',
        'Operate production lines and maintain output targets.',
        'Production',
        'Sanand, Gujarat',
        'full_time',
        'Rs. 16,000 - Rs. 22,000',
        array['Machine Operation', 'Quality Check', 'Assembly'],
        'Bus, canteen, attendance incentives'
    ),
    (
        'Quality Inspector',
        'Raicam Industries',
        'Inspect materials and finished goods, maintain quality reports.',
        'Quality',
        'Ahmedabad, Gujarat',
        'full_time',
        'Rs. 18,000 - Rs. 24,000',
        array['Inspection', 'Documentation', 'Measurement Tools'],
        'Canteen, transport, uniform'
    ),
    (
        'Warehouse Assistant',
        'Prime Logistics',
        'Handle inventory, dispatch, and warehouse operations.',
        'Operations',
        'Sanand, Gujarat',
        'contract',
        'Rs. 14,000 - Rs. 18,000',
        array['Inventory', 'Packing', 'Dispatch'],
        'Night allowance, shift meal'
    ),
    (
        'HR Executive',
        'Talent Edge',
        'Support recruitment and onboarding operations.',
        'Human Resources',
        'Remote / Ahmedabad',
        'part_time',
        'Rs. 20,000 - Rs. 28,000',
        array['Recruitment', 'Screening', 'Communication'],
        'Hybrid work, flexible hours'
    )
) as sample_jobs (
    title,
    company_name,
    description,
    department,
    location,
    job_type,
    salary_range,
    skills_required,
    perks
)
where not exists (select 1 from public.jobs);

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "resume_upload_own_folder" on storage.objects;
create policy "resume_upload_own_folder"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "resume_read_own_folder" on storage.objects;
create policy "resume_read_own_folder"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = auth.uid()::text
);
