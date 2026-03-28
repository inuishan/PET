import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalyticsScreenState } from '../../apps/mobile/src/features/analytics/analytics-model.ts';
import { buildDashboardScreenState } from '../../apps/mobile/src/features/dashboard/dashboard-model.ts';
import {
  createPhase3AnalyticsSnapshot,
  createPhase3DashboardSnapshot,
} from '../support/phase-3-fixtures.mjs';

test('Phase 3F analytics screen keeps release-safe fallbacks when prior data or a deep report is unavailable', () => {
  const snapshot = createPhase3AnalyticsSnapshot();
  snapshot.comparison.deltaPercentage = null;
  snapshot.comparison.deltaSpend = 0;
  snapshot.latestReport = null;
  snapshot.spendByPaymentSource.push({
    paymentSourceLabel: 'Manual correction',
    shareBps: 250,
    sourceType: 'manual_entry',
    totalSpend: 630,
    transactionCount: 1,
  });
  snapshot.spendByPerson = [
    {
      ownerDisplayName: null,
      ownerMemberId: null,
      ownerScope: 'unknown',
      shareBps: 10000,
      totalSpend: snapshot.comparison.currentSpend,
      transactionCount: snapshot.comparison.currentTransactionCount,
    },
  ];

  const screenState = buildAnalyticsScreenState(snapshot);
  const paymentSourceBreakdown = screenState.breakdowns.find((section) => section.id === 'payment_source');

  assert.equal(screenState.hero.comparisonLabel, 'No prior period available');
  assert.equal(screenState.hero.deltaDirection, 'flat');
  assert.equal(screenState.deepAnalysis.ctaLabel, 'Deep Analysis Unavailable');
  assert.equal(screenState.deepAnalysis.reportId, null);
  assert.equal(screenState.deepAnalysis.title, 'Deep Analysis');
  assert.equal(screenState.breakdowns[0]?.items[0]?.label, 'Unknown');
  assert.equal(paymentSourceBreakdown?.items.at(-1)?.label, 'Manual correction');
  assert.equal(paymentSourceBreakdown?.items.at(-1)?.drilldown.sourceType, 'all');
});

test('Phase 3F dashboard screen falls back to analytics navigation when the aggregation snapshot is unavailable', () => {
  const snapshot = createPhase3DashboardSnapshot();
  snapshot.analytics = null;
  snapshot.sync.status = 'healthy';
  snapshot.sources.statements.status = 'healthy';
  snapshot.sources.statements.detail = 'The statement pipeline is clear for this household.';
  snapshot.sources.whatsapp.status = 'healthy';
  snapshot.sources.whatsapp.detail = 'Approved participant capture is healthy.';

  const screenState = buildDashboardScreenState(snapshot);

  assert.deepEqual(screenState.deepAnalysis.navigation, {
    kind: 'analytics',
  });
  assert.equal(screenState.deepAnalysis.actionLabel, 'Open Analytics');
  assert.equal(screenState.deepAnalysis.title, 'Deep Analysis');
  assert.equal(screenState.aiInsightCards.length, 0);
  assert.equal(screenState.categoryHighlights.length, 0);
  assert.equal(screenState.hero.periodLabel, 'This month');
  assert.equal(screenState.hero.trendBadgeLabel, 'No prior data');
});
