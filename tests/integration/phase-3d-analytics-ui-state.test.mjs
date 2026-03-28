import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAnalyticsScreenState,
  createAnalyticsPeriodWindow,
} from '../../apps/mobile/src/features/analytics/analytics-model.ts';
import { createPhase3AnalyticsSnapshot } from '../support/phase-3-fixtures.mjs';

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
  const snapshot = createPhase3AnalyticsSnapshot();
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
