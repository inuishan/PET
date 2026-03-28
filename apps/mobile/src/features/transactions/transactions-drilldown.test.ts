import { describe, expect, it } from 'vitest';

import {
  createTransactionsDrilldownParams,
  readTransactionsDrilldownParams,
  type TransactionsDrilldown,
} from './transactions-drilldown';

describe('transactions drill-down params', () => {
  it('round-trips analytics filters through router-safe search params', () => {
    const drilldown: TransactionsDrilldown = {
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
    };

    expect(readTransactionsDrilldownParams(createTransactionsDrilldownParams(drilldown))).toEqual({
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
    });
  });
});
