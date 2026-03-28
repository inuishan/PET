# Phase 2 WhatsApp Runtime Runbook

This runbook turns the checked-in Phase 2 WhatsApp code into a reproducible runtime path. It covers Meta setup, Supabase function configuration, participant approval, safe acknowledgement behavior, and the validation order for replay-based smoke checks plus real Meta test-number confirmation.

## Files to fill in

Copy and edit:

- `supabase/.env.functions.phase2.example`

Phase 2 currently ships one function-side runtime contract file. Keep the deployed secrets aligned with that file so local validation and hosted behavior match.

The same file now also supports optional live-validation defaults:

- `PHASE2_VALIDATION_HOUSEHOLD_ID`
- `PHASE2_VALIDATION_APPROVED_PHONE_E164`
- `PHASE2_VALIDATION_APPROVED_DISPLAY_NAME`
- `PHASE2_VALIDATION_APPROVED_MEMBER_ID`
- `PHASE2_VALIDATION_REJECTED_PHONE_E164`
- `PHASE2_VALIDATION_OWNER_ACCESS_TOKEN`

## Runtime shape

The runtime chain is:

1. An approved participant sends a direct WhatsApp message to the Meta test number.
2. Meta delivers the webhook to `whatsapp-webhook`.
3. `whatsapp-webhook` verifies the challenge or signature, persists the message, and hands off to `whatsapp-parse`.
4. `whatsapp-parse` loads the participant and message, extracts the expense fields, and hands off to `whatsapp-ingest`.
5. `whatsapp-ingest` posts a transaction or creates a review-required outcome, while push notifications remain the primary household alert path.
6. If the acknowledgement function is configured and the reply window is still open, `whatsapp-ingest` hands off to `whatsapp-reply` for a short status message.

If any acknowledgement configuration is absent, the reply step is skipped safely and the primary ingest path still completes.

## Required function configuration

Set these values for the deployed Phase 2 functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET`
- `WHATSAPP_INTERNAL_AUTH_TOKEN`
- `WHATSAPP_PARSE_FUNCTION_URL`
- `WHATSAPP_PARSE_TIMEOUT_MS`
- `WHATSAPP_INGEST_FUNCTION_URL`
- `WHATSAPP_INGEST_TIMEOUT_MS`
- `WHATSAPP_REPLY_FUNCTION_URL`
- `WHATSAPP_REPLY_TIMEOUT_MS`
- `WHATSAPP_ACK_ENABLED`
- `WHATSAPP_ACK_REPLY_WINDOW_MS`
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_GRAPH_API_BASE_URL`

Behavior notes:

- `WHATSAPP_ACK_ENABLED` should stay `false` until the rest of the WhatsApp runtime is verified.
- If `WHATSAPP_ACK_ENABLED=false`, or if the reply function has no access token, acknowledgements remain disabled without blocking webhook, parse, or ingest.
- `META_GRAPH_API_BASE_URL` should be pinned to the Graph API version you have tested against.
- `WHATSAPP_INTERNAL_AUTH_TOKEN` must be a dedicated shared secret for the internal function-to-function calls. Do not reuse `SUPABASE_SERVICE_ROLE_KEY`.

Deploy all four functions with those secrets available:

```bash
supabase functions deploy whatsapp-webhook
supabase functions deploy whatsapp-parse
supabase functions deploy whatsapp-ingest
supabase functions deploy whatsapp-reply
```

Apply the database migrations before testing:

```bash
supabase db push
```

Validate the env file before deploying:

```bash
npm run phase-2:validate-runtime
```

## Meta setup

Configure the Meta app and WhatsApp test number in this order:

1. Enable WhatsApp Cloud API on the Meta app.
2. Copy the temporary test number that will receive direct messages.
3. Set the webhook callback URL to the deployed `whatsapp-webhook` endpoint.
4. Set the webhook verify token to the same value as `META_WEBHOOK_VERIFY_TOKEN`.
5. Subscribe the app to the `messages` webhook field.
6. Record the app secret in `META_APP_SECRET`.
7. If acknowledgements will be enabled, create or copy a server-side access token and store it as `META_WHATSAPP_ACCESS_TOKEN`.

The code uses the inbound webhook metadata `phone_number_id` for outbound acknowledgements. There is no separate sender phone-number secret to maintain.

## Approved participant setup

Only approved household participants can create household-linked WhatsApp expense rows. Approve senders before end-to-end testing.

Current database entrypoints:

- `public.approve_whatsapp_participant(uuid, text, text, uuid)`
- `public.revoke_whatsapp_participant(uuid, text)`

Example approval call from the Supabase SQL editor:

```sql
select public.approve_whatsapp_participant(
  '11111111-1111-4111-8111-111111111111',
  '+919999888877',
  'Ishan',
  '33333333-3333-4333-8333-333333333333'
);
```

Example revoke call:

```sql
select public.revoke_whatsapp_participant(
  '11111111-1111-4111-8111-111111111111',
  '+919999888877'
);
```

Rules:

- Use E.164 phone numbers only.
- Approve only numbers that belong to the target household.
- Revoke access instead of deleting rows so the audit trail stays intact.

## Validation order

Run validation in this order on the deployed runtime.

### 1. Setup validation

Confirm:

- migrations `0007_whatsapp_ingestion.sql` and `0008_whatsapp_rls.sql` are applied
- all four functions are deployed
- Meta webhook verification succeeds
- `whatsapp_participants` contains the approved sender
- `WHATSAPP_ACK_ENABLED=false` for the first pass

Recommended command:

```bash
npm run phase-2:validate-live -- --mode live --delivery webhook-replay
```

What the replay validator covers:

- webhook verification challenge against the deployed `whatsapp-webhook`
- approved-participant seeding through the owner RPC when `PHASE2_VALIDATION_OWNER_ACCESS_TOKEN` is present, otherwise a service-role upsert fallback
- happy-path, duplicate-delivery, rejection-path, review-path, and parse-failure replay against the deployed functions
- persisted acknowledgement state under `whatsapp_messages.parse_metadata.acknowledgement`

What still needs a real Meta-delivered message:

- proof that Meta is actually delivering the inbound webhook from the test number
- successful acknowledgement sends, because Meta only accepts reply context tied to a real inbound provider message id

### 2. Happy path

Send a message from an approved number:

```text
Paid 120 to Zepto for milk
```

Confirm:

- `whatsapp-webhook` returns success to Meta
- one `whatsapp_messages` row is created with the provider message id
- the message parse status reaches `posted`
- one `transactions` row is created with `source_type = 'upi_whatsapp'`
- the transaction has the expected amount, merchant, owner, and `source_reference`
- no duplicate rows appear if Meta retries the webhook
- `whatsapp_messages.parse_metadata.acknowledgement.status` is `disabled` while `WHATSAPP_ACK_ENABLED=false`

### 3. Rejection path

Send the same style of message from a number that has not been approved.

Confirm:

- the webhook is rejected with the participant-not-approved path
- no trusted transaction is created
- no new approved participant row is created implicitly

### 4. Review path

Send a message from an approved number that should remain ambiguous:

```text
Neha paid 850 to Uber yesterday
```

Confirm:

- one `whatsapp_messages` row is created
- the message parse status reaches `needs_review`
- one `transactions` row is created with `needs_review = true`
- the transaction metadata and review reason preserve the ambiguity
- push notifications are created for the household recipients

### 5. Parse-failure path

Send a message with no valid amount:

```text
Paid Zepto for milk
```

Confirm:

- the message parse status reaches `failed`
- no transaction row is created
- household notifications are created for manual follow-up
- `whatsapp_messages.parse_metadata.acknowledgement.status` remains `disabled` while acknowledgements are off

### 6. Acknowledgement validation

Only after the main runtime passes with acknowledgements disabled:

1. Set `WHATSAPP_ACK_ENABLED=true`.
2. Ensure `META_WHATSAPP_ACCESS_TOKEN` is present.
3. Keep `WHATSAPP_ACK_REPLY_WINDOW_MS` conservative. The default 24-hour value is the maximum supported by the current code path.
4. Repeat the happy-path and review-path tests with fresh inbound messages.

Confirm:

- posted outcomes send a short success acknowledgement
- review outcomes send a short review-needed acknowledgement
- parse-failure outcomes send a short failure acknowledgement
- `whatsapp_messages.parse_metadata.acknowledgement.status` becomes `sent` and stores the reply message id when Meta accepts the acknowledgement
- acknowledgements are skipped when the message is outside the configured reply window
- if the reply send fails, the original ingest result still persists correctly

## Safe failure behavior

This implementation is intentionally conservative:

- missing acknowledgement config disables replies instead of failing ingestion
- missing `phone_number_id`, recipient phone, or provider timestamp suppresses replies
- reply-window expiry suppresses replies
- reply failures do not roll back the stored message, transaction, or household notifications
- push remains the primary notification channel even when acknowledgements are enabled

## What to check when something breaks

### Webhook boundary

Look for:

- Meta verification challenge mismatch
- invalid `x-hub-signature-256`
- unsupported payload shape
- unapproved sender rejection

### Parse stage

Look for:

- message row exists but parse status stays `processing` or `failed`
- parser validation errors such as `missing_amount`
- participant linkage or owner attribution mismatches

### Ingest stage

Look for:

- transaction row missing for a parsed message
- transaction duplicated after repeated delivery
- review reasons missing for ambiguous messages
- household notifications missing on `needs_review` or `failed`

### Reply stage

Look for:

- `WHATSAPP_ACK_ENABLED` left `false`
- missing or expired `META_WHATSAPP_ACCESS_TOKEN`
- stale `META_GRAPH_API_BASE_URL`
- reply-window expiry
- acknowledgement send failures after a successful ingest
- missing or stale `parse_metadata.acknowledgement`

## Repo-level verification

Run the WhatsApp function tests before raising a PR:

```bash
node --experimental-strip-types --test \
  tests/functions/whatsapp-webhook.test.mjs \
  tests/functions/whatsapp-parse.test.mjs \
  tests/functions/whatsapp-ingest.test.mjs \
  tests/functions/whatsapp-reply.test.mjs
```

Run the dedicated Phase 2 validator before the final manual Meta pass:

```bash
npm run phase-2:validate-live -- --mode mock
npm run phase-2:validate-live -- --mode live --delivery webhook-replay
```
