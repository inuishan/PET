import { describe, expect, it, vi } from 'vitest';

import {
  loadTransactionsSnapshot,
  saveTransactionCategoryAssignment,
  type TransactionsClient,
} from './transactions-service';

function createSelectBuilder<T>(data: T, error: { message: string } | null = null) {
  const builder = {
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (onFulfilled: (value: { data: T; error: { message: string } | null }) => unknown) =>
      Promise.resolve(onFulfilled({ data, error })),
  };

  return builder;
}

describe('loadTransactionsSnapshot', () => {
  it('loads the household categories and transactions from Supabase', async () => {
    const categoriesBuilder = createSelectBuilder([
      {
        household_id: null,
        id: 'category-food',
        is_system: true,
        name: 'Food & Dining',
        sort_order: 10,
      },
      {
        household_id: '11111111-1111-4111-8111-111111111111',
        id: 'category-subscriptions',
        is_system: false,
        name: 'Subscriptions',
        sort_order: 20,
      },
    ]);
    const transactionsBuilder = createSelectBuilder([
      {
        amount: '879.00',
        category_id: 'category-subscriptions',
        confidence: '0.44',
        id: 'transaction-1',
        merchant_raw: 'Google One',
        metadata: {
          cardName: 'HDFC Regalia Gold',
          statementLabel: 'HDFC Mar 2026',
        },
        needs_review: true,
        owner_member: null,
        owner_scope: 'unknown',
        posted_at: null,
        review_reason: 'Needs manual confirmation.',
        source_reference: null,
        source_type: 'credit_card_statement',
        statement_uploads: null,
        transaction_date: '2026-03-26',
      },
      {
        amount: '245.00',
        category_id: 'category-food',
        confidence: '0.62',
        id: 'transaction-2',
        merchant_raw: 'Zepto',
        metadata: {
          reviewReasons: ['owner_conflict'],
        },
        needs_review: true,
        owner_member: {
          display_name: 'Ishan',
          id: 'member-1',
        },
        owner_scope: 'member',
        posted_at: '2026-03-27',
        review_reason: 'owner_conflict',
        source_reference: 'wamid.message-2',
        source_type: 'upi_whatsapp',
        statement_uploads: null,
        transaction_date: '2026-03-27',
      },
    ]);
    const client: TransactionsClient = {
      from: vi.fn((table) => ({
        select: vi.fn(() => (table === 'categories' ? categoriesBuilder : transactionsBuilder)),
      })),
      rpc: vi.fn(),
    };

    await expect(
      loadTransactionsSnapshot(client, '11111111-1111-4111-8111-111111111111')
    ).resolves.toEqual({
      categories: [
        { id: 'category-food', name: 'Food & Dining', tone: 'slate' },
        { id: 'category-subscriptions', name: 'Subscriptions', tone: 'slate' },
      ],
      transactions: [
        {
          amount: 879,
          categoryId: 'category-subscriptions',
          confidence: 0.44,
          id: 'transaction-1',
          merchant: 'Google One',
          needsReview: true,
          ownerDisplayName: null,
          ownerMemberId: null,
          ownerScope: 'unknown',
          postedAt: '2026-03-26T08:00:00.000Z',
          reviewReason: 'Needs manual confirmation.',
          reviewReasons: [],
          sourceContextLabel: 'HDFC Mar 2026',
          sourceLabel: 'HDFC Regalia Gold',
          sourceType: 'credit_card_statement',
        },
        {
          amount: 245,
          categoryId: 'category-food',
          confidence: 0.62,
          id: 'transaction-2',
          merchant: 'Zepto',
          needsReview: true,
          ownerDisplayName: 'Ishan',
          ownerMemberId: 'member-1',
          ownerScope: 'member',
          postedAt: '2026-03-27T08:00:00.000Z',
          reviewReason: 'owner_conflict',
          reviewReasons: ['owner_conflict'],
          sourceContextLabel: 'Meta test number',
          sourceLabel: 'WhatsApp UPI',
          sourceType: 'upi_whatsapp',
        },
      ],
    });

    expect(categoriesBuilder.order).toHaveBeenCalledWith('sort_order', { ascending: true });
    expect(categoriesBuilder.order).toHaveBeenCalledWith('name', { ascending: true });
    expect(transactionsBuilder.eq).toHaveBeenCalledWith('household_id', '11111111-1111-4111-8111-111111111111');
    expect(transactionsBuilder.order).toHaveBeenCalledWith('transaction_date', { ascending: false });
    expect(transactionsBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('falls back to statement upload metadata when transaction metadata omits labels', async () => {
    const categoriesBuilder = createSelectBuilder([
      {
        household_id: null,
        id: 'category-utilities',
        is_system: true,
        name: 'Bills & Utilities',
        sort_order: 10,
      },
    ]);
    const transactionsBuilder = createSelectBuilder([
      {
        amount: 1200,
        category_id: 'category-utilities',
        confidence: null,
        id: 'transaction-2',
        merchant_raw: 'BSES Rajdhani',
        metadata: {},
        needs_review: false,
        owner_member: null,
        owner_scope: 'unknown',
        posted_at: '2026-03-25',
        review_reason: null,
        source_reference: null,
        source_type: 'credit_card_statement',
        statement_uploads: {
          bank_name: 'HDFC',
          billing_period_end: '2026-03-31',
          card_name: 'Regalia Gold',
        },
        transaction_date: '2026-03-24',
      },
    ]);
    const client: TransactionsClient = {
      from: vi.fn((table) => ({
        select: vi.fn(() => (table === 'categories' ? categoriesBuilder : transactionsBuilder)),
      })),
      rpc: vi.fn(),
    };

    await expect(
      loadTransactionsSnapshot(client, '11111111-1111-4111-8111-111111111111')
    ).resolves.toMatchObject({
      transactions: [
        {
          postedAt: '2026-03-25T08:00:00.000Z',
          sourceContextLabel: 'HDFC Mar 2026',
          sourceLabel: 'Regalia Gold',
        },
      ],
    });
  });
});

describe('saveTransactionCategoryAssignment', () => {
  it('persists the reassignment through the review-clearing RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        transactionId: 'transaction-1',
      },
      error: null,
    });
    const client: TransactionsClient = {
      from: vi.fn(),
      rpc,
    };

    await expect(
      saveTransactionCategoryAssignment(client, {
        categoryId: 'category-subscriptions',
        transactionId: 'transaction-1',
      })
    ).resolves.toEqual({
      transactionId: 'transaction-1',
    });

    expect(rpc).toHaveBeenCalledWith('reassign_transaction_category', {
      next_category_id: 'category-subscriptions',
      target_transaction_id: 'transaction-1',
    });
  });
});
