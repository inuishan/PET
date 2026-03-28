import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalyticsReportScreenState } from '../../apps/mobile/src/features/analytics/analytics-report-model.ts';
import { buildAnalyticsScreenState } from '../../apps/mobile/src/features/analytics/analytics-model.ts';
import { createDashboardSnapshot, buildDashboardScreenState } from '../../apps/mobile/src/features/dashboard/dashboard-model.ts';
import {
  createTransactionsDrilldownParams,
  readTransactionsDrilldownParams,
} from '../../apps/mobile/src/features/transactions/transactions-drilldown.ts';
import { buildTransactionsScreenState } from '../../apps/mobile/src/features/transactions/transactions-model.ts';
import {
  createPhase3AnalyticsReport,
  createPhase3AnalyticsSnapshot,
  createPhase3ReleaseLedgerState,
} from '../support/phase-3-fixtures.mjs';

function roundTripDrilldown(drilldown) {
  return readTransactionsDrilldownParams(createTransactionsDrilldownParams(drilldown));
}

test('E2E Phase 3 journey carries dashboard and deep-report evidence sets into the transaction ledger without losing filters', () => {
  const ledgerState = createPhase3ReleaseLedgerState();
  const analyticsSnapshot = createPhase3AnalyticsSnapshot();
  const dashboardSnapshot = {
    ...createDashboardSnapshot(ledgerState, ledgerState.asOf),
    analytics: analyticsSnapshot,
  };
  const dashboardScreenState = buildDashboardScreenState(dashboardSnapshot);
  const dashboardInsightDrilldown = roundTripDrilldown(dashboardScreenState.aiInsightCards[0]?.navigation.drilldown);
  const dashboardTransactions = buildTransactionsScreenState(ledgerState, 'all', {
    ...dashboardInsightDrilldown,
    asOf: ledgerState.asOf,
  });
  const analyticsScreenState = buildAnalyticsScreenState(analyticsSnapshot);
  const reportScreenState = buildAnalyticsReportScreenState(createPhase3AnalyticsReport());
  const reportSection = reportScreenState.sections[0];
  const reportSectionDrilldown = roundTripDrilldown(reportSection?.primaryDrilldown);
  const reportTransactions = buildTransactionsScreenState(ledgerState, 'all', {
    ...reportSectionDrilldown,
    asOf: ledgerState.asOf,
  });

  assert.deepEqual(dashboardScreenState.deepAnalysis.navigation, {
    kind: 'analytics-report',
    reportId: 'report-1',
  });
  assert.equal(analyticsScreenState.deepAnalysis.reportId, 'report-1');
  assert.deepEqual(dashboardTransactions.filterSummary, ['Mar 2026', 'Focused evidence set']);
  assert.deepEqual(
    dashboardTransactions.groups.flatMap((group) => group.transactions).map((transaction) => transaction.id),
    ['txn-005', 'txn-003'],
  );
  assert.equal(reportSection?.title, 'Major spend shifts');
  assert.deepEqual(reportTransactions.filterSummary, ['Mar 2026', 'Focused evidence set']);
  assert.deepEqual(
    reportTransactions.groups.flatMap((group) => group.transactions).map((transaction) => transaction.id),
    ['txn-031', 'txn-005', 'txn-003'],
  );
});
