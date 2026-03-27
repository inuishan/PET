import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPhase1RuntimeValidationReport,
  loadEnvFile,
} from '../../scripts/phase-1/runtime-config.mjs';
import { runMockPhase1SmokeTest } from '../../scripts/phase-1/run-smoke-test.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, '..', '..');

test('Phase 1 runtime smoke test resolves routing and ingests a statement through the local contract path', async () => {
  const report = buildPhase1RuntimeValidationReport({
    mobileEnv: loadEnvFile(path.join(repoRoot, 'apps', 'mobile', '.env.phase1.example')),
    n8nEnv: loadEnvFile(path.join(repoRoot, 'infra', 'n8n', '.env.phase1.example')),
    supabaseEnv: loadEnvFile(path.join(repoRoot, 'supabase', '.env.functions.phase1.example')),
  });

  assert.deepEqual(report.errors, []);

  const result = await runMockPhase1SmokeTest(report.config, {
    providerFileId: 'drive-file-smoke-123',
    providerFileName: 'HDFC Regalia Gold Apr 2026.pdf',
  });

  assert.equal(result.route.householdId, '11111111-1111-4111-8111-111111111111');
  assert.equal(result.route.parserProfileName, 'hdfc-regalia-gold');
  assert.equal(result.route.statementPasswordKey, 'cards/hdfc-regalia');
  assert.equal(result.parse.data.summary.transactionCount, 2);
  assert.equal(result.ingest.data.transactionCount, 2);
  assert.equal(result.ingest.data.parseStatus, 'partial');
  assert.equal(result.persisted.reviewCount, 1);
  assert.equal(result.persisted.statementUpload.statementPasswordKey, 'cards/hdfc-regalia');
});
