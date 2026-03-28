import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDashboardScreenState } from '../../apps/mobile/src/features/dashboard/dashboard-model.ts';

const snapshot = {
  alerts: [
    {
      id: 'review-queue',
      message: 'Resolve low-confidence rows before household totals are trusted.',
      title: '2 transactions need review',
      tone: 'warning',
    },
  ],
  analytics: {
    categoryAllocation: [
      {
        categoryId: 'category-food',
        categoryName: 'Food & Dining',
        reviewCount: 1,
        shareBps: 5240,
        totalSpend: 13250,
        transactionCount: 9,
      },
    ],
    comparison: {
      currentSpend: 25127,
      currentTransactionCount: 18,
      deltaPercentage: 11.6,
      deltaSpend: 2630,
      previousSpend: 22497,
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
          signalVersion: 'phase3c_v1',
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
    recurringChargeCandidates: [],
    spendByPaymentSource: [],
    spendByPerson: [],
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
        totalSpend: 22497,
        transactionCount: 15,
      },
      {
        bucketEndOn: '2026-03-31',
        bucketLabel: 'Mar 2026',
        bucketStartOn: '2026-03-01',
        reviewCount: 2,
        totalSpend: 25127,
        transactionCount: 18,
      },
    ],
  },
  recentTransactions: [],
  sources: {
    statements: {
      detail: '1 statement is waiting for parser recovery.',
      label: 'Statements',
      status: 'degraded',
    },
    whatsapp: {
      detail: '1 WhatsApp capture needs review.',
      label: 'WhatsApp UPI',
      status: 'degraded',
    },
  },
  sync: {
    freshnessLabel: 'Updated 1h 50m ago',
    pendingStatementCount: 1,
    status: 'degraded',
  },
  totals: {
    monthToDateSpend: 25127,
    reviewQueueAmount: 4079,
    reviewQueueCount: 2,
    reviewedAmount: 21048,
    transactionCount: 6,
  },
};

test('Phase 3C dashboard UI state derives trend, AI cards, and analytics entry points', () => {
  const screenState = buildDashboardScreenState(snapshot);

  assert.equal(screenState.hero.trendBadgeLabel, '+11.6%');
  assert.equal(screenState.hero.sparklinePoints[2]?.shortLabel, 'Mar');
  assert.equal(screenState.categoryHighlights[0]?.shareLabel, '52.4%');
  assert.equal(screenState.aiInsightCards[0]?.impactLabel, 'Potential monthly impact: ₹1,500');
  assert.equal(screenState.aiInsightCards[0]?.evidenceLabel, 'Backed by 2 matching transactions');
  assert.deepEqual(screenState.aiInsightCards[0]?.navigation, {
    drilldown: {
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
      title: 'Food delivery spend is climbing',
      transactionIds: ['txn-003', 'txn-005'],
    },
    kind: 'transactions',
  });
  assert.deepEqual(screenState.deepAnalysis?.navigation, { kind: 'analytics-report', reportId: 'report-1' });
});
