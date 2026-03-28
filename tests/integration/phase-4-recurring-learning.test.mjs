import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalyticsScreenState } from '../../apps/mobile/src/features/analytics/analytics-model.ts';
import { loadAnalyticsSnapshot } from '../../apps/mobile/src/features/analytics/analytics-service.ts';
import { createPhase2WhatsAppHarness } from '../support/phase-2-whatsapp-harness.mjs';

test('Phase 4 recurring verification follows the analytics snapshot grouping keys and rolling history window', async () => {
  const harness = createPhase2WhatsAppHarness();

  harness.seedTransaction({
    amount: 1299,
    categoryId: 'category-uncategorized',
    id: 'txn-recurring-old',
    merchantRaw: 'Google One',
    metadata: {
      cardName: 'HDFC Regalia Gold',
    },
    sourceType: 'credit_card_statement',
    transactionDate: '2025-01-18',
  });
  harness.seedTransaction({
    amount: 1299,
    categoryId: 'category-uncategorized',
    id: 'txn-recurring-jan',
    merchantRaw: 'Google One',
    metadata: {
      cardName: 'HDFC Regalia Gold',
    },
    sourceType: 'credit_card_statement',
    transactionDate: '2026-01-18',
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
  harness.seedTransaction({
    amount: 1299,
    categoryId: 'category-uncategorized',
    id: 'txn-different-card-mar',
    merchantRaw: 'Google One',
    metadata: {
      cardName: 'Amex MRCC',
    },
    sourceType: 'credit_card_statement',
    transactionDate: '2026-03-19',
  });

  const snapshot = await loadAnalyticsSnapshot(harness.client, {
    bucket: 'month',
    comparisonEndOn: '2026-02-28',
    comparisonStartOn: '2026-02-01',
    endOn: '2026-03-31',
    householdId: harness.householdId,
    startOn: '2026-03-01',
  });
  const screenState = buildAnalyticsScreenState(snapshot);

  assert.equal(snapshot.recurringChargeCandidates.length, 1);
  assert.deepEqual(snapshot.recurringChargeCandidates[0], {
    averageAmount: 1299,
    averageCadenceDays: 30,
    categoryName: 'Uncategorized',
    lastChargedOn: '2026-03-18',
    merchantName: 'google one',
    monthsActive: 3,
    paymentSourceLabel: 'HDFC Regalia Gold',
    transactionCount: 3,
  });
  assert.equal(screenState.recurringCards[0]?.merchantName, 'google one');
  assert.equal(screenState.recurringCards[0]?.cadenceLabel, 'Every 30 days');
});
