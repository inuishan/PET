const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readMigration(filename) {
  return fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', filename), 'utf8');
}

test('0012_phase4_learning_rules.sql extends merchant alias memory with operational trust fields', () => {
  const migration = readMigration('0012_phase4_learning_rules.sql');

  assert.match(migration, /alter table public\.merchant_aliases/i);
  assert.match(migration, /confirmation_count integer not null default 1/i);
  assert.match(migration, /last_confirmed_at timestamptz/i);
  assert.match(migration, /source_transaction_id uuid references public\.transactions/i);
  assert.match(migration, /active boolean not null default true/i);
  assert.match(migration, /merchant_aliases_household_active_normalized_idx/i);
});

test('0013_phase4_learning_rpc.sql turns accepted recategorization into immediate reusable merchant memory', () => {
  const migration = readMigration('0013_phase4_learning_rpc.sql');

  assert.match(migration, /create or replace function public\.reassign_transaction_category/i);
  assert.match(migration, /insert into public\.classification_events/i);
  assert.match(migration, /learnedAlias/i);
  assert.match(migration, /insert into public\.merchant_aliases/i);
  assert.match(migration, /on conflict \(household_id, raw_merchant_name\)/i);
  assert.match(migration, /confirmation_count = coalesce\(public\.merchant_aliases\.confirmation_count, 0\) \+ 1/i);
  assert.match(migration, /last_confirmed_at = now\(\)/i);
  assert.match(migration, /grant execute on function public\.reassign_transaction_category/i);
});
