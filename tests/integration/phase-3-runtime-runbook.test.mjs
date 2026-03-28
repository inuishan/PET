import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ANALYTICS_PIPELINE_SECRET_HEADER,
} from '../../supabase/functions/_shared/analytics-generate.ts';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, '..', '..');

test('Phase 3 runbook makes the analytics generation deployment contract explicit', () => {
  const runbook = fs.readFileSync(
    path.join(repoRoot, 'docs', 'phase-3-runtime-runbook.md'),
    'utf8',
  );

  assert.match(runbook, /apps\/mobile\/\.env\.phase3\.example/);
  assert.match(runbook, /supabase\/\.env\.functions\.phase3\.example/);
  assert.match(runbook, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(runbook, /ANALYTICS_PIPELINE_SHARED_SECRET/);
  assert.match(runbook, new RegExp(ANALYTICS_PIPELINE_SECRET_HEADER));
  assert.match(runbook, /do not put `SUPABASE_SERVICE_ROLE_KEY` or `PHASE3_VALIDATION_READ_ACCESS_TOKEN` in the mobile env file/i);
  assert.match(runbook, /`?ANALYTICS_GENERATE_URL`? is not part of the normal Phase 3 contract/i);
  assert.match(runbook, /supabase secrets set \\/);
  assert.match(runbook, /supabase functions deploy analytics-generate/);
  assert.match(runbook, /npm run phase-3:validate-runtime/);
  assert.match(runbook, /npm run phase-3:validate-live -- \\\n\s+--mode live/);
  assert.match(runbook, /curl\b[\s\S]*analytics-generate/);
});

test('Phase 3 function env example keeps deployment secrets aligned with the checked-in contract', () => {
  const envExample = fs.readFileSync(
    path.join(repoRoot, 'supabase', '.env.functions.phase3.example'),
    'utf8',
  );

  assert.match(envExample, /^SUPABASE_URL=/m);
  assert.match(envExample, /^SUPABASE_SERVICE_ROLE_KEY=/m);
  assert.match(envExample, /^ANALYTICS_PIPELINE_SHARED_SECRET=/m);
  assert.match(envExample, /^# PHASE3_VALIDATION_READ_ACCESS_TOKEN=/m);
  assert.match(envExample, /No ANALYTICS_GENERATE_URL override is required/i);
});
