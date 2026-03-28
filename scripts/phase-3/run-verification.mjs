import { spawnSync } from 'node:child_process';

const phase3Tests = [
  'tests/functions/analytics-generate.test.mjs',
  'tests/functions/analytics-insights.test.mjs',
  'tests/migrations/phase-3-analytics-schema.test.js',
  'tests/migrations/phase-3-insight-generation-schema.test.js',
  'tests/unit/phase-3-analytics-service.test.mjs',
  'tests/unit/phase-3e-analytics-report-service.test.mjs',
  'tests/unit/phase-3f-screen-fallbacks.test.mjs',
  'tests/integration/phase-3-analytics-read-model.test.mjs',
  'tests/integration/phase-3c-dashboard-ui-state.test.mjs',
  'tests/integration/phase-3d-analytics-ui-state.test.mjs',
  'tests/integration/phase-3d-transactions-drilldown.test.mjs',
  'tests/integration/phase-3e-analytics-report-ui-state.test.mjs',
  'tests/integration/phase-3f-stitch-fidelity.test.mjs',
  'tests/e2e/phase-3-analytics-release-path.test.mjs',
];

const result = spawnSync(
  'node',
  [
    '--experimental-strip-types',
    '--loader',
    './tests/support/mobile-loader.mjs',
    '--test',
    ...phase3Tests,
  ],
  {
    cwd: process.cwd(),
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);
