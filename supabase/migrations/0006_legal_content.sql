-- Legal Studio: Legal Content System
--   * three source kinds identify the material content is produced from:
--     supplied legal text, an article, and a regulation update. Lawyer notes and
--     uploaded documents already exist.
--   * content outputs use tool_type 'legal_content' (already in the enum) and the
--     existing outputs / source_references tables, RLS and review workflow:
--     editing the content of a reviewed or approved output returns it to draft.

alter table public.documents drop constraint if exists documents_source_kind_check;
alter table public.documents add constraint documents_source_kind_check
  check (source_kind in (
    'document', 'pasted_text', 'lawyer_notes', 'meeting_transcript', 'audio_recording',
    'intake_form', 'client_statement',
    'legal_text', 'article', 'regulation_update'
  ));
