-- Add `location` to shifts so we can distinguish cafe / kitchen-car / event work.
-- Defaults to 'cafe' so existing 118 rows stay valid.
alter table public.shifts
  add column if not exists location text not null default 'cafe';

create index if not exists shifts_location_idx on public.shifts(location);
