import type { WhatsAppReplyDispatchInput } from './whatsapp-types.ts';

const DEFAULT_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

type ReplyDependencies = {
  acknowledgementsEnabled?: boolean;
  internalAuthToken?: string;
  now?: () => string;
  replyClient?: {
    sendMessage: (input: {
      contextMessageId: string;
      phoneNumberId: string;
      recipientPhoneE164: string;
      text: string;
    }) => Promise<{ messageId?: string | null } | void>;
  } | null;
  replyWindowMs?: number;
};

type ReplyClientOptions = {
  accessToken?: string;
  apiBaseUrl?: string;
  fetch: typeof fetch;
};

export async function handleWhatsAppReplyRequest(
  request: Request,
  dependencies: ReplyDependencies,
) {
  if (request.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: {
        code: 'method_not_allowed',
        message: 'Use POST for WhatsApp reply handoff.',
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

  let input: WhatsAppReplyDispatchInput;

  try {
    input = normalizeReplyDispatchInput(await request.json());
  } catch (error) {
    return jsonResponse(400, {
      success: false,
      error: {
        code: 'invalid_whatsapp_reply_request',
        message: error instanceof Error ? error.message : 'Request body must be valid JSON.',
      },
    });
  }

  if (!dependencies.acknowledgementsEnabled || !dependencies.replyClient) {
    return jsonResponse(200, {
      success: true,
      data: {
        outcome: input.outcome,
        status: 'disabled',
      },
    });
  }

  const replyWindowStatus = getReplyWindowStatus(
    input.providerSentAt,
    dependencies.now?.() ?? new Date().toISOString(),
    dependencies.replyWindowMs ?? DEFAULT_REPLY_WINDOW_MS,
  );

  if (replyWindowStatus !== 'open') {
    return jsonResponse(200, {
      success: true,
      data: {
        outcome: input.outcome,
        reason: replyWindowStatus === 'unknown' ? 'reply_window_unknown' : 'reply_window_expired',
        status: 'skipped',
      },
    });
  }

  try {
    await dependencies.replyClient.sendMessage({
      contextMessageId: input.providerMessageId,
      phoneNumberId: input.phoneNumberId,
      recipientPhoneE164: input.recipientPhoneE164,
      text: buildAcknowledgementText(input),
    });

    return jsonResponse(200, {
      success: true,
      data: {
        outcome: input.outcome,
        status: 'sent',
      },
    });
  } catch (error) {
    console.error('whatsapp-reply failed', error);

    return jsonResponse(502, {
      success: false,
      error: {
        code: 'whatsapp_reply_failed',
        message: 'Failed to send the WhatsApp acknowledgement.',
      },
    });
  }
}

export function createMetaWhatsAppReplyClient(options: ReplyClientOptions) {
  if (!options.accessToken || !options.apiBaseUrl) {
    return null;
  }

  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');

  return {
    async sendMessage(input: {
      contextMessageId: string;
      phoneNumberId: string;
      recipientPhoneE164: string;
      text: string;
    }) {
      const response = await options.fetch(
        `${apiBaseUrl}/${encodeURIComponent(input.phoneNumberId)}/messages`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            context: {
              message_id: input.contextMessageId,
            },
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            text: {
              body: input.text,
              preview_url: false,
            },
            to: normalizeRecipientPhone(input.recipientPhoneE164),
            type: 'text',
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`WhatsApp reply send failed with ${response.status}`);
      }

      const payload = await readJsonResponse(response);

      return {
        messageId: payload?.messages?.[0]?.id ?? null,
      };
    },
  };
}

function buildAcknowledgementText(input: WhatsAppReplyDispatchInput) {
  const merchant = normalizeOptionalString(input.merchantRaw) ?? 'your expense';
  const amount = formatAmount(input.amount, input.currency);

  if (input.outcome === 'posted') {
    return `Recorded your expense for ${merchant} (${amount}).`;
  }

  if (input.outcome === 'needs_review') {
    return `Received your expense for ${merchant} (${amount}). It needs review before posting.`;
  }

  return "Received your WhatsApp message, but couldn't post it automatically. Please review it in the app.";
}

function getReplyWindowStatus(
  providerSentAt: string | null,
  nowIso: string,
  replyWindowMs: number,
) {
  const providerSentAtMs = Date.parse(providerSentAt ?? '');
  const nowMs = Date.parse(nowIso);

  if (!Number.isFinite(providerSentAtMs) || !Number.isFinite(nowMs)) {
    return 'unknown' as const;
  }

  if (providerSentAtMs > nowMs) {
    return 'unknown' as const;
  }

  return nowMs - providerSentAtMs <= replyWindowMs ? 'open' as const : 'expired' as const;
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

function normalizeReplyDispatchInput(input: unknown): WhatsAppReplyDispatchInput {
  const record = asRecord(input, 'WhatsApp reply payload must be an object.');

  return {
    amount: normalizeAmount(record.amount),
    currency: 'INR',
    merchantRaw: normalizeOptionalString(record.merchantRaw),
    outcome: normalizeOutcome(record.outcome),
    phoneNumberId: requireString(record.phoneNumberId, 'phoneNumberId'),
    providerMessageId: requireString(record.providerMessageId, 'providerMessageId'),
    providerSentAt: normalizeOptionalString(record.providerSentAt),
    recipientPhoneE164: requireString(record.recipientPhoneE164, 'recipientPhoneE164'),
  };
}

function normalizeOutcome(value: unknown) {
  const normalized = requireString(value, 'outcome');

  if (normalized !== 'failed' && normalized !== 'needs_review' && normalized !== 'posted') {
    throw new Error('Invalid outcome');
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

function formatAmount(amount: number | null, currency: string) {
  if (amount === null) {
    return `${currency} expense`;
  }

  const fixed = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${currency} ${fixed}`;
}

function normalizeRecipientPhone(phoneE164: string) {
  return phoneE164.replace(/^\+/, '');
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
