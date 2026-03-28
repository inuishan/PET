# Phase 3 Linear Issue Drafts

These issue drafts mirror the current Phase 3 Linear structure so the analytics and AI execution scope is preserved in-repo alongside the PRD and Stitch references.

## Umbrella Issue

### Title
`Phase 3 umbrella: Analytics and AI layer execution`

### Labels
- `Phase 3`

### Description
Source: `docs/expense-tracker-prd.md` (Phase 3: Analytics and AI Layer)

Design references

- `stitch-dashboard-html/analytics-expense-focus.html`
- `stitch-dashboard-html/dashboard-with-spending-alerts.html`
- `stitch-dashboard-html/updated-dashboard-with-annotations.html`
- `stitch-dashboard-html/transaction-history.html`
- Corresponding screenshots in `stitch-dashboard-html/images/`

Purpose

- Track the full Phase 3 deliverable for analytics, insight generation, deep analysis, and savings recommendations on top of the shared household ledger built in earlier phases.
- Ensure all product-surface work uses the existing Stitch HTML and screenshot references rather than inventing new layouts ad hoc.

Success criteria

- The app shows trend charts, category allocation, and drill-down analytics grounded in real household ledger data.
- Dashboard surfaces expose actionable insight cards and trend indicators in a way that matches the Stitch direction.
- AI-generated savings recommendations and anomaly-style insights are specific, reviewable, and tied to visible transaction context.
- Deep analysis can generate a richer report than the inline dashboard/analytics cards.
- Analytics and AI outputs keep shared-household trust: they should explain what changed, why it matters, and where the recommendation came from.
- Mobile analytics surfaces are built from the Stitch HTML/screenshots for analytics, dashboard alerts, and transaction history.

Execution model

- Child issues own implementation by phase bundle.
- Each child issue must implement with `tdd-guide` assumed during development, complete a thorough code review, and then simplify the code before raising a PR.
- This umbrella issue should only be closed once all child issues are complete and the Phase 3 success criteria are met.

Child issue set

- Phase 3A: Analytics data model and aggregation layer
- Phase 3B: Insight generation and savings recommendation engine
- Phase 3C: Dashboard insight cards and AI entry points from Stitch designs
- Phase 3D: Analytics tab and drill-down flows from Stitch designs
- Phase 3E: Deep analysis report generation and experience
- Phase 3F: Cross-cutting verification and release hardening

## Child Issues

### Phase 3A

#### Title
`Phase 3A: Analytics data model and aggregation layer`

#### Labels
- `Backend`
- `Phase 3`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 3: Analytics and AI Layer)

Scope

- Add the backend analytics foundation for trend series, category allocation, spend by person, spend by payment source, recurring-charge detection inputs, and period-over-period comparisons.
- Add storage or projections for AI insight/report outputs where needed so recommendations and reports are auditable.
- Expose household-scoped analytics read models that the dashboard, analytics tab, and deep-report surfaces can consume without duplicating aggregation logic in the client.

Execution order

1. Implement the scoped work with `tdd-guide` assumed during development.
2. Complete the relevant tests and get them passing.
3. Run `code-reviewer`, address all critical/high findings, and verify the aggregation model is correct and trustworthy.
4. Simplify the code before raising a PR: remove avoidable complexity, keep projections and interfaces explicit, and avoid duplicate aggregation paths.

Definition of done

- Analytics data for trends, allocations, and source/person breakdowns is available from server-owned paths.
- The design supports auditable insight/report outputs instead of opaque one-off calculations in the UI.
- Household scoping and consistency with the existing ledger are preserved.
- Relevant tests pass.
- Code has been simplified before PR.
- Review has been completed and findings addressed.

### Phase 3B

#### Title
`Phase 3B: Insight generation and savings recommendation engine`

#### Labels
- `Backend`
- `Phase 3`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 3: Analytics and AI Layer)

Scope

- Implement the insight-generation pipeline for overspending changes, savings opportunities, duplicate or unnecessary subscriptions, unusual merchant behavior, and category-pattern suggestions.
- Add recommendation outputs with rationale and estimated impact where possible.
- Support both inline-card insights and richer deep-analysis report generation paths using the same explainable core signals.
- Reuse deterministic signals before LLM-only reasoning where possible so outputs remain stable and explainable.

Execution order

1. Implement the scoped work with `tdd-guide` assumed during development.
2. Complete the relevant tests and get them passing.
3. Run `code-reviewer`, address all critical/high findings, and verify the recommendation logic is explainable and defensible.
4. Simplify the code before raising a PR: remove avoidable complexity, keep heuristics and AI orchestration separated cleanly, and make provenance easy to inspect.

Definition of done

- Insight cards and savings recommendations can be generated from real household spend patterns.
- Recommendations include clear rationale and estimated impact where possible.
- Inline insights and deep-analysis generation share coherent underlying logic.
- Relevant tests pass.
- Code has been simplified before PR.
- Review has been completed and findings addressed.

### Phase 3C

#### Title
`Phase 3C: Dashboard insight cards and AI entry points from Stitch designs`

#### Labels
- `Mobile`
- `Backend`
- `Phase 3`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 3: Analytics and AI Layer)

Required design references

- `stitch-dashboard-html/dashboard-with-spending-alerts.html`
- `stitch-dashboard-html/updated-dashboard-with-annotations.html`
- `stitch-dashboard-html/images/dashboard-with-spending-alerts.png`
- `stitch-dashboard-html/images/updated-dashboard-with-annotations.png`

Scope

- Extend the dashboard with trend-aware spend presentation, actionable AI insight cards, alerts, and entry points into deeper analytics/report views.
- Preserve the existing product language while matching the Stitch dashboard layouts and hierarchy.
- Show recommendation context, estimated impact, and clear navigation into the relevant transaction or analytics drill-downs.

Execution order

1. Implement the scoped work with `tdd-guide` assumed during development.
2. Complete the relevant tests and get them passing.
3. Run `code-reviewer`, address all critical/high findings, and verify the dashboard keeps AI outputs high-trust and understandable.
4. Simplify the code before raising a PR: remove avoidable UI/state complexity, keep view-model boundaries explicit, and preserve design fidelity.

Definition of done

- Dashboard insight cards and trend indicators are implemented from the referenced Stitch HTML/screenshots.
- Users can see actionable recommendations and navigate into more detailed analytics or transaction context.
- The dashboard does not invent a new visual language separate from the Stitch references.
- Relevant tests pass.
- Code has been simplified before PR.
- Review has been completed and findings addressed.

### Phase 3D

#### Title
`Phase 3D: Analytics tab and drill-down flows from Stitch designs`

#### Labels
- `Mobile`
- `Backend`
- `Phase 3`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 3: Analytics and AI Layer)

Required design references

- `stitch-dashboard-html/analytics-expense-focus.html`
- `stitch-dashboard-html/transaction-history.html`
- `stitch-dashboard-html/dashboard-refined-transaction-list.html`
- `stitch-dashboard-html/images/analytics-expense-focus.png`
- `stitch-dashboard-html/images/transaction-history.png`
- `stitch-dashboard-html/images/dashboard-refined-transaction-list.png`

Scope

- Build the Analytics tab with trend charts, weekly/monthly/yearly filters, category allocation, spend-by-dimension views, and savings-oriented analysis cards.
- Support drill-down from analytics cards/charts into filtered transaction views.
- Keep the transactions drill-down experience aligned with the Stitch transaction-history and refined transaction-list references.

Execution order

1. Implement the scoped work with `tdd-guide` assumed during development.
2. Complete the relevant tests and get them passing.
3. Run `code-reviewer`, address all critical/high findings, and verify the analytics UX stays faithful to the Stitch direction and data semantics.
4. Simplify the code before raising a PR: remove avoidable chart/state complexity, keep filter logic explicit, and preserve design fidelity.

Definition of done

- The Analytics tab is implemented from the referenced Stitch HTML/screenshots.
- Users can filter by period and drill from analytics into relevant transaction subsets.
- Category allocation, trend, and breakdown views are backed by real data.
- Relevant tests pass.
- Code has been simplified before PR.
- Review has been completed and findings addressed.

### Phase 3E

#### Title
`Phase 3E: Deep analysis report generation and experience`

#### Labels
- `Mobile`
- `Backend`
- `Phase 3`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 3: Analytics and AI Layer)

Required design direction

- Use the analytics and transaction Stitch references as the visual and interaction baseline.
- Do not invent a disconnected report UI; keep the report experience visually consistent with `analytics-expense-focus.html`, `transaction-history.html`, and their screenshots.

Scope

- Implement a richer deep-analysis report flow that expands beyond inline insight cards.
- Generate report sections for major spend shifts, savings opportunities, recurring-charge findings, unusual patterns, and recommended next actions.
- Support an in-app experience that connects the report back to analytics views and transaction drill-downs.

Execution order

1. Implement the scoped work with `tdd-guide` assumed during development.
2. Complete the relevant tests and get them passing.
3. Run `code-reviewer`, address all critical/high findings, and verify the report experience is specific, high-signal, and consistent with the product's trust model.
4. Simplify the code before raising a PR: reduce report-pipeline complexity, keep section composition explicit, and preserve visual consistency with the Stitch references.

Definition of done

- Deep analysis can generate a richer report than the inline dashboard or analytics cards.
- The report is tied back to clear supporting analytics and transaction context.
- The UI remains consistent with the referenced Stitch analytics/transaction design language.
- Relevant tests pass.
- Code has been simplified before PR.
- Review has been completed and findings addressed.

### Phase 3F

#### Title
`Phase 3F: Cross-cutting verification and release hardening`

#### Labels
- `Testing`
- `Phase 3`

#### Description
Source: `docs/expense-tracker-prd.md` (Phase 3: Analytics and AI Layer)

Scope

- Add unit, integration, and E2E coverage for analytics aggregation, recommendation generation, dashboard cards, analytics drill-downs, and deep-report flows.
- Consolidate verification gaps left by earlier Phase 3 tickets and harden the full analytics/report release path.
- Verify that implemented product surfaces stay aligned with the required Stitch HTML/screenshot references.

Intent

- This ticket is not a replacement for per-ticket TDD. Earlier implementation tickets still own their local tests.
- This ticket owns cross-cutting verification, suite stabilization, design-fidelity checks, and release readiness for the full Phase 3 path.

Execution order

1. Implement the scoped verification work.
2. Close coverage gaps across earlier Phase 3 tickets and stabilize the relevant suites.
3. Run `code-reviewer`, address all critical/high findings, and verify the release path and design fidelity are ready.
4. Simplify the verification harness before raising a PR where redundancy or brittleness has accumulated, without weakening coverage.

Definition of done

- Unit, integration, and E2E coverage exists for the highest-risk Phase 3 analytics and AI paths.
- Analytics calculations, insight generation, drill-down flows, and deep-report behavior are covered.
- Cross-cutting verification gaps from earlier Phase 3 tickets are closed.
- Design-fidelity checks against the referenced Stitch assets have been performed.
- Review has been completed and findings addressed.
- Code has been simplified before PR.
