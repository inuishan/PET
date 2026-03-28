const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readMigration(filename) {
  const filePath = path.join(process.cwd(), 'supabase', 'migrations', filename);

  return fs.readFileSync(filePath, 'utf8');
}

test('0009_analytics.sql adds analytics projections and auditable AI output storage', () => {
  const migration = readMigration('0009_analytics.sql');

  assert.match(migration, /create type public\.analytics_bucket as enum/i);
  assert.match(migration, /create type public\.analytics_output_status as enum/i);
  assert.match(migration, /create type public\.analytics_insight_type as enum/i);
  assert.match(migration, /create type public\.analytics_report_type as enum/i);
  assert.match(migration, /create table public\.analytics_reports/i);
  assert.match(migration, /create table public\.insights/i);
  assert.match(migration, /unique \(household_id, id\)/i);
  assert.match(migration, /foreign key \(household_id, analytics_report_id\)/i);
  assert.match(migration, /create or replace view public\.household_transaction_analytics_facts/i);
  assert.match(migration, /payment_source_label/i);
  assert.match(migration, /owner_display_name/i);
  assert.match(migration, /create or replace function public\.get_household_analytics_snapshot/i);
  assert.match(migration, /create or replace function public\.get_household_analytics_report/i);
  assert.match(migration, /public\.is_household_member\(target_household_id\)/i);
  assert.match(migration, /generate_series/i);
  assert.match(migration, /stddev_samp/i);
  assert.match(migration, /recurringChargeCandidates/i);
  assert.match(migration, /deltaPercentage/i);
  assert.match(migration, /latestReport/i);
});

test('0009_analytics.sql applies household-scoped RLS and service-owned writes to analytics outputs', () => {
  const migration = readMigration('0009_analytics.sql');

  assert.match(migration, /alter table public\.analytics_reports enable row level security/i);
  assert.match(migration, /alter table public\.insights enable row level security/i);
  assert.match(migration, /create policy analytics_reports_select_for_members/i);
  assert.match(migration, /create policy insights_select_for_members/i);
  assert.match(migration, /create policy analytics_reports_insert_for_service_role/i);
  assert.match(migration, /create policy insights_insert_for_service_role/i);
  assert.match(migration, /auth\.role\(\) = 'service_role'/i);
  assert.match(migration, /grant select on table public\.analytics_reports to authenticated/i);
  assert.match(migration, /grant select on table public\.insights to authenticated/i);
  assert.match(migration, /grant select, insert, update on table public\.analytics_reports to service_role/i);
  assert.match(migration, /grant select, insert, update on table public\.insights to service_role/i);
  assert.match(migration, /grant execute on function public\.get_household_analytics_report/i);
  assert.match(migration, /grant execute on function public\.get_household_analytics_snapshot/i);
});
