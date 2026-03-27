import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockCoreProductState } from '../../apps/mobile/src/features/core-product/core-product-state.ts';
import { projectPhase1TransactionsToLedgerTransactions } from '../../apps/mobile/src/features/core-product/phase-1-ledger-projection.ts';
import { createDashboardSnapshot } from '../../apps/mobile/src/features/dashboard/dashboard-model.ts';
import { buildTransactionsScreenState } from '../../apps/mobile/src/features/transactions/transactions-model.ts';
import { handleStatementIngestRequest } from '../../supabase/functions/_shared/statement-ingest.mjs';

test('Phase 1 statement ingestion drives dashboard totals and the review queue', async () => {
  const captured = {
    statementUpload: null,
    transactions: null,
  };

  const response = await handleStatementIngestRequest(
    new Request('http://localhost/functions/v1/statement-ingest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-statement-pipeline-secret': 'super-secret',
      },
      body: JSON.stringify(createIngestPayload()),
    }),
    {
      repository: {
        async ingestStatement(statementUpload, transactions) {
          captured.statementUpload = statementUpload;
          captured.transactions = transactions;
          return { id: 'upload-789' };
        },
      },
      webhookSecret: 'super-secret',
    },
  );

  const body = await response.json();
  const coreState = buildCoreProductState(captured.transactions);
  const dashboard = createDashboardSnapshot(coreState, coreState.asOf);
  const transactionsScreen = buildTransactionsScreenState(coreState, 'needs_review');

  assert.equal(response.status, 200);
  assert.equal(body.data.statementUploadId, 'upload-789');
  assert.equal(body.data.transactionCount, 2);
  assert.equal(body.data.skippedRowCount, 1);
  assert.equal(captured.statementUpload.parseStatus, 'partial');
  assert.equal(captured.transactions[1].needsReview, true);
  assert.equal(dashboard.totals.reviewQueueCount, 1);
  assert.equal(dashboard.totals.reviewQueueAmount, 399);
  assert.equal(transactionsScreen.reviewQueueCount, 1);
  assert.equal(transactionsScreen.groups[0]?.transactions[0]?.merchant, 'Unknown Merchant');
});

function buildCoreProductState(transactions) {
  const baseState = createMockCoreProductState();

  return {
    ...baseState,
    asOf: '2026-04-21T12:00:00.000Z',
    sync: {
      ...baseState.sync,
      failureCount: 0,
      lastError: null,
      lastSuccessfulSyncAt: '2026-04-21T11:30:00.000Z',
      pendingStatementCount: 0,
      status: 'healthy',
    },
    transactions: projectPhase1TransactionsToLedgerTransactions(transactions, {
      cardLabel: 'HDFC Regalia Gold',
      categoryId: 'uncategorized',
      statementLabel: 'HDFC Apr 2026',
    }),
  };
}

function createIngestPayload() {
  return {
    statement: {
      householdId: '11111111-1111-4111-8111-111111111111',
      uploadedBy: '22222222-2222-4222-8222-222222222222',
      providerFileId: 'drive-file-456',
      providerFileName: 'hdfc-april-2026.pdf',
      bankName: 'HDFC Bank',
      cardName: 'Regalia Gold',
      parserProfileName: 'hdfc-regalia-gold',
      billingPeriodStart: '2026-04-01',
      billingPeriodEnd: '2026-04-30',
    },
    rows: [
      {
        merchant: 'Swiggy',
        description: 'Food order',
        amount: '1234.50',
        transactionDate: '2026-04-12',
        confidence: 0.91,
      },
      {
        merchant: 'Unknown Merchant',
        description: 'Charge',
        amount: '399',
        transactionDate: '2026-04-18',
        confidence: 0.42,
      },
      {
        merchant: 'Card Payment',
        amount: '(5,000.00)',
        transactionDate: '2026-04-20',
        confidence: 0.88,
      },
    ],
  };
}
