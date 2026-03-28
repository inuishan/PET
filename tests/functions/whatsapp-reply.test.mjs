import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMetaWhatsAppReplyClient,
  handleWhatsAppReplyRequest,
} from '../../supabase/functions/_shared/whatsapp-reply.ts';

test('handleWhatsAppReplyRequest stays disabled safely when acknowledgements are not enabled', async () => {
  const response = await handleWhatsAppReplyRequest(createReplyRequest(), {
    acknowledgementsEnabled: false,
    internalAuthToken: 'internal-secret',
    replyClient: {
      async sendMessage() {
        assert.fail('disabled acknowledgements should not send a reply');
      },
    },
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'disabled');
});

test('handleWhatsAppReplyRequest skips replies when the reply window has expired', async () => {
  const response = await handleWhatsAppReplyRequest(createReplyRequest({
    providerSentAt: '2026-03-25T09:00:00.000Z',
  }), {
    acknowledgementsEnabled: true,
    internalAuthToken: 'internal-secret',
    now: () => '2026-03-27T10:00:00.000Z',
    replyClient: {
      async sendMessage() {
        assert.fail('expired messages should not trigger a reply');
      },
    },
    replyWindowMs: 24 * 60 * 60 * 1000,
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'skipped');
  assert.equal(body.data.reason, 'reply_window_expired');
});

test('handleWhatsAppReplyRequest sends a review-needed acknowledgement inside the reply window', async () => {
  const sentMessages = [];
  const response = await handleWhatsAppReplyRequest(createReplyRequest({
    amount: 850,
    merchantRaw: 'Uber',
    outcome: 'needs_review',
  }), {
    acknowledgementsEnabled: true,
    internalAuthToken: 'internal-secret',
    now: () => '2026-03-27T10:00:00.000Z',
    replyClient: {
      async sendMessage(message) {
        sentMessages.push(message);
      },
    },
    replyWindowMs: 24 * 60 * 60 * 1000,
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'sent');
  assert.equal(body.data.messageId, null);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].contextMessageId, 'wamid.message-1');
  assert.equal(sentMessages[0].phoneNumberId, 'phone-number-id');
  assert.equal(sentMessages[0].recipientPhoneE164, '+919999888877');
  assert.match(sentMessages[0].text, /needs review/i);
  assert.match(sentMessages[0].text, /Uber/);
  assert.match(sentMessages[0].text, /INR 850/);
});

test('createMetaWhatsAppReplyClient posts a reply to the Meta messages endpoint', async () => {
  const requests = [];
  const client = createMetaWhatsAppReplyClient({
    accessToken: 'meta-access-token',
    apiBaseUrl: 'https://graph.facebook.example/v23.0',
    fetch: async (url, init) => {
      requests.push({ init, url });

      return new Response(JSON.stringify({
        messages: [{ id: 'wamid.reply-1' }],
      }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  });

  await client.sendMessage({
    contextMessageId: 'wamid.message-1',
    phoneNumberId: 'phone-number-id',
    recipientPhoneE164: '+919999888877',
    text: 'Recorded your expense for Zepto (INR 120).',
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://graph.facebook.example/v23.0/phone-number-id/messages');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.authorization, 'Bearer meta-access-token');

  const body = JSON.parse(requests[0].init.body);
  assert.deepEqual(body, {
    context: {
      message_id: 'wamid.message-1',
    },
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    text: {
      body: 'Recorded your expense for Zepto (INR 120).',
      preview_url: false,
    },
    to: '919999888877',
    type: 'text',
  });
});

function createReplyRequest(overrides = {}) {
  return new Request('http://localhost/functions/v1/whatsapp-reply', {
    method: 'POST',
    headers: {
      authorization: 'Bearer internal-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: 120,
      currency: 'INR',
      merchantRaw: 'Zepto',
      outcome: 'posted',
      phoneNumberId: 'phone-number-id',
      providerMessageId: 'wamid.message-1',
      providerSentAt: '2026-03-27T09:30:00.000Z',
      recipientPhoneE164: '+919999888877',
      ...overrides,
    }),
  });
}
