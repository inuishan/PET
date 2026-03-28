import { describe, expect, it, vi } from 'vitest';

import {
  buildPhase1PushTopicForNotification,
  syncPhase1PushRegistration,
} from './push-registration';
import type { SettingsNotificationPreference } from '@/features/settings/settings-model';

const pushPreferences: SettingsNotificationPreference[] = [
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
    enabled: false,
    id: 'push-review-queue',
    label: 'Review queue alerts',
    notificationType: 'review_queue_escalation',
  },
];

describe('buildPhase1PushTopicForNotification', () => {
  it('creates a per-user, per-notification topic name', () => {
    expect(
      buildPhase1PushTopicForNotification(
        '22222222-2222-4222-8222-222222222222',
        'statement_parse_failure',
        'phase1-user'
      )
    ).toBe('phase1-user-statement_parse_failure-22222222-2222-4222-8222-222222222222');
  });
});

describe('syncPhase1PushRegistration', () => {
  it('registers the device and syncs the enabled Phase 1 topics', async () => {
    const notifications = {
      getDevicePushTokenAsync: vi.fn().mockResolvedValue({
        data: 'native-token-123',
        type: 'fcm',
      }),
      getPermissionsAsync: vi.fn().mockResolvedValue({
        granted: false,
        status: 'denied',
      }),
      requestPermissionsAsync: vi.fn().mockResolvedValue({
        granted: true,
        status: 'granted',
      }),
      setNotificationChannelAsync: vi.fn().mockResolvedValue(undefined),
    };
    const topicClient = {
      syncSubscriptions: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      syncPhase1PushRegistration(
        {
          notifications,
          platformOs: 'android',
          topicClient,
        },
        {
          notificationPreferences: pushPreferences,
          pushTopicPrefix: 'phase1-user',
          userId: '22222222-2222-4222-8222-222222222222',
        }
      )
    ).resolves.toEqual({
      devicePushToken: {
        data: 'native-token-123',
        type: 'fcm',
      },
      status: 'registered',
      subscribedTopics: [
        'phase1-user-statement_parse_failure-22222222-2222-4222-8222-222222222222',
      ],
      unsubscribedTopics: [
        'phase1-user-review_queue_escalation-22222222-2222-4222-8222-222222222222',
      ],
    });

    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'phase1-alerts',
      expect.objectContaining({
        name: 'Phase 1 alerts',
      })
    );
    expect(topicClient.syncSubscriptions).toHaveBeenCalledWith({
      subscribeTopics: [
        'phase1-user-statement_parse_failure-22222222-2222-4222-8222-222222222222',
      ],
      unsubscribeTopics: [
        'phase1-user-review_queue_escalation-22222222-2222-4222-8222-222222222222',
      ],
    });
  });

  it('skips topic sync when permission is denied', async () => {
    const notifications = {
      getDevicePushTokenAsync: vi.fn(),
      getPermissionsAsync: vi.fn().mockResolvedValue({
        granted: false,
        status: 'denied',
      }),
      requestPermissionsAsync: vi.fn().mockResolvedValue({
        granted: false,
        status: 'denied',
      }),
      setNotificationChannelAsync: vi.fn().mockResolvedValue(undefined),
    };
    const topicClient = {
      syncSubscriptions: vi.fn(),
    };

    await expect(
      syncPhase1PushRegistration(
        {
          notifications,
          platformOs: 'ios',
          topicClient,
        },
        {
          notificationPreferences: pushPreferences,
          previouslySubscribedTopics: [
            'phase1-user-review_queue_escalation-11111111-1111-4111-8111-111111111111',
          ],
          pushTopicPrefix: 'phase1-user',
          userId: '22222222-2222-4222-8222-222222222222',
        }
      )
    ).resolves.toEqual({
      devicePushToken: null,
      status: 'permission_denied',
      subscribedTopics: [],
      unsubscribedTopics: [
        'phase1-user-review_queue_escalation-11111111-1111-4111-8111-111111111111',
        'phase1-user-review_queue_escalation-22222222-2222-4222-8222-222222222222',
      ],
    });

    expect(notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(topicClient.syncSubscriptions).toHaveBeenCalledWith({
      subscribeTopics: [],
      unsubscribeTopics: [
        'phase1-user-review_queue_escalation-22222222-2222-4222-8222-222222222222',
        'phase1-user-review_queue_escalation-11111111-1111-4111-8111-111111111111',
      ],
    });
  });

  it('unsubscribes stale topics from a previous signed-in user', async () => {
    const notifications = {
      getDevicePushTokenAsync: vi.fn().mockResolvedValue({
        data: 'native-token-123',
        type: 'fcm',
      }),
      getPermissionsAsync: vi.fn().mockResolvedValue({
        granted: true,
        status: 'granted',
      }),
      requestPermissionsAsync: vi.fn(),
      setNotificationChannelAsync: vi.fn().mockResolvedValue(undefined),
    };
    const topicClient = {
      syncSubscriptions: vi.fn().mockResolvedValue(undefined),
    };

    await syncPhase1PushRegistration(
      {
        notifications,
        platformOs: 'ios',
        topicClient,
      },
      {
        notificationPreferences: pushPreferences,
        previouslySubscribedTopics: [
          'phase1-user-statement_parse_failure-11111111-1111-4111-8111-111111111111',
        ],
        pushTopicPrefix: 'phase1-user',
        userId: '22222222-2222-4222-8222-222222222222',
      }
    );

    expect(topicClient.syncSubscriptions).toHaveBeenCalledWith({
      subscribeTopics: [
        'phase1-user-statement_parse_failure-22222222-2222-4222-8222-222222222222',
      ],
      unsubscribeTopics: [
        'phase1-user-review_queue_escalation-22222222-2222-4222-8222-222222222222',
        'phase1-user-statement_parse_failure-11111111-1111-4111-8111-111111111111',
      ],
    });
  });
});
