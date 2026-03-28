import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPhase1RuntimeValidationReport,
  loadEnvFile,
} from '../../scripts/phase-1/runtime-config.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, '..', '..');

test('Phase 1 example env files define a coherent runtime configuration', () => {
  const report = buildPhase1RuntimeValidationReport({
    mobileEnv: loadEnvFile(path.join(repoRoot, 'apps', 'mobile', '.env.phase1.example')),
    n8nEnv: loadEnvFile(path.join(repoRoot, 'infra', 'n8n', '.env.phase1.example')),
    supabaseEnv: loadEnvFile(path.join(repoRoot, 'supabase', '.env.functions.phase1.example')),
  });

  assert.deepEqual(report.errors, []);
  assert.equal(report.config.mobile.supabaseUrl.toString(), 'https://project-ref.supabase.co/');
  assert.equal(report.config.mobile.phase1AlertPushTopicPrefix, 'phase1-user');
  assert.equal(report.config.n8n.routingRules.length, 1);
  assert.equal(report.config.n8n.routingRules[0].parserProfileName, 'hdfc-regalia-gold');
  assert.equal(report.config.supabase.alertChannels[0], 'push');
});
