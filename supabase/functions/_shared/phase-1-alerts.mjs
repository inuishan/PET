const DEFAULT_CHANNELS = ['push'];
const DEFAULT_MAX_DELIVERY_ATTEMPTS = 3;
const DEFAULT_MAX_PERSISTENCE_ATTEMPTS = 3;
const DEFAULT_PUSH_TOPIC_PREFIX = 'phase1-user';
const FIREBASE_MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const SUPPORTED_CHANNELS = new Set(['push']);

export function buildPushTopicForUser(userId, prefix = DEFAULT_PUSH_TOPIC_PREFIX) {
  return `${prefix}-${userId}`;
}

export function parseAlertChannels(value) {
  const normalizedChannels = String(value ?? '')
    .split(',')
    .map((channel) => channel.trim())
    .filter((channel) => SUPPORTED_CHANNELS.has(channel));

  return normalizedChannels.length > 0 ? normalizedChannels : [...DEFAULT_CHANNELS];
}

export function createPhase1AlertService(dependencies) {
  const {
    defaultChannels = DEFAULT_CHANNELS,
    maxDeliveryAttempts = DEFAULT_MAX_DELIVERY_ATTEMPTS,
    maxPersistenceAttempts = DEFAULT_MAX_PERSISTENCE_ATTEMPTS,
    now = () => new Date().toISOString(),
    pushProvider,
    pushTopicPrefix = DEFAULT_PUSH_TOPIC_PREFIX,
    repository,
  } = dependencies;

  if (!repository) {
    return createNoopPhase1AlertService();
  }

  return {
    async notifyParserFailure(context) {
      return notifyEvent(
        {
          ...context,
          body: `Could not parse ${context.providerFileName}. Check the parser profile and retry the sync.`,
          notificationType: 'statement_parse_failure',
          payload: {
            parserProfileName: context.parserProfileName ?? null,
            providerFileId: context.providerFileId,
            providerFileName: context.providerFileName,
            reasonCode: 'statement_parse_failed',
          },
          title: 'Statement parse failed',
        },
      );
    },

    async notifyReviewQueueEscalation(context) {
      const reviewCount = Number(context.reviewCount ?? 0);
      const transactionLabel = reviewCount === 1 ? 'transaction' : 'transactions';

      return notifyEvent(
        {
          ...context,
          body: `${reviewCount} ${transactionLabel} from ${context.providerFileName} need review before totals are trusted.`,
          notificationType: 'review_queue_escalation',
          payload: {
            providerFileId: context.providerFileId,
            providerFileName: context.providerFileName,
            reviewCount,
          },
          title: 'Transactions need review',
        },
      );
    },

    async notifySyncBlocked(context) {
      return notifyEvent(
        {
          ...context,
          body: `The ingest handoff for ${context.providerFileName} failed before the statement was fully synced.`,
          notificationType: 'statement_sync_blocked',
          payload: {
            providerFileId: context.providerFileId,
            providerFileName: context.providerFileName,
            reasonCode: 'statement_ingest_failed',
          },
          title: 'Statement sync is blocked',
        },
      );
    },
  };

  async function notifyEvent(event) {
    if (!event.householdId) {
      return emptyResult();
    }

    const recipients = await repository.listHouseholdRecipients(event.householdId);
    const result = emptyResult();

    for (const recipient of recipients) {
      for (const channel of defaultChannels) {
        if (channel === 'push') {
          const sendResult = await sendPushNotification(event, recipient);
          result.attemptedCount += 1;
          result.sentCount += sendResult.sent ? 1 : 0;
          result.failedCount += sendResult.sent ? 0 : 1;
        }
      }
    }

    return result;
  }

  async function sendPushNotification(event, recipient) {
    const notification = await repository.createNotification({
      body: event.body,
      channel: 'push',
      householdId: event.householdId,
      notificationType: event.notificationType,
      payload: {
        ...event.payload,
        delivery: {
          attemptCount: 0,
          finalizationRequired: false,
          provider: 'fcm',
          status: 'queued',
          topic: buildPushTopicForUser(recipient.userId, pushTopicPrefix),
        },
      },
      recipientUserId: recipient.userId,
      relatedStatementUploadId: event.relatedStatementUploadId ?? null,
      title: event.title,
    });
    const failedAt = now();

    if (!pushProvider) {
      await persistNotificationPatch(notification.id, {
        payload: {
          ...notification.payload,
          delivery: {
            ...notification.payload.delivery,
            attemptCount: 0,
            lastAttemptAt: failedAt,
            lastError: 'Phase 1 push delivery is not configured.',
            status: 'failed',
          },
        },
        status: 'failed',
      });

      return { sent: false };
    }

    for (let attempt = 1; attempt <= maxDeliveryAttempts; attempt += 1) {
      const attemptedAt = now();

      try {
        await persistNotificationPatch(notification.id, {
          payload: {
            ...notification.payload,
            delivery: {
              ...notification.payload.delivery,
              attemptCount: attempt,
              finalizationRequired: true,
              lastAttemptAt: attemptedAt,
              lastError: null,
              status: 'sending',
            },
          },
          status: 'queued',
        });

        const deliveryResult = await pushProvider.send(notification, recipient);

        await persistNotificationPatch(notification.id, {
          payload: {
            ...notification.payload,
            delivery: {
              ...notification.payload.delivery,
              attemptCount: attempt,
              finalizationRequired: false,
              lastAttemptAt: attemptedAt,
              lastError: null,
              providerMessageId: deliveryResult.providerMessageId ?? null,
              status: 'sent',
            },
          },
          sentAt: attemptedAt,
          status: 'sent',
        });

        return { sent: true };
      } catch (error) {
        if (attempt === maxDeliveryAttempts) {
          await persistNotificationPatch(notification.id, {
            payload: {
              ...notification.payload,
              delivery: {
              ...notification.payload.delivery,
              attemptCount: attempt,
              finalizationRequired: false,
              lastAttemptAt: attemptedAt,
              lastError: error instanceof Error ? error.message : String(error),
              status: 'failed',
              },
            },
            status: 'failed',
          });

          return { sent: false };
        }
      }
    }

    return { sent: false };
  }

  async function persistNotificationPatch(notificationId, patch) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxPersistenceAttempts; attempt += 1) {
      try {
        await repository.updateNotification(notificationId, patch);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }
}

export function createNoopPhase1AlertService() {
  return {
    async notifyParserFailure() {
      return emptyResult();
    },
    async notifyReviewQueueEscalation() {
      return emptyResult();
    },
    async notifySyncBlocked() {
      return emptyResult();
    },
  };
}

export function createSupabaseNotificationRepository(supabase) {
  return {
    async createNotification(notification) {
      const { data, error } = await supabase
        .from('notifications')
        .insert(mapNotificationRecord(notification))
        .select('*')
        .single();

      if (error) {
        throw new Error(`notification insert failed: ${error.message}`);
      }

      return mapStoredNotification(data);
    },

    async listHouseholdRecipients(householdId) {
      const { data, error } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', householdId);

      if (error) {
        throw new Error(`recipient lookup failed: ${error.message}`);
      }

      return (data ?? []).map((recipient) => ({
        userId: recipient.user_id,
      }));
    },

    async updateNotification(notificationId, patch) {
      const { error } = await supabase
        .from('notifications')
        .update(mapNotificationPatch(patch))
        .eq('id', notificationId);

      if (error) {
        throw new Error(`notification update failed: ${error.message}`);
      }
    },
  };
}

export function createFcmPushProvider(dependencies) {
  const {
    fetch: fetchImplementation,
    getAccessToken,
    projectId,
    timeoutMs = 5_000,
  } = dependencies;

  return {
    async send(notification) {
      const accessToken = await getAccessToken();
      const response = await fetchImplementation(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          body: JSON.stringify({
            message: {
              android: {
                notification: {
                  channel_id: 'phase1-alerts',
                },
                priority: 'HIGH',
              },
              data: {
                householdId: notification.householdId,
                notificationId: notification.id,
                notificationType: notification.notificationType,
              },
              notification: {
                body: notification.body,
                title: notification.title,
              },
              topic: notification.payload.delivery.topic,
            },
          }),
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          method: 'POST',
          signal: AbortSignal.timeout(timeoutMs),
        },
      );

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`FCM returned ${response.status}: ${responseText}`);
      }

      const responseBody = await response.json();

      return {
        providerMessageId: responseBody.name ?? null,
      };
    },
  };
}

export function createGoogleServiceAccountAccessTokenProvider(dependencies) {
  const {
    fetch: fetchImplementation,
    now = () => new Date().toISOString(),
    serviceAccount,
    timeoutMs = 5_000,
  } = dependencies;
  let cachedAccessToken = null;
  let cachedExpiresAt = 0;

  return async function getAccessToken() {
    const currentUnixTime = Math.floor(new Date(now()).getTime() / 1000);

    if (cachedAccessToken && currentUnixTime < cachedExpiresAt - 60) {
      return cachedAccessToken;
    }

    const assertion = await createServiceAccountJwt(serviceAccount, currentUnixTime);
    const response = await fetchImplementation(
      serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token',
      {
        body: new URLSearchParams({
          assertion,
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        }),
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
      },
    );

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Google OAuth returned ${response.status}: ${responseText}`);
    }

    const responseBody = await response.json();

    if (typeof responseBody.access_token !== 'string' || responseBody.access_token.length === 0) {
      throw new Error('Google OAuth did not return an access token');
    }

    cachedAccessToken = responseBody.access_token;
    cachedExpiresAt = currentUnixTime + Number(responseBody.expires_in ?? 3600);

    return cachedAccessToken;
  };
}

async function createServiceAccountJwt(serviceAccount, issuedAt) {
  if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
    throw new Error('FCM service account JSON must include client_email and private_key');
  }

  const encodedHeader = base64UrlEncode(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT',
  }));
  const encodedPayload = base64UrlEncode(JSON.stringify({
    aud: serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token',
    exp: issuedAt + 3600,
    iat: issuedAt,
    iss: serviceAccount.client_email,
    scope: FIREBASE_MESSAGING_SCOPE,
  }));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = await signWithPrivateKey(unsignedToken, serviceAccount.private_key);

  return `${unsignedToken}.${signature}`;
}

function emptyResult() {
  return {
    attemptedCount: 0,
    failedCount: 0,
    sentCount: 0,
  };
}

function mapNotificationRecord(notification) {
  return {
    body: notification.body,
    channel: notification.channel,
    household_id: notification.householdId,
    notification_type: notification.notificationType,
    payload: notification.payload,
    recipient_user_id: notification.recipientUserId,
    related_statement_upload_id: notification.relatedStatementUploadId,
    title: notification.title,
  };
}

function mapNotificationPatch(patch) {
  return {
    payload: patch.payload,
    sent_at: patch.sentAt ?? undefined,
    status: patch.status,
  };
}

function mapStoredNotification(notification) {
  return {
    body: notification.body,
    channel: notification.channel,
    householdId: notification.household_id,
    id: notification.id,
    notificationType: notification.notification_type,
    payload: notification.payload ?? {},
    recipientUserId: notification.recipient_user_id,
    relatedStatementUploadId: notification.related_statement_upload_id,
    status: notification.status,
    title: notification.title,
  };
}

async function signWithPrivateKey(content, privateKeyPem) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    decodePem(privateKeyPem),
    {
      hash: 'SHA-256',
      name: 'RSASSA-PKCS1-v1_5',
    },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(content),
  );

  return base64UrlEncode(signature);
}

function decodePem(pem) {
  const cleanedPem = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(cleanedPem);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function base64UrlEncode(value) {
  const bytes = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : value instanceof Uint8Array
      ? value
      : new TextEncoder().encode(value);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
