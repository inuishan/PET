import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAppSessionFromAuthSession,
  startGoogleOAuthSignIn,
} from '../../apps/mobile/src/features/auth/auth-service.ts';
import { getDefaultAuthenticatedHref } from '../../apps/mobile/src/features/auth/auth-routing.ts';
import { createHouseholdSetup } from '../../apps/mobile/src/features/household/household-session.ts';
import { createMockCoreProductState } from '../../apps/mobile/src/features/core-product/core-product-state.ts';
import { projectPhase1TransactionsToLedgerTransactions } from '../../apps/mobile/src/features/core-product/phase-1-ledger-projection.ts';
import { createDashboardSnapshot } from '../../apps/mobile/src/features/dashboard/dashboard-model.ts';
import {
  buildTransactionsScreenState,
  reassignTransactionCategory,
} from '../../apps/mobile/src/features/transactions/transactions-model.ts';
import { handleStatementIngestRequest } from '../../supabase/functions/_shared/statement-ingest.mjs';

test('E2E Phase 1 journey signs in, routes through onboarding, and lands on tabs after household setup', async () => {
  const signInResult = await startGoogleOAuthSignIn({
    createRedirectUrl: () => 'mobile://auth/callback',
    exchangeCodeForSession: async () => ({ error: null }),
    openAuthSession: async () => ({
      type: 'success',
      url: 'mobile://auth/callback?code=phase-1-code',
    }),
    signInWithOAuth: async () => ({
      data: {
        url: 'https://supabase.example.com/auth?provider=google',
      },
      error: null,
    }),
  });

  const signedInSession = await buildAppSessionFromAuthSession(
    {
      user: {
        email: 'ishan@example.com',
        id: '6d89bfa7-ec67-4ed7-b72f-4aa1fcd0e6e9',
      },
    },
    async () => ({
      displayName: null,
      householdId: null,
      householdName: null,
      inviteCode: null,
      inviteExpiresAt: null,
      role: null,
      status: 'needs_household',
    }),
  );

  const readyHousehold = await createHouseholdSetup(
    {
      from() {
        throw new Error('household creation uses RPC only');
      },
      async rpc() {
        return {
          data: {
            displayName: 'Ishan',
            householdId: '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8',
            householdName: 'Sharma Household',
            inviteCode: 'AB12CD34EF56',
            inviteExpiresAt: '2026-04-03T10:00:00.000Z',
            role: 'owner',
            status: 'ready',
          },
          error: null,
        };
      },
    },
    {
      displayName: ' Ishan ',
      householdName: ' Sharma Household ',
    },
  );

  assert.deepEqual(signInResult, { ok: true });
  assert.equal(
    getDefaultAuthenticatedHref({
      authStatus: signedInSession.status,
      householdStatus: signedInSession.household.status,
    }),
    '/(onboarding)/household',
  );
  assert.equal(
    getDefaultAuthenticatedHref({
      authStatus: 'signed_in',
      householdStatus: readyHousehold.status,
    }),
    '/(tabs)',
  );
});

test('E2E Phase 1 journey ingests a statement, exposes review rows, and clears them after recategorization', async () => {
  const captured = {
    transactions: null,
  };

  const response = await handleStatementIngestRequest(
    new Request('http://localhost/functions/v1/statement-ingest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-statement-pipeline-secret': 'super-secret',
      },
      body: JSON.stringify({
        statement: {
          householdId: '11111111-1111-4111-8111-111111111111',
          uploadedBy: '22222222-2222-4222-8222-222222222222',
          providerFileId: 'drive-file-789',
          providerFileName: 'icici-april-2026.pdf',
          bankName: 'ICICI Bank',
          cardName: 'Amazon Pay',
          parserProfileName: 'icici-amazon-pay',
          billingPeriodStart: '2026-04-01',
          billingPeriodEnd: '2026-04-30',
        },
        rows: [
          {
            merchant: 'Nature Basket',
            amount: '5400',
            transactionDate: '2026-04-19',
            confidence: 0.9,
          },
          {
            merchant: 'Google One',
            amount: '879',
            transactionDate: '2026-04-20',
            confidence: 0.44,
            reviewReason: 'The parser could not distinguish between subscriptions and utilities.',
          },
        ],
      }),
    }),
    {
      repository: {
        async ingestStatement(_statementUpload, transactions) {
          captured.transactions = transactions;
          return { id: 'upload-901' };
        },
      },
      webhookSecret: 'super-secret',
    },
  );

  const baseState = createMockCoreProductState();
  const ingestedState = {
    ...baseState,
    asOf: '2026-04-21T12:00:00.000Z',
    sync: {
      ...baseState.sync,
      failureCount: 0,
      lastError: null,
      lastSuccessfulSyncAt: '2026-04-21T11:50:00.000Z',
      pendingStatementCount: 0,
      status: 'healthy',
    },
    transactions: projectPhase1TransactionsToLedgerTransactions(
      captured.transactions.map((transaction, index) => ({
        ...transaction,
        categoryId: index === 0 ? 'groceries' : 'uncategorized',
        id: `e2e-ingested-${index + 1}`,
      })),
      {
        cardLabel: 'ICICI Amazon Pay',
        categoryId: 'uncategorized',
        statementLabel: 'ICICI Apr 2026',
      },
    ),
  };
  const reviewState = buildTransactionsScreenState(ingestedState, 'needs_review');
  const reviewedState = reassignTransactionCategory(ingestedState, 'e2e-ingested-2', 'subscriptions');
  const reviewedDashboard = createDashboardSnapshot(reviewedState, reviewedState.asOf);

  assert.equal(response.status, 200);
  assert.equal(reviewState.reviewQueueCount, 1);
  assert.equal(reviewState.groups[0]?.transactions[0]?.merchant, 'Google One');
  assert.equal(reviewedDashboard.totals.reviewQueueCount, 0);
  assert.equal(
    reviewedState.transactions.find((transaction) => transaction.id === 'e2e-ingested-2')?.categoryId,
    'subscriptions',
  );
});
