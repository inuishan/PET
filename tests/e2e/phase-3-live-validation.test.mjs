import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPhase3RuntimeValidationReport,
  loadEnvFile,
} from '../../scripts/phase-3/runtime-config.mjs';
import { runMockPhase3Validation } from '../../scripts/phase-3/run-live-validation.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, '..', '..');

test('Phase 3 runtime validation generates live-style analytics outputs and drives dashboard, analytics, and report models', async () => {
  const report = buildPhase3RuntimeValidationReport({
    mobileEnv: loadEnvFile(path.join(repoRoot, 'apps', 'mobile', '.env.phase3.example')),
    supabaseEnv: loadEnvFile(path.join(repoRoot, 'supabase', '.env.functions.phase3.example')),
  });

  assert.deepEqual(report.errors, []);

  const result = await runMockPhase3Validation(report.config, {
    bucket: 'month',
    endOn: '2026-03-31',
    householdId: '11111111-1111-4111-8111-111111111111',
    reportType: 'monthly',
    startOn: '2026-03-01',
  });

  assert.equal(result.generation.success, true);
  assert.equal(result.generation.data.reportId, result.snapshot.latestReport?.id);
  assert.equal(result.analyticsScreenState.deepAnalysis.reportId, result.report.id);
  assert.deepEqual(result.dashboardScreenState.deepAnalysis.navigation, {
    kind: 'analytics-report',
    reportId: result.report.id,
  });
  assert.equal(result.reportScreenState.hero.title, result.report.title);
  assert.equal(result.reportScreenState.sections.length > 0, true);
  assert.equal(result.evidenceChecks.missingTransactionIds.length, 0);
});
