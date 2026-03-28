#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { loadDashboardSnapshot } from '../../apps/mobile/src/features/dashboard/dashboard-service.ts';
import {
  loadSettingsSnapshot,
  saveApprovedParticipant,
} from '../../apps/mobile/src/features/settings/settings-service.ts';
import { loadTransactionsSnapshot } from '../../apps/mobile/src/features/transactions/transactions-service.ts';
import { createPhase2WhatsAppHarness } from '../../tests/support/phase-2-whatsapp-harness.mjs';
import {
  buildPhase2RuntimeValidationReport,
  loadEnvFile,
} from './runtime-config.mjs';

const DEFAULT_AS_OF = '2026-03-28T00:00:00.000Z';
const DEFAULT_APPROVED_PHONE = '+919999888877';
const DEFAULT_REJECTED_PHONE = '+919888777766';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArguments(process.argv.slice(2));
  const report = buildPhase2RuntimeValidationReport({
    supabaseEnv: loadEnvFile(options.supabaseEnvPath),
  });

  if (report.errors.length > 0) {
    console.error('Phase 2 validation cannot start because the runtime configuration is invalid.');

    for (const error of report.errors) {
      console.error(`- ${error}`);
    }

    process.exit(1);
  }

  const result = options.mode === 'live'
    ? await runLivePhase2Validation(report.config, options)
    : await runMockPhase2Validation(report.config, options);

  console.log(JSON.stringify(result, null, 2));
}

export async function runMockPhase2Validation(_config, options = {}) {
  const householdId = options.householdId ?? '11111111-1111-4111-8111-111111111111';
  const approvedPhoneE164 = options.approvedPhoneE164 ?? DEFAULT_APPROVED_PHONE;
  const approvedDisplayName = options.approvedDisplayName ?? 'Phase 2 validated participant';
  const rejectedPhoneE164 = options.rejectedPhoneE164 ?? DEFAULT_REJECTED_PHONE;

  const primaryHarness = createPhase2WhatsAppHarness({
    acknowledgementsEnabled: false,
    householdId,
    ownerPhoneE164: approvedPhoneE164,
  });

  const participant = await saveApprovedParticipant(primaryHarness.client, {
    displayName: approvedDisplayName,
    householdId,
    memberId: options.approvedMemberId ?? primaryHarness.ownerMemberId,
    phoneE164: approvedPhoneE164,
  });

  const happyProviderMessageId = 'wamid.mock-posted';
  const reviewProviderMessageId = 'wamid.mock-review';
  const parseFailureProviderMessageId = 'wamid.mock-failed';
  const rejectedProviderMessageId = 'wamid.mock-rejected';

  const happyCapture = await primaryHarness.captureInboundMessage({
    providerMessageId: happyProviderMessageId,
    text: 'Paid 120 to Zepto for milk',
  });
  const happySnapshots = await loadPhase2Snapshots(primaryHarness);

  const duplicateCapture = await primaryHarness.captureInboundMessage({
    providerMessageId: happyProviderMessageId,
    text: 'Paid 120 to Zepto for milk',
  });

  const rejectionCapture = await primaryHarness.captureInboundMessage({
    fromPhone: rejectedPhoneE164,
    providerMessageId: rejectedProviderMessageId,
    text: 'Paid 500 to Uber',
  });

  const reviewCapture = await primaryHarness.captureInboundMessage({
    providerMessageId: reviewProviderMessageId,
    text: 'Neha paid 850 to Uber yesterday',
  });
  const reviewSnapshots = await loadPhase2Snapshots(primaryHarness);

  const parseFailureCapture = await primaryHarness.captureInboundMessage({
    providerMessageId: parseFailureProviderMessageId,
    text: 'Paid Zepto for milk',
  });
  const parseFailureSnapshots = await loadPhase2Snapshots(primaryHarness);

  const acknowledgementHarness = createPhase2WhatsAppHarness({
    acknowledgementsEnabled: true,
    householdId,
    ownerPhoneE164: approvedPhoneE164,
  });

  await saveApprovedParticipant(acknowledgementHarness.client, {
    displayName: approvedDisplayName,
    householdId,
    memberId: options.approvedMemberId ?? acknowledgementHarness.ownerMemberId,
    phoneE164: approvedPhoneE164,
  });

  await acknowledgementHarness.captureInboundMessage({
    providerMessageId: 'wamid.mock-ack-posted',
    text: 'Paid 120 to Zepto for milk',
  });
  await acknowledgementHarness.captureInboundMessage({
    providerMessageId: 'wamid.mock-ack-review',
    text: 'Neha paid 850 to Uber yesterday',
  });
  await acknowledgementHarness.captureInboundMessage({
    providerMessageId: 'wamid.mock-ack-failed',
    text: 'Paid Zepto for milk',
  });

  return {
    setup: {
      participant,
    },
    primaryFlow: {
      duplicateDelivery: {
        acceptedMessageCount: duplicateCapture.webhook.body.data.acceptedMessageCount,
        duplicateMessageCount: duplicateCapture.webhook.body.data.duplicateMessageCount,
        webhookStatus: duplicateCapture.webhook.status,
      },
      happyPath: buildHarnessScenarioSummary(
        primaryHarness,
        happyCapture,
        happyProviderMessageId,
        happySnapshots,
      ),
      parseFailurePath: buildHarnessScenarioSummary(
        primaryHarness,
        parseFailureCapture,
        parseFailureProviderMessageId,
        parseFailureSnapshots,
      ),
      rejectionPath: {
        errorCode: rejectionCapture.webhook.body.error.code,
        messageCount: primaryHarness.state.messages.filter((message) =>
          message.provider_message_id === rejectedProviderMessageId
        ).length,
        transactionCount: primaryHarness.state.transactions.filter((transaction) =>
          transaction.source_reference === rejectedProviderMessageId
        ).length,
        webhookStatus: rejectionCapture.webhook.status,
      },
      reviewPath: buildHarnessScenarioSummary(
        primaryHarness,
        reviewCapture,
        reviewProviderMessageId,
        reviewSnapshots,
      ),
    },
    acknowledgementFlow: {
      failed: buildHarnessAcknowledgementSummary(
        acknowledgementHarness,
        'wamid.mock-ack-failed',
      ),
      posted: buildHarnessAcknowledgementSummary(
        acknowledgementHarness,
        'wamid.mock-ack-posted',
      ),
      review: buildHarnessAcknowledgementSummary(
        acknowledgementHarness,
        'wamid.mock-ack-review',
      ),
      sentReplies: [...acknowledgementHarness.state.sentReplies],
    },
  };
}

export async function runLivePhase2Validation(config, options = {}) {
  const householdId = options.householdId ?? config.supabase.validationDefaults?.householdId;
  const approvedPhoneE164 =
    options.approvedPhoneE164 ?? config.supabase.validationDefaults?.approvedPhoneE164;
  const approvedDisplayName =
    options.approvedDisplayName
    ?? config.supabase.validationDefaults?.approvedDisplayName
    ?? 'Phase 2 validated participant';
  const approvedMemberId =
    options.approvedMemberId ?? config.supabase.validationDefaults?.approvedMemberId ?? null;
  const rejectedPhoneE164 =
    options.rejectedPhoneE164
    ?? config.supabase.validationDefaults?.rejectedPhoneE164
    ?? DEFAULT_REJECTED_PHONE;

  if (!householdId || !approvedPhoneE164) {
    throw new Error(
      'Live mode requires --household-id and --approved-phone, or matching PHASE2_VALIDATION_* defaults in the env file.',
    );
  }

  if ((options.delivery ?? 'webhook-replay') !== 'webhook-replay') {
    throw new Error('Live mode currently supports only --delivery webhook-replay.');
  }

  const participant = config.supabase.validationOwnerAccessToken
    ? await seedApprovedParticipantWithOwnerRpc(config, {
        approvedDisplayName,
        approvedMemberId,
        approvedPhoneE164,
        householdId,
      })
    : await seedApprovedParticipantWithServiceRole(config, {
        approvedDisplayName,
        approvedMemberId,
        approvedPhoneE164,
        householdId,
      });

  const runId = String(Date.now());
  const happyProviderMessageId = `wamid.live-posted-${runId}`;
  const reviewProviderMessageId = `wamid.live-review-${runId}`;
  const parseFailureProviderMessageId = `wamid.live-failed-${runId}`;
  const rejectedProviderMessageId = `wamid.live-rejected-${runId}`;

  const verification = await verifyWebhookChallenge(config, `phase2-${runId}`);
  const happyPath = await runReplayScenario(config, {
    expectedParseStatus: 'posted',
    householdId,
    phoneE164: approvedPhoneE164,
    providerMessageId: happyProviderMessageId,
    text: 'Paid 120 to Zepto for milk',
  });

  const duplicateResponse = await postSignedWebhook(config, {
    fromPhone: approvedPhoneE164,
    providerMessageId: happyProviderMessageId,
    text: 'Paid 120 to Zepto for milk',
  });
  const duplicateBody = await parseJsonResponse(duplicateResponse, 'duplicate delivery');

  const rejectionResponse = await postSignedWebhook(config, {
    fromPhone: rejectedPhoneE164,
    providerMessageId: rejectedProviderMessageId,
    text: 'Paid 500 to Uber',
  });
  const rejectionBody = await parseJsonResponse(rejectionResponse, 'rejection path');

  const reviewPath = await runReplayScenario(config, {
    expectedParseStatus: 'needs_review',
    householdId,
    phoneE164: approvedPhoneE164,
    providerMessageId: reviewProviderMessageId,
    text: 'Neha paid 850 to Uber yesterday',
  });
  const parseFailurePath = await runReplayScenario(config, {
    expectedParseStatus: 'failed',
    householdId,
    phoneE164: approvedPhoneE164,
    providerMessageId: parseFailureProviderMessageId,
    text: 'Paid Zepto for milk',
  });

  return {
    setup: {
      participant,
      verification,
    },
    primaryFlow: {
      duplicateDelivery: {
        acceptedMessageCount: duplicateBody?.data?.acceptedMessageCount ?? null,
        duplicateMessageCount: duplicateBody?.data?.duplicateMessageCount ?? null,
        webhookStatus: duplicateResponse.status,
      },
      happyPath,
      parseFailurePath,
      rejectionPath: {
        errorCode: rejectionBody?.error?.code ?? null,
        webhookStatus: rejectionResponse.status,
      },
      reviewPath,
    },
    warnings: buildLiveValidationWarnings(config),
  };
}

async function loadPhase2Snapshots(harness) {
  const [dashboard, settings, transactions] = await Promise.all([
    loadDashboardSnapshot(harness.client, harness.householdId, { asOf: DEFAULT_AS_OF }),
    loadSettingsSnapshot(
      harness.client,
      {
        householdId: harness.householdId,
        userId: harness.ownerUserId,
      },
      { asOf: DEFAULT_AS_OF },
    ),
    loadTransactionsSnapshot(harness.client, harness.householdId),
  ]);

  return {
    dashboard,
    settings,
    transactions,
  };
}

function buildHarnessScenarioSummary(harness, capture, providerMessageId, snapshots) {
  const message = harness.findMessageByProviderMessageId(providerMessageId);
  const transaction = harness.state.transactions.find((entry) => entry.source_reference === providerMessageId) ?? null;
  const notificationCount = harness.state.notifications.filter((entry) =>
    entry.payload?.providerMessageId === providerMessageId
  ).length;

  return {
    acknowledgement: message?.parse_metadata?.acknowledgement ?? null,
    dashboardSourceStatus: snapshots.dashboard.sources.whatsapp.status,
    message: {
      parseStatus: message?.parse_status ?? null,
      providerMessageId,
    },
    notificationCount,
    settingsSourceStatus: snapshots.settings.whatsappSource.status,
    transaction: transaction
      ? {
          needsReview: transaction.needs_review,
          sourceType: transaction.source_type,
        }
      : null,
    webhookStatus: capture.webhook.status,
  };
}

function buildHarnessAcknowledgementSummary(harness, providerMessageId) {
  const message = harness.findMessageByProviderMessageId(providerMessageId);

  return {
    acknowledgement: message?.parse_metadata?.acknowledgement ?? null,
    parseStatus: message?.parse_status ?? null,
  };
}

async function runReplayScenario(config, input) {
  const response = await postSignedWebhook(config, {
    fromPhone: input.phoneE164,
    providerMessageId: input.providerMessageId,
    text: input.text,
  });
  const body = await parseJsonResponse(response, input.providerMessageId);
  const message = await waitForMessageOutcome(config, {
    householdId: input.householdId,
    providerMessageId: input.providerMessageId,
  });
  const transaction = await fetchTransactionBySourceReference(
    config,
    input.householdId,
    input.providerMessageId,
  );
  const notifications = await fetchNotificationsByProviderMessageId(
    config,
    input.householdId,
    input.providerMessageId,
  );

  if (message?.parse_status !== input.expectedParseStatus) {
    throw new Error(
      `Expected ${input.providerMessageId} to reach ${input.expectedParseStatus}, received ${message?.parse_status ?? 'missing'}.`,
    );
  }

  return {
    acknowledgement: readAcknowledgement(message?.parse_metadata),
    message: {
      parseStatus: message?.parse_status ?? null,
      providerMessageId: input.providerMessageId,
    },
    notificationCount: notifications.length,
    transaction: transaction
      ? {
          needsReview: Boolean(transaction.needs_review),
          sourceType: String(transaction.source_type),
        }
      : null,
    webhookAcceptedMessageCount: body?.data?.acceptedMessageCount ?? null,
    webhookStatus: response.status,
  };
}

async function verifyWebhookChallenge(config, challenge) {
  const url = new URL(config.supabase.webhookUrl);
  url.searchParams.set('hub.mode', 'subscribe');
  url.searchParams.set('hub.verify_token', config.supabase.verifyToken);
  url.searchParams.set('hub.challenge', challenge);

  const response = await fetch(url, {
    method: 'GET',
  });

  return {
    challenge,
    status: response.status,
    text: await response.text(),
  };
}

async function postSignedWebhook(config, input) {
  const payload = buildInboundWebhookPayload(input);
  const body = JSON.stringify(payload);
  const signature = await signBody(body, config.supabase.appSecret);

  return fetch(config.supabase.webhookUrl, {
    body,
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    method: 'POST',
  });
}

async function seedApprovedParticipantWithOwnerRpc(config, input) {
  const client = createRpcClient(config, config.supabase.validationOwnerAccessToken);

  return saveApprovedParticipant(client, {
    displayName: input.approvedDisplayName,
    householdId: input.householdId,
    memberId: input.approvedMemberId,
    phoneE164: input.approvedPhoneE164,
  });
}

async function seedApprovedParticipantWithServiceRole(config, input) {
  const endpoint = new URL('/rest/v1/whatsapp_participants', config.supabase.supabaseUrl);
  endpoint.searchParams.set('on_conflict', 'household_id,phone_e164');
  const response = await fetch(endpoint, {
    body: JSON.stringify({
      approved_at: new Date().toISOString(),
      display_name: input.approvedDisplayName,
      household_id: input.householdId,
      member_id: input.approvedMemberId,
      phone_e164: input.approvedPhoneE164,
      revoked_at: null,
      revoked_by: null,
    }),
    headers: {
      apikey: config.supabase.supabaseServiceRoleKey,
      authorization: `Bearer ${config.supabase.supabaseServiceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    method: 'POST',
  });
  const payload = await parseJsonResponse(response, 'service-role participant seed');

  if (!response.ok) {
    throw new Error(`Participant seed failed. ${JSON.stringify(payload)}`);
  }

  const savedRow = Array.isArray(payload) ? payload[0] : payload;

  return {
    displayName: savedRow?.display_name ?? input.approvedDisplayName,
    memberId: savedRow?.member_id ?? input.approvedMemberId,
    participantId: savedRow?.id ?? null,
    phoneE164: savedRow?.phone_e164 ?? input.approvedPhoneE164,
    seedMethod: 'service_role_upsert',
    status: 'approved',
  };
}

async function waitForMessageOutcome(config, input) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const message = await fetchMessageByProviderMessageId(config, input.householdId, input.providerMessageId);

    if (
      message
      && (message.parse_status === 'posted' || message.parse_status === 'needs_review' || message.parse_status === 'failed')
    ) {
      return message;
    }

    await delay(300);
  }

  return fetchMessageByProviderMessageId(config, input.householdId, input.providerMessageId);
}

async function fetchMessageByProviderMessageId(config, householdId, providerMessageId) {
  const rows = await selectRows(config, 'whatsapp_messages', 'id,parse_status,parse_metadata,provider_message_id', {
    household_id: `eq.${householdId}`,
    provider_message_id: `eq.${providerMessageId}`,
  });

  return rows[0] ?? null;
}

async function fetchTransactionBySourceReference(config, householdId, providerMessageId) {
  const rows = await selectRows(
    config,
    'transactions',
    'id,needs_review,source_type,source_reference',
    {
      household_id: `eq.${householdId}`,
      source_reference: `eq.${providerMessageId}`,
    },
  );

  return rows[0] ?? null;
}

async function fetchNotificationsByProviderMessageId(config, householdId, providerMessageId) {
  const rows = await selectRows(
    config,
    'notifications',
    'id,notification_type,payload,related_transaction_id',
    {
      household_id: `eq.${householdId}`,
    },
  );

  return rows.filter((row) => row.payload?.providerMessageId === providerMessageId);
}

async function selectRows(config, table, columns, filters) {
  const endpoint = new URL(`/rest/v1/${table}`, config.supabase.supabaseUrl);
  endpoint.searchParams.set('select', columns);

  for (const [column, value] of Object.entries(filters)) {
    endpoint.searchParams.set(column, value);
  }

  const response = await fetch(endpoint, {
    headers: {
      apikey: config.supabase.supabaseServiceRoleKey,
      authorization: `Bearer ${config.supabase.supabaseServiceRoleKey}`,
    },
    method: 'GET',
  });
  const payload = await parseJsonResponse(response, table);

  if (!response.ok) {
    throw new Error(`Select ${table} failed. ${JSON.stringify(payload)}`);
  }

  return Array.isArray(payload) ? payload : [];
}

function createRpcClient(config, authorizationToken) {
  return {
    from(table) {
      return {
        select(columns) {
          return createSelectQuery(config, authorizationToken, table, columns);
        },
      };
    },
    async rpc(name, args = {}) {
      try {
        const data = await invokeRpc(config, authorizationToken, name, args);
        return {
          data,
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error: {
            message: error instanceof Error ? error.message : 'Unknown RPC failure.',
          },
        };
      }
    },
  };
}

function createSelectQuery(config, authorizationToken, table, columns) {
  const filters = [];
  const orders = [];
  let limitCount = null;

  const builder = {
    eq(column, value) {
      filters.push([column, `eq.${value}`]);
      return builder;
    },
    is(column, value) {
      filters.push([column, value === null ? 'is.null' : `is.${value}`]);
      return builder;
    },
    limit(count) {
      limitCount = count;
      return builder;
    },
    order(column, options = {}) {
      orders.push(`${column}.${options.ascending === false ? 'desc' : 'asc'}`);
      return builder;
    },
    then(resolve, reject) {
      return execute().then(resolve, reject);
    },
    catch(reject) {
      return execute().catch(reject);
    },
    finally(callback) {
      return execute().finally(callback);
    },
  };

  async function execute() {
    const endpoint = new URL(`/rest/v1/${table}`, config.supabase.supabaseUrl);
    endpoint.searchParams.set('select', columns);

    for (const [column, value] of filters) {
      endpoint.searchParams.set(column, value);
    }

    for (const orderValue of orders) {
      endpoint.searchParams.append('order', orderValue);
    }

    if (limitCount !== null) {
      endpoint.searchParams.set('limit', String(limitCount));
    }

    const response = await fetch(endpoint, {
      headers: {
        apikey: config.supabase.supabaseServiceRoleKey,
        authorization: `Bearer ${authorizationToken}`,
      },
      method: 'GET',
    });
    const payload = await parseJsonResponse(response, table);

    if (!response.ok) {
      return {
        data: null,
        error: {
          message: `Select ${table} failed. ${JSON.stringify(payload)}`,
        },
      };
    }

    return {
      data: Array.isArray(payload) ? payload : [],
      error: null,
    };
  }

  return builder;
}

async function invokeRpc(config, authorizationToken, name, args) {
  const endpoint = new URL(`/rest/v1/rpc/${name}`, config.supabase.supabaseUrl);
  const response = await fetch(endpoint, {
    body: JSON.stringify(args),
    headers: {
      apikey: config.supabase.supabaseServiceRoleKey,
      authorization: `Bearer ${authorizationToken}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    method: 'POST',
  });
  const payload = await parseJsonResponse(response, name);

  if (!response.ok) {
    throw new Error(`RPC ${name} failed. ${JSON.stringify(payload)}`);
  }

  return payload;
}

function buildInboundWebhookPayload(input) {
  const timestamp = String(Math.floor(Date.now() / 1000));

  return {
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              contacts: [
                {
                  profile: {
                    name: input.contactName ?? 'Phase 2 validation',
                  },
                  wa_id: input.fromPhone.replace(/^\+/, ''),
                },
              ],
              messages: [
                {
                  from: input.fromPhone.replace(/^\+/, ''),
                  id: input.providerMessageId,
                  text: {
                    body: input.text,
                  },
                  timestamp,
                  type: 'text',
                },
              ],
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: input.phoneNumberId ?? 'phone-number-id',
              },
            },
          },
        ],
        id: 'phase-2-validation-entry',
      },
    ],
    object: 'whatsapp_business_account',
  };
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

function readAcknowledgement(parseMetadata) {
  if (!parseMetadata || typeof parseMetadata !== 'object' || Array.isArray(parseMetadata)) {
    return null;
  }

  return parseMetadata.acknowledgement ?? null;
}

function buildLiveValidationWarnings(config) {
  const warnings = [];

  if (!config.supabase.acknowledgementsEnabled) {
    warnings.push(
      'WHATSAPP_ACK_ENABLED is still false. After the replay pass succeeds, enable acknowledgements and validate a real Meta-delivered message so the reply branch uses a valid provider message id.',
    );
  } else {
    warnings.push(
      'Webhook replay uses synthetic provider message ids. It can confirm reply isolation, but successful acknowledgement proof still requires a real Meta-delivered inbound message inside the reply window.',
    );
  }

  if (!config.supabase.validationOwnerAccessToken) {
    warnings.push(
      'Participant approval used the service-role upsert path. Set PHASE2_VALIDATION_OWNER_ACCESS_TOKEN to exercise the owner RPC path as part of the rollout.',
    );
  }

  return warnings;
}

async function parseJsonResponse(response, label) {
  const contentType = response.headers.get('content-type') ?? '';

  if (!/application\/json/i.test(contentType)) {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Unable to parse JSON response for ${label}. ${error.message}`);
  }
}

function parseArguments(argv) {
  const options = {
    approvedDisplayName: null,
    approvedMemberId: null,
    approvedPhoneE164: null,
    delivery: 'webhook-replay',
    householdId: null,
    mode: 'mock',
    rejectedPhoneE164: null,
    supabaseEnvPath: 'supabase/.env.functions.phase2.example',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--approved-display-name') {
      options.approvedDisplayName = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--approved-member-id') {
      options.approvedMemberId = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--approved-phone') {
      options.approvedPhoneE164 = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--delivery') {
      options.delivery = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--household-id') {
      options.householdId = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--mode') {
      options.mode = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--rejected-phone') {
      options.rejectedPhoneE164 = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--supabase-env') {
      options.supabaseEnvPath = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${argument}`);
  }

  return options;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
