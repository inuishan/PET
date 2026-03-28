import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHttpWhatsAppParseDispatcher,
  createSupabaseWhatsAppRepository,
  handleWhatsAppWebhookRequest,
} from '../../supabase/functions/_shared/whatsapp-ingestion.ts';

const approvedParticipant = {
  householdId: '11111111-1111-4111-8111-111111111111',
  id: '22222222-2222-4222-8222-222222222222',
  memberId: '33333333-3333-4333-8333-333333333333',
  phoneE164: '+919999888877',
};

test('handleWhatsAppWebhookRequest completes the Meta verification challenge', async () => {
  const request = new Request(
    'http://localhost/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-123',
    {
      method: 'GET',
    },
  );

  const response = await handleWhatsAppWebhookRequest(request, {
    verifyToken: 'verify-token',
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'challenge-123');
});

test('handleWhatsAppWebhookRequest rejects an invalid verification token', async () => {
  const request = new Request(
    'http://localhost/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-123',
    {
      method: 'GET',
    },
  );

  const response = await handleWhatsAppWebhookRequest(request, {
    verifyToken: 'verify-token',
  });

  assert.equal(response.status, 403);
});

test('handleWhatsAppWebhookRequest rejects POST requests with an invalid Meta signature', async () => {
  const payload = buildInboundWebhookPayload();
  const request = new Request('http://localhost/functions/v1/whatsapp-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': 'sha256=not-valid',
    },
    body: JSON.stringify(payload),
  });

  const response = await handleWhatsAppWebhookRequest(request, {
    appSecret: 'meta-app-secret',
    repository: createRepositoryStub(),
  });

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'unauthorized');
});

test('handleWhatsAppWebhookRequest rejects unsupported inbound message shapes safely', async () => {
  const payload = buildInboundWebhookPayload({
    value: {
      messages: [
        {
          from: '919999888877',
          id: 'wamid.unsupported',
          timestamp: '1710000000',
          type: 'image',
          image: {
            mime_type: 'image/jpeg',
          },
        },
      ],
    },
  });
  const request = await createSignedWebhookRequest(payload);

  const response = await handleWhatsAppWebhookRequest(request, {
    appSecret: 'meta-app-secret',
    repository: createRepositoryStub(),
  });

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'invalid_whatsapp_webhook');
});

test('handleWhatsAppWebhookRequest ignores non-message webhook events without writing data', async () => {
  const repository = createRepositoryStub();
  const request = await createSignedWebhookRequest({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-number-id',
              },
              statuses: [
                {
                  id: 'wamid.status-1',
                  status: 'delivered',
                  timestamp: '1710000000',
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const response = await handleWhatsAppWebhookRequest(request, {
    appSecret: 'meta-app-secret',
    repository,
  });

  const body = await response.json();

  assert.equal(response.status, 202);
  assert.equal(body.success, true);
  assert.equal(body.data.receivedMessageCount, 0);
  assert.equal(body.data.ignoredEventCount, 1);
  assert.equal(repository.calls.length, 0);
});

test('handleWhatsAppWebhookRequest persists approved inbound messages and dispatches parse handoff once', async () => {
  const captured = {
    dispatches: [],
    handoffUpdates: [],
    repositoryCalls: [],
  };
  const request = await createSignedWebhookRequest(buildInboundWebhookPayload());

  const response = await handleWhatsAppWebhookRequest(request, {
    appSecret: 'meta-app-secret',
    now: () => '2026-03-27T00:00:00.000Z',
    repository: createRepositoryStub({
      calls: captured.repositoryCalls,
      findApprovedParticipantByPhone: async (phoneE164) => {
        captured.repositoryCalls.push({ type: 'lookup', phoneE164 });
        return approvedParticipant;
      },
      saveInboundMessage: async (record) => {
        captured.repositoryCalls.push({ type: 'save', record });
        return {
          id: '44444444-4444-4444-8444-444444444444',
          householdId: approvedParticipant.householdId,
          participantId: approvedParticipant.id,
          providerMessageId: record.providerMessageId,
          status: 'inserted',
        };
      },
      markMessageHandoff: async (input) => {
        captured.handoffUpdates.push(input);
      },
    }),
    parseDispatcher: {
      async dispatchMessage(input) {
        captured.dispatches.push(input);
      },
    },
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.acceptedMessageCount, 1);
  assert.equal(body.data.duplicateMessageCount, 0);
  assert.equal(captured.repositoryCalls[0].type, 'lookup');
  assert.equal(captured.repositoryCalls[0].phoneE164, approvedParticipant.phoneE164);
  assert.equal(captured.repositoryCalls[1].type, 'save');
  assert.equal(captured.repositoryCalls[1].record.providerMessageId, 'wamid.message-1');
  assert.equal(captured.repositoryCalls[1].record.householdId, approvedParticipant.householdId);
  assert.equal(captured.repositoryCalls[1].record.participantId, approvedParticipant.id);
  assert.equal(captured.repositoryCalls[1].record.normalizedMessageText, 'Paid 120 to Zepto for milk');
  assert.equal(captured.dispatches.length, 1);
  assert.equal(captured.dispatches[0].messageId, '44444444-4444-4444-8444-444444444444');
  assert.deepEqual(captured.handoffUpdates, [
    {
      householdId: approvedParticipant.householdId,
      messageId: '44444444-4444-4444-8444-444444444444',
      parseMetadata: {
        handoffDispatchedAt: '2026-03-27T00:00:00.000Z',
        handoffStatus: 'dispatched',
      },
      parseStatus: 'processing',
    },
  ]);
});

test('handleWhatsAppWebhookRequest suppresses downstream handoff for duplicate deliveries', async () => {
  const dispatches = [];
  const request = await createSignedWebhookRequest(buildInboundWebhookPayload());

  const response = await handleWhatsAppWebhookRequest(request, {
    appSecret: 'meta-app-secret',
    repository: createRepositoryStub({
      findApprovedParticipantByPhone: async () => approvedParticipant,
      saveInboundMessage: async (record) => ({
        id: '44444444-4444-4444-8444-444444444444',
        householdId: approvedParticipant.householdId,
        participantId: approvedParticipant.id,
        providerMessageId: record.providerMessageId,
        status: 'duplicate',
      }),
    }),
    parseDispatcher: {
      async dispatchMessage(input) {
        dispatches.push(input);
      },
    },
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.acceptedMessageCount, 0);
  assert.equal(body.data.duplicateMessageCount, 1);
  assert.equal(dispatches.length, 0);
});

test('handleWhatsAppWebhookRequest records handoff failures without blocking a successful webhook response', async () => {
  const handoffUpdates = [];
  const request = await createSignedWebhookRequest(buildInboundWebhookPayload());

  const response = await handleWhatsAppWebhookRequest(request, {
    appSecret: 'meta-app-secret',
    now: () => '2026-03-27T00:00:00.000Z',
    repository: createRepositoryStub({
      findApprovedParticipantByPhone: async () => approvedParticipant,
      saveInboundMessage: async () => ({
        id: '44444444-4444-4444-8444-444444444444',
        householdId: approvedParticipant.householdId,
        participantId: approvedParticipant.id,
        providerMessageId: 'wamid.message-1',
        status: 'inserted',
      }),
      markMessageHandoff: async (input) => {
        handoffUpdates.push(input);
      },
    }),
    parseDispatcher: {
      async dispatchMessage() {
        throw new Error('parse function unavailable');
      },
    },
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.acceptedMessageCount, 1);
  assert.deepEqual(handoffUpdates, [
    {
      householdId: approvedParticipant.householdId,
      messageId: '44444444-4444-4444-8444-444444444444',
      parseMetadata: {
        handoffError: 'parse_dispatch_failed',
        handoffFailedAt: '2026-03-27T00:00:00.000Z',
        handoffStatus: 'failed',
      },
      parseStatus: 'failed',
    },
  ]);
});

test('handleWhatsAppWebhookRequest surfaces repository failures without leaking internals', async () => {
  const request = await createSignedWebhookRequest(buildInboundWebhookPayload());

  const response = await handleWhatsAppWebhookRequest(request, {
    appSecret: 'meta-app-secret',
    repository: createRepositoryStub({
      findApprovedParticipantByPhone: async () => approvedParticipant,
      saveInboundMessage: async () => {
        throw new Error('database timeout while writing whatsapp_messages');
      },
    }),
  });

  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'whatsapp_ingest_failed');
  assert.match(body.error.message, /persist/i);
});

test('handleWhatsAppWebhookRequest rejects unapproved senders before persistence', async () => {
  const repository = createRepositoryStub({
    findApprovedParticipantByPhone: async (phoneE164) => {
      repository.calls.push({ type: 'lookup', phoneE164 });
      return null;
    },
  });
  const request = await createSignedWebhookRequest(buildInboundWebhookPayload());

  const response = await handleWhatsAppWebhookRequest(request, {
    appSecret: 'meta-app-secret',
    repository,
  });

  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'participant_not_approved');
  assert.deepEqual(repository.calls, [
    {
      type: 'lookup',
      phoneE164: '+919999888877',
    },
  ]);
});

test('createSupabaseWhatsAppRepository looks up approved participants and inserts message records idempotently', async () => {
  const calls = [];
  const repository = createSupabaseWhatsAppRepository({
    from(table) {
      if (table === 'whatsapp_participants') {
        return createParticipantQueryStub(calls);
      }

      if (table === 'whatsapp_messages') {
        return createMessageTableStub(calls);
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  });

  const participant = await repository.findApprovedParticipantByPhone('+919999888877');
  const inserted = await repository.saveInboundMessage({
    householdId: approvedParticipant.householdId,
    participantId: approvedParticipant.id,
    providerMessageId: 'wamid.message-1',
    messageType: 'text',
    rawMessageText: 'Paid 120 to Zepto for milk',
    normalizedMessageText: 'Paid 120 to Zepto for milk',
    providerSentAt: '2024-03-09T16:00:00.000Z',
    rawPayload: {
      source: 'meta',
    },
    parseMetadata: {
      handoffStatus: 'pending',
    },
  });
  const duplicate = await repository.saveInboundMessage({
    householdId: approvedParticipant.householdId,
    participantId: approvedParticipant.id,
    providerMessageId: 'wamid.message-1',
    messageType: 'text',
    rawMessageText: 'Paid 120 to Zepto for milk',
    normalizedMessageText: 'Paid 120 to Zepto for milk',
    providerSentAt: '2024-03-09T16:00:00.000Z',
    rawPayload: {
      source: 'meta',
    },
    parseMetadata: {
      handoffStatus: 'pending',
    },
  });
  await repository.markMessageHandoff({
    householdId: approvedParticipant.householdId,
    messageId: '55555555-5555-4555-8555-555555555555',
    parseStatus: 'processing',
    parseMetadata: {
      handoffStatus: 'dispatched',
    },
  });

  assert.deepEqual(participant, approvedParticipant);
  assert.deepEqual(inserted, {
    id: '55555555-5555-4555-8555-555555555555',
    householdId: approvedParticipant.householdId,
    participantId: approvedParticipant.id,
    providerMessageId: 'wamid.message-1',
    status: 'inserted',
  });
  assert.deepEqual(duplicate, {
    id: '55555555-5555-4555-8555-555555555555',
    householdId: approvedParticipant.householdId,
    participantId: approvedParticipant.id,
    providerMessageId: 'wamid.message-1',
    status: 'duplicate',
  });
  assert.equal(calls[0].table, 'whatsapp_participants');
  assert.equal(calls.filter((call) => call.table === 'whatsapp_messages' && call.type === 'insert').length, 2);
  assert.equal(calls.filter((call) => call.table === 'whatsapp_messages' && call.type === 'select').length, 2);
  assert.equal(calls.filter((call) => call.table === 'whatsapp_messages' && call.type === 'update').length, 1);
});

test('createHttpWhatsAppParseDispatcher uses the dedicated internal auth token for parse handoff', async () => {
  const requests = [];
  const dispatcher = createHttpWhatsAppParseDispatcher({
    authToken: 'internal-secret',
    fetch: async (url, init) => {
      requests.push({ init, url });
      return new Response(null, { status: 200 });
    },
    url: 'https://project-ref.supabase.co/functions/v1/whatsapp-parse',
  });

  await dispatcher.dispatchMessage({
    householdId: approvedParticipant.householdId,
    messageId: '44444444-4444-4444-8444-444444444444',
    participantId: approvedParticipant.id,
    providerMessageId: 'wamid.message-1',
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://project-ref.supabase.co/functions/v1/whatsapp-parse');
  assert.equal(requests[0].init.headers.authorization, 'Bearer internal-secret');
});

function buildInboundWebhookPayload(overrides = {}) {
  const valueOverrides = overrides.value ?? {};

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: 'phone-number-id',
              },
              contacts: [
                {
                  profile: {
                    name: 'Ishan',
                  },
                  wa_id: '919999888877',
                },
              ],
              messages: valueOverrides.messages ?? [
                {
                  from: '919999888877',
                  id: 'wamid.message-1',
                  timestamp: '1710000000',
                  type: 'text',
                  text: {
                    body: '  Paid 120 to Zepto for milk  ',
                  },
                },
              ],
              ...valueOverrides,
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

async function createSignedWebhookRequest(payload) {
  const body = JSON.stringify(payload);
  const signature = await signBody(body, 'meta-app-secret');

  return new Request('http://localhost/functions/v1/whatsapp-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    body,
  });
}

async function signBody(body, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      hash: 'SHA-256',
      name: 'HMAC',
    },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body),
  );

  return encodeHex(new Uint8Array(signature));
}

function encodeHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createRepositoryStub(overrides = {}) {
  const calls = overrides.calls ?? [];

  return {
    calls,
    async findApprovedParticipantByPhone(phoneE164) {
      if (overrides.findApprovedParticipantByPhone) {
        return overrides.findApprovedParticipantByPhone(phoneE164);
      }

      calls.push({ type: 'lookup', phoneE164 });
      return approvedParticipant;
    },
    async saveInboundMessage(record) {
      if (overrides.saveInboundMessage) {
        return overrides.saveInboundMessage(record);
      }

      calls.push({ type: 'save', record });
      return {
        id: '44444444-4444-4444-8444-444444444444',
        householdId: record.householdId,
        participantId: record.participantId,
        providerMessageId: record.providerMessageId,
        status: 'inserted',
      };
    },
    async markMessageHandoff(input) {
      if (overrides.markMessageHandoff) {
        return overrides.markMessageHandoff(input);
      }

      calls.push({ type: 'handoff', input });
    },
  };
}

function createParticipantQueryStub(calls) {
  const filters = [];

  return {
    select(columns) {
      calls.push({ table: 'whatsapp_participants', columns, type: 'select' });
      return this;
    },
    eq(column, value) {
      filters.push({ column, value });
      calls.push({ table: 'whatsapp_participants', column, type: 'eq', value });
      return this;
    },
    is(column, value) {
      filters.push({ column, value });
      calls.push({ table: 'whatsapp_participants', column, type: 'is', value });
      return this;
    },
    maybeSingle() {
      assert.deepEqual(filters, [
        { column: 'phone_e164', value: '+919999888877' },
        { column: 'revoked_at', value: null },
      ]);

      return Promise.resolve({
        data: {
          household_id: approvedParticipant.householdId,
          id: approvedParticipant.id,
          member_id: approvedParticipant.memberId,
          phone_e164: approvedParticipant.phoneE164,
        },
        error: null,
      });
    },
  };
}

function createMessageTableStub(calls) {
  return {
    insert(payload) {
      calls.push({ table: 'whatsapp_messages', payload, type: 'insert' });

      if (calls.filter((call) => call.table === 'whatsapp_messages' && call.type === 'insert').length === 1) {
        return {
          select() {
            return {
              maybeSingle() {
                return Promise.resolve({
                  data: {
                    id: '55555555-5555-4555-8555-555555555555',
                    household_id: approvedParticipant.householdId,
                    participant_id: approvedParticipant.id,
                    provider_message_id: payload.provider_message_id,
                  },
                  error: null,
                });
              },
            };
          },
        };
      }

      return {
        select() {
          return {
            maybeSingle() {
              return Promise.resolve({
                data: null,
                error: {
                  code: '23505',
                  message: 'duplicate key value violates unique constraint',
                },
              });
            },
          };
        },
      };
    },
    select(columns) {
      calls.push({ table: 'whatsapp_messages', columns, type: 'select' });
      return {
        eq(column, value) {
          calls.push({ table: 'whatsapp_messages', column, type: 'eq', value });
          return {
            eq(innerColumn, innerValue) {
              calls.push({ table: 'whatsapp_messages', column: innerColumn, type: 'eq', value: innerValue });
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: '55555555-5555-4555-8555-555555555555',
                      household_id: approvedParticipant.householdId,
                      participant_id: approvedParticipant.id,
                      provider_message_id: innerValue,
                    },
                    error: null,
                  });
                },
              };
            },
            maybeSingle() {
              return Promise.resolve({
                data: {
                  id: '55555555-5555-4555-8555-555555555555',
                  household_id: approvedParticipant.householdId,
                  participant_id: approvedParticipant.id,
                  provider_message_id: value,
                },
                error: null,
              });
            },
          };
        },
      };
    },
    update(payload) {
      calls.push({ table: 'whatsapp_messages', payload, type: 'update' });
      return {
        eq(column, value) {
          calls.push({ table: 'whatsapp_messages', column, type: 'eq', value });
          return {
            eq(innerColumn, innerValue) {
              calls.push({ table: 'whatsapp_messages', column: innerColumn, type: 'eq', value: innerValue });
              return {
                maybeSingle() {
                  return Promise.resolve({
                    data: {
                      id: value,
                    },
                    error: null,
                  });
                },
              };
            },
          };
        },
      };
    },
  };
}
