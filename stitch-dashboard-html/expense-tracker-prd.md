# PRD: AI-Powered Family Expense Tracker

## Status
Draft v0.1 based on:
- `.codex/agents/planner.md`
- `stitch-dashboard-html/dashboard-with-spending-alerts.html`
- `stitch-dashboard-html/updated-dashboard-with-annotations.html`
- `stitch-dashboard-html/transaction-history.html`
- `stitch-dashboard-html/analytics-expense-focus.html`
- Corresponding Stitch screenshots in `stitch-dashboard-html/images/`

## Overview
Build a native mobile expense tracking app for a household, optimized for India-first payment behavior. The product should combine automated credit card statement ingestion, WhatsApp-triggered UPI capture, LLM-assisted categorization, and proactive savings insights for expenses only.

The Stitch concepts suggest a product with four primary surfaces: Dashboard, Analytics, Transactions, and Settings. The app should feel like a high-trust personal finance assistant rather than a raw ledger.

## Problem Statement
Household spending data is fragmented across credit card statements, UPI payments, and ad hoc memory. Manual entry is inconsistent, category classification is tedious, and most finance apps stop at reporting instead of helping users change behavior.

The product should solve three things well:
- Capture spend with low manual effort.
- Classify transactions accurately enough to be trusted.
- Produce useful, actionable insights on where the household can save.

## Product Vision
Create a shared household finance assistant that automatically consolidates card and UPI expenses, explains spending patterns in plain language, and nudges the user toward better monthly decisions.

## Target Users
- Primary user: household decision-maker managing monthly spend.
- Secondary user: spouse/partner contributing expenses and validating classifications.

## Goals
- Consolidate household spending from credit card statements and UPI messages into one ledger.
- Auto-classify transactions with an LLM plus deterministic rules.
- Show clear trends, category breakdowns, alerts, and recent activity.
- Generate proactive savings suggestions, anomaly detection, and recurring charge insights.
- Remind users to upload missing statements so data stays current.

## Non-Goals
- Direct bank account aggregation in v1.
- Income tracking, refunds, transfers, and credit card bill payment tracking in v1.
- Tax filing or full accounting workflows.
- Investment execution or automated money movement.
- Support for large multi-family or SMB bookkeeping use cases.

## Product Principles
- Automation first, manual correction second.
- Shared household visibility with clear attribution to each person.
- Every AI classification must be explainable or reviewable.
- Insights must be specific enough to act on, not generic summaries.
- Missing data should be visible; the app should not imply false completeness.

## Assumptions
- Users are in India and transact primarily in INR.
- Credit card statements are uploaded to a Google Drive folder.
- n8n is the orchestration layer for statement ingestion and notifications.
- UPI capture starts from a WhatsApp group used by the user and spouse.
- The first supported household size is two adults.
- The first client experience is a native mobile app, based on the Stitch layouts.

## UX Direction From Stitch

### Dashboard
Derived from `dashboard-with-spending-alerts.html` and `updated-dashboard-with-annotations.html`.
- Hero card for current month spend with trend indicator.
- Integration status chips for WhatsApp tracking and Drive sync freshness.
- Spending alert cards for parse issues, recurring charges, and data freshness.
- Statement sync CTA for Drive instructions and sync status, not in-app upload.
- Recent activity list with source tags, owner tags, and transaction status.

### Transactions
Derived from `transaction-history.html`.
- Search by vendor.
- Filter by category and period.
- Group transactions by relative date buckets.
- Show transaction owner, payment source, amount, and processing state.
- Highlight flagged or low-confidence entries.

### Analytics
Derived from `analytics-expense-focus.html`.
- Monthly trend graph with weekly/monthly/yearly filters.
- Category allocation breakdown.
- LLM analysis cards for savings opportunities, subscription leaks, and optimization ideas.
- Deep analysis CTA for a richer monthly or on-demand report.

### Navigation
Bottom nav should support at least Dashboard, Analytics, Transactions, and Settings.

## User Stories
- As a user, I want my card statement transactions to appear automatically after I upload a PDF to Drive.
- As a user, I want reminders when a statement has not been uploaded for the current cycle.
- As a user, I want to log UPI expenses via WhatsApp without opening another app.
- As a user, I want transactions auto-categorized so I do not manually tag everything.
- As a user, I want to correct a wrong category and have the system learn from it.
- As a user, I want to see how much my household spent this month by category and by person.
- As a user, I want the app to tell me where I can realistically save money.
- As a user, I want suspicious, duplicate, or unclear transactions flagged for review.

## Functional Requirements

### 1. Household Accounts and Attribution
- Support one shared household workspace.
- Support at least two members: user and spouse.
- Every transaction must store owner attribution: `me`, `wife`, `shared`, or `unknown`.
- Users must be able to correct ownership after ingestion.

### 2. Transaction Sources
- Source types: `credit_card_statement`, `upi_whatsapp`, `manual_entry`, `system_adjustment`.
- Every transaction must retain source metadata and ingestion timestamp.
- Transactions should expose processing states such as `processed`, `flagged`, `needs_review`, and `failed`.
- The ledger should store expenses only.

### 3. Credit Card Statement Ingestion via Drive + n8n
- User uploads a statement PDF into a designated Google Drive folder.
- n8n detects the new file, extracts text, parses transactions, and sends structured data into the app backend.
- Users should be able to configure supported card/bank statement profiles in Settings.
- If statement PDFs require passwords, password handling must be managed in n8n credentials or environment-backed secrets, not hardcoded directly into workflow logic.
- The system should support duplicate detection by statement period, transaction fingerprint, and source file ID.
- The app should store statement metadata: bank, card, billing period, upload time, parse status, parse confidence.
- If parsing fails or confidence is low, the user should receive a notification and a review task.
- The ingestion flow must be fail-safe: unsupported formats, malformed statements, or low-confidence parses must not auto-post final transactions without review.
- The dashboard should show the last successful Drive sync time.
- The native app should not upload statements directly; it should show Drive setup instructions, sync health, and review outcomes.

### 4. Statement Upload Reminders
- The system should remind the user to upload statements when an expected cycle is missing.
- Reminder cadence should be configurable.
- Notifications should include which card statement is missing and the latest expected billing period.
- The reminder should stop automatically when the statement is ingested successfully.

### 5. UPI Tracking via WhatsApp Group
- A shared WhatsApp group acts as the capture surface for UPI expenses.
- Messages in the group should trigger a workflow that creates or updates transaction candidates.
- The first version may accept free-form messages, with AI responsible for extracting amount, merchant, payer, and note.
- The system should use an LLM to infer category and normalize merchant names.
- The app must clearly indicate parse confidence and parsing errors when the AI is uncertain or detects conflicting information.
- Low-confidence parses should create review items instead of silently posting a final transaction.
- The system should prefer the lowest-cost viable WhatsApp integration path, with the exact connector still to be finalized.

### 6. LLM Classification and Feedback Loop
- The app should classify transactions into a controlled category taxonomy.
- Classification should use a hybrid approach:
  - Rules for known merchants, recurring payments, and exact matches.
  - LLM inference for uncategorized or ambiguous transactions.
  - User corrections to improve future predictions.
- Every classification should store confidence, rationale, and classification method.
- Users must be able to reclassify a transaction manually.
- The system should prefer deterministic re-use of past accepted classifications before calling the LLM.

### 7. Alerts
- The app should support recurring bill alerts for known subscriptions or upcoming renewals.
- The app should alert on missing statements, parsing failures, low-confidence reviews, and noteworthy AI insights.

### 8. Analytics and Reporting
- Show month-to-date spend, month-over-month change, and category distribution.
- Support weekly, monthly, and yearly time filters.
- Support drill-down from dashboard cards to filtered transaction views.
- Analytics should include:
  - spend by category
  - spend by person
  - spend by payment source
  - recurring charges
  - unusual or one-off spikes
  - trend comparison versus prior periods

### 9. AI Insights
- Generate plain-language insights from recent and historical spend.
- Insight types should include:
  - overspending relative to prior periods
  - potential savings opportunities
  - duplicate or unnecessary subscriptions
  - unusual merchant behavior
  - category patterns and habit suggestions
- Each insight should include a recommendation and an estimated impact where possible.
- Deep analysis mode should generate a richer report than the inline dashboard cards.

### 10. Transaction Review and Auditability
- Flagged items should be visible in a review queue.
- Users should be able to confirm, edit, merge duplicates, or dismiss flags.
- The app should preserve an audit trail of ingestion, classification, and manual corrections.

### 11. Notifications
- Notification types should include:
  - missing statement reminder
  - statement parsed successfully
  - statement parse failure
  - high-confidence savings insight
  - low-confidence transaction review request
- Delivery channels for v1 are push and email.

### 12. Settings and Controls
- Manage category taxonomy.
- Manage notification preferences.
- Manage connected sources and workflow health indicators.
- Manage supported card/bank statement parser profiles and default review behavior.
- Allow users to edit merchant mappings and classification rules.

## Data Model Draft

### Core entities
- `households`
- `household_members`
- `transactions`
- `transaction_sources`
- `statement_uploads`
- `statement_parser_profiles`
- `categories`
- `merchant_aliases`
- `classification_events`
- `insights`
- `notifications`
- `review_tasks`

### Key transaction fields
- transaction ID
- household ID
- owner/member
- source type
- source reference
- merchant raw name
- merchant normalized name
- amount
- currency
- transaction date
- posting date
- category
- subcategory
- notes
- status
- confidence score
- classification method
- statement ID or WhatsApp message reference

## Key Workflows

### Workflow A: Credit Card Statement
1. User uploads PDF to Drive folder.
2. n8n detects new file.
3. System matches the statement against a configured parser profile.
4. If needed, n8n retrieves the statement password from secrets-backed configuration.
5. Statement text is extracted and parsed.
6. Parsed transactions are deduplicated and stored.
7. Rules and LLM classify categories.
8. Low-confidence, unsupported, or malformed rows are flagged and held for review.
9. User receives success or failure notification.
10. Dashboard and analytics refresh.

### Workflow B: UPI via WhatsApp
1. User or spouse posts a message in the shared WhatsApp group.
2. Workflow receives message payload.
3. AI parser extracts amount, merchant, payer, note, and date.
4. Classification engine assigns category and owner.
5. If confidence is high, transaction is posted automatically.
6. If confidence is low or fields conflict, a review task is created and user is notified with the detected parsing issue.

### Workflow C: Monthly Insight Generation
1. User opens analytics or requests deep analysis.
2. System aggregates recent and historical spend.
3. Rule engine and LLM generate candidate insights.
4. App shows concise insight cards plus estimated savings impact.
5. User can drill into the underlying transactions.

## Requirements by Screen

### Dashboard
- Month-to-date spend hero card.
- Trend delta vs prior month.
- Integration status chips.
- Spending alerts block.
- Statement sync status and setup CTA.
- Recent activity list.

### Transactions
- Search.
- Category filter.
- Period filter.
- Date-grouped transaction cards or rows.
- Status badges.
- Source and owner tags.
- Entry detail view with correction actions.

### Analytics
- Time filter toggle.
- Spend trend chart.
- Category allocation visualization.
- AI insight cards.
- Deep analysis trigger.

### Settings
- Household members.
- Categories.
- Notification preferences.
- Source integration health.
- Merchant mapping rules.

## Success Metrics
- At least 80% of imported transactions are auto-classified without manual intervention.
- At least 90% of auto-classified transactions are accepted without correction after the feedback loop matures.
- Statement upload compliance improves month over month.
- Users review flagged items within 48 hours on average.
- Users receive at least one actionable savings insight per month.
- Users can explain monthly spend by category and by person without leaving the app.

## Risks and Mitigations
- **Risk:** Statement PDFs vary significantly by bank and format.
  - Mitigation: use configurable parser profiles, explicit parse confidence, and fail-closed review behavior for unsupported or low-confidence statements.
- **Risk:** WhatsApp automation may be constrained by API or webhook limitations.
  - Mitigation: define the exact WhatsApp integration path before build; keep a fallback capture method.
- **Risk:** LLM classification may hallucinate categories or overfit ambiguous merchants.
  - Mitigation: combine rules, confidence thresholds, and mandatory review for low-confidence cases.
- **Risk:** Missing uploads can make analytics misleading.
  - Mitigation: show data freshness and missing-source warnings prominently.
- **Risk:** Personal finance data is sensitive.
  - Mitigation: apply strict access control, encryption, audit logs, and minimal data retention.

## Delivery Phases

### Phase 1: Core Ledger MVP
- Shared household workspace
- Manual transaction model
- Statement upload records
- Dashboard shell
- Transactions list
- Basic alerts

### Phase 2: Credit Card Automation
- Drive folder ingestion via n8n
- Statement parsing for first supported card formats
- Deduplication
- Classification engine v1
- Sync status and reminder notifications

### Phase 3: UPI Capture
- WhatsApp-triggered ingestion
- Message parsing
- Owner attribution
- Review queue for ambiguous UPI captures

### Phase 4: Analytics and AI Layer
- Trend charts
- Category allocation
- Insight cards
- Deep analysis report
- Savings recommendation engine

### Phase 5: Learning and Trust
- User correction feedback loop
- Merchant alias memory
- Improved confidence scoring
- Better recurring charge detection

## Confirmed Decisions
1. The first release will be a native mobile app.
2. Exact default card/bank parser profiles for first launch are unspecified; product should allow setup in Settings and fail closed on unsupported formats.
3. Statement uploads will happen in Drive, not in the app.
4. If statement PDFs require passwords, password handling should use n8n secrets-backed configuration rather than hardcoded workflow logic.
5. WhatsApp capture should rely on AI parsing of free-form messages, with explicit error surfacing when parsing is uncertain.
6. The app should store expenses only.
7. Budgets are excluded from v1.
8. Notification channels for v1 are push and email.

## Remaining Open Questions
1. What category taxonomy do you want at launch?
2. Are AI insights advisory only, or should they also create tasks and reminders automatically?
3. Do you want account-level privacy controls between you and your wife, or full shared visibility?
4. What level of data privacy, hosting, and retention constraints should the system assume?
5. What exact WhatsApp connector is acceptable if the easiest free path is unofficial or less reliable?

## Immediate Recommendation
Lock v1 around one household, one Drive folder, configurable statement parser profiles with strict review fallback, a constrained category taxonomy, and AI-parsed WhatsApp capture with explicit review states. That will keep ingestion quality high enough for the analytics and AI layer to be trusted.
