# Credit Card Statement Workflow

This local n8n workflow is the Phase 1 credit card ingestion pipeline. It watches a Google Drive folder, looks up any password key without hardcoding secrets in the workflow, extracts statement text locally, calls the parser endpoint, retries the backend handoff, and leaves the raw PDF in Drive only.

## Required environment

Set these for the n8n instance:

- `DRIVE_FOLDER_ID`: Google Drive folder to watch.
- `STATEMENT_PIPELINE_SHARED_SECRET`: Shared secret sent to both backend endpoints in `x-statement-pipeline-secret`.
- `STATEMENT_PARSE_URL`: Supabase `statement-parse` function URL.
- `STATEMENT_INGEST_URL`: Supabase `statement-ingest` function URL.
- `CARD_PASSWORD_MAP_JSON`: JSON object mapping parser profiles or file patterns to password secret keys.
- `PDF_TEXT_EXTRACT_COMMAND`: Local command that reads the downloaded PDF and prints extracted text. It must support password-backed PDFs.

Set these for Supabase edge functions:

- `STATEMENT_PIPELINE_SHARED_SECRET`: Same shared secret used by n8n.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VERCEL_AI_GATEWAY_API_KEY`
- `STATEMENT_PARSE_MODEL` optionally overrides the parser model.

## Workflow shape

1. `Google Drive Trigger` watches the configured folder.
2. `Prepare Statement Context` derives `householdId`, `parserProfileName`, `providerFileId`, and `providerFileName`.
3. `Lookup Password Key` maps the parser profile to a password key from `CARD_PASSWORD_MAP_JSON`.
4. `Download PDF` fetches the file from Drive to local disk or an n8n binary property.
5. `Extract Statement Text` runs `PDF_TEXT_EXTRACT_COMMAND --password-key <key>` so the local helper resolves the actual secret without storing it in workflow execution data.
6. `Call statement-parse` posts statement metadata plus extracted text to Supabase.
7. `Retry Ingest` sends the normalized payload to `statement-ingest` with retries and backoff.
8. `Handle Failure` records sync failure details in the execution log and triggers a visible alert path.

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
- Unsupported credits, reversals, or refunds are skipped by normalization and recorded in statement metadata.
- Low-confidence rows are persisted with `needs_review = true` so they remain visible in totals and review flows.
- The shared secret is required on both endpoints. Do not inline secrets directly into node parameters when n8n credentials or environment variables can hold them.
