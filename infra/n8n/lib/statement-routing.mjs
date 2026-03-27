const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseStatementRoutingRules(value) {
  const parsedValue = typeof value === 'string'
    ? parseJsonRules(value)
    : value;

  if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
    throw new Error('STATEMENT_FILE_ROUTING_JSON must define at least one statement routing rule.');
  }

  return parsedValue.map((rule, index) => normalizeRoutingRule(rule, index));
}

export function resolveStatementRoute(providerFileName, options) {
  const normalizedProviderFileName = readRequiredString(providerFileName, 'providerFileName');
  const defaultHouseholdId = readOptionalUuid(options?.defaultHouseholdId, 'defaultHouseholdId');
  const rules = Array.isArray(options?.rules) ? options.rules : [];
  const matchingRule = rules.find((rule) => rule.matcher.test(normalizedProviderFileName));

  if (!matchingRule) {
    throw new Error(`No statement routing rule matched "${normalizedProviderFileName}".`);
  }

  const householdId = matchingRule.householdId ?? defaultHouseholdId;

  if (!householdId) {
    throw new Error(
      `No household id is configured for "${normalizedProviderFileName}". Set STATEMENT_HOUSEHOLD_ID or add householdId to the matching routing rule.`,
    );
  }

  return {
    bankName: matchingRule.bankName ?? null,
    cardName: matchingRule.cardName ?? null,
    fileNamePattern: matchingRule.fileNamePattern,
    householdId,
    parserProfileName: matchingRule.parserProfileName,
    statementPasswordKey: matchingRule.statementPasswordKey ?? null,
  };
}

function parseJsonRules(value) {
  const trimmedValue = String(value ?? '').trim();

  if (trimmedValue.length === 0) {
    throw new Error('STATEMENT_FILE_ROUTING_JSON must not be empty.');
  }

  try {
    return JSON.parse(trimmedValue);
  } catch (error) {
    throw new Error(`STATEMENT_FILE_ROUTING_JSON must be valid JSON. ${error.message}`);
  }
}

function normalizeRoutingRule(rule, index) {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    throw new Error(`STATEMENT_FILE_ROUTING_JSON[${index}] must be an object.`);
  }

  const fileNamePattern = readRequiredString(rule.fileNamePattern, `rules[${index}].fileNamePattern`);
  const parserProfileName = readRequiredString(
    rule.parserProfileName,
    `rules[${index}].parserProfileName`,
  );
  let matcher;

  try {
    matcher = new RegExp(fileNamePattern, 'i');
  } catch (error) {
    throw new Error(
      `rules[${index}].fileNamePattern must be a valid regular expression. ${error.message}`,
    );
  }

  return compactRecord({
    bankName: readOptionalString(rule.bankName),
    cardName: readOptionalString(rule.cardName),
    fileNamePattern,
    householdId: readOptionalUuid(rule.householdId, `rules[${index}].householdId`),
    matcher,
    parserProfileName,
    statementPasswordKey: readOptionalString(rule.statementPasswordKey),
  });
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

function readRequiredString(value, fieldName) {
  const normalizedValue = readOptionalString(value);

  if (!normalizedValue) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalizedValue;
}

function readOptionalUuid(value, fieldName) {
  const normalizedValue = readOptionalString(value);

  if (!normalizedValue) {
    return null;
  }

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new Error(`${fieldName} must be a valid UUID.`);
  }

  return normalizedValue;
}
