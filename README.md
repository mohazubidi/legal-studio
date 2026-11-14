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
3. Run `supabase/migrations/0001_profiles.sql` in the SQL editor, or with `supabase db push`. It creates the `profiles` table, its row-level security policies, and the signup trigger.
4. In **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback` as a redirect URL. This is only needed if email confirmation is enabled.

`NEXT_PUBLIC_*` values are inlined at build time, so set them **before** `npm run build` or a deployment build, and rebuild after you change them.

If the environment variables are missing, the app does **not** fake a session. The workspace shows a "setup required" screen, and the login and sign-up forms are disabled.

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
lib/supabase/        env guard, server client, middleware session refresh
supabase/migrations/ SQL
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

`npm run dev` · `npm run lint` · `npm run typecheck` · `npm run build`
