-- Legal Studio: core schema
-- matters → documents / outputs → source_references, plus an append-only audit log.
--
-- Authorization model
--   * A matter belongs to exactly one user (matters.user_id).
--   * Every other row is owned through its matter. RLS checks the matter owner
--     on every read and write, so the database is the security boundary.
--   * Ownership columns (user_id, matter_id, storage_path, …) are not updatable.
--   * `anon` has no access to any of these tables.
--   * Storage objects are reachable only through a documents row the user owns.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.matter_status as enum ('active', 'on_hold', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_processing_status as enum ('pending', 'uploaded', 'processing', 'processed', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.output_status as enum ('draft', 'in_review', 'reviewed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tool_type as enum (
    'legal_memo', 'casemap', 'contract_compass', 'regdelta', 'matter_intake', 'legal_content'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- matters
-- ---------------------------------------------------------------------------

create table if not exists public.matters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  matter_name text not null check (char_length(btrim(matter_name)) between 1 and 200),
  matter_type text check (matter_type is null or char_length(matter_type) <= 100),
  client_name text check (client_name is null or char_length(client_name) <= 200),
  description text check (description is null or char_length(description) <= 5000),
  status public.matter_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists matters_user_id_created_at_idx on public.matters (user_id, created_at desc);

drop trigger if exists matters_set_updated_at on public.matters;
create trigger matters_set_updated_at before update on public.matters
  for each row execute function public.set_updated_at();

-- True when the current user owns the matter. SECURITY INVOKER: it runs under
-- the caller's RLS, so it can never reveal a matter the caller cannot see.
create or replace function public.owns_matter(target_matter_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.matters m
    where m.id = target_matter_id and m.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters (id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 255),
  file_type text not null check (char_length(file_type) between 1 and 255),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 20971520),
  storage_path text not null unique,
  extracted_text text,
  document_date date,
  document_category text check (document_category is null or char_length(document_category) <= 100),
  processing_status public.document_processing_status not null default 'pending',
  processing_error text check (processing_error is null or char_length(processing_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The object path is derived from the row itself, so a row can never point at
  -- a file under another matter or another document.
  constraint documents_storage_path_scoped
    check (storage_path like matter_id::text || '/' || id::text || '/%'),
  constraint documents_error_only_when_failed
    check (processing_error is null or processing_status = 'failed')
);

create index if not exists documents_matter_id_created_at_idx on public.documents (matter_id, created_at desc);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- outputs
-- ---------------------------------------------------------------------------

create table if not exists public.outputs (
  id uuid primary key default gen_random_uuid(),
  matter_id uuid not null references public.matters (id) on delete cascade,
  tool_type public.tool_type not null,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  content jsonb not null default '{}'::jsonb,
  status public.output_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outputs_matter_id_created_at_idx on public.outputs (matter_id, created_at desc);

drop trigger if exists outputs_set_updated_at on public.outputs;
create trigger outputs_set_updated_at before update on public.outputs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- source_references
-- ---------------------------------------------------------------------------

create table if not exists public.source_references (
  id uuid primary key default gen_random_uuid(),
  output_id uuid not null references public.outputs (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  source_text text not null check (char_length(source_text) between 1 and 10000),
  page_or_section text check (page_or_section is null or char_length(page_or_section) <= 100),
  created_at timestamptz not null default now()
);

create index if not exists source_references_output_id_idx on public.source_references (output_id);
create index if not exists source_references_document_id_idx on public.source_references (document_id);

-- A reference is valid only when its output and document belong to the same
-- matter, and the caller owns that matter.
create or replace function public.can_reference(target_output_id uuid, target_document_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.outputs o
    join public.documents d on d.matter_id = o.matter_id
    join public.matters m on m.id = o.matter_id
    where o.id = target_output_id
      and d.id = target_document_id
      and m.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- audit_logs (append-only)
-- matter_id is deliberately not a foreign key: the trail must outlive the matter.
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  matter_id uuid,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_user_id_created_at_idx on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_matter_id_idx on public.audit_logs (matter_id);

-- Writes an audit row for every insert/update/delete on the core tables.
-- SECURITY DEFINER so it can append even though clients cannot update or delete
-- audit rows. The acting user is auth.uid(), falling back to the matter owner
-- for server-side (service role) operations.
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity text := case tg_table_name
    when 'matters' then 'matter'
    when 'documents' then 'document'
    when 'outputs' then 'output'
  end;
  row_data jsonb := to_jsonb(coalesce(new, old));
  target_matter uuid := case when tg_table_name = 'matters'
    then (row_data ->> 'id')::uuid else (row_data ->> 'matter_id')::uuid end;
  actor uuid := (select auth.uid());
  verb text := case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  info jsonb := jsonb_build_object('id', row_data ->> 'id');
begin
  if actor is null then
    if tg_table_name = 'matters' then
      actor := (row_data ->> 'user_id')::uuid;
    else
      select m.user_id into actor from public.matters m where m.id = target_matter;
    end if;
  end if;
  -- Owner already gone (cascade from deleting the auth user): nothing to attribute,
  -- and inserting would violate the audit_logs.user_id foreign key.
  if actor is null or not exists (select 1 from auth.users u where u.id = actor) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name = 'documents' and new.processing_status is distinct from old.processing_status then
      verb := 'status_changed';
      info := info || jsonb_build_object('from', old.processing_status, 'to', new.processing_status);
    elsif tg_table_name in ('matters', 'outputs')
      and (to_jsonb(new) ->> 'status') is distinct from (to_jsonb(old) ->> 'status') then
      verb := 'status_changed';
      info := info || jsonb_build_object('from', to_jsonb(old) ->> 'status', 'to', to_jsonb(new) ->> 'status');
    end if;
  end if;

  if tg_table_name = 'documents' then
    info := info || jsonb_build_object('file_name', row_data ->> 'file_name');
  elsif tg_table_name = 'outputs' then
    info := info || jsonb_build_object('tool_type', row_data ->> 'tool_type');
  end if;

  insert into public.audit_logs (user_id, matter_id, action, details)
  values (actor, target_matter, entity || '.' || verb, info);
  return null;
end;
$$;

drop trigger if exists matters_audit on public.matters;
create trigger matters_audit after insert or update or delete on public.matters
  for each row execute function public.write_audit_log();

drop trigger if exists documents_audit on public.documents;
create trigger documents_audit after insert or update or delete on public.documents
  for each row execute function public.write_audit_log();

drop trigger if exists outputs_audit on public.outputs;
create trigger outputs_audit after insert or update or delete on public.outputs
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.matters enable row level security;
alter table public.documents enable row level security;
alter table public.outputs enable row level security;
alter table public.source_references enable row level security;
alter table public.audit_logs enable row level security;

-- matters
drop policy if exists matters_select_own on public.matters;
create policy matters_select_own on public.matters
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists matters_insert_own on public.matters;
create policy matters_insert_own on public.matters
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists matters_update_own on public.matters;
create policy matters_update_own on public.matters
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists matters_delete_own on public.matters;
create policy matters_delete_own on public.matters
  for delete to authenticated using (user_id = (select auth.uid()));

-- documents
drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents
  for select to authenticated using (public.owns_matter(matter_id));
drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own on public.documents
  for insert to authenticated with check (public.owns_matter(matter_id));
drop policy if exists documents_update_own on public.documents;
create policy documents_update_own on public.documents
  for update to authenticated
  using (public.owns_matter(matter_id)) with check (public.owns_matter(matter_id));
drop policy if exists documents_delete_own on public.documents;
create policy documents_delete_own on public.documents
  for delete to authenticated using (public.owns_matter(matter_id));

-- outputs
drop policy if exists outputs_select_own on public.outputs;
create policy outputs_select_own on public.outputs
  for select to authenticated using (public.owns_matter(matter_id));
drop policy if exists outputs_insert_own on public.outputs;
create policy outputs_insert_own on public.outputs
  for insert to authenticated with check (public.owns_matter(matter_id));
drop policy if exists outputs_update_own on public.outputs;
create policy outputs_update_own on public.outputs
  for update to authenticated
  using (public.owns_matter(matter_id)) with check (public.owns_matter(matter_id));
drop policy if exists outputs_delete_own on public.outputs;
create policy outputs_delete_own on public.outputs
  for delete to authenticated using (public.owns_matter(matter_id));

-- source_references (immutable once written: no update policy)
drop policy if exists source_references_select_own on public.source_references;
create policy source_references_select_own on public.source_references
  for select to authenticated using (public.can_reference(output_id, document_id));
drop policy if exists source_references_insert_own on public.source_references;
create policy source_references_insert_own on public.source_references
  for insert to authenticated with check (public.can_reference(output_id, document_id));
drop policy if exists source_references_delete_own on public.source_references;
create policy source_references_delete_own on public.source_references
  for delete to authenticated using (public.can_reference(output_id, document_id));

-- audit_logs: read own; insert own (for app events such as downloads); never update or delete
drop policy if exists audit_logs_select_own on public.audit_logs;
create policy audit_logs_select_own on public.audit_logs
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists audit_logs_insert_own on public.audit_logs;
create policy audit_logs_insert_own on public.audit_logs
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (matter_id is null or public.owns_matter(matter_id)));

-- ---------------------------------------------------------------------------
-- Table privileges (defence in depth on top of RLS)
-- Supabase grants ALL on public tables to anon/authenticated by default; narrow it.
-- ---------------------------------------------------------------------------

revoke all on public.matters, public.documents, public.outputs, public.source_references, public.audit_logs
  from anon, authenticated;

grant select, delete on public.matters to authenticated;
grant insert (matter_name, matter_type, client_name, description, status) on public.matters to authenticated;
grant update (matter_name, matter_type, client_name, description, status) on public.matters to authenticated;

grant select, delete on public.documents to authenticated;
grant insert (id, matter_id, file_name, file_type, file_size_bytes, storage_path, document_date, document_category)
  on public.documents to authenticated;
grant update (file_name, extracted_text, document_date, document_category, processing_status, processing_error)
  on public.documents to authenticated;

grant select, delete on public.outputs to authenticated;
grant insert (matter_id, tool_type, title, content, status) on public.outputs to authenticated;
grant update (title, content, status) on public.outputs to authenticated;

grant select, delete on public.source_references to authenticated;
grant insert (output_id, document_id, source_text, page_or_section) on public.source_references to authenticated;

grant select on public.audit_logs to authenticated;
grant insert (matter_id, action, details) on public.audit_logs to authenticated;

revoke execute on function public.write_audit_log() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for matter documents
-- Object path: {matter_id}/{document_id}/{file_name}  (== documents.storage_path)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'matter-documents',
  'matter-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- An object is accessible only when it is the storage_path of a document the
-- caller can see (documents RLS applies inside this invoker function).
create or replace function public.can_access_document_object(object_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.documents d where d.storage_path = object_name);
$$;

drop policy if exists matter_documents_select on storage.objects;
create policy matter_documents_select on storage.objects
  for select to authenticated
  using (bucket_id = 'matter-documents' and public.can_access_document_object(name));

drop policy if exists matter_documents_insert on storage.objects;
create policy matter_documents_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'matter-documents' and public.can_access_document_object(name));

drop policy if exists matter_documents_delete on storage.objects;
create policy matter_documents_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'matter-documents' and public.can_access_document_object(name));
-- No update policy: objects are immutable; replace by deleting and re-uploading.
