# Phase 3 Runtime Runbook

This runbook turns the Phase 3 analytics generation code into a reproducible deployment and validation path for live insight generation, deep-report publication, and downstream dashboard or analytics consumption.

## Files to fill in

Copy and edit these example files on the target machine:

- `apps/mobile/.env.phase3.example`
- `supabase/.env.functions.phase3.example`

These files define the checked-in runtime contract for the mobile client, the `analytics-generate` function, and the live validation script. Keep the deployed secrets aligned with those checked-in examples so local validation and hosted behavior stay in sync.

## Required runtime contract

### Mobile

Set:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

These are the only mobile env vars required by the current Phase 3 code. They are public client settings. Do not put `SUPABASE_SERVICE_ROLE_KEY` or `PHASE3_VALIDATION_READ_ACCESS_TOKEN` in the mobile env file.

### Supabase functions

Set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANALYTICS_PIPELINE_SHARED_SECRET`

Optional but recommended:

- `PHASE3_VALIDATION_READ_ACCESS_TOKEN`

If `PHASE3_VALIDATION_READ_ACCESS_TOKEN` is set, the live validation script reads analytics through the authenticated backend path by pairing that token with `EXPO_PUBLIC_SUPABASE_ANON_KEY`. If it is omitted, the script falls back to `SUPABASE_SERVICE_ROLE_KEY` and warns about the weaker read-path check.

`ANALYTICS_GENERATE_URL` is not part of the normal Phase 3 contract. The checked-in validator and live validation runner derive the function endpoint from `SUPABASE_URL` and require the standard `/functions/v1/analytics-generate` path.

## Request contract

The deployed function contract is:

- method: `POST`
- path: `/functions/v1/analytics-generate`
- auth header: `x-analytics-pipeline-secret`
- content type: `application/json`

Request body:

- `householdId` required
- `startOn` required
- `endOn` required
- `bucket` optional, defaults to `month`
- `reportType` optional, defaults to `monthly`
- `comparisonStartOn` optional
- `comparisonEndOn` optional

The function rejects requests without the shared-secret header and persists both generated `insights` rows and one published `analytics_reports` row from the same signal bundle.

## Deployment

Apply the Phase 3 database migrations first:

```bash
supabase db push
```

If you manage secrets through the Supabase CLI, keep the same values as the local example file:

```bash
supabase secrets set \
  SUPABASE_URL=... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  ANALYTICS_PIPELINE_SHARED_SECRET=... \
  PHASE3_VALIDATION_READ_ACCESS_TOKEN=...
```

Deploy the analytics function with those secrets available to the runtime:

```bash
supabase functions deploy analytics-generate
```

After deployment, verify the function boundary directly before you rely on the higher-level validation scripts:

```bash
curl -i \
  -X POST \
  "https://project-ref.supabase.co/functions/v1/analytics-generate" \
  -H "content-type: application/json" \
  -H "x-analytics-pipeline-secret: replace-with-analytics-pipeline-shared-secret" \
  -d '{
    "householdId": "11111111-1111-4111-8111-111111111111",
    "startOn": "2026-03-01",
    "endOn": "2026-03-31",
    "bucket": "month",
    "reportType": "monthly"
  }'
```

Expected outcomes:

- `200` with `success: true` when the household has usable ledger data and the secret matches
- `401` when the `x-analytics-pipeline-secret` value is missing or wrong
- `502` when the function is deployed but generation or persistence fails downstream

## Validation

Run the runtime validator before the first live execution:

```bash
npm run phase-3:validate-runtime -- \
  --mobile-env apps/mobile/.env.phase3.example \
  --supabase-env supabase/.env.functions.phase3.example
```

What it checks:

- required mobile and Supabase env vars exist
- mobile and function runtimes point at the same Supabase project
- the analytics function URL resolves to `/functions/v1/analytics-generate`
- the live validation runner knows whether it will read with an authenticated token or the service role

Run the contract-level validation path next:

```bash
npm run phase-3:validate-live -- \
  --mode mock \
  --household-id 11111111-1111-4111-8111-111111111111 \
  --start-on 2026-03-01 \
  --end-on 2026-03-31
```

What mock mode validates:

1. Calls `analytics-generate` through the same request contract used in production.
2. Persists generated insights and a report from one signal bundle.
3. Reads the generated snapshot and report through the same analytics service parsing code used by the app.
4. Builds dashboard, analytics, and deep-report screen states from those generated outputs.
5. Confirms supporting transaction ids remain attached to the generated evidence sets.

Run the deployed-path validation after the function is live and the target household already has real transactions in the ledger:

```bash
npm run phase-3:validate-live -- \
  --mode live \
  --household-id <household-uuid> \
  --start-on 2026-03-01 \
  --end-on 2026-03-31 \
  --bucket month \
  --report-type monthly
```

What live mode executes:

1. Calls the deployed `analytics-generate` function with `ANALYTICS_PIPELINE_SHARED_SECRET`.
2. Reads `get_household_analytics_snapshot` from the deployed backend.
3. Reads `get_household_analytics_report` for the generated report id.
4. Builds the same dashboard, analytics, and deep-report screen states used in the app.
5. Verifies that every supporting transaction id referenced by the generated report still resolves in the live database.

## Target-machine test order

1. Fill the two env files.
2. Apply Supabase migrations.
3. Deploy `analytics-generate`.
4. Run `npm run phase-3:validate-runtime`.
5. Verify the direct function boundary with `curl` and the shared-secret header.
6. Run `npm run phase-3:validate-live -- --mode mock ...`.
7. Run `npm run phase-3:validate-live -- --mode live ...`.
8. Open the app against the same household and confirm the dashboard, Analytics tab, and deep-report route match the generated output.

## Expected success signals

- `generation.success` is `true`
- `snapshot.latestReport.id` matches `generation.data.reportId`
- `analyticsScreenState.deepAnalysis.reportId` is populated
- `dashboardScreenState.deepAnalysis.navigation.kind` is `analytics-report`
- `reportScreenState.sections.length` is greater than zero
- `evidenceChecks.missingTransactionIds` is empty

## Failure handling

- `401 unauthorized` from `analytics-generate`
  Fix `ANALYTICS_PIPELINE_SHARED_SECRET` in the deployed function runtime and the validation machine.
- `502 analytics_generation_failed`
  Check the function logs first. The common causes are missing ledger data for the target household, migration drift, or failed writes to `analytics_reports` or `insights`.
- `snapshot.latestReport` is `null`
  The generation write path did not publish a report. Confirm the function returned success and inspect `analytics_reports` for the target household and period.
- `report` is `null` after a successful generation call
  The write path and read path disagree on report visibility. Recheck migrations `0009_analytics.sql` and `0010_analytics_insight_generation.sql`, then verify the target household and report id.
- `evidenceChecks.missingTransactionIds` is not empty
  Generated insights reference transactions that the live read path cannot resolve. Treat this as a release blocker because drill-downs will be broken.
- warning about `service_role`
  The script validated the real backend endpoints, but not the authenticated client read path. Provide `PHASE3_VALIDATION_READ_ACCESS_TOKEN` and rerun before release if you need end-user parity.
