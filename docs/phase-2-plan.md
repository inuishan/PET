# Implementation Plan: Phase 2 UPI Capture via WhatsApp

## Overview
Phase 2 adds the second ingestion source to the existing household ledger: direct UPI expense capture through a Meta Cloud API test number on WhatsApp. This phase should extend the Phase 1 credit-card-first foundation without introducing a parallel ledger model. The outcome is one shared household history that combines statement-ingested card transactions with WhatsApp-captured UPI expenses, while preserving review visibility and auditability.

The integration boundary is different from Phase 1. Google Drive ingestion can rely on the local n8n runtime, but inbound WhatsApp traffic needs a stable public HTTPS endpoint for Meta webhook delivery. Because of that, the webhook boundary should live in Supabase Edge Functions, with server-side signature verification, idempotent message persistence, deterministic normalization, and optional reply handling.

## Technology Choices
- `Expo + React Native + TypeScript`
- `Supabase Auth + Postgres + RLS + Edge Functions`
- `Meta WhatsApp Cloud API` test-number webhook flow
- `Vercel AI Gateway` or the same LLM gateway path already used for parsing/classification
- Existing `transactions`, `classification_events`, and `notifications` primitives from Phase 1
- Existing household membership model for participant approval and owner attribution

## Why This Shape
- `Supabase Edge Functions` are the right public webhook boundary because Meta needs an internet-reachable HTTPS endpoint with verification and signature validation.
- Reusing the existing `transactions` table keeps credit card and UPI activity in one ledger instead of fragmenting the product into source-specific histories.
- Storing inbound WhatsApp message records separately preserves auditability, deduplication, and parser debugging without overloading transaction rows.
- Reusing Phase 1 review and notification concepts keeps the trust loop consistent across both ingestion sources.

## Scope

### In Scope
- Meta Cloud API test-number setup for inbound direct messages
- Approved WhatsApp participant allowlist per household
- Free-form WhatsApp message ingestion for UPI expenses
- LLM-assisted extraction of amount, merchant, date, payer, and note
- Owner attribution to the correct household member where possible
- Deterministic validation and normalization before transaction posting
- Automatic transaction posting for high-confidence parses
- Review-required transaction creation for low-confidence or conflicting parses
- Optional WhatsApp status acknowledgements when the reply window allows it
- Dashboard, transaction, and settings updates for UPI source visibility
- Household-scoped notifications for review-needed or parse-failure cases
- Auditability for inbound messages, parsing decisions, and manual corrections

### Deferred
- WhatsApp group ingestion
- Media attachment ingestion or OCR from images/screenshots
- Migration from a Meta test number to a production business number
- Rich conversational flows or multi-turn clarification over WhatsApp
- Automated tasks/reminders from AI insight generation
- Analytics and deep analysis work beyond the minimum source-visibility updates needed for Phase 2

## Architecture Changes
- New database tables for WhatsApp participants and inbound message persistence
- New webhook edge function: `supabase/functions/whatsapp-webhook/`
- New parsing/ingestion helpers: `supabase/functions/_shared/whatsapp-*` or equivalent domain modules
- Mobile feature updates for settings, transactions, dashboard status, and review handling
- New operational documentation for Meta app setup, secrets, webhook validation, and reply-window behavior

## Implementation Steps

### Phase 2A: Data Model and Access Control
1. **Add WhatsApp participant and message schema** (Files: `supabase/migrations/0006_whatsapp_ingestion.sql`)
   - Action: add `whatsapp_participants` and `whatsapp_messages` tables, including household linkage, participant phone identity, inbound message IDs, normalized message content, parse metadata, and transaction linkage.
   - Why: Phase 2 needs explicit sender approval, idempotent inbound persistence, and a durable audit trail before any transaction is posted.
   - Dependencies: None
   - Risk: Medium

2. **Add RLS policies and participant-management RPCs** (Files: `supabase/migrations/0007_whatsapp_rls.sql`)
   - Action: enforce household-scoped access for participant/message records, restrict webhook inserts to trusted server paths, and add RPCs for approving or revoking participants.
   - Why: inbound message ingestion is a new trust boundary and must not let unapproved phone numbers write household data.
   - Dependencies: Step 1
   - Risk: High

### Phase 2B: Webhook Boundary and Inbound Capture
3. **Implement Meta webhook verification and signature validation** (Files: `supabase/functions/whatsapp-webhook/index.ts`)
   - Action: support GET verification challenge handling, validate POST request signatures, reject unsupported payloads, and normalize the inbound webhook envelope.
   - Why: this is the internet-facing entry point for Phase 2 and the main security boundary for the integration.
   - Dependencies: Steps 1-2
   - Risk: High

4. **Persist inbound messages with idempotent parse handoff** (Files: `supabase/functions/whatsapp-webhook/index.ts`, `supabase/functions/_shared/whatsapp-ingestion.ts`)
   - Action: deduplicate by Meta message ID, persist raw and normalized payloads, link to approved participants, and trigger the downstream parse/post flow without double-ingesting repeated deliveries.
   - Why: webhook systems retry aggressively, so Phase 2 must be duplicate-safe by design.
   - Dependencies: Steps 1-3
   - Risk: High

### Phase 2C: Parsing, Attribution, and Transaction Posting
5. **Implement WhatsApp UPI parsing and owner attribution** (Files: `supabase/functions/whatsapp-parse/index.ts`, `supabase/functions/_shared/whatsapp-parser.ts`)
   - Action: extract amount, merchant, payer, note, and transaction date from free-form messages; reuse known participant mappings; and validate parsed values before they become ledger data.
   - Why: the product value of Phase 2 depends on turning messy free-form messages into structured transactions without silently guessing.
   - Dependencies: Steps 3-4
   - Risk: High

6. **Create transaction posting and review-required flows** (Files: `supabase/functions/whatsapp-ingest/index.ts`, `supabase/functions/_shared/whatsapp-review.ts`)
   - Action: reuse category classification where possible, create `transactions` with `source_type = 'upi_whatsapp'`, emit classification events, and flag low-confidence or conflicting parses for review instead of auto-posting them as trusted data.
   - Why: the ledger must stay trustworthy even when WhatsApp messages are ambiguous.
   - Dependencies: Step 5
   - Risk: High

### Phase 2D: Product Surfaces and Controls
7. **Add settings controls for participant approval and source health** (Files: `apps/mobile/src/features/settings/*`, `apps/mobile/app/(tabs)/settings.tsx`)
   - Action: show the Meta test number setup state, allow approved participant management, surface webhook health, and expose the optional acknowledgement preference.
   - Why: households need operational control over who can ingest and whether the source is healthy.
   - Dependencies: Steps 1-6
   - Risk: Medium

8. **Extend dashboard and transaction views for UPI capture and review** (Files: `apps/mobile/src/features/dashboard/*`, `apps/mobile/src/features/transactions/*`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/transactions.tsx`)
   - Action: show UPI source badges, owner attribution, parse-status indicators, integration health chips, and review actions for ambiguous UPI captures.
   - Why: users must be able to see, trust, and correct WhatsApp-ingested expenses inside the same product surfaces they already use.
   - Dependencies: Steps 6-7
   - Risk: Medium

### Phase 2E: Optional Acknowledgements and Operations
9. **Implement optional WhatsApp status acknowledgements** (Files: `supabase/functions/whatsapp-reply/index.ts`, `supabase/functions/_shared/whatsapp-reply.ts`)
   - Action: send short success, parse-failure, or review-needed acknowledgements when the reply window and configuration allow it, while keeping push/email as the primary notification path.
   - Why: acknowledgements can improve trust and usability, but they should remain optional and operationally safe.
   - Dependencies: Steps 3-8
   - Risk: Medium

10. **Document Meta setup and runtime operations** (Files: `docs/phase-2-whatsapp-runbook.md`, `supabase/.env.functions.phase2.example`)
   - Action: document webhook verification, required secrets, approved participant setup, local validation steps, and operational failure modes for the WhatsApp path.
   - Why: external webhook integrations fail most often at setup and runtime boundaries, not in isolated code paths.
   - Dependencies: Steps 3-9
   - Risk: Medium

### Phase 2F: Verification
11. **Add unit and integration coverage** (Files: `tests/unit/*`, `tests/integration/*`)
   - Action: cover signature validation, payload normalization, participant approval, parser extraction, owner attribution, duplicate handling, and review-state persistence.
   - Why: the highest-risk failures in Phase 2 are security mistakes and incorrect transaction posting from ambiguous messages.
   - Dependencies: Steps 1-10
   - Risk: Medium

12. **Add E2E coverage for the WhatsApp capture path** (Files: `tests/e2e/*`)
   - Action: verify participant setup, inbound message capture, high-confidence auto-posting, ambiguous-message review flow, and acknowledgement-disabled fallback behavior.
   - Why: the full Phase 2 value is the end-to-end path from message send to visible ledger update or review task.
   - Dependencies: Steps 7-10
   - Risk: Medium

## Testing Strategy
- Unit tests: signature verification, message normalization, parser extraction, owner attribution, classification fallback, review-state creation
- Integration tests: webhook persistence, deduplication, participant approval/RLS, transaction posting, notification creation
- E2E tests: approved-participant happy path, unapproved sender rejection, ambiguous parse review path, optional acknowledgement branch

## Risks and Mitigations
- **Risk:** Meta retries or duplicate webhook delivery create duplicate transactions
  - Mitigation: persist webhook IDs, enforce idempotent inserts, and separate message records from posted transactions
- **Risk:** Free-form WhatsApp text omits amount, date, or merchant details
  - Mitigation: validate required fields strictly, keep confidence thresholds explicit, and route ambiguous parses to review instead of silent posting
- **Risk:** Unapproved numbers or spoofed requests attempt to write household data
  - Mitigation: validate Meta signatures, allowlist approved participants, and keep all inserts on server-side trusted paths
- **Risk:** Optional WhatsApp replies exceed policy or configuration limits
  - Mitigation: keep replies opt-in, use conservative reply conditions, and preserve push/email as the primary notification channels
- **Risk:** UPI transactions appear in the ledger without a clear audit trail
  - Mitigation: store raw message references, parse metadata, classification events, and manual corrections alongside transaction history
- **Risk:** Phase 2 work fragments the UX between card and UPI sources
  - Mitigation: keep one shared transaction model and expose source-specific state inside the existing dashboard, transactions, and settings surfaces

## Explicit Scope Cuts From The PRD
- WhatsApp group capture remains out of scope
- Image or screenshot-based payment capture remains out of scope
- Business-number migration and long-term production WhatsApp rollout remain out of scope
- Deep analytics and AI insights are still Phase 3 work
- Learning loops such as merchant-memory improvements remain Phase 4 work

## Success Criteria
- [ ] Approved household participants can send direct WhatsApp messages to the Meta test number and have them ingested safely
- [ ] Webhook requests are verified, deduplicated, and persisted with auditable message references
- [ ] High-confidence UPI messages are posted into the shared ledger with correct owner and source attribution
- [ ] Low-confidence or conflicting messages create visible review-required items instead of silently posting incorrect data
- [ ] Dashboard, transactions, and settings surfaces expose UPI source health and ingested UPI activity clearly
- [ ] Optional WhatsApp acknowledgements work when configured, without replacing push/email as the main notification path
- [ ] The household can manage approved WhatsApp participants and understand failure modes from the app and runbook
