import { describe, expect, it } from 'vitest';

import { createMockCoreProductState } from '@/features/core-product/core-product-state';

import { buildTransactionsScreenState, reassignTransactionCategory } from './transactions-model';

describe('buildTransactionsScreenState', () => {
  it('groups transactions by posting date and exposes the review queue count', () => {
    const screenState = buildTransactionsScreenState(createMockCoreProductState(), 'all', {
      asOf: '2026-03-27T08:00:00.000Z',
    });

    expect(screenState.reviewQueueCount).toBe(2);
    expect(screenState.groups).toHaveLength(4);
    expect(screenState.groups[0]).toMatchObject({
      dateLabel: '27 Mar 2026',
      heading: 'Today',
      transactionCount: 1,
    });
    expect(screenState.groups[0]?.transactions[0]).toMatchObject({
      categoryName: 'Subscriptions',
      id: 'txn-006',
    });
  });

  it('filters the list down to needs-review rows when requested', () => {
    const screenState = buildTransactionsScreenState(createMockCoreProductState(), 'needs_review', {
      asOf: '2026-03-27T08:00:00.000Z',
    });

    expect(screenState.groups).toHaveLength(2);
    expect(screenState.groups.flatMap((group) => group.transactions).map((transaction) => transaction.id)).toEqual([
      'txn-004',
      'txn-002',
    ]);
  });

  it('projects source attribution and UPI review counts without splitting the ledger view', () => {
    const state = createMockCoreProductState();
    const screenState = buildTransactionsScreenState(
      {
        ...state,
        transactions: [
          {
            ...state.transactions[1],
            id: 'txn-upi-1',
            merchant: 'Uber',
            ownerDisplayName: 'Spouse',
            ownerScope: 'member',
            reviewReason: 'owner_conflict',
            reviewReasons: ['owner_conflict'],
            sourceContextLabel: 'Meta test number',
            sourceLabel: 'WhatsApp UPI',
            sourceType: 'upi_whatsapp',
          },
          ...state.transactions,
        ],
      },
      'needs_review',
      {
        asOf: '2026-03-27T08:00:00.000Z',
      }
    );

    expect(screenState.sourceSummary).toEqual({
      creditCardCount: 6,
      upiCount: 1,
      upiReviewCount: 1,
    });
    expect(screenState.groups.flatMap((group) => group.transactions)[0]).toMatchObject({
      id: 'txn-upi-1',
      ownerDisplayName: 'Spouse',
      sourceBadge: 'UPI',
      sourceLabel: 'WhatsApp UPI',
    });
  });

  it('applies analytics drill-down filters explicitly across category, source, search, and period', () => {
    const state = createMockCoreProductState();
    const screenState = buildTransactionsScreenState(
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
          ...state.transactions,
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

    expect(screenState.filterSummary).toEqual([
      'Food & Dining',
      'WhatsApp UPI',
      'Mar 2026',
      'Search: tokai',
    ]);
    expect(screenState.groups).toHaveLength(1);
    expect(screenState.groups[0]).toMatchObject({
      heading: 'Today',
      transactionCount: 1,
    });
    expect(screenState.groups[0]?.transactions[0]).toMatchObject({
      id: 'txn-upi-analytics',
      sourceBadge: 'UPI',
    });
  });

  it('preserves analytics evidence drill-downs by transaction id and person ownership', () => {
    const state = createMockCoreProductState();
    const screenState = buildTransactionsScreenState(
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

    expect(screenState.groups.flatMap((group) => group.transactions).map((transaction) => transaction.id)).toEqual([
      'txn-005',
      'txn-004',
    ]);
    expect(screenState.filterSummary).toEqual(['Ishan', 'Focused evidence set']);
  });
});

describe('reassignTransactionCategory', () => {
  it('returns a new state object, updates the category, and clears the review flag', () => {
    const currentState = createMockCoreProductState();
    const nextState = reassignTransactionCategory(currentState, 'txn-002', 'food-dining');

    expect(nextState).not.toBe(currentState);
    expect(nextState.transactions).not.toBe(currentState.transactions);
    expect(currentState.transactions.find((transaction) => transaction.id === 'txn-002')).toMatchObject({
      categoryId: 'transport',
      needsReview: true,
    });
    expect(nextState.transactions.find((transaction) => transaction.id === 'txn-002')).toMatchObject({
      categoryId: 'food-dining',
      needsReview: false,
      reviewReason: null,
    });
  });
});
