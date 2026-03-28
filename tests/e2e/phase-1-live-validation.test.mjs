import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPhase1RuntimeValidationReport,
  loadEnvFile,
} from '../../scripts/phase-1/runtime-config.mjs';
import { runMockPhase1Validation } from '../../scripts/phase-1/run-live-validation.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, '..', '..');

test('Phase 1 mock live validation covers contract smoke, review rows, and failure notifications', async () => {
  const report = buildPhase1RuntimeValidationReport({
    mobileEnv: loadEnvFile(path.join(repoRoot, 'apps', 'mobile', '.env.phase1.example')),
    n8nEnv: loadEnvFile(path.join(repoRoot, 'infra', 'n8n', '.env.phase1.example')),
    supabaseEnv: loadEnvFile(path.join(repoRoot, 'supabase', '.env.functions.phase1.example')),
  });

  assert.deepEqual(report.errors, []);

  const result = await runMockPhase1Validation(report.config);

  assert.equal(result.contractSmoke.parse.success, true);
  assert.equal(result.contractSmoke.ingest.success, true);
  assert.equal(result.contractSmoke.persisted.reviewCount, 1);
  assert.equal(result.reviewDrill.response.status, 200);
  assert.equal(result.reviewDrill.outcome.statementUpload.parseStatus, 'partial');
  assert.equal(result.reviewDrill.outcome.transactions.count, 2);
  assert.equal(result.reviewDrill.outcome.transactions.needsReviewCount, 1);
  assert.equal(result.reviewDrill.outcome.notifications.byType.review_queue_escalation, 1);
  assert.equal(result.failureDrill.response.status, 502);
  assert.equal(result.failureDrill.outcome.statementUpload, null);
  assert.equal(result.failureDrill.outcome.transactions.count, 0);
  assert.equal(result.failureDrill.outcome.notifications.byType.statement_sync_blocked, 1);
});
