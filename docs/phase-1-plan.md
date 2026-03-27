# Implementation Plan: Phase 1 Credit Card Ingestion MVP

## Overview
Phase 1 will deliver the first usable household expense-tracking slice: separate logins, one shared household, Google Drive statement ingestion, password-protected PDF handling, LLM-first parsing, review highlighting, and core dashboard/transaction views. This phase intentionally prioritizes credit card ingestion over WhatsApp capture because manual entry has been removed from the initial user experience.

The architecture is chosen for the full roadmap, not just this slice. The app will use a cross-platform mobile stack because iOS follows soon after Android, while statement ingestion will run through a self-hosted local n8n workflow coordinated with Supabase and Vercel AI Gateway.

## Technology Choices
- `Expo + React Native + TypeScript`
- `Expo Router`
- `Supabase Auth + Postgres + RLS + Edge Functions`
- `Google Sign-In`
- `Self-hosted n8n` on the local machine
- `Google Drive API` with push notifications if feasible, polling fallback otherwise
- `Vercel AI Gateway` for LLM-powered extraction/classification
- `FCM` for Android push notifications
- `Resend` or equivalent for email notifications if needed later

## Why This Stack
- `Expo` is the right mobile choice because iOS is planned immediately after Android.
- `Supabase` provides the best free managed core for auth, relational data, and household-scoped security.
- `n8n` becomes viable only because it will be self-hosted locally; this avoids a paid managed dependency.
- `Vercel AI Gateway` matches the chosen LLM strategy and keeps provider routing centralized.
- `Drive` remains the source of truth for raw PDFs, which reduces duplication of sensitive files.

## Scope

### In Scope
- Separate Google sign-ins for the two household members
- One shared household workspace
- One shared Google Drive folder for statements
- Password-protected PDF handling through n8n secrets/configuration
- Multi-format credit card statement ingestion
- LLM-first parsing with deterministic normalization/validation
- Parsed transaction persistence in Supabase
- `needs_review` highlighting for low-confidence rows
- Dashboard summary
- Transaction list and detail screens
- Settings for parser profiles, categories, and sync health
- Basic push/email alert hooks for parse failure and ingestion state

### Deferred
- WhatsApp / UPI ingestion
- Manual expense entry
- Budgeting
- AI savings insights and deep analysis reports
- Raw PDF storage in the app backend
- Full recurring-subscription intelligence

## Category Taxonomy
- `Food & Dining`
- `Groceries`
- `Transport`
- `Shopping`
- `Bills & Utilities`
- `Home`
- `Health`
- `Entertainment`
- `Travel`
- `Subscriptions`
- `Uncategorized`

## Architecture Changes
- New app workspace: `apps/mobile/` for Expo mobile client
- New backend integration layer: `apps/mobile/src/lib/supabase.ts`
- New domain modules: `apps/mobile/src/features/*` and `packages/domain/*`
- New database schema: `supabase/migrations/`
- New workflow endpoint: `supabase/functions/statement-ingest/`
- New n8n workflow definitions/docs: `infra/n8n/`
- New test suites: `tests/unit/`, `tests/integration/`, `tests/e2e/`

## Implementation Steps

### Phase 1A: Project Scaffold
1. **Create mobile app shell** (Files: `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(auth)/sign-in.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`)
   - Action: scaffold Expo app, routing, auth shell, and tab navigation.
   - Why: establishes the cross-platform client foundation.
   - Dependencies: None
   - Risk: Low

2. **Create shared app infrastructure** (Files: `apps/mobile/src/lib/supabase.ts`, `apps/mobile/src/lib/query-client.ts`, `apps/mobile/src/lib/env.ts`)
   - Action: configure Supabase client, environment access, and query state.
   - Why: centralizes backend connectivity and runtime configuration.
   - Dependencies: Step 1
   - Risk: Low

### Phase 1B: Data Model and Security
3. **Create initial schema** (Files: `supabase/migrations/0001_init.sql`)
   - Action: add `households`, `household_members`, `statement_uploads`, `transactions`, `categories`, `merchant_aliases`, `classification_events`, `notifications`.
   - Why: captures the minimum relational model for statement-led ingestion.
   - Dependencies: None
   - Risk: Medium

4. **Add RLS and auth-linked access control** (Files: `supabase/migrations/0002_rls.sql`)
   - Action: enforce household-scoped access for both users with separate logins.
   - Why: this is the main security boundary of the app.
   - Dependencies: Step 3
   - Risk: High

5. **Add summary views and helper functions** (Files: `supabase/migrations/0003_views.sql`)
   - Action: create SQL views for month-to-date totals, category breakdowns, and statement sync status.
   - Why: keeps dashboard queries simple and fast.
   - Dependencies: Steps 3-4
   - Risk: Medium

### Phase 1C: Auth and Household Onboarding
6. **Implement Google sign-in** (Files: `apps/mobile/src/features/auth/*`, `apps/mobile/app/(auth)/sign-in.tsx`)
   - Action: set up Supabase Google auth and session restoration.
   - Why: matches the chosen auth method and future Drive-related workflow expectations.
   - Dependencies: Steps 1-5
   - Risk: Medium

7. **Implement household join/setup flow** (Files: `apps/mobile/src/features/household/*`)
   - Action: create shared household creation and invite/join logic for the second user.
   - Why: separate logins require a clean household membership flow before any ledger data is meaningful.
   - Dependencies: Step 6
   - Risk: Medium

### Phase 1D: Credit Card Ingestion
8. **Create statement ingest webhook** (Files: `supabase/functions/statement-ingest/index.ts`)
   - Action: receive normalized payloads from n8n and persist statement metadata plus parsed rows.
   - Why: gives n8n one stable backend target.
   - Dependencies: Steps 3-5
   - Risk: High

9. **Define local n8n workflow** (Files: `infra/n8n/README.md`, `infra/n8n/workflows/credit-card-ingest.json`)
   - Action: document and configure Drive watch, password lookup, file retrieval, parser call, retry logic, and backend handoff.
   - Why: Phase 1 depends on reliable ingestion more than any other capability.
   - Dependencies: Step 8
   - Risk: High

10. **Implement parser integration** (Files: `supabase/functions/statement-parse/index.ts` or `apps/backend/parser/*`)
   - Action: call Vercel AI Gateway for extraction, then normalize and validate rows deterministically.
   - Why: LLM-first parsing requires guardrails before rows become transaction data.
   - Dependencies: Steps 8-9
   - Risk: High

### Phase 1E: Review and Core Product UI
11. **Build dashboard screen** (Files: `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/src/features/dashboard/*`)
   - Action: show totals, sync freshness, alerts, and recent transactions.
   - Why: this is the primary “is the system working?” screen.
   - Dependencies: Steps 5, 8-10
   - Risk: Medium

12. **Build transactions screen** (Files: `apps/mobile/app/(tabs)/transactions.tsx`, `apps/mobile/src/features/transactions/*`)
   - Action: show grouped transaction list, detail view, category reassignment, and `needs_review` highlighting.
   - Why: review is the trust loop for an LLM-first ingestion product.
   - Dependencies: Steps 8-10
   - Risk: Medium

13. **Build settings screen** (Files: `apps/mobile/app/(tabs)/settings.tsx`, `apps/mobile/src/features/settings/*`)
   - Action: manage parser profiles, categories, sync health, and notification preferences.
   - Why: multi-format ingestion needs user-visible operational controls.
   - Dependencies: Steps 5, 8-10
   - Risk: Low

### Phase 1F: Verification
14. **Add unit and integration coverage** (Files: `tests/unit/*`, `tests/integration/*`)
   - Action: cover parser normalization, RLS assumptions, transaction persistence, and review-state handling.
   - Why: ingestion correctness and data isolation are the highest-risk areas.
   - Dependencies: Steps 3-13
   - Risk: Medium

15. **Add E2E coverage** (Files: `tests/e2e/*`)
   - Action: verify sign-in, household access, statement ingestion path, and review flow.
   - Why: the MVP value is the end-to-end path, not isolated pieces.
   - Dependencies: Steps 6-13
   - Risk: Medium

## Testing Strategy
- Unit tests: parser normalization, category mapping, review-state reducers, summary selectors
- Integration tests: Supabase persistence, RLS policies, ingest webhook contracts, parser pipeline contracts
- E2E tests: Google sign-in, household setup, ingested statement visibility, `needs_review` highlighting, category correction flow

## Risks and Mitigations
- **Risk:** Local n8n is offline when a file lands in Drive
  - Mitigation: support polling fallback, show last-sync health in UI, and document uptime expectations
- **Risk:** LLM-first parsing produces inconsistent row shapes across banks
  - Mitigation: add deterministic normalization, confidence scoring, and explicit review highlighting
- **Risk:** Password-protected PDFs fail to decrypt or map to the wrong secrets
  - Mitigation: keep per-card secret mapping in n8n config and fail loudly with visible sync errors
- **Risk:** `needs_review` rows in totals can confuse users
  - Mitigation: visually separate them and surface review counts prominently on dashboard and list screens
- **Risk:** RLS mistakes leak data across accounts
  - Mitigation: test RLS directly and keep all household access server-enforced

## Explicit Scope Cuts From The Original PRD
- WhatsApp/UPI ingestion is moved out of Phase 1
- Manual entry is removed from Phase 1
- Raw PDFs are not stored in app-managed storage
- AI insights are deferred until ingestion is trustworthy
- Budgeting remains out of scope for v1

## Success Criteria
- [ ] Two separate Google accounts can access one shared household workspace
- [ ] A password-protected statement uploaded to the shared Drive folder is detected end-to-end
- [ ] Parsed rows are stored with statement metadata and review state
- [ ] Low-confidence rows are visible in totals and clearly highlighted in the app
- [ ] Transactions can be reviewed and recategorized in the app
- [ ] Dashboard and transaction list reflect ingested data correctly
- [ ] The system supports multiple statement formats with a clear failure path for unsupported files
