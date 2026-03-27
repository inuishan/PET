#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { resolveStatementRoute } from '../../infra/n8n/lib/statement-routing.mjs';
import { handleStatementIngestRequest } from '../../supabase/functions/_shared/statement-ingest.mjs';
import { handleStatementParseRequest } from '../../supabase/functions/_shared/statement-parse.mjs';
import {
  buildPhase1RuntimeValidationReport,
  loadEnvFile,
} from './runtime-config.mjs';

const DEFAULT_EXTRACTED_TEXT = [
  '12 Apr 2026 SWIGGY 1234.50',
  '18 Apr 2026 GOOGLE ONE 879.00',
].join('\n');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArguments(process.argv.slice(2));
  const report = buildPhase1RuntimeValidationReport({
    mobileEnv: loadEnvFile(options.mobileEnvPath),
    n8nEnv: loadEnvFile(options.n8nEnvPath),
    supabaseEnv: loadEnvFile(options.supabaseEnvPath),
  });

  if (report.errors.length > 0) {
    console.error('Phase 1 smoke test cannot start because the runtime configuration is invalid.');

    for (const error of report.errors) {
      console.error(`- ${error}`);
    }

    process.exit(1);
  }

  const result = options.mode === 'live'
    ? await runLivePhase1SmokeTest(report.config, options)
    : await runMockPhase1SmokeTest(report.config, options);

  console.log(JSON.stringify(result, null, 2));
}

export async function runMockPhase1SmokeTest(config, options = {}) {
  const providerFileName = options.providerFileName ?? 'HDFC Regalia Gold Apr 2026.pdf';
  const providerFileId = options.providerFileId ?? 'drive-file-smoke-001';
  const route = resolveStatementRoute(providerFileName, {
    defaultHouseholdId: config.n8n.statementHouseholdId,
    rules: config.n8n.routingRules,
  });
  const statement = {
    bankName: route.bankName,
    cardName: route.cardName,
    householdId: route.householdId,
    parserProfileName: route.parserProfileName,
    providerFileId,
    providerFileName,
  };
  const parseResponse = await handleStatementParseRequest(
    new Request(config.n8n.statementParseUrl, {
      body: JSON.stringify({
        document: {
          extractedText: DEFAULT_EXTRACTED_TEXT,
        },
        statement,
      }),
      headers: {
        'content-type': 'application/json',
        'x-statement-pipeline-secret': config.supabase.statementPipelineSharedSecret,
      },
      method: 'POST',
    }),
    {
      aiGatewayApiKey: config.supabase.aiGatewayApiKey,
      fetch: async () =>
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rows: [
                    {
                      amount: '1234.50',
                      confidence: 0.95,
                      description: 'Food order',
                      merchant: 'Swiggy',
                      transactionDate: '2026-04-12',
                    },
                    {
                      amount: '879.00',
                      confidence: 0.44,
                      merchant: 'Google One',
                      reviewReason: 'Subscription classification is uncertain.',
                      transactionDate: '2026-04-18',
                    },
                  ],
                  statement: {
                    bankName: route.bankName,
                    billingPeriodEnd: '2026-04-30',
                    billingPeriodStart: '2026-04-01',
                    cardName: route.cardName,
                    parseConfidence: 0.695,
                  },
                }),
              },
            },
          ],
        }),
      model: config.supabase.statementParseModel,
      pipelineSecret: config.supabase.statementPipelineSharedSecret,
    },
  );
  const parseBody = await parseResponse.json();

  assert.equal(parseResponse.status, 200);
  assert.equal(parseBody.success, true);

  const persisted = {
    statementUpload: null,
    transactions: [],
  };
  const ingestPayload = {
    ...parseBody.data,
    statement: {
      ...parseBody.data.statement,
      statementPasswordKey: route.statementPasswordKey,
    },
  };
  const ingestResponse = await handleStatementIngestRequest(
    new Request(config.n8n.statementIngestUrl, {
      body: JSON.stringify(ingestPayload),
      headers: {
        'content-type': 'application/json',
        'x-statement-pipeline-secret': config.supabase.statementPipelineSharedSecret,
      },
      method: 'POST',
    }),
    {
      repository: {
        async ingestStatement(statementUpload, transactions) {
          persisted.statementUpload = statementUpload;
          persisted.transactions = transactions;
          return {
            id: 'smoke-upload-001',
          };
        },
      },
      webhookSecret: config.supabase.statementPipelineSharedSecret,
    },
  );
  const ingestBody = await ingestResponse.json();

  assert.equal(ingestResponse.status, 200);
  assert.equal(ingestBody.success, true);

  return {
    ingest: ingestBody,
    parse: parseBody,
    persisted: {
      reviewCount: persisted.transactions.filter((transaction) => transaction.needsReview).length,
      statementUpload: persisted.statementUpload,
      transactionCount: persisted.transactions.length,
    },
    route,
  };
}

export async function runLivePhase1SmokeTest(config, options = {}) {
  const providerFileName = options.providerFileName ?? 'HDFC Regalia Gold Apr 2026.pdf';
  const providerFileId = options.providerFileId ?? `live-smoke-${Date.now()}`;
  const route = resolveStatementRoute(providerFileName, {
    defaultHouseholdId: config.n8n.statementHouseholdId,
    rules: config.n8n.routingRules,
  });
  const extractedText = await resolveLiveExtractedText(config.n8n.pdfTextExtractCommand, route, options);
  const statement = {
    bankName: route.bankName,
    cardName: route.cardName,
    householdId: route.householdId,
    parserProfileName: route.parserProfileName,
    providerFileId,
    providerFileName,
  };
  const parseResponse = await fetch(config.n8n.statementParseUrl, {
    body: JSON.stringify({
      document: {
        extractedText,
      },
      statement,
    }),
    headers: {
      'content-type': 'application/json',
      'x-statement-pipeline-secret': config.supabase.statementPipelineSharedSecret,
    },
    method: 'POST',
  });
  const parseBody = await parseJsonResponse(parseResponse, 'statement-parse');

  if (!parseResponse.ok || parseBody.success !== true) {
    throw new Error(`Live statement-parse failed. ${JSON.stringify(parseBody)}`);
  }

  const ingestPayload = {
    ...parseBody.data,
    statement: {
      ...parseBody.data.statement,
      statementPasswordKey: route.statementPasswordKey,
    },
  };
  const ingestResponse = await fetch(config.n8n.statementIngestUrl, {
    body: JSON.stringify(ingestPayload),
    headers: {
      'content-type': 'application/json',
      'x-statement-pipeline-secret': config.supabase.statementPipelineSharedSecret,
    },
    method: 'POST',
  });
  const ingestBody = await parseJsonResponse(ingestResponse, 'statement-ingest');

  if (!ingestResponse.ok || ingestBody.success !== true) {
    throw new Error(`Live statement-ingest failed. ${JSON.stringify(ingestBody)}`);
  }

  return {
    ingest: ingestBody,
    parse: parseBody,
    route,
  };
}

function parseArguments(argv) {
  const options = {
    extractedTextFilePath: null,
    mobileEnvPath: 'apps/mobile/.env.phase1.example',
    mode: 'mock',
    n8nEnvPath: 'infra/n8n/.env.phase1.example',
    pdfPath: null,
    providerFileId: 'drive-file-smoke-001',
    providerFileName: 'HDFC Regalia Gold Apr 2026.pdf',
    supabaseEnvPath: 'supabase/.env.functions.phase1.example',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

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

    if (argument === '--pdf') {
      options.pdfPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--extracted-text-file') {
      options.extractedTextFilePath = nextValue;
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

async function resolveLiveExtractedText(pdfTextExtractCommand, route, options) {
  if (options.extractedTextFilePath) {
    return readFile(options.extractedTextFilePath, 'utf8');
  }

  if (options.pdfPath) {
    const pdfBuffer = await readFile(options.pdfPath);
    return extractTextFromPdf(pdfTextExtractCommand, route.statementPasswordKey, pdfBuffer);
  }

  throw new Error('Live mode requires either --pdf or --extracted-text-file.');
}

async function extractTextFromPdf(command, statementPasswordKey, pdfBuffer) {
  const shell = process.env.SHELL || '/bin/sh';
  const passwordArgument = statementPasswordKey
    ? ` --password-key ${escapeShellArgument(statementPasswordKey)}`
    : '';
  const child = spawn(shell, ['-lc', `${command}${passwordArgument}`], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return await new Promise((resolve, reject) => {
    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks).toString('utf8'));
        return;
      }

      reject(
        new Error(
          Buffer.concat(stderrChunks).toString('utf8').trim()
            || `PDF extraction command exited with code ${code}.`,
        ),
      );
    });

    child.stdin.end(pdfBuffer);
  });
}

function escapeShellArgument(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function parseJsonResponse(response, name) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${name} returned a non-JSON response. ${error.message}`);
  }
}
