import { describe, expect, it } from 'vitest';

import { createMockCoreProductState } from '@/features/core-product/core-product-state';

import { buildTransactionsScreenState, reassignTransactionCategory } from './transactions-model';

describe('buildTransactionsScreenState', () => {
  it('groups transactions by posting date and exposes the review queue count', () => {
    const screenState = buildTransactionsScreenState(createMockCoreProductState(), 'all');

    expect(screenState.reviewQueueCount).toBe(2);
    expect(screenState.groups).toHaveLength(4);
    expect(screenState.groups[0]).toMatchObject({
      dateLabel: '27 Mar 2026',
      transactionCount: 1,
    });
    expect(screenState.groups[0]?.transactions[0]).toMatchObject({
      categoryName: 'Subscriptions',
      id: 'txn-006',
    });
  });

  it('filters the list down to needs-review rows when requested', () => {
    const screenState = buildTransactionsScreenState(createMockCoreProductState(), 'needs_review');

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
      'needs_review'
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
