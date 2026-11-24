-- 有料イベント予約（ペルシャディナー等）。service role（API route）からのみ読み書きする。
create table if not exists public.event_bookings (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null,
  name text not null,
  email text,
  qty integer not null check (qty between 1 and 20),
  unit_price_jpy integer not null check (unit_price_jpy > 0),
  amount_jpy integer not null check (amount_jpy > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
  stripe_session_id text unique,
  stripe_payment_intent text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists event_bookings_slug_status_idx on public.event_bookings (event_slug, status);

alter table public.event_bookings enable row level security;
-- ポリシーなし = anon / authenticated は一切アクセス不可（service role のみ）

-- 定員チェックと仮押さえを同時に行う（同時予約で定員を超えないようロック）。
-- 席を取れたら booking id、満席なら null を返す。
create or replace function public.reserve_event_seats(
  p_slug text, p_capacity integer, p_name text, p_email text,
  p_qty integer, p_unit_price integer, p_expires_at timestamptz
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  taken integer;
  new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('event_bookings:' || p_slug));
  select coalesce(sum(qty), 0) into taken
    from event_bookings
   where event_slug = p_slug
     and (status = 'paid' or (status = 'pending' and expires_at > now()));
  if taken + p_qty > p_capacity then
    return null;
  end if;
  insert into event_bookings (event_slug, name, email, qty, unit_price_jpy, amount_jpy, expires_at)
  values (p_slug, p_name, nullif(p_email, ''), p_qty, p_unit_price, p_unit_price * p_qty, p_expires_at)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.reserve_event_seats(text, integer, text, text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_event_seats(text, integer, text, text, integer, integer, timestamptz) to service_role;
