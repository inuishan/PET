import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTransactionsScreenState,
  reassignTransactionCategory,
} from '../../apps/mobile/src/features/transactions/transactions-model.ts';
import {
  loadTransactionsSnapshot,
  saveTransactionCategoryAssignment,
} from '../../apps/mobile/src/features/transactions/transactions-service.ts';

test('Phase 1 live transaction reassignment clears the review queue and keeps detail state in sync', async () => {
  const householdId = '11111111-1111-4111-8111-111111111111';
  const recordedRpcCalls = [];
  const client = createTransactionsClient({
    categories: [
      {
        household_id: null,
        id: 'category-uncategorized',
        is_system: true,
        name: 'Uncategorized',
        sort_order: 10,
      },
      {
        household_id: null,
        id: 'category-subscriptions',
        is_system: true,
        name: 'Subscriptions',
        sort_order: 20,
      },
    ],
    onRpc(name, args) {
      recordedRpcCalls.push({ args, name });
      return {
        data: {
          transactionId: args.target_transaction_id,
        },
        error: null,
      };
    },
    transactions: [
      {
        amount: '879.00',
        category_id: 'category-uncategorized',
        confidence: '0.44',
        id: 'transaction-1',
        merchant_raw: 'Google One',
        metadata: {
          cardName: 'HDFC Regalia Gold',
        },
        needs_review: true,
        posted_at: '2026-03-26',
        review_reason: 'Needs manual confirmation.',
        statement_uploads: {
          bank_name: 'HDFC',
          billing_period_end: '2026-03-31',
          card_name: 'Regalia Gold',
        },
        transaction_date: '2026-03-26',
      },
      {
        amount: '1299.00',
        category_id: 'category-subscriptions',
        confidence: '0.96',
        id: 'transaction-2',
        merchant_raw: 'Spotify',
        metadata: {
          cardName: 'Amex MRCC',
          statementLabel: 'Amex Mar 2026',
        },
        needs_review: false,
        posted_at: '2026-03-27',
        review_reason: null,
        statement_uploads: null,
        transaction_date: '2026-03-27',
      },
    ],
  });

  const loadedSnapshot = await loadTransactionsSnapshot(client, householdId);
  const reviewQueueBefore = buildTransactionsScreenState(loadedSnapshot, 'needs_review');

  assert.equal(reviewQueueBefore.reviewQueueCount, 1);
  assert.equal(reviewQueueBefore.groups[0]?.transactions[0]?.merchant, 'Google One');

  await saveTransactionCategoryAssignment(client, {
    categoryId: 'category-subscriptions',
    transactionId: 'transaction-1',
  });

  const nextSnapshot = reassignTransactionCategory(
    loadedSnapshot,
    'transaction-1',
    'category-subscriptions',
  );
  const reviewQueueAfter = buildTransactionsScreenState(nextSnapshot, 'needs_review');
  const allRowsAfter = buildTransactionsScreenState(nextSnapshot, 'all');

  assert.deepEqual(recordedRpcCalls, [
    {
      args: {
        next_category_id: 'category-subscriptions',
        target_transaction_id: 'transaction-1',
      },
      name: 'reassign_transaction_category',
    },
  ]);
  assert.equal(reviewQueueAfter.reviewQueueCount, 0);
  assert.equal(reviewQueueAfter.groups.length, 0);
  assert.equal(allRowsAfter.reviewQueueCount, 0);
  assert.equal(allRowsAfter.groups[1]?.transactions[0]?.categoryName, 'Subscriptions');
  assert.equal(
    nextSnapshot.transactions.find((transaction) => transaction.id === 'transaction-1')?.reviewReason,
    null,
  );
});

function createTransactionsClient({ categories, onRpc, transactions }) {
  return {
    from(table) {
      if (table === 'categories') {
        return {
          select() {
            return createBuilder(categories);
          },
        };
      }

      return {
        select() {
          return createBuilder(transactions);
        },
      };
    },
    rpc(name, args) {
      return Promise.resolve(onRpc(name, args));
    },
  };
}

function createBuilder(data) {
  const builder = {
    eq() {
      return builder;
    },
    order() {
      return builder;
    },
    then(onFulfilled) {
      return Promise.resolve(onFulfilled({ data, error: null }));
    },
  };

  return builder;
}
