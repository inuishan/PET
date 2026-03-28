import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadAnalyticsReport,
  loadAnalyticsSnapshot,
} from '../../apps/mobile/src/features/analytics/analytics-service.ts';

test('Phase 3 analytics service normalizes the snapshot payload from Supabase RPCs', async () => {
  const recordedRpcCalls = [];
  const client = {
    rpc(name, args) {
      recordedRpcCalls.push({ args, name });

      return Promise.resolve({
        data: {
          categoryAllocation: [
            {
              categoryId: 'category-groceries',
              categoryName: 'Groceries',
              reviewCount: 1,
              shareBps: '3880',
              totalSpend: '9820.50',
              transactionCount: 12,
            },
          ],
          comparison: {
            currentSpend: '25300.00',
            currentTransactionCount: '18',
            deltaPercentage: '11.6',
            deltaSpend: '2630.00',
            previousSpend: '22670.00',
            previousTransactionCount: '15',
          },
          householdId: '11111111-1111-4111-8111-111111111111',
          insights: [
            {
              estimatedMonthlyImpact: '1200.00',
              generatedAt: '2026-03-28T05:40:00.000Z',
              id: 'insight-1',
              recommendation: 'Shift one weekly grocery basket to the lower-priced store.',
              summary: 'Groceries rose faster than overall household spend.',
              title: 'Groceries are outpacing the rest of the ledger',
              type: 'savings_opportunity',
            },
          ],
          latestReport: {
            generatedAt: '2026-03-28T05:45:00.000Z',
            id: 'report-1',
            periodEnd: '2026-03-31',
            periodStart: '2026-03-01',
            title: 'March savings report',
          },
          period: {
            bucket: 'month',
            comparisonEndOn: '2026-02-29',
            comparisonStartOn: '2026-02-01',
            endOn: '2026-03-31',
            startOn: '2026-03-01',
          },
          recurringChargeCandidates: [
            {
              averageAmount: '1299.00',
              averageCadenceDays: '30',
              categoryName: 'Subscriptions',
              lastChargedOn: '2026-03-18',
              merchantName: 'Spotify',
              monthsActive: '3',
              paymentSourceLabel: 'Amex MRCC',
              transactionCount: '3',
            },
          ],
          spendByPaymentSource: [
            {
              paymentSourceLabel: 'WhatsApp UPI',
              shareBps: 2190,
              sourceType: 'upi_whatsapp',
              totalSpend: '5540.00',
              transactionCount: 8,
            },
          ],
          spendByPerson: [
            {
              ownerDisplayName: 'Ishan',
              ownerMemberId: 'member-1',
              ownerScope: 'member',
              shareBps: '6100',
              totalSpend: '15433.00',
              transactionCount: '11',
            },
          ],
          trendSeries: [
            {
              bucketEndOn: '2026-03-31',
              bucketLabel: 'Mar 2026',
              bucketStartOn: '2026-03-01',
              reviewCount: '2',
              totalSpend: '25300.00',
              transactionCount: '18',
            },
          ],
        },
        error: null,
      });
    },
  };

  const snapshot = await loadAnalyticsSnapshot(client, {
    bucket: 'month',
    endOn: '2026-03-31',
    householdId: '11111111-1111-4111-8111-111111111111',
    startOn: '2026-03-01',
  });

  assert.deepEqual(snapshot, {
    categoryAllocation: [
      {
        categoryId: 'category-groceries',
        categoryName: 'Groceries',
        reviewCount: 1,
        shareBps: 3880,
        totalSpend: 9820.5,
        transactionCount: 12,
      },
    ],
    comparison: {
      currentSpend: 25300,
      currentTransactionCount: 18,
      deltaPercentage: 11.6,
      deltaSpend: 2630,
      previousSpend: 22670,
      previousTransactionCount: 15,
    },
    householdId: '11111111-1111-4111-8111-111111111111',
    insights: [
      {
        estimatedMonthlyImpact: 1200,
        generatedAt: '2026-03-28T05:40:00.000Z',
        id: 'insight-1',
        recommendation: 'Shift one weekly grocery basket to the lower-priced store.',
        summary: 'Groceries rose faster than overall household spend.',
        title: 'Groceries are outpacing the rest of the ledger',
        type: 'savings_opportunity',
      },
    ],
    latestReport: {
      generatedAt: '2026-03-28T05:45:00.000Z',
      id: 'report-1',
      periodEnd: '2026-03-31',
      periodStart: '2026-03-01',
      title: 'March savings report',
    },
    period: {
      bucket: 'month',
      comparisonEndOn: '2026-02-29',
      comparisonStartOn: '2026-02-01',
      endOn: '2026-03-31',
      startOn: '2026-03-01',
    },
    recurringChargeCandidates: [
      {
        averageAmount: 1299,
        averageCadenceDays: 30,
        categoryName: 'Subscriptions',
        lastChargedOn: '2026-03-18',
        merchantName: 'Spotify',
        monthsActive: 3,
        paymentSourceLabel: 'Amex MRCC',
        transactionCount: 3,
      },
    ],
    spendByPaymentSource: [
      {
        paymentSourceLabel: 'WhatsApp UPI',
        shareBps: 2190,
        sourceType: 'upi_whatsapp',
        totalSpend: 5540,
        transactionCount: 8,
      },
    ],
    spendByPerson: [
      {
        ownerDisplayName: 'Ishan',
        ownerMemberId: 'member-1',
        ownerScope: 'member',
        shareBps: 6100,
        totalSpend: 15433,
        transactionCount: 11,
      },
    ],
    trendSeries: [
      {
        bucketEndOn: '2026-03-31',
        bucketLabel: 'Mar 2026',
        bucketStartOn: '2026-03-01',
        reviewCount: 2,
        totalSpend: 25300,
        transactionCount: 18,
      },
    ],
  });
  assert.deepEqual(recordedRpcCalls, [
    {
      args: {
        target_bucket: 'month',
        target_comparison_end_on: null,
        target_comparison_start_on: null,
        target_end_on: '2026-03-31',
        target_household_id: '11111111-1111-4111-8111-111111111111',
        target_start_on: '2026-03-01',
      },
      name: 'get_household_analytics_snapshot',
    },
  ]);
});

test('Phase 3 analytics service loads a deep report payload with attached recommendations', async () => {
  const client = {
    rpc() {
      return Promise.resolve({
        data: {
          comparison: {
            deltaPercentage: '11.6',
            deltaSpend: '2630.00',
            previousSpend: '22670.00',
          },
          generatedAt: '2026-03-28T05:45:00.000Z',
          id: 'report-1',
          insights: [
            {
              estimatedMonthlyImpact: '1200.00',
              generatedAt: '2026-03-28T05:40:00.000Z',
              id: 'insight-1',
              recommendation: 'Shift one weekly grocery basket to the lower-priced store.',
              summary: 'Groceries rose faster than overall household spend.',
              title: 'Groceries are outpacing the rest of the ledger',
              type: 'savings_opportunity',
            },
          ],
          payload: {
            sections: [
              {
                body: 'Groceries and food delivery were the main drivers this month.',
                id: 'section-1',
                title: 'What changed',
              },
            ],
          },
          periodEnd: '2026-03-31',
          periodStart: '2026-03-01',
          reportType: 'monthly',
          summary: 'March household spend rose versus February.',
          title: 'March savings report',
        },
        error: null,
      });
    },
  };

  const report = await loadAnalyticsReport(client, {
    householdId: '11111111-1111-4111-8111-111111111111',
    reportId: 'report-1',
  });

  assert.deepEqual(report, {
    comparison: {
      deltaPercentage: 11.6,
      deltaSpend: 2630,
      previousSpend: 22670,
    },
    generatedAt: '2026-03-28T05:45:00.000Z',
    id: 'report-1',
    insights: [
      {
        estimatedMonthlyImpact: 1200,
        generatedAt: '2026-03-28T05:40:00.000Z',
        id: 'insight-1',
        recommendation: 'Shift one weekly grocery basket to the lower-priced store.',
        summary: 'Groceries rose faster than overall household spend.',
        title: 'Groceries are outpacing the rest of the ledger',
        type: 'savings_opportunity',
      },
    ],
    payload: {
      sections: [
        {
          body: 'Groceries and food delivery were the main drivers this month.',
          id: 'section-1',
          title: 'What changed',
        },
      ],
    },
    periodEnd: '2026-03-31',
    periodStart: '2026-03-01',
    reportType: 'monthly',
    summary: 'March household spend rose versus February.',
    title: 'March savings report',
  });
});

test('Phase 3 analytics service returns null when no published deep report exists yet', async () => {
  const client = {
    rpc() {
      return Promise.resolve({
        data: null,
        error: null,
      });
    },
  };

  const report = await loadAnalyticsReport(client, {
    householdId: '11111111-1111-4111-8111-111111111111',
  });

  assert.equal(report, null);
});
