import {
  handleWhatsAppWebhookRequest,
} from '../../supabase/functions/_shared/whatsapp-ingestion.ts';
import { handleWhatsAppParseRequest } from '../../supabase/functions/_shared/whatsapp-parser.ts';
import { handleWhatsAppIngestRequest } from '../../supabase/functions/_shared/whatsapp-review.ts';
import { handleWhatsAppReplyRequest } from '../../supabase/functions/_shared/whatsapp-reply.ts';

const APP_SECRET = 'meta-app-secret';
const INTERNAL_AUTH_TOKEN = 'internal-secret';

export function createPhase2WhatsAppHarness(options = {}) {
  const nowIso = options.now ?? '2026-03-27T10:00:00.000Z';
  const householdId = options.householdId ?? '11111111-1111-4111-8111-111111111111';
  const ownerUserId = options.ownerUserId ?? '22222222-2222-4222-8222-222222222222';
  const ownerMemberId = options.ownerMemberId ?? '33333333-3333-4333-8333-333333333333';
  const spouseUserId = options.spouseUserId ?? '44444444-4444-4444-8444-444444444444';
  const spouseMemberId = options.spouseMemberId ?? '55555555-5555-4555-8555-555555555555';
  const ownerPhoneE164 = options.ownerPhoneE164 ?? '+919999888877';
  const acknowledgementsEnabled = options.acknowledgementsEnabled ?? false;
  let idCounter = 0;

  const state = {
    categories: [
      { color_token: 'green', household_id: null, id: 'category-groceries', is_system: true, name: 'Groceries', sort_order: 10 },
      { color_token: 'orange', household_id: null, id: 'category-transport', is_system: true, name: 'Transport', sort_order: 20 },
      { color_token: 'slate', household_id: null, id: 'category-uncategorized', is_system: true, name: 'Uncategorized', sort_order: 99 },
    ],
    classificationEvents: [],
    householdMembers: [
      { display_name: 'Ishan', household_id: householdId, id: ownerMemberId, user_id: ownerUserId },
      { display_name: 'Neha', household_id: householdId, id: spouseMemberId, user_id: spouseUserId },
    ],
    messages: [],
    notificationPreferences: [],
    notifications: [],
    participants: [],
    replyResults: [],
    sentReplies: [],
    transactions: [],
  };

  const parseQueue = [];
  const ingestQueue = [];
  const backgroundTasks = [];

  const client = {
    from(table) {
      return {
        select() {
          return createSelectBuilder(() => getRowsForTable(table, state), table);
        },
      };
    },
    async rpc(name, args = {}) {
      switch (name) {
        case 'approve_whatsapp_participant':
          return { data: approveParticipant(args, state, nowIso, () => nextId('participant')), error: null };
        case 'revoke_whatsapp_participant':
          return { data: revokeParticipant(args, state, nowIso), error: null };
        case 'get_household_dashboard_summary':
          return { data: buildDashboardSummary(args.target_household_id, state), error: null };
        case 'get_household_settings_summary':
          return { data: buildSettingsSummary(args.target_household_id, state), error: null };
        case 'reassign_transaction_category':
          return { data: reassignTransactionCategory(args, state), error: null };
        default:
          throw new Error(`Unexpected RPC: ${name}`);
      }
    },
  };

  const webhookRepository = {
    async findApprovedParticipantByPhone(phoneE164) {
      const participant = state.participants.find((entry) =>
        entry.household_id === householdId
        && entry.phone_e164 === phoneE164
        && entry.revoked_at === null
      );

      if (!participant) {
        return null;
      }

      return {
        householdId: participant.household_id,
        id: participant.id,
        memberId: participant.member_id,
        phoneE164: participant.phone_e164,
      };
    },

    async saveInboundMessage(record) {
      const existingMessage = state.messages.find((entry) =>
        entry.household_id === record.householdId
        && entry.provider_message_id === record.providerMessageId
      );

      if (existingMessage) {
        return {
          householdId: existingMessage.household_id,
          id: existingMessage.id,
          participantId: existingMessage.participant_id,
          providerMessageId: existingMessage.provider_message_id,
          status: 'duplicate',
        };
      }

      const messageId = nextId('message');
      const receivedAt = record.parseMetadata.receivedAt ?? nowIso;

      state.messages.push({
        created_at: nowIso,
        household_id: record.householdId,
        id: messageId,
        message_type: record.messageType,
        normalized_message_text: record.normalizedMessageText,
        parse_metadata: { ...record.parseMetadata },
        parse_status: 'pending',
        participant_id: record.participantId,
        provider_message_id: record.providerMessageId,
        provider_sent_at: record.providerSentAt,
        raw_message_text: record.rawMessageText,
        raw_payload: record.rawPayload,
        received_at: receivedAt,
        transaction_id: null,
        updated_at: nowIso,
      });

      return {
        householdId: record.householdId,
        id: messageId,
        participantId: record.participantId,
        providerMessageId: record.providerMessageId,
        status: 'inserted',
      };
    },

    async markMessageHandoff(input) {
      const message = requireMessage(state, input.householdId, input.messageId);
      message.parse_metadata = {
        ...message.parse_metadata,
        ...input.parseMetadata,
      };
      message.parse_status = input.parseStatus;
      message.updated_at = nowIso;
    },
  };

  const parseRepository = {
    async listHouseholdMembers(inputHouseholdId) {
      return state.householdMembers
        .filter((member) => member.household_id === inputHouseholdId)
        .map((member) => ({
          displayName: member.display_name,
          id: member.id,
        }));
    },

    async loadMessageForParsing(input) {
      const message = state.messages.find((entry) =>
        entry.household_id === input.householdId
        && entry.id === input.messageId
        && entry.participant_id === input.participantId
      );
      const participant = state.participants.find((entry) =>
        entry.household_id === input.householdId
        && entry.id === input.participantId
      );

      if (!message || !participant) {
        return null;
      }

      return {
        householdId: message.household_id,
        id: message.id,
        normalizedMessageText: message.normalized_message_text,
        parseMetadata: { ...message.parse_metadata },
        participant: {
          displayName: participant.display_name,
          id: participant.id,
          memberId: participant.member_id,
          phoneE164: participant.phone_e164,
        },
        providerMessageId: message.provider_message_id,
        providerSentAt: message.provider_sent_at,
      };
    },
  };

  const ingestRepository = {
    async classifyParsedTransaction(input) {
      const merchant = (input.merchantNormalized ?? input.merchantRaw ?? '').toLowerCase();

      if (/(zepto|blinkit|instamart|bigbasket)/.test(merchant)) {
        return {
          categoryId: 'category-groceries',
          confidence: 0.91,
          method: 'rules',
          rationale: 'merchant_keyword_match',
        };
      }

      if (/(uber|ola|rapido|taxi|metro)/.test(merchant)) {
        return {
          categoryId: 'category-transport',
          confidence: 0.88,
          method: 'rules',
          rationale: 'merchant_keyword_match',
        };
      }

      return {
        categoryId: 'category-uncategorized',
        confidence: 0.5,
        method: 'rules',
        rationale: 'uncategorized_default',
      };
    },

    async createClassificationEvent(event) {
      state.classificationEvents.push({ ...event });
    },

    async createNotification(notification) {
      state.notifications.push({
        ...notification,
        id: nextId('notification'),
      });
    },

    async createTransaction(transaction) {
      const existingTransaction = state.transactions.find((entry) =>
        entry.household_id === transaction.householdId
        && entry.fingerprint === transaction.fingerprint
      );

      if (existingTransaction) {
        return { id: existingTransaction.id };
      }

      const transactionId = nextId('transaction');

      state.transactions.push({
        amount: transaction.amount,
        category_id: transaction.categoryId,
        confidence: transaction.confidence,
        created_at: nowIso,
        description: transaction.description ?? null,
        fingerprint: transaction.fingerprint,
        household_id: transaction.householdId,
        id: transactionId,
        merchant_raw: transaction.merchantRaw,
        metadata: { ...transaction.metadata },
        needs_review: transaction.needsReview,
        owner_member_id: transaction.ownerMemberId,
        owner_scope: transaction.ownerScope,
        posted_at: transaction.postedAt,
        review_reason: transaction.reviewReason,
        source_reference: transaction.sourceReference,
        source_type: transaction.sourceType,
        status: transaction.status,
        transaction_date: transaction.transactionDate,
      });

      return { id: transactionId };
    },

    async getExistingMessageOutcome(input) {
      const message = state.messages.find((entry) =>
        entry.household_id === input.householdId
        && entry.id === input.messageId
      );

      if (!message) {
        return null;
      }

      if (
        message.parse_status !== 'failed'
        && message.parse_status !== 'needs_review'
        && message.parse_status !== 'posted'
      ) {
        return null;
      }

      return {
        parseStatus: message.parse_status,
        transactionId: message.transaction_id,
      };
    },

    async listHouseholdRecipients(inputHouseholdId) {
      return state.householdMembers
        .filter((member) => member.household_id === inputHouseholdId)
        .map((member) => ({ userId: member.user_id }));
    },

    async updateMessageOutcome(update) {
      const message = requireMessage(state, update.householdId, update.messageId);
      message.parse_metadata = { ...update.parseMetadata };
      message.parse_status = update.parseStatus;
      message.transaction_id = update.transactionId;
      message.updated_at = nowIso;
    },
  };

  const replyClient = {
    async sendMessage(input) {
      state.sentReplies.push({ ...input });
      return {
        messageId: nextId('reply'),
      };
    },
  };

  return {
    acknowledgementsEnabled,
    client,
    householdId,
    ownerMemberId,
    ownerPhoneE164,
    ownerUserId,
    spouseMemberId,
    spouseUserId,
    state,

    async captureInboundMessage(input = {}) {
      const parseResults = [];
      const ingestResults = [];
      const replyResults = [];

      const request = await createSignedWebhookRequest(buildInboundWebhookPayload({
        body: input.text ?? 'Paid 120 to Zepto for milk',
        contactName: input.contactName ?? 'Ishan',
        fromPhone: input.fromPhone ?? ownerPhoneE164,
        phoneNumberId: input.phoneNumberId ?? 'phone-number-id',
        providerMessageId: input.providerMessageId ?? nextId('wamid'),
        providerSentAt: input.providerSentAt ?? '2026-03-27T09:30:00.000Z',
      }));

      const webhookResponse = await handleWhatsAppWebhookRequest(request, {
        appSecret: APP_SECRET,
        now: () => nowIso,
        parseDispatcher: {
          async dispatchMessage(payload) {
            parseQueue.push(payload);
          },
        },
        repository: webhookRepository,
        scheduleBackgroundTask(task) {
          backgroundTasks.push(task);
        },
      });
      const webhookBody = await webhookResponse.json();

      await drainTasks(backgroundTasks);

      while (parseQueue.length > 0) {
        const payload = parseQueue.shift();
        const response = await handleWhatsAppParseRequest(
          createInternalRequest('/whatsapp-parse', payload),
          {
            ingestDispatcher: {
              async dispatchMessage(parsedExpense) {
                ingestQueue.push(parsedExpense);
              },
            },
            internalAuthToken: INTERNAL_AUTH_TOKEN,
            repository: parseRepository,
          },
        );
        const body = await response.json();

        parseResults.push({ body, status: response.status });
      }

      while (ingestQueue.length > 0) {
        const payload = ingestQueue.shift();
        const response = await handleWhatsAppIngestRequest(
          createInternalRequest('/whatsapp-ingest', payload),
          {
            internalAuthToken: INTERNAL_AUTH_TOKEN,
            repository: ingestRepository,
            replyDispatcher: {
              async dispatchMessage(replyPayload) {
                const replyResponse = await handleWhatsAppReplyRequest(
                  createInternalRequest('/whatsapp-reply', replyPayload),
                  {
                    acknowledgementsEnabled,
                    internalAuthToken: INTERNAL_AUTH_TOKEN,
                    now: () => nowIso,
                    replyClient,
                  },
                );
                const body = await replyResponse.json();

                replyResults.push({ body, status: replyResponse.status });

                if (!replyResponse.ok || body.success === false) {
                  throw new Error(`Reply dispatch failed with ${replyResponse.status}`);
                }
              },
            },
            scheduleBackgroundTask(task) {
              backgroundTasks.push(task);
            },
          },
        );
        const body = await response.json();

        ingestResults.push({ body, status: response.status });
      }

      await drainTasks(backgroundTasks);
      state.replyResults.push(...replyResults);

      return {
        ingest: ingestResults,
        parse: parseResults,
        reply: replyResults,
        webhook: {
          body: webhookBody,
          status: webhookResponse.status,
        },
      };
    },

    findMessageByProviderMessageId(providerMessageId) {
      return state.messages.find((message) => message.provider_message_id === providerMessageId) ?? null;
    },
  };

  function nextId(prefix) {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
  }
}

function getRowsForTable(table, state) {
  switch (table) {
    case 'categories':
      return state.categories.map((row) => ({ ...row }));
    case 'household_members':
      return state.householdMembers.map((row) => ({ ...row }));
    case 'notification_preferences':
      return state.notificationPreferences.map((row) => ({ ...row }));
    case 'transactions':
      return state.transactions.map((row) => mapTransactionRow(row, state));
    case 'whatsapp_messages':
      return state.messages.map((row) => ({ ...row }));
    case 'whatsapp_participants':
      return state.participants.map((row) => ({
        ...row,
        member: row.member_id
          ? {
              display_name: state.householdMembers.find((member) => member.id === row.member_id)?.display_name ?? null,
            }
          : null,
      }));
    default:
      throw new Error(`Unexpected table: ${table}`);
  }
}

function mapTransactionRow(row, state) {
  const category = state.categories.find((entry) => entry.id === row.category_id) ?? null;
  const ownerMember = row.owner_member_id
    ? state.householdMembers.find((member) => member.id === row.owner_member_id) ?? null
    : null;

  return {
    ...row,
    categories: category ? { name: category.name } : null,
    owner_member: ownerMember ? { display_name: ownerMember.display_name } : null,
    statement_uploads: null,
  };
}

function createSelectBuilder(loadRows, table) {
  const filters = [];
  const orders = [];
  let limitCount = null;

  const builder = {
    eq(column, value) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    is(column, value) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    limit(value) {
      limitCount = value;
      return builder;
    },
    order(column, options = {}) {
      orders.push({ ascending: options.ascending !== false, column });
      return builder;
    },
    then(onFulfilled, onRejected) {
      try {
        let rows = loadRows().filter((row) => filters.every((filter) => filter(row)));

        rows = rows.sort((left, right) => compareRows(left, right, orders));

        if (typeof limitCount === 'number') {
          rows = rows.slice(0, limitCount);
        }

        return Promise.resolve(onFulfilled({ data: rows, error: null }));
      } catch (error) {
        if (typeof onRejected === 'function') {
          return Promise.resolve(onRejected(error));
        }

        return Promise.reject(error);
      }
    },
  };

  if (table === 'notification_preferences') {
    builder.is = undefined;
  }

  return builder;
}

function compareRows(left, right, orders) {
  for (const order of orders) {
    const comparison = compareValues(left[order.column], right[order.column]);

    if (comparison !== 0) {
      return order.ascending ? comparison : -comparison;
    }
  }

  return 0;
}

function compareValues(left, right) {
  const leftValue = normalizeComparableValue(left);
  const rightValue = normalizeComparableValue(right);

  if (leftValue < rightValue) {
    return -1;
  }

  if (leftValue > rightValue) {
    return 1;
  }

  return 0;
}

function normalizeComparableValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return typeof value === 'string' ? value : String(value);
}

function approveParticipant(args, state, nowIso, createId) {
  const householdId = args.target_household_id;
  const phoneE164 = normalizePhone(args.target_phone_e164);
  const displayName = normalizeOptionalString(args.target_display_name);
  const memberId = normalizeOptionalString(args.target_member_id);
  const existing = state.participants.find((entry) =>
    entry.household_id === householdId
    && entry.phone_e164 === phoneE164
  );

  if (existing) {
    existing.display_name = displayName;
    existing.member_id = memberId;
    existing.revoked_at = null;
    existing.updated_at = nowIso;

    return buildSavedParticipant(existing);
  }

  const participant = {
    approved_at: nowIso,
    created_at: nowIso,
    display_name: displayName,
    household_id: householdId,
    id: createId(),
    member_id: memberId,
    phone_e164: phoneE164,
    revoked_at: null,
    updated_at: nowIso,
  };

  state.participants.push(participant);

  return buildSavedParticipant(participant);
}

function revokeParticipant(args, state, nowIso) {
  const householdId = args.target_household_id;
  const phoneE164 = normalizePhone(args.target_phone_e164);
  const participant = state.participants.find((entry) =>
    entry.household_id === householdId
    && entry.phone_e164 === phoneE164
  );

  if (!participant) {
    throw new Error('WhatsApp participant not found');
  }

  participant.revoked_at = nowIso;
  participant.updated_at = nowIso;

  return buildSavedParticipant(participant, 'revoked');
}

function buildSavedParticipant(participant, status = 'approved') {
  return {
    displayName: participant.display_name,
    memberId: participant.member_id,
    participantId: participant.id,
    phoneE164: participant.phone_e164,
    status,
  };
}

function reassignTransactionCategory(args, state) {
  const transaction = state.transactions.find((entry) => entry.id === args.target_transaction_id);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  transaction.category_id = args.next_category_id;
  transaction.needs_review = false;
  transaction.review_reason = null;
  transaction.status = 'processed';

  return {
    transactionId: transaction.id,
  };
}

function buildDashboardSummary(householdId, state) {
  const transactions = state.transactions.filter((entry) => entry.household_id === householdId);

  return {
    householdId,
    syncStatus: {
      failedStatementCount: 0,
      lastStatementSyncAt: null,
      lastStatementUploadAt: null,
      lastSuccessfulSyncAt: null,
      latestParseStatus: null,
      needsReviewStatementCount: 0,
      pendingStatementCount: 0,
    },
    totals: {
      clearedSpend: sumAmounts(transactions.filter((entry) => !entry.needs_review)),
      monthStart: '2026-03-01',
      reviewCount: transactions.filter((entry) => entry.needs_review).length,
      totalSpend: sumAmounts(transactions),
      transactionCount: transactions.length,
    },
  };
}

function buildSettingsSummary(householdId, state) {
  const transactions = state.transactions.filter((entry) => entry.household_id === householdId);
  const categories = state.categories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    reviewCount: transactions.filter((entry) => entry.category_id === category.id && entry.needs_review).length,
    totalSpend: sumAmounts(transactions.filter((entry) => entry.category_id === category.id)),
    transactionCount: transactions.filter((entry) => entry.category_id === category.id).length,
  })).filter((category) => category.transactionCount > 0);

  return {
    categories,
    parserProfiles: [],
    syncStatus: {
      failedStatementCount: 0,
      lastAttemptAt: null,
      lastError: null,
      lastSuccessfulSyncAt: null,
      latestParseStatus: null,
      needsReviewStatementCount: 0,
      pendingStatementCount: 0,
    },
  };
}

function sumAmounts(rows) {
  return rows.reduce((total, row) => total + Number(row.amount ?? 0), 0);
}

function requireMessage(state, householdId, messageId) {
  const message = state.messages.find((entry) =>
    entry.household_id === householdId
    && entry.id === messageId
  );

  if (!message) {
    throw new Error(`Message ${messageId} not found`);
  }

  return message;
}

async function drainTasks(tasks) {
  while (tasks.length > 0) {
    const batch = tasks.splice(0, tasks.length);
    await Promise.allSettled(batch);
  }
}

function createInternalRequest(pathname, payload) {
  return new Request(`http://localhost/functions/v1${pathname}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${INTERNAL_AUTH_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

function buildInboundWebhookPayload(input) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'entry-1',
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [
                {
                  profile: {
                    name: input.contactName,
                  },
                  wa_id: input.fromPhone.replace(/^\+/, ''),
                },
              ],
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: input.phoneNumberId,
              },
              messages: [
                {
                  from: input.fromPhone.replace(/^\+/, ''),
                  id: input.providerMessageId,
                  text: {
                    body: input.body,
                  },
                  timestamp: String(Math.floor(Date.parse(input.providerSentAt) / 1000)),
                  type: 'text',
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function createSignedWebhookRequest(payload) {
  const body = JSON.stringify(payload);
  const signature = await signBody(body, APP_SECRET);

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

  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  const candidate = digits ? `+${digits}` : '';

  if (!/^\+[1-9][0-9]{6,14}$/.test(candidate)) {
    throw new Error('WhatsApp participant phone must be valid E.164');
  }

  return candidate;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}
