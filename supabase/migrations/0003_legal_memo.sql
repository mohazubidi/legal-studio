-- Legal Studio: Legal Memo Builder support
--   * documents: source kind + per-page/section text segments
--   * storage: audio formats for recordings
--   * source_references: segment id, client-generated ids
--   * outputs: human review workflow with explicit approval, enforced in the database

-- ---------------------------------------------------------------------------
-- Output status: add 'approved'
-- ---------------------------------------------------------------------------

alter type public.output_status add value if not exists 'approved';

-- ---------------------------------------------------------------------------
-- documents: what kind of source, and its text split into citable segments
-- segments: [{ "id": "p1", "label": "صفحة 1", "text": "..." }, ...]
-- ---------------------------------------------------------------------------

alter table public.documents
  add column if not exists source_kind text not null default 'document',
  add column if not exists segments jsonb;

do $$ begin
  alter table public.documents add constraint documents_source_kind_check
    check (source_kind in ('document', 'pasted_text', 'lawyer_notes', 'meeting_transcript', 'audio_recording'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.documents add constraint documents_segments_is_array
    check (segments is null or jsonb_typeof(segments) = 'array');
exception when duplicate_object then null; end $$;

grant insert (source_kind) on public.documents to authenticated;
grant update (segments) on public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: allow audio recordings (transcribed before use)
-- ---------------------------------------------------------------------------

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'text/plain',
  'text/markdown',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'audio/ogg'
]
where id = 'matter-documents';

-- ---------------------------------------------------------------------------
-- source_references: which segment the excerpt came from. Ids may be generated
-- by the server so that an output's content can point at its references.
-- ---------------------------------------------------------------------------

alter table public.source_references
  add column if not exists segment_id text check (segment_id is null or char_length(segment_id) <= 50);

grant insert (id, segment_id) on public.source_references to authenticated;

-- ---------------------------------------------------------------------------
-- outputs: human review
--   draft → in_review → reviewed → approved
--   any state → draft (reopen / request changes); in_review ↔ reviewed
-- Approval is stamped with who and when. Editing content or title after
-- review sends the output back to draft, so an approval never covers text
-- that was changed afterwards.
-- ---------------------------------------------------------------------------

alter table public.outputs
  add column if not exists review_notes text check (review_notes is null or char_length(review_notes) <= 10000),
  add column if not exists reviewed_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id) on delete set null;

grant update (review_notes) on public.outputs to authenticated;

create or replace function public.enforce_output_review()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_status text;
  new_status text := new.status::text;
begin
  if tg_op = 'INSERT' then
    if new_status <> 'draft' then
      raise exception 'outputs must be created as draft' using errcode = '23514';
    end if;
    new.reviewed_at := null;
    new.approved_at := null;
    new.approved_by := null;
    return new;
  end if;

  old_status := old.status::text;

  -- Content edited without an explicit status change: the review no longer applies.
  if (new.content is distinct from old.content or new.title is distinct from old.title)
     and new_status = old_status and old_status <> 'draft' then
    new.status := 'draft';
    new_status := 'draft';
  end if;

  if new_status <> old_status then
    if not (
      new_status = 'draft'
      or (old_status = 'draft' and new_status = 'in_review')
      or (old_status = 'in_review' and new_status = 'reviewed')
      or (old_status = 'reviewed' and new_status in ('in_review', 'approved'))
    ) then
      raise exception 'invalid review transition: % -> %', old_status, new_status using errcode = '23514';
    end if;

    if new_status = 'approved' and (select auth.uid()) is null then
      raise exception 'approval requires a signed-in user' using errcode = '42501';
    end if;
  end if;

  new.reviewed_at := case
    when new_status in ('reviewed', 'approved') then coalesce(case when old_status in ('reviewed', 'approved') then old.reviewed_at end, now())
    else null end;
  new.approved_at := case when new_status = 'approved' then coalesce(case when old_status = 'approved' then old.approved_at end, now()) else null end;
  new.approved_by := case when new_status = 'approved' then coalesce(case when old_status = 'approved' then old.approved_by end, (select auth.uid())) else null end;
  return new;
end;
$$;

drop trigger if exists outputs_enforce_review on public.outputs;
create trigger outputs_enforce_review before insert or update on public.outputs
  for each row execute function public.enforce_output_review();

-- ---------------------------------------------------------------------------
-- Fix (0002): write_audit_log referenced new.processing_status directly, which
-- fails on matters and outputs (PL/pgSQL does not short-circuit the check).
-- Status changes on those tables raised an error. Read every field via jsonb.
-- ---------------------------------------------------------------------------

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
  old_data jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  status_field text := case tg_table_name when 'documents' then 'processing_status' else 'status' end;
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
  if actor is null or not exists (select 1 from auth.users u where u.id = actor) then
    return null;
  end if;

  if tg_op = 'UPDATE' and (row_data ->> status_field) is distinct from (old_data ->> status_field) then
    verb := 'status_changed';
    info := info || jsonb_build_object('from', old_data ->> status_field, 'to', row_data ->> status_field);
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

revoke execute on function public.write_audit_log() from public, anon, authenticated;
