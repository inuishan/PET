import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPhase2RuntimeValidationReport,
  loadEnvFile,
} from '../../scripts/phase-2/runtime-config.mjs';
import { runMockPhase2Validation } from '../../scripts/phase-2/run-live-validation.mjs';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(currentDirectory, '..', '..');

test('Phase 2 mock validation covers the runtime rollout scenarios and acknowledgement branch', async () => {
  const report = buildPhase2RuntimeValidationReport({
    supabaseEnv: loadEnvFile(path.join(repoRoot, 'supabase', '.env.functions.phase2.example')),
  });

  assert.deepEqual(report.errors, []);

  const result = await runMockPhase2Validation(report.config, {
    approvedDisplayName: 'Ishan personal',
    approvedPhoneE164: '+919999888877',
    householdId: '11111111-1111-4111-8111-111111111111',
    rejectedPhoneE164: '+919888777766',
  });

  assert.equal(result.setup.participant.status, 'approved');
  assert.equal(result.primaryFlow.happyPath.webhookStatus, 200);
  assert.equal(result.primaryFlow.happyPath.message.parseStatus, 'posted');
  assert.equal(result.primaryFlow.happyPath.transaction.sourceType, 'upi_whatsapp');
  assert.equal(result.primaryFlow.happyPath.acknowledgement.status, 'disabled');
  assert.equal(result.primaryFlow.duplicateDelivery.duplicateMessageCount, 1);
  assert.equal(result.primaryFlow.rejectionPath.webhookStatus, 403);
  assert.equal(result.primaryFlow.reviewPath.message.parseStatus, 'needs_review');
  assert.equal(result.primaryFlow.reviewPath.transaction.needsReview, true);
  assert.equal(result.primaryFlow.parseFailurePath.message.parseStatus, 'failed');
  assert.equal(result.primaryFlow.parseFailurePath.transaction, null);
  assert.equal(result.acknowledgementFlow.posted.acknowledgement.status, 'sent');
  assert.equal(result.acknowledgementFlow.review.acknowledgement.status, 'sent');
  assert.equal(result.acknowledgementFlow.failed.acknowledgement.status, 'sent');
  assert.equal(result.acknowledgementFlow.sentReplies.length, 3);
});
