create extension if not exists "pgcrypto";

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    phone text,
    role text not null default 'candidate' check (role in ('candidate', 'hr_admin')),
    created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, phone, role)
    values (
        new.id,
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'phone',
        coalesce(new.raw_user_meta_data ->> 'role', 'candidate')
    )
    on conflict (id) do update
    set
        full_name = excluded.full_name,
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
    description text,
    department text,
    location text,
    job_type text not null default 'full_time' check (job_type in ('full_time', 'part_time', 'contract')),
    salary_range text,
    skills_required text[] default '{}',
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
    skills text[] default '{}',
    resume_url text,
    cover_letter text,
    linkedin_url text,
    payment_id text,
    payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'refund_initiated', 'refunded')),
    refund_id text,
    status text not null default 'under_review' check (status in ('under_review', 'shortlisted', 'hired', 'rejected')),
    created_at timestamptz not null default now()
);

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

insert into public.jobs (title, description, department, location, job_type, salary_range, skills_required, perks)
values
('Production Operator', 'Operate production lines and maintain output targets.', 'Production', 'Sanand, Gujarat', 'full_time', 'Rs. 16,000 - Rs. 22,000', array['Machine Operation', 'Quality Check', 'Assembly'], 'Bus, canteen, attendance incentives'),
('Quality Inspector', 'Inspect materials and finished goods, maintain quality reports.', 'Quality', 'Ahmedabad, Gujarat', 'full_time', 'Rs. 18,000 - Rs. 24,000', array['Inspection', 'Documentation', 'Measurement Tools'], 'Canteen, transport, uniform'),
('Warehouse Assistant', 'Handle inventory, dispatch, and warehouse operations.', 'Operations', 'Sanand, Gujarat', 'contract', 'Rs. 14,000 - Rs. 18,000', array['Inventory', 'Packing', 'Dispatch'], 'Night allowance, shift meal'),
('HR Executive', 'Support recruitment and onboarding operations.', 'Human Resources', 'Remote / Ahmedabad', 'part_time', 'Rs. 20,000 - Rs. 28,000', array['Recruitment', 'Screening', 'Communication'], 'Hybrid work, flexible hours')
on conflict do nothing;
