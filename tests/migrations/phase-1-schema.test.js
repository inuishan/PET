const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readMigration(filename) {
  const filePath = path.join(process.cwd(), 'supabase', 'migrations', filename);

  return fs.readFileSync(filePath, 'utf8');
}

test('0001_init.sql defines the phase 1 core tables and seed taxonomy', () => {
  const migration = readMigration('0001_init.sql');

  const requiredTables = [
    'households',
    'household_members',
    'statement_uploads',
    'transactions',
    'categories',
    'merchant_aliases',
    'classification_events',
    'notifications',
  ];

  for (const tableName of requiredTables) {
    assert.match(
      migration,
      new RegExp(`create table public\\.${tableName}`, 'i'),
      `expected ${tableName} to be created`,
    );
  }

  assert.match(migration, /create extension if not exists pgcrypto/i);
  assert.match(migration, /create type public\.transaction_status as enum/i);
  assert.match(migration, /references auth\.users \(id\)/i);
  assert.match(migration, /foreign key \(household_id, owner_member_id\)/i);
  assert.match(migration, /insert into public\.categories/i);
  assert.match(migration, /Food & Dining/i);
  assert.match(migration, /Subscriptions/i);
});

test('0002_rls.sql enables row level security and household access helpers', () => {
  const migration = readMigration('0002_rls.sql');

  const rlsTables = [
    'households',
    'household_members',
    'statement_uploads',
    'transactions',
    'categories',
    'merchant_aliases',
    'classification_events',
    'notifications',
  ];

  for (const tableName of rlsTables) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${tableName} enable row level security`, 'i'),
      `expected RLS to be enabled on ${tableName}`,
    );
  }

  assert.match(migration, /create or replace function public\.is_household_member/i);
  assert.match(migration, /create or replace function public\.is_household_owner/i);
  assert.match(migration, /create or replace function public\.can_insert_household_member/i);
  assert.match(migration, /create policy[\s\S]*on public\.households/i);
  assert.match(migration, /create policy[\s\S]*on public\.transactions/i);
  assert.match(migration, /create policy[\s\S]*on public\.notifications/i);
  assert.match(migration, /auth\.uid\(\) is not null/i);
});

test('0003_views.sql adds month-to-date summaries and dashboard helper functions', () => {
  const migration = readMigration('0003_views.sql');

  assert.match(migration, /create or replace function public\.month_start_for/i);
  assert.match(migration, /create or replace function public\.next_month_start_for/i);
  assert.match(migration, /create or replace view public\.household_month_to_date_totals/i);
  assert.match(migration, /create or replace view public\.household_category_month_to_date/i);
  assert.match(migration, /create or replace view public\.household_statement_sync_status/i);
  assert.match(migration, /create or replace function public\.get_household_dashboard_summary/i);
  assert.match(migration, /security_invoker/i);
});

test('0004_household_invites.sql adds invite-backed onboarding helpers', () => {
  const migration = readMigration('0004_household_invites.sql');

  assert.match(migration, /create table public\.household_invites/i);
  assert.match(migration, /alter table public\.household_invites enable row level security/i);
  assert.match(migration, /create policy household_invites_select_for_owners/i);
  assert.match(migration, /create or replace function public\.ensure_household_invite/i);
  assert.match(migration, /create or replace function public\.create_household_with_owner/i);
  assert.match(migration, /create or replace function public\.join_household_with_invite/i);
  assert.match(migration, /maximum number of members for Phase 1/i);
  assert.match(migration, /jsonb_build_object/i);
});
