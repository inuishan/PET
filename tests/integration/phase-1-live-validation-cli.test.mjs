import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, '..', '..');

test('Phase 1 live validation CLI rejects unsupported mode values', () => {
  const result = spawnSync(
    process.execPath,
    ['./scripts/phase-1/run-live-validation.mjs', '--mode', 'typo'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /Unsupported --mode value: typo/i);
});
