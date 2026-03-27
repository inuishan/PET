const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readMigration(filename) {
  const filePath = path.join(process.cwd(), 'supabase', 'migrations', filename);

  return fs.readFileSync(filePath, 'utf8');
}

test('0007_whatsapp_ingestion.sql defines household-scoped WhatsApp participant and message storage', () => {
  const migration = readMigration('0007_whatsapp_ingestion.sql');

  assert.match(migration, /create table public\.whatsapp_participants/i);
  assert.match(migration, /create table public\.whatsapp_messages/i);
  assert.match(migration, /phone_e164 text not null/i);
  assert.ok(
    migration.includes("check (phone_e164 ~ '^\\+[1-9][0-9]{6,14}$')"),
    'expected whatsapp_participants to enforce E.164 phone storage',
  );
  assert.match(migration, /provider_message_id text not null/i);
  assert.match(migration, /normalized_message_text text not null/i);
  assert.match(migration, /parse_metadata jsonb not null default '\{\}'::jsonb/i);
  assert.match(migration, /raw_payload jsonb not null default '\{\}'::jsonb/i);
  assert.match(migration, /foreign key \(household_id, member_id\)/i);
  assert.match(migration, /foreign key \(household_id, participant_id\)/i);
  assert.match(migration, /unique \(household_id, phone_e164\)/i);
  assert.match(migration, /unique \(household_id, provider_message_id\)/i);
  assert.match(migration, /create trigger set_whatsapp_participants_updated_at/i);
  assert.match(migration, /create trigger set_whatsapp_messages_updated_at/i);
});

test('0008_whatsapp_rls.sql adds household-scoped RLS and server-owned participant management RPCs', () => {
  const migration = readMigration('0008_whatsapp_rls.sql');

  assert.match(migration, /alter table public\.whatsapp_participants enable row level security/i);
  assert.match(migration, /alter table public\.whatsapp_messages enable row level security/i);
  assert.match(migration, /create policy whatsapp_participants_select_for_members/i);
  assert.match(migration, /create policy whatsapp_messages_select_for_members/i);
  assert.match(migration, /create policy whatsapp_messages_insert_for_service_role/i);
  assert.match(migration, /auth\.role\(\) = 'service_role'/i);
  assert.match(migration, /revoke all on table public\.whatsapp_participants from authenticated/i);
  assert.match(migration, /revoke all on table public\.whatsapp_messages from authenticated/i);
  assert.match(migration, /grant select on table public\.whatsapp_participants to authenticated/i);
  assert.match(migration, /grant select on table public\.whatsapp_messages to authenticated/i);
  assert.match(migration, /create or replace function public\.approve_whatsapp_participant/i);
  assert.match(migration, /create or replace function public\.revoke_whatsapp_participant/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /public\.is_household_owner\(target_household_id\)/i);
  assert.ok(
    migration.includes("normalized_phone ~ '^\\+[1-9][0-9]{6,14}$'"),
    'expected participant RPCs to validate normalized E.164 numbers',
  );
  assert.match(migration, /on conflict \(household_id, phone_e164\)/i);
  assert.match(migration, /revoked_at = now\(\)/i);
  assert.match(migration, /grant execute on function public\.approve_whatsapp_participant/i);
  assert.match(migration, /grant execute on function public\.revoke_whatsapp_participant/i);
});
