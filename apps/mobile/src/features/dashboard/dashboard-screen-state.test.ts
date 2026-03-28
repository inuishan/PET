import { describe, expect, it } from 'vitest';

import type { DashboardSnapshot } from './dashboard-model';
import { buildDashboardScreenState } from './dashboard-model';

const snapshot: DashboardSnapshot = {
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
  recentTransactions: [
    {
      amount: 1299,
      categoryName: 'Subscriptions',
      id: 'txn-006',
      merchant: 'Spotify',
      needsReview: false,
      ownerDisplayName: null,
      postedAt: '2026-03-27T08:00:00.000Z',
      sourceBadge: 'Card',
      sourceLabel: 'Amex MRCC',
    },
  ],
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

describe('buildDashboardScreenState', () => {
  it('turns analytics-backed dashboard data into a Stitch-aligned hero, category bars, and AI cards', () => {
    const screenState = buildDashboardScreenState(snapshot);

    expect(screenState.hero).toMatchObject({
      currentSpend: 25127,
      periodLabel: 'March 2026',
      trendBadgeLabel: '+11.6%',
      trendDirection: 'up',
      trendNarrative: '+11.6% vs previous month',
    });
    expect(screenState.hero.sparklinePoints.map((point) => point.shortLabel)).toEqual(['Jan', 'Feb', 'Mar']);
    expect(screenState.sourceChips.map((chip) => chip.label)).toEqual([
      'WhatsApp UPI needs review',
      'Drive Sync · Updated 1h 50m ago',
    ]);
    expect(screenState.categoryHighlights[0]).toMatchObject({
      amountLabel: '₹13,250',
      categoryName: 'Food & Dining',
      shareLabel: '52.4%',
      widthRatio: 0.524,
    });
    expect(screenState.aiInsightCards[0]).toMatchObject({
      actionLabel: 'Review transactions',
      evidenceLabel: 'Backed by 2 matching transactions',
      impactLabel: 'Potential monthly impact: ₹1,500',
      recommendation: 'Reduce food delivery frequency by one order each week.',
      summary: 'Food delivery is up 18% versus the prior period.',
      title: 'Food delivery spend is climbing',
    });
    expect(screenState.aiInsightCards[0]?.navigation).toMatchObject({
      kind: 'transactions',
      drilldown: {
        endOn: '2026-03-31',
        origin: 'analytics',
        periodBucket: 'month',
        startOn: '2026-03-01',
        transactionIds: ['txn-003', 'txn-005'],
      },
    });
    expect(screenState.deepAnalysis).toMatchObject({
      actionLabel: 'Open Deep Analysis',
      navigation: {
        kind: 'analytics-report',
        reportId: 'report-1',
      },
      subtitle: 'Latest report • March 2026',
      title: 'March savings report',
    });
  });
});
