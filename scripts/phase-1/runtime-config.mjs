import fs from 'node:fs';
import path from 'node:path';

import { toPasswordEnvVarName } from '../../infra/n8n/lib/pdf-text-extract.mjs';
import { parseStatementRoutingRules } from '../../infra/n8n/lib/statement-routing.mjs';

const SUPPORTED_ALERT_CHANNELS = new Set(['push']);

export function loadEnvFile(filePath) {
  const absolutePath = path.resolve(filePath);
  return parseEnvFile(fs.readFileSync(absolutePath, 'utf8'));
}

export function parseEnvFile(contents) {
  const environment = {};

  for (const line of String(contents).split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();

    environment[key] = stripWrappingQuotes(rawValue);
  }

  return environment;
}

export function buildPhase1RuntimeValidationReport(input) {
  const errors = [];
  const warnings = [];

  const config = {
    mobile: parseMobileRuntimeEnv(input?.mobileEnv ?? {}, errors),
    n8n: parseN8nRuntimeEnv(input?.n8nEnv ?? {}, errors),
    supabase: parseSupabaseFunctionRuntimeEnv(input?.supabaseEnv ?? {}, errors),
  };

  validateCrossSystemRuntimeConfig(config, errors, warnings);

  return {
    config,
    errors,
    warnings,
  };
}

function parseMobileRuntimeEnv(environment, errors) {
  return compactRecord({
    phase1AlertPushTopicPrefix: readRequiredString(
      environment,
      'EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX',
      errors,
      'Mobile',
    ),
    supabaseAnonKey: readRequiredString(
      environment,
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      errors,
      'Mobile',
    ),
    supabaseUrl: readUrl(environment, 'EXPO_PUBLIC_SUPABASE_URL', errors, 'Mobile'),
  });
}

function parseN8nRuntimeEnv(environment, errors) {
  const routingRulesRaw = readRequiredString(
    environment,
    'STATEMENT_FILE_ROUTING_JSON',
    errors,
    'n8n',
  );
  let routingRules = [];

  if (routingRulesRaw) {
    try {
      routingRules = parseStatementRoutingRules(routingRulesRaw);
    } catch (error) {
      errors.push(error.message);
    }
  }

  const passwordEnvironmentVariables = routingRules
    .filter((rule) => rule.statementPasswordKey)
    .map((rule) => ({
      envVarName: toPasswordEnvVarName(rule.statementPasswordKey),
      statementPasswordKey: rule.statementPasswordKey,
    }));

  for (const passwordEnvironmentVariable of passwordEnvironmentVariables) {
    readRequiredString(
      environment,
      passwordEnvironmentVariable.envVarName,
      errors,
      'n8n',
      `required for statementPasswordKey "${passwordEnvironmentVariable.statementPasswordKey}"`,
    );
  }

  return compactRecord({
    driveFolderId: readRequiredString(environment, 'DRIVE_FOLDER_ID', errors, 'n8n'),
    passwordEnvironmentVariables,
    pdfTextExtractCommand: readRequiredString(
      environment,
      'PDF_TEXT_EXTRACT_COMMAND',
      errors,
      'n8n',
    ),
    statementHouseholdId: readUuid(
      environment,
      'STATEMENT_HOUSEHOLD_ID',
      errors,
      'n8n',
    ),
    statementIngestUrl: readUrl(environment, 'STATEMENT_INGEST_URL', errors, 'n8n'),
    statementParseUrl: readUrl(environment, 'STATEMENT_PARSE_URL', errors, 'n8n'),
    statementPipelineSharedSecret: readRequiredString(
      environment,
      'STATEMENT_PIPELINE_SHARED_SECRET',
      errors,
      'n8n',
    ),
    routingRules,
  });
}

function parseSupabaseFunctionRuntimeEnv(environment, errors) {
  const alertChannels = parseAlertChannels(environment.PHASE1_ALERT_CHANNELS ?? 'push');
  const fcmServiceAccountJson = readRequiredString(
    environment,
    'PHASE1_ALERT_FCM_SERVICE_ACCOUNT_JSON',
    errors,
    'Supabase functions',
  );

  if (fcmServiceAccountJson) {
    try {
      const parsedServiceAccount = JSON.parse(fcmServiceAccountJson);

      if (!parsedServiceAccount.client_email || !parsedServiceAccount.private_key) {
        errors.push(
          'Supabase functions: PHASE1_ALERT_FCM_SERVICE_ACCOUNT_JSON must include client_email and private_key.',
        );
      }
    } catch (error) {
      errors.push(
        `Supabase functions: PHASE1_ALERT_FCM_SERVICE_ACCOUNT_JSON must be valid JSON. ${error.message}`,
      );
    }
  }

  return compactRecord({
    aiGatewayApiKey:
      readOptionalString(environment.VERCEL_AI_GATEWAY_API_KEY)
      ?? readRequiredString(environment, 'AI_GATEWAY_API_KEY', errors, 'Supabase functions'),
    alertChannels,
    alertFcmProjectId: readRequiredString(
      environment,
      'PHASE1_ALERT_FCM_PROJECT_ID',
      errors,
      'Supabase functions',
    ),
    alertPushTopicPrefix:
      readOptionalString(environment.PHASE1_ALERT_PUSH_TOPIC_PREFIX)
      ?? 'phase1-user',
    alertTimeoutMs: readPositiveInteger(
      environment,
      'PHASE1_ALERT_TIMEOUT_MS',
      errors,
      'Supabase functions',
      5_000,
    ),
    statementParseGatewayUrl: readOptionalUrl(environment.STATEMENT_PARSE_GATEWAY_URL, errors),
    statementParseModel:
      readOptionalString(environment.STATEMENT_PARSE_MODEL)
      ?? 'openai/gpt-5-mini',
    statementParseTimeoutMs: readPositiveInteger(
      environment,
      'STATEMENT_PARSE_TIMEOUT_MS',
      errors,
      'Supabase functions',
      30_000,
    ),
    statementPipelineSharedSecret: readRequiredString(
      environment,
      'STATEMENT_PIPELINE_SHARED_SECRET',
      errors,
      'Supabase functions',
    ),
    supabaseServiceRoleKey: readRequiredString(
      environment,
      'SUPABASE_SERVICE_ROLE_KEY',
      errors,
      'Supabase functions',
    ),
    supabaseUrl: readUrl(environment, 'SUPABASE_URL', errors, 'Supabase functions'),
  });
}

function validateCrossSystemRuntimeConfig(config, errors, warnings) {
  if (
    config.mobile.supabaseUrl
    && config.supabase.supabaseUrl
    && normalizeUrlForComparison(config.mobile.supabaseUrl)
      !== normalizeUrlForComparison(config.supabase.supabaseUrl)
  ) {
    errors.push('Mobile EXPO_PUBLIC_SUPABASE_URL must match Supabase SUPABASE_URL.');
  }

  if (
    config.mobile.phase1AlertPushTopicPrefix
    && config.supabase.alertPushTopicPrefix
    && config.mobile.phase1AlertPushTopicPrefix !== config.supabase.alertPushTopicPrefix
  ) {
    errors.push(
      'Mobile EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX must match Supabase PHASE1_ALERT_PUSH_TOPIC_PREFIX.',
    );
  }

  if (
    config.n8n.statementPipelineSharedSecret
    && config.supabase.statementPipelineSharedSecret
    && config.n8n.statementPipelineSharedSecret !== config.supabase.statementPipelineSharedSecret
  ) {
    errors.push('n8n and Supabase functions must use the same STATEMENT_PIPELINE_SHARED_SECRET.');
  }

  validateFunctionUrl(
    config.n8n.statementParseUrl,
    config.supabase.supabaseUrl,
    '/functions/v1/statement-parse',
    'STATEMENT_PARSE_URL',
    errors,
  );
  validateFunctionUrl(
    config.n8n.statementIngestUrl,
    config.supabase.supabaseUrl,
    '/functions/v1/statement-ingest',
    'STATEMENT_INGEST_URL',
    errors,
  );

  if (
    config.supabase.alertChannels.includes('push')
    && config.supabase.alertPushTopicPrefix === 'phase1-user'
  ) {
    warnings.push(
      'Push delivery is configured with the default topic prefix "phase1-user". Keep it aligned with the mobile subscription logic on the target machine.',
    );
  }
}

function normalizeUrlForComparison(value) {
  if (!(value instanceof URL)) {
    return null;
  }

  return `${value.origin}${value.pathname.replace(/\/+$/, '')}`;
}

function validateFunctionUrl(runtimeUrl, supabaseUrl, expectedPathSuffix, fieldName, errors) {
  if (!(runtimeUrl instanceof URL)) {
    return;
  }

  if (!runtimeUrl.pathname.endsWith(expectedPathSuffix)) {
    errors.push(`${fieldName} must end with ${expectedPathSuffix}.`);
  }

  if (supabaseUrl instanceof URL && runtimeUrl.origin !== supabaseUrl.origin) {
    errors.push(`${fieldName} must point at the same Supabase project as SUPABASE_URL.`);
  }
}

function parseAlertChannels(value) {
  const channels = String(value ?? '')
    .split(',')
    .map((channel) => channel.trim())
    .filter((channel) => SUPPORTED_ALERT_CHANNELS.has(channel));

  return channels.length > 0 ? channels : ['push'];
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\n/g, '\n');
  }

  return value;
}

function compactRecord(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

function readOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function readRequiredString(environment, key, errors, scope, detail = null) {
  const normalizedValue = readOptionalString(environment[key]);

  if (!normalizedValue) {
    const detailSuffix = detail ? ` ${detail}.` : '.';
    errors.push(`${scope}: ${key} is required${detailSuffix}`);
    return null;
  }

  return normalizedValue;
}

function readUrl(environment, key, errors, scope) {
  const normalizedValue = readRequiredString(environment, key, errors, scope);
  return normalizedValue ? readOptionalUrl(normalizedValue, errors, `${scope}: ${key}`) : null;
}

function readOptionalUrl(value, errors, label = 'URL') {
  const normalizedValue = readOptionalString(value);

  if (!normalizedValue) {
    return null;
  }

  try {
    return new URL(normalizedValue);
  } catch {
    errors.push(`${label} must be a valid URL.`);
    return null;
  }
}

function readUuid(environment, key, errors, scope) {
  const normalizedValue = readRequiredString(environment, key, errors, scope);

  if (!normalizedValue) {
    return null;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedValue)) {
    errors.push(`${scope}: ${key} must be a valid UUID.`);
    return null;
  }

  return normalizedValue;
}

function readPositiveInteger(environment, key, errors, scope, defaultValue) {
  const normalizedValue = readOptionalString(environment[key]);

  if (!normalizedValue) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    errors.push(`${scope}: ${key} must be a positive integer.`);
    return defaultValue;
  }

  return parsedValue;
}
