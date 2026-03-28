# Implementation Plan: Phase 4 Learning and Trust

## Overview
Phase 4 turns the current ingestion, review, and analytics foundation into a learning system the household can trust. The goal is not to add another parallel AI layer, but to make existing statement ingestion, WhatsApp capture, review handling, and recurring-charge analysis improve from user corrections while staying auditable, conservative, and explainable.

The current codebase already has the right starting primitives: `merchant_aliases`, `classification_events`, `transactions.needs_review`, the `reassign_transaction_category` RPC, WhatsApp review ingestion, and analytics recurring-charge read models. Phase 4 should extend those foundations instead of replacing them, with a bias toward immutable learning events, deterministic reuse before fresh LLM inference, and UI surfaces that explain what was learned and why.

## Current Foundation
- Database already contains `merchant_aliases`, `classification_events`, `transactions`, and household-scoped categories in [supabase/migrations/0001_init.sql](/mnt/hdd/workspace/expense-tracking/supabase/migrations/0001_init.sql).
- Manual category correction already exists through [supabase/migrations/0005_transaction_review_rpc.sql](/mnt/hdd/workspace/expense-tracking/supabase/migrations/0005_transaction_review_rpc.sql), but it only captures category reassignment, not the broader learning/trust signals Phase 4 needs.
- WhatsApp ingestion already reuses merchant aliases and writes classification events in [supabase/functions/_shared/whatsapp-review-repository.ts](/mnt/hdd/workspace/expense-tracking/supabase/functions/_shared/whatsapp-review-repository.ts).
- Statement normalization already has a low-confidence threshold and review routing in [supabase/functions/_shared/statement-normalization.mjs](/mnt/hdd/workspace/expense-tracking/supabase/functions/_shared/statement-normalization.mjs).
- Transactions review UI and snapshot shaping already exist in [apps/mobile/src/features/transactions/transactions-service.ts](/mnt/hdd/workspace/expense-tracking/apps/mobile/src/features/transactions/transactions-service.ts), [apps/mobile/src/features/transactions/transactions-model.ts](/mnt/hdd/workspace/expense-tracking/apps/mobile/src/features/transactions/transactions-model.ts), and [apps/mobile/src/app/(tabs)/transactions.tsx](/mnt/hdd/workspace/expense-tracking/apps/mobile/src/app/(tabs)/transactions.tsx).
- Dashboard and analytics already surface review state and recurring-charge candidates through [apps/mobile/src/features/dashboard/dashboard-service.ts](/mnt/hdd/workspace/expense-tracking/apps/mobile/src/features/dashboard/dashboard-service.ts), [apps/mobile/src/features/analytics/analytics-service.ts](/mnt/hdd/workspace/expense-tracking/apps/mobile/src/features/analytics/analytics-service.ts), and [supabase/functions/_shared/analytics-generate.ts](/mnt/hdd/workspace/expense-tracking/supabase/functions/_shared/analytics-generate.ts).

## Requirements
- Capture user corrections as explicit, auditable learning signals.
- Reuse trusted household memory before new LLM classification when the evidence is strong enough.
- Improve confidence scoring across statement ingestion, WhatsApp capture, and learned-memory reuse.
- Make review prioritization clearer and more trustworthy.
- Improve recurring-charge detection using merchant memory and correction feedback.
- Keep the product surfaces aligned with the existing Stitch HTML and screenshot references.
- Preserve fail-closed behavior: ambiguous cases still go to review rather than silently auto-learning.

## Assumptions and Constraints
- Phase 4 is layered on top of the current single-household, two-adult product model.
- Existing review UX is the right base; Phase 4 should deepen it rather than replace it.
- `classification_events` should remain part of the audit trail, but Phase 4 likely needs a broader immutable event stream for non-category corrections.
- Household trust is more important than automation rate. The system should prefer under-learning to over-learning.
- Learned merchant/category behavior becomes household-wide immediately after an accepted correction.
- One accepted correction is sufficient for the next matching ingest to auto-apply the learned result; no secondary approval gate is required.
- Learning applies only to new ingests going forward; Phase 4 should not backfill historical transactions automatically.
- High-confidence recurring-charge findings may create alerts/tasks automatically as part of the trust loop.
- Product-surface work should stay aligned with:
  - `stitch-dashboard-html/dashboard-with-spending-alerts.html`
  - `stitch-dashboard-html/updated-dashboard-with-annotations.html`
  - `stitch-dashboard-html/transaction-history.html`
  - `stitch-dashboard-html/analytics-expense-focus.html`
  - Corresponding screenshots in `stitch-dashboard-html/images/`

## Confirmed Product Decisions
- Learned merchant/category behavior is household-wide immediately after an accepted correction.
- The next matching transaction may auto-apply the learned result without additional approval steps.
- Learned behavior affects new ingests only and does not rewrite historical transactions automatically.
- High-confidence recurring-charge findings can create alerts/tasks automatically.

## Architecture Changes
- New migration: `supabase/migrations/0011_phase4_learning_events.sql`
  - Add an immutable `learning_events` table for user confirmations, category corrections, merchant normalization corrections, owner corrections, recurring-disposition actions, and review-resolution actions.
  - Keep `classification_events` as the category-specific audit log rather than stretching it to represent all trust signals.
- New migration: `supabase/migrations/0012_phase4_learning_rules.sql`
  - Extend `merchant_aliases` with operational learning fields such as confirmation counts, source event linkage, last-confirmed timestamps, and active/inactive state.
  - Add indexes for household-scoped normalized merchant lookup and confidence/rule-state queries if the current index becomes insufficient.
- New migration: `supabase/migrations/0013_phase4_learning_rpc.sql`
  - Add RPCs for trust-safe review actions that do more than category reassignment, such as merchant normalization acceptance, owner correction, review dismissal with rationale, and recurring keep/cancel feedback.
- New shared server modules:
  - `supabase/functions/_shared/learning-events.ts`
  - `supabase/functions/_shared/classification-memory.ts`
  - `supabase/functions/_shared/confidence-scoring.ts`
  - `supabase/functions/_shared/recurring-feedback.ts`
- Existing shared server modules to extend:
  - `supabase/functions/_shared/statement-normalization.mjs`
  - `supabase/functions/_shared/whatsapp-parser-core.ts`
  - `supabase/functions/_shared/whatsapp-review-repository.ts`
  - `supabase/functions/_shared/whatsapp-review.ts`
  - `supabase/functions/_shared/analytics-generate.ts`
  - `supabase/functions/_shared/analytics-insights.ts`
- Mobile surfaces to extend:
  - `apps/mobile/src/features/transactions/transactions-service.ts`
  - `apps/mobile/src/features/transactions/transactions-model.ts`
  - `apps/mobile/src/app/(tabs)/transactions.tsx`
  - `apps/mobile/src/features/dashboard/dashboard-service.ts`
  - `apps/mobile/src/features/analytics/analytics-service.ts`
  - `apps/mobile/src/app/(tabs)/analytics.tsx`
  - `apps/mobile/src/features/settings/settings-service.ts`
  - `apps/mobile/src/app/(tabs)/settings.tsx`

## Implementation Steps

### Phase 4A: Learning Event Model and Trust Boundaries
1. **Add immutable learning-event storage** (Files: `supabase/migrations/0011_phase4_learning_events.sql`)
   - Action: create `learning_events` with household linkage, transaction linkage, actor, event type, previous value, next value, confidence context, source module, and metadata.
   - Why: the current model can explain category reassignment, but it cannot fully audit merchant normalization corrections, owner corrections, recurring dispositions, or review-resolution behavior.
   - Dependencies: existing Phase 1/2/3 schema only
   - Risk: Medium

2. **Add RLS and trust-safe write boundaries** (Files: `supabase/migrations/0011_phase4_learning_events.sql`, `supabase/migrations/0013_phase4_learning_rpc.sql`)
   - Action: ensure authenticated household members can only write learning events for their own household and only through vetted RPCs or trusted server paths.
   - Why: learning data is a trust boundary. A bad write here can poison future automation.
   - Dependencies: Step 1
   - Risk: High

3. **Generalize review RPCs beyond category reassignment** (Files: `supabase/migrations/0013_phase4_learning_rpc.sql`)
   - Action: add RPCs for category correction, owner correction, merchant normalization confirmation, review dismissal, and recurring-disposition feedback while keeping writes immutable and explicit.
   - Why: Phase 4 needs more than a single `reassign_transaction_category` action.
   - Dependencies: Steps 1-2
   - Risk: High

### Phase 4B: Merchant Memory and Deterministic Reuse
4. **Extend merchant memory instead of creating a second alias system** (Files: `supabase/migrations/0012_phase4_learning_rules.sql`, `supabase/functions/_shared/classification-memory.ts`)
   - Action: extend `merchant_aliases` with confirmation and state metadata, and centralize lookup/scoring logic in a shared classification-memory module.
   - Why: the codebase already has `merchant_aliases`; Phase 4 should improve that model, not fork it.
   - Dependencies: Phase 4A
   - Risk: Medium

5. **Route ingestion paths through shared memory lookup** (Files: `supabase/functions/_shared/whatsapp-review-repository.ts`, `supabase/functions/_shared/statement-normalization.mjs`, `supabase/functions/_shared/classification-memory.ts`)
   - Action: make both statement and WhatsApp ingestion consult the same deterministic memory layer before default rules/LLM fallback.
   - Why: learning only helps if both ingestion paths reuse it consistently.
   - Dependencies: Step 4
   - Risk: High

6. **Emit learning events when household memory changes** (Files: `supabase/functions/_shared/learning-events.ts`, `supabase/functions/_shared/whatsapp-review-repository.ts`)
   - Action: whenever an accepted correction updates reusable merchant/category memory, write a corresponding immutable learning event and link the alias change back to that event.
   - Why: household memory must stay explainable and reversible.
   - Dependencies: Steps 1-5
   - Risk: Medium

### Phase 4C: Confidence Scoring and Review Prioritization
7. **Centralize confidence scoring** (Files: `supabase/functions/_shared/confidence-scoring.ts`, `supabase/functions/_shared/statement-normalization.mjs`, `supabase/functions/_shared/whatsapp-parser-core.ts`, `supabase/functions/_shared/whatsapp-review.ts`)
   - Action: move scattered confidence heuristics into a shared scorer that accounts for source quality, deterministic matches, ambiguous fields, prior household confirmations, and low-signal conflicts.
   - Why: the current codebase has source-specific confidence handling. Phase 4 needs one explainable scoring model.
   - Dependencies: Phase 4B
   - Risk: High

8. **Introduce explicit review-priority semantics** (Files: `supabase/functions/_shared/confidence-scoring.ts`, `supabase/migrations/0012_phase4_learning_rules.sql`, `apps/mobile/src/features/transactions/transactions-service.ts`)
   - Action: derive review-priority buckets or explicit priority scores from confidence and conflict signals, then expose them through transaction reads.
   - Why: a trust-focused review queue needs more than binary `needs_review`.
   - Dependencies: Step 7
   - Risk: Medium

9. **Preserve fail-closed behavior for weak learning signals** (Files: `supabase/functions/_shared/confidence-scoring.ts`, `supabase/functions/_shared/classification-memory.ts`)
   - Action: degrade weak or conflicting learned matches into review rather than auto-accepting them.
   - Why: automation rate is not the primary goal; trustworthy automation is.
   - Dependencies: Steps 7-8
   - Risk: High

### Phase 4D: Review and Trust UX
10. **Expose learning provenance in transaction reads** (Files: `apps/mobile/src/features/transactions/transactions-service.ts`, `apps/mobile/src/features/transactions/transactions-model.ts`)
   - Action: extend the transaction snapshot so the UI can show why a category/merchant/owner was chosen, whether it came from direct user correction, household memory, rules, or LLM fallback, and what confidence/prioritization drove the state.
   - Why: Phase 4 UX depends on provenance, not just raw values.
   - Dependencies: Phases 4A-4C
   - Risk: Medium

11. **Upgrade the transactions tab review flow** (Files: `apps/mobile/src/app/(tabs)/transactions.tsx`, `apps/mobile/src/features/transactions/transactions-model.ts`)
   - Action: add confidence/provenance messaging, clearer review-priority treatment, and correction actions for merchant normalization and owner correction alongside category reassignment.
   - Why: the transactions tab is the main trust loop already in production shape.
   - Dependencies: Step 10
   - Risk: Medium

12. **Reflect trust state on dashboard and settings** (Files: `apps/mobile/src/features/dashboard/dashboard-service.ts`, `apps/mobile/src/features/settings/settings-service.ts`, `apps/mobile/src/app/(tabs)/settings.tsx`)
   - Action: add household-visible trust summaries such as learned-automation status, review backlog severity, and alert/task behavior for high-confidence recurring findings without adding approval gates for learned household memory.
   - Why: trust should be visible at the household level, not buried only in review details.
   - Dependencies: Steps 7-11
   - Risk: Medium

### Phase 4E: Recurring Charge Learning
13. **Feed recurring detection from corrected merchant memory and learning events** (Files: `supabase/functions/_shared/recurring-feedback.ts`, `supabase/functions/_shared/analytics-generate.ts`, `supabase/functions/_shared/analytics-insights.ts`)
   - Action: use confirmed merchant normalization, recurring keep/cancel feedback, and household correction history to refine recurring grouping and confidence.
   - Why: recurring-charge quality improves materially once merchant identity and household feedback become stable.
   - Dependencies: Phases 4A-4C
   - Risk: Medium

14. **Keep recurring outputs reviewable and evidence-backed** (Files: `apps/mobile/src/features/analytics/analytics-service.ts`, `apps/mobile/src/app/(tabs)/analytics.tsx`, `apps/mobile/src/features/dashboard/dashboard-service.ts`)
   - Action: show recurring findings with supporting transaction context, confidence hints, disposition actions such as keep/cancel/review-later, and automatic alert/task creation when the finding clears the high-confidence threshold.
   - Why: recurring recommendations are only useful if the household can validate and act on them.
   - Dependencies: Step 13
   - Risk: Medium

### Phase 4F: Verification and Release Readiness
15. **Add unit coverage for learning primitives** (Files: `tests/unit/phase-4-learning-events.test.mjs`, `tests/unit/phase-4-classification-memory.test.mjs`, `tests/unit/phase-4-confidence-scoring.test.mjs`)
   - Action: cover event persistence rules, confidence scoring, merchant memory reuse, and fail-closed downgrade behavior.
   - Why: Phase 4’s highest-risk bugs are silent trust regressions.
   - Dependencies: Phases 4A-4E
   - Risk: Medium

16. **Add integration coverage for correction-driven learning** (Files: `tests/integration/phase-4-learning-feedback-loop.test.mjs`, `tests/integration/phase-4-review-prioritization.test.mjs`, `tests/integration/phase-4-recurring-learning.test.mjs`)
   - Action: verify that a correction creates immutable learning evidence, influences future classification only when thresholds are met, and preserves auditability.
   - Why: the main value of Phase 4 is cross-request behavior, not isolated functions.
   - Dependencies: Step 15
   - Risk: Medium

17. **Add E2E coverage for trust UX** (Files: `tests/e2e/phase-4-trust-loop.test.mjs`)
   - Action: verify review queue prioritization, transaction correction flow, learned follow-up ingestion behavior, and recurring-charge disposition flow.
   - Why: the phase succeeds only if users can see and trust what the system learned.
   - Dependencies: Steps 10-16
   - Risk: Medium

## Suggested Delivery Sequence
- Deliver Phase 4A first so there is a clean immutable event model before any learning is reused.
- Deliver Phase 4B next because deterministic household memory is the minimum valuable learning loop.
- Deliver Phase 4C after that so automation confidence reflects the new learning signals instead of stale heuristics.
- Deliver Phase 4D once provenance and prioritization are available from the backend.
- Deliver Phase 4E after merchant memory is stable enough to improve recurring grouping.
- Deliver Phase 4F continuously, but close it last as the release-hardening phase.

## Testing Strategy
- Unit tests:
  - learning-event serialization and validation
  - merchant-memory match selection
  - confidence scoring inputs and threshold behavior
  - recurring grouping/disposition heuristics
- Integration tests:
  - review correction creates immutable learning events
  - merchant/category reuse only happens once evidence thresholds are met
  - conflicting learned matches downgrade into review
  - recurring detection improves without losing evidence traceability
- E2E tests:
  - user resolves a review item, then a later matching ingest reuses the learned rule
  - review queue shows priority and provenance clearly
  - recurring finding links back to supporting transactions and accepts/disables user feedback

## Risks and Mitigations
- **Risk:** One incorrect correction poisons future classifications.
  - Mitigation: require explicit evidence thresholds, keep learning events immutable, and make alias/rule activation reversible.
- **Risk:** Phase 4 spreads confidence logic across multiple ingestion paths again.
  - Mitigation: centralize scoring in one shared module and route both statement and WhatsApp ingestion through it.
- **Risk:** UI adds opaque AI explanations instead of concrete provenance.
  - Mitigation: only expose concrete sources such as manual correction, household memory, deterministic rule, or LLM fallback with visible confidence context.
- **Risk:** Recurring-charge detection becomes over-eager and noisy.
  - Mitigation: preserve supporting transaction evidence, require cadence and month-count thresholds, and keep results reviewable.
- **Risk:** RLS or RPC gaps let one household affect another household’s learned memory.
  - Mitigation: household-scoped writes only, server-owned mutation paths, and integration coverage around authorization boundaries.

## Success Criteria
- [ ] User corrections are stored as explicit immutable learning events, not hidden side effects.
- [ ] Merchant/category reuse prefers trusted household memory before fresh LLM inference when evidence is strong enough.
- [ ] Confidence scoring becomes consistent across statement and WhatsApp ingestion paths.
- [ ] Review-required work can be prioritized and explained more clearly than the current binary queue.
- [ ] Transactions, dashboard, analytics, and settings surfaces expose trust/provenance state without breaking Stitch alignment.
- [ ] Recurring-charge detection becomes more accurate and more actionable through learned merchant identity and feedback.
- [ ] High-confidence recurring findings create alerts/tasks automatically, while lower-confidence findings stay reviewable without over-triggering.
- [ ] All new Phase 4 behavior is covered by unit, integration, and E2E tests.
