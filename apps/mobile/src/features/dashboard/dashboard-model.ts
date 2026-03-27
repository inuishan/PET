import {
  type CoreProductState,
  getCategoryById,
  type LedgerTransaction,
  type SyncStatus,
} from '@/features/core-product/core-product-state';
import { formatRelativeDuration } from '@/features/core-product/core-product-formatting';

export type DashboardAlert = {
  id: string;
  message: string;
  title: string;
  tone: 'critical' | 'warning';
};

export type DashboardSnapshot = {
  alerts: DashboardAlert[];
  recentTransactions: Array<
    LedgerTransaction & {
      categoryName: string;
    }
  >;
  sync: {
    freshnessLabel: string;
    pendingStatementCount: number;
    status: SyncStatus;
  };
  totals: {
    monthToDateSpend: number;
    reviewQueueAmount: number;
    reviewQueueCount: number;
    reviewedAmount: number;
  };
};

export function createDashboardSnapshot(state: CoreProductState, asOf: string = state.asOf): DashboardSnapshot {
  const sortedTransactions = [...state.transactions].sort(
    (left, right) => new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime()
  );
  const monthToDateSpend = state.transactions.reduce((totalAmount, transaction) => totalAmount + transaction.amount, 0);
  const reviewQueueTransactions = state.transactions.filter((transaction) => transaction.needsReview);
  const reviewQueueAmount = reviewQueueTransactions.reduce(
    (totalAmount, transaction) => totalAmount + transaction.amount,
    0
  );
  const alerts: DashboardAlert[] = [];

  if (reviewQueueTransactions.length > 0) {
    alerts.push({
      id: 'review-queue',
      message: 'Resolve low-confidence rows before household totals are trusted.',
      title: `${reviewQueueTransactions.length} transactions need review`,
      tone: 'warning',
    });
  }

  if (state.sync.status !== 'healthy' || state.sync.pendingStatementCount > 0 || state.sync.failureCount > 0) {
    alerts.push({
      id: 'sync-health',
      message: state.sync.lastError ?? 'The ingestion pipeline has pending statements to reconcile.',
      title: 'Statement sync needs attention',
      tone: state.sync.status === 'failing' ? 'critical' : 'warning',
    });
  }

  return {
    alerts,
    recentTransactions: sortedTransactions.slice(0, 4).map((transaction) => ({
      ...transaction,
      categoryName: getCategoryById(state.categories, transaction.categoryId).name,
    })),
    sync: {
      freshnessLabel: `Updated ${formatRelativeDuration(state.sync.lastSuccessfulSyncAt, asOf)}`,
      pendingStatementCount: state.sync.pendingStatementCount,
      status: state.sync.status,
    },
    totals: {
      monthToDateSpend,
      reviewQueueAmount,
      reviewQueueCount: reviewQueueTransactions.length,
      reviewedAmount: monthToDateSpend - reviewQueueAmount,
    },
  };
}
