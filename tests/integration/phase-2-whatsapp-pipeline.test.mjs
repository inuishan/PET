import assert from 'node:assert/strict';
import test from 'node:test';

import { saveApprovedParticipant } from '../../apps/mobile/src/features/settings/settings-service.ts';
import { createPhase2WhatsAppHarness } from '../support/phase-2-whatsapp-harness.mjs';

test('Phase 2 pipeline approves participants and stays duplicate-safe for posted WhatsApp captures', async () => {
  const harness = createPhase2WhatsAppHarness({
    acknowledgementsEnabled: true,
  });

  const savedParticipant = await saveApprovedParticipant(harness.client, {
    displayName: 'Ishan personal',
    householdId: harness.householdId,
    memberId: harness.ownerMemberId,
    phoneE164: harness.ownerPhoneE164,
  });
  const firstCapture = await harness.captureInboundMessage({
    providerMessageId: 'wamid.integration-posted',
    text: 'Paid 120 to Zepto for milk',
  });
  const duplicateCapture = await harness.captureInboundMessage({
    providerMessageId: 'wamid.integration-posted',
    text: 'Paid 120 to Zepto for milk',
  });

  assert.equal(savedParticipant.status, 'approved');
  assert.equal(firstCapture.webhook.status, 200);
  assert.equal(firstCapture.webhook.body.data.acceptedMessageCount, 1);
  assert.equal(firstCapture.parse[0]?.body.data.parseStatus, 'parsed');
  assert.equal(firstCapture.ingest[0]?.body.data.outcome, 'posted');
  assert.equal(firstCapture.reply[0]?.body.data.status, 'sent');
  assert.equal(duplicateCapture.webhook.status, 200);
  assert.equal(duplicateCapture.webhook.body.data.acceptedMessageCount, 0);
  assert.equal(duplicateCapture.webhook.body.data.duplicateMessageCount, 1);
  assert.equal(harness.state.transactions.length, 1);
  assert.equal(harness.state.classificationEvents.length, 1);
  assert.equal(harness.state.notifications.length, 0);

  const message = harness.findMessageByProviderMessageId('wamid.integration-posted');
  assert.equal(message?.parse_status, 'posted');
  assert.equal(message?.transaction_id, harness.state.transactions[0]?.id);
});

test('Phase 2 pipeline rejects unapproved senders before writing WhatsApp capture state', async () => {
  const harness = createPhase2WhatsAppHarness();

  const capture = await harness.captureInboundMessage({
    fromPhone: '+919888777766',
    providerMessageId: 'wamid.integration-rejected',
    text: 'Paid 500 to Uber',
  });

  assert.equal(capture.webhook.status, 403);
  assert.equal(capture.webhook.body.success, false);
  assert.equal(capture.webhook.body.error.code, 'participant_not_approved');
  assert.deepEqual(capture.parse, []);
  assert.deepEqual(capture.ingest, []);
  assert.equal(harness.state.messages.length, 0);
  assert.equal(harness.state.transactions.length, 0);
});

test('Phase 2 pipeline persists ambiguous parses as review-required work with household notifications', async () => {
  const harness = createPhase2WhatsAppHarness({
    acknowledgementsEnabled: false,
  });

  await saveApprovedParticipant(harness.client, {
    displayName: 'Ishan personal',
    householdId: harness.householdId,
    memberId: harness.ownerMemberId,
    phoneE164: harness.ownerPhoneE164,
  });

  const capture = await harness.captureInboundMessage({
    providerMessageId: 'wamid.integration-review',
    text: 'Neha paid 850 to Uber yesterday',
  });

  assert.equal(capture.webhook.status, 200);
  assert.equal(capture.parse[0]?.body.data.parseStatus, 'needs_review');
  assert.equal(capture.ingest[0]?.body.data.outcome, 'needs_review');
  assert.equal(capture.reply[0]?.body.data.status, 'disabled');
  assert.equal(harness.state.transactions.length, 1);
  assert.equal(harness.state.transactions[0]?.needs_review, true);
  assert.match(harness.state.transactions[0]?.review_reason ?? '', /owner_conflict/);
  assert.equal(harness.state.notifications.length, 2);
  assert.equal(harness.state.notifications[0]?.notificationType, 'whatsapp_review_required');

  const message = harness.findMessageByProviderMessageId('wamid.integration-review');
  assert.equal(message?.parse_status, 'needs_review');
  assert.equal(message?.transaction_id, harness.state.transactions[0]?.id);
});
