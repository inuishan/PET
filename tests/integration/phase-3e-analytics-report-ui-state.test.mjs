import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalyticsReportScreenState } from '../../apps/mobile/src/features/analytics/analytics-report-model.ts';
import { createPhase3AnalyticsReport } from '../support/phase-3-fixtures.mjs';

test('Phase 3E analytics report UI state builds explicit sections and drill-down evidence sets', () => {
  const report = createPhase3AnalyticsReport();
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
  const report = createPhase3AnalyticsReport();
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
