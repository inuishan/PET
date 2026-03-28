import { createSupabaseWhatsAppIngestRepository } from './whatsapp-review-repository.ts';
import { normalizeAcknowledgementResult } from './whatsapp-reply.ts';
import type {
  ParsedWhatsAppExpense,
  WhatsAppAcknowledgementResult,
  WhatsAppReplyDispatchInput,
  WhatsAppIngestRepository,
} from './whatsapp-types.ts';

const AUTO_POST_CONFIDENCE_THRESHOLD = 0.85;
const WHATSAPP_NOTIFICATION_CHANNEL = 'push';
const DEFAULT_REPLY_TIMEOUT_MS = 5_000;

type IngestDependencies = {
  acknowledgementsEnabled?: boolean;
  internalAuthToken?: string;
  repository?: WhatsAppIngestRepository;
  replyDispatcher?: {
    dispatchMessage: (input: WhatsAppReplyDispatchInput) => Promise<WhatsAppAcknowledgementResult>;
  } | null;
  scheduleBackgroundTask?: (task: Promise<unknown>) => void;
};

type HttpDispatcherOptions = {
  authToken?: string;
  fetch: typeof fetch;
  timeoutMs?: number;
  url?: string;
};

export { createSupabaseWhatsAppIngestRepository };

export async function handleWhatsAppIngestRequest(
  request: Request,
  dependencies: IngestDependencies,
) {
  if (request.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: {
        code: 'method_not_allowed',
        message: 'Use POST for WhatsApp ingest handoff.',
      },
    });
  }

  if (!isAuthorizedRequest(request, dependencies.internalAuthToken)) {
    return jsonResponse(401, {
      success: false,
      error: {
        code: 'unauthorized',
        message: 'Missing or invalid internal WhatsApp pipeline auth.',
      },
    });
  }

  if (!dependencies.repository) {
    return jsonResponse(500, {
      success: false,
      error: {
        code: 'whatsapp_ingest_not_configured',
        message: 'WhatsApp ingest dependencies are not configured.',
      },
    });
  }

  let input: ParsedWhatsAppExpense;

  try {
    input = normalizeParsedExpense(await request.json());
  } catch (error) {
    return jsonResponse(400, {
      success: false,
      error: {
        code: 'invalid_whatsapp_ingest_request',
        message: error instanceof Error ? error.message : 'Request body must be valid JSON.',
      },
    });
  }

  try {
    const existingOutcome = await dependencies.repository.getExistingMessageOutcome?.({
      householdId: input.householdId,
      messageId: input.messageId,
    });

    if (existingOutcome) {
      return jsonResponse(200, {
        success: true,
        data: {
          alreadyProcessed: true,
          outcome: existingOutcome.parseStatus,
          transactionId: existingOutcome.transactionId,
        },
      });
    }

    if (input.parseStatus === 'failed' || input.amount === null) {
      await notifyParseFailure(input, dependencies.repository);
      await dependencies.repository.updateMessageOutcome({
        householdId: input.householdId,
        messageId: input.messageId,
        parseMetadata: mergeMetadata(input.existingParseMetadata, {
          outcome: 'failed',
          parseStatus: 'failed',
          reviewReasons: input.reviewReasons,
          validationErrors: input.validationErrors,
        }),
        parseStatus: 'failed',
        transactionId: null,
      });
      queueOptionalAcknowledgement(dependencies, {
        dispatchInput: createAcknowledgementDispatchInput(input, 'failed'),
        householdId: input.householdId,
        messageId: input.messageId,
        outcome: 'failed',
      });

      return jsonResponse(200, {
        success: true,
        data: {
          outcome: 'failed',
        },
      });
    }

    const classification = await dependencies.repository.classifyParsedTransaction(input);
    const reviewReasons = uniqueValues([
      ...input.reviewReasons,
      ...(input.confidence < AUTO_POST_CONFIDENCE_THRESHOLD ? ['low_confidence'] : []),
      ...(input.ownerScope === 'unknown' ? ['owner_unknown'] : []),
    ]);
    const needsReview = input.parseStatus === 'needs_review' || reviewReasons.length > 0;
    const transaction = await dependencies.repository.createTransaction({
      amount: input.amount,
      categoryId: classification.categoryId,
      classificationMethod: classification.method,
      confidence: input.confidence,
      currency: input.currency ?? 'INR',
      description: input.note,
      fingerprint: createMessageFingerprint(input.householdId, input.providerMessageId),
      householdId: input.householdId,
      merchantNormalized: input.merchantNormalized ?? normalizeMerchantName(input.merchantRaw ?? 'Unknown Merchant'),
      merchantRaw: input.merchantRaw ?? 'Unknown Merchant',
      metadata: {
        messageId: input.messageId,
        normalizationSource: 'whatsapp_parse',
        participantId: input.participantId,
        providerMessageId: input.providerMessageId,
        reviewReasons,
      },
      needsReview,
      ownerMemberId: input.ownerMemberId,
      ownerScope: input.ownerScope,
      postedAt: input.transactionDate,
      reviewReason: needsReview ? reviewReasons.join(', ') : null,
      sourceReference: input.providerMessageId,
      sourceType: 'upi_whatsapp',
      status: needsReview ? 'needs_review' : 'processed',
      transactionDate: input.transactionDate,
    });

    await dependencies.repository.createClassificationEvent({
      confidence: classification.confidence,
      householdId: input.householdId,
      metadata: {
        messageId: input.messageId,
        providerMessageId: input.providerMessageId,
        source: 'whatsapp_ingest',
      },
      method: classification.method,
      nextCategoryId: classification.categoryId,
      previousCategoryId: null,
      rationale: classification.rationale,
      transactionId: transaction.id,
    });

    if (needsReview) {
      await notifyReviewRequired(input, transaction.id, dependencies.repository);
    }

    const outcome = needsReview ? 'needs_review' : 'posted';
    await dependencies.repository.updateMessageOutcome({
      householdId: input.householdId,
      messageId: input.messageId,
      parseMetadata: mergeMetadata(input.existingParseMetadata, {
        classification,
        outcome,
        parseStatus: input.parseStatus,
        reviewReasons,
        transactionId: transaction.id,
      }),
      parseStatus: needsReview ? 'needs_review' : 'posted',
      transactionId: transaction.id,
    });
    queueOptionalAcknowledgement(
      dependencies,
      {
        dispatchInput: createAcknowledgementDispatchInput(input, outcome),
        householdId: input.householdId,
        messageId: input.messageId,
        outcome,
      },
    );

    return jsonResponse(200, {
      success: true,
      data: {
        outcome,
        transactionId: transaction.id,
      },
    });
  } catch (error) {
    console.error('whatsapp-ingest failed', error);

    return jsonResponse(502, {
      success: false,
      error: {
        code: 'whatsapp_ingest_failed',
        message: 'Failed to persist the WhatsApp ingest outcome.',
      },
    });
  }
}

export function createHttpWhatsAppReplyDispatcher(options: HttpDispatcherOptions) {
  if (!options.url || !options.authToken) {
    return null;
  }

  return {
    async dispatchMessage(input: WhatsAppReplyDispatchInput) {
      const response = await options.fetch(options.url as string, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.authToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`WhatsApp reply handoff failed with ${response.status}`);
      }

      const payload = await readJsonResponse(response);
      return normalizeAcknowledgementResult(payload?.data ?? {}, input.outcome);
    },
  };
}

async function notifyReviewRequired(
  input: ParsedWhatsAppExpense,
  transactionId: string,
  repository: WhatsAppIngestRepository,
) {
  const recipients = await repository.listHouseholdRecipients(input.householdId);

  await Promise.all(recipients.map((recipient) =>
    repository.createNotification({
      body: `${input.merchantRaw ?? 'Unknown Merchant'} needs review before the WhatsApp UPI expense is trusted.`,
      channel: WHATSAPP_NOTIFICATION_CHANNEL,
      householdId: input.householdId,
      notificationType: 'whatsapp_review_required',
      payload: {
        messageId: input.messageId,
        providerMessageId: input.providerMessageId,
        reviewReasons: input.reviewReasons,
      },
      recipientUserId: recipient.userId,
      relatedTransactionId: transactionId,
      title: 'WhatsApp expense needs review',
    })
  ));
}

async function notifyParseFailure(
  input: ParsedWhatsAppExpense,
  repository: WhatsAppIngestRepository,
) {
  const recipients = await repository.listHouseholdRecipients(input.householdId);

  await Promise.all(recipients.map((recipient) =>
    repository.createNotification({
      body: 'A WhatsApp UPI message could not be posted automatically and needs manual follow-up.',
      channel: WHATSAPP_NOTIFICATION_CHANNEL,
      householdId: input.householdId,
      notificationType: 'whatsapp_parse_failure',
      payload: {
        messageId: input.messageId,
        providerMessageId: input.providerMessageId,
        validationErrors: input.validationErrors,
      },
      recipientUserId: recipient.userId,
      relatedTransactionId: null,
      title: 'WhatsApp expense could not be parsed',
    })
  ));
}

function normalizeParsedExpense(input: unknown): ParsedWhatsAppExpense {
  const record = asRecord(input, 'WhatsApp ingest payload must be an object.');

  return {
    amount: normalizeAmount(record.amount),
    confidence: normalizeConfidence(record.confidence),
    currency: (normalizeOptionalString(record.currency) ?? 'INR') as 'INR',
    existingParseMetadata: asOptionalRecord(record.existingParseMetadata),
    householdId: requireString(record.householdId, 'householdId'),
    merchantNormalized: normalizeOptionalString(record.merchantNormalized),
    merchantRaw: normalizeOptionalString(record.merchantRaw),
    messageId: requireString(record.messageId, 'messageId'),
    note: normalizeOptionalString(record.note),
    ownerMemberId: normalizeOptionalString(record.ownerMemberId),
    ownerScope: normalizeOwnerScope(record.ownerScope),
    parseStatus: normalizeParseStatus(record.parseStatus),
    participantId: requireString(record.participantId, 'participantId'),
    participantPhoneE164: normalizeOptionalString(record.participantPhoneE164),
    providerMessageId: requireString(record.providerMessageId, 'providerMessageId'),
    providerSentAt: normalizeOptionalString(record.providerSentAt),
    reviewReasons: normalizeStringArray(record.reviewReasons),
    transactionDate: requireString(record.transactionDate, 'transactionDate'),
    validationErrors: normalizeStringArray(record.validationErrors),
  };
}

function normalizeParseStatus(value: unknown) {
  const normalized = requireString(value, 'parseStatus');

  if (normalized !== 'failed' && normalized !== 'needs_review' && normalized !== 'parsed') {
    throw new Error('Invalid parseStatus');
  }

  return normalized;
}

function normalizeOwnerScope(value: unknown) {
  const normalized = requireString(value, 'ownerScope');

  if (normalized !== 'member' && normalized !== 'shared' && normalized !== 'unknown') {
    throw new Error('Invalid ownerScope');
  }

  return normalized;
}

function normalizeAmount(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
}

function normalizeConfidence(value: unknown) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new Error('Invalid confidence');
  }

  return Number(numeric.toFixed(3));
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function mergeMetadata(
  existingMetadata: Record<string, unknown> | undefined,
  nextMetadata: Record<string, unknown>,
) {
  return {
    ...(existingMetadata ?? {}),
    ...nextMetadata,
  };
}

function createMessageFingerprint(householdId: string, providerMessageId: string) {
  return `whatsapp-upi:${householdId}:${providerMessageId}`;
}

function normalizeMerchantName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ');
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function createAcknowledgementDispatchInput(
  input: ParsedWhatsAppExpense,
  outcome: 'failed' | 'needs_review' | 'posted',
): WhatsAppReplyDispatchInput | null {
  const phoneNumberId = normalizeOptionalString(input.existingParseMetadata?.phoneNumberId);

  if (!phoneNumberId || !input.participantPhoneE164 || !input.providerSentAt) {
    return null;
  }

  return {
    amount: input.amount,
    currency: input.currency ?? 'INR',
    merchantRaw: input.merchantRaw,
    outcome,
    phoneNumberId,
    providerMessageId: input.providerMessageId,
    providerSentAt: input.providerSentAt,
    recipientPhoneE164: input.participantPhoneE164,
  };
}

function queueOptionalAcknowledgement(
  dependencies: IngestDependencies,
  input: {
    dispatchInput: WhatsAppReplyDispatchInput | null;
    householdId: string;
    messageId: string;
    outcome: 'failed' | 'needs_review' | 'posted';
  },
) {
  if (!input.dispatchInput) {
    void recordAcknowledgementResult(dependencies.repository, {
      acknowledgement: {
        outcome: input.outcome,
        reason: 'missing_context',
        status: 'skipped',
      },
      householdId: input.householdId,
      messageId: input.messageId,
    });
    return;
  }

  if (!dependencies.replyDispatcher) {
    void recordAcknowledgementResult(dependencies.repository, {
      acknowledgement: {
        outcome: input.outcome,
        reason: dependencies.acknowledgementsEnabled ? 'reply_dispatcher_unavailable' : 'acknowledgements_disabled',
        status: 'disabled',
      },
      householdId: input.householdId,
      messageId: input.messageId,
    });
    return;
  }

  const job = dependencies.replyDispatcher
    .dispatchMessage(input.dispatchInput)
    .then((acknowledgement) =>
      recordAcknowledgementResult(dependencies.repository, {
        acknowledgement,
        householdId: input.householdId,
        messageId: input.messageId,
      }))
    .catch(async (error) => {
      console.error('whatsapp-ingest acknowledgement dispatch failed', error);
      await recordAcknowledgementResult(dependencies.repository, {
        acknowledgement: {
          outcome: input.outcome,
          reason: 'dispatch_failed',
          status: 'failed',
        },
        householdId: input.householdId,
        messageId: input.messageId,
      });
    });

  if (typeof dependencies.scheduleBackgroundTask === 'function') {
    dependencies.scheduleBackgroundTask(job);
    return;
  }

  void job;
}

async function recordAcknowledgementResult(
  repository: WhatsAppIngestRepository | undefined,
  input: {
    acknowledgement: WhatsAppAcknowledgementResult;
    householdId: string;
    messageId: string;
  },
) {
  if (typeof repository?.updateMessageAcknowledgement !== 'function') {
    return;
  }

  try {
    await repository.updateMessageAcknowledgement(input);
  } catch (error) {
    console.error('whatsapp acknowledgement status update failed', error);
  }
}

function isAuthorizedRequest(request: Request, internalAuthToken?: string) {
  const providedToken = request.headers.get('authorization');
  return Boolean(internalAuthToken) && providedToken === `Bearer ${internalAuthToken}`;
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

function asRecord(value: unknown, message: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function asOptionalRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    throw new Error(`Missing required field: ${field}`);
  }

  return normalized;
}

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (!/application\/json/i.test(contentType)) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}
