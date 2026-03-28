import { createAnalyticsPeriodWindow } from '@/features/analytics/analytics-model';
import { loadAnalyticsSnapshot } from '@/features/analytics/analytics-service';
import { formatRelativeDuration } from '@/features/core-product/core-product-formatting';
import { buildWhatsAppSourceHealthSnapshot } from '@/features/core-product/whatsapp-source-health';
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
  is: (column: string, value: null) => SelectQuery<T>;
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
  metadata: {
    cardName?: string | null;
  } | null;
  merchant_raw: string;
  needs_review: boolean;
  owner_member: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
  posted_at: string | null;
  statement_uploads: { card_name?: string | null } | Array<{ card_name?: string | null }> | null;
  source_type: 'credit_card_statement' | 'upi_whatsapp';
  transaction_date: string;
};

type WhatsAppMessageHealthRow = {
  parse_status: string;
  received_at: string;
};

export type DashboardClient = {
  from: (table: 'transactions' | 'whatsapp_messages' | 'whatsapp_participants') => {
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
  const [summaryResponse, recentTransactionsResponse, participantsResponse, messagesResponse] = await Promise.all([
    client.rpc<unknown>('get_household_dashboard_summary', {
      target_household_id: householdId,
    }),
    client
      .from('transactions')
      .select('id, amount, merchant_raw, needs_review, posted_at, transaction_date, source_type, metadata, statement_uploads(card_name), categories(name), owner_member:household_members(display_name)')
      .eq('household_id', householdId)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(4),
    client
      .from('whatsapp_participants')
      .select('id')
      .eq('household_id', householdId)
      .is('revoked_at', null),
    client
      .from('whatsapp_messages')
      .select('parse_status, received_at')
      .eq('household_id', householdId)
      .order('received_at', { ascending: false })
      .limit(20),
  ]);

  if (summaryResponse.error) {
    throw new Error(`Unable to load dashboard summary: ${summaryResponse.error.message}`);
  }

  if (recentTransactionsResponse.error) {
    throw new Error(`Unable to load recent transactions: ${recentTransactionsResponse.error.message}`);
  }

  if (participantsResponse.error) {
    throw new Error(`Unable to load WhatsApp participants: ${participantsResponse.error.message}`);
  }

  if (messagesResponse.error) {
    throw new Error(`Unable to load WhatsApp source health: ${messagesResponse.error.message}`);
  }

  const monthlyPeriod = createAnalyticsPeriodWindow('month', asOf);
  let analytics: DashboardSnapshot['analytics'] = null;

  try {
    analytics = await loadAnalyticsSnapshot(client, {
      bucket: monthlyPeriod.bucket,
      comparisonEndOn: monthlyPeriod.comparisonEndOn,
      comparisonStartOn: monthlyPeriod.comparisonStartOn,
      endOn: monthlyPeriod.endOn,
      householdId,
      startOn: monthlyPeriod.startOn,
    });
  } catch {
    analytics = null;
  }
  const summary = readDashboardSummaryPayload(summaryResponse.data);
  const whatsappSource = buildWhatsAppSourceHealthSnapshot(
    {
      approvedParticipantCount: readArray(participantsResponse.data).length,
      messages: readArray(messagesResponse.data).map((row) => readWhatsAppMessageHealthRow(row)).map((message) => ({
        parseStatus: message.parse_status,
        receivedAt: message.received_at,
      })),
    },
    asOf
  );
  const syncStatus = getDashboardSyncStatus(summary.syncStatus);

  return {
    alerts: buildDashboardAlerts(summary.syncStatus, summary.totals.reviewCount),
    analytics,
    recentTransactions: readArray(recentTransactionsResponse.data).map((row) =>
      mapRecentTransaction(readRecentTransactionRow(row))
    ),
    sources: {
      statements: {
        detail: getSyncAlertMessage(summary.syncStatus, summary.totals.transactionCount === 0),
        label: 'Statements',
        status: syncStatus,
      },
      whatsapp: {
        detail: describeWhatsAppDashboardSource(whatsappSource),
        label: 'WhatsApp UPI',
        status: whatsappSource.status,
      },
    },
    sync: {
      freshnessLabel: formatDashboardFreshness(summary.syncStatus.lastSuccessfulSyncAt, summary.syncStatus.lastStatementUploadAt, asOf),
      pendingStatementCount: summary.syncStatus.pendingStatementCount,
      status: syncStatus,
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

function getSyncAlertMessage(syncStatus: DashboardSummaryPayload['syncStatus'], isEmptyDashboard: boolean = false) {
  if (syncStatus.failedStatementCount > 0 || syncStatus.latestParseStatus === 'failed') {
    return `${syncStatus.failedStatementCount || 1} statement sync ${syncStatus.failedStatementCount === 1 ? 'has' : 'have'} failed.`;
  }

  if (syncStatus.pendingStatementCount > 0) {
    return `${syncStatus.pendingStatementCount} statement ${syncStatus.pendingStatementCount === 1 ? 'is' : 'are'} waiting for parser recovery.`;
  }

  if (syncStatus.needsReviewStatementCount > 0) {
    return `${syncStatus.needsReviewStatementCount} synced statement ${syncStatus.needsReviewStatementCount === 1 ? 'still needs' : 'still need'} review.`;
  }

  if (isEmptyDashboard) {
    return 'No statements have landed for this household yet.';
  }

  return 'The statement pipeline is clear for this household.';
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
    ownerDisplayName: readOwnerDisplayName(transaction.owner_member),
    postedAt: normalizeIsoDate(transaction.posted_at ?? transaction.transaction_date),
    sourceBadge: transaction.source_type === 'upi_whatsapp' ? 'UPI' : 'Card',
    sourceLabel: readRecentTransactionSourceLabel(transaction),
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
    metadata: readRecentTransactionMetadata(record.metadata),
    merchant_raw: readRequiredString(record.merchant_raw, 'merchant_raw'),
    needs_review: readBoolean(record.needs_review, 'needs_review'),
    owner_member: readOwnerMember(record.owner_member),
    posted_at: readNullableString(record.posted_at, 'posted_at'),
    statement_uploads: readRecentStatementUploads(record.statement_uploads),
    source_type: readSourceType(record.source_type, 'source_type'),
    transaction_date: readRequiredString(record.transaction_date, 'transaction_date'),
  };
}

function readOwnerDisplayName(
  input: RecentTransactionRow['owner_member']
): DashboardSnapshot['recentTransactions'][number]['ownerDisplayName'] {
  if (Array.isArray(input)) {
    return readOwnerDisplayName(input[0] ?? null);
  }

  return input?.display_name?.trim() || null;
}

function readOwnerMember(input: unknown): RecentTransactionRow['owner_member'] {
  if (input === null || input === undefined) {
    return null;
  }

  if (Array.isArray(input)) {
    return input.map((member) => {
      const record = readRecord(member);

      return {
        display_name: readNullableString(record.display_name, 'display_name'),
      };
    });
  }

  const record = readRecord(input);

  return {
    display_name: readNullableString(record.display_name, 'display_name'),
  };
}

function readSourceType(input: unknown, field: string): RecentTransactionRow['source_type'] {
  if (input === 'credit_card_statement' || input === 'upi_whatsapp') {
    return input;
  }

  throw new Error(`Expected ${field} to be a supported transaction source.`);
}

function readWhatsAppMessageHealthRow(input: unknown): WhatsAppMessageHealthRow {
  const record = readRecord(input);

  return {
    parse_status: readRequiredString(record.parse_status, 'parse_status'),
    received_at: readRequiredString(record.received_at, 'received_at'),
  };
}

function readRecentStatementUploads(input: unknown): RecentTransactionRow['statement_uploads'] {
  if (input === null || input === undefined) {
    return null;
  }

  if (Array.isArray(input)) {
    return input.map((statementUpload) => {
      const record = readRecord(statementUpload);

      return {
        card_name: readNullableString(record.card_name, 'card_name'),
      };
    });
  }

  const record = readRecord(input);

  return {
    card_name: readNullableString(record.card_name, 'card_name'),
  };
}

function readRecentTransactionMetadata(input: unknown): RecentTransactionRow['metadata'] {
  if (input === null || input === undefined) {
    return null;
  }

  const record = readRecord(input);

  return {
    cardName: readNullableString(record.cardName, 'cardName'),
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

function describeWhatsAppDashboardSource(
  source: ReturnType<typeof buildWhatsAppSourceHealthSnapshot>
) {
  if (source.status === 'needs_setup') {
    return 'Approve at least one participant before the Meta test number is ready.';
  }

  if (source.reviewCaptureCount > 0) {
    return `${source.reviewCaptureCount} WhatsApp capture${source.reviewCaptureCount === 1 ? '' : 's'} need${source.reviewCaptureCount === 1 ? 's' : ''} review.`;
  }

  if (source.failedCaptureCount > 0) {
    return `${source.failedCaptureCount} WhatsApp capture${source.failedCaptureCount === 1 ? '' : 's'} failed recently.`;
  }

  return 'Approved participant capture is healthy.';
}

function readRecentTransactionSourceLabel(transaction: RecentTransactionRow) {
  if (transaction.source_type === 'upi_whatsapp') {
    return 'WhatsApp UPI';
  }

  const metadataCardName = transaction.metadata?.cardName?.trim();

  if (metadataCardName) {
    return metadataCardName;
  }

  const statementUpload = Array.isArray(transaction.statement_uploads)
    ? transaction.statement_uploads[0] ?? null
    : transaction.statement_uploads;
  const statementCardName = statementUpload?.card_name?.trim();

  return statementCardName || 'Statement import';
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
