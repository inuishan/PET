import assert from 'node:assert/strict';
import test from 'node:test';

import { saveApprovedParticipant } from '../../apps/mobile/src/features/settings/settings-service.ts';
import { saveTransactionCategoryAssignment } from '../../apps/mobile/src/features/transactions/transactions-service.ts';
import { createPhase2WhatsAppHarness } from '../support/phase-2-whatsapp-harness.mjs';

test('Phase 4 accepted corrections become reusable merchant memory for the next matching ingest', async () => {
  const harness = createPhase2WhatsAppHarness();

  await saveApprovedParticipant(harness.client, {
    displayName: 'Ishan personal',
    householdId: harness.householdId,
    memberId: harness.ownerMemberId,
    phoneE164: harness.ownerPhoneE164,
  });

  harness.state.transactions.push({
    amount: 499,
    category_id: 'category-uncategorized',
    classification_method: 'llm',
    confidence: 0.42,
    created_at: '2026-03-26T10:00:00.000Z',
    description: 'low-confidence import',
    fingerprint: 'historical-zepto-1',
    household_id: harness.householdId,
    id: 'transaction-review-1',
    merchant_normalized: 'zepto',
    merchant_raw: 'Zepto',
    metadata: {},
    needs_review: true,
    owner_member_id: harness.ownerMemberId,
    owner_scope: 'member',
    posted_at: '2026-03-26',
    review_reason: 'Needs manual confirmation.',
    source_reference: 'statement-row-1',
    source_type: 'credit_card_statement',
    status: 'needs_review',
    transaction_date: '2026-03-26',
  });

  await saveTransactionCategoryAssignment(harness.client, {
    categoryId: 'category-groceries',
    transactionId: 'transaction-review-1',
  });

  const capture = await harness.captureInboundMessage({
    providerMessageId: 'wamid.phase4-learning',
    text: 'Paid 220 to Zepto for fruit',
  });

  assert.equal(capture.webhook.status, 200);
  assert.equal(capture.parse[0]?.body.data.parseStatus, 'parsed');
  assert.equal(capture.ingest[0]?.body.data.outcome, 'posted');
  assert.equal(harness.state.transactions.length, 2);
  assert.equal(harness.state.transactions[1]?.category_id, 'category-groceries');
  assert.equal(harness.state.transactions[1]?.classification_method, 'inherited');
  assert.equal(harness.state.classificationEvents[0]?.method, 'manual');
  assert.equal(harness.state.classificationEvents[1]?.method, 'inherited');
});
