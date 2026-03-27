import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPushTopicForUser,
  createPhase1AlertService,
  parseAlertChannels,
} from '../../supabase/functions/_shared/phase-1-alerts.mjs';

const BASE_CONTEXT = {
  householdId: '11111111-1111-4111-8111-111111111111',
  providerFileId: 'drive-file-123',
  providerFileName: 'hdfc-april-2026.pdf',
};

test('parseAlertChannels falls back to push when the config contains no supported channels', () => {
  assert.deepEqual(parseAlertChannels('email, typo'), ['push']);
});

test('createPhase1AlertService persists and sends review-queue alerts to each household member', async () => {
  const createdNotifications = [];
  const updatedNotifications = [];
  const pushCalls = [];
  const alertService = createPhase1AlertService({
    defaultChannels: ['push'],
    now: () => '2026-03-27T09:00:00.000Z',
    pushProvider: {
      async send(notification, recipient) {
        pushCalls.push({
          notification,
          recipient,
        });

        return {
          providerMessageId: `fcm-${recipient.userId}`,
        };
      },
    },
    repository: {
      async createNotification(notification) {
        createdNotifications.push(notification);

        return {
          ...notification,
          id: `notification-${createdNotifications.length}`,
        };
      },
      async listHouseholdRecipients() {
        return [
          { userId: '22222222-2222-4222-8222-222222222222' },
          { userId: '33333333-3333-4333-8333-333333333333' },
        ];
      },
      async updateNotification(id, patch) {
        updatedNotifications.push({ id, patch });
      },
    },
  });

  const result = await alertService.notifyReviewQueueEscalation({
    ...BASE_CONTEXT,
    relatedStatementUploadId: 'upload-123',
    reviewCount: 2,
  });

  assert.equal(result.attemptedCount, 2);
  assert.equal(result.sentCount, 2);
  assert.equal(result.failedCount, 0);
  assert.equal(createdNotifications.length, 2);
  assert.equal(createdNotifications[0].channel, 'push');
  assert.equal(createdNotifications[0].notificationType, 'review_queue_escalation');
  assert.equal(createdNotifications[0].payload.reviewCount, 2);
  assert.equal(createdNotifications[0].payload.delivery.attemptCount, 0);
  assert.equal(createdNotifications[0].payload.delivery.finalizationRequired, false);
  assert.equal(createdNotifications[0].payload.delivery.topic, buildPushTopicForUser(
    '22222222-2222-4222-8222-222222222222',
  ));
  assert.equal(pushCalls.length, 2);
  assert.equal(updatedNotifications.length, 4);
  assert.equal(updatedNotifications[0].patch.status, 'queued');
  assert.equal(updatedNotifications[0].patch.payload.delivery.attemptCount, 1);
  assert.equal(updatedNotifications[0].patch.payload.delivery.finalizationRequired, true);
  assert.equal(updatedNotifications[1].patch.status, 'sent');
  assert.equal(updatedNotifications[1].patch.payload.delivery.attemptCount, 1);
  assert.equal(updatedNotifications[1].patch.payload.delivery.finalizationRequired, false);
});

test('createPhase1AlertService retries push delivery and records a failed notification state', async () => {
  const updatedNotifications = [];
  let attemptCount = 0;
  const alertService = createPhase1AlertService({
    defaultChannels: ['push'],
    maxDeliveryAttempts: 3,
    now: () => '2026-03-27T09:05:00.000Z',
    pushProvider: {
      async send() {
        attemptCount += 1;
        throw new Error(`FCM failed on attempt ${attemptCount}`);
      },
    },
    repository: {
      async createNotification(notification) {
        return {
          ...notification,
          id: 'notification-1',
        };
      },
      async listHouseholdRecipients() {
        return [{ userId: '22222222-2222-4222-8222-222222222222' }];
      },
      async updateNotification(id, patch) {
        updatedNotifications.push({ id, patch });
      },
    },
  });

  const result = await alertService.notifyParserFailure({
    ...BASE_CONTEXT,
    parserProfileName: 'hdfc-regalia-gold',
  });

  assert.equal(result.attemptedCount, 1);
  assert.equal(result.sentCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(attemptCount, 3);
  assert.equal(updatedNotifications.length, 4);
  assert.equal(updatedNotifications[2].patch.status, 'queued');
  assert.equal(updatedNotifications[2].patch.payload.delivery.attemptCount, 3);
  assert.equal(updatedNotifications[2].patch.payload.delivery.finalizationRequired, true);
  assert.equal(updatedNotifications[3].patch.status, 'failed');
  assert.equal(updatedNotifications[3].patch.payload.delivery.attemptCount, 3);
  assert.equal(updatedNotifications[3].patch.payload.delivery.finalizationRequired, false);
  assert.match(updatedNotifications[3].patch.payload.delivery.lastError, /attempt 3/i);
});

test('createPhase1AlertService records a failed notification when push is enabled but not configured', async () => {
  const updatedNotifications = [];
  const alertService = createPhase1AlertService({
    defaultChannels: ['push'],
    now: () => '2026-03-27T09:10:00.000Z',
    repository: {
      async createNotification(notification) {
        return {
          ...notification,
          id: 'notification-1',
        };
      },
      async listHouseholdRecipients() {
        return [{ userId: '22222222-2222-4222-8222-222222222222' }];
      },
      async updateNotification(id, patch) {
        updatedNotifications.push({ id, patch });
      },
    },
  });

  const result = await alertService.notifySyncBlocked({
    ...BASE_CONTEXT,
  });

  assert.equal(result.attemptedCount, 1);
  assert.equal(result.sentCount, 0);
  assert.equal(result.failedCount, 1);
  assert.equal(updatedNotifications[0].patch.status, 'failed');
  assert.equal(updatedNotifications[0].patch.payload.delivery.finalizationRequired, false);
  assert.match(updatedNotifications[0].patch.payload.delivery.lastError, /not configured/i);
});
