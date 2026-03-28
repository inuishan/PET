import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAnalyticsQueryKey,
  loadAnalyticsReport,
  loadAnalyticsSnapshot,
} from '../../apps/mobile/src/features/analytics/analytics-service.ts';

test('Phase 3 analytics loads a household-scoped snapshot from the server-owned aggregation RPC', async () => {
  const recordedRpcCalls = [];
  const client = {
    rpc(name, args) {
      recordedRpcCalls.push({ args, name });

      return Promise.resolve({
        data: {
          categoryAllocation: [
            {
              categoryId: 'category-food',
              categoryName: 'Food & Dining',
              shareBps: 5240,
              totalSpend: '13250.00',
              transactionCount: 9,
            },
          ],
          comparison: {
            currentSpend: '25300.00',
            currentTransactionCount: 18,
            deltaPercentage: '11.6',
            deltaSpend: '2630.00',
            previousSpend: '22670.00',
            previousTransactionCount: 15,
          },
          householdId: '11111111-1111-4111-8111-111111111111',
          insights: [
            {
              estimatedMonthlyImpact: '1500.00',
              generatedAt: '2026-03-28T05:40:00.000Z',
              id: 'insight-1',
              recommendation: 'Reduce food delivery frequency by one order each week.',
              summary: 'Food delivery is up 18% versus the prior period.',
              title: 'Food delivery spend is climbing',
              type: 'overspending',
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
              paymentSourceLabel: 'Amex MRCC',
              shareBps: 4100,
              sourceType: 'credit_card_statement',
              totalSpend: '10373.00',
              transactionCount: 7,
            },
          ],
          spendByPerson: [
            {
              ownerDisplayName: 'Ishan',
              ownerMemberId: 'member-1',
              ownerScope: 'member',
              shareBps: 6100,
              totalSpend: '15433.00',
              transactionCount: 11,
            },
          ],
          trendSeries: [
            {
              bucketEndOn: '2026-03-31',
              bucketLabel: 'Mar 2026',
              bucketStartOn: '2026-03-01',
              reviewCount: 2,
              totalSpend: '25300.00',
              transactionCount: 18,
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

  assert.deepEqual(createAnalyticsQueryKey('11111111-1111-4111-8111-111111111111', snapshot.period), [
    'analytics',
    '11111111-1111-4111-8111-111111111111',
    '2026-03-01',
    '2026-03-31',
    '2026-02-01',
    '2026-02-29',
    'month',
  ]);
  assert.equal(snapshot.comparison.deltaSpend, 2630);
  assert.equal(snapshot.categoryAllocation[0]?.categoryName, 'Food & Dining');
  assert.equal(snapshot.recurringChargeCandidates[0]?.merchantName, 'Spotify');
  assert.equal(snapshot.latestReport?.title, 'March savings report');
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

test('Phase 3 deep-report reads resolve through the household-scoped report RPC', async () => {
  const client = {
    rpc(name, args) {
      assert.equal(name, 'get_household_analytics_report');
      assert.deepEqual(args, {
        target_household_id: '11111111-1111-4111-8111-111111111111',
        target_report_id: 'report-1',
      });

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
              estimatedMonthlyImpact: '1500.00',
              generatedAt: '2026-03-28T05:40:00.000Z',
              id: 'insight-1',
              recommendation: 'Reduce food delivery frequency by one order each week.',
              summary: 'Food delivery is up 18% versus the prior period.',
              title: 'Food delivery spend is climbing',
              type: 'overspending',
            },
          ],
          payload: {
            sections: [
              {
                body: 'Food delivery and late-night convenience purchases were the largest drivers this month.',
                id: 'section-1',
                title: 'What changed',
              },
            ],
          },
          periodEnd: '2026-03-31',
          periodStart: '2026-03-01',
          reportType: 'monthly',
          summary: 'March household spend rose versus February, led by food delivery and subscriptions.',
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

  assert.equal(report.id, 'report-1');
  assert.equal(report.insights[0]?.title, 'Food delivery spend is climbing');
  assert.equal(report.payload.sections[0]?.id, 'section-1');
});
