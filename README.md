# Legal Studio · ليجال ستوديو

An Arabic-first, right-to-left LegalTech workspace prototype. It shows how AI can help organise, analyse and draft legal information **without replacing professional legal judgment**.

> **Current stage:** application shell only. This covers authentication, the protected workspace, navigation, and the design system. No AI workflows are implemented. Tool pages show clearly labelled sample output.

## Stack

- Next.js 15 (App Router), React 19, strict TypeScript
- Tailwind CSS v4 with design tokens in `app/globals.css`
- shadcn/ui conventions: Radix primitives in `components/ui`
- Supabase Auth via `@supabase/ssr`, with cookie sessions refreshed in middleware

## Setup

```bash
npm install
cp .env.example .env.local   # add your Supabase URL and anon key
npm run dev
```

1. Create a Supabase project.
2. Copy the **Project URL** and the **anon public key** into `.env.local`.
3. Run the migrations **in order** (0001 → 0005), in the SQL editor or with `supabase db push`:
   - `0001_profiles.sql`: the `profiles` table, its RLS policies and the signup trigger.
   - `0002_core_schema.sql`: matters, documents, outputs, source references, the audit log, every RLS policy, and the private `matter-documents` storage bucket with its policies.
   - `0003_legal_memo.sql`: source kinds and text segments, audio formats, reference segments, the review workflow trigger, and a fix to the 0002 audit trigger.
   - `0004_review_marks.sql`: per-item review marks on outputs.
   - `0005_matter_intake.sql`: the `intake` matter status (a matter can never return to it), the `intake_form` / `client_statement` source kinds, and `finalize_intake()`, which creates the matter from a brief in one transaction under RLS.
4. In **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback` as a redirect URL. This is only needed if email confirmation is enabled.

`NEXT_PUBLIC_*` values are inlined at build time, so set them **before** `npm run build` or a deployment build, and rebuild after you change them.

If the environment variables are missing, the app does **not** fake a session. The workspace shows a "setup required" screen, and the login and sign-up forms are disabled.

## Backend

Supabase is the only backend: Postgres, Auth and Storage. There is no ORM. Data access goes through typed Supabase clients (`types/database.ts`), using the **signed-in user's session**. The service-role key is not used anywhere, so Row Level Security applies to every query.

### Data model

| table               | owned through               | notes |
|---------------------|-----------------------------|-------|
| `matters`           | `user_id = auth.uid()`      | `user_id` is stamped by the database. Clients cannot set or change it. |
| `documents`         | `matter_id` → owner         | `processing_status`: `pending → uploaded → processing → processed`, or `failed`. On failure, `processing_error` holds the reason. |
| `outputs`           | `matter_id` → owner         | `tool_type` is one of the six tools. `content` is JSON. |
| `source_references` | output + document           | Both must belong to the **same** matter, and the caller must own it. Immutable once written. |
| `audit_logs`        | `user_id = auth.uid()`      | Append-only. Written by database triggers on every insert, update and delete of matters, documents and outputs, and by the app for downloads. |

### Security boundaries

The database enforces these rules, not the UI:

- **RLS on every table.** Policies check the matter owner on every read and write. `anon` has no privileges.
- **Column grants.** `user_id`, `matter_id` (on update) and `storage_path` cannot be updated. Audit logs cannot be updated or deleted.
- **Scoped storage paths.** A check constraint requires `storage_path` to start with `{matter_id}/{document_id}/`, so a row can never point at another user's file.
- **Private storage.** The `matter-documents` bucket is private, limited to 20 MB, and restricted to the allowed MIME types. An object can be read, uploaded or deleted only if it is the `storage_path` of a document the caller owns. Downloads use 60-second signed URLs.
- **Server-side validation.** `zod` validates all input. Uploads are checked by extension, declared MIME type **and file signature** (magic bytes). The client-side check is only for convenience.

### Upload API

| method & path | purpose |
|---|---|
| `POST /api/matters/{matterId}/documents` | multipart: `file`, plus optional `document_category` and `document_date` (YYYY-MM-DD). Returns 201 with `{ document }`. |
| `GET /api/matters/{matterId}/documents` | lists the matter's documents |
| `GET /api/documents/{documentId}` | gets one document |
| `DELETE /api/documents/{documentId}` | removes the stored object, then the row |
| `GET /api/documents/{documentId}/download` | 302 redirect to a short-lived signed URL. The download is audited. |

Errors are returned as `{ error: { code, message } }`. Status codes: 400 invalid input, 401 signed out, 404 not found or not yours, 413 too large, 503 Supabase not configured.

Accepted formats: PDF, DOCX, DOC, RTF, ODT, TXT, MD, up to 20 MB. TXT and MD text is stored straight away (`processed`). Other formats stay `uploaded` until the processing pipeline is added.

For the client, use `<UploadArea matterId={id} />` or the `useDocumentUpload(matterId)` hook. Both upload one file at a time and show each file's progress, result or server error.

## Legal Memo Builder (`/tools/legal-memo`)

The first working tool. It turns a matter's sources into a structured memo draft **for professional review**. It never gives final legal advice.

| Stage | What happens | Where |
|---|---|---|
| 1. Source processing | PDF text per page, DOCX/TXT/MD/RTF per paragraph group, audio through the transcription provider. Each source keeps its identity, its `segments` (id + page/section label) and any processing error, and can be retried. | `lib/documents/extraction.ts`, `lib/ai/transcription.ts`, `processDocument` |
| 2–5. Analysis | One structured Claude call returns facts (parties, dates, amounts, events, relationships, claims, responses, referenced documents), missing/unclear/contradictory information, possible legal issues, research questions and an outline. | `lib/tools/legal-memo/{prompt,model-schema,service}.ts` |
| Verification | The output is validated with zod. **Every citation's quote is checked against the named segment's text.** A fact with no verified citation is stored as "requires human verification", never as source-derived. Failed sources become missing-information items. Empty sections say «لا تتوفر معلومات كافية في المستندات المرفوعة». | `lib/tools/legal-memo/{citations,record}.ts` |
| 6. Draft | An editable first draft, written only from the verified material, with `[م n]` markers that point to the reference list. | `generateMemoDraft`, `DraftEditor` |
| Review | draft → in review → reviewed → **approved**. The two sign-offs need an acknowledgement checkbox. The database trigger rejects skipped steps, stamps `approved_by` / `approved_at`, and returns any edited output to draft. | `0003_legal_memo.sql`, `ReviewControls` |

Citations are `source_references` rows (document, `segment_id`, page/section label, excerpt). Clicking `م n` shows the document, location and excerpt, and links to the original file.

### AI configuration (server-only)

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables generation. Without it the tool shows an "unavailable" state. |
| `LEGAL_STUDIO_AI_MODEL` | Optional, default `claude-opus-5-5` |
| `LEGAL_STUDIO_AI_EFFORT` | Optional, default `high` |
| `TRANSCRIPTION_API_URL`, `TRANSCRIPTION_API_KEY`, `TRANSCRIPTION_MODEL` | OpenAI-compatible `/audio/transcriptions` endpoint over HTTPS. Without them, audio sources are stored but marked "transcription unavailable" and are not used. |

Server-side refusal fallback (`fallbacks: "default"`) is enabled, so a safety decline is retried on the API's default fallback model.

## CaseMap (`/tools/casemap`)

Turns a matter's processed sources into an interactive case map. It never decides which party is legally right.

- **Six views:** parties; chronology (a table plus a proportional visual timeline); claims and each party's stated position; evidence map (evidence grouped by claim, each with its document, excerpt, and *what it appears to support*); contradictions (conflicting dates, amounts, facts or statements side by side); missing information.
- **Extraction and interpretation are kept apart.** Only `supports` (evidence) and `interpretation` (contradictions) are AI interpretation, and they render in a separate labelled box.
- **Sources:** every citation is verified like the memo's. An item with no verified citation is stored and shown as **unreferenced — requires review**. Citations are never fabricated. Clicking any item opens a side panel showing the document, page or section, and excerpt, with a link to the original.
- **Dates** are kept as written. Hijri dates are converted to Gregorian by the server (Umm al-Qura via `Intl`), not by the model, and marked as converted. Missing day or month parts are never guessed.
- **Filters:** party, claim, document, evidence type, date range. They are synced to the URL, so a filtered view or an open item (`?item=…`) can be shared.
- **Shared code:** matter and source handling, citation verification, source indexing and output persistence live in `lib/tools/shared`, `components/tools/shared` and `app/(workspace)/tools/source-actions.ts`, and are used by both tools.

## Contract Compass (`/tools/contract-compass`)

Turns one processed contract into a structured operational view. Its six views are:

- **Contract Snapshot:** parties and terms, each with a status: stated, not stated, unclear, or not verified.
- **Obligations Matrix:** obligation, responsible party, deadline, clause, source.
- **Deadlines:** dated items first, then relative periods such as "within 48 hours".
- **Financial Terms:** payments, plus the liability clause.
- **Clauses Requiring Review.**
- **Missing / Unclear information.**

**What it never infers.** Beyond citation checks, every clause number, amount, currency, date, deadline and notice period must literally appear in the cited text. Arabic-Indic digits and thousands separators are handled, and a clause number must match as a whole number, so `7.2` does not match `7.20`. Anything not found is removed and shown as "not verified" or «غير محدد في العقد». A governing law is shown only when the contract states it explicitly and the citation is verified.

**Wording.** Review items use only three labels: «يستحق المراجعة», «قد يترتب عليه أثر تعاقدي», «صياغة تحتاج تحققًا». A note that states a definitive conclusion ("غير قانوني", "باطل", "high risk", …) is replaced with neutral wording, and the replacement is recorded. Definitive conclusions need a configured legal knowledge source; none is integrated yet, so `getLegalKnowledgeSource()` returns `null`.

**Review.** Each item can be marked "verified" or "needs correction" with a note. Marks are stored in `outputs.review_marks` (migration `0004`), so marking does not reset the review state. The output follows the shared draft → in review → reviewed → approved workflow.

## RegDelta (`/tools/regdelta`)

Compares Document A (previous version) with Document B (new version) **structurally**. The comparison has two layers.

**Deterministic, on the server (`lib/tools/regdelta/provisions.ts`, `compare.ts`):**

- **Splitting.** Each version is split into provisions. Recognised headings: `المادة 5`, `المادة (5/2)`, Arabic ordinals up to the hundreds (`المادة الحادية عشرة`), `البند`, `Article`. Text before the first article becomes a preamble. A document without numbering falls back to its sections, with a warning.
- **Matching.** Provisions are paired by text similarity (Dice over word bigrams), with a bonus for the same article number:
  - A provision matched under a different number is classified as **renumbered**, with a written uncertainty note.
  - Same number but low similarity is flagged as a possible rewrite.
  - An unmatched provision with a plausible counterpart is shown as added or removed, with a note naming that counterpart. Renumbering is never silently turned into a deletion plus an addition.
- **Classification from the text.** The server detects added, removed, modified and renumbered provisions, plus changed deadlines (periods in digits or Arabic words, e.g. «خمسة عشر يومًا»), changed amounts or thresholds (currency or percent values, large numbers, years ignored), and changed definitions.
- **Display.** Previous and new texts are verbatim from the documents. A word-level diff highlights edits inside modified provisions. Each side keeps its article and page and has its own source reference.

**Model (interpretation only):** responsibility and procedural types, a summary and the apparent significance of each change, an assessment of uncertain matches, the **Potential Operational Impact** section (labelled as AI analysis requiring verification), and a preliminary compliance checklist built only from the two versions.

**Guards:**
- No external search.
- Sentences claiming a version is in force are removed. Caveats such as "cannot be verified" are kept.
- Definitive legal conclusions are replaced.

**Review and editing:** reviewers can edit the explanations, the AI-suggested types, exclusions, impacts and checklist. Extracted text, locations and detected types cannot be edited. Edits are validated on the server, return the comparison to draft, and the shared review workflow applies before approval.

## Matter Intake (`/tools/matter-intake`)

A guided intake that turns a new client's information into a structured **Matter Brief** before the matter exists.

- **Provisional matter.** Starting an intake creates a matter with status `intake` (migration `0005`). It holds the client's material and stays out of the other tools until the brief is used to create the matter. Only `createIntakeMatter` sets that status; the general create/update path rejects it, and a database trigger stops any matter from returning to it. Creating the matter from the brief runs as one transaction (`finalize_intake`), so the matter and the brief cannot end up out of step.
- **Inputs:**
  - **Form answers:** validated server-side with zod, stored verbatim as an `intake_form` source with one citable section per question. Unanswered questions are recorded explicitly.
  - **The client's free text:** stored as `client_statement`.
  - **Uploaded documents.**
  - **Voice recordings:** transcribed through the existing provider. Without one, the page states clearly that transcription is unavailable.
- **The brief:**
  - **Fields:** client, relationship, matter type and requested outcome. Each has an AI-organised value and a status: stated (with the client's verified words shown separately), inferred, unclear, not provided, or confirmed by the lawyer.
  - **Lists:** other parties, events, dates, amounts, and documents received or mentioned.
  - **Gaps:** missing information, missing documents, contradictions, clarification questions, and a follow-up questionnaire.
- **Rules applied on the server:**
  - "Stated" needs a verified quote, otherwise the field becomes inferred.
  - An empty value is always "not provided".
  - Dates and amounts must appear in the cited text.
  - Uploaded files are listed from the sources, not the model.
  - Sentences giving legal advice are removed.
- **Edit, then create.** The brief editor is validated on the server: an empty field must be "not provided", and a value cannot hide behind it. An edited value loses the client's quotes and becomes "confirmed". "إنشاء الملف" turns the provisional matter into an active one from the saved brief (client required; nothing filled in for missing fields). Discarding an intake deletes it with its files.

## Architecture

```
app/
  (auth)/            login, signup, server actions (signIn / signUp / signOut)
  (workspace)/       protected: layout verifies the user server-side
    page.tsx         Dashboard
    matters/ documents/[documentId]/ tools/[toolId]/ outputs/[outputId]/
    design-system/   live catalogue of every component and state
  auth/callback/     email-confirmation code exchange
components/
  ui/                primitives (button, input, dialog, popover, table, …)
  legal/             design system: AIResultPanel, ProvenanceItem/Legend,
                     SourceCitation, DocumentViewer, UploadArea, DataTable,
                     StatusBadge, ConfirmDialog, ToolCard, PageHeader, Empty/ErrorState
  layout/            AppShell, sidebar nav, mobile drawer, DisclaimerBar, UserMenu
  workspace/         page-specific compositions
config/              navigation, tools (single source for the 6 tools), provenance, constants
types/legal.ts       domain types
data/mock.ts         sample data. Replace these accessors with Supabase queries.
lib/supabase/        env guard, typed server client + requireUser(), middleware session refresh
lib/data/            data access (matters, documents, outputs, audit): typed results, never throws
lib/documents/       upload validation (extension, MIME, signature, size) and storage paths
lib/validation/      zod schemas for all server inputs
lib/api/             route-handler helpers (authorize, JSON errors)
app/api/             document upload / download / delete routes
hooks/               useDocumentUpload
types/database.ts    database types (Insert/Update mirror the column grants)
supabase/migrations/ SQL (schema, RLS, storage)
supabase/tests/      Supabase auth/storage stand-in used by the DB tests
tests/unit/          validation tests
tests/db/            RLS and ownership tests against a real Postgres
```

### Route protection

The workspace is protected at two levels:

1. `middleware.ts` refreshes the session and redirects anonymous users to `/login?next=…`.
2. `app/(workspace)/layout.tsx` checks the user again with `supabase.auth.getUser()`, which validates the session with Supabase. It never trusts the cookie alone.

### AI output provenance

Every AI result item has a `type`. Each type has its own colour, icon and text label, so colour is never the only cue:

| type       | Arabic label          | Meaning                                                      |
|------------|-----------------------|--------------------------------------------------------------|
| `source`   | مستند إلى المصدر      | Taken from an uploaded document. Must carry a `SourceCitation`. |
| `analysis` | تحليل الذكاء الاصطناعي | Inference produced by the model                              |
| `missing`  | معلومات ناقصة          | Required information that is not in the documents            |
| `verify`   | يتطلب تحققًا بشريًا    | Must be checked by a professional before approval            |

If a `source` item has no citation, it shows a warning. Approving an output requires an explicit checkbox acknowledgement in `ConfirmDialog`.

## Scripts

`npm run dev` · `npm run lint` · `npm run typecheck` · `npm run build` · `npm test` · `npm run test:db`

- `npm test` runs the unit tests. The DB tests are skipped unless `TEST_DATABASE_URL` is set.
- `npm run test:db` starts a throwaway local Postgres (15+), applies a minimal stand-in for Supabase's `auth` and `storage` schemas plus every migration, then checks the ownership boundaries as two different users. Nothing is persisted.
