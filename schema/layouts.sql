create table if not exists public.layouts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  template jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists layouts_updated_at_idx on public.layouts (updated_at desc);

create or replace function public.set_layouts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_layouts_updated_at on public.layouts;
create trigger set_layouts_updated_at
before update on public.layouts
for each row execute function public.set_layouts_updated_at();

alter table public.layouts enable row level security;

create policy "Layouts are managed by server" on public.layouts
for all
using (true)
with check (true);
