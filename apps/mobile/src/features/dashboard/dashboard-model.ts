import {
  type CoreProductState,
  getCategoryById,
  type SyncStatus,
  type WhatsAppSourceStatus,
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
  recentTransactions: Array<{
    amount: number;
    categoryName: string;
    id: string;
    merchant: string;
    needsReview: boolean;
    ownerDisplayName: string | null;
    postedAt: string;
    sourceBadge: 'Card' | 'UPI';
    sourceLabel: string;
  }>;
  sources: {
    statements: {
      detail: string;
      label: 'Statements';
      status: SyncStatus;
    };
    whatsapp: {
      detail: string;
      label: 'WhatsApp UPI';
      status: WhatsAppSourceStatus;
    };
  };
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
    transactionCount: number;
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
      amount: transaction.amount,
      categoryName: getCategoryById(state.categories, transaction.categoryId).name,
      id: transaction.id,
      merchant: transaction.merchant,
      needsReview: transaction.needsReview,
      ownerDisplayName: transaction.ownerDisplayName,
      postedAt: transaction.postedAt,
      sourceBadge: transaction.sourceType === 'upi_whatsapp' ? 'UPI' : 'Card',
      sourceLabel: transaction.sourceLabel,
    })),
    sources: {
      statements: {
        detail: getStatementSourceDetail(state),
        label: 'Statements',
        status: state.sync.status,
      },
      whatsapp: {
        detail: getWhatsAppSourceDetail(state),
        label: 'WhatsApp UPI',
        status: state.whatsappSource.status,
      },
    },
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
      transactionCount: state.transactions.length,
    },
  };
}

function getStatementSourceDetail(state: CoreProductState) {
  if (state.sync.status === 'failing') {
    return state.sync.lastError ?? 'At least one statement sync failed.';
  }

  if (state.sync.pendingStatementCount > 0) {
    return `${state.sync.pendingStatementCount} statement ${state.sync.pendingStatementCount === 1 ? 'is' : 'are'} waiting for parser recovery.`;
  }

  return 'The statement pipeline is clear for this household.';
}

function getWhatsAppSourceDetail(state: CoreProductState) {
  if (state.whatsappSource.status === 'needs_setup') {
    return 'Approve at least one participant before the Meta test number is ready.';
  }

  if (state.whatsappSource.failedCaptureCount > 0) {
    return `${state.whatsappSource.failedCaptureCount} WhatsApp capture${state.whatsappSource.failedCaptureCount === 1 ? '' : 's'} failed recently.`;
  }

  if (state.whatsappSource.reviewCaptureCount > 0) {
    return `${state.whatsappSource.reviewCaptureCount} WhatsApp capture${state.whatsappSource.reviewCaptureCount === 1 ? '' : 's'} need${state.whatsappSource.reviewCaptureCount === 1 ? 's' : ''} review.`;
  }

  return state.whatsappSource.lastCaptureAt
    ? `Last approved capture landed ${formatRelativeDuration(state.whatsappSource.lastCaptureAt, state.asOf)}.`
    : 'Ready for the first approved WhatsApp message.';
}
