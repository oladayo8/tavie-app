-- A small stand-in for the parts of Supabase the migrations rely on, so the
-- database tests can run on a plain Postgres 16. Used only by tests/db.
-- It copies Supabase's permissive defaults on purpose, so the tests prove the
-- migration closes them.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'
);

-- Same logic as Supabase's auth.uid() and auth.jwt(): read the request's JWT claims.
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- Supabase's storage.foldername(): every path segment except the file name.
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
