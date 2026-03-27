import assert from 'node:assert/strict';
import test from 'node:test';

import { handleStatementParseRequest } from '../../supabase/functions/_shared/statement-parse.mjs';

const parsePayload = {
  statement: {
    householdId: '11111111-1111-4111-8111-111111111111',
    providerFileId: 'drive-file-123',
    providerFileName: 'hdfc-april-2026.pdf',
    parserProfileName: 'hdfc-regalia-gold',
  },
  document: {
    extractedText: '12 Apr 2026 SWIGGY 1234.50\n18 Apr 2026 MYSTERY MERCHANT 399.00',
  },
};

test('handleStatementParseRequest calls the AI gateway and returns normalized rows', async () => {
  const fetchCalls = [];
  const request = new Request('http://localhost/functions/v1/statement-parse', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-statement-pipeline-secret': 'pipeline-secret',
    },
    body: JSON.stringify(parsePayload),
  });

  const response = await handleStatementParseRequest(request, {
    pipelineSecret: 'pipeline-secret',
    aiGatewayApiKey: 'gateway-key',
    model: 'openai/gpt-5-mini',
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  statement: {
                    bankName: 'HDFC Bank',
                    cardName: 'Regalia Gold',
                    billingPeriodStart: '2026-04-01',
                    billingPeriodEnd: '2026-04-30',
                    parseConfidence: 0.86,
                  },
                  rows: [
                    {
                      merchant: 'Swiggy',
                      description: 'Food order',
                      amount: '1234.50',
                      transactionDate: '2026-04-12',
                      confidence: 0.91,
                    },
                    {
                      merchant: 'Mystery Merchant',
                      amount: '399',
                      transactionDate: '2026-04-18',
                      confidence: 0.44,
                    },
                  ],
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const body = await response.json();
  const gatewayRequest = JSON.parse(fetchCalls[0].options.body);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.statement.bankName, 'HDFC Bank');
  assert.equal(body.data.rows.length, 2);
  assert.equal(body.data.summary.parseStatus, 'partial');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options.headers.authorization, 'Bearer gateway-key');
  assert.equal(gatewayRequest.model, 'openai/gpt-5-mini');
});

test('handleStatementParseRequest rejects malformed AI responses', async () => {
  const request = new Request('http://localhost/functions/v1/statement-parse', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-statement-pipeline-secret': 'pipeline-secret',
    },
    body: JSON.stringify(parsePayload),
  });

  const response = await handleStatementParseRequest(request, {
    pipelineSecret: 'pipeline-secret',
    aiGatewayApiKey: 'gateway-key',
    model: 'openai/gpt-5-mini',
    fetch: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: 'not-json',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
  });

  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'statement_parse_failed');
});

test('handleStatementParseRequest treats invalid model metadata as a parser failure', async () => {
  const request = new Request('http://localhost/functions/v1/statement-parse', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-statement-pipeline-secret': 'pipeline-secret',
    },
    body: JSON.stringify(parsePayload),
  });

  const response = await handleStatementParseRequest(request, {
    pipelineSecret: 'pipeline-secret',
    aiGatewayApiKey: 'gateway-key',
    model: 'openai/gpt-5-mini',
    fetch: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  statement: {
                    billingPeriodStart: 'not-a-date',
                  },
                  rows: [
                    {
                      merchant: 'Swiggy',
                      amount: '1234.50',
                      transactionDate: '2026-04-12',
                    },
                  ],
                }),
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
  });

  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'statement_parse_failed');
});

test('handleStatementParseRequest triggers a parser-failure alert after a parse error', async () => {
  const alertCalls = [];
  const request = new Request('http://localhost/functions/v1/statement-parse', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-statement-pipeline-secret': 'pipeline-secret',
    },
    body: JSON.stringify(parsePayload),
  });

  const response = await handleStatementParseRequest(request, {
    alerts: {
      async notifyParserFailure(context) {
        alertCalls.push(context);
      },
    },
    aiGatewayApiKey: 'gateway-key',
    fetch: async () => {
      throw new Error('gateway timeout');
    },
    model: 'openai/gpt-5-mini',
    pipelineSecret: 'pipeline-secret',
  });

  assert.equal(response.status, 502);
  assert.equal(alertCalls.length, 1);
  assert.equal(alertCalls[0].providerFileId, parsePayload.statement.providerFileId);
  assert.equal(alertCalls[0].providerFileName, parsePayload.statement.providerFileName);
  assert.equal(alertCalls[0].householdId, parsePayload.statement.householdId);
});
