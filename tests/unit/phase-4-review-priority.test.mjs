import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockCoreProductState } from '../../apps/mobile/src/features/core-product/core-product-state.ts';
import { buildTransactionsScreenState } from '../../apps/mobile/src/features/transactions/transactions-model.ts';

test('Phase 4 review prioritization surfaces explicit priority inside the date-grouped review queue', () => {
  const state = createMockCoreProductState();
  const screenState = buildTransactionsScreenState(
    {
      ...state,
      transactions: [
        {
          ...state.transactions[1],
          confidence: 0.79,
          id: 'txn-owner-conflict',
          merchant: 'Uber Shared',
          postedAt: '2026-03-26T08:00:00.000Z',
          reviewReason: 'owner_conflict',
          reviewReasons: ['owner_conflict'],
          sourceContextLabel: 'Meta test number',
          sourceLabel: 'WhatsApp UPI',
          sourceType: 'upi_whatsapp',
        },
        {
          ...state.transactions[3],
          confidence: 0.49,
          id: 'txn-missing-merchant',
          merchant: 'Unknown Merchant',
          postedAt: '2026-03-27T09:00:00.000Z',
          reviewReason: 'missing_merchant',
          reviewReasons: ['missing_merchant', 'low_confidence'],
        },
        {
          ...state.transactions[3],
          confidence: 0.72,
          id: 'txn-low-confidence',
          merchant: 'Weak Match',
          postedAt: '2026-03-27T10:00:00.000Z',
          reviewReason: 'low_confidence',
          reviewReasons: ['low_confidence'],
        },
        ...state.transactions.filter((transaction) => !['txn-002', 'txn-004'].includes(transaction.id)),
      ],
    },
    'needs_review',
    {
      asOf: '2026-03-27T11:00:00.000Z',
    },
  );
  const orderedRows = screenState.groups.flatMap((group) => group.transactions);

  assert.deepEqual(
    orderedRows.map((transaction) => [transaction.id, transaction.reviewPriority]),
    [
      ['txn-missing-merchant', 'high'],
      ['txn-low-confidence', 'medium'],
      ['txn-owner-conflict', 'high'],
    ],
  );
});
