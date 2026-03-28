import { describe, expect, it, vi } from 'vitest';

import {
  createNotificationPreferencesQueryKey,
  loadNotificationPreferences,
  loadSettingsSnapshot,
  revokeApprovedParticipant,
  saveApprovedParticipant,
  saveNotificationPreference,
  type SettingsClient,
} from './settings-service';

function createSelectBuilder<T>(data: T, error: { message: string } | null = null) {
  const builder = {
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (onFulfilled: (value: { data: T; error: { message: string } | null }) => unknown) =>
      Promise.resolve(onFulfilled({ data, error })),
  };

  return builder;
}

describe('loadSettingsSnapshot', () => {
  it('loads sync health, parser profiles, category summaries, and notification preferences from Supabase', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        categories: [
          {
            categoryId: 'category-shopping',
            categoryName: 'Shopping',
            reviewCount: 0,
            totalSpend: '12450.00',
            transactionCount: 1,
          },
          {
            categoryId: 'category-transport',
            categoryName: 'Transport',
            reviewCount: 1,
            totalSpend: '3200.00',
            transactionCount: 1,
          },
        ],
        householdId: '11111111-1111-4111-8111-111111111111',
        parserProfiles: [
          {
            id: 'hdfc-regalia-gold',
            issuer: 'HDFC Bank',
            lastUsedAt: '2026-03-26T17:45:00.000Z',
            name: 'Regalia Gold PDF parser',
            status: 'fallback',
            successRate: 92,
          },
          {
            id: 'icici-amazon-pay',
            issuer: 'ICICI Bank',
            lastUsedAt: '2026-03-27T05:20:00.000Z',
            name: 'Amazon Pay statement parser',
            status: 'needs_attention',
            successRate: 71,
          },
        ],
        syncStatus: {
          failedStatementCount: 1,
          lastAttemptAt: '2026-03-27T07:45:00.000Z',
          lastError: 'ICICI statement password lookup failed in the n8n decrypt step.',
          lastSuccessfulSyncAt: '2026-03-27T06:10:00.000Z',
          latestParseStatus: 'partial',
          needsReviewStatementCount: 0,
          pendingStatementCount: 1,
        },
      },
      error: null,
    });
    const notificationPreferencesBuilder = createSelectBuilder([
      {
        channel: 'push',
        enabled: true,
        notification_type: 'statement_parse_failure',
      },
      {
        channel: 'email',
        enabled: false,
        notification_type: 'statement_sync_blocked',
      },
      {
        channel: 'push',
        enabled: true,
        notification_type: 'review_queue_escalation',
      },
    ]);
    const householdMembersBuilder = createSelectBuilder([
      {
        display_name: 'Ishan',
        id: 'member-1',
      },
      {
        display_name: 'Spouse',
        id: 'member-2',
      },
    ]);
    const participantsBuilder = createSelectBuilder([
      {
        approved_at: '2026-03-27T07:40:00.000Z',
        display_name: 'Ishan personal',
        id: 'participant-1',
        member: {
          display_name: 'Ishan',
        },
        member_id: 'member-1',
        phone_e164: '+919876543210',
      },
      {
        approved_at: '2026-03-27T07:20:00.000Z',
        display_name: 'Shared number',
        id: 'participant-2',
        member: null,
        member_id: null,
        phone_e164: '+919812345678',
      },
    ]);
    const messagesBuilder = createSelectBuilder([
      {
        parse_status: 'needs_review',
        received_at: '2026-03-27T07:55:00.000Z',
      },
      {
        parse_status: 'posted',
        received_at: '2026-03-27T07:15:00.000Z',
      },
    ]);
    const client: SettingsClient = {
      from: vi.fn((table) => ({
        select: vi.fn(() => {
          if (table === 'notification_preferences') {
            return notificationPreferencesBuilder;
          }

          if (table === 'household_members') {
            return householdMembersBuilder;
          }

          if (table === 'whatsapp_participants') {
            return participantsBuilder;
          }

          return messagesBuilder;
        }),
      })),
      rpc,
    };

    await expect(
      loadSettingsSnapshot(
        client,
        {
          householdId: '11111111-1111-4111-8111-111111111111',
          userId: '22222222-2222-4222-8222-222222222222',
        },
        {
          asOf: '2026-03-27T08:00:00.000Z',
        }
      )
    ).resolves.toEqual({
      categories: [
        {
          id: 'category-shopping',
          name: 'Shopping',
          reviewCount: 0,
          totalAmount: 12450,
          transactionCount: 1,
        },
        {
          id: 'category-transport',
          name: 'Transport',
          reviewCount: 1,
          totalAmount: 3200,
          transactionCount: 1,
        },
      ],
      notificationPreferences: [
        {
          channel: 'push',
          description: 'Surface parser failures within the household app.',
          enabled: true,
          id: 'push-parse-failures',
          label: 'Parser failures',
          notificationType: 'statement_parse_failure',
        },
        {
          channel: 'email',
          description: 'Send a summary when a statement sync has been blocked for over an hour.',
          enabled: false,
          id: 'email-sync-escalations',
          label: 'Sync escalations',
          notificationType: 'statement_sync_blocked',
        },
        {
          channel: 'push',
          description: 'Notify when new rows land with needs review turned on.',
          enabled: true,
          id: 'push-review-queue',
          label: 'Review queue alerts',
          notificationType: 'review_queue_escalation',
        },
      ],
      parserProfiles: [
        {
          id: 'icici-amazon-pay',
          issuer: 'ICICI Bank',
          lastUsedAt: '2026-03-27T05:20:00.000Z',
          name: 'Amazon Pay statement parser',
          status: 'needs_attention',
          successRate: 71,
        },
        {
          id: 'hdfc-regalia-gold',
          issuer: 'HDFC Bank',
          lastUsedAt: '2026-03-26T17:45:00.000Z',
          name: 'Regalia Gold PDF parser',
          status: 'fallback',
          successRate: 92,
        },
      ],
      householdMembers: [
        {
          displayName: 'Ishan',
          id: 'member-1',
        },
        {
          displayName: 'Spouse',
          id: 'member-2',
        },
      ],
      syncHealth: {
        failureCount: 1,
        lastAttemptLabel: '15m ago',
        lastError: 'ICICI statement password lookup failed in the n8n decrypt step.',
        lastSuccessfulSyncLabel: '1h 50m ago',
        pendingStatementCount: 1,
        status: 'degraded',
      },
      whatsappParticipants: [
        {
          approvedAtLabel: '20m ago',
          displayName: 'Ishan personal',
          id: 'participant-1',
          memberDisplayName: 'Ishan',
          memberId: 'member-1',
          phoneE164: '+919876543210',
        },
        {
          approvedAtLabel: '40m ago',
          displayName: 'Shared number',
          id: 'participant-2',
          memberDisplayName: null,
          memberId: null,
          phoneE164: '+919812345678',
        },
      ],
      whatsappSource: {
        acknowledgementStatusLabel: 'Disabled until replies are configured',
        approvedParticipantCount: 2,
        failedCaptureCount: 0,
        healthBody: '1 WhatsApp capture still needs review before the source is fully trusted.',
        lastCaptureLabel: '5m ago',
        reviewCaptureCount: 1,
        setupLabel: '2 approved participants',
        status: 'degraded',
      },
    });

    expect(rpc).toHaveBeenCalledWith('get_household_settings_summary', {
      target_household_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(notificationPreferencesBuilder.eq).toHaveBeenCalledWith(
      'household_id',
      '11111111-1111-4111-8111-111111111111'
    );
    expect(notificationPreferencesBuilder.eq).toHaveBeenCalledWith(
      'user_id',
      '22222222-2222-4222-8222-222222222222'
    );
    expect(participantsBuilder.eq).toHaveBeenCalledWith(
      'household_id',
      '11111111-1111-4111-8111-111111111111'
    );
    expect(participantsBuilder.is).toHaveBeenCalledWith('revoked_at', null);
    expect(messagesBuilder.limit).toHaveBeenCalledWith(20);
  });

  it('falls back to the default preference catalog when the user has not saved any overrides yet', async () => {
    const householdMembersBuilder = createSelectBuilder([
      {
        display_name: null,
        id: 'member-1',
      },
    ]);
    const client: SettingsClient = {
      from: vi.fn((table) => ({
        select: vi.fn(() => {
          if (table === 'household_members') {
            return householdMembersBuilder;
          }

          return createSelectBuilder([]);
        }),
      })),
      rpc: vi.fn().mockResolvedValue({
        data: {
          categories: [],
          householdId: '11111111-1111-4111-8111-111111111111',
          parserProfiles: [],
          syncStatus: {
            failedStatementCount: 0,
            lastAttemptAt: null,
            lastError: null,
            lastSuccessfulSyncAt: null,
            latestParseStatus: null,
            needsReviewStatementCount: 0,
            pendingStatementCount: 0,
          },
        },
        error: null,
      }),
    };

    await expect(
      loadSettingsSnapshot(client, {
        householdId: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
      })
    ).resolves.toMatchObject({
      categories: [],
      notificationPreferences: [
        { enabled: true, id: 'push-parse-failures' },
        { enabled: false, id: 'email-sync-escalations' },
        { enabled: true, id: 'push-review-queue' },
      ],
      parserProfiles: [],
      householdMembers: [
        {
          displayName: 'Household member',
          id: 'member-1',
        },
      ],
      syncHealth: {
        lastAttemptLabel: 'No sync attempts yet',
        lastSuccessfulSyncLabel: 'No statements synced yet',
        pendingStatementCount: 0,
        status: 'healthy',
      },
      whatsappParticipants: [],
      whatsappSource: {
        acknowledgementStatusLabel: 'Disabled until replies are configured',
        approvedParticipantCount: 0,
        failedCaptureCount: 0,
        healthBody: 'Approve at least one household participant before the Meta test number can ingest UPI expenses.',
        lastCaptureLabel: 'No approved participant traffic yet',
        reviewCaptureCount: 0,
        setupLabel: 'No approved participants',
        status: 'needs_setup',
      },
    });
  });
});

describe('loadNotificationPreferences', () => {
  it('loads the lightweight notification-preferences view used by push registration', async () => {
    const notificationPreferencesBuilder = createSelectBuilder([
      {
        channel: 'push',
        enabled: false,
        notification_type: 'statement_parse_failure',
      },
      {
        channel: 'push',
        enabled: true,
        notification_type: 'review_queue_escalation',
      },
    ]);
    const client: SettingsClient = {
      from: vi.fn((table) => ({
        select: vi.fn(() => {
          if (table !== 'notification_preferences') {
            throw new Error(`Unexpected table ${table}`);
          }

          return notificationPreferencesBuilder;
        }),
      })),
      rpc: vi.fn(),
    };

    await expect(
      loadNotificationPreferences(client, {
        householdId: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
      })
    ).resolves.toEqual([
      {
        channel: 'push',
        description: 'Surface parser failures within the household app.',
        enabled: false,
        id: 'push-parse-failures',
        label: 'Parser failures',
        notificationType: 'statement_parse_failure',
      },
      {
        channel: 'email',
        description: 'Send a summary when a statement sync has been blocked for over an hour.',
        enabled: false,
        id: 'email-sync-escalations',
        label: 'Sync escalations',
        notificationType: 'statement_sync_blocked',
      },
      {
        channel: 'push',
        description: 'Notify when new rows land with needs review turned on.',
        enabled: true,
        id: 'push-review-queue',
        label: 'Review queue alerts',
        notificationType: 'review_queue_escalation',
      },
    ]);

    expect(notificationPreferencesBuilder.eq).toHaveBeenCalledWith(
      'household_id',
      '11111111-1111-4111-8111-111111111111'
    );
    expect(notificationPreferencesBuilder.eq).toHaveBeenCalledWith(
      'user_id',
      '22222222-2222-4222-8222-222222222222'
    );
  });
});

describe('createNotificationPreferencesQueryKey', () => {
  it('creates a stable query key for push preference sync', () => {
    expect(
      createNotificationPreferencesQueryKey(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222'
      )
    ).toEqual([
      'notification-preferences',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });
});

describe('saveNotificationPreference', () => {
  it('persists the preference toggle through the settings RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        channel: 'push',
        enabled: false,
        notificationType: 'statement_parse_failure',
      },
      error: null,
    });
    const client: SettingsClient = {
      from: vi.fn(),
      rpc,
    };

    await expect(
      saveNotificationPreference(client, {
        channel: 'push',
        enabled: false,
        householdId: '11111111-1111-4111-8111-111111111111',
        notificationType: 'statement_parse_failure',
      })
    ).resolves.toEqual({
      channel: 'push',
      enabled: false,
      notificationType: 'statement_parse_failure',
    });

    expect(rpc).toHaveBeenCalledWith('upsert_notification_preference', {
      next_enabled: false,
      target_channel: 'push',
      target_household_id: '11111111-1111-4111-8111-111111111111',
      target_notification_type: 'statement_parse_failure',
    });
  });
});

describe('saveApprovedParticipant', () => {
  it('persists participant approvals through the WhatsApp approval RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        displayName: 'Ishan personal',
        memberId: 'member-1',
        participantId: 'participant-1',
        phoneE164: '+919876543210',
        status: 'approved',
      },
      error: null,
    });
    const client: SettingsClient = {
      from: vi.fn(),
      rpc,
    };

    await expect(
      saveApprovedParticipant(client, {
        displayName: 'Ishan personal',
        householdId: '11111111-1111-4111-8111-111111111111',
        memberId: 'member-1',
        phoneE164: '+919876543210',
      })
    ).resolves.toEqual({
      displayName: 'Ishan personal',
      memberId: 'member-1',
      participantId: 'participant-1',
      phoneE164: '+919876543210',
      status: 'approved',
    });

    expect(rpc).toHaveBeenCalledWith('approve_whatsapp_participant', {
      target_display_name: 'Ishan personal',
      target_household_id: '11111111-1111-4111-8111-111111111111',
      target_member_id: 'member-1',
      target_phone_e164: '+919876543210',
    });
  });

  it('falls back to the phone number when the participant has no saved display name yet', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        displayName: null,
        memberId: null,
        participantId: 'participant-2',
        phoneE164: '+919812345678',
        status: 'approved',
      },
      error: null,
    });
    const client: SettingsClient = {
      from: vi.fn(),
      rpc,
    };

    await expect(
      saveApprovedParticipant(client, {
        displayName: '',
        householdId: '11111111-1111-4111-8111-111111111111',
        memberId: null,
        phoneE164: '+919812345678',
      })
    ).resolves.toMatchObject({
      displayName: '+919812345678',
      phoneE164: '+919812345678',
    });
  });
});

describe('revokeApprovedParticipant', () => {
  it('revokes an approved participant through the WhatsApp revoke RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        displayName: 'Ishan personal',
        memberId: 'member-1',
        participantId: 'participant-1',
        phoneE164: '+919876543210',
        status: 'revoked',
      },
      error: null,
    });
    const client: SettingsClient = {
      from: vi.fn(),
      rpc,
    };

    await expect(
      revokeApprovedParticipant(client, {
        householdId: '11111111-1111-4111-8111-111111111111',
        phoneE164: '+919876543210',
      })
    ).resolves.toEqual({
      displayName: 'Ishan personal',
      memberId: 'member-1',
      participantId: 'participant-1',
      phoneE164: '+919876543210',
      status: 'revoked',
    });

    expect(rpc).toHaveBeenCalledWith('revoke_whatsapp_participant', {
      target_household_id: '11111111-1111-4111-8111-111111111111',
      target_phone_e164: '+919876543210',
    });
  });
});
