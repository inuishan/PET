import { parseWhatsAppExpenseMessage } from './whatsapp-parser-core.ts';
import type {
  ParseHandoff,
  ParsedWhatsAppExpense,
  WhatsAppParseRepository,
} from './whatsapp-types.ts';

const DEFAULT_INGEST_TIMEOUT_MS = 5_000;

type HandleParseDependencies = {
  ingestDispatcher?: {
    dispatchMessage: (input: ParsedWhatsAppExpense) => Promise<unknown>;
  } | null;
  internalAuthToken?: string;
  repository?: WhatsAppParseRepository;
};

type HttpDispatcherOptions = {
  authToken?: string;
  fetch: typeof fetch;
  timeoutMs?: number;
  url?: string;
};

export { parseWhatsAppExpenseMessage };

export async function handleWhatsAppParseRequest(
  request: Request,
  dependencies: HandleParseDependencies,
) {
  if (request.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: {
        code: 'method_not_allowed',
        message: 'Use POST for WhatsApp parse handoff.',
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
        code: 'whatsapp_parse_not_configured',
        message: 'WhatsApp parse dependencies are not configured.',
      },
    });
  }

  let handoff: ParseHandoff;

  try {
    handoff = normalizeParseHandoff(await request.json());
  } catch (error) {
    return jsonResponse(400, {
      success: false,
      error: {
        code: 'invalid_whatsapp_parse_request',
        message: error instanceof Error ? error.message : 'Request body must be valid JSON.',
      },
    });
  }

  try {
    const message = await dependencies.repository.loadMessageForParsing({
      householdId: handoff.householdId,
      messageId: handoff.messageId,
      participantId: handoff.participantId,
    });

    if (!message) {
      return jsonResponse(404, {
        success: false,
        error: {
          code: 'whatsapp_message_not_found',
          message: 'The referenced WhatsApp message could not be found.',
        },
      });
    }

    const householdMembers = await dependencies.repository.listHouseholdMembers(handoff.householdId);
    const parsedExpense = parseWhatsAppExpenseMessage({
      ...message,
      householdMembers,
    });
    const dispatchPayload = {
      ...parsedExpense,
      existingParseMetadata: message.parseMetadata ?? {},
    };

    if (dependencies.ingestDispatcher) {
      await dependencies.ingestDispatcher.dispatchMessage(dispatchPayload);
    }

    return jsonResponse(200, {
      success: true,
      data: {
        messageId: parsedExpense.messageId,
        parseStatus: parsedExpense.parseStatus,
      },
    });
  } catch (error) {
    console.error('whatsapp-parse failed', error);

    return jsonResponse(502, {
      success: false,
      error: {
        code: 'whatsapp_parse_failed',
        message: 'Failed to parse the WhatsApp message.',
      },
    });
  }
}

export function createHttpWhatsAppIngestDispatcher(options: HttpDispatcherOptions) {
  if (!options.url || !options.authToken) {
    return null;
  }

  return {
    async dispatchMessage(input: ParsedWhatsAppExpense) {
      const response = await options.fetch(options.url as string, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.authToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_INGEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`WhatsApp ingest handoff failed with ${response.status}`);
      }
    },
  };
}

export function createSupabaseWhatsAppParseRepository(supabase: {
  from: (table: string) => any;
}): WhatsAppParseRepository {
  return {
    async listHouseholdMembers(householdId) {
      const { data, error } = await supabase
        .from('household_members')
        .select('id,display_name')
        .eq('household_id', householdId);

      if (error) {
        throw new Error(`Failed to load household members: ${error.message}`);
      }

      return (data ?? []).map((member: any) => ({
        displayName: member.display_name,
        id: member.id,
      }));
    },

    async loadMessageForParsing(input) {
      const messageResult = await supabase
        .from('whatsapp_messages')
        .select(
          'id,household_id,participant_id,provider_message_id,provider_sent_at,normalized_message_text,parse_metadata',
        )
        .eq('id', input.messageId)
        .eq('household_id', input.householdId)
        .eq('participant_id', input.participantId)
        .maybeSingle();

      if (messageResult.error) {
        throw new Error(`Failed to load WhatsApp message: ${messageResult.error.message}`);
      }

      if (!messageResult.data) {
        return null;
      }

      const participantResult = await supabase
        .from('whatsapp_participants')
        .select('id,member_id,display_name,phone_e164')
        .eq('id', input.participantId)
        .eq('household_id', input.householdId)
        .maybeSingle();

      if (participantResult.error) {
        throw new Error(`Failed to load WhatsApp participant: ${participantResult.error.message}`);
      }

      if (!participantResult.data) {
        return null;
      }

      return {
        householdId: messageResult.data.household_id,
        id: messageResult.data.id,
        normalizedMessageText: messageResult.data.normalized_message_text,
        parseMetadata: messageResult.data.parse_metadata ?? {},
        participant: {
          displayName: participantResult.data.display_name,
          id: participantResult.data.id,
          memberId: participantResult.data.member_id,
          phoneE164: participantResult.data.phone_e164,
        },
        providerMessageId: messageResult.data.provider_message_id,
        providerSentAt: messageResult.data.provider_sent_at,
      };
    },
  };
}

function normalizeParseHandoff(input: unknown): ParseHandoff {
  const record = asRecord(input, 'WhatsApp parse handoff must be an object.');

  return {
    householdId: requireString(record.householdId, 'householdId'),
    messageId: requireString(record.messageId, 'messageId'),
    participantId: requireString(record.participantId, 'participantId'),
    providerMessageId: requireString(record.providerMessageId, 'providerMessageId'),
  };
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
