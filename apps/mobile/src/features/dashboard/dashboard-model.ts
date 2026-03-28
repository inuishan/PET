import {
  type CoreProductState,
  getCategoryById,
  type SyncStatus,
  type WhatsAppSourceStatus,
} from '@/features/core-product/core-product-state';
import { formatCurrency, formatRelativeDuration } from '@/features/core-product/core-product-formatting';
import { buildAnalyticsScreenState } from '@/features/analytics/analytics-model';
import type { AnalyticsSnapshot } from '@/features/analytics/analytics-service';
import type { TransactionsDrilldown } from '@/features/transactions/transactions-drilldown';

const monthYearFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

const shortMonthFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  timeZone: 'UTC',
});

export type DashboardAlert = {
  id: string;
  message: string;
  title: string;
  tone: 'critical' | 'warning';
};

export type DashboardNavigation =
  | {
      kind: 'analytics';
    }
  | {
      kind: 'analytics-report';
      reportId: string;
    }
  | {
      drilldown: TransactionsDrilldown;
      kind: 'transactions';
    };

export type DashboardSnapshot = {
  alerts: DashboardAlert[];
  analytics: AnalyticsSnapshot | null;
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

export type DashboardScreenState = {
  aiInsightCards: Array<{
    actionLabel: string;
    evidenceLabel: string;
    eyebrow: string;
    id: string;
    impactLabel: string | null;
    navigation: DashboardNavigation;
    recommendation: string;
    summary: string;
    title: string;
  }>;
  categoryHighlights: Array<{
    amountLabel: string;
    categoryName: string;
    detail: string;
    shareLabel: string;
    widthRatio: number;
  }>;
  deepAnalysis: {
    actionLabel: string;
    navigation: DashboardNavigation;
    subtitle: string;
    title: string;
  };
  hero: {
    currentSpend: number;
    periodLabel: string;
    sparklinePoints: Array<{
      id: string;
      normalizedHeight: number;
      shortLabel: string;
    }>;
    trendBadgeLabel: string;
    trendDirection: 'down' | 'flat' | 'up';
    trendNarrative: string;
  };
  sourceChips: Array<{
    id: 'drive-sync' | 'whatsapp';
    label: string;
    tone: 'neutral' | 'positive' | 'warning';
  }>;
  statementSync: {
    actionLabel: string;
    body: string;
    title: string;
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
    analytics: null,
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

export function buildDashboardScreenState(snapshot: DashboardSnapshot): DashboardScreenState {
  const analyticsScreenState = snapshot.analytics ? buildAnalyticsScreenState(snapshot.analytics) : null;
  const periodLabel = analyticsScreenState?.hero.periodLabel ?? 'This month';
  const trendDirection = analyticsScreenState?.hero.deltaDirection ?? 'flat';
  const trendBadgeLabel = formatDeltaBadgeLabel(analyticsScreenState?.hero.deltaPercentage ?? null, trendDirection);
  const trendNarrative = analyticsScreenState?.hero.comparisonLabel ?? 'Comparison unlocks after the first prior-period close.';

  return {
    aiInsightCards: snapshot.analytics ? snapshot.analytics.insights.slice(0, 2).map((insight) => ({
      actionLabel: 'Review transactions',
      evidenceLabel: buildInsightEvidenceLabel(insight),
      eyebrow: formatInsightType(insight.type),
      id: insight.id,
      impactLabel: insight.estimatedMonthlyImpact === null ? null : `Potential monthly impact: ${formatCurrency(insight.estimatedMonthlyImpact)}`,
      navigation: {
        drilldown: buildInsightDrilldown(snapshot.analytics.period, insight),
        kind: 'transactions',
      },
      recommendation: insight.recommendation,
      summary: insight.summary,
      title: insight.title,
    })) : [],
    categoryHighlights: snapshot.analytics
      ? snapshot.analytics.categoryAllocation.slice(0, 3).map((item) => ({
          amountLabel: formatCurrency(item.totalSpend),
          categoryName: item.categoryName,
          detail: `${item.transactionCount} ${item.transactionCount === 1 ? 'transaction' : 'transactions'}`,
          shareLabel: formatShareLabel(item.shareBps),
          widthRatio: Number((item.shareBps / 10000).toFixed(3)),
        }))
      : [],
    deepAnalysis: {
      actionLabel: analyticsScreenState?.deepAnalysis.ctaLabel ?? 'Open Analytics',
      navigation: analyticsScreenState?.deepAnalysis.reportId
        ? {
            kind: 'analytics-report',
            reportId: analyticsScreenState.deepAnalysis.reportId,
          }
        : {
            kind: 'analytics',
          },
      subtitle: analyticsScreenState?.deepAnalysis.subtitle ?? 'Trend, allocation, and AI insights in one report-ready view.',
      title: analyticsScreenState?.deepAnalysis.title ?? 'Deep Analysis',
    },
    hero: {
      currentSpend: snapshot.totals.monthToDateSpend,
      periodLabel,
      sparklinePoints: buildSparklinePoints(snapshot, analyticsScreenState),
      trendBadgeLabel,
      trendDirection,
      trendNarrative,
    },
    sourceChips: [
      {
        id: 'whatsapp',
        label: buildWhatsAppChipLabel(snapshot.sources.whatsapp.status),
        tone: readChipTone(snapshot.sources.whatsapp.status),
      },
      {
        id: 'drive-sync',
        label: `Drive Sync · ${snapshot.sync.freshnessLabel}`,
        tone: readChipTone(snapshot.sync.status),
      },
    ],
    statementSync: {
      actionLabel: snapshot.sync.status === 'healthy' ? 'Open Drive sync setup' : 'Resolve statement sync',
      body: snapshot.sources.statements.detail,
      title: 'Sync Your Statements',
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

function buildInsightDrilldown(period: AnalyticsSnapshot['period'], insight: AnalyticsSnapshot['insights'][number]): TransactionsDrilldown {
  return {
    categoryId: null,
    endOn: insight.generatedFrom.periodEnd ?? period.endOn,
    origin: 'analytics',
    ownerMemberId: null,
    ownerScope: 'all',
    periodBucket: period.bucket,
    searchQuery: '',
    sourceType: 'all',
    startOn: insight.generatedFrom.periodStart ?? period.startOn,
    subtitle: formatPeriodSubtitle(period),
    title: insight.title,
    transactionIds: insight.generatedFrom.supportingTransactionIds.length > 0
      ? insight.generatedFrom.supportingTransactionIds
      : [],
  };
}

function buildInsightEvidenceLabel(insight: AnalyticsSnapshot['insights'][number]) {
  const supportingCount = insight.generatedFrom.supportingTransactionIds.length;

  if (supportingCount > 0) {
    return `Backed by ${supportingCount} matching transaction${supportingCount === 1 ? '' : 's'}`;
  }

  const firstEvidence = insight.evidencePayload[0];

  if (firstEvidence) {
    return `Evidence: ${firstEvidence.label}`;
  }

  return 'Evidence available in analytics';
}

function buildSparklinePoints(snapshot: DashboardSnapshot, analyticsScreenState: ReturnType<typeof buildAnalyticsScreenState> | null) {
  if (analyticsScreenState) {
    return analyticsScreenState.trend.points.map((point) => ({
      id: point.bucketLabel,
      normalizedHeight: point.normalizedHeight,
      shortLabel: point.shortLabel,
    }));
  }

  const recentTransactions = [...snapshot.recentTransactions].reverse();
  const maxAmount = Math.max(...recentTransactions.map((transaction) => transaction.amount), 1);

  return recentTransactions.map((transaction) => ({
    id: transaction.id,
    normalizedHeight: transaction.amount / maxAmount,
    shortLabel: shortMonthFormatter.format(new Date(transaction.postedAt)),
  }));
}

function buildWhatsAppChipLabel(status: DashboardSnapshot['sources']['whatsapp']['status']) {
  if (status === 'healthy') {
    return 'WhatsApp UPI tracking active';
  }

  if (status === 'needs_setup') {
    return 'WhatsApp UPI needs setup';
  }

  if (status === 'failing') {
    return 'WhatsApp UPI capture failed';
  }

  return 'WhatsApp UPI needs review';
}

function formatDeltaBadgeLabel(deltaPercentage: number | null, direction: DashboardScreenState['hero']['trendDirection']) {
  if (deltaPercentage === null) {
    return 'No prior data';
  }

  if (direction === 'flat') {
    return '0.0%';
  }

  const prefix = direction === 'up' ? '+' : '-';

  return `${prefix}${Math.abs(deltaPercentage).toFixed(1)}%`;
}

function formatInsightType(type: AnalyticsSnapshot['insights'][number]['type']) {
  switch (type) {
    case 'category_pattern':
      return 'Category Pattern';
    case 'duplicate_subscription':
      return 'Subscription Leak';
    case 'overspending':
      return 'Overspending';
    case 'recurring_charge':
      return 'Recurring Charge';
    case 'savings_opportunity':
      return 'Savings Opportunity';
    case 'unusual_spike':
      return 'Unusual Spike';
    default:
      return 'Insight';
  }
}

function formatPeriodSubtitle(period: AnalyticsSnapshot['period']) {
  if (period.bucket === 'month') {
    return monthYearFormatter.format(new Date(`${period.startOn}T00:00:00.000Z`));
  }

  if (period.bucket === 'year') {
    return `${new Date(`${period.startOn}T00:00:00.000Z`).getUTCFullYear()} annual spend`;
  }

  return `${period.startOn} - ${period.endOn}`;
}

function formatShareLabel(shareBps: number) {
  return `${(shareBps / 100).toFixed(1)}%`;
}

function readChipTone(status: SyncStatus | WhatsAppSourceStatus): DashboardScreenState['sourceChips'][number]['tone'] {
  if (status === 'healthy') {
    return 'positive';
  }

  if (status === 'degraded' || status === 'needs_setup') {
    return 'warning';
  }

  return 'neutral';
}
