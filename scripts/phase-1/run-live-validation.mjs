#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { createPhase1AlertService } from '../../supabase/functions/_shared/phase-1-alerts.mjs';
import {
  handleStatementIngestRequest,
  PIPELINE_SECRET_HEADER,
} from '../../supabase/functions/_shared/statement-ingest.mjs';
import {
  buildPhase1RuntimeValidationReport,
  loadEnvFile,
} from './runtime-config.mjs';
import {
  runLivePhase1SmokeTest,
  runMockPhase1SmokeTest,
} from './run-smoke-test.mjs';

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_POLL_TIMEOUT_MS = 180_000;
const DEFAULT_SETTLE_WAIT_MS = 10_000;
const VALID_MODES = new Set(['live', 'mock']);
const FAILURE_NOTIFICATION_TYPES = new Set([
  'statement_parse_failure',
  'statement_sync_blocked',
]);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArguments(process.argv.slice(2));
  validateCliOptions(options);
  const report = buildPhase1RuntimeValidationReport({
    mobileEnv: loadEnvFile(options.mobileEnvPath),
    n8nEnv: loadEnvFile(options.n8nEnvPath),
    supabaseEnv: loadEnvFile(options.supabaseEnvPath),
  });

  if (report.errors.length > 0) {
    console.error('Phase 1 validation cannot start because the runtime configuration is invalid.');

    for (const error of report.errors) {
      console.error(`- ${error}`);
    }

    process.exit(1);
  }

  const result = options.mode === 'live'
    ? await runLivePhase1Validation(report.config, options)
    : await runMockPhase1Validation(report.config, options);

  console.log(JSON.stringify(result, null, 2));
}

export async function runMockPhase1Validation(config, options = {}) {
  return {
    contractSmoke: await runMockPhase1SmokeTest(config, options),
    failureDrill: await runMockFailureDrill(config, options),
    reviewDrill: await runMockReviewDrill(config, options),
  };
}

export async function runLivePhase1Validation(config, options = {}) {
  const delivery = options.delivery ?? 'drive-drop';

  if (delivery === 'drive-drop') {
    return runLiveDriveDropValidation(config, options);
  }

  if (delivery === 'endpoint-smoke') {
    return runLiveEndpointSmokeValidation(config, options);
  }

  if (delivery === 'ingest-failure-drill') {
    return runLiveFailureDrill(config, options);
  }

  throw new Error(`Unsupported Phase 1 live delivery mode: ${delivery}`);
}

async function runMockReviewDrill(config, options) {
  const state = createMockAlertState();
  const householdId = resolveHouseholdId(config, options);
  const providerFileId = options.providerFileId ?? 'phase1-mock-review-001';
  const providerFileName = options.providerFileName ?? 'Phase 1 Mock Review Drill.pdf';
  const payload = buildReviewDrillPayload(config, {
    householdId,
    providerFileId,
    providerFileName,
  });
  const alerts = createPhase1AlertService({
    defaultChannels: ['push'],
    pushProvider: {
      async send(notification) {
        return {
          providerMessageId: `mock-fcm-${notification.recipientUserId ?? 'recipient'}`,
        };
      },
    },
    repository: createMockNotificationRepository(state),
  });
  const persisted = {
    statementUpload: null,
    transactions: [],
  };

  const response = await handleStatementIngestRequest(
    buildIngestRequest(config, payload),
    {
      alerts,
      repository: {
        async ingestStatement(statementUpload, transactions) {
          persisted.statementUpload = {
            ...statementUpload,
            id: 'mock-upload-review-001',
          };
          persisted.transactions = transactions.map((transaction, index) => ({
            ...transaction,
            id: `mock-transaction-${index + 1}`,
            statementUploadId: 'mock-upload-review-001',
          }));

          return {
            id: 'mock-upload-review-001',
          };
        },
      },
      webhookSecret: config.supabase.statementPipelineSharedSecret,
    },
  );
  const body = await response.json();

  return {
    response: {
      body,
      status: response.status,
    },
    outcome: buildObservedOutcome({
      householdId,
      notifications: state.notifications,
      providerFileId,
      providerFileName,
      statementUpload: persisted.statementUpload,
      transactions: persisted.transactions,
    }),
  };
}

async function runMockFailureDrill(config, options) {
  const state = createMockAlertState();
  const householdId = resolveHouseholdId(config, options);
  const providerFileId = options.providerFileId ?? 'phase1-mock-failure-001';
  const providerFileName = options.providerFileName ?? 'Phase 1 Mock Failure Drill.pdf';
  const payload = buildFailureDrillPayload(config, {
    householdId,
    providerFileId,
    providerFileName,
  });
  const alerts = createPhase1AlertService({
    defaultChannels: ['push'],
    pushProvider: {
      async send(notification) {
        return {
          providerMessageId: `mock-fcm-${notification.recipientUserId ?? 'recipient'}`,
        };
      },
    },
    repository: createMockNotificationRepository(state),
  });

  const response = await withSuppressedConsoleError(() =>
    handleStatementIngestRequest(
      buildIngestRequest(config, payload),
      {
        alerts,
        repository: {
          async ingestStatement() {
            throw new Error('mock statement ingest repository failure');
          },
        },
        webhookSecret: config.supabase.statementPipelineSharedSecret,
      },
    ));
  const body = await response.json();

  return {
    response: {
      body,
      status: response.status,
    },
    outcome: buildObservedOutcome({
      householdId,
      notifications: state.notifications,
      providerFileId,
      providerFileName,
      statementUpload: null,
      transactions: [],
    }),
  };
}

async function runLiveEndpointSmokeValidation(config, options) {
  const providerFileId = options.providerFileId ?? `phase1-live-smoke-${Date.now()}`;
  const providerFileName = options.providerFileName ?? 'HDFC Regalia Gold Apr 2026.pdf';
  const startedAt = options.uploadedAfter ?? new Date().toISOString();
  const smoke = await runLivePhase1SmokeTest(config, {
    ...options,
    providerFileId,
    providerFileName,
  });
  const outcome = await waitForPhase1Outcome(
    config,
    {
      householdId: smoke.route.householdId ?? resolveHouseholdId(config, options),
      providerFileId,
      providerFileName,
      startedAt,
    },
    {
      ...options,
      failFastOnFailureNotification: true,
    },
  );

  validatePhase1Outcome(outcome, {
    delivery: 'endpoint-smoke',
    expectMinTransactions: options.expectMinTransactions ?? 1,
    expectReviewCountMin: options.expectReviewCountMin,
    expectStatementUpload: true,
  });

  return {
    delivery: 'endpoint-smoke',
    outcome,
    smoke,
  };
}

async function runLiveDriveDropValidation(config, options) {
  const householdId = resolveHouseholdId(config, options);
  const providerFileId = options.providerFileId ?? null;
  const providerFileName = options.providerFileName ?? null;

  if (!providerFileId && !providerFileName) {
    throw new Error('Drive-drop validation requires --provider-file-id or --provider-file-name.');
  }

  const outcome = await waitForPhase1Outcome(
    config,
    {
      householdId,
      providerFileId,
      providerFileName,
      startedAt: options.uploadedAfter ?? new Date().toISOString(),
    },
    {
      ...options,
      failFastOnFailureNotification: true,
    },
  );

  validatePhase1Outcome(outcome, {
    delivery: 'drive-drop',
    expectMinTransactions: options.expectMinTransactions ?? 1,
    expectReviewCountMin: options.expectReviewCountMin,
    expectStatementUpload: true,
  });

  return {
    delivery: 'drive-drop',
    outcome,
  };
}

async function runLiveFailureDrill(config, options) {
  const householdId = resolveHouseholdId(config, options);
  const providerFileId = options.providerFileId ?? `phase1-live-failure-${Date.now()}`;
  const providerFileName = options.providerFileName ?? `Phase 1 Failure Drill ${providerFileId}.pdf`;
  const startedAt = new Date().toISOString();
  const payload = buildFailureDrillPayload(config, {
    householdId,
    providerFileId,
    providerFileName,
  });

  const response = await fetch(config.n8n.statementIngestUrl, {
    body: JSON.stringify(payload),
    headers: {
      'content-type': 'application/json',
      [PIPELINE_SECRET_HEADER]: config.supabase.statementPipelineSharedSecret,
    },
    method: 'POST',
  });
  const body = await parseJsonResponse(response, 'statement-ingest failure drill');

  if (response.status !== 502 || body.success !== false || body.error?.code !== 'statement_ingest_failed') {
    throw new Error(`Live ingest failure drill did not fail as expected. ${JSON.stringify(body)}`);
  }

  const outcome = await waitForPhase1Outcome(
    config,
    {
      householdId,
      providerFileId,
      providerFileName,
      startedAt,
    },
    options,
  );

  validatePhase1Outcome(outcome, {
    delivery: 'ingest-failure-drill',
    expectNotificationType: options.expectNotificationType ?? 'statement_sync_blocked',
    expectNoStatementUpload: true,
  });

  return {
    delivery: 'ingest-failure-drill',
    outcome,
    response: {
      body,
      status: response.status,
    },
  };
}

async function waitForPhase1Outcome(config, criteria, options = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const settleWaitMs = options.settleWaitMs ?? DEFAULT_SETTLE_WAIT_MS;
  const deadline = Date.now() + pollTimeoutMs;
  let stableSince = null;
  let lastObservation = null;

  while (Date.now() <= deadline) {
    const statementUpload = await fetchLatestStatementUpload(config, criteria);
    const notifications = await fetchMatchingNotifications(config, criteria, statementUpload?.id ?? null);
    const transactions = statementUpload
      ? await fetchTransactionsForStatementUpload(config, statementUpload.id)
      : [];

    lastObservation = {
      notifications: notifications.length,
      statementUploadId: statementUpload?.id ?? null,
      transactions: transactions.length,
    };

    if (hasFailureNotification(notifications) && options.failFastOnFailureNotification) {
      return buildObservedOutcome({
        householdId: criteria.householdId,
        notifications,
        providerFileId: criteria.providerFileId ?? statementUpload?.provider_file_id ?? null,
        providerFileName: criteria.providerFileName ?? statementUpload?.provider_file_name ?? null,
        startedAt: criteria.startedAt,
        statementUpload,
        transactions,
      });
    }

    if (statementUpload || hasFailureNotification(notifications)) {
      stableSince ??= Date.now();

      if (Date.now() - stableSince >= settleWaitMs) {
        return buildObservedOutcome({
          householdId: criteria.householdId,
          notifications,
          providerFileId: criteria.providerFileId ?? statementUpload?.provider_file_id ?? null,
          providerFileName: criteria.providerFileName ?? statementUpload?.provider_file_name ?? null,
          startedAt: criteria.startedAt,
          statementUpload,
          transactions,
        });
      }
    } else {
      stableSince = null;
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for the Phase 1 outcome. ${JSON.stringify({
      ...criteria,
      lastObservation,
      pollTimeoutMs,
    })}`,
  );
}

async function fetchLatestStatementUpload(config, criteria) {
  const rows = await selectRows(
    config,
    'statement_uploads',
    [
      'id',
      'household_id',
      'provider_file_id',
      'provider_file_name',
      'parse_status',
      'parse_confidence',
      'parse_error',
      'bank_name',
      'card_name',
      'parser_profile_name',
      'uploaded_at',
      'synced_at',
      'raw_metadata',
    ].join(','),
    {
      household_id: `eq.${criteria.householdId}`,
      ...(criteria.providerFileId ? { provider_file_id: `eq.${criteria.providerFileId}` } : {}),
      ...(criteria.providerFileName ? { provider_file_name: `eq.${criteria.providerFileName}` } : {}),
      ...(criteria.startedAt ? { uploaded_at: `gte.${criteria.startedAt}` } : {}),
    },
    {
      limit: 1,
      order: ['uploaded_at.desc', 'created_at.desc'],
    },
  );

  return rows[0] ?? null;
}

async function fetchTransactionsForStatementUpload(config, statementUploadId) {
  return selectRows(
    config,
    'transactions',
    [
      'id',
      'amount',
      'confidence',
      'merchant_raw',
      'needs_review',
      'review_reason',
      'statement_upload_id',
      'status',
      'transaction_date',
    ].join(','),
    {
      statement_upload_id: `eq.${statementUploadId}`,
    },
    {
      order: ['transaction_date.desc', 'created_at.desc'],
    },
  );
}

async function fetchMatchingNotifications(config, criteria, relatedStatementUploadId) {
  const rows = await selectRows(
    config,
    'notifications',
    [
      'id',
      'body',
      'created_at',
      'notification_type',
      'payload',
      'recipient_user_id',
      'related_statement_upload_id',
      'sent_at',
      'status',
      'title',
    ].join(','),
    {
      household_id: `eq.${criteria.householdId}`,
      ...(criteria.startedAt ? { created_at: `gte.${criteria.startedAt}` } : {}),
    },
    {
      limit: 100,
      order: ['created_at.desc'],
    },
  );

  return rows.filter((row) => notificationMatches(row, criteria, relatedStatementUploadId));
}

function notificationMatches(notification, criteria, relatedStatementUploadId) {
  if (relatedStatementUploadId && notification.related_statement_upload_id === relatedStatementUploadId) {
    return true;
  }

  const payload = isRecord(notification.payload) ? notification.payload : {};
  const payloadFileId = readOptionalString(payload.providerFileId);
  const payloadFileName = readOptionalString(payload.providerFileName);

  if (criteria.providerFileId && payloadFileId === criteria.providerFileId) {
    return true;
  }

  if (criteria.providerFileName && payloadFileName === criteria.providerFileName) {
    return true;
  }

  return false;
}

function buildObservedOutcome(input) {
  const notificationsByType = summarizeNotificationsByType(input.notifications);
  const needsReviewCount = input.transactions.filter((transaction) => readNeedsReview(transaction)).length;

  return {
    checks: {
      failureNotificationsObserved: hasFailureNotification(input.notifications),
      reviewRowsObserved: needsReviewCount > 0,
      statementUploadObserved: Boolean(input.statementUpload),
      transactionsObserved: input.transactions.length > 0,
    },
    completedAt: new Date().toISOString(),
    householdId: input.householdId,
    notifications: {
      byType: notificationsByType,
      count: input.notifications.length,
      rows: input.notifications.map((notification) => ({
        createdAt: notification.created_at ?? null,
        id: notification.id,
        notificationType: notification.notification_type,
        relatedStatementUploadId: notification.related_statement_upload_id ?? null,
        sentAt: notification.sent_at ?? null,
        status: notification.status,
      })),
    },
    providerFileId: input.providerFileId ?? null,
    providerFileName: input.providerFileName ?? null,
    startedAt: input.startedAt ?? null,
    statementUpload: input.statementUpload
      ? {
          id: input.statementUpload.id,
          parseConfidence:
            input.statementUpload.parse_confidence
            ?? input.statementUpload.parseConfidence
            ?? null,
          parseError:
            input.statementUpload.parse_error
            ?? input.statementUpload.parseError
            ?? null,
          parseStatus:
            input.statementUpload.parse_status
            ?? input.statementUpload.parseStatus
            ?? null,
          providerFileId:
            input.statementUpload.provider_file_id
            ?? input.statementUpload.providerFileId
            ?? null,
          providerFileName:
            input.statementUpload.provider_file_name
            ?? input.statementUpload.providerFileName
            ?? null,
          uploadedAt:
            input.statementUpload.uploaded_at
            ?? input.statementUpload.uploadedAt
            ?? null,
        }
      : null,
    transactions: {
      count: input.transactions.length,
      needsReviewCount,
      rows: input.transactions.map((transaction) => ({
        amount: transaction.amount,
        confidence: transaction.confidence ?? null,
        id: transaction.id,
        merchantRaw: transaction.merchant_raw ?? transaction.merchantRaw ?? null,
        needsReview: readNeedsReview(transaction),
        reviewReason: transaction.review_reason ?? transaction.reviewReason ?? null,
        status: transaction.status,
        transactionDate: transaction.transaction_date ?? transaction.transactionDate ?? null,
      })),
    },
  };
}

function summarizeNotificationsByType(notifications) {
  return notifications.reduce((summary, notification) => {
    const notificationType = String(notification.notification_type ?? 'unknown');

    return {
      ...summary,
      [notificationType]: (summary[notificationType] ?? 0) + 1,
    };
  }, {});
}

function hasFailureNotification(notifications) {
  return notifications.some((notification) => FAILURE_NOTIFICATION_TYPES.has(notification.notification_type));
}

function validatePhase1Outcome(outcome, expectations) {
  if (expectations.expectStatementUpload && !outcome.statementUpload) {
    throw new Error(`Phase 1 validation did not observe a statement_uploads row. ${JSON.stringify(outcome)}`);
  }

  if (expectations.expectNoStatementUpload && outcome.statementUpload) {
    throw new Error(`Phase 1 validation observed an unexpected statement_uploads row. ${JSON.stringify(outcome)}`);
  }

  if (
    Number.isInteger(expectations.expectMinTransactions)
    && outcome.transactions.count < expectations.expectMinTransactions
  ) {
    throw new Error(`Phase 1 validation observed too few transactions. ${JSON.stringify(outcome)}`);
  }

  if (
    Number.isInteger(expectations.expectReviewCountMin)
    && outcome.transactions.needsReviewCount < expectations.expectReviewCountMin
  ) {
    throw new Error(`Phase 1 validation observed too few needs_review rows. ${JSON.stringify(outcome)}`);
  }

  if (expectations.expectNotificationType) {
    const count = outcome.notifications.byType[expectations.expectNotificationType] ?? 0;

    if (count < 1) {
      throw new Error(
        `Phase 1 validation did not observe notification_type=${expectations.expectNotificationType}. ${JSON.stringify(outcome)}`,
      );
    }
  }
}

function buildReviewDrillPayload(config, input) {
  const route = config.n8n.routingRules[0] ?? {};

  return {
    rows: [
      {
        amount: '1234.50',
        confidence: 0.96,
        description: 'Validation drill happy-path row',
        merchant: 'Validation Merchant',
        transactionDate: '2026-04-12',
      },
      {
        amount: '879.00',
        confidence: 0.44,
        merchant: 'Validation Review Merchant',
        reviewReason: 'validation_drill_low_confidence',
        transactionDate: '2026-04-18',
      },
    ],
    statement: {
      bankName: route.bankName ?? 'HDFC Bank',
      cardName: route.cardName ?? 'Regalia Gold',
      householdId: input.householdId,
      parserProfileName: route.parserProfileName ?? 'phase1-validation',
      providerFileId: input.providerFileId,
      providerFileName: input.providerFileName,
      statementPasswordKey: route.statementPasswordKey ?? null,
    },
  };
}

function buildFailureDrillPayload(config, input) {
  const payload = buildReviewDrillPayload(config, input);

  return {
    ...payload,
    rows: [
      {
        amount: '999.00',
        categoryId: input.invalidCategoryId ?? randomUUID(),
        confidence: 0.98,
        merchant: 'Validation Failure Merchant',
        transactionDate: '2026-04-21',
      },
    ],
  };
}

function buildIngestRequest(config, payload) {
  return new Request(config.n8n.statementIngestUrl, {
    body: JSON.stringify(payload),
    headers: {
      'content-type': 'application/json',
      [PIPELINE_SECRET_HEADER]: config.supabase.statementPipelineSharedSecret,
    },
    method: 'POST',
  });
}

function createMockAlertState() {
  return {
    notifications: [],
    recipients: [
      { userId: '22222222-2222-4222-8222-222222222222' },
    ],
  };
}

function createMockNotificationRepository(state) {
  return {
    async createNotification(notification) {
      const stored = {
        ...notification,
        id: `mock-notification-${state.notifications.length + 1}`,
        payload: structuredClone(notification.payload),
        related_statement_upload_id: notification.relatedStatementUploadId ?? null,
        notification_type: notification.notificationType,
        recipient_user_id: notification.recipientUserId,
      };

      state.notifications.push(stored);
      return {
        ...stored,
        householdId: stored.householdId,
        notificationType: stored.notification_type,
        recipientUserId: stored.recipient_user_id,
        relatedStatementUploadId: stored.related_statement_upload_id,
      };
    },
    async listHouseholdRecipients() {
      return state.recipients.map((recipient) => ({ ...recipient }));
    },
    async updateNotification(notificationId, patch) {
      const index = state.notifications.findIndex((notification) => notification.id === notificationId);

      if (index === -1) {
        throw new Error(`Unknown notification id: ${notificationId}`);
      }

      const currentNotification = state.notifications[index];

      state.notifications[index] = {
        ...currentNotification,
        payload: patch.payload ? structuredClone(patch.payload) : currentNotification.payload,
        sent_at: patch.sentAt ?? currentNotification.sent_at ?? null,
        status: patch.status ?? currentNotification.status,
      };
    },
  };
}

async function selectRows(config, table, columns, filters, options = {}) {
  const endpoint = new URL(`/rest/v1/${table}`, config.supabase.supabaseUrl);
  endpoint.searchParams.set('select', columns);

  for (const [column, value] of Object.entries(filters)) {
    endpoint.searchParams.set(column, value);
  }

  for (const orderValue of options.order ?? []) {
    endpoint.searchParams.append('order', orderValue);
  }

  if (options.limit) {
    endpoint.searchParams.set('limit', String(options.limit));
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

function resolveHouseholdId(config, options) {
  const householdId = options.householdId ?? config.n8n.statementHouseholdId;

  if (!householdId) {
    throw new Error('Phase 1 validation requires a household id.');
  }

  return householdId;
}

function parseArguments(argv) {
  const options = {
    delivery: 'drive-drop',
    expectMinTransactions: null,
    expectNotificationType: null,
    expectReviewCountMin: null,
    extractedTextFilePath: null,
    householdId: null,
    mobileEnvPath: 'apps/mobile/.env.phase1.example',
    mode: 'mock',
    n8nEnvPath: 'infra/n8n/.env.phase1.example',
    pdfPath: null,
    pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    pollTimeoutMs: DEFAULT_POLL_TIMEOUT_MS,
    providerFileId: null,
    providerFileName: null,
    settleWaitMs: DEFAULT_SETTLE_WAIT_MS,
    supabaseEnvPath: 'supabase/.env.functions.phase1.example',
    uploadedAfter: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--delivery') {
      options.delivery = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--expect-min-transactions') {
      options.expectMinTransactions = parseIntegerArgument(argument, nextValue);
      index += 1;
      continue;
    }

    if (argument === '--expect-notification-type') {
      options.expectNotificationType = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--expect-review-count-min') {
      options.expectReviewCountMin = parseIntegerArgument(argument, nextValue);
      index += 1;
      continue;
    }

    if (argument === '--extracted-text-file') {
      options.extractedTextFilePath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--household-id') {
      options.householdId = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--mobile-env') {
      options.mobileEnvPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--mode') {
      options.mode = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--n8n-env') {
      options.n8nEnvPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--pdf') {
      options.pdfPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--poll-interval-ms') {
      options.pollIntervalMs = parseIntegerArgument(argument, nextValue);
      index += 1;
      continue;
    }

    if (argument === '--poll-timeout-ms') {
      options.pollTimeoutMs = parseIntegerArgument(argument, nextValue);
      index += 1;
      continue;
    }

    if (argument === '--provider-file-id') {
      options.providerFileId = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--provider-file-name') {
      options.providerFileName = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--settle-wait-ms') {
      options.settleWaitMs = parseIntegerArgument(argument, nextValue);
      index += 1;
      continue;
    }

    if (argument === '--supabase-env') {
      options.supabaseEnvPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--uploaded-after') {
      options.uploadedAfter = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${argument}`);
  }

  return options;
}

function validateCliOptions(options) {
  if (!VALID_MODES.has(options.mode)) {
    throw new Error(`Unsupported --mode value: ${options.mode}. Use "mock" or "live".`);
  }
}

function parseIntegerArgument(argument, value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${argument} requires a non-negative integer value.`);
  }

  return parsed;
}

async function parseJsonResponse(response, label) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label} returned a non-JSON response. ${error.message}`);
  }
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function withSuppressedConsoleError(callback) {
  const originalConsoleError = console.error;

  console.error = () => {};

  try {
    return await callback();
  } finally {
    console.error = originalConsoleError;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNeedsReview(transaction) {
  return transaction.needs_review === true || transaction.needsReview === true;
}
