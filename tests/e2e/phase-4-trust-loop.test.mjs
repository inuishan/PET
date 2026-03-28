import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalyticsScreenState } from '../../apps/mobile/src/features/analytics/analytics-model.ts';
import { loadAnalyticsSnapshot } from '../../apps/mobile/src/features/analytics/analytics-service.ts';
import { saveApprovedParticipant } from '../../apps/mobile/src/features/settings/settings-service.ts';
import {
  loadTransactionsSnapshot,
  saveTransactionCategoryAssignment,
} from '../../apps/mobile/src/features/transactions/transactions-service.ts';
import { buildTransactionsScreenState } from '../../apps/mobile/src/features/transactions/transactions-model.ts';
import { createPhase2WhatsAppHarness } from '../support/phase-2-whatsapp-harness.mjs';

test('E2E Phase 4 trust loop carries learned alias reuse, review prioritization, correction capture, and recurring evidence together', async () => {
  const harness = createPhase2WhatsAppHarness();

  harness.seedMerchantAlias({
    categoryId: 'category-groceries',
    confidence: 0.97,
    normalizedMerchantName: 'bigbasket',
  });
  harness.seedTransaction({
    amount: 1299,
    categoryId: 'category-uncategorized',
    id: 'txn-recurring-feb',
    merchantRaw: 'Google One',
    metadata: {
      cardName: 'HDFC Regalia Gold',
    },
    sourceType: 'credit_card_statement',
    transactionDate: '2026-02-17',
  });
  harness.seedTransaction({
    amount: 1299,
    categoryId: 'category-uncategorized',
    id: 'txn-recurring-mar',
    merchantRaw: 'Google One',
    metadata: {
      cardName: 'HDFC Regalia Gold',
    },
    sourceType: 'credit_card_statement',
    transactionDate: '2026-03-18',
  });
  await saveApprovedParticipant(harness.client, {
    displayName: 'Ishan personal',
    householdId: harness.householdId,
    memberId: harness.ownerMemberId,
    phoneE164: harness.ownerPhoneE164,
  });

  const reviewCapture = await harness.captureInboundMessage({
    providerMessageId: 'wamid.phase4.e2e-review',
    text: 'Neha paid 850 to Uber yesterday',
  });
  const learnedCapture = await harness.captureInboundMessage({
    providerMessageId: 'wamid.phase4.e2e-alias',
    text: 'Paid 620 to BigBasket for staples',
  });
  const transactionsBeforeCorrection = await loadTransactionsSnapshot(harness.client, harness.householdId);
  const reviewQueue = buildTransactionsScreenState(transactionsBeforeCorrection, 'needs_review', {
    asOf: '2026-03-27T10:00:00.000Z',
  });
  const analyticsSnapshot = await loadAnalyticsSnapshot(harness.client, {
    bucket: 'month',
    comparisonEndOn: '2026-02-28',
    comparisonStartOn: '2026-02-01',
    endOn: '2026-03-31',
    householdId: harness.householdId,
    startOn: '2026-03-01',
  });
  const analyticsScreenState = buildAnalyticsScreenState(analyticsSnapshot);
  const reviewTransactionId = harness.state.transactions.find((transaction) => transaction.review_reason)?.id;

  assert.equal(reviewCapture.ingest[0]?.body.data.outcome, 'needs_review');
  assert.equal(learnedCapture.ingest[0]?.body.data.outcome, 'posted');
  assert.equal(reviewQueue.groups.flatMap((group) => group.transactions)[0]?.reviewPriority, 'high');
  assert.equal(reviewQueue.groups.flatMap((group) => group.transactions)[0]?.merchant, 'Uber');
  assert.equal(harness.state.classificationEvents[1]?.method, 'inherited');
  assert.equal(analyticsScreenState.recurringCards[0]?.merchantName, 'google one');
  assert.equal(analyticsScreenState.recurringCards[0]?.drilldown.searchQuery, 'google one');

  await saveTransactionCategoryAssignment(harness.client, {
    categoryId: 'category-transport',
    transactionId: reviewTransactionId,
  });

  const transactionsAfterCorrection = await loadTransactionsSnapshot(harness.client, harness.householdId);
  const reviewQueueAfterCorrection = buildTransactionsScreenState(transactionsAfterCorrection, 'needs_review', {
    asOf: '2026-03-27T10:00:00.000Z',
  });

  assert.equal(reviewQueueAfterCorrection.reviewQueueCount, 0);
  assert.equal(harness.state.classificationEvents.at(-1)?.method, 'manual');
});
