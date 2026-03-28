import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDashboardScreenState } from '../../apps/mobile/src/features/dashboard/dashboard-model.ts';
import { createPhase3DashboardSnapshot } from '../support/phase-3-fixtures.mjs';

test('Phase 3C dashboard UI state derives trend, AI cards, and analytics entry points', () => {
  const snapshot = createPhase3DashboardSnapshot();
  snapshot.analytics.comparison.currentSpend = 25127;
  snapshot.analytics.comparison.previousSpend = 22497;
  snapshot.analytics.trendSeries[1].totalSpend = 22497;
  snapshot.analytics.trendSeries[2].totalSpend = 25127;

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
