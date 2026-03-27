# Phase 2 Linear Issue Drafts

These issue drafts mirror the Phase 1 Linear structure. They are captured here because Linear MCP write calls were canceled during creation attempts, so the content is preserved and ready to create once the write path works again.

## Umbrella Issue

### Title
`Phase 2 umbrella: WhatsApp UPI capture execution`

### Labels
- `Phase 2`

### Description
Source: `docs/phase-2-plan.md`

Purpose

- Track the full Phase 2 deliverable for WhatsApp-based UPI capture across data model changes, webhook ingress, parsing, transaction posting, product surfaces, operations, and verification.

Success criteria

- Approved household participants can send direct WhatsApp messages to the Meta test number and have them ingested safely.
- Webhook requests are verified, deduplicated, and persisted with auditable message references.
- High-confidence UPI messages are posted into the shared ledger with correct owner and source attribution.
- Low-confidence or conflicting messages create visible review-required items instead of silently posting incorrect data.
- Dashboard, transactions, and settings surfaces expose UPI source health and ingested UPI activity clearly.
- Optional WhatsApp acknowledgements work when configured, without replacing push/email as the main notification path.
- The household can manage approved WhatsApp participants and understand failure modes from the app and runbook.

Execution model

- Child issues own implementation by phase bundle.
- Each child issue must implement, run TDD, simplify code before commit, and complete code review before closure.
- This umbrella issue should only be closed once all child issues are complete and the Phase 2 success criteria are met.

Child issue set

- Phase 2A: Data model and access control (steps 1-2)
- Phase 2B: Webhook boundary and inbound capture (steps 3-4)
- Phase 2C: Parsing, attribution, and transaction posting (steps 5-6)
- Phase 2D: Product surfaces and controls (steps 7-8)
- Phase 2E: Optional acknowledgements and operations (steps 9-10)
- Phase 2F: Cross-cutting verification and release hardening (steps 11-12)

## Child Issues

### Phase 2A

#### Title
`Phase 2A: Data model and access control (steps 1-2)`

#### Labels
- `Backend`
- `Phase 2`

#### Description
Source: `docs/phase-2-plan.md`

Scope

- Step 1: Add WhatsApp participant and message schema.
- Step 2: Add RLS policies and participant-management RPCs.

Execution order

1. Implement the scoped work for steps 1-2.
2. Run the `tdd-guide` workflow to add or complete the relevant tests and get them passing.
3. Simplify the code before commit: remove avoidable complexity, tighten abstractions, and keep the implementation readable without changing behavior.
4. Run `code-reviewer`, address all critical/high findings, and only then mark the ticket ready for completion/commit.

Definition of done

- `whatsapp_participants` and `whatsapp_messages` storage exists with household linkage, message identity, and auditability.
- Access control keeps participant and message data household-scoped.
- Participant approval/revocation can be managed through server-owned paths.
- Relevant tests pass.
- Code has been simplified before commit.
- Review has been completed and findings addressed.

### Phase 2B

#### Title
`Phase 2B: Webhook boundary and inbound capture (steps 3-4)`

#### Labels
- `Infra`
- `Backend`
- `Phase 2`

#### Description
Source: `docs/phase-2-plan.md`

Scope

- Step 3: Implement Meta webhook verification and signature validation.
- Step 4: Persist inbound messages with idempotent parse handoff.

Execution order

1. Implement the scoped work for steps 3-4.
2. Run the `tdd-guide` workflow to add or complete the relevant tests and get them passing.
3. Simplify the code before commit: remove avoidable complexity, tighten abstractions, and keep the implementation readable without changing behavior.
4. Run `code-reviewer`, address all critical/high findings, and only then mark the ticket ready for completion/commit.

Definition of done

- The Meta webhook verification challenge flow works.
- POST payloads are signature-validated and unsupported shapes are rejected safely.
- Inbound messages are deduplicated by provider message ID before downstream posting.
- Approved-participant linkage and parse handoff are in place.
- Relevant tests pass.
- Code has been simplified before commit.
- Review has been completed and findings addressed.

### Phase 2C

#### Title
`Phase 2C: Parsing, attribution, and transaction posting (steps 5-6)`

#### Labels
- `Backend`
- `Phase 2`

#### Description
Source: `docs/phase-2-plan.md`

Scope

- Step 5: Implement WhatsApp UPI parsing and owner attribution.
- Step 6: Create transaction posting and review-required flows.

Execution order

1. Implement the scoped work for steps 5-6.
2. Run the `tdd-guide` workflow to add or complete the relevant tests and get them passing.
3. Simplify the code before commit: remove avoidable complexity, tighten abstractions, and keep the implementation readable without changing behavior.
4. Run `code-reviewer`, address all critical/high findings, and only then mark the ticket ready for completion/commit.

Definition of done

- Free-form WhatsApp messages can be parsed into validated UPI transaction candidates.
- Owner attribution works through approved participant mappings and parser results.
- High-confidence messages post into the shared ledger with `source_type = 'upi_whatsapp'`.
- Low-confidence or conflicting messages create review-required outcomes instead of silent misposts.
- Classification and notification side effects are recorded as needed.
- Relevant tests pass.
- Code has been simplified before commit.
- Review has been completed and findings addressed.

### Phase 2D

#### Title
`Phase 2D: Product surfaces and controls (steps 7-8)`

#### Labels
- `Mobile`
- `Backend`
- `Phase 2`

#### Description
Source: `docs/phase-2-plan.md`

Scope

- Step 7: Add settings controls for participant approval and source health.
- Step 8: Extend dashboard and transaction views for UPI capture and review.

Execution order

1. Implement the scoped work for steps 7-8.
2. Run the `tdd-guide` workflow to add or complete the relevant tests and get them passing.
3. Simplify the code before commit: remove avoidable complexity, tighten abstractions, and keep the implementation readable without changing behavior.
4. Run `code-reviewer`, address all critical/high findings, and only then mark the ticket ready for completion/commit.

Definition of done

- Settings can show WhatsApp source health and manage approved participants.
- Dashboard and transactions surfaces show UPI source attribution and integration state clearly.
- Ambiguous UPI captures are reviewable in the product without leaving the main transaction flows.
- Relevant tests pass.
- Code has been simplified before commit.
- Review has been completed and findings addressed.

### Phase 2E

#### Title
`Phase 2E: Optional acknowledgements and operations (steps 9-10)`

#### Labels
- `Infra`
- `Backend`
- `Phase 2`

#### Description
Source: `docs/phase-2-plan.md`

Scope

- Step 9: Implement optional WhatsApp status acknowledgements.
- Step 10: Document Meta setup and runtime operations.

Execution order

1. Implement the scoped work for steps 9-10.
2. Run the `tdd-guide` workflow to add or complete the relevant tests and get them passing.
3. Simplify the code before commit: remove avoidable complexity, tighten abstractions, and keep the implementation readable without changing behavior.
4. Run `code-reviewer`, address all critical/high findings, and only then mark the ticket ready for completion/commit.

Definition of done

- Optional acknowledgement behavior is implemented conservatively and can remain disabled safely when config is absent.
- Runtime setup, secrets, validation steps, and failure modes are documented.
- The runbook supports happy-path, rejection-path, and review-path validation.
- Relevant tests pass.
- Code has been simplified before commit.
- Review has been completed and findings addressed.

### Phase 2F

#### Title
`Phase 2F: Cross-cutting verification and release hardening (steps 11-12)`

#### Labels
- `Testing`
- `Phase 2`

#### Description
Source: `docs/phase-2-plan.md`

Scope

- Step 11: Add unit and integration coverage.
- Step 12: Add E2E coverage for the WhatsApp capture path.
- Consolidate verification gaps left by earlier Phase 2 tickets and harden the full Phase 2 release path.

Intent

- This ticket is not a replacement for per-ticket TDD. Earlier implementation tickets still own their local tests.
- This ticket owns cross-cutting verification, suite stabilization, end-to-end confidence, and release readiness for the full Phase 2 path.

Execution order

1. Implement the scoped work for steps 11-12.
2. Close coverage gaps across earlier Phase 2 tickets and stabilize the relevant suites.
3. Simplify the verification harness where it has become redundant or brittle, without weakening coverage.
4. Run `code-reviewer`, address all critical/high findings, and only then mark the ticket ready for completion/commit.

Definition of done

- Unit, integration, and E2E coverage exists for the highest-risk Phase 2 paths.
- Happy-path, rejection-path, ambiguous-parse, and acknowledgement-disabled behavior are covered.
- Cross-cutting verification gaps from earlier Phase 2 tickets are closed.
- Review has been completed and findings addressed.
