# Credit Card Statement Workflow

This local n8n workflow is the Phase 1 credit card ingestion pipeline. It watches a Google Drive folder, looks up any password key without hardcoding secrets in the workflow, extracts statement text locally, calls the parser endpoint, retries the backend handoff, and leaves the raw PDF in Drive only.

## Required environment

Set these for the n8n instance:

- `DRIVE_FOLDER_ID`: Google Drive folder to watch.
- `STATEMENT_PIPELINE_SHARED_SECRET`: Shared secret sent to both backend endpoints in `x-statement-pipeline-secret`.
- `STATEMENT_PARSE_URL`: Supabase `statement-parse` function URL.
- `STATEMENT_INGEST_URL`: Supabase `statement-ingest` function URL.
- `STATEMENT_HOUSEHOLD_ID`: Default household UUID for statements in the watched folder.
- `STATEMENT_FILE_ROUTING_JSON`: JSON array of file-name routing rules.
- `PDF_TEXT_EXTRACT_COMMAND`: Local command that reads the downloaded PDF and prints extracted text. It must support password-backed PDFs.

## Local PDF extraction helper

This repo now includes a local helper at `infra/n8n/bin/extract-pdf-text.mjs`.

Set `PDF_TEXT_EXTRACT_COMMAND` to invoke it from the machine where n8n runs:

```bash
export PDF_TEXT_EXTRACT_COMMAND="node /absolute/path/to/repo/infra/n8n/bin/extract-pdf-text.mjs"
```

The helper keeps the CLI surface narrow:

- It reads the PDF from `stdin`.
- It accepts either raw PDF bytes or the base64 payload from n8n binary data.
- It accepts an optional `--password-key <key>`.
- It writes extracted plain text to `stdout`.
- It writes explicit operational failures to `stderr` and exits non-zero.

### Local machine requirements

Install these tools on the same machine that runs n8n:

- `pdftotext` from Poppler for text extraction.
- `qpdf` for unlocking password-protected PDFs without placing raw passwords on the process command line.
- `node` to run the helper script.

If `pdftotext` or `qpdf` are not on `PATH`, point the helper at them with:

- `PDFTOTEXT_BIN=/absolute/path/to/pdftotext`
- `QPDF_BIN=/absolute/path/to/qpdf`

### Statement routing

The workflow resolves routing from file-name rules instead of workflow placeholders:

```bash
export STATEMENT_HOUSEHOLD_ID='11111111-1111-4111-8111-111111111111'
export STATEMENT_FILE_ROUTING_JSON='[
  {
    "fileNamePattern": "hdfc.*regalia.*\\.pdf$",
    "parserProfileName": "hdfc-regalia-gold",
    "bankName": "HDFC Bank",
    "cardName": "Regalia Gold",
    "statementPasswordKey": "cards/hdfc-regalia"
  }
]'
```

Each rule can override `householdId` if one watched folder needs to route to different households, but the default Phase 1 path should keep one shared household and use `STATEMENT_HOUSEHOLD_ID`.

### Password-key lookup

The helper resolves the raw password locally by converting the password key into an environment variable name:

- Password key: `cards/hdfc-regalia`
- Local secret env var: `STATEMENT_PDF_PASSWORD__CARDS_HDFC_REGALIA`

Example:

```bash
export STATEMENT_PDF_PASSWORD__CARDS_HDFC_REGALIA='replace-with-the-actual-password'
```

This keeps raw passwords out of:

- workflow JSON
- n8n execution item data
- parser requests

### Local smoke test

You can verify the helper outside n8n with:

```bash
cat statement.pdf | node infra/n8n/bin/extract-pdf-text.mjs --password-key cards/hdfc-regalia
```

If the statement is not password-protected, omit `--password-key`.

Set these for Supabase edge functions:

- `STATEMENT_PIPELINE_SHARED_SECRET`: Same shared secret used by n8n.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VERCEL_AI_GATEWAY_API_KEY`
- `STATEMENT_PARSE_MODEL` optionally overrides the parser model.
- `PHASE1_ALERT_CHANNELS`: Comma-separated alert channels to deliver during Phase 1. The current repo implementation supports `push` and defaults to `push`.
- `PHASE1_ALERT_FCM_PROJECT_ID`: Firebase project ID used for Android push delivery.
- `PHASE1_ALERT_FCM_SERVICE_ACCOUNT_JSON`: Full Firebase service account JSON used to mint an OAuth access token for FCM HTTP v1.
- `PHASE1_ALERT_PUSH_TOPIC_PREFIX`: Optional topic prefix for per-user subscriptions. Defaults to `phase1-user`.
- `PHASE1_ALERT_TIMEOUT_MS`: Optional per-request timeout for Google OAuth and FCM calls. Defaults to `5000`.

## Workflow shape

1. `Google Drive Trigger` watches the configured folder.
2. `Resolve Statement Routing` derives `householdId`, `parserProfileName`, `providerFileId`, `providerFileName`, optional bank/card labels, and an optional `statementPasswordKey`.
3. `Download PDF` fetches the file from Drive to local disk or an n8n binary property.
4. `Extract Statement Text` runs `PDF_TEXT_EXTRACT_COMMAND --password-key <key>` so the local helper resolves the actual secret without storing it in workflow execution data.
5. `Call statement-parse` posts statement metadata plus extracted text to Supabase. The password key remains local to the extraction/ingest path and is not forwarded to the parser request.
6. `Retry Ingest` sends the normalized payload to `statement-ingest` with retries and backoff.
7. `Handle Failure` records sync failure details in the execution log and triggers a visible alert path.

## Alert delivery behavior

- `statement-parse` sends a Phase 1 alert when parser execution fails after the request payload has been validated.
- `statement-ingest` sends a Phase 1 alert when the ingest persistence step fails and when a successful ingest still leaves rows in the review queue.
- Delivery is scheduled in the edge runtime background path when available so successful ingest responses do not block on push transport.
- Each alert is inserted into `public.notifications` with `status = 'queued'`, then finalized to `sent` or `failed` after delivery attempts complete.
- Delivery is attempted up to 3 times inside the alert worker path.
- Successful delivery updates the existing notification row to `status = 'sent'` and fills `sent_at`.
- Exhausted delivery attempts update the row to `status = 'failed'`.
- If `PHASE1_ALERT_CHANNELS` includes `push` but the FCM provider env is missing, notification rows are still created and immediately marked `failed` with a configuration error in `payload.delivery.lastError`.
- Unsupported values in `PHASE1_ALERT_CHANNELS` are ignored. If no supported value remains, the runtime falls back to `push`.
- Invalid `PHASE1_ALERT_FCM_SERVICE_ACCOUNT_JSON` disables push delivery but does not take the edge functions down.
- If transport starts but the final `sent` or `failed` write cannot be persisted, the row stays `queued` with `payload.delivery.finalizationRequired = true` and the latest attempt metadata. Treat that as an observable reconciliation state rather than a never-attempted alert.
- Delivery attempt count, last error, provider, and target topic are stored in the notification `payload.delivery` object so the state remains observable without a separate retry table.

## Android push subscription contract

- The Phase 1 delivery path uses FCM HTTP v1 with one topic per authenticated user.
- Mobile clients should subscribe each signed-in Android device to `PHASE1_ALERT_PUSH_TOPIC_PREFIX + "-" + <supabase-user-id>`.
- Because notification rows remain per-recipient in `public.notifications`, user-visible state stays aligned with the topic-based push delivery path even though the transport target is a topic.

## Retry policy

- Parser call: fail fast after one attempt. The parser should not be retried blindly if the extracted text is malformed.
- Ingest call: retry 3 times with exponential backoff because this is the stable backend handoff step.
- If ingest still fails, keep the execution failed so the operator can replay it after the backend is healthy.

## Payload contracts

`statement-parse` request:

```json
{
  "statement": {
    "householdId": "uuid",
    "providerFileId": "drive-file-id",
    "providerFileName": "statement.pdf",
    "parserProfileName": "hdfc-regalia-gold",
    "bankName": "HDFC Bank",
    "cardName": "Regalia Gold"
  },
  "document": {
    "extractedText": "plain text extracted from the PDF"
  }
}
```

`statement-ingest` request:

```json
{
  "statement": {
    "householdId": "uuid",
    "providerFileId": "drive-file-id",
    "providerFileName": "statement.pdf",
    "parserProfileName": "hdfc-regalia-gold",
    "statementPasswordKey": "cards/hdfc-regalia"
  },
  "rows": [
    {
      "merchant": "Swiggy",
      "amount": "1234.50",
      "transactionDate": "2026-04-12",
      "confidence": 0.91
    }
  ]
}
```

## Operational notes

- Raw PDFs stay in Drive. n8n should send only metadata plus extracted text to the parser, and only metadata plus normalized rows to ingest.
- Passwords are resolved by the local extraction helper from a secret key. The raw password should never be placed in workflow JSON, item data, or sent to the parser endpoint.
- Password-protected extraction depends on local `qpdf` plus `pdftotext`. Missing tools, missing password-key env vars, wrong passwords, and empty extracted text all fail with explicit helper errors.
- Unsupported credits, reversals, or refunds are skipped by normalization and recorded in statement metadata.
- Low-confidence rows are persisted with `needs_review = true` so they remain visible in totals and review flows.
- The shared secret is required on both endpoints. Do not inline secrets directly into node parameters when n8n credentials or environment variables can hold them.
- The repo now includes example env files plus validation and smoke-test commands:
  - `npm run phase-1:validate-runtime`
  - `npm run phase-1:validate-live -- --mode mock`
  - `npm run phase-1:smoke`
