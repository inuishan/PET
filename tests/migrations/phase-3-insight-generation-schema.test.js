const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readMigration(filename) {
  const filePath = path.join(process.cwd(), 'supabase', 'migrations', filename);

  return fs.readFileSync(filePath, 'utf8');
}

test('0010_analytics_insight_generation.sql exposes explainability fields for insight cards and deep reports', () => {
  const migration = readMigration('0010_analytics_insight_generation.sql');

  assert.match(migration, /create or replace function public\.get_household_analytics_snapshot/i);
  assert.match(migration, /create or replace function public\.get_household_analytics_report/i);
  assert.match(migration, /evidencePayload/i);
  assert.match(migration, /generatedFrom/i);
  assert.match(migration, /generated_from ->> 'periodStart'/i);
  assert.match(migration, /generated_from ->> 'periodEnd'/i);
  assert.match(migration, /summaryInsightIds/i);
  assert.match(migration, /insightIds/i);
});
