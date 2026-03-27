import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(
  currentDirectory,
  '..',
  '..',
  'supabase',
  'migrations',
  '0004_statement_ingest_rpc.sql',
);
const workflowPath = path.join(
  currentDirectory,
  '..',
  '..',
  'infra',
  'n8n',
  'workflows',
  'credit-card-ingest.json',
);

test('statement ingest RPC is restricted to service_role execution', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');

  assert.match(migration, /security invoker/i);
  assert.match(
    migration,
    /revoke all on function public\.ingest_statement_payload\(jsonb, jsonb\) from authenticated;/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.ingest_statement_payload\(jsonb, jsonb\) to service_role;/i,
  );
});

test('n8n workflow passes only a password key to the extraction command', () => {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
  const lookupNode = workflow.nodes.find((node) => node.name === 'Lookup Password Key');
  const extractNode = workflow.nodes.find((node) => node.name === 'Extract Statement Text');

  assert.ok(lookupNode);
  assert.ok(extractNode);
  assert.match(lookupNode.parameters.jsCode, /statementPasswordKey/);
  assert.doesNotMatch(lookupNode.parameters.jsCode, /statementPassword\b/);
  assert.match(extractNode.parameters.command, /--password-key/);
  assert.doesNotMatch(extractNode.parameters.command, /--password '/);
});
