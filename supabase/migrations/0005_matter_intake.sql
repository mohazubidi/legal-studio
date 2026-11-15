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
