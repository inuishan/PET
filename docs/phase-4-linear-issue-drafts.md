# Phase 4 Linear Issue Drafts

These issue drafts mirror the existing PET Linear structure so the Phase 4 learning-and-trust scope is preserved in-repo alongside the PRD and Stitch references.

## Umbrella Issue

### Title
`Phase 4 umbrella: Learning and trust execution`

### Labels
- `Phase 4`

### Description
Source: `docs/expense-tracker-prd.md` (Phase 4: Learning and Trust)

Design references

- `stitch-dashboard-html/dashboard-with-spending-alerts.html`
- `stitch-dashboard-html/updated-dashboard-with-annotations.html`
- `stitch-dashboard-html/transaction-history.html`
- `stitch-dashboard-html/analytics-expense-focus.html`
- Corresponding screenshots in `stitch-dashboard-html/images/`

Purpose

- Track the full Phase 4 deliverable for turning user corrections, merchant memory, confidence scoring, and recurring-charge detection into a trustworthy feedback loop.
- Ensure any product-surface work stays grounded in the existing Stitch HTML and screenshot references instead of inventing disconnected flows or layouts.

Success criteria

- User corrections are captured as explicit, auditable learning signals instead of hidden side effects.
- Merchant alias memory is household-scoped, explainable, and reused before falling back to fresh LLM classification.
- Confidence scoring better separates high-confidence automation from work that should stay in review.
- Recurring-charge detection becomes more accurate and more useful in the dashboard, analytics, and transaction review flows.
- Trust-sensitive UI changes remain aligned with the Stitch HTML/screenshots and continue to explain why the product made a recommendation or classification.

Execution model

- Child issues own implementation by phase bundle.
- Each child issue must implement with `tdd-guide` or the project's TDD runner driving RED -> GREEN, complete the relevant tests, simplify the code, run `code-reviewer`, fix all critical/high findings, and only then commit and push.
- This umbrella issue should only be closed once all child issues are complete and the Phase 4 success criteria are met.

Child issue set

- Phase 4A: Correction event model and learning-signal capture
- Phase 4B: Merchant alias memory and deterministic classification reuse
- Phase 4C: Confidence scoring calibration and review prioritization
- Phase 4D: Review, correction, and trust UX from Stitch designs
- Phase 4E: Recurring charge detection and surfaced trust insights
- Phase 4F: Cross-cutting verification and release hardening

## Child Issues

### Phase 4A

#### Title
`Phase 4A: Correction event model and learning-signal capture`

#### Labels
- `Backend`
- `Phase 4`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 4: Learning and Trust)

Scope

- Add the server-owned feedback model for user corrections, confirmations, dismissals, and overrides across category, merchant normalization, owner attribution, and review outcomes.
- Preserve auditability so the product can distinguish raw ingestion output from later human corrections and approved learned behavior.
- Expose explicit read/write boundaries for correction events so downstream classification, confidence scoring, and recurring detection can consume trusted signals without mutating historical evidence.

Execution order

1. Implement the scoped work with `tdd-guide` or the project's TDD runner driving RED -> GREEN.
2. Complete the relevant unit and integration coverage and get it passing.
3. Simplify the code before commit: remove avoidable complexity, keep trust-critical event boundaries explicit, and avoid duplicate write paths.
4. Run `code-reviewer`, address all critical/high findings, and verify the correction model remains auditable and household-scoped.
5. Commit and push only after the review fixes are complete.

Definition of done

- User corrections and review actions persist as explicit learning events.
- Historical ingestion/classification evidence remains distinguishable from later manual overrides.
- Downstream systems can consume trusted correction signals through stable server-owned paths.
- Relevant tests pass.
- Code has been simplified before commit.
- Review has been completed and findings addressed.

### Phase 4B

#### Title
`Phase 4B: Merchant alias memory and deterministic classification reuse`

#### Labels
- `Backend`
- `Phase 4`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 4: Learning and Trust)

Scope

- Build merchant alias memory from accepted household corrections and deterministic historical matches.
- Prefer trusted alias and classification reuse before fresh LLM inference where the evidence is strong enough.
- Handle collisions, ambiguous aliases, and household-specific merchant behavior conservatively so the system does not overlearn bad mappings.

Execution order

1. Implement the scoped work with `tdd-guide` or the project's TDD runner driving RED -> GREEN.
2. Complete the relevant unit and integration coverage and get it passing.
3. Simplify the code before commit: reduce duplicate normalization paths, keep alias resolution explicit, and separate deterministic reuse from fallback AI inference.
4. Run `code-reviewer`, address all critical/high findings, and verify the learned alias behavior is explainable and safe.
5. Commit and push only after the review fixes are complete.

Definition of done

- Merchant aliases can be learned from accepted corrections and reused deterministically.
- Classification prefers trusted household memory before new LLM work when the evidence is sufficient.
- Conflicting or weak alias matches degrade safely into review or fallback inference.
- Relevant tests pass.
- Code has been simplified before commit.
- Review has been completed and findings addressed.

### Phase 4C

#### Title
`Phase 4C: Confidence scoring calibration and review prioritization`

#### Labels
- `Backend`
- `Phase 4`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 4: Learning and Trust)

Scope

- Improve confidence scoring across statement ingestion, WhatsApp capture, classification, and learned-memory reuse.
- Calibrate thresholds so the product is more aggressive only when it has strong evidence and more conservative when ambiguity remains.
- Use the improved confidence model to prioritize the review queue and surface why an item was auto-cleared, flagged, or left in review.

Execution order

1. Implement the scoped work with `tdd-guide` or the project's TDD runner driving RED -> GREEN.
2. Complete the relevant unit and integration coverage and get it passing.
3. Simplify the code before commit: keep scoring inputs explicit, avoid opaque weighting sprawl, and remove redundant threshold logic.
4. Run `code-reviewer`, address all critical/high findings, and verify the confidence model is explainable, stable, and trust-preserving.
5. Commit and push only after the review fixes are complete.

Definition of done

- Confidence scoring accounts for deterministic matches, user corrections, ambiguity triggers, and source quality.
- Review-required work is prioritized more accurately than the current baseline.
- The product can explain why an item was automated or routed for review.
- Relevant tests pass.
- Code has been simplified before commit.
- Review has been completed and findings addressed.

### Phase 4D

#### Title
`Phase 4D: Review, correction, and trust UX from Stitch designs`

#### Labels
- `Mobile`
- `Backend`
- `Phase 4`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 4: Learning and Trust)

Required design references

- `stitch-dashboard-html/transaction-history.html`
- `stitch-dashboard-html/updated-dashboard-with-annotations.html`
- `stitch-dashboard-html/dashboard-with-spending-alerts.html`
- `stitch-dashboard-html/images/transaction-history.png`
- `stitch-dashboard-html/images/updated-dashboard-with-annotations.png`
- `stitch-dashboard-html/images/dashboard-with-spending-alerts.png`

Scope

- Extend review and correction flows so users can understand confidence, see learned-memory provenance, and make corrections without losing context.
- Add trust-oriented explanations for why a category, merchant normalization, owner, or review state was chosen.
- Keep transaction, dashboard, and adjacent settings/control surfaces visually aligned with the existing Stitch HTML/screenshots rather than introducing a new visual language.

Execution order

1. Implement the scoped work with `tdd-guide` or the project's TDD runner driving RED -> GREEN.
2. Complete the relevant unit, integration, and UI/E2E coverage and get it passing.
3. Simplify the code before commit: remove avoidable UI/state complexity, keep view-model boundaries explicit, and preserve Stitch fidelity.
4. Run `code-reviewer`, address all critical/high findings, and verify the review/correction UX keeps trust and design consistency intact.
5. Commit and push only after the review fixes are complete.

Definition of done

- Users can review and correct transactions with clear confidence and provenance context.
- Learned behavior is explained in the UI instead of appearing as opaque automation.
- The affected surfaces stay faithful to the referenced Stitch HTML/screenshots.
- Relevant tests pass.
- Code has been simplified before commit.
- Review has been completed and findings addressed.

### Phase 4E

#### Title
`Phase 4E: Recurring charge detection and surfaced trust insights`

#### Labels
- `Mobile`
- `Backend`
- `Phase 4`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 4: Learning and Trust)

Required design references

- `stitch-dashboard-html/analytics-expense-focus.html`
- `stitch-dashboard-html/dashboard-with-spending-alerts.html`
- `stitch-dashboard-html/transaction-history.html`
- `stitch-dashboard-html/images/analytics-expense-focus.png`
- `stitch-dashboard-html/images/dashboard-with-spending-alerts.png`
- `stitch-dashboard-html/images/transaction-history.png`

Scope

- Improve recurring-charge detection using better merchant memory, transaction grouping, cadence heuristics, and correction feedback.
- Surface recurring-charge findings and trust-oriented recommendations in dashboard and analytics flows without overstating certainty.
- Connect recurring findings back to supporting transactions so the user can validate, keep, cancel, or review the detected pattern.

Execution order

1. Implement the scoped work with `tdd-guide` or the project's TDD runner driving RED -> GREEN.
2. Complete the relevant unit, integration, and UI/E2E coverage and get it passing.
3. Simplify the code before commit: reduce heuristic sprawl, keep recurring evidence explicit, and preserve visual consistency with the Stitch references.
4. Run `code-reviewer`, address all critical/high findings, and verify the recurring-detection behavior is specific, reviewable, and trustworthy.
5. Commit and push only after the review fixes are complete.

Definition of done

- Recurring-charge detection is more accurate and auditable than the current baseline.
- Dashboard and analytics surfaces expose recurring findings with clear evidence and follow-through actions.
- The UI remains aligned with the referenced Stitch HTML/screenshots.
- Relevant tests pass.
- Code has been simplified before commit.
- Review has been completed and findings addressed.

### Phase 4F

#### Title
`Phase 4F: Cross-cutting verification and release hardening`

#### Labels
- `Testing`
- `Phase 4`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 4: Learning and Trust)

Scope

- Add unit, integration, and E2E coverage for correction capture, alias learning, confidence scoring, review prioritization, and recurring-detection flows.
- Consolidate verification gaps left by earlier Phase 4 tickets and harden the full learning-and-trust release path.
- Verify that affected product surfaces stay aligned with the required Stitch HTML/screenshot references.

Intent

- This ticket is not a replacement for per-ticket TDD. Earlier implementation tickets still own their local tests.
- This ticket owns cross-cutting verification, suite stabilization, design-fidelity checks, and release readiness for the full Phase 4 path.

Execution order

1. Implement the scoped verification work with the project's TDD runner where new coverage is needed.
2. Close coverage gaps across earlier Phase 4 tickets and stabilize the relevant suites.
3. Simplify the verification harness before commit where redundancy or brittleness has accumulated, without weakening coverage.
4. Run `code-reviewer`, address all critical/high findings, and verify the release path and Stitch fidelity are ready.
5. Commit and push only after the review fixes are complete.

Definition of done

- Unit, integration, and E2E coverage exists for the highest-risk Phase 4 learning and trust paths.
- Correction capture, alias reuse, confidence scoring, review prioritization, and recurring-detection behavior are covered.
- Cross-cutting verification gaps from earlier Phase 4 tickets are closed.
- Design-fidelity checks against the referenced Stitch assets have been performed.
- Code has been simplified before commit.
- Review has been completed and findings addressed.
