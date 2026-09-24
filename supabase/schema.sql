-- SolarVision AI M1 schema for the connected Supabase Postgres project.
-- This migration is safe to re-run and uses RLS-scoped anon access for the app adapter.

create extension if not exists pgcrypto;

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null unique,
  source_filename text not null,
  model_name text not null,
  status text not null check (status in ('completed', 'failed')),
  processing_time_ms double precision not null,
  input_image_url text,
  annotated_image_url text,
  detections_count integer not null default 0,
  persistence_status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.detections (
  id uuid primary key default gen_random_uuid(),
  inspection_id text not null references public.inspections(inspection_id) on delete cascade,
  defect_type text not null,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  x1 double precision not null,
  y1 double precision not null,
  x2 double precision not null,
  y2 double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists detections_inspection_id_idx on public.detections(inspection_id);
create index if not exists detections_defect_type_idx on public.detections(defect_type);
create index if not exists inspections_created_at_idx on public.inspections(created_at desc);

alter table public.inspections enable row level security;
alter table public.detections enable row level security;

drop policy if exists solarvision_inspections_read on public.inspections;
drop policy if exists solarvision_inspections_insert on public.inspections;
drop policy if exists solarvision_detections_read on public.detections;
drop policy if exists solarvision_detections_insert on public.detections;

create policy solarvision_inspections_read on public.inspections for select to anon, authenticated using (true);
create policy solarvision_inspections_insert on public.inspections for insert to anon, authenticated with check (true);
create policy solarvision_detections_read on public.detections for select to anon, authenticated using (true);
create policy solarvision_detections_insert on public.detections for insert to anon, authenticated with check (true);

insert into storage.buckets (id, name, public)
values ('solarvision-images', 'solarvision-images', false)
on conflict (id) do update set public = false;

drop policy if exists solarvision_images_read on storage.objects;
drop policy if exists solarvision_images_insert on storage.objects;
create policy solarvision_images_read on storage.objects for select to anon, authenticated using (bucket_id = 'solarvision-images');
create policy solarvision_images_insert on storage.objects for insert to anon, authenticated with check (bucket_id = 'solarvision-images');
