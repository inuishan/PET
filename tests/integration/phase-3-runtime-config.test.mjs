import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPhase3RuntimeValidationReport,
  loadEnvFile,
} from '../../scripts/phase-3/runtime-config.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, '..', '..');

test('Phase 3 example env files define a coherent analytics runtime configuration', () => {
  const report = buildPhase3RuntimeValidationReport({
    mobileEnv: loadEnvFile(path.join(repoRoot, 'apps', 'mobile', '.env.phase3.example')),
    supabaseEnv: loadEnvFile(path.join(repoRoot, 'supabase', '.env.functions.phase3.example')),
  });

  assert.deepEqual(report.errors, []);
  assert.equal(report.config.mobile.supabaseUrl.toString(), 'https://project-ref.supabase.co/');
  assert.equal(
    report.config.supabase.analyticsGenerateUrl.toString(),
    'https://project-ref.supabase.co/functions/v1/analytics-generate',
  );
  assert.equal(report.config.supabase.readTokenSource, 'service_role');
  assert.equal(report.warnings.length, 1);
});
