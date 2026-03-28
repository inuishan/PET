import {
  buildSettingsNotificationPreferences,
  buildSettingsSnapshot,
  type PersistedNotificationPreference,
  type SettingsApprovedParticipant,
  type SettingsHouseholdMember,
  type SettingsNotificationPreference,
  type SettingsNotificationType,
  type SettingsSnapshot,
  type SettingsSummary,
} from './settings-model';
import { buildWhatsAppSourceHealthSnapshot } from '@/features/core-product/whatsapp-source-health';
import type { NotificationPreference } from '@/features/core-product/core-product-state';

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

type PersistedNotificationPreferenceRow = {
  channel: NotificationPreference['channel'];
  enabled: boolean;
  notification_type: SettingsNotificationType;
};

type HouseholdMemberRow = {
  display_name: string | null;
  id: string;
};

type WhatsAppMessageRow = {
  parse_status: string;
  received_at: string;
};

type WhatsAppParticipantRow = {
  approved_at: string;
  display_name: string | null;
  id: string;
  member: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
  member_id: string | null;
  phone_e164: string;
};

type SavedParticipant = {
  displayName: string;
  memberId: string | null;
  participantId: string;
  phoneE164: string;
  status: 'approved' | 'revoked';
};

export type SettingsClient = {
  from: (table: 'household_members' | 'notification_preferences' | 'whatsapp_messages' | 'whatsapp_participants') => {
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

export function createNotificationPreferencesQueryKey(householdId: string | null, userId: string | null) {
  return ['notification-preferences', householdId, userId] as const;
}

export async function loadNotificationPreferences(
  client: SettingsClient,
  input: {
    householdId: string;
    userId: string;
  }
): Promise<SettingsNotificationPreference[]> {
  const householdId = readRequiredString(input.householdId, 'householdId');
  const userId = readRequiredString(input.userId, 'userId');
  const response = await createNotificationPreferencesQuery(client, householdId, userId);

  if (response.error) {
    throw new Error(`Unable to load notification preferences: ${response.error.message}`);
  }

  return buildSettingsNotificationPreferences(
    readArray(response.data).map((row) => readPersistedNotificationPreferenceRow(row))
  );
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
  const [summaryResponse, notificationPreferencesResponse, householdMembersResponse, participantsResponse, messagesResponse] = await Promise.all([
    client.rpc<unknown>('get_household_settings_summary', {
      target_household_id: householdId,
    }),
    createNotificationPreferencesQuery(client, householdId, userId),
    client
      .from('household_members')
      .select('id, display_name')
      .eq('household_id', householdId)
      .order('display_name', { ascending: true }),
    client
      .from('whatsapp_participants')
      .select('id, phone_e164, display_name, approved_at, member_id, member:household_members(display_name)')
      .eq('household_id', householdId)
      .is('revoked_at', null)
      .order('approved_at', { ascending: false }),
    client
      .from('whatsapp_messages')
      .select('parse_status, received_at')
      .eq('household_id', householdId)
      .order('received_at', { ascending: false })
      .limit(20),
  ]);

  if (summaryResponse.error) {
    throw new Error(`Unable to load settings summary: ${summaryResponse.error.message}`);
  }

  if (notificationPreferencesResponse.error) {
    throw new Error(`Unable to load notification preferences: ${notificationPreferencesResponse.error.message}`);
  }

  if (householdMembersResponse.error) {
    throw new Error(`Unable to load household members: ${householdMembersResponse.error.message}`);
  }

  if (participantsResponse.error) {
    throw new Error(`Unable to load approved participants: ${participantsResponse.error.message}`);
  }

  if (messagesResponse.error) {
    throw new Error(`Unable to load WhatsApp source health: ${messagesResponse.error.message}`);
  }

  const asOf = options.asOf ?? new Date().toISOString();
  const householdMembers = readArray(householdMembersResponse.data).map((row) => readHouseholdMemberRow(row));
  const approvedParticipants = readArray(participantsResponse.data).map((row) =>
    readWhatsAppParticipantRow(row)
  );
  const whatsappMessages = readArray(messagesResponse.data).map((row) => readWhatsAppMessageRow(row));

  return buildSettingsSnapshot(readSettingsSummary(summaryResponse.data), {
    asOf,
    householdMembers,
    persistedNotificationPreferences: readArray(notificationPreferencesResponse.data).map((row) =>
      readPersistedNotificationPreferenceRow(row)
    ),
    whatsappParticipants: approvedParticipants,
    whatsappSource: buildWhatsAppSourceHealthSnapshot(
      {
        approvedParticipantCount: approvedParticipants.length,
        messages: whatsappMessages.map((message) => ({
          parseStatus: message.parse_status === 'parsed' ? 'posted' : message.parse_status,
          receivedAt: message.received_at,
        })),
      },
      asOf
    ),
  });
}

function createNotificationPreferencesQuery(client: SettingsClient, householdId: string, userId: string) {
  return client
    .from('notification_preferences')
    .select('notification_type, channel, enabled')
    .eq('household_id', householdId)
    .eq('user_id', userId);
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

export async function saveApprovedParticipant(
  client: SettingsClient,
  input: {
    displayName: string;
    householdId: string;
    memberId: string | null;
    phoneE164: string;
  }
): Promise<SavedParticipant> {
  const response = await client.rpc<unknown>('approve_whatsapp_participant', {
    target_display_name: normalizeOptionalString(input.displayName),
    target_household_id: readRequiredString(input.householdId, 'householdId'),
    target_member_id: readOptionalUuid(input.memberId),
    target_phone_e164: readRequiredString(input.phoneE164, 'phoneE164'),
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return readSavedParticipant(response.data);
}

export async function revokeApprovedParticipant(
  client: SettingsClient,
  input: {
    householdId: string;
    phoneE164: string;
  }
): Promise<SavedParticipant> {
  const response = await client.rpc<unknown>('revoke_whatsapp_participant', {
    target_household_id: readRequiredString(input.householdId, 'householdId'),
    target_phone_e164: readRequiredString(input.phoneE164, 'phoneE164'),
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return readSavedParticipant(response.data);
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

function readHouseholdMemberRow(input: unknown): SettingsHouseholdMember {
  const record = readRecord(input);

  return {
    displayName: readNullableString(record.display_name, 'display_name') ?? 'Household member',
    id: readRequiredString(record.id, 'id'),
  };
}

function readSavedParticipant(input: unknown): SavedParticipant {
  const record = readRecord(input);
  const phoneE164 = readRequiredString(record.phoneE164, 'phoneE164');

  return {
    displayName: readNullableString(record.displayName, 'displayName') ?? phoneE164,
    memberId: readNullableString(record.memberId, 'memberId'),
    participantId: readRequiredString(record.participantId, 'participantId'),
    phoneE164,
    status: readParticipantStatus(record.status, 'status'),
  };
}

function readWhatsAppMessageRow(input: unknown): WhatsAppMessageRow {
  const record = readRecord(input);

  return {
    parse_status: readRequiredString(record.parse_status, 'parse_status'),
    received_at: readRequiredString(record.received_at, 'received_at'),
  };
}

function readWhatsAppParticipantRow(input: unknown): SettingsApprovedParticipant {
  const record = readRecord(input);

  return {
    approvedAt: readRequiredString(record.approved_at, 'approved_at'),
    displayName:
      readNullableString(record.display_name, 'display_name')
      ?? readRequiredString(record.phone_e164, 'phone_e164'),
    id: readRequiredString(record.id, 'id'),
    memberDisplayName: readParticipantMemberDisplayName(record.member),
    memberId: readNullableString(record.member_id, 'member_id'),
    phoneE164: readRequiredString(record.phone_e164, 'phone_e164'),
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

function readOptionalUuid(input: unknown) {
  if (input === null || input === undefined) {
    return null;
  }

  return readRequiredString(input, 'memberId');
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

function normalizeOptionalString(input: string) {
  const normalizedValue = input.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
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

function readParticipantMemberDisplayName(input: unknown) {
  if (input === null || input === undefined) {
    return null;
  }

  if (Array.isArray(input)) {
    return readParticipantMemberDisplayName(input[0] ?? null);
  }

  const record = readRecord(input);
  return readNullableString(record.display_name, 'display_name');
}

function readParticipantStatus(input: unknown, fieldName: string): SavedParticipant['status'] {
  if (input === 'approved' || input === 'revoked') {
    return input;
  }

  throw new Error(`Expected ${fieldName} to be an approved participant status.`);
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
