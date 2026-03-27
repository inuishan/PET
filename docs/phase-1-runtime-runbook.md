# Phase 1 Runtime Runbook

This runbook turns the current Phase 1 code into a reproducible runtime path for one shared household, Google Drive statement ingestion, Supabase edge functions, and the mobile client.

## Files to fill in

Copy and edit these example files on the target machine:

- `apps/mobile/.env.phase1.example`
- `supabase/.env.functions.phase1.example`
- `infra/n8n/.env.phase1.example`

The repo treats them as the single source of truth for the Phase 1 runtime contract.

## Required runtime contract

### Mobile

Set:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

These are the only mobile env vars currently required by the checked-in app code.

### Supabase functions

Set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STATEMENT_PIPELINE_SHARED_SECRET`
- `VERCEL_AI_GATEWAY_API_KEY`
- `STATEMENT_PARSE_MODEL`
- `STATEMENT_PARSE_TIMEOUT_MS`
- `PHASE1_ALERT_CHANNELS`
- `PHASE1_ALERT_FCM_PROJECT_ID`
- `PHASE1_ALERT_FCM_SERVICE_ACCOUNT_JSON`
- `PHASE1_ALERT_PUSH_TOPIC_PREFIX`
- `PHASE1_ALERT_TIMEOUT_MS`

Deploy the two functions with those secrets available to the runtime:

```bash
supabase functions deploy statement-parse
supabase functions deploy statement-ingest
```

If you manage secrets through the Supabase CLI, keep the same values as the local example file:

```bash
supabase secrets set \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  STATEMENT_PIPELINE_SHARED_SECRET=... \
  VERCEL_AI_GATEWAY_API_KEY=... \
  PHASE1_ALERT_FCM_PROJECT_ID=... \
  PHASE1_ALERT_FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

Apply the database migrations before you test the flow:

```bash
supabase db push
```

### n8n

Set:

- `DRIVE_FOLDER_ID`
- `STATEMENT_PIPELINE_SHARED_SECRET`
- `STATEMENT_PARSE_URL`
- `STATEMENT_INGEST_URL`
- `STATEMENT_HOUSEHOLD_ID`
- `STATEMENT_FILE_ROUTING_JSON`
- one `STATEMENT_PDF_PASSWORD__...` variable for each `statementPasswordKey`
- `PDF_TEXT_EXTRACT_COMMAND`

`STATEMENT_FILE_ROUTING_JSON` replaces the workflow placeholders that previously required manual edits. Keep the default Phase 1 shape to one household and match card formats by file name:

```json
[
  {
    "fileNamePattern": "hdfc.*regalia.*\\.pdf$",
    "parserProfileName": "hdfc-regalia-gold",
    "bankName": "HDFC Bank",
    "cardName": "Regalia Gold",
    "statementPasswordKey": "cards/hdfc-regalia"
  }
]
```

Install the local PDF tooling on the same machine as n8n:

- `node`
- `qpdf`
- `pdftotext`

Then import `infra/n8n/workflows/credit-card-ingest.json` into n8n and attach the Google Drive credentials used by the `Google Drive Trigger` and `Download PDF` nodes.

## Validation

Run the runtime validator before importing the workflow or testing from the mobile app:

```bash
npm run phase-1:validate-runtime -- \
  --mobile-env apps/mobile/.env.phase1.example \
  --supabase-env supabase/.env.functions.phase1.example \
  --n8n-env infra/n8n/.env.phase1.example
```

What it checks:

- required mobile, Supabase, and n8n env vars exist
- n8n and Supabase share the same pipeline secret
- n8n function URLs point at the same Supabase project
- statement routing JSON is valid and resolvable
- every configured `statementPasswordKey` has a corresponding local env var
- FCM credentials are present and parse as service-account JSON

## Smoke test

Run the local contract smoke test after validation:

```bash
npm run phase-1:smoke -- \
  --mobile-env apps/mobile/.env.phase1.example \
  --supabase-env supabase/.env.functions.phase1.example \
  --n8n-env infra/n8n/.env.phase1.example \
  --provider-file-name "HDFC Regalia Gold Apr 2026.pdf"
```

What this executes:

1. Loads the three env files.
2. Resolves the n8n routing rule for the target file name.
3. Sends a statement through the local `statement-parse` contract.
4. Sends the normalized result through the local `statement-ingest` contract.
5. Verifies that transactions persist, partial parses stay partial, and review rows are preserved.

This repo smoke test is contract-level and runs without external services. Use it to verify runtime coherence before you test against the real Supabase project and live Google Drive events.

When the target machine has the real env, parser credentials, and a statement PDF available, run the live smoke path as well:

```bash
npm run phase-1:smoke -- \
  --mode live \
  --mobile-env apps/mobile/.env.phase1.example \
  --supabase-env supabase/.env.functions.phase1.example \
  --n8n-env infra/n8n/.env.phase1.example \
  --provider-file-name "HDFC Regalia Gold Apr 2026.pdf" \
  --pdf /absolute/path/to/statement.pdf
```

`--mode live` will:

1. resolve the file-name routing rule
2. run the configured `PDF_TEXT_EXTRACT_COMMAND` if `--pdf` is supplied
3. call the deployed `statement-parse` endpoint
4. reattach the `statementPasswordKey` for the ingest handoff
5. call the deployed `statement-ingest` endpoint

If you already have extracted statement text, use `--extracted-text-file /absolute/path/to/statement.txt` instead of `--pdf`.

## Target-machine test order

1. Fill the three env files.
2. Apply Supabase migrations.
3. Deploy `statement-parse` and `statement-ingest`.
4. Run `npm run phase-1:validate-runtime`.
5. Run `npm run phase-1:smoke`.
6. Run `npm run phase-1:smoke -- --mode live --pdf /absolute/path/to/statement.pdf`.
7. Import the n8n workflow and bind Google Drive credentials.
8. Create the shared household in the mobile app and record its UUID in `STATEMENT_HOUSEHOLD_ID`.
9. Drop a real statement into the watched Drive folder.
10. Confirm:
   - a `statement_uploads` row is created
   - `transactions` rows are created
   - low-confidence rows have `needs_review = true`
   - `notifications` rows reflect any parse or ingest failure

## Remaining operational gaps

- The checked-in mobile app exposes notification preferences in settings, but the repo does not yet include device-side push registration or topic subscription wiring. FCM transport can be configured server-side now, but end-device delivery still needs mobile implementation work.
- The live smoke test validates the deployed parse and ingest endpoints plus the local PDF extraction command, but it still does not replay the Google Drive trigger itself. The first full-system validation on the target machine still needs an actual PDF dropped into the watched folder after n8n is connected.
- The routing contract depends on file-name patterns. If statement naming is inconsistent across banks, add rules deliberately and keep them under source control rather than editing the imported workflow by hand.
