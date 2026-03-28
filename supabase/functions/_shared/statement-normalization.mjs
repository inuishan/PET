import { normalizeMerchantName } from './merchant-normalization.mjs';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T/;

export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export class StatementValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'StatementValidationError';
    this.details = details;
  }
}

export function normalizeParsedStatementPayload(payload, options = {}) {
  const statement = normalizeStatement(payload?.statement ?? {});
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  const normalizedRows = [];
  const skippedRows = [];
  const baseFingerprintCounts = new Map();

  rows.forEach((row, index) => {
    let normalizedRow;

    try {
      normalizedRow = normalizeStatementRow(row, {
        index,
        statement,
        confidenceThreshold: options.confidenceThreshold ?? LOW_CONFIDENCE_THRESHOLD,
      });
    } catch (error) {
      if (error instanceof StatementValidationError) {
        skippedRows.push({
          rowIndex: index,
          reason: 'invalid_row_shape',
          detail: error.message,
        });
        return;
      }

      throw error;
    }

    if (!normalizedRow.success) {
      skippedRows.push(normalizedRow.skippedRow);
      return;
    }

    const occurrence = (baseFingerprintCounts.get(normalizedRow.row.baseFingerprint) ?? 0) + 1;
    baseFingerprintCounts.set(normalizedRow.row.baseFingerprint, occurrence);
    const { baseFingerprint, ...rowData } = normalizedRow.row;

    normalizedRows.push({
      ...rowData,
      fingerprint: occurrence === 1
        ? baseFingerprint
        : `${baseFingerprint}:${occurrence}`,
    });
  });

  const needsReviewCount = normalizedRows.filter((row) => row.needsReview).length;
  const confidenceValues = normalizedRows
    .map((row) => row.confidence)
    .filter((value) => Number.isFinite(value));

  const averageConfidence = confidenceValues.length === 0
    ? statement.parseConfidence
    : Number((confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length).toFixed(3));

  return {
    statement: {
      ...statement,
      parseConfidence: statement.parseConfidence ?? averageConfidence,
    },
    rows: normalizedRows,
    skippedRows,
    summary: {
      transactionCount: normalizedRows.length,
      skippedRowCount: skippedRows.length,
      needsReviewCount,
      parseConfidence: statement.parseConfidence ?? averageConfidence ?? null,
      parseStatus: resolveParseStatus({
        transactionCount: normalizedRows.length,
        skippedRowCount: skippedRows.length,
        needsReviewCount,
      }),
    },
  };
}

export function buildStatementUploadRecord(normalizedPayload, options = {}) {
  const { statement, skippedRows, summary } = normalizedPayload;
  const syncedAt = options.syncedAt ?? new Date().toISOString();

  return compactRecord({
    householdId: statement.householdId,
    uploadedBy: statement.uploadedBy,
    sourceProvider: statement.sourceProvider,
    providerFileId: statement.providerFileId,
    providerFileName: statement.providerFileName,
    bankName: statement.bankName,
    cardName: statement.cardName,
    parserProfileName: statement.parserProfileName,
    statementPasswordKey: statement.statementPasswordKey,
    billingPeriodStart: statement.billingPeriodStart,
    billingPeriodEnd: statement.billingPeriodEnd,
    uploadedAt: statement.uploadedAt,
    syncedAt: statement.syncedAt ?? syncedAt,
    parseStatus: summary.parseStatus,
    parseConfidence: statement.parseConfidence ?? summary.parseConfidence,
    parseError: summary.transactionCount > 0
      ? null
      : skippedRows[0]?.reason ?? 'no_valid_statement_rows',
    rawMetadata: {
      ...statement.rawMetadata,
      normalizationVersion: 'phase-1d-v1',
      parserSummary: summary,
      skippedRows,
    },
  });
}

export function buildTransactionRecords(normalizedPayload, statementUploadId) {
  return normalizedPayload.rows.map((row) =>
    compactRecord({
      householdId: normalizedPayload.statement.householdId,
      statementUploadId,
      ownerMemberId: row.ownerMemberId,
      ownerScope: row.ownerScope,
      sourceType: 'credit_card_statement',
      sourceReference: row.sourceReference,
      merchantRaw: row.merchantRaw,
      merchantNormalized: row.merchantNormalized,
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      transactionDate: row.transactionDate,
      postedAt: row.postedAt,
      status: row.status,
      needsReview: row.needsReview,
      reviewReason: row.reviewReason,
      confidence: row.confidence,
      classificationMethod: row.classificationMethod,
      categoryId: row.categoryId,
      fingerprint: row.fingerprint,
      metadata: row.metadata,
    }),
  );
}

function normalizeStatement(input) {
  const householdId = normalizeUuid(input.householdId, 'statement.householdId');
  const providerFileId = normalizeRequiredString(input.providerFileId, 'statement.providerFileId');
  const providerFileName = normalizeRequiredString(input.providerFileName, 'statement.providerFileName');
  const billingPeriodStart = normalizeOptionalDate(input.billingPeriodStart, 'statement.billingPeriodStart');
  const billingPeriodEnd = normalizeOptionalDate(input.billingPeriodEnd, 'statement.billingPeriodEnd');

  if (billingPeriodStart && billingPeriodEnd && billingPeriodEnd < billingPeriodStart) {
    throw new StatementValidationError('Statement billing period is invalid', {
      field: 'statement.billingPeriodEnd',
    });
  }

  return compactRecord({
    householdId,
    uploadedBy: normalizeOptionalUuid(input.uploadedBy, 'statement.uploadedBy'),
    sourceProvider: normalizeOptionalString(input.sourceProvider) ?? 'google_drive',
    providerFileId,
    providerFileName,
    bankName: normalizeOptionalString(input.bankName),
    cardName: normalizeOptionalString(input.cardName),
    parserProfileName: normalizeOptionalString(input.parserProfileName),
    statementPasswordKey: normalizeOptionalString(input.statementPasswordKey),
    billingPeriodStart,
    billingPeriodEnd,
    uploadedAt: normalizeOptionalDateTime(input.uploadedAt, 'statement.uploadedAt'),
    syncedAt: normalizeOptionalDateTime(input.syncedAt, 'statement.syncedAt'),
    parseConfidence: normalizeOptionalConfidence(input.parseConfidence, 'statement.parseConfidence'),
    rawMetadata: normalizeRecord(input.rawMetadata, 'statement.rawMetadata'),
  });
}

function normalizeStatementRow(input, context) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return skippedRowResult(context.index, 'invalid_row', 'Row must be a plain object');
  }

  const status = normalizeOptionalString(input.status)?.toLowerCase();

  if (status === 'failed') {
    return skippedRowResult(context.index, 'parser_failed_row', 'Parser marked row as failed');
  }

  const merchantRaw = normalizeOptionalString(input.merchantRaw ?? input.merchant);
  const description = normalizeOptionalString(input.description ?? input.note);
  const sourceReference = normalizeOptionalString(input.sourceReference ?? input.reference);
  const transactionDate = normalizeOptionalDate(
    input.transactionDate ?? input.date,
    `rows[${context.index}].transactionDate`,
  );
  const postedAt = normalizeOptionalDate(input.postedAt, `rows[${context.index}].postedAt`);
  const amount = normalizeAmount(input.amount);
  const confidence = normalizeOptionalConfidence(input.confidence, `rows[${context.index}].confidence`);

  if (!merchantRaw) {
    return skippedRowResult(context.index, 'missing_merchant', 'Missing merchant name');
  }

  if (!transactionDate) {
    return skippedRowResult(context.index, 'invalid_transaction_date', 'Missing transaction date');
  }

  if (amount === null) {
    return skippedRowResult(context.index, 'invalid_amount', 'Missing or invalid amount');
  }

  if (amount <= 0) {
    return skippedRowResult(context.index, 'non_expense_amount', 'Credits and reversals are skipped');
  }

  const merchantNormalized = normalizeMerchantName(merchantRaw);
  const reviewReasons = [];
  const explicitReviewReason = normalizeOptionalString(input.reviewReason);
  const explicitNeedsReview = input.needsReview === true || status === 'needs_review' || status === 'flagged';

  if (confidence !== null && confidence < context.confidenceThreshold) {
    reviewReasons.push('low_confidence');
  }

  if (explicitReviewReason) {
    reviewReasons.push(explicitReviewReason);
  }

  if (explicitNeedsReview && reviewReasons.length === 0) {
    reviewReasons.push(status === 'flagged' ? 'flagged_by_parser' : 'needs_review');
  }

  const baseFingerprint = createDeterministicFingerprint([
    merchantNormalized,
    normalizeFingerprintPart(description),
    normalizeFingerprintPart(sourceReference),
    transactionDate,
    postedAt ?? '',
    amount.toFixed(2),
    normalizeFingerprintPart(context.statement.cardName),
  ]);

  return {
    success: true,
    row: compactRecord({
      merchantRaw,
      merchantNormalized,
      description,
      sourceReference,
      amount,
      currency: normalizeCurrency(input.currency),
      transactionDate,
      postedAt,
      ownerMemberId: normalizeOptionalUuid(input.ownerMemberId, `rows[${context.index}].ownerMemberId`),
      ownerScope: normalizeOwnerScope(input.ownerScope, input.ownerMemberId),
      status: status === 'flagged' ? 'flagged' : reviewReasons.length > 0 ? 'needs_review' : 'processed',
      needsReview: reviewReasons.length > 0 || status === 'flagged',
      reviewReason: reviewReasons.length > 0 ? reviewReasons.join(', ') : null,
      confidence,
      classificationMethod: normalizeClassificationMethod(input.classificationMethod),
      categoryId: normalizeOptionalUuid(input.categoryId, `rows[${context.index}].categoryId`),
      baseFingerprint,
      metadata: {
        normalizationVersion: 'phase-1d-v1',
        parserRowIndex: context.index,
        source: 'statement_parse',
        ...(normalizeRecord(input.metadata, `rows[${context.index}].metadata`)),
      },
    }),
  };
}

function resolveParseStatus(summary) {
  if (summary.transactionCount === 0) {
    return 'failed';
  }

  if (summary.skippedRowCount > 0 || summary.needsReviewCount > 0) {
    return 'partial';
  }

  return 'parsed';
}

function normalizeUuid(value, field) {
  const normalized = normalizeRequiredString(value, field);

  if (!UUID_PATTERN.test(normalized)) {
    throw new StatementValidationError(`Invalid UUID for ${field}`, { field });
  }

  return normalized;
}

function normalizeOptionalUuid(value, field) {
  const normalized = normalizeOptionalString(value);

  if (normalized === null) {
    return null;
  }

  return normalizeUuid(normalized, field);
}

function normalizeRequiredString(value, field) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    throw new StatementValidationError(`Missing required field: ${field}`, { field });
  }

  return normalized;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

function normalizeOptionalDate(value, field) {
  const normalized = normalizeOptionalString(value);

  if (normalized === null) {
    return null;
  }

  if (DATE_PATTERN.test(normalized)) {
    return normalized;
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new StatementValidationError(`Invalid date for ${field}`, { field });
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeOptionalDateTime(value, field) {
  const normalized = normalizeOptionalString(value);

  if (normalized === null) {
    return null;
  }

  if (DATETIME_PATTERN.test(normalized)) {
    const parsed = new Date(normalized);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  throw new StatementValidationError(`Invalid datetime for ${field}`, { field });
}

function normalizeOptionalConfidence(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new StatementValidationError(`Invalid confidence for ${field}`, { field });
  }

  return Number(numeric.toFixed(3));
}

function normalizeAmount(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  const rawValue = String(value).trim();
  const negative = rawValue.includes('(')
    || rawValue.includes(')')
    || rawValue.startsWith('-')
    || /\bcr\b/i.test(rawValue);
  const numericValue = Number(rawValue.replace(/[^\d.-]/g, ''));

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const normalized = negative ? -Math.abs(numericValue) : Math.abs(numericValue);
  return Number(normalized.toFixed(2));
}

function normalizeCurrency(value) {
  const normalized = normalizeOptionalString(value)?.toUpperCase() ?? 'INR';

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new StatementValidationError('Invalid currency code', { field: 'rows[].currency' });
  }

  return normalized;
}

function normalizeClassificationMethod(value) {
  const normalized = normalizeOptionalString(value)?.toLowerCase() ?? 'llm';
  const allowed = new Set(['rules', 'llm', 'manual', 'inherited']);

  if (!allowed.has(normalized)) {
    throw new StatementValidationError('Invalid classification method', {
      field: 'rows[].classificationMethod',
    });
  }

  return normalized;
}

function normalizeOwnerScope(ownerScope, ownerMemberId) {
  const normalized = normalizeOptionalString(ownerScope)?.toLowerCase();
  const allowed = new Set(['member', 'shared', 'unknown']);

  if (normalized && !allowed.has(normalized)) {
    throw new StatementValidationError('Invalid owner scope', {
      field: 'rows[].ownerScope',
    });
  }

  if (normalized === 'member' || ownerMemberId) {
    return 'member';
  }

  return normalized ?? 'unknown';
}

function normalizeRecord(value, field) {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new StatementValidationError(`Expected ${field} to be an object`, { field });
  }

  return value;
}

function skippedRowResult(index, reason, detail) {
  return {
    success: false,
    skippedRow: {
      rowIndex: index,
      reason,
      detail,
    },
  };
}

function normalizeFingerprintPart(value) {
  return normalizeOptionalString(value)?.toLowerCase().replace(/\s+/g, ' ') ?? '';
}

function createDeterministicFingerprint(parts) {
  const input = parts.join('|');
  let hashA = 0xdeadbeef;
  let hashB = 0x41c6ce57;

  for (let index = 0; index < input.length; index += 1) {
    const charCode = input.charCodeAt(index);
    hashA = Math.imul(hashA ^ charCode, 2654435761);
    hashB = Math.imul(hashB ^ charCode, 1597334677);
  }

  hashA = Math.imul(hashA ^ (hashA >>> 16), 2246822507);
  hashA ^= Math.imul(hashB ^ (hashB >>> 13), 3266489909);
  hashB = Math.imul(hashB ^ (hashB >>> 16), 2246822507);
  hashB ^= Math.imul(hashA ^ (hashA >>> 13), 3266489909);

  return `${toUnsignedHex(hashA)}${toUnsignedHex(hashB)}`;
}

function toUnsignedHex(value) {
  return (value >>> 0).toString(16).padStart(8, '0');
}

function compactRecord(record) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}
