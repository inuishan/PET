import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, '..', '..');

test('Phase 1 runbook documents the live validator, watched-folder check, and failure drill', () => {
  const runbook = fs.readFileSync(
    path.join(repoRoot, 'docs', 'phase-1-runtime-runbook.md'),
    'utf8',
  );

  assert.match(runbook, /apps\/mobile\/\.env\.phase1\.example/);
  assert.match(runbook, /supabase\/\.env\.functions\.phase1\.example/);
  assert.match(runbook, /infra\/n8n\/\.env\.phase1\.example/);
  assert.match(runbook, /npm run phase-1:validate-runtime/);
  assert.match(runbook, /npm run phase-1:smoke -- \\\n\s+--mode live/);
  assert.match(runbook, /npm run phase-1:validate-live -- \\\n\s+--mode live\s+\\\n\s+--delivery drive-drop/);
  assert.match(runbook, /npm run phase-1:validate-live -- \\\n\s+--mode live\s+\\\n\s+--delivery ingest-failure-drill/);
  assert.match(runbook, /Run the drive-drop validator before you upload the real PDF/i);
  assert.doesNotMatch(runbook, /first full-system validation on the target machine still needs/i);
});
