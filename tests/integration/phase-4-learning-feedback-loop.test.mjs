import assert from 'node:assert/strict';
import test from 'node:test';

import { saveApprovedParticipant } from '../../apps/mobile/src/features/settings/settings-service.ts';
import {
  loadTransactionsSnapshot,
  saveTransactionCategoryAssignment,
} from '../../apps/mobile/src/features/transactions/transactions-service.ts';
import { createPhase2WhatsAppHarness } from '../support/phase-2-whatsapp-harness.mjs';

test('Phase 4 correction capture records a manual review event while clearing the queue', async () => {
  const harness = createPhase2WhatsAppHarness();

  await saveApprovedParticipant(harness.client, {
    displayName: 'Ishan personal',
    householdId: harness.householdId,
    memberId: harness.ownerMemberId,
    phoneE164: harness.ownerPhoneE164,
  });

  const capture = await harness.captureInboundMessage({
    providerMessageId: 'wamid.phase4.review',
    text: 'Neha paid 850 to Uber yesterday',
  });
  const transactionId = harness.state.transactions[0]?.id;

  assert.equal(capture.ingest[0]?.body.data.outcome, 'needs_review');
  assert.ok(transactionId);

  await saveTransactionCategoryAssignment(harness.client, {
    categoryId: 'category-transport',
    transactionId,
  });

  const snapshot = await loadTransactionsSnapshot(harness.client, harness.householdId);
  const manualEvent = harness.state.classificationEvents.at(-1);

  assert.equal(snapshot.transactions[0]?.needsReview, false);
  assert.equal(snapshot.transactions[0]?.reviewReason, null);
  assert.equal(snapshot.transactions[0]?.categoryId, 'category-transport');
  assert.deepEqual(
    {
      metadata: manualEvent?.metadata,
      method: manualEvent?.method,
      nextCategoryId: manualEvent?.nextCategoryId,
      previousCategoryId: manualEvent?.previousCategoryId,
      rationale: manualEvent?.rationale,
    },
    {
      metadata: {
        clearedReviewState: true,
        source: 'mobile_transactions_tab',
      },
      method: 'manual',
      nextCategoryId: 'category-transport',
      previousCategoryId: 'category-transport',
      rationale: 'review_cleared_from_mobile_review',
    },
  );
});

test('Phase 4 alias reuse applies learned household memory to the next matching WhatsApp ingest', async () => {
  const harness = createPhase2WhatsAppHarness();

  harness.seedMerchantAlias({
    categoryId: 'category-groceries',
    confidence: 0.97,
    normalizedMerchantName: 'bigbasket',
  });
  await saveApprovedParticipant(harness.client, {
    displayName: 'Ishan personal',
    householdId: harness.householdId,
    memberId: harness.ownerMemberId,
    phoneE164: harness.ownerPhoneE164,
  });

  const capture = await harness.captureInboundMessage({
    providerMessageId: 'wamid.phase4.alias',
    text: 'Paid 620 to BigBasket for staples',
  });
  const classificationEvent = harness.state.classificationEvents[0];

  assert.equal(capture.ingest[0]?.body.data.outcome, 'posted');
  assert.equal(harness.state.transactions[0]?.category_id, 'category-groceries');
  assert.equal(classificationEvent?.method, 'inherited');
  assert.equal(classificationEvent?.rationale, 'merchant_alias_match');
  assert.equal(classificationEvent?.confidence, 0.97);
});
