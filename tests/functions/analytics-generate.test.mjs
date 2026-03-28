import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANALYTICS_PIPELINE_SECRET_HEADER,
  handleAnalyticsGenerateRequest,
} from '../../supabase/functions/_shared/analytics-generate.ts';

const householdId = '11111111-1111-4111-8111-111111111111';

test('handleAnalyticsGenerateRequest rejects missing analytics pipeline auth', async () => {
  const request = new Request('http://localhost/functions/v1/analytics-generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      endOn: '2026-03-31',
      householdId,
      startOn: '2026-03-01',
    }),
  });

  const response = await handleAnalyticsGenerateRequest(request, {
    repository: {
      listAnalyticsFacts: async () => [],
      saveOutputs: async () => ({ insightCount: 0, reportId: null }),
    },
    webhookSecret: 'super-secret',
  });

  assert.equal(response.status, 401);
});

test('handleAnalyticsGenerateRequest persists explainable insights and a deep report from the same signal bundle', async () => {
  let capturedLoad = null;
  let capturedSave = null;
  const request = new Request('http://localhost/functions/v1/analytics-generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [ANALYTICS_PIPELINE_SECRET_HEADER]: 'super-secret',
    },
    body: JSON.stringify({
      endOn: '2026-03-31',
      householdId,
      reportType: 'monthly',
      startOn: '2026-03-01',
    }),
  });

  const response = await handleAnalyticsGenerateRequest(request, {
    now: () => '2026-03-28T05:45:00.000Z',
    repository: {
      async listAnalyticsFacts(input) {
        capturedLoad = input;
        return [
          createFact({
            amount: 1800,
            categoryName: 'Food & Dining',
            id: 'food-1',
            merchantName: 'Swiggy',
            transactionDate: '2026-03-05',
          }),
          createFact({
            amount: 900,
            categoryName: 'Food & Dining',
            id: 'food-2',
            merchantName: 'Swiggy',
            transactionDate: '2026-02-06',
          }),
          createFact({
            amount: 129,
            categoryName: 'Subscriptions',
            id: 'sub-1',
            merchantName: 'YouTube Premium',
            paymentSourceLabel: 'Amex MRCC',
            transactionDate: '2026-02-17',
          }),
          createFact({
            amount: 129,
            categoryName: 'Subscriptions',
            id: 'sub-2',
            merchantName: 'YouTube Premium',
            paymentSourceLabel: 'Amex MRCC',
            transactionDate: '2026-03-17',
          }),
          createFact({
            amount: 129,
            categoryName: 'Subscriptions',
            id: 'sub-3',
            merchantName: 'YouTube Premium',
            paymentSourceLabel: 'HDFC Millennia',
            transactionDate: '2026-03-18',
          }),
          createFact({
            amount: 4200,
            categoryName: 'Shopping',
            id: 'shop-1',
            merchantName: 'Croma',
            transactionDate: '2026-03-22',
          }),
          createFact({
            amount: 700,
            categoryName: 'Shopping',
            id: 'shop-2',
            merchantName: 'Croma',
            transactionDate: '2026-02-10',
          }),
        ];
      },
      async saveOutputs(input) {
        capturedSave = input;
        return {
          insightCount: input.insights.length,
          reportId: 'report-123',
        };
      },
    },
    webhookSecret: 'super-secret',
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(capturedLoad, {
    comparisonEndOn: '2026-02-28',
    comparisonStartOn: '2026-02-01',
    endOn: '2026-03-31',
    householdId,
    startOn: '2025-03-31',
  });
  assert.equal(capturedSave.householdId, householdId);
  assert.equal(capturedSave.insights.length >= 2, true);
  assert.equal(capturedSave.report.reportType, 'monthly');
  assert.equal(capturedSave.report.payload.sections[0].insightIds.length > 0, true);
  assert.equal(capturedSave.insights[0].generatedFrom.source, 'deterministic');
  assert.equal(Array.isArray(capturedSave.insights[0].evidencePayload), true);
  assert.deepEqual(body, {
    success: true,
    data: {
      insightCount: capturedSave.insights.length,
      reportId: 'report-123',
    },
  });
});

function createFact(overrides) {
  return {
    amount: 0,
    categoryId: null,
    categoryName: 'Uncategorized',
    id: 'fact-id',
    merchantName: 'Unknown merchant',
    needsReview: false,
    ownerDisplayName: 'Ishan',
    ownerMemberId: 'member-1',
    ownerScope: 'member',
    paymentSourceLabel: 'Amex MRCC',
    sourceType: 'credit_card_statement',
    status: 'processed',
    transactionDate: '2026-03-01',
    transactionMonth: '2026-03-01',
    ...overrides,
    transactionMonth: `${String(overrides.transactionDate ?? '2026-03-01').slice(0, 7)}-01`,
  };
}
