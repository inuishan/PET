import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPhase2RuntimeValidationReport,
  loadEnvFile,
} from '../../scripts/phase-2/runtime-config.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, '..', '..');

test('Phase 2 example env file defines a coherent WhatsApp runtime configuration', () => {
  const report = buildPhase2RuntimeValidationReport({
    supabaseEnv: loadEnvFile(path.join(repoRoot, 'supabase', '.env.functions.phase2.example')),
  });

  assert.deepEqual(report.errors, []);
  assert.equal(report.config.supabase.supabaseUrl.toString(), 'https://project-ref.supabase.co/');
  assert.equal(
    report.config.supabase.webhookUrl.toString(),
    'https://project-ref.supabase.co/functions/v1/whatsapp-webhook',
  );
  assert.equal(report.config.supabase.parseUrl.toString(), 'https://project-ref.supabase.co/functions/v1/whatsapp-parse');
  assert.equal(report.config.supabase.ingestUrl.toString(), 'https://project-ref.supabase.co/functions/v1/whatsapp-ingest');
  assert.equal(report.config.supabase.replyUrl.toString(), 'https://project-ref.supabase.co/functions/v1/whatsapp-reply');
  assert.equal(report.config.supabase.acknowledgementsEnabled, false);
  assert.equal(report.config.supabase.readTokenSource, 'service_role');
  assert.equal(report.warnings.length, 1);
});
