import { describe, expect, it } from 'vitest';

import { buildSettingsSnapshot } from './settings-model';

describe('buildSettingsSnapshot', () => {
  it('sorts parser profiles by urgency and derives category totals from the live settings summary', () => {
    const snapshot = buildSettingsSnapshot(
      {
        categories: [
          {
            categoryId: 'category-transport',
            categoryName: 'Transport',
            reviewCount: 1,
            totalSpend: 3200,
            transactionCount: 1,
          },
          {
            categoryId: 'category-shopping',
            categoryName: 'Shopping',
            reviewCount: 0,
            totalSpend: 12450,
            transactionCount: 1,
          },
        ],
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
          {
            id: 'amex-mrcc',
            issuer: 'American Express',
            lastUsedAt: '2026-03-18T11:30:00.000Z',
            name: 'MRCC PDF parser',
            status: 'active',
            successRate: 97,
          },
        ],
        syncStatus: {
          failedStatementCount: 0,
          lastAttemptAt: '2026-03-27T07:45:00.000Z',
          lastError: null,
          lastSuccessfulSyncAt: '2026-03-27T06:10:00.000Z',
          latestParseStatus: 'parsed',
          needsReviewStatementCount: 0,
          pendingStatementCount: 0,
        },
      },
      {
        asOf: '2026-03-27T08:00:00.000Z',
      }
    );

    expect(snapshot.parserProfiles.map((profile) => profile.id)).toEqual([
      'icici-amazon-pay',
      'hdfc-regalia-gold',
      'amex-mrcc',
    ]);
    expect(snapshot.categories[0]).toMatchObject({
      name: 'Shopping',
      reviewCount: 0,
      totalAmount: 12450,
      transactionCount: 1,
    });
  });

  it('merges persisted notification overrides and formats sync health labels', () => {
    const snapshot = buildSettingsSnapshot(
      {
        categories: [],
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
      {
        persistedNotificationPreferences: [
          {
            channel: 'push',
            enabled: false,
            notificationType: 'statement_parse_failure',
          },
        ],
        householdMembers: [
          {
            displayName: 'Spouse',
            id: 'member-2',
          },
          {
            displayName: 'Ishan',
            id: 'member-1',
          },
        ],
        whatsappParticipants: [
          {
            approvedAt: '2026-03-27T07:30:00.000Z',
            displayName: 'Primary sender',
            id: 'participant-1',
            memberDisplayName: 'Ishan',
            memberId: 'member-1',
            phoneE164: '+919876543210',
          },
        ],
        whatsappSource: {
          acknowledgementStatusLabel: 'Disabled until replies are configured',
          approvedParticipantCount: 1,
          failedCaptureCount: 0,
          healthBody: 'Ready for the first approved WhatsApp message.',
          lastCaptureLabel: 'No approved participant traffic yet',
          reviewCaptureCount: 0,
          setupLabel: '1 approved participant',
          status: 'healthy',
        },
      }
    );

    expect(snapshot.syncHealth.status).toBe('healthy');
    expect(snapshot.syncHealth.lastAttemptLabel).toBe('No sync attempts yet');
    expect(snapshot.syncHealth.lastSuccessfulSyncLabel).toBe('No statements synced yet');
    expect(snapshot.householdMembers.map((member) => member.displayName)).toEqual(['Ishan', 'Spouse']);
    expect(snapshot.notificationPreferences).toHaveLength(3);
    expect(snapshot.notificationPreferences.find((preference) => preference.id === 'push-parse-failures')).toMatchObject({
      enabled: false,
      notificationType: 'statement_parse_failure',
    });
    expect(snapshot.whatsappSource).toMatchObject({
      acknowledgementStatusLabel: 'Disabled until replies are configured',
      approvedParticipantCount: 1,
      setupLabel: '1 approved participant',
      status: 'healthy',
    });
    expect(snapshot.whatsappParticipants[0]).toMatchObject({
      displayName: 'Primary sender',
      memberDisplayName: 'Ishan',
      phoneE164: '+919876543210',
    });
  });
});
