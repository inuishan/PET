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
  '0011_statement_ingest_rpc.sql',
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
  const routingNode = workflow.nodes.find((node) => node.name === 'Resolve Statement Routing');
  const extractNode = workflow.nodes.find((node) => node.name === 'Extract Statement Text');
  const callParserNode = workflow.nodes.find((node) => node.name === 'Call statement-parse');
  const callIngestNode = workflow.nodes.find((node) => node.name === 'Retry Ingest');

  assert.ok(routingNode);
  assert.ok(extractNode);
  assert.ok(callParserNode);
  assert.ok(callIngestNode);
  assert.match(routingNode.parameters.jsCode, /STATEMENT_FILE_ROUTING_JSON/);
  assert.match(routingNode.parameters.jsCode, /STATEMENT_HOUSEHOLD_ID/);
  assert.match(routingNode.parameters.jsCode, /statementPasswordKey/);
  assert.doesNotMatch(JSON.stringify(workflow), /replace-with-household-uuid/);
  assert.doesNotMatch(JSON.stringify(workflow), /replace-with-card-profile/);
  assert.match(extractNode.parameters.command, /--password-key/);
  assert.doesNotMatch(extractNode.parameters.command, /--password '/);
  assert.doesNotMatch(callParserNode.parameters.jsonBody, /statementPasswordKey/);
  assert.match(callParserNode.parameters.jsonBody, /bankName/);
  assert.match(callParserNode.parameters.jsonBody, /cardName/);
  assert.match(callIngestNode.parameters.jsonBody, /statementPasswordKey/);
  assert.match(callIngestNode.parameters.jsonBody, /Resolve Statement Routing/);
});
