-- Legal Studio: Matter Intake
--   * matters can be provisional ('intake') while a brief is prepared; they
--     become 'active' when the reviewed brief is used to create the matter.
--   * two source kinds keep the client's own wording identifiable.

alter type public.matter_status add value if not exists 'intake';

alter table public.documents drop constraint if exists documents_source_kind_check;
alter table public.documents add constraint documents_source_kind_check
  check (source_kind in (
    'document', 'pasted_text', 'lawyer_notes', 'meeting_transcript', 'audio_recording',
    'intake_form', 'client_statement'
  ));

-- ---------------------------------------------------------------------------
-- A matter can start as 'intake' but never return to it: otherwise a regular
-- matter could be hidden from the other tools by an ordinary update.
-- ---------------------------------------------------------------------------

create or replace function public.guard_intake_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status::text = 'intake' and old.status::text <> 'intake' then
    raise exception 'a matter cannot return to intake' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists matters_guard_intake on public.matters;
create trigger matters_guard_intake before update of status on public.matters
  for each row execute function public.guard_intake_status();

-- ---------------------------------------------------------------------------
-- Finalising an intake: the brief is marked as used and the provisional matter
-- becomes active in ONE transaction, so neither can happen without the other.
-- SECURITY INVOKER: runs under the caller's RLS; only their own intake matches.
-- ---------------------------------------------------------------------------

create or replace function public.finalize_intake(
  p_output_id uuid,
  p_matter_name text,
  p_client_name text,
  p_matter_type text,
  p_description text,
  p_content jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_matter uuid;
begin
  select m.id into v_matter
  from public.outputs o
  join public.matters m on m.id = o.matter_id
  where o.id = p_output_id and o.tool_type = 'matter_intake' and m.status::text = 'intake'
  for update of m;

  if v_matter is null then
    raise exception 'intake brief not found or already finalised' using errcode = 'P0002';
  end if;

  update public.outputs set content = p_content where id = p_output_id;
  update public.matters
    set matter_name = p_matter_name,
        client_name = p_client_name,
        matter_type = p_matter_type,
        description = p_description,
        status = 'active'
    where id = v_matter;
  return v_matter;
end;
$$;

revoke execute on function public.finalize_intake(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.finalize_intake(uuid, text, text, text, text, jsonb) to authenticated;
