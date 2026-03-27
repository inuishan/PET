import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSupabaseStatementRepository,
  handleStatementIngestRequest,
} from '../../supabase/functions/_shared/statement-ingest.mjs';

const payload = {
  statement: {
    householdId: '11111111-1111-4111-8111-111111111111',
    uploadedBy: '22222222-2222-4222-8222-222222222222',
    providerFileId: 'drive-file-123',
    providerFileName: 'hdfc-april-2026.pdf',
    bankName: 'HDFC Bank',
    cardName: 'Regalia Gold',
    parserProfileName: 'hdfc-regalia-gold',
    statementPasswordKey: 'cards/hdfc-regalia',
    billingPeriodStart: '2026-04-01',
    billingPeriodEnd: '2026-04-30',
    parseConfidence: 0.84,
    rawMetadata: {
      driveFolderId: 'folder-123',
    },
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

test('handleStatementIngestRequest rejects missing webhook auth', async () => {
  const request = new Request('http://localhost/functions/v1/statement-ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const response = await handleStatementIngestRequest(request, {
    webhookSecret: 'super-secret',
    repository: {
      ingestStatement: async () => ({ id: 'upload-123' }),
    },
  });

  assert.equal(response.status, 401);
});

test('handleStatementIngestRequest persists statement metadata and normalized rows', async () => {
  const captured = {
    statementUpload: null,
    transactions: null,
  };

  const request = new Request('http://localhost/functions/v1/statement-ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-statement-pipeline-secret': 'super-secret',
    },
    body: JSON.stringify(payload),
  });

  const response = await handleStatementIngestRequest(request, {
    webhookSecret: 'super-secret',
    repository: {
      ingestStatement: async (statementUpload, transactions) => {
        captured.statementUpload = statementUpload;
        captured.transactions = transactions;
        return { id: 'upload-123' };
      },
    },
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.statementUploadId, 'upload-123');
  assert.equal(body.data.transactionCount, 2);
  assert.equal(body.data.skippedRowCount, 1);
  assert.equal(body.data.parseStatus, 'partial');
  assert.equal(captured.statementUpload.parseStatus, 'partial');
  assert.equal(captured.statementUpload.rawMetadata.skippedRows[0].reason, 'non_expense_amount');
  assert.equal(captured.transactions.length, 2);
  assert.equal('statementUploadId' in captured.transactions[0], false);
  assert.equal(captured.transactions[1].needsReview, true);
});

test('handleStatementIngestRequest surfaces repository errors without leaking internals', async () => {
  const request = new Request('http://localhost/functions/v1/statement-ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-statement-pipeline-secret': 'super-secret',
    },
    body: JSON.stringify(payload),
  });

  const response = await handleStatementIngestRequest(request, {
    webhookSecret: 'super-secret',
    repository: {
      ingestStatement: async () => {
        throw new Error('database timeout while talking to primary');
      },
    },
  });

  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'statement_ingest_failed');
  assert.match(body.error.message, /persist/i);
});

test('createSupabaseStatementRepository uses one RPC call for statement and transactions', async () => {
  const calls = [];
  const repository = createSupabaseStatementRepository({
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: { id: 'upload-456' }, error: null };
    },
  });

  const result = await repository.ingestStatement(
    {
      householdId: payload.statement.householdId,
      providerFileId: payload.statement.providerFileId,
      providerFileName: payload.statement.providerFileName,
      sourceProvider: 'google_drive',
      parseStatus: 'partial',
      parseConfidence: 0.84,
      rawMetadata: {},
    },
    [
      {
        householdId: payload.statement.householdId,
        ownerScope: 'unknown',
        sourceType: 'credit_card_statement',
        merchantRaw: 'Swiggy',
        merchantNormalized: 'swiggy',
        amount: 1234.5,
        currency: 'INR',
        transactionDate: '2026-04-12',
        status: 'processed',
        needsReview: false,
        classificationMethod: 'llm',
        fingerprint: 'fp-123',
        metadata: {},
      },
    ],
  );

  assert.deepEqual(result, { id: 'upload-456' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'ingest_statement_payload');
  assert.equal(calls[0].args.statement_upload_payload.household_id, payload.statement.householdId);
  assert.equal(calls[0].args.transaction_rows_payload[0].merchant_raw, 'Swiggy');
});
