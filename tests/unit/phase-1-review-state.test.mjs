import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockCoreProductState } from '../../apps/mobile/src/features/core-product/core-product-state.ts';
import { projectPhase1TransactionsToLedgerTransactions } from '../../apps/mobile/src/features/core-product/phase-1-ledger-projection.ts';
import { createDashboardSnapshot } from '../../apps/mobile/src/features/dashboard/dashboard-model.ts';
import {
  buildTransactionsScreenState,
  reassignTransactionCategory,
} from '../../apps/mobile/src/features/transactions/transactions-model.ts';

test('Phase 1 review state highlights low-confidence rows across dashboard and transactions', () => {
  const state = createMockCoreProductState();
  const dashboard = createDashboardSnapshot(state, state.asOf);
  const transactionsScreen = buildTransactionsScreenState(state, 'needs_review');

  assert.equal(dashboard.totals.reviewQueueCount, 2);
  assert.equal(dashboard.totals.reviewQueueAmount, 4079);
  assert.equal(dashboard.alerts[0]?.id, 'review-queue');
  assert.equal(transactionsScreen.reviewQueueCount, 2);
  assert.equal(transactionsScreen.groups.length, 2);
  assert.equal(transactionsScreen.groups[0]?.transactions[0]?.merchant, 'Google One');
  assert.equal(transactionsScreen.groups[1]?.transactions[0]?.merchant, 'Uber India');
});

test('Phase 1 review reassignment clears review flags without mutating the previous state', () => {
  const state = createMockCoreProductState();
  const nextState = reassignTransactionCategory(state, 'txn-004', 'subscriptions');
  const dashboard = createDashboardSnapshot(nextState, nextState.asOf);
  const transactionsScreen = buildTransactionsScreenState(nextState, 'needs_review');

  assert.equal(state.transactions.find((transaction) => transaction.id === 'txn-004')?.needsReview, true);
  assert.equal(nextState.transactions.find((transaction) => transaction.id === 'txn-004')?.needsReview, false);
  assert.equal(nextState.transactions.find((transaction) => transaction.id === 'txn-004')?.categoryId, 'subscriptions');
  assert.equal(dashboard.totals.reviewQueueCount, 1);
  assert.equal(transactionsScreen.reviewQueueCount, 1);
});

test('Phase 1 ledger projection preserves review fields from ingested rows', () => {
  const [transaction] = projectPhase1TransactionsToLedgerTransactions(
    [
      {
        amount: 879,
        confidence: 0.44,
        merchantRaw: 'Google One',
        metadata: {
          cardName: 'HDFC Regalia Gold',
          statementLabel: 'HDFC Apr 2026',
        },
        needsReview: true,
        reviewReason: 'The parser could not distinguish between subscriptions and utilities.',
        transactionDate: '2026-04-20',
      },
    ],
    {
      cardLabel: 'Fallback Card',
      categoryId: 'uncategorized',
      statementLabel: 'Fallback Statement',
    },
  );

  assert.deepEqual(transaction, {
    amount: 879,
    cardLabel: 'HDFC Regalia Gold',
    categoryId: 'uncategorized',
    confidence: 0.44,
    id: 'phase-1-ingested-1',
    merchant: 'Google One',
    needsReview: true,
    ownerDisplayName: null,
    ownerMemberId: null,
    ownerScope: 'unknown',
    postedAt: '2026-04-20T08:00:00.000Z',
    reviewReason: 'The parser could not distinguish between subscriptions and utilities.',
    reviewReasons: [],
    sourceContextLabel: 'HDFC Apr 2026',
    sourceLabel: 'HDFC Regalia Gold',
    sourceType: 'credit_card_statement',
    statementLabel: 'HDFC Apr 2026',
  });
});
