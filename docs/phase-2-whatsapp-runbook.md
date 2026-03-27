# Phase 2 WhatsApp Integration Runbook

## Purpose
This document defines the target runtime contract for the Phase 2 WhatsApp ingestion path. It exists to keep the implementation, Meta configuration, and operational checks aligned while the feature is being built. The final implementation should refine this runbook rather than replace it with ad hoc notes.

## Runtime Boundary
1. An approved household participant sends a direct WhatsApp message to the Meta test number.
2. Meta delivers the inbound event to the public webhook endpoint.
3. The webhook verifies the request, normalizes the payload, and persists the inbound message idempotently.
4. The parsing pipeline extracts transaction fields and decides whether to auto-post or create a review-required item.
5. The app reflects the result in dashboard, transactions, settings, and notifications.
6. If configured and allowed, the system sends a short WhatsApp acknowledgement back within the active reply window.

## Required External Assets
- A Meta app with WhatsApp Cloud API enabled
- A Meta test phone number for inbound direct-message capture
- A webhook callback URL reachable from Meta
- A webhook verify token
- A signing secret or app-secret-based verification path for POST payload validation
- A WhatsApp access token for optional outbound acknowledgements

## Required Application Configuration
- Meta webhook verification token
- Meta app secret or equivalent signature-validation secret
- WhatsApp access token for outbound replies, if acknowledgements are enabled
- Phone number ID or sender identifier for outbound replies
- LLM gateway credentials for message parsing/classification
- Push/email notification configuration for non-WhatsApp alerts
- Household-level approved participant records in the database

## Data Expectations
- Every inbound message should have a stable provider message ID persisted before downstream processing continues.
- Every persisted message should be linked to a household participant record or marked as unapproved.
- Every resulting transaction should keep source linkage back to the inbound message reference.
- Every parse decision should preserve confidence, rationale, and any validation failure details needed for review.

## Operational Rules
- Only approved household participants should be allowed to create household-linked UPI records.
- Unapproved senders should be logged and rejected without creating trusted transactions.
- Duplicate webhook deliveries must be no-ops after the first accepted message record.
- Optional WhatsApp replies must stay disabled when tokens or reply-window guarantees are missing.
- Push/email remain the primary notification channels even when WhatsApp acknowledgements are enabled.

## Setup Checklist
1. Register the public webhook endpoint with Meta and complete the verification challenge flow.
2. Configure request-signature validation for inbound POST deliveries.
3. Store the required Meta secrets and tokens in server-side environment configuration.
4. Seed or create the approved participant records for the household phone numbers allowed to send UPI messages.
5. Validate the inbound happy path with a test message from an approved participant.
6. Validate the rejection path with an unapproved sender.
7. Validate the ambiguous-parse path to confirm review-required items are created instead of auto-posted.
8. If acknowledgements are enabled, validate success and review-needed responses inside the allowed reply window.

## Failure Modes To Monitor
- Webhook verification failure
- Signature-validation failure
- Duplicate provider message delivery
- Unapproved participant rejection
- Parser extraction failure
- Low-confidence parse routed to review
- Transaction persistence failure
- Notification delivery failure
- Outbound WhatsApp acknowledgement failure

## Completion Criteria
- The webhook path is externally reachable and verified by Meta.
- Approved participant management is documented and repeatable.
- The team can validate happy-path, rejection, and review-path flows from documented steps.
- Operators can identify where a failure occurred: webhook boundary, parsing, posting, review creation, or reply delivery.
