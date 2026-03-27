import {
  StatementValidationError,
  normalizeParsedStatementPayload,
} from './statement-normalization.mjs';
import { PIPELINE_SECRET_HEADER } from './statement-ingest.mjs';

const DEFAULT_AI_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-5-mini';

export async function handleStatementParseRequest(request, dependencies) {
  let alertContext = null;

  if (request.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: {
        code: 'method_not_allowed',
        message: 'Use POST for statement parsing.',
      },
    });
  }

  if (!isAuthorizedRequest(request, dependencies.pipelineSecret)) {
    return jsonResponse(401, {
      success: false,
      error: {
        code: 'unauthorized',
        message: 'Missing or invalid statement pipeline secret.',
      },
    });
  }

  if (!dependencies.aiGatewayApiKey) {
    return jsonResponse(500, {
      success: false,
      error: {
        code: 'statement_parse_not_configured',
        message: 'AI gateway credentials are not configured.',
      },
    });
  }

  let input;

  try {
    const payload = await request.json();
    input = normalizeStatementParseInput(payload);
    alertContext = {
      householdId: input.statement.householdId ?? null,
      parserProfileName: input.statement.parserProfileName ?? null,
      providerFileId: input.statement.providerFileId ?? null,
      providerFileName: input.statement.providerFileName ?? null,
    };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof StatementValidationError) {
      return jsonResponse(400, {
        success: false,
        error: {
          code: 'invalid_statement_parse_request',
          message: error.message,
        },
      });
    }

    throw error;
  }

  try {
    const gatewayResponse = await callAiGateway(input, dependencies);
    const extracted = extractParsedContent(gatewayResponse);
    const normalizedPayload = normalizeParsedStatementPayload({
      statement: {
        ...input.statement,
        ...(extracted.statement ?? {}),
      },
      rows: extracted.rows,
    });

    return jsonResponse(200, {
      success: true,
      data: normalizedPayload,
    });
  } catch (error) {
    console.error('statement-parse failed', error);
    await notifyAlert(dependencies.alerts?.notifyParserFailure, alertContext, dependencies.scheduleBackgroundTask);

    return jsonResponse(502, {
      success: false,
      error: {
        code: 'statement_parse_failed',
        message: 'Failed to parse the statement text.',
      },
    });
  }
}

export function buildGatewayRequestBody(input, options = {}) {
  return {
    model: options.model ?? DEFAULT_MODEL,
    temperature: 0,
    response_format: {
      type: 'json_object',
    },
    messages: [
      {
        role: 'system',
        content: [
          'Extract expense transactions from the provided credit card statement text.',
          'Return strict JSON with shape {"statement": {...}, "rows": [...]} only.',
          'Each row must describe one expense transaction.',
          'Do not include payments, reversals, refunds, credits, or summary lines as expenses.',
          'Use YYYY-MM-DD dates and 0-1 confidence values.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          parserProfileName: input.statement.parserProfileName ?? null,
          providerFileName: input.statement.providerFileName,
          bankName: input.statement.bankName ?? null,
          cardName: input.statement.cardName ?? null,
          extractedText: input.document.extractedText,
        }),
      },
    ],
  };
}

function normalizeStatementParseInput(payload) {
  const statement = payload?.statement ?? {};
  const document = payload?.document ?? {};

  if (typeof document !== 'object' || Array.isArray(document)) {
    throw new StatementValidationError('document must be an object');
  }

  const extractedText = String(document.extractedText ?? '').trim();

  if (extractedText.length === 0) {
    throw new StatementValidationError('document.extractedText is required');
  }

  return {
    statement,
    document: {
      extractedText,
    },
  };
}

async function callAiGateway(input, dependencies) {
  const requestBody = buildGatewayRequestBody(input, {
    model: dependencies.model ?? DEFAULT_MODEL,
  });

  const response = await dependencies.fetch(
    dependencies.aiGatewayUrl ?? DEFAULT_AI_GATEWAY_URL,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${dependencies.aiGatewayApiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(dependencies.timeoutMs ?? 30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`AI gateway returned ${response.status}`);
  }

  return response.json();
}

function extractParsedContent(gatewayResponse) {
  const content = gatewayResponse?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((item) => item?.text ?? '').join('\n')
    : content;

  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('AI gateway returned an empty response');
  }

  try {
    const parsed = JSON.parse(extractJsonBlock(text));

    if (!Array.isArray(parsed.rows)) {
      throw new Error('Parsed rows were missing');
    }

    return parsed;
  } catch (error) {
    throw new Error(`AI gateway returned malformed JSON: ${error.message}`);
  }
}

function extractJsonBlock(content) {
  const trimmed = content.trim();

  if (trimmed.startsWith('{')) {
    return trimmed;
  }

  const fenceMatch = trimmed.match(/```json\s*([\s\S]+?)```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  throw new Error('No JSON object found in AI response');
}

function isAuthorizedRequest(request, pipelineSecret) {
  const providedSecret = request.headers.get(PIPELINE_SECRET_HEADER);
  return Boolean(pipelineSecret) && providedSecret === pipelineSecret;
}

function jsonResponse(status, body) {
  return Response.json(body, { status });
}

async function notifyAlert(notify, context, scheduleBackgroundTask) {
  if (typeof notify !== 'function' || !context?.householdId || !context?.providerFileName) {
    return;
  }

  const job = notify(context).catch((error) => {
    console.error('phase-1 alert delivery failed', error);
  });

  if (typeof scheduleBackgroundTask === 'function') {
    scheduleBackgroundTask(job);
    return;
  }

  try {
    await job;
  } catch {
    // The job already logs its own failures.
  }
}
