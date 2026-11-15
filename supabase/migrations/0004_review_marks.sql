-- Legal Studio: per-item review marks
-- Reviewers mark individual extracted items (verified / needs correction, with
-- a note). Marks live outside `content`, so recording them does not reset the
-- review state the way editing generated content does.
-- Shape: { "<item id>": { "status": "verified" | "needs_change", "note": "...", "by": "<uuid>", "at": "<iso>" } }

alter table public.outputs
  add column if not exists review_marks jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.outputs add constraint outputs_review_marks_is_object
    check (jsonb_typeof(review_marks) = 'object' and pg_column_size(review_marks) <= 262144);
exception when duplicate_object then null; end $$;

grant update (review_marks) on public.outputs to authenticated;
