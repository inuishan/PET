import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockCoreProductState } from '../../apps/mobile/src/features/core-product/core-product-state.ts';
import {
  createTransactionsDrilldownParams,
  readTransactionsDrilldownParams,
} from '../../apps/mobile/src/features/transactions/transactions-drilldown.ts';
import { buildTransactionsScreenState } from '../../apps/mobile/src/features/transactions/transactions-model.ts';

test('Phase 3D transactions drill-down params round-trip through router-safe search params', () => {
  assert.deepEqual(
    readTransactionsDrilldownParams(
      createTransactionsDrilldownParams({
        categoryId: 'category-food',
        endOn: '2026-03-31',
        origin: 'analytics',
        ownerMemberId: 'member-1',
        ownerScope: 'member',
        periodBucket: 'month',
        searchQuery: 'Spotify',
        sourceType: 'credit_card_statement',
        startOn: '2026-03-01',
        subtitle: 'March household spend',
        title: 'Food & Dining transactions',
        transactionIds: ['txn-003', 'txn-005'],
      })
    ),
    {
      categoryId: 'category-food',
      endOn: '2026-03-31',
      origin: 'analytics',
      ownerMemberId: 'member-1',
      ownerScope: 'member',
      periodBucket: 'month',
      searchQuery: 'Spotify',
      sourceType: 'credit_card_statement',
      startOn: '2026-03-01',
      subtitle: 'March household spend',
      title: 'Food & Dining transactions',
      transactionIds: ['txn-003', 'txn-005'],
    }
  );
});

test('Phase 3D transaction filtering preserves category, source, period, search, and evidence-set semantics', () => {
  const state = createMockCoreProductState();
  const filteredState = buildTransactionsScreenState(
    {
      ...state,
      transactions: [
        {
          ...state.transactions[0],
          amount: 380,
          categoryId: 'food-dining',
          id: 'txn-upi-analytics',
          merchant: 'Blue Tokai Coffee',
          ownerDisplayName: 'Ishan',
          ownerMemberId: 'member-1',
          ownerScope: 'member',
          postedAt: '2026-03-27T09:15:00.000Z',
          reviewReason: null,
          reviewReasons: [],
          sourceContextLabel: 'Meta test number',
          sourceLabel: 'WhatsApp UPI',
          sourceType: 'upi_whatsapp',
        },
        ...state.transactions.map((transaction) => ({
          ...transaction,
          ownerDisplayName: ['txn-005', 'txn-004'].includes(transaction.id) ? 'Ishan' : transaction.ownerDisplayName,
          ownerMemberId: ['txn-005', 'txn-004'].includes(transaction.id) ? 'member-1' : null,
          ownerScope: ['txn-005', 'txn-004'].includes(transaction.id) ? 'member' : transaction.ownerScope,
        })),
      ],
    },
    'all',
    {
      asOf: '2026-03-27T10:00:00.000Z',
      categoryId: 'food-dining',
      endOn: '2026-03-31',
      searchQuery: 'tokai',
      sourceType: 'upi_whatsapp',
      startOn: '2026-03-01',
    }
  );

  assert.deepEqual(filteredState.filterSummary, ['Food & Dining', 'WhatsApp UPI', 'Mar 2026', 'Search: tokai']);
  assert.equal(filteredState.groups[0]?.heading, 'Today');
  assert.deepEqual(filteredState.groups[0]?.transactions.map((transaction) => transaction.id), ['txn-upi-analytics']);

  const evidenceState = buildTransactionsScreenState(
    {
      ...state,
      transactions: state.transactions.map((transaction) => ({
        ...transaction,
        ownerDisplayName: ['txn-005', 'txn-004'].includes(transaction.id) ? 'Ishan' : transaction.ownerDisplayName,
        ownerMemberId: ['txn-005', 'txn-004'].includes(transaction.id) ? 'member-1' : null,
        ownerScope: ['txn-005', 'txn-004'].includes(transaction.id) ? 'member' : transaction.ownerScope,
      })),
    },
    'all',
    {
      asOf: '2026-03-27T10:00:00.000Z',
      ownerMemberId: 'member-1',
      ownerScope: 'member',
      transactionIds: ['txn-006', 'txn-005', 'txn-004'],
    }
  );

  assert.deepEqual(evidenceState.filterSummary, ['Ishan', 'Focused evidence set']);
  assert.deepEqual(
    evidenceState.groups.flatMap((group) => group.transactions).map((transaction) => transaction.id),
    ['txn-005', 'txn-004']
  );
});
