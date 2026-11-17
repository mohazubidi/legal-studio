-- Legal Studio: Legal Library (مكتبة الأنظمة)
--   * library_laws / library_articles: a shared, read-only library of laws and
--     regulations with their articles, the official source URL and when the text
--     was fetched. Every signed-in user can read it; nobody can write it through
--     the app. Rows are written only by the import script with the service role,
--     through library_upsert_law(), which replaces a law's articles atomically.
--   * content_hash is computed here, from the stored text, so it always
--     describes exactly what users read.
--   * documents.library_law_id / library_version record which law (and which
--     version of its text) a matter source was copied from, so a source whose
--     law changed afterwards can be flagged. The copy in the matter never changes.

-- ---------------------------------------------------------------------------
-- Arabic search normalization (mirrored by normalizeSearch in lib/library/format.ts)
-- ---------------------------------------------------------------------------

create or replace function public.library_normalize(t text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(lower(regexp_replace(
    translate(regexp_replace(coalesce(t, ''), U&'[\064B-\065F\0670\0640]', '', 'g'), U&'\0623\0625\0622\0671\0649\0629', U&'\0627\0627\0627\0627\064A\0647'),
    '\s+', ' ', 'g'
  )))
$$;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table if not exists public.library_laws (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'boe' check (source ~ '^[a-z][a-z0-9_]{0,39}$'),
  external_id text not null check (char_length(external_id) between 1 and 200),
  title text not null check (char_length(btrim(title)) between 1 and 500),
  category text check (category is null or char_length(category) <= 200),
  instrument text check (instrument is null or char_length(instrument) <= 1000),
  issued_on text check (issued_on is null or char_length(issued_on) <= 100),
  amended_on text check (amended_on is null or char_length(amended_on) <= 100),
  status text not null default 'unknown' check (status in ('in_force', 'repealed', 'unknown')),
  source_url text not null check (source_url ~ '^https://' and char_length(source_url) <= 2000),
  fetched_at timestamptz not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  article_count integer not null check (article_count >= 1),
  search_title text generated always as (public.library_normalize(title)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_laws_source_external_id_key unique (source, external_id)
);

create index if not exists library_laws_title_idx on public.library_laws (title);
create index if not exists library_laws_category_idx on public.library_laws (category);

drop trigger if exists library_laws_set_updated_at on public.library_laws;
create trigger library_laws_set_updated_at before update on public.library_laws
  for each row execute function public.set_updated_at();

create table if not exists public.library_articles (
  law_id uuid not null references public.library_laws (id) on delete cascade,
  position integer not null check (position >= 1),
  label text not null check (char_length(btrim(label)) between 1 and 200),
  text text not null check (char_length(btrim(text)) between 1 and 100000),
  search_text text generated always as (public.library_normalize(text)) stored,
  primary key (law_id, position)
);

-- ---------------------------------------------------------------------------
-- access: read for signed-in users, no writes through the API
-- ---------------------------------------------------------------------------

alter table public.library_laws enable row level security;
alter table public.library_articles enable row level security;

drop policy if exists library_laws_select_signed_in on public.library_laws;
create policy library_laws_select_signed_in on public.library_laws
  for select to authenticated using (true);

drop policy if exists library_articles_select_signed_in on public.library_articles;
create policy library_articles_select_signed_in on public.library_articles
  for select to authenticated using (true);

revoke all on public.library_laws, public.library_articles from anon, authenticated;
grant select on public.library_laws, public.library_articles to authenticated;

-- ---------------------------------------------------------------------------
-- import: one law with all its articles, replaced atomically
-- ---------------------------------------------------------------------------

create or replace function public.library_upsert_law(p_law jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text := coalesce(nullif(p_law->>'source', ''), 'boe');
  v_articles jsonb := p_law->'articles';
  v_id uuid;
  v_old_hash text;
  v_hash text;
begin
  if jsonb_typeof(v_articles) is distinct from 'array' or jsonb_array_length(v_articles) = 0 then
    raise exception 'library_upsert_law: the law has no articles' using errcode = '22023';
  end if;

  -- The hash covers exactly the text users read: the title, then each label and text in order.
  select encode(sha256(convert_to(
           btrim(p_law->>'title') || E'\n' ||
           string_agg(btrim(a->>'label') || E'\n' || btrim(a->>'text'), E'\n\n' order by o),
           'UTF8')), 'hex')
    into v_hash
    from jsonb_array_elements(v_articles) with ordinality as x(a, o);

  select id, content_hash into v_id, v_old_hash
    from public.library_laws
   where source = v_source and external_id = p_law->>'external_id'
     for update;

  insert into public.library_laws as l
    (source, external_id, title, category, instrument, issued_on, amended_on, status, source_url, fetched_at, content_hash, article_count)
  values (
    v_source,
    p_law->>'external_id',
    btrim(p_law->>'title'),
    nullif(btrim(p_law->>'category'), ''),
    nullif(btrim(p_law->>'instrument'), ''),
    nullif(btrim(p_law->>'issued_on'), ''),
    nullif(btrim(p_law->>'amended_on'), ''),
    coalesce(nullif(p_law->>'status', ''), 'unknown'),
    p_law->>'source_url',
    (p_law->>'fetched_at')::timestamptz,
    v_hash,
    jsonb_array_length(v_articles)
  )
  on conflict (source, external_id) do update set
    title = excluded.title,
    category = excluded.category,
    instrument = excluded.instrument,
    issued_on = excluded.issued_on,
    amended_on = excluded.amended_on,
    status = excluded.status,
    source_url = excluded.source_url,
    fetched_at = excluded.fetched_at,
    content_hash = excluded.content_hash,
    article_count = excluded.article_count
  returning l.id into v_id;

  if v_old_hash is not null and v_old_hash = v_hash then
    return jsonb_build_object('id', v_id, 'result', 'unchanged', 'content_hash', v_hash);
  end if;

  delete from public.library_articles where law_id = v_id;
  insert into public.library_articles (law_id, position, label, text)
  select v_id, o, btrim(a->>'label'), btrim(a->>'text')
    from jsonb_array_elements(v_articles) with ordinality as x(a, o);

  return jsonb_build_object(
    'id', v_id,
    'result', case when v_old_hash is null then 'created' else 'updated' end,
    'content_hash', v_hash
  );
end;
$$;

revoke execute on function public.library_upsert_law(jsonb) from public, anon, authenticated;
grant execute on function public.library_upsert_law(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- documents copied from the library
-- ---------------------------------------------------------------------------

alter table public.documents
  add column if not exists library_law_id uuid references public.library_laws (id) on delete set null,
  add column if not exists library_version text;

do $$ begin
  alter table public.documents add constraint documents_library_version_format
    check (library_version is null or library_version ~ '^[0-9a-f]{64}$');
exception when duplicate_object then null; end $$;

create index if not exists documents_library_law_id_idx on public.documents (library_law_id) where library_law_id is not null;

grant insert (library_law_id, library_version) on public.documents to authenticated;
