import assert from 'node:assert/strict';
import test from 'node:test';

import { loadDashboardSnapshot } from '../../apps/mobile/src/features/dashboard/dashboard-service.ts';
import { loadSettingsSnapshot, saveApprovedParticipant } from '../../apps/mobile/src/features/settings/settings-service.ts';
import { loadTransactionsSnapshot } from '../../apps/mobile/src/features/transactions/transactions-service.ts';
import { createPhase2WhatsAppHarness } from '../support/phase-2-whatsapp-harness.mjs';

test('E2E Phase 2 journey approves a WhatsApp participant and auto-posts a clear UPI capture into the ledger', async () => {
  const harness = createPhase2WhatsAppHarness({
    acknowledgementsEnabled: true,
  });

  const initialSettings = await loadSettingsSnapshot(
    harness.client,
    {
      householdId: harness.householdId,
      userId: harness.ownerUserId,
    },
    {
      asOf: '2026-03-27T10:00:00.000Z',
    },
  );

  await saveApprovedParticipant(harness.client, {
    displayName: 'Ishan personal',
    householdId: harness.householdId,
    memberId: harness.ownerMemberId,
    phoneE164: harness.ownerPhoneE164,
  });

  const capture = await harness.captureInboundMessage({
    providerMessageId: 'wamid.e2e-posted',
    text: 'Paid 120 to Zepto for milk',
  });
  const dashboard = await loadDashboardSnapshot(harness.client, harness.householdId, {
    asOf: '2026-03-27T10:00:00.000Z',
  });
  const transactions = await loadTransactionsSnapshot(harness.client, harness.householdId);
  const settings = await loadSettingsSnapshot(
    harness.client,
    {
      householdId: harness.householdId,
      userId: harness.ownerUserId,
    },
    {
      asOf: '2026-03-27T10:00:00.000Z',
    },
  );

  assert.equal(initialSettings.whatsappSource.status, 'needs_setup');
  assert.equal(capture.ingest[0]?.body.data.outcome, 'posted');
  assert.equal(capture.reply[0]?.body.data.status, 'sent');
  assert.equal(dashboard.sources.whatsapp.status, 'healthy');
  assert.equal(dashboard.recentTransactions[0]?.merchant, 'Zepto');
  assert.equal(dashboard.recentTransactions[0]?.sourceBadge, 'UPI');
  assert.equal(dashboard.totals.reviewQueueCount, 0);
  assert.equal(transactions.transactions[0]?.sourceType, 'upi_whatsapp');
  assert.equal(transactions.transactions[0]?.needsReview, false);
  assert.equal(transactions.transactions[0]?.ownerDisplayName, 'Ishan');
  assert.equal(settings.whatsappParticipants.length, 1);
  assert.equal(settings.whatsappSource.status, 'healthy');
  assert.equal(settings.whatsappSource.reviewCaptureCount, 0);
  assert.equal(harness.state.sentReplies.length, 1);
  assert.match(harness.state.sentReplies[0]?.text ?? '', /Recorded your expense/i);
});

test('E2E Phase 2 journey keeps ambiguous WhatsApp captures visible in review when acknowledgements are disabled', async () => {
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
    providerMessageId: 'wamid.e2e-review',
    text: 'Neha paid 850 to Uber yesterday',
  });
  const dashboard = await loadDashboardSnapshot(harness.client, harness.householdId, {
    asOf: '2026-03-27T10:00:00.000Z',
  });
  const transactions = await loadTransactionsSnapshot(harness.client, harness.householdId);
  const settings = await loadSettingsSnapshot(
    harness.client,
    {
      householdId: harness.householdId,
      userId: harness.ownerUserId,
    },
    {
      asOf: '2026-03-27T10:00:00.000Z',
    },
  );

  assert.equal(capture.ingest[0]?.body.data.outcome, 'needs_review');
  assert.equal(capture.reply[0]?.body.data.status, 'disabled');
  assert.equal(dashboard.sources.whatsapp.status, 'degraded');
  assert.equal(dashboard.totals.reviewQueueCount, 1);
  assert.equal(dashboard.totals.reviewQueueAmount, 850);
  assert.equal(transactions.transactions[0]?.needsReview, true);
  assert.equal(transactions.transactions[0]?.ownerDisplayName, 'Neha');
  assert.match(transactions.transactions[0]?.reviewReason ?? '', /owner_conflict/);
  assert.equal(settings.whatsappSource.status, 'degraded');
  assert.equal(settings.whatsappSource.reviewCaptureCount, 1);
  assert.match(settings.whatsappSource.healthBody, /still needs review/i);
  assert.equal(harness.state.sentReplies.length, 0);
});
