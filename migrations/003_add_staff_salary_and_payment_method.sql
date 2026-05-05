-- Add columns to support employees on fixed salary (excluded from hourly payroll
-- calculation on/after a given date) and cash-paid staff (still calculated but
-- shown separately).
alter table public.staff
  add column if not exists salary_start_date date,
  add column if not exists payment_method text not null default 'transfer';

comment on column public.staff.salary_start_date is
  'On/after this date, the staff is paid by fixed salary. Their hourly clock-in records on/after this date are excluded from the hourly payroll total.';
comment on column public.staff.payment_method is
  'How the staff is paid: transfer (default, bank transfer) or cash.';
