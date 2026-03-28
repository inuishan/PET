import fs from 'node:fs';
import path from 'node:path';

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

export function buildPhase3RuntimeValidationReport(input) {
  const errors = [];
  const warnings = [];

  const config = {
    mobile: parseMobileRuntimeEnv(input?.mobileEnv ?? {}, errors),
    supabase: parseSupabaseRuntimeEnv(input?.supabaseEnv ?? {}, errors),
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
    supabaseAnonKey: readRequiredString(
      environment,
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      errors,
      'Mobile',
    ),
    supabaseUrl: readUrl(environment, 'EXPO_PUBLIC_SUPABASE_URL', errors, 'Mobile'),
  });
}

function parseSupabaseRuntimeEnv(environment, errors) {
  const supabaseUrl = readUrl(environment, 'SUPABASE_URL', errors, 'Supabase functions');
  const analyticsGenerateUrl = readOptionalUrl(environment.ANALYTICS_GENERATE_URL, errors)
    ?? deriveFunctionUrl(supabaseUrl, 'analytics-generate');
  const validationReadAccessToken = readOptionalString(environment.PHASE3_VALIDATION_READ_ACCESS_TOKEN);
  const supabaseServiceRoleKey = readRequiredString(
    environment,
    'SUPABASE_SERVICE_ROLE_KEY',
    errors,
    'Supabase functions',
  );

  return compactRecord({
    analyticsGenerateUrl,
    analyticsPipelineSharedSecret: readRequiredString(
      environment,
      'ANALYTICS_PIPELINE_SHARED_SECRET',
      errors,
      'Supabase functions',
    ),
    readTokenSource: validationReadAccessToken ? 'authenticated_access_token' : 'service_role',
    supabaseServiceRoleKey,
    supabaseUrl,
    validationReadAccessToken,
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

  validateFunctionUrl(
    config.supabase.analyticsGenerateUrl,
    config.supabase.supabaseUrl,
    '/functions/v1/analytics-generate',
    'ANALYTICS_GENERATE_URL',
    errors,
  );

  if (config.supabase.readTokenSource === 'service_role') {
    warnings.push(
      'Phase 3 live read validation will use SUPABASE_SERVICE_ROLE_KEY. Set PHASE3_VALIDATION_READ_ACCESS_TOKEN to exercise the authenticated read path.',
    );
  }
}

function deriveFunctionUrl(supabaseUrl, functionName) {
  if (!(supabaseUrl instanceof URL)) {
    return null;
  }

  return new URL(`/functions/v1/${functionName}`, supabaseUrl);
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

  if (!(supabaseUrl instanceof URL)) {
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

  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch (error) {
    errors.push(`${scope}: ${key} must be a valid URL. ${error.message}`);
    return null;
  }
}

function readOptionalUrl(value, errors) {
  const normalized = readOptionalString(value);

  if (!normalized) {
    return null;
  }

  try {
    return new URL(normalized);
  } catch (error) {
    errors.push(`ANALYTICS_GENERATE_URL must be a valid URL. ${error.message}`);
    return null;
  }
}
