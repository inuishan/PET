import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalyticsReportScreenState } from '../../apps/mobile/src/features/analytics/analytics-report-model.ts';

const report = {
  comparison: {
    deltaPercentage: 11.6,
    deltaSpend: 2630,
    previousSpend: 22670,
  },
  generatedAt: '2026-03-28T05:45:00.000Z',
  id: 'report-1',
  insights: [
    {
      evidencePayload: [],
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
        signalVersion: 'phase3e_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-003', 'txn-005'],
      },
      id: 'insight-overspend',
      recommendation: 'Reduce food delivery frequency by one order each week.',
      summary: 'Food delivery is up 18% versus the prior period.',
      title: 'Food delivery spend is climbing',
      type: 'overspending',
    },
    {
      evidencePayload: [],
      estimatedMonthlyImpact: 129,
      generatedAt: '2026-03-28T05:41:00.000Z',
      generatedFrom: {
        metrics: {
          duplicateCount: 2,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'duplicate_subscription',
        signalVersion: 'phase3e_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-011', 'txn-012'],
      },
      id: 'insight-duplicate-subscription',
      recommendation: 'Keep one Spotify plan and cancel the extra renewal before next month.',
      summary: '2 charges landed for the same subscription family this cycle.',
      title: 'Spotify looks like a duplicate subscription',
      type: 'duplicate_subscription',
    },
    {
      evidencePayload: [],
      estimatedMonthlyImpact: 700,
      generatedAt: '2026-03-28T05:42:00.000Z',
      generatedFrom: {
        metrics: {
          weekendShare: 90,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'weekend_category_pattern',
        signalVersion: 'phase3e_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-021', 'txn-022', 'txn-023'],
      },
      id: 'insight-weekend-pattern',
      recommendation: 'Plan weekend meals in advance so fewer impulse orders hit the highest-spend days.',
      summary: '90% of dining spend landed on weekends this month.',
      title: 'Dining spend is clustering on weekends',
      type: 'category_pattern',
    },
    {
      evidencePayload: [],
      estimatedMonthlyImpact: 14300,
      generatedAt: '2026-03-28T05:43:00.000Z',
      generatedFrom: {
        metrics: {
          currentSpend: 14300,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'merchant_spike',
        signalVersion: 'phase3e_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-031'],
      },
      id: 'insight-spike',
      recommendation: 'Review the Croma purchase and confirm it belongs in this month’s household baseline.',
      summary: 'Croma produced a one-off merchant spike that sits well above the prior baseline.',
      title: 'Croma is well above the normal monthly baseline',
      type: 'unusual_spike',
    },
    {
      evidencePayload: [],
      estimatedMonthlyImpact: 1200,
      generatedAt: '2026-03-28T05:44:00.000Z',
      generatedFrom: {
        metrics: {
          currentSpend: 9820,
          previousSpend: 8120,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'grocery_savings',
        signalVersion: 'phase3e_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-041', 'txn-042'],
      },
      id: 'insight-savings',
      recommendation: 'Shift one weekly grocery basket to the lower-priced store.',
      summary: 'Groceries rose faster than overall household spend.',
      title: 'Groceries are outpacing the rest of the ledger',
      type: 'savings_opportunity',
    },
  ],
  payload: {
    sections: [
      {
        body: 'Dining and electronics were the clearest spend drivers this month.',
        id: 'major-spend-shifts',
        insightIds: ['insight-overspend', 'insight-spike'],
        title: 'Major spend shifts',
      },
      {
        body: 'Groceries still offer the clearest savings lever in the current cycle.',
        id: 'savings-opportunities',
        insightIds: ['insight-savings'],
        title: 'Savings opportunities',
      },
      {
        body: 'One recurring charge cluster needs a keep-or-cancel review.',
        id: 'recurring-charge-findings',
        insightIds: ['insight-duplicate-subscription'],
        title: 'Recurring-charge findings',
      },
      {
        body: 'Weekend dining remains unusually concentrated.',
        id: 'unusual-patterns',
        insightIds: ['insight-weekend-pattern'],
        title: 'Unusual patterns',
      },
      {
        body: 'Review the spike, cancel the duplicate, and reset one grocery habit this week.',
        id: 'recommended-next-actions',
        insightIds: ['insight-spike', 'insight-duplicate-subscription', 'insight-savings'],
        title: 'Recommended next actions',
      },
    ],
    summaryInsightIds: ['insight-overspend', 'insight-savings'],
  },
  periodEnd: '2026-03-31',
  periodStart: '2026-03-01',
  reportType: 'monthly',
  summary: 'March spend increased by ₹2,630 versus February, with food delivery and one large electronics purchase driving the change.',
  title: 'March household savings report',
};

test('Phase 3E analytics report UI state builds explicit sections and drill-down evidence sets', () => {
  const screenState = buildAnalyticsReportScreenState(report);

  assert.equal(screenState.hero.periodLabel, 'March 2026');
  assert.equal(screenState.hero.comparisonLabel, '+11.6% vs previous month');
  assert.equal(screenState.summaryHighlights[0]?.evidenceLabel, 'Backed by 2 matching transactions');
  assert.deepEqual(screenState.sections.map((section) => section.kind), [
    'major_spend_shifts',
    'savings_opportunities',
    'recurring_charge_findings',
    'unusual_patterns',
    'recommended_next_actions',
  ]);
  assert.equal(screenState.sections[0]?.impactLabel, 'Potential monthly impact: ₹15,800');
  assert.deepEqual(screenState.sections[0]?.primaryDrilldown, {
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
    title: 'Major spend shifts',
    transactionIds: ['txn-003', 'txn-005', 'txn-031'],
  });
  assert.equal(screenState.sections[2]?.title, 'Recurring-charge findings');
  assert.equal(screenState.sections[3]?.insights[0]?.title, 'Dining spend is clustering on weekends');
  assert.equal(screenState.navigation.analyticsLabel, 'Back to Analytics');
});

test('Phase 3E analytics report UI state shows empty placeholders instead of fabricating missing sections', () => {
  const screenState = buildAnalyticsReportScreenState({
    ...report,
    payload: {
      sections: [
        {
          body: 'Spend moved materially this cycle.',
          id: 'what-changed',
          insightIds: ['insight-overspend'],
          title: 'What changed',
        },
        {
          body: 'Groceries still offer the best lever.',
          id: 'savings-opportunities',
          insightIds: ['insight-savings'],
          title: 'Savings opportunities',
        },
        {
          body: 'Duplicate subscriptions need a review.',
          id: 'watch-list',
          insightIds: ['insight-duplicate-subscription', 'insight-weekend-pattern'],
          title: 'Watch list',
        },
        {
          body: 'Act on the top three recommendations this week.',
          id: 'next-actions',
          insightIds: ['insight-spike', 'insight-duplicate-subscription', 'insight-savings'],
          title: 'Next actions',
        },
      ],
      summaryInsightIds: ['insight-overspend'],
    },
  });

  assert.deepEqual(screenState.sections.map((section) => section.title), [
    'Major spend shifts',
    'Savings opportunities',
    'Recurring-charge findings',
    'Unusual patterns',
    'Recommended next actions',
  ]);
  assert.equal(screenState.sections[2]?.insightCountLabel, '2 linked insights');
  assert.equal(screenState.sections[2]?.insights[0]?.title, 'Spotify looks like a duplicate subscription');
  assert.equal(screenState.sections[3]?.insightCountLabel, '0 linked insights');
  assert.equal(screenState.sections[3]?.primaryDrilldown, null);
});
