import { formatRelativeDuration } from '@/features/core-product/core-product-formatting';
import type { SyncStatus } from '@/features/core-product/core-product-state';

import type { DashboardAlert, DashboardSnapshot } from './dashboard-model';

type ErrorLike = {
  message: string;
} | null;

type SelectQuery<T> = Promise<{
  data: T[] | null;
  error: ErrorLike;
}> & {
  eq: (column: string, value: string) => SelectQuery<T>;
  limit: (count: number) => SelectQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => SelectQuery<T>;
};

type UnknownRecord = Record<string, unknown>;

type DashboardSummaryPayload = {
  householdId: string;
  syncStatus: {
    failedStatementCount: number;
    lastStatementSyncAt: string | null;
    lastStatementUploadAt: string | null;
    lastSuccessfulSyncAt: string | null;
    latestParseStatus: string | null;
    needsReviewStatementCount: number;
    pendingStatementCount: number;
  };
  totals: {
    clearedSpend: number;
    monthStart: string | null;
    reviewCount: number;
    totalSpend: number;
    transactionCount: number;
  };
};

type RecentTransactionRow = {
  amount: number;
  categories: { name?: string | null } | Array<{ name?: string | null }> | null;
  id: string;
  merchant_raw: string;
  needs_review: boolean;
  posted_at: string | null;
  transaction_date: string;
};

export type DashboardClient = {
  from: (table: 'transactions') => {
    select: (columns: string) => SelectQuery<unknown>;
  };
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{
    data: T | null;
    error: ErrorLike;
  }>;
};

export function createDashboardQueryKey(householdId: string | null) {
  return ['dashboard', householdId] as const;
}

export async function loadDashboardSnapshot(
  client: DashboardClient,
  householdId: string,
  options: {
    asOf?: string;
  } = {}
): Promise<DashboardSnapshot> {
  const asOf = options.asOf ?? new Date().toISOString();
  const [summaryResponse, recentTransactionsResponse] = await Promise.all([
    client.rpc<unknown>('get_household_dashboard_summary', {
      target_household_id: householdId,
    }),
    client
      .from('transactions')
      .select('id, amount, merchant_raw, needs_review, posted_at, transaction_date, categories(name)')
      .eq('household_id', householdId)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(4),
  ]);

  if (summaryResponse.error) {
    throw new Error(`Unable to load dashboard summary: ${summaryResponse.error.message}`);
  }

  if (recentTransactionsResponse.error) {
    throw new Error(`Unable to load recent transactions: ${recentTransactionsResponse.error.message}`);
  }

  const summary = readDashboardSummaryPayload(summaryResponse.data);

  return {
    alerts: buildDashboardAlerts(summary.syncStatus, summary.totals.reviewCount),
    recentTransactions: readArray(recentTransactionsResponse.data).map((row) =>
      mapRecentTransaction(readRecentTransactionRow(row))
    ),
    sync: {
      freshnessLabel: formatDashboardFreshness(summary.syncStatus.lastSuccessfulSyncAt, summary.syncStatus.lastStatementUploadAt, asOf),
      pendingStatementCount: summary.syncStatus.pendingStatementCount,
      status: getDashboardSyncStatus(summary.syncStatus),
    },
    totals: {
      monthToDateSpend: summary.totals.totalSpend,
      reviewQueueAmount: Math.max(0, summary.totals.totalSpend - summary.totals.clearedSpend),
      reviewQueueCount: summary.totals.reviewCount,
      reviewedAmount: summary.totals.clearedSpend,
      transactionCount: summary.totals.transactionCount,
    },
  };
}

function buildDashboardAlerts(
  syncStatus: DashboardSummaryPayload['syncStatus'],
  reviewQueueCount: number
): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  const syncState = getDashboardSyncStatus(syncStatus);

  if (reviewQueueCount > 0) {
    alerts.push({
      id: 'review-queue',
      message: 'Resolve low-confidence rows before household totals are trusted.',
      title: `${reviewQueueCount} ${reviewQueueCount === 1 ? 'transaction' : 'transactions'} need review`,
      tone: 'warning',
    });
  }

  if (syncState !== 'healthy') {
    alerts.push({
      id: 'sync-health',
      message: getSyncAlertMessage(syncStatus),
      title: 'Statement sync needs attention',
      tone: syncState === 'failing' ? 'critical' : 'warning',
    });
  }

  return alerts;
}

function getSyncAlertMessage(syncStatus: DashboardSummaryPayload['syncStatus']) {
  if (syncStatus.failedStatementCount > 0 || syncStatus.latestParseStatus === 'failed') {
    return `${syncStatus.failedStatementCount || 1} statement sync ${syncStatus.failedStatementCount === 1 ? 'has' : 'have'} failed.`;
  }

  if (syncStatus.pendingStatementCount > 0) {
    return `${syncStatus.pendingStatementCount} statement ${syncStatus.pendingStatementCount === 1 ? 'is' : 'are'} waiting for parser recovery.`;
  }

  if (syncStatus.needsReviewStatementCount > 0) {
    return `${syncStatus.needsReviewStatementCount} synced statement ${syncStatus.needsReviewStatementCount === 1 ? 'still needs' : 'still need'} review.`;
  }

  return 'The ingestion pipeline has pending statements to reconcile.';
}

function formatDashboardFreshness(
  lastSuccessfulSyncAt: string | null,
  lastStatementUploadAt: string | null,
  asOf: string
) {
  if (lastSuccessfulSyncAt) {
    return `Updated ${formatRelativeDuration(lastSuccessfulSyncAt, asOf)}`;
  }

  if (lastStatementUploadAt) {
    return 'Waiting for first successful sync';
  }

  return 'No statements synced yet';
}

function getDashboardSyncStatus(syncStatus: DashboardSummaryPayload['syncStatus']): SyncStatus {
  if (syncStatus.failedStatementCount > 0 || syncStatus.latestParseStatus === 'failed') {
    return 'failing';
  }

  if (
    syncStatus.pendingStatementCount > 0 ||
    syncStatus.needsReviewStatementCount > 0 ||
    syncStatus.latestParseStatus === 'partial' ||
    syncStatus.latestParseStatus === 'pending' ||
    syncStatus.latestParseStatus === 'processing'
  ) {
    return 'degraded';
  }

  return 'healthy';
}

function mapRecentTransaction(transaction: RecentTransactionRow): DashboardSnapshot['recentTransactions'][number] {
  return {
    amount: transaction.amount,
    categoryName: readCategoryName(transaction.categories),
    id: transaction.id,
    merchant: transaction.merchant_raw,
    needsReview: transaction.needs_review,
    postedAt: normalizeIsoDate(transaction.posted_at ?? transaction.transaction_date),
  };
}

function readDashboardSummaryPayload(input: unknown): DashboardSummaryPayload {
  const record = readRecord(input);
  const totals = readRecord(record.totals);
  const syncStatus = readRecord(record.syncStatus);

  return {
    householdId: readRequiredString(record.householdId, 'householdId'),
    syncStatus: {
      failedStatementCount: readNumber(syncStatus.failedStatementCount, 'failedStatementCount'),
      lastStatementSyncAt: readNullableString(syncStatus.lastStatementSyncAt, 'lastStatementSyncAt'),
      lastStatementUploadAt: readNullableString(syncStatus.lastStatementUploadAt, 'lastStatementUploadAt'),
      lastSuccessfulSyncAt: readNullableString(syncStatus.lastSuccessfulSyncAt, 'lastSuccessfulSyncAt'),
      latestParseStatus: readNullableString(syncStatus.latestParseStatus, 'latestParseStatus'),
      needsReviewStatementCount: readNumber(syncStatus.needsReviewStatementCount, 'needsReviewStatementCount'),
      pendingStatementCount: readNumber(syncStatus.pendingStatementCount, 'pendingStatementCount'),
    },
    totals: {
      clearedSpend: readNumber(totals.clearedSpend, 'clearedSpend'),
      monthStart: readNullableString(totals.monthStart, 'monthStart'),
      reviewCount: readNumber(totals.reviewCount, 'reviewCount'),
      totalSpend: readNumber(totals.totalSpend, 'totalSpend'),
      transactionCount: readNumber(totals.transactionCount, 'transactionCount'),
    },
  };
}

function readRecentTransactionRow(input: unknown): RecentTransactionRow {
  const record = readRecord(input);

  return {
    amount: readNumber(record.amount, 'amount'),
    categories: readCategories(record.categories),
    id: readRequiredString(record.id, 'id'),
    merchant_raw: readRequiredString(record.merchant_raw, 'merchant_raw'),
    needs_review: readBoolean(record.needs_review, 'needs_review'),
    posted_at: readNullableString(record.posted_at, 'posted_at'),
    transaction_date: readRequiredString(record.transaction_date, 'transaction_date'),
  };
}

function readCategories(input: unknown): RecentTransactionRow['categories'] {
  if (input === null || input === undefined) {
    return null;
  }

  if (Array.isArray(input)) {
    return input.map((category) => {
      const record = readRecord(category);

      return {
        name: readNullableString(record.name, 'name'),
      };
    });
  }

  const record = readRecord(input);

  return {
    name: readNullableString(record.name, 'name'),
  };
}

function readCategoryName(input: RecentTransactionRow['categories']) {
  if (Array.isArray(input)) {
    return input[0]?.name?.trim() || 'Uncategorized';
  }

  return input?.name?.trim() || 'Uncategorized';
}

function normalizeIsoDate(dateValue: string) {
  return `${dateValue}T08:00:00.000Z`;
}

function readArray(input: unknown) {
  if (input === null || input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    throw new Error('Expected an array response from Supabase.');
  }

  return input;
}

function readRecord(input: unknown): UnknownRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected a record response from Supabase.');
  }

  return input as UnknownRecord;
}

function readBoolean(input: unknown, field: string) {
  if (typeof input !== 'boolean') {
    throw new Error(`Expected ${field} to be a boolean.`);
  }

  return input;
}

function readNumber(input: unknown, field: string) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === 'string' && input.trim().length > 0) {
    const value = Number(input);

    if (Number.isFinite(value)) {
      return value;
    }
  }

  throw new Error(`Expected ${field} to be numeric.`);
}

function readRequiredString(input: unknown, field: string) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error(`Expected ${field} to be a non-empty string.`);
  }

  return input.trim();
}

function readNullableString(input: unknown, field: string) {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input !== 'string') {
    throw new Error(`Expected ${field} to be a string or null.`);
  }

  return input;
}
