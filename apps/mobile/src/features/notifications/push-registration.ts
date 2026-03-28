import type { SettingsNotificationPreference, SettingsNotificationType } from '@/features/settings/settings-model';
import { secureStoreStorage } from '@/lib/secure-store-storage';

export const PHASE1_ALERT_NOTIFICATION_CHANNEL_ID = 'phase1-alerts';
const PHASE1_PUSH_REGISTRATION_STATE_KEY = 'phase1.push.registration.state';

type DevicePushToken = {
  data: string;
  type: string;
};

type NotificationPermissionState = {
  granted: boolean;
  status?: string;
};

type NotificationsRuntime = {
  getDevicePushTokenAsync: () => Promise<DevicePushToken>;
  getPermissionsAsync: () => Promise<NotificationPermissionState>;
  requestPermissionsAsync: () => Promise<NotificationPermissionState>;
  setNotificationChannelAsync: (channelId: string, channel: {
    name: string;
  }) => Promise<void>;
};

type TopicClient = {
  syncSubscriptions: (input: {
    subscribeTopics: string[];
    unsubscribeTopics: string[];
  }) => Promise<void>;
};

export type Phase1PushRegistrationResult = {
  devicePushToken: DevicePushToken | null;
  status: 'permission_denied' | 'registered';
  subscribedTopics: string[];
  unsubscribedTopics: string[];
};

export type Phase1PushRegistrationDependencies = {
  notifications: NotificationsRuntime;
  platformOs: 'android' | 'ios' | 'web';
  topicClient: TopicClient;
};

export function buildPhase1PushTopicForNotification(
  userId: string,
  notificationType: SettingsNotificationType,
  pushTopicPrefix: string
) {
  return `${pushTopicPrefix}-${notificationType}-${userId}`;
}

export async function syncPhase1PushRegistration(
  dependencies: Phase1PushRegistrationDependencies,
  input: {
    notificationPreferences: SettingsNotificationPreference[];
    previouslySubscribedTopics?: string[];
    pushTopicPrefix: string;
    userId: string;
  }
): Promise<Phase1PushRegistrationResult> {
  const userId = readRequiredString(input.userId, 'userId');
  const pushTopicPrefix = readRequiredString(input.pushTopicPrefix, 'pushTopicPrefix');
  const pushPreferences = input.notificationPreferences.filter((preference) => preference.channel === 'push');
  const subscribedTopics = pushPreferences
    .filter((preference) => preference.enabled)
    .map((preference) =>
      buildPhase1PushTopicForNotification(userId, preference.notificationType, pushTopicPrefix)
    );
  const unsubscribedTopics = createUniqueTopics([
    ...pushPreferences
      .filter((preference) => !preference.enabled)
      .map((preference) =>
        buildPhase1PushTopicForNotification(userId, preference.notificationType, pushTopicPrefix)
      ),
    ...(input.previouslySubscribedTopics ?? []).filter((topic) => !subscribedTopics.includes(topic)),
  ]);

  if (dependencies.platformOs === 'android') {
    await dependencies.notifications.setNotificationChannelAsync(PHASE1_ALERT_NOTIFICATION_CHANNEL_ID, {
      name: 'Phase 1 alerts',
    });
  }

  const currentPermissions = await dependencies.notifications.getPermissionsAsync();
  const grantedPermissions = currentPermissions.granted
    ? currentPermissions
    : await dependencies.notifications.requestPermissionsAsync();

  if (!grantedPermissions.granted) {
    if (unsubscribedTopics.length > 0) {
      await dependencies.topicClient.syncSubscriptions({
        subscribeTopics: [],
        unsubscribeTopics: unsubscribedTopics,
      });
    }

    return {
      devicePushToken: null,
      status: 'permission_denied',
      subscribedTopics: [],
      unsubscribedTopics,
    };
  }

  const devicePushToken = await dependencies.notifications.getDevicePushTokenAsync();

  await dependencies.topicClient.syncSubscriptions({
    subscribeTopics: subscribedTopics,
    unsubscribeTopics: unsubscribedTopics,
  });

  return {
    devicePushToken,
    status: 'registered',
    subscribedTopics,
    unsubscribedTopics,
  };
}

export async function syncLivePhase1PushRegistration(input: {
  notificationPreferences: SettingsNotificationPreference[];
  platformOs: 'android' | 'ios' | 'web';
  pushTopicPrefix: string;
  userId: string;
}) {
  const previousState = await readStoredPushRegistrationState();
  const [notifications, topicClient] = await Promise.all([
    loadExpoNotificationsRuntime(),
    loadFirebaseMessagingTopicClient(),
  ]);

  const result = await syncPhase1PushRegistration(
    {
      notifications,
      platformOs: input.platformOs,
      topicClient,
    },
    {
      ...input,
      previouslySubscribedTopics: previousState?.subscribedTopics ?? [],
    }
  );

  if (result.status === 'registered') {
    await saveStoredPushRegistrationState(result.subscribedTopics);
  } else {
    await clearStoredPushRegistrationState();
  }

  return result;
}

export async function resetLivePhase1PushRegistration() {
  const previousState = await readStoredPushRegistrationState();

  if (!previousState || previousState.subscribedTopics.length === 0) {
    await clearStoredPushRegistrationState();
    return;
  }

  const topicClient = await loadFirebaseMessagingTopicClient();

  await topicClient.syncSubscriptions({
    subscribeTopics: [],
    unsubscribeTopics: previousState.subscribedTopics,
  });
  await clearStoredPushRegistrationState();
}

async function loadExpoNotificationsRuntime(): Promise<NotificationsRuntime> {
  try {
    const notifications = await import('expo-notifications');

    return {
      getDevicePushTokenAsync: () => notifications.getDevicePushTokenAsync(),
      getPermissionsAsync: () => notifications.getPermissionsAsync(),
      requestPermissionsAsync: () => notifications.requestPermissionsAsync(),
      setNotificationChannelAsync: (channelId, channel) =>
        notifications.setNotificationChannelAsync(channelId, channel),
    };
  } catch (error) {
    throw wrapMissingDependencyError(
      'expo-notifications',
      'Phase 1 push registration requires expo-notifications in the mobile app build.',
      error
    );
  }
}

async function loadFirebaseMessagingTopicClient(): Promise<TopicClient> {
  try {
    const messagingModule = await import('@react-native-firebase/messaging');
    const messaging = messagingModule.default();

    return {
      async syncSubscriptions(input) {
        if (typeof messaging.registerDeviceForRemoteMessages === 'function') {
          await messaging.registerDeviceForRemoteMessages();
        }

        if (typeof messaging.getToken === 'function') {
          await messaging.getToken();
        }

        await Promise.all(
          input.unsubscribeTopics.map((topic) => messaging.unsubscribeFromTopic(topic))
        );
        await Promise.all(input.subscribeTopics.map((topic) => messaging.subscribeToTopic(topic)));
      },
    };
  } catch (error) {
    throw wrapMissingDependencyError(
      '@react-native-firebase/messaging',
      'Phase 1 topic subscription requires Firebase Messaging in the mobile app build.',
      error
    );
  }
}

function readRequiredString(input: string, fieldName: string) {
  if (typeof input === 'string' && input.trim().length > 0) {
    return input.trim();
  }

  throw new Error(`Expected ${fieldName} to be a non-empty string.`);
}

function createUniqueTopics(topics: string[]) {
  return [...new Set(topics)];
}

async function readStoredPushRegistrationState() {
  const rawState = await secureStoreStorage.getItem(PHASE1_PUSH_REGISTRATION_STATE_KEY);

  if (!rawState) {
    return null;
  }

  try {
    const parsedState = JSON.parse(rawState) as {
      subscribedTopics?: unknown;
    };

    return {
      subscribedTopics: Array.isArray(parsedState.subscribedTopics)
        ? parsedState.subscribedTopics.filter((topic): topic is string => typeof topic === 'string')
        : [],
    };
  } catch {
    await clearStoredPushRegistrationState();
    return null;
  }
}

async function saveStoredPushRegistrationState(subscribedTopics: string[]) {
  await secureStoreStorage.setItem(
    PHASE1_PUSH_REGISTRATION_STATE_KEY,
    JSON.stringify({
      subscribedTopics: createUniqueTopics(subscribedTopics),
    })
  );
}

async function clearStoredPushRegistrationState() {
  await secureStoreStorage.removeItem(PHASE1_PUSH_REGISTRATION_STATE_KEY);
}

function wrapMissingDependencyError(dependencyName: string, message: string, error: unknown) {
  const cause = error instanceof Error ? ` ${error.message}` : '';

  return new Error(`${message} Missing dependency: ${dependencyName}.${cause}`.trim());
}
