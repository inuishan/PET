import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAnalyticsScreenState,
  createAnalyticsPeriodWindow,
} from '../../apps/mobile/src/features/analytics/analytics-model.ts';

const snapshot = {
  categoryAllocation: [
    {
      categoryId: 'category-food',
      categoryName: 'Food & Dining',
      reviewCount: 1,
      shareBps: 5240,
      totalSpend: 13250,
      transactionCount: 9,
    },
    {
      categoryId: 'category-subscriptions',
      categoryName: 'Subscriptions',
      reviewCount: 0,
      shareBps: 1830,
      totalSpend: 4630,
      transactionCount: 4,
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
      evidencePayload: [
        {
          context: null,
          label: 'Current month spend',
          metricKey: 'currentSpend',
          transactionId: 'txn-003',
          value: 13250,
        },
      ],
      estimatedMonthlyImpact: 1500,
      generatedAt: '2026-03-28T05:40:00.000Z',
      generatedFrom: {
        metrics: {
          currentSpend: 13250,
          previousSpend: 11250,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'category_overspending',
        signalVersion: 'phase3b_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-003', 'txn-005'],
      },
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
    comparisonEndOn: '2026-02-28',
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
      paymentSourceLabel: 'Amex MRCC',
      shareBps: 4100,
      sourceType: 'credit_card_statement',
      totalSpend: 10373,
      transactionCount: 7,
    },
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
    {
      ownerDisplayName: null,
      ownerMemberId: null,
      ownerScope: 'shared',
      shareBps: 3900,
      totalSpend: 9867,
      transactionCount: 7,
    },
  ],
  trendSeries: [
    {
      bucketEndOn: '2026-01-31',
      bucketLabel: 'Jan 2026',
      bucketStartOn: '2026-01-01',
      reviewCount: 1,
      totalSpend: 21400,
      transactionCount: 17,
    },
    {
      bucketEndOn: '2026-02-28',
      bucketLabel: 'Feb 2026',
      bucketStartOn: '2026-02-01',
      reviewCount: 1,
      totalSpend: 22670,
      transactionCount: 15,
    },
    {
      bucketEndOn: '2026-03-31',
      bucketLabel: 'Mar 2026',
      bucketStartOn: '2026-03-01',
      reviewCount: 2,
      totalSpend: 25300,
      transactionCount: 18,
    },
  ],
};

test('Phase 3D analytics UI state derives explicit period windows', () => {
  assert.deepEqual(createAnalyticsPeriodWindow('week', '2026-03-28T08:00:00.000Z'), {
    bucket: 'week',
    comparisonEndOn: '2026-03-22',
    comparisonStartOn: '2026-03-16',
    endOn: '2026-03-29',
    startOn: '2026-03-23',
  });
  assert.deepEqual(createAnalyticsPeriodWindow('month', '2026-03-28T08:00:00.000Z'), {
    bucket: 'month',
    comparisonEndOn: '2026-02-28',
    comparisonStartOn: '2026-02-01',
    endOn: '2026-03-31',
    startOn: '2026-03-01',
  });
});

test('Phase 3D analytics UI state turns charts and savings cards into drill-downs', () => {
  const screenState = buildAnalyticsScreenState(snapshot);

  assert.equal(screenState.hero.periodLabel, 'March 2026');
  assert.equal(screenState.trend.points[2]?.bucketLabel, 'Mar 2026');
  assert.equal(screenState.trend.points[2]?.normalizedHeight, 1);
  assert.deepEqual(screenState.trend.points[2]?.drilldown, {
    categoryId: null,
    endOn: '2026-03-31',
    origin: 'analytics',
    ownerMemberId: null,
    ownerScope: 'all',
    periodBucket: 'month',
    searchQuery: '',
    sourceType: 'all',
    startOn: '2026-03-01',
    subtitle: 'March 2026',
    title: 'Mar 2026 spend',
    transactionIds: [],
  });
  assert.deepEqual(screenState.allocation.items[0]?.drilldown, {
    categoryId: 'category-food',
    endOn: '2026-03-31',
    origin: 'analytics',
    ownerMemberId: null,
    ownerScope: 'all',
    periodBucket: 'month',
    searchQuery: '',
    sourceType: 'all',
    startOn: '2026-03-01',
    subtitle: 'March 2026',
    title: 'Food & Dining transactions',
    transactionIds: [],
  });
  assert.equal(screenState.insightCards[0]?.impactLabel, 'Potential monthly impact: ₹1,500');
  assert.deepEqual(screenState.insightCards[0]?.drilldown.transactionIds, ['txn-003', 'txn-005']);
  assert.equal(screenState.recurringCards[0]?.totalSpendLabel, '₹1,299');
  assert.equal(screenState.deepAnalysis.reportId, 'report-1');
});
