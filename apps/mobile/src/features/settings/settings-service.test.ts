import { describe, expect, it, vi } from 'vitest';

import {
  loadSettingsSnapshot,
  saveNotificationPreference,
  type SettingsClient,
} from './settings-service';

function createSelectBuilder<T>(data: T, error: { message: string } | null = null) {
  const builder = {
    eq: vi.fn(() => builder),
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
    const client: SettingsClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => notificationPreferencesBuilder),
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
      syncHealth: {
        failureCount: 1,
        lastAttemptLabel: '15m ago',
        lastError: 'ICICI statement password lookup failed in the n8n decrypt step.',
        lastSuccessfulSyncLabel: '1h 50m ago',
        pendingStatementCount: 1,
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
  });

  it('falls back to the default preference catalog when the user has not saved any overrides yet', async () => {
    const client: SettingsClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => createSelectBuilder([])),
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
      syncHealth: {
        lastAttemptLabel: 'No sync attempts yet',
        lastSuccessfulSyncLabel: 'No statements synced yet',
        pendingStatementCount: 0,
        status: 'healthy',
      },
    });
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
