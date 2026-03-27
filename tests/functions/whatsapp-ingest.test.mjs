import assert from 'node:assert/strict';
import test from 'node:test';

import { handleWhatsAppIngestRequest } from '../../supabase/functions/_shared/whatsapp-review.ts';

const householdId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const participantId = '33333333-3333-4333-8333-333333333333';
const ownerMemberId = '44444444-4444-4444-8444-444444444444';

test('handleWhatsAppIngestRequest posts a high-confidence WhatsApp UPI transaction', async () => {
  const captured = {
    classificationEvents: [],
    notifications: [],
    transactions: [],
    updates: [],
  };
  const request = new Request('http://localhost/functions/v1/whatsapp-ingest', {
    method: 'POST',
    headers: {
      authorization: 'Bearer internal-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: 120,
      confidence: 0.94,
      currency: 'INR',
      householdId,
      merchantNormalized: 'zepto',
      merchantRaw: 'Zepto',
      messageId,
      note: 'milk',
      ownerMemberId,
      ownerScope: 'member',
      parseStatus: 'parsed',
      participantId,
      providerMessageId: 'wamid.message-1',
      reviewReasons: [],
      transactionDate: '2026-03-27',
      validationErrors: [],
    }),
  });

  const response = await handleWhatsAppIngestRequest(request, {
    internalAuthToken: 'internal-secret',
    repository: createRepositoryStub(captured, {
      classifyParsedTransaction: async () => ({
        categoryId: 'category-groceries',
        confidence: 0.91,
        method: 'rules',
        rationale: 'merchant_keyword_match',
      }),
    }),
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.outcome, 'posted');
  assert.equal(captured.transactions.length, 1);
  assert.equal(captured.transactions[0].sourceType, 'upi_whatsapp');
  assert.equal(captured.transactions[0].status, 'processed');
  assert.equal(captured.transactions[0].needsReview, false);
  assert.equal(captured.classificationEvents.length, 1);
  assert.equal(captured.classificationEvents[0].nextCategoryId, 'category-groceries');
  assert.equal(captured.notifications.length, 0);
  assert.deepEqual(captured.updates, [
    {
      householdId,
      messageId,
      parseMetadata: {
        classification: {
          categoryId: 'category-groceries',
          confidence: 0.91,
          method: 'rules',
          rationale: 'merchant_keyword_match',
        },
        outcome: 'posted',
        parseStatus: 'parsed',
        reviewReasons: [],
        transactionId: 'transaction-1',
      },
      parseStatus: 'posted',
      transactionId: 'transaction-1',
    },
  ]);
});

test('handleWhatsAppIngestRequest creates a review-required transaction for low-confidence outcomes', async () => {
  const captured = {
    classificationEvents: [],
    notifications: [],
    transactions: [],
    updates: [],
  };
  const request = new Request('http://localhost/functions/v1/whatsapp-ingest', {
    method: 'POST',
    headers: {
      authorization: 'Bearer internal-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: 850,
      confidence: 0.62,
      currency: 'INR',
      householdId,
      merchantNormalized: 'uber',
      merchantRaw: 'Uber',
      messageId,
      note: null,
      ownerMemberId: ownerMemberId,
      ownerScope: 'member',
      parseStatus: 'needs_review',
      participantId,
      providerMessageId: 'wamid.message-2',
      reviewReasons: ['low_confidence', 'owner_conflict'],
      transactionDate: '2026-03-26',
      validationErrors: [],
    }),
  });

  const response = await handleWhatsAppIngestRequest(request, {
    internalAuthToken: 'internal-secret',
    repository: createRepositoryStub(captured, {
      classifyParsedTransaction: async () => ({
        categoryId: 'category-transport',
        confidence: 0.88,
        method: 'rules',
        rationale: 'merchant_keyword_match',
      }),
      listHouseholdRecipients: async () => [
        { userId: 'user-1' },
        { userId: 'user-2' },
      ],
    }),
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.outcome, 'needs_review');
  assert.equal(captured.transactions.length, 1);
  assert.equal(captured.transactions[0].sourceType, 'upi_whatsapp');
  assert.equal(captured.transactions[0].status, 'needs_review');
  assert.equal(captured.transactions[0].needsReview, true);
  assert.match(captured.transactions[0].reviewReason, /owner_conflict/i);
  assert.equal(captured.classificationEvents.length, 1);
  assert.equal(captured.notifications.length, 2);
  assert.equal(captured.notifications[0].notificationType, 'whatsapp_review_required');
  assert.equal(captured.notifications[0].relatedTransactionId, 'transaction-1');
  assert.equal(captured.updates[0].parseStatus, 'needs_review');
});

test('handleWhatsAppIngestRequest records parse failures without creating a transaction', async () => {
  const captured = {
    classificationEvents: [],
    notifications: [],
    transactions: [],
    updates: [],
  };
  const request = new Request('http://localhost/functions/v1/whatsapp-ingest', {
    method: 'POST',
    headers: {
      authorization: 'Bearer internal-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: null,
      confidence: 0,
      currency: 'INR',
      householdId,
      merchantNormalized: null,
      merchantRaw: null,
      messageId,
      note: null,
      ownerMemberId: ownerMemberId,
      ownerScope: 'member',
      parseStatus: 'failed',
      participantId,
      providerMessageId: 'wamid.message-3',
      reviewReasons: [],
      transactionDate: '2026-03-27',
      validationErrors: ['missing_amount'],
    }),
  });

  const response = await handleWhatsAppIngestRequest(request, {
    internalAuthToken: 'internal-secret',
    repository: createRepositoryStub(captured, {
      listHouseholdRecipients: async () => [{ userId: 'user-1' }],
    }),
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.outcome, 'failed');
  assert.equal(captured.transactions.length, 0);
  assert.equal(captured.classificationEvents.length, 0);
  assert.equal(captured.notifications.length, 1);
  assert.equal(captured.notifications[0].notificationType, 'whatsapp_parse_failure');
  assert.deepEqual(captured.updates, [
    {
      householdId,
      messageId,
      parseMetadata: {
        outcome: 'failed',
        parseStatus: 'failed',
        reviewReasons: [],
        validationErrors: ['missing_amount'],
      },
      parseStatus: 'failed',
      transactionId: null,
    },
  ]);
});

test('handleWhatsAppIngestRequest reuses an already-processed message outcome', async () => {
  const request = new Request('http://localhost/functions/v1/whatsapp-ingest', {
    method: 'POST',
    headers: {
      authorization: 'Bearer internal-secret',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: 120,
      confidence: 0.94,
      currency: 'INR',
      householdId,
      merchantNormalized: 'zepto',
      merchantRaw: 'Zepto',
      messageId,
      note: 'milk',
      ownerMemberId,
      ownerScope: 'member',
      parseStatus: 'parsed',
      participantId,
      providerMessageId: 'wamid.message-1',
      reviewReasons: [],
      transactionDate: '2026-03-27',
      validationErrors: [],
    }),
  });

  const response = await handleWhatsAppIngestRequest(request, {
    internalAuthToken: 'internal-secret',
    repository: {
      async createClassificationEvent() {
        assert.fail('should not create a second classification event');
      },
      async createNotification() {
        assert.fail('should not create notifications for an existing outcome');
      },
      async createTransaction() {
        assert.fail('should not create a second transaction');
      },
      async getExistingMessageOutcome() {
        return {
          parseStatus: 'posted',
          transactionId: 'transaction-existing',
        };
      },
      async listHouseholdRecipients() {
        return [];
      },
      async updateMessageOutcome() {
        assert.fail('should not rewrite an existing terminal outcome');
      },
      async classifyParsedTransaction() {
        assert.fail('should not reclassify an existing terminal outcome');
      },
    },
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.outcome, 'posted');
  assert.equal(body.data.transactionId, 'transaction-existing');
  assert.equal(body.data.alreadyProcessed, true);
});

function createRepositoryStub(captured, overrides = {}) {
  return {
    async classifyParsedTransaction(input) {
      if (overrides.classifyParsedTransaction) {
        return overrides.classifyParsedTransaction(input);
      }

      return {
        categoryId: 'category-uncategorized',
        confidence: 0.5,
        method: 'rules',
        rationale: 'uncategorized_default',
      };
    },
    async createClassificationEvent(event) {
      captured.classificationEvents.push(event);
    },
    async createNotification(notification) {
      captured.notifications.push(notification);
    },
    async createTransaction(transaction) {
      captured.transactions.push(transaction);
      return {
        id: 'transaction-1',
      };
    },
    async listHouseholdRecipients() {
      if (overrides.listHouseholdRecipients) {
        return overrides.listHouseholdRecipients();
      }

      return [];
    },
    async getExistingMessageOutcome() {
      if (overrides.getExistingMessageOutcome) {
        return overrides.getExistingMessageOutcome();
      }

      return null;
    },
    async updateMessageOutcome(update) {
      captured.updates.push(update);
    },
  };
}
