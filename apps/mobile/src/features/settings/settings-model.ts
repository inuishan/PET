import { formatRelativeDuration } from '@/features/core-product/core-product-formatting';
import type { NotificationPreference, ParserProfile, ParserProfileStatus, SyncStatus } from '@/features/core-product/core-product-state';

export type SettingsNotificationType =
  | 'review_queue_escalation'
  | 'statement_parse_failure'
  | 'statement_sync_blocked';

export type PersistedNotificationPreference = {
  channel: NotificationPreference['channel'];
  enabled: boolean;
  notificationType: SettingsNotificationType;
};

export type SettingsCategorySummary = {
  categoryId: string | null;
  categoryName: string;
  reviewCount: number;
  totalSpend: number;
  transactionCount: number;
};

export type SettingsParserProfileSummary = ParserProfile;

export type SettingsSyncSummary = {
  failedStatementCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastSuccessfulSyncAt: string | null;
  latestParseStatus: string | null;
  needsReviewStatementCount: number;
  pendingStatementCount: number;
};

export type SettingsSummary = {
  categories: SettingsCategorySummary[];
  parserProfiles: SettingsParserProfileSummary[];
  syncStatus: SettingsSyncSummary;
};

export type SettingsNotificationPreference = NotificationPreference & {
  notificationType: SettingsNotificationType;
};

export type SettingsSnapshot = {
  categories: Array<{
    id: string;
    name: string;
    reviewCount: number;
    totalAmount: number;
    transactionCount: number;
  }>;
  notificationPreferences: SettingsNotificationPreference[];
  parserProfiles: SettingsParserProfileSummary[];
  syncHealth: {
    failureCount: number;
    lastAttemptLabel: string;
    lastError: string | null;
    lastSuccessfulSyncLabel: string;
    pendingStatementCount: number;
    status: SyncStatus;
  };
};

type NotificationPreferenceCatalogEntry = {
  defaultEnabled: boolean;
  id: string;
  label: string;
  description: string;
  channel: NotificationPreference['channel'];
  notificationType: SettingsNotificationType;
};

const profileStatusRank: Record<ParserProfileStatus, number> = {
  active: 2,
  fallback: 1,
  needs_attention: 0,
};

const notificationPreferenceCatalog: NotificationPreferenceCatalogEntry[] = [
  {
    channel: 'push',
    defaultEnabled: true,
    description: 'Surface parser failures within the household app.',
    id: 'push-parse-failures',
    label: 'Parser failures',
    notificationType: 'statement_parse_failure',
  },
  {
    channel: 'email',
    defaultEnabled: false,
    description: 'Send a summary when a statement sync has been blocked for over an hour.',
    id: 'email-sync-escalations',
    label: 'Sync escalations',
    notificationType: 'statement_sync_blocked',
  },
  {
    channel: 'push',
    defaultEnabled: true,
    description: 'Notify when new rows land with needs review turned on.',
    id: 'push-review-queue',
    label: 'Review queue alerts',
    notificationType: 'review_queue_escalation',
  },
];

export function buildSettingsSnapshot(summary: SettingsSummary, options: {
  asOf?: string;
  persistedNotificationPreferences?: PersistedNotificationPreference[];
} = {}): SettingsSnapshot {
  const asOf = options.asOf ?? new Date().toISOString();
  const persistedPreferenceLookup = new Map(
    (options.persistedNotificationPreferences ?? []).map((preference) => [
      createNotificationPreferenceLookupKey(preference.notificationType, preference.channel),
      preference.enabled,
    ])
  );

  return {
    categories: [...summary.categories]
      .map((category) => ({
        id: category.categoryId ?? 'uncategorized',
        name: category.categoryName,
        reviewCount: category.reviewCount,
        totalAmount: category.totalSpend,
        transactionCount: category.transactionCount,
      }))
      .sort((left, right) => {
        if (right.totalAmount !== left.totalAmount) {
          return right.totalAmount - left.totalAmount;
        }

        return left.name.localeCompare(right.name);
      }),
    notificationPreferences: notificationPreferenceCatalog.map((preference) => ({
      channel: preference.channel,
      description: preference.description,
      enabled:
        persistedPreferenceLookup.get(
          createNotificationPreferenceLookupKey(preference.notificationType, preference.channel)
        ) ?? preference.defaultEnabled,
      id: preference.id,
      label: preference.label,
      notificationType: preference.notificationType,
    })),
    parserProfiles: [...summary.parserProfiles].sort((left, right) => {
      const statusRankDifference = profileStatusRank[left.status] - profileStatusRank[right.status];

      if (statusRankDifference !== 0) {
        return statusRankDifference;
      }

      return new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime();
    }),
    syncHealth: {
      failureCount: summary.syncStatus.failedStatementCount,
      lastAttemptLabel: formatSyncAttempt(summary.syncStatus.lastAttemptAt, asOf),
      lastError: summary.syncStatus.lastError,
      lastSuccessfulSyncLabel: formatSyncSuccess(summary.syncStatus.lastSuccessfulSyncAt, asOf),
      pendingStatementCount: summary.syncStatus.pendingStatementCount,
      status: getSettingsSyncStatus(summary.syncStatus),
    },
  };
}

function createNotificationPreferenceLookupKey(
  notificationType: SettingsNotificationType,
  channel: NotificationPreference['channel']
) {
  return `${notificationType}:${channel}`;
}

function formatSyncAttempt(lastAttemptAt: string | null, asOf: string) {
  if (!lastAttemptAt) {
    return 'No sync attempts yet';
  }

  return formatRelativeDuration(lastAttemptAt, asOf);
}

function formatSyncSuccess(lastSuccessfulSyncAt: string | null, asOf: string) {
  if (!lastSuccessfulSyncAt) {
    return 'No statements synced yet';
  }

  return formatRelativeDuration(lastSuccessfulSyncAt, asOf);
}

function getSettingsSyncStatus(syncStatus: SettingsSyncSummary): SyncStatus {
  if (syncStatus.latestParseStatus === 'failed') {
    return 'failing';
  }

  if (
    syncStatus.failedStatementCount > 0 ||
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
