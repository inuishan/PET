import fs from 'node:fs';
import path from 'node:path';

const MAX_ACK_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

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

export function buildPhase2RuntimeValidationReport(input) {
  const errors = [];
  const warnings = [];

  const config = {
    supabase: parseSupabaseRuntimeEnv(input?.supabaseEnv ?? {}, errors),
  };

  validateCrossSystemRuntimeConfig(config, errors, warnings);

  return {
    config,
    errors,
    warnings,
  };
}

function parseSupabaseRuntimeEnv(environment, errors) {
  const supabaseUrl = readUrl(environment, 'SUPABASE_URL', errors, 'Supabase functions');

  return compactRecord({
    acknowledgementsEnabled: parseBoolean(environment.WHATSAPP_ACK_ENABLED ?? ''),
    ackReplyWindowMs: readPositiveInteger(
      environment,
      'WHATSAPP_ACK_REPLY_WINDOW_MS',
      errors,
      'Supabase functions',
      MAX_ACK_REPLY_WINDOW_MS,
    ),
    appSecret: readRequiredString(environment, 'META_APP_SECRET', errors, 'Supabase functions'),
    graphApiBaseUrl:
      readOptionalUrl(environment.META_GRAPH_API_BASE_URL, errors, 'META_GRAPH_API_BASE_URL')
      ?? new URL('https://graph.facebook.com/v23.0'),
    ingestTimeoutMs: readPositiveInteger(
      environment,
      'WHATSAPP_INGEST_TIMEOUT_MS',
      errors,
      'Supabase functions',
      5_000,
    ),
    ingestUrl:
      readOptionalUrl(environment.WHATSAPP_INGEST_FUNCTION_URL, errors, 'WHATSAPP_INGEST_FUNCTION_URL')
      ?? deriveFunctionUrl(supabaseUrl, 'whatsapp-ingest'),
    internalAuthToken: readRequiredString(
      environment,
      'WHATSAPP_INTERNAL_AUTH_TOKEN',
      errors,
      'Supabase functions',
    ),
    metaWhatsAppAccessToken: readOptionalString(environment.META_WHATSAPP_ACCESS_TOKEN),
    parseTimeoutMs: readPositiveInteger(
      environment,
      'WHATSAPP_PARSE_TIMEOUT_MS',
      errors,
      'Supabase functions',
      5_000,
    ),
    parseUrl:
      readOptionalUrl(environment.WHATSAPP_PARSE_FUNCTION_URL, errors, 'WHATSAPP_PARSE_FUNCTION_URL')
      ?? deriveFunctionUrl(supabaseUrl, 'whatsapp-parse'),
    replyTimeoutMs: readPositiveInteger(
      environment,
      'WHATSAPP_REPLY_TIMEOUT_MS',
      errors,
      'Supabase functions',
      5_000,
    ),
    replyUrl:
      readOptionalUrl(environment.WHATSAPP_REPLY_FUNCTION_URL, errors, 'WHATSAPP_REPLY_FUNCTION_URL')
      ?? deriveFunctionUrl(supabaseUrl, 'whatsapp-reply'),
    readTokenSource: 'service_role',
    supabaseServiceRoleKey: readRequiredString(
      environment,
      'SUPABASE_SERVICE_ROLE_KEY',
      errors,
      'Supabase functions',
    ),
    supabaseUrl,
    validationDefaults: compactRecord({
      approvedDisplayName:
        readOptionalString(environment.PHASE2_VALIDATION_APPROVED_DISPLAY_NAME)
        ?? 'Phase 2 validated participant',
      approvedMemberId: readOptionalUuid(
        environment.PHASE2_VALIDATION_APPROVED_MEMBER_ID,
        errors,
        'PHASE2_VALIDATION_APPROVED_MEMBER_ID',
      ),
      approvedPhoneE164: readOptionalE164(
        environment.PHASE2_VALIDATION_APPROVED_PHONE_E164,
        errors,
        'PHASE2_VALIDATION_APPROVED_PHONE_E164',
      ),
      householdId: readOptionalUuid(
        environment.PHASE2_VALIDATION_HOUSEHOLD_ID,
        errors,
        'PHASE2_VALIDATION_HOUSEHOLD_ID',
      ),
      rejectedPhoneE164: readOptionalE164(
        environment.PHASE2_VALIDATION_REJECTED_PHONE_E164,
        errors,
        'PHASE2_VALIDATION_REJECTED_PHONE_E164',
      ),
    }),
    validationOwnerAccessToken: readOptionalString(environment.PHASE2_VALIDATION_OWNER_ACCESS_TOKEN),
    verifyToken: readRequiredString(
      environment,
      'META_WEBHOOK_VERIFY_TOKEN',
      errors,
      'Supabase functions',
    ),
    webhookUrl: deriveFunctionUrl(supabaseUrl, 'whatsapp-webhook'),
  });
}

function validateCrossSystemRuntimeConfig(config, errors, warnings) {
  validateFunctionUrl(
    config.supabase.webhookUrl,
    config.supabase.supabaseUrl,
    '/functions/v1/whatsapp-webhook',
    'whatsapp-webhook',
    errors,
  );
  validateFunctionUrl(
    config.supabase.parseUrl,
    config.supabase.supabaseUrl,
    '/functions/v1/whatsapp-parse',
    'WHATSAPP_PARSE_FUNCTION_URL',
    errors,
  );
  validateFunctionUrl(
    config.supabase.ingestUrl,
    config.supabase.supabaseUrl,
    '/functions/v1/whatsapp-ingest',
    'WHATSAPP_INGEST_FUNCTION_URL',
    errors,
  );
  validateFunctionUrl(
    config.supabase.replyUrl,
    config.supabase.supabaseUrl,
    '/functions/v1/whatsapp-reply',
    'WHATSAPP_REPLY_FUNCTION_URL',
    errors,
  );

  if (
    config.supabase.internalAuthToken
    && config.supabase.supabaseServiceRoleKey
    && config.supabase.internalAuthToken === config.supabase.supabaseServiceRoleKey
  ) {
    errors.push('WHATSAPP_INTERNAL_AUTH_TOKEN must be dedicated and must not reuse SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (config.supabase.ackReplyWindowMs > MAX_ACK_REPLY_WINDOW_MS) {
    errors.push('WHATSAPP_ACK_REPLY_WINDOW_MS must not exceed 86400000 milliseconds (24 hours).');
  }

  if (config.supabase.acknowledgementsEnabled && !config.supabase.metaWhatsAppAccessToken) {
    errors.push('META_WHATSAPP_ACCESS_TOKEN is required when WHATSAPP_ACK_ENABLED=true.');
  }

  if (!/^\/v\d+\.\d+$/i.test(config.supabase.graphApiBaseUrl?.pathname ?? '')) {
    warnings.push('META_GRAPH_API_BASE_URL should stay pinned to a version path such as /v23.0.');
  }

  if (!config.supabase.validationOwnerAccessToken) {
    warnings.push(
      'Phase 2 live validation will seed participants with SUPABASE_SERVICE_ROLE_KEY. Set PHASE2_VALIDATION_OWNER_ACCESS_TOKEN to exercise the owner RPC path instead.',
    );
  }
}

function deriveFunctionUrl(supabaseUrl, functionName) {
  if (!(supabaseUrl instanceof URL)) {
    return null;
  }

  return new URL(`/functions/v1/${functionName}`, supabaseUrl);
}

function validateFunctionUrl(runtimeUrl, supabaseUrl, expectedPathSuffix, fieldName, errors) {
  if (!(runtimeUrl instanceof URL) || !(supabaseUrl instanceof URL)) {
    return;
  }

  if (!runtimeUrl.pathname.endsWith(expectedPathSuffix)) {
    errors.push(`${fieldName} must point at ${expectedPathSuffix}.`);
  }

  if (runtimeUrl.origin !== supabaseUrl.origin) {
    errors.push(`${fieldName} must point at the same Supabase project as SUPABASE_URL.`);
  }
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function compactRecord(input) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function readRequiredString(environment, key, errors, scope) {
  const value = readOptionalString(environment[key]);

  if (!value) {
    errors.push(`${scope}: ${key} is required.`);
    return null;
  }

  return value;
}

function readOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readUrl(environment, key, errors, scope) {
  const value = readRequiredString(environment, key, errors, scope);
  return value ? readOptionalUrl(value, errors, `${scope}: ${key}`) : null;
}

function readOptionalUrl(value, errors, fieldName = 'URL') {
  const normalized = readOptionalString(value);

  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized);
  } catch (error) {
    errors.push(`${fieldName} must be a valid URL. ${error.message}`);
    return null;
  }
}

function readPositiveInteger(environment, key, errors, scope, fallbackValue) {
  const rawValue = readOptionalString(environment[key]);

  if (!rawValue) {
    return fallbackValue;
  }

  const numeric = Number(rawValue);

  if (!Number.isInteger(numeric) || numeric <= 0) {
    errors.push(`${scope}: ${key} must be a positive integer.`);
    return fallbackValue;
  }

  return numeric;
}

function readOptionalUuid(value, errors, fieldName) {
  const normalized = readOptionalString(value);

  if (!normalized) {
    return null;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    errors.push(`${fieldName} must be a valid UUID.`);
    return null;
  }

  return normalized;
}

function readOptionalE164(value, errors, fieldName) {
  const normalized = readOptionalString(value);

  if (!normalized) {
    return null;
  }

  if (!/^\+[1-9][0-9]{6,14}$/.test(normalized)) {
    errors.push(`${fieldName} must be a valid E.164 phone number.`);
    return null;
  }

  return normalized;
}
