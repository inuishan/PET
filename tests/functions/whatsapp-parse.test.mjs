import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handleWhatsAppParseRequest,
  parseWhatsAppExpenseMessage,
} from '../../supabase/functions/_shared/whatsapp-parser.ts';

const householdId = '11111111-1111-4111-8111-111111111111';
const senderMemberId = '22222222-2222-4222-8222-222222222222';
const spouseMemberId = '33333333-3333-4333-8333-333333333333';
const participantId = '44444444-4444-4444-8444-444444444444';
const messageId = '55555555-5555-4555-8555-555555555555';

test('parseWhatsAppExpenseMessage attributes a clear sender-owned UPI expense', () => {
  const result = parseWhatsAppExpenseMessage({
    householdId,
    id: messageId,
    normalizedMessageText: 'Paid 120 to Zepto for milk',
    participant: {
      displayName: 'Ishan',
      id: participantId,
      memberId: senderMemberId,
      phoneE164: '+919999888877',
    },
    providerMessageId: 'wamid.message-1',
    providerSentAt: '2026-03-27T08:45:00.000Z',
    householdMembers: [
      { displayName: 'Ishan', id: senderMemberId },
      { displayName: 'Neha', id: spouseMemberId },
    ],
  });

  assert.equal(result.parseStatus, 'parsed');
  assert.equal(result.amount, 120);
  assert.equal(result.currency, 'INR');
  assert.equal(result.merchantRaw, 'Zepto');
  assert.equal(result.merchantNormalized, 'zepto');
  assert.equal(result.note, 'milk');
  assert.equal(result.ownerScope, 'member');
  assert.equal(result.ownerMemberId, senderMemberId);
  assert.deepEqual(result.reviewReasons, []);
  assert.equal(result.transactionDate, '2026-03-27');
  assert.ok(result.confidence >= 0.85);
});

test('parseWhatsAppExpenseMessage routes conflicting payer attribution to review', () => {
  const result = parseWhatsAppExpenseMessage({
    householdId,
    id: messageId,
    normalizedMessageText: 'Neha paid 850 to Uber yesterday',
    participant: {
      displayName: 'Ishan',
      id: participantId,
      memberId: senderMemberId,
      phoneE164: '+919999888877',
    },
    providerMessageId: 'wamid.message-2',
    providerSentAt: '2026-03-27T08:45:00.000Z',
    householdMembers: [
      { displayName: 'Ishan', id: senderMemberId },
      { displayName: 'Neha', id: spouseMemberId },
    ],
  });

  assert.equal(result.parseStatus, 'needs_review');
  assert.equal(result.amount, 850);
  assert.equal(result.merchantRaw, 'Uber');
  assert.equal(result.ownerScope, 'member');
  assert.equal(result.ownerMemberId, spouseMemberId);
  assert.ok(result.reviewReasons.includes('owner_conflict'));
  assert.equal(result.transactionDate, '2026-03-26');
});

test('parseWhatsAppExpenseMessage fails closed when the amount cannot be validated', () => {
  const result = parseWhatsAppExpenseMessage({
    householdId,
    id: messageId,
    normalizedMessageText: 'Paid Zepto for milk',
    participant: {
      displayName: 'Ishan',
      id: participantId,
      memberId: senderMemberId,
      phoneE164: '+919999888877',
    },
    providerMessageId: 'wamid.message-3',
    providerSentAt: '2026-03-27T08:45:00.000Z',
    householdMembers: [
      { displayName: 'Ishan', id: senderMemberId },
      { displayName: 'Neha', id: spouseMemberId },
    ],
  });

  assert.equal(result.parseStatus, 'failed');
  assert.ok(result.validationErrors.includes('missing_amount'));
  assert.equal(result.amount, null);
});

test('parseWhatsAppExpenseMessage keeps fallback amount extraction in review', () => {
  const result = parseWhatsAppExpenseMessage({
    householdId,
    id: messageId,
    normalizedMessageText: 'Paid on 26/03/2026 to Uber 850',
    participant: {
      displayName: 'Ishan',
      id: participantId,
      memberId: senderMemberId,
      phoneE164: '+919999888877',
    },
    providerMessageId: 'wamid.message-4',
    providerSentAt: '2026-03-27T08:45:00.000Z',
    householdMembers: [
      { displayName: 'Ishan', id: senderMemberId },
      { displayName: 'Neha', id: spouseMemberId },
    ],
  });

  assert.equal(result.amount, 850);
  assert.equal(result.parseStatus, 'needs_review');
  assert.ok(result.reviewReasons.includes('amount_ambiguous'));
});

test('handleWhatsAppParseRequest loads the message and dispatches the normalized parse outcome', async () => {
  const dispatches = [];
  const request = new Request('http://localhost/functions/v1/whatsapp-parse', {
    method: 'POST',
    headers: {
      authorization: 'Bearer internal-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      householdId,
      messageId,
      participantId,
      providerMessageId: 'wamid.message-1',
    }),
  });

  const response = await handleWhatsAppParseRequest(request, {
    ingestDispatcher: {
      async dispatchMessage(input) {
        dispatches.push(input);
      },
    },
    internalAuthToken: 'internal-secret',
    repository: {
      async loadMessageForParsing(input) {
        assert.deepEqual(input, {
          householdId,
          messageId,
          participantId,
        });

        return {
          householdId,
          id: messageId,
          normalizedMessageText: 'Paid 120 to Zepto for milk',
          parseMetadata: {
            handoffStatus: 'dispatched',
          },
          participant: {
            displayName: 'Ishan',
            id: participantId,
            memberId: senderMemberId,
            phoneE164: '+919999888877',
          },
          providerMessageId: 'wamid.message-1',
          providerSentAt: '2026-03-27T08:45:00.000Z',
        };
      },
      async listHouseholdMembers(inputHouseholdId) {
        assert.equal(inputHouseholdId, householdId);

        return [
          { displayName: 'Ishan', id: senderMemberId },
          { displayName: 'Neha', id: spouseMemberId },
        ];
      },
    },
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.parseStatus, 'parsed');
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].merchantRaw, 'Zepto');
  assert.equal(dispatches[0].ownerMemberId, senderMemberId);
  assert.equal(dispatches[0].messageId, messageId);
  assert.equal(dispatches[0].participantPhoneE164, '+919999888877');
  assert.equal(dispatches[0].providerSentAt, '2026-03-27T08:45:00.000Z');
});
