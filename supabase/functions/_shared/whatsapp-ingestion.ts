const META_SIGNATURE_HEADER = 'x-hub-signature-256';
const META_WEBHOOK_OBJECT = 'whatsapp_business_account';
const DEFAULT_PARSE_TIMEOUT_MS = 5_000;

type RequestHandlerDependencies = {
  appSecret?: string;
  now?: () => string;
  parseDispatcher?: {
    dispatchMessage: (input: ParseDispatchInput) => Promise<unknown>;
  } | null;
  repository?: WhatsAppRepository;
  scheduleBackgroundTask?: (task: Promise<unknown>) => void;
  verifyToken?: string;
};

type SupabaseLike = {
  from: (table: string) => any;
};

type WhatsAppRepository = {
  findApprovedParticipantByPhone: (phoneE164: string) => Promise<ApprovedParticipant | null>;
  markMessageHandoff: (input: MessageHandoffUpdate) => Promise<void>;
  saveInboundMessage: (record: InboundMessageRecord) => Promise<SavedInboundMessage>;
};

type ApprovedParticipant = {
  householdId: string;
  id: string;
  memberId?: string | null;
  phoneE164: string;
};

type InboundMessageRecord = {
  householdId: string;
  parseMetadata: Record<string, unknown>;
  participantId: string;
  providerMessageId: string;
  providerSentAt: string | null;
  messageType: string;
  normalizedMessageText: string;
  rawMessageText: string;
  rawPayload: Record<string, unknown>;
};

type SavedInboundMessage = {
  householdId: string;
  id: string;
  participantId: string;
  providerMessageId: string;
  status: 'duplicate' | 'inserted';
};

type ParseDispatchInput = {
  householdId: string;
  messageId: string;
  participantId: string;
  providerMessageId: string;
};

type MessageHandoffUpdate = {
  householdId: string;
  messageId: string;
  parseMetadata: Record<string, unknown>;
  parseStatus: 'failed' | 'processing';
};

type NormalizedWebhookPayload = {
  ignoredEventCount: number;
  messages: NormalizedInboundMessage[];
};

type NormalizedInboundMessage = {
  contactName: string | null;
  fromPhoneE164: string;
  messageType: 'text';
  normalizedMessageText: string;
  phoneNumberId: string | null;
  providerMessageId: string;
  providerSentAt: string | null;
  rawMessageText: string;
  rawPayload: Record<string, unknown>;
};

export { META_SIGNATURE_HEADER };

export async function handleWhatsAppWebhookRequest(
  request: Request,
  dependencies: RequestHandlerDependencies,
) {
  if (request.method === 'GET') {
    return handleVerificationRequest(request, dependencies.verifyToken);
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: {
        code: 'method_not_allowed',
        message: 'Use GET for verification or POST for inbound WhatsApp webhooks.',
      },
    });
  }

  if (!dependencies.repository) {
    return jsonResponse(500, {
      success: false,
      error: {
        code: 'whatsapp_webhook_not_configured',
        message: 'WhatsApp webhook persistence is not configured.',
      },
    });
  }

  if (!dependencies.appSecret) {
    return jsonResponse(500, {
      success: false,
      error: {
        code: 'whatsapp_webhook_not_configured',
        message: 'Meta app secret is not configured.',
      },
    });
  }

  const rawBody = await request.text();
  const signature = request.headers.get(META_SIGNATURE_HEADER) ?? '';

  if (!await isValidMetaSignature(rawBody, signature, dependencies.appSecret)) {
    return jsonResponse(401, {
      success: false,
      error: {
        code: 'unauthorized',
        message: 'Missing or invalid Meta webhook signature.',
      },
    });
  }

  let payload: unknown;

  try {
    payload = rawBody.length === 0 ? {} : JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, {
      success: false,
      error: {
        code: 'invalid_whatsapp_webhook',
        message: 'Request body must be valid JSON.',
      },
    });
  }

  let normalizedPayload: NormalizedWebhookPayload;

  try {
    normalizedPayload = normalizeMetaWebhookPayload(payload);
  } catch (error) {
    if (error instanceof WhatsAppWebhookValidationError) {
      return jsonResponse(400, {
        success: false,
        error: {
          code: 'invalid_whatsapp_webhook',
          message: error.message,
        },
      });
    }

    throw error;
  }

  if (normalizedPayload.messages.length === 0) {
    return jsonResponse(202, {
      success: true,
      data: {
        acceptedMessageCount: 0,
        duplicateMessageCount: 0,
        ignoredEventCount: normalizedPayload.ignoredEventCount,
        receivedMessageCount: 0,
      },
    });
  }

  try {
    const participantsByPhone = await loadApprovedParticipants(
      normalizedPayload.messages,
      dependencies.repository,
    );
    let acceptedMessageCount = 0;
    let duplicateMessageCount = 0;

    for (const message of normalizedPayload.messages) {
      const participant = participantsByPhone.get(message.fromPhoneE164);

      if (!participant) {
        throw new Error(`Missing participant for ${message.fromPhoneE164}`);
      }

      const savedMessage = await dependencies.repository.saveInboundMessage({
        householdId: participant.householdId,
        participantId: participant.id,
        providerMessageId: message.providerMessageId,
        providerSentAt: message.providerSentAt,
        messageType: message.messageType,
        normalizedMessageText: message.normalizedMessageText,
        parseMetadata: {
          contactName: message.contactName,
          handoffStatus: 'pending',
          phoneNumberId: message.phoneNumberId,
          receivedAt: dependencies.now?.() ?? new Date().toISOString(),
        },
        rawMessageText: message.rawMessageText,
        rawPayload: message.rawPayload,
      });

      if (savedMessage.status === 'duplicate') {
        duplicateMessageCount += 1;
        continue;
      }

      acceptedMessageCount += 1;
      await dispatchParseHandoff({
        dependencies,
        savedMessage,
      });
    }

    return jsonResponse(200, {
      success: true,
      data: {
        acceptedMessageCount,
        duplicateMessageCount,
        ignoredEventCount: normalizedPayload.ignoredEventCount,
        receivedMessageCount: normalizedPayload.messages.length,
      },
    });
  } catch (error) {
    if (error instanceof ParticipantNotApprovedError) {
      return jsonResponse(403, {
        success: false,
        error: {
          code: 'participant_not_approved',
          message: 'The sending WhatsApp number is not approved for ingestion.',
        },
      });
    }

    console.error('whatsapp-webhook failed', error);

    return jsonResponse(502, {
      success: false,
      error: {
        code: 'whatsapp_ingest_failed',
        message: 'Failed to persist the inbound WhatsApp payload.',
      },
    });
  }
}

export function createSupabaseWhatsAppRepository(supabase: SupabaseLike): WhatsAppRepository {
  return {
    async findApprovedParticipantByPhone(phoneE164) {
      const query = supabase
        .from('whatsapp_participants')
        .select('household_id,id,member_id,phone_e164')
        .eq('phone_e164', phoneE164);
      const { data, error } = await query
        .is('revoked_at', null)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to load approved WhatsApp participant: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      return mapApprovedParticipant(data);
    },

    async saveInboundMessage(record) {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .insert(mapInboundMessageRecord(record))
        .select('id,household_id,participant_id,provider_message_id')
        .maybeSingle();

      if (!error && data) {
        return mapSavedInboundMessage(data, 'inserted');
      }

      if (!isDuplicateError(error)) {
        throw new Error(`Failed to persist inbound WhatsApp message: ${error?.message ?? 'unknown error'}`);
      }

      const duplicateResult = await supabase
        .from('whatsapp_messages')
        .select('id,household_id,participant_id,provider_message_id')
        .eq('household_id', record.householdId)
        .eq('provider_message_id', record.providerMessageId)
        .maybeSingle();

      if (!duplicateResult || duplicateResult.error || !duplicateResult.data) {
        throw new Error(`Failed to load duplicate inbound WhatsApp message: ${duplicateResult?.error?.message ?? 'not found'}`);
      }

      return mapSavedInboundMessage(duplicateResult.data, 'duplicate');
    },

    async markMessageHandoff(input) {
      const currentMessage = await supabase
        .from('whatsapp_messages')
        .select('parse_metadata')
        .eq('id', input.messageId)
        .eq('household_id', input.householdId)
        .maybeSingle();

      if (currentMessage.error) {
        throw new Error(`Failed to load WhatsApp parse metadata: ${currentMessage.error.message}`);
      }

      const { error } = await supabase
        .from('whatsapp_messages')
        .update({
          parse_metadata: {
            ...(currentMessage.data?.parse_metadata ?? {}),
            ...input.parseMetadata,
          },
          parse_status: input.parseStatus,
        })
        .eq('id', input.messageId)
        .eq('household_id', input.householdId)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to update WhatsApp parse handoff status: ${error.message}`);
      }
    },
  };
}

async function loadApprovedParticipants(
  messages: NormalizedInboundMessage[],
  repository: WhatsAppRepository,
) {
  const participantsByPhone = new Map<string, ApprovedParticipant>();

  for (const message of messages) {
    if (participantsByPhone.has(message.fromPhoneE164)) {
      continue;
    }

    const participant = await repository.findApprovedParticipantByPhone(message.fromPhoneE164);

    if (!participant) {
      throw new ParticipantNotApprovedError();
    }

    participantsByPhone.set(message.fromPhoneE164, participant);
  }

  return participantsByPhone;
}

export function createHttpWhatsAppParseDispatcher(options: {
  fetch: typeof fetch;
  serviceRoleKey?: string;
  timeoutMs?: number;
  url?: string;
}) {
  if (!options.url || !options.serviceRoleKey) {
    return null;
  }

  return {
    async dispatchMessage(input: ParseDispatchInput) {
      const response = await options.fetch(options.url as string, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.serviceRoleKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_PARSE_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`WhatsApp parse handoff failed with ${response.status}`);
      }
    },
  };
}

async function handleVerificationRequest(request: Request, verifyToken?: string) {
  const url = new URL(request.url);
  const challenge = url.searchParams.get('hub.challenge');
  const mode = url.searchParams.get('hub.mode');
  const providedToken = url.searchParams.get('hub.verify_token');

  if (
    mode !== 'subscribe'
    || !challenge
    || !verifyToken
    || providedToken !== verifyToken
  ) {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  }

  return new Response(challenge, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

function normalizeMetaWebhookPayload(payload: unknown): NormalizedWebhookPayload {
  const root = asRecord(payload, 'Webhook payload must be an object.');

  if (root.object !== META_WEBHOOK_OBJECT) {
    throw new WhatsAppWebhookValidationError('Webhook payload must target the WhatsApp business account object.');
  }

  if (!Array.isArray(root.entry)) {
    throw new WhatsAppWebhookValidationError('Webhook payload entry must be an array.');
  }

  const messages: NormalizedInboundMessage[] = [];
  let ignoredEventCount = 0;

  for (const entry of root.entry) {
    const normalizedEntry = asRecord(entry, 'Webhook entries must be objects.');
    const changes = normalizedEntry.changes;

    if (!Array.isArray(changes)) {
      throw new WhatsAppWebhookValidationError('Webhook entry changes must be an array.');
    }

    for (const change of changes) {
      const normalizedChange = asRecord(change, 'Webhook changes must be objects.');
      const changeField = normalizeString(normalizedChange.field);
      const value = asOptionalRecord(normalizedChange.value);

      if (changeField !== 'messages' || !value) {
        ignoredEventCount += 1;
        continue;
      }

      if (!Array.isArray(value.messages)) {
        if (Array.isArray(value.statuses)) {
          ignoredEventCount += 1;
          continue;
        }

        throw new WhatsAppWebhookValidationError('Message webhook changes must include a messages array.');
      }

      if (value.messages.length === 0) {
        ignoredEventCount += 1;
        continue;
      }

      const contacts = Array.isArray(value.contacts)
        ? value.contacts.filter((contact) => isRecord(contact))
        : [];

      for (const message of value.messages) {
        messages.push(
          normalizeInboundMessage(message, {
            contacts,
            metadata: asOptionalRecord(value.metadata),
          }),
        );
      }
    }
  }

  return {
    ignoredEventCount,
    messages,
  };
}

function normalizeInboundMessage(
  message: unknown,
  context: {
    contacts: Record<string, unknown>[];
    metadata: Record<string, unknown> | null;
  },
): NormalizedInboundMessage {
  const normalizedMessage = asRecord(message, 'Inbound WhatsApp messages must be objects.');
  const messageType = normalizeString(normalizedMessage.type);

  if (messageType !== 'text') {
    throw new WhatsAppWebhookValidationError('Only inbound text WhatsApp messages are supported.');
  }

  const rawMessageText = normalizeString(asOptionalRecord(normalizedMessage.text)?.body);

  if (!rawMessageText) {
    throw new WhatsAppWebhookValidationError('Inbound text WhatsApp messages require a text body.');
  }

  const providerMessageId = normalizeString(normalizedMessage.id);

  if (!providerMessageId) {
    throw new WhatsAppWebhookValidationError('Inbound WhatsApp messages require a provider message id.');
  }

  const fromPhoneE164 = normalizePhone(normalizedMessage.from);
  const providerSentAt = normalizeTimestamp(normalizedMessage.timestamp);
  const contact = context.contacts.find((candidate) =>
    normalizeString(candidate.wa_id) === fromPhoneE164.slice(1)
  );

  return {
    contactName: normalizeString(asOptionalRecord(contact?.profile)?.name) || null,
    fromPhoneE164,
    messageType: 'text',
    normalizedMessageText: normalizeMessageText(rawMessageText),
    phoneNumberId: normalizeString(context.metadata?.phone_number_id) || null,
    providerMessageId,
    providerSentAt,
    rawMessageText,
    rawPayload: {
      contact: contact ?? null,
      message: normalizedMessage,
      metadata: context.metadata ?? null,
    },
  };
}

async function isValidMetaSignature(body: string, signatureHeader: string, appSecret: string) {
  const expectedPrefix = 'sha256=';

  if (!signatureHeader.startsWith(expectedPrefix)) {
    return false;
  }

  const providedSignature = signatureHeader.slice(expectedPrefix.length).trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/i.test(providedSignature)) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    {
      hash: 'SHA-256',
      name: 'HMAC',
    },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body),
  );
  const expectedSignature = encodeHex(new Uint8Array(digest));

  return timingSafeEqualHex(expectedSignature, providedSignature);
}

async function dispatchParseHandoff(options: {
  dependencies: RequestHandlerDependencies;
  savedMessage: SavedInboundMessage;
}) {
  const dispatch = options.dependencies.parseDispatcher?.dispatchMessage;

  if (typeof dispatch !== 'function') {
    return;
  }

  const job = (async () => {
    try {
      await dispatch({
        householdId: options.savedMessage.householdId,
        messageId: options.savedMessage.id,
        participantId: options.savedMessage.participantId,
        providerMessageId: options.savedMessage.providerMessageId,
      });
      await recordHandoffStatus(options.dependencies.repository, {
        householdId: options.savedMessage.householdId,
        messageId: options.savedMessage.id,
        parseMetadata: {
          handoffDispatchedAt: options.dependencies.now?.() ?? new Date().toISOString(),
          handoffStatus: 'dispatched',
        },
        parseStatus: 'processing',
      });
    } catch (error) {
      console.error('whatsapp parse handoff failed', error);

      await recordHandoffStatus(options.dependencies.repository, {
        householdId: options.savedMessage.householdId,
        messageId: options.savedMessage.id,
        parseMetadata: {
          handoffError: 'parse_dispatch_failed',
          handoffFailedAt: options.dependencies.now?.() ?? new Date().toISOString(),
          handoffStatus: 'failed',
        },
        parseStatus: 'failed',
      });
    }
  })();

  if (typeof options.dependencies.scheduleBackgroundTask === 'function') {
    options.dependencies.scheduleBackgroundTask(job);
    return;
  }

  await job;
}

async function recordHandoffStatus(
  repository: WhatsAppRepository | undefined,
  input: MessageHandoffUpdate,
) {
  if (!repository) {
    return;
  }

  try {
    await repository.markMessageHandoff(input);
  } catch (error) {
    console.error('whatsapp handoff status update failed', error);
  }
}

function mapApprovedParticipant(row: Record<string, unknown>): ApprovedParticipant {
  return {
    householdId: String(row.household_id),
    id: String(row.id),
    memberId: row.member_id ? String(row.member_id) : null,
    phoneE164: String(row.phone_e164),
  };
}

function mapInboundMessageRecord(record: InboundMessageRecord) {
  return {
    household_id: record.householdId,
    parse_metadata: record.parseMetadata,
    participant_id: record.participantId,
    provider_message_id: record.providerMessageId,
    provider_sent_at: record.providerSentAt,
    message_type: record.messageType,
    normalized_message_text: record.normalizedMessageText,
    raw_message_text: record.rawMessageText,
    raw_payload: record.rawPayload,
  };
}

function mapSavedInboundMessage(
  row: Record<string, unknown>,
  status: 'duplicate' | 'inserted',
): SavedInboundMessage {
  return {
    householdId: String(row.household_id),
    id: String(row.id),
    participantId: String(row.participant_id),
    providerMessageId: String(row.provider_message_id),
    status,
  };
}

function normalizePhone(value: unknown) {
  const trimmed = normalizeString(value);
  const digits = trimmed.replace(/[^0-9]/g, '');
  const candidate = digits ? `+${digits}` : '';

  if (!/^\+[1-9][0-9]{6,14}$/.test(candidate)) {
    throw new WhatsAppWebhookValidationError('Inbound WhatsApp sender numbers must be valid E.164 values.');
  }

  return candidate;
}

function normalizeTimestamp(value: unknown) {
  const trimmed = normalizeString(value);

  if (!trimmed) {
    return null;
  }

  const timestamp = Number(trimmed);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new WhatsAppWebhookValidationError('Inbound WhatsApp timestamps must be valid Unix epoch seconds.');
  }

  return new Date(timestamp * 1000).toISOString();
}

function normalizeMessageText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function timingSafeEqualHex(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function encodeHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function asRecord(value: unknown, message: string) {
  if (!isRecord(value)) {
    throw new WhatsAppWebhookValidationError(message);
  }

  return value;
}

function asOptionalRecord(value: unknown) {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isDuplicateError(error: { code?: string; message: string } | null) {
  return Boolean(error && (error.code === '23505' || /duplicate/i.test(error.message)));
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status });
}

class WhatsAppWebhookValidationError extends Error {}
class ParticipantNotApprovedError extends Error {}
