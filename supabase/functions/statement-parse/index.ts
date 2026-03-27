import { handleStatementParseRequest } from '../_shared/statement-parse.mjs';

const pipelineSecret = Deno.env.get('STATEMENT_PIPELINE_SHARED_SECRET') ?? '';
const aiGatewayApiKey =
  Deno.env.get('VERCEL_AI_GATEWAY_API_KEY')
  ?? Deno.env.get('AI_GATEWAY_API_KEY')
  ?? '';
const aiGatewayUrl = Deno.env.get('STATEMENT_PARSE_GATEWAY_URL') ?? undefined;
const model = Deno.env.get('STATEMENT_PARSE_MODEL') ?? 'openai/gpt-5-mini';
const timeoutMs = Number(Deno.env.get('STATEMENT_PARSE_TIMEOUT_MS') ?? '30000');

Deno.serve((request) =>
  handleStatementParseRequest(request, {
    pipelineSecret,
    aiGatewayApiKey,
    aiGatewayUrl,
    model,
    timeoutMs,
    fetch,
  }));
