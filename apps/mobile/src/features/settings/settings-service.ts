import {
  buildSettingsSnapshot,
  type PersistedNotificationPreference,
  type SettingsNotificationType,
  type SettingsSnapshot,
  type SettingsSummary,
} from './settings-model';
import type { NotificationPreference } from '@/features/core-product/core-product-state';

type ErrorLike = {
  message: string;
} | null;

type SelectQuery<T> = Promise<{
  data: T[] | null;
  error: ErrorLike;
}> & {
  eq: (column: string, value: string) => SelectQuery<T>;
};

type UnknownRecord = Record<string, unknown>;

type PersistedNotificationPreferenceRow = {
  channel: NotificationPreference['channel'];
  enabled: boolean;
  notification_type: SettingsNotificationType;
};

export type SettingsClient = {
  from: (table: 'notification_preferences') => {
    select: (columns: string) => SelectQuery<unknown>;
  };
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{
    data: T | null;
    error: ErrorLike;
  }>;
};

export function createSettingsQueryKey(householdId: string | null, userId: string | null) {
  return ['settings', householdId, userId] as const;
}

export async function loadSettingsSnapshot(
  client: SettingsClient,
  input: {
    householdId: string;
    userId: string;
  },
  options: {
    asOf?: string;
  } = {}
): Promise<SettingsSnapshot> {
  const householdId = readRequiredString(input.householdId, 'householdId');
  const userId = readRequiredString(input.userId, 'userId');
  const [summaryResponse, notificationPreferencesResponse] = await Promise.all([
    client.rpc<unknown>('get_household_settings_summary', {
      target_household_id: householdId,
    }),
    client
      .from('notification_preferences')
      .select('notification_type, channel, enabled')
      .eq('household_id', householdId)
      .eq('user_id', userId),
  ]);

  if (summaryResponse.error) {
    throw new Error(`Unable to load settings summary: ${summaryResponse.error.message}`);
  }

  if (notificationPreferencesResponse.error) {
    throw new Error(`Unable to load notification preferences: ${notificationPreferencesResponse.error.message}`);
  }

  return buildSettingsSnapshot(readSettingsSummary(summaryResponse.data), {
    asOf: options.asOf,
    persistedNotificationPreferences: readArray(notificationPreferencesResponse.data).map((row) =>
      readPersistedNotificationPreferenceRow(row)
    ),
  });
}

export async function saveNotificationPreference(
  client: SettingsClient,
  input: {
    channel: NotificationPreference['channel'];
    enabled: boolean;
    householdId: string;
    notificationType: SettingsNotificationType;
  }
) {
  const householdId = readRequiredString(input.householdId, 'householdId');
  const response = await client.rpc<{
    channel?: unknown;
    enabled?: unknown;
    notificationType?: unknown;
  }>('upsert_notification_preference', {
    next_enabled: Boolean(input.enabled),
    target_channel: input.channel,
    target_household_id: householdId,
    target_notification_type: input.notificationType,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return {
    channel: readNotificationChannel(response.data?.channel ?? input.channel, 'channel'),
    enabled: readBoolean(response.data?.enabled ?? input.enabled, 'enabled'),
    notificationType: readNotificationType(
      response.data?.notificationType ?? input.notificationType,
      'notificationType'
    ),
  };
}

function readSettingsSummary(input: unknown): SettingsSummary {
  const record = readRecord(input);

  return {
    categories: readArray(record.categories).map((category) => {
      const categoryRecord = readRecord(category);

      return {
        categoryId: readNullableString(categoryRecord.categoryId, 'categoryId'),
        categoryName: readRequiredString(categoryRecord.categoryName, 'categoryName'),
        reviewCount: readNumber(categoryRecord.reviewCount, 'reviewCount'),
        totalSpend: readNumber(categoryRecord.totalSpend, 'totalSpend'),
        transactionCount: readNumber(categoryRecord.transactionCount, 'transactionCount'),
      };
    }),
    parserProfiles: readArray(record.parserProfiles).map((profile) => {
      const profileRecord = readRecord(profile);

      return {
        id: readRequiredString(profileRecord.id, 'id'),
        issuer: readRequiredString(profileRecord.issuer, 'issuer'),
        lastUsedAt: readRequiredString(profileRecord.lastUsedAt, 'lastUsedAt'),
        name: readRequiredString(profileRecord.name, 'name'),
        status: readParserProfileStatus(profileRecord.status, 'status'),
        successRate: readNumber(profileRecord.successRate, 'successRate'),
      };
    }),
    syncStatus: readSettingsSyncSummary(record.syncStatus),
  };
}

function readSettingsSyncSummary(input: unknown): SettingsSummary['syncStatus'] {
  const record = readRecord(input);

  return {
    failedStatementCount: readNumber(record.failedStatementCount, 'failedStatementCount'),
    lastAttemptAt: readNullableString(record.lastAttemptAt, 'lastAttemptAt'),
    lastError: readNullableString(record.lastError, 'lastError'),
    lastSuccessfulSyncAt: readNullableString(record.lastSuccessfulSyncAt, 'lastSuccessfulSyncAt'),
    latestParseStatus: readNullableString(record.latestParseStatus, 'latestParseStatus'),
    needsReviewStatementCount: readNumber(record.needsReviewStatementCount, 'needsReviewStatementCount'),
    pendingStatementCount: readNumber(record.pendingStatementCount, 'pendingStatementCount'),
  };
}

function readPersistedNotificationPreferenceRow(input: unknown): PersistedNotificationPreference {
  const record = readRecord(input);

  return {
    channel: readNotificationChannel(record.channel, 'channel'),
    enabled: readBoolean(record.enabled, 'enabled'),
    notificationType: readNotificationType(record.notification_type, 'notification_type'),
  };
}

function readArray(input: unknown) {
  if (Array.isArray(input)) {
    return input;
  }

  if (input === null || input === undefined) {
    return [];
  }

  throw new Error('Expected an array response from Supabase.');
}

function readBoolean(input: unknown, fieldName: string) {
  if (typeof input === 'boolean') {
    return input;
  }

  throw new Error(`Expected ${fieldName} to be a boolean.`);
}

function readNotificationChannel(input: unknown, fieldName: string): NotificationPreference['channel'] {
  if (input === 'email' || input === 'push') {
    return input;
  }

  throw new Error(`Expected ${fieldName} to be a supported notification channel.`);
}

function readNotificationType(input: unknown, fieldName: string): SettingsNotificationType {
  if (
    input === 'review_queue_escalation' ||
    input === 'statement_parse_failure' ||
    input === 'statement_sync_blocked'
  ) {
    return input;
  }

  throw new Error(`Expected ${fieldName} to be a supported notification type.`);
}

function readNullableString(input: unknown, fieldName: string) {
  if (typeof input === 'string') {
    return input;
  }

  if (input === null || input === undefined) {
    return null;
  }

  throw new Error(`Expected ${fieldName} to be a string or null.`);
}

function readNumber(input: unknown, fieldName: string) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === 'string' && input.trim().length > 0) {
    const parsedValue = Number(input);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  throw new Error(`Expected ${fieldName} to be numeric.`);
}

function readParserProfileStatus(input: unknown, fieldName: string) {
  if (input === 'active' || input === 'fallback' || input === 'needs_attention') {
    return input;
  }

  throw new Error(`Expected ${fieldName} to be a supported parser profile status.`);
}

function readRecord(input: unknown): UnknownRecord {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as UnknownRecord;
  }

  throw new Error('Expected a record response from Supabase.');
}

function readRequiredString(input: unknown, fieldName: string) {
  if (typeof input === 'string' && input.trim().length > 0) {
    return input;
  }

  throw new Error(`Expected ${fieldName} to be a non-empty string.`);
}
