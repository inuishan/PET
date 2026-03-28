import { spawnSync } from 'node:child_process';

const phase4Tests = [
  'tests/functions/statement-normalization.test.mjs',
  'tests/functions/whatsapp-parse.test.mjs',
  'tests/functions/whatsapp-ingest.test.mjs',
  'tests/functions/phase-4-learning-verification.test.mjs',
  'tests/unit/phase-4-review-priority.test.mjs',
  'tests/integration/phase-1-transaction-review-flow.test.mjs',
  'tests/integration/phase-2-whatsapp-pipeline.test.mjs',
  'tests/integration/phase-3f-stitch-fidelity.test.mjs',
  'tests/integration/phase-4-learning-feedback-loop.test.mjs',
  'tests/integration/phase-4-recurring-learning.test.mjs',
  'tests/integration/phase-4-stitch-fidelity.test.mjs',
  'tests/e2e/phase-2-whatsapp-path.test.mjs',
  'tests/e2e/phase-4-trust-loop.test.mjs',
];

const result = spawnSync(
  'node',
  [
    '--experimental-strip-types',
    '--loader',
    './tests/support/mobile-loader.mjs',
    '--test',
    ...phase4Tests,
  ],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
