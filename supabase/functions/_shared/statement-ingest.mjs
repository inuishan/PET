import { resolveMerchantClassificationMemory } from './classification-memory.ts';
import {
  StatementValidationError,
  buildStatementUploadRecord,
  buildTransactionRecords,
  normalizeParsedStatementPayload,
} from './statement-normalization.mjs';

export const PIPELINE_SECRET_HEADER = 'x-statement-pipeline-secret';

export async function handleStatementIngestRequest(request, dependencies) {
  let alertContext = null;

  if (request.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: {
        code: 'method_not_allowed',
        message: 'Use POST for statement ingestion.',
      },
    });
  }

  if (!isAuthorizedRequest(request, dependencies.webhookSecret)) {
    return jsonResponse(401, {
      success: false,
      error: {
        code: 'unauthorized',
        message: 'Missing or invalid statement pipeline secret.',
      },
    });
  }

  try {
    const payload = await request.json();
    const normalizedPayload = normalizeParsedStatementPayload(payload);
    const statementUpload = buildStatementUploadRecord(normalizedPayload, {
      syncedAt: dependencies.now?.() ?? new Date().toISOString(),
    });
    alertContext = {
      householdId: statementUpload.householdId,
      providerFileId: statementUpload.providerFileId,
      providerFileName: statementUpload.providerFileName,
    };
    let transactions = buildTransactionRecords(normalizedPayload);

    if (typeof dependencies.repository.classifyTransactions === 'function') {
      transactions = await dependencies.repository.classifyTransactions(statementUpload, transactions);
    }

    const reviewCount = transactions.filter((transaction) => transaction.needsReview).length;
    const nextParseStatus = resolveStatementParseStatus({
      reviewCount,
      skippedRowCount: normalizedPayload.skippedRows.length,
      transactionCount: transactions.length,
    });

    statementUpload.parseStatus = nextParseStatus;
    statementUpload.rawMetadata = {
      ...(statementUpload.rawMetadata ?? {}),
      parserSummary: {
        ...(statementUpload.rawMetadata?.parserSummary ?? {}),
        needsReviewCount: reviewCount,
        parseStatus: nextParseStatus,
        transactionCount: transactions.length,
      },
    };

    const savedStatementUpload = await dependencies.repository.ingestStatement(statementUpload, transactions);

    if (reviewCount > 0) {
      await notifyAlert(dependencies.alerts?.notifyReviewQueueEscalation, {
        householdId: statementUpload.householdId,
        providerFileId: statementUpload.providerFileId,
        providerFileName: statementUpload.providerFileName,
        relatedStatementUploadId: savedStatementUpload.id,
        reviewCount,
      }, dependencies.scheduleBackgroundTask);
    }

    return jsonResponse(200, {
      success: true,
      data: {
        statementUploadId: savedStatementUpload.id,
        transactionCount: transactions.length,
        skippedRowCount: normalizedPayload.skippedRows.length,
        parseStatus: statementUpload.parseStatus,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError || error instanceof StatementValidationError) {
      return jsonResponse(400, {
        success: false,
        error: {
          code: 'invalid_statement_payload',
          message: error instanceof StatementValidationError
            ? error.message
            : 'Request body must be valid JSON.',
        },
      });
    }

    console.error('statement-ingest failed', error);
    await notifyAlert(dependencies.alerts?.notifySyncBlocked, alertContext, dependencies.scheduleBackgroundTask);

    return jsonResponse(502, {
      success: false,
      error: {
        code: 'statement_ingest_failed',
        message: 'Failed to persist the statement payload.',
      },
    });
  }
}

export function createSupabaseStatementRepository(supabase) {
  return {
    async classifyTransactions(statementUpload, transactions) {
      const normalizedMerchantNames = [...new Set(
        transactions
          .map((transaction) => transaction.merchantNormalized)
          .filter(Boolean),
      )];

      if (normalizedMerchantNames.length === 0) {
        return transactions;
      }

      const aliasResult = await supabase
        .from('merchant_aliases')
        .select('raw_merchant_name,normalized_merchant_name,category_id,confidence,confirmation_count,active')
        .eq('household_id', statementUpload.householdId)
        .in('normalized_merchant_name', normalizedMerchantNames);

      if (aliasResult.error) {
        throw new Error(`statement memory lookup failed: ${aliasResult.error.message}`);
      }

      const historicalResult = await supabase
        .from('transactions')
        .select('merchant_normalized,category_id,classification_method,confidence')
        .eq('household_id', statementUpload.householdId)
        .eq('needs_review', false)
        .in('merchant_normalized', normalizedMerchantNames)
        .limit(100);

      if (historicalResult.error) {
        throw new Error(`statement history lookup failed: ${historicalResult.error.message}`);
      }

      const aliasesByMerchant = groupBy(aliasResult.data ?? [], (entry) => entry.normalized_merchant_name);
      const historicalByMerchant = groupBy(historicalResult.data ?? [], (entry) => entry.merchant_normalized);

      return transactions.map((transaction) => {
        const memoryResult = resolveMerchantClassificationMemory({
          aliases: (aliasesByMerchant.get(transaction.merchantNormalized) ?? []).map((alias) => ({
            active: alias.active ?? true,
            categoryId: alias.category_id ?? null,
            confidence: alias.confidence ?? null,
            confirmationCount: alias.confirmation_count ?? null,
            normalizedMerchantName: alias.normalized_merchant_name ?? transaction.merchantNormalized,
            rawMerchantName: alias.raw_merchant_name ?? '',
          })),
          historicalMatches: (historicalByMerchant.get(transaction.merchantNormalized) ?? []).map((entry) => ({
            categoryId: entry.category_id ?? null,
            classificationMethod: entry.classification_method,
            confidence: entry.confidence ?? null,
            merchantNormalized: entry.merchant_normalized ?? transaction.merchantNormalized,
          })),
          merchantNormalized: transaction.merchantNormalized,
          merchantRaw: transaction.merchantRaw,
        });

        if (memoryResult.outcome === 'reuse' && memoryResult.match) {
          return {
            ...transaction,
            categoryId: memoryResult.match.categoryId,
            classificationMethod: 'inherited',
            confidence: memoryResult.match.confidence ?? transaction.confidence,
            metadata: {
              ...transaction.metadata,
              classificationRationale: memoryResult.match.rationale,
              classificationSource: memoryResult.match.source,
            },
          };
        }

        if (memoryResult.outcome === 'ambiguous') {
          const reviewReason = mergeReviewReason(transaction.reviewReason, memoryResult.reviewReason);

          return {
            ...transaction,
            needsReview: true,
            reviewReason,
            status: transaction.status === 'flagged' ? 'flagged' : 'needs_review',
            metadata: {
              ...transaction.metadata,
              classificationSource: 'household_memory_conflict',
            },
          };
        }

        return transaction;
      });
    },

    async ingestStatement(statementUpload, transactions) {
      const { data, error } = await supabase.rpc('ingest_statement_payload', {
        statement_upload_payload: mapStatementUploadRecord(statementUpload),
        transaction_rows_payload: transactions.map(mapTransactionRecord),
      });

      if (error) {
        throw new Error(`statement ingest RPC failed: ${error.message}`);
      }

      return data;
    },
  };
}

function isAuthorizedRequest(request, webhookSecret) {
  const providedSecret = request.headers.get(PIPELINE_SECRET_HEADER);
  return Boolean(webhookSecret) && providedSecret === webhookSecret;
}

function mapStatementUploadRecord(statementUpload) {
  return {
    household_id: statementUpload.householdId,
    uploaded_by: statementUpload.uploadedBy,
    source_provider: statementUpload.sourceProvider,
    provider_file_id: statementUpload.providerFileId,
    provider_file_name: statementUpload.providerFileName,
    bank_name: statementUpload.bankName,
    card_name: statementUpload.cardName,
    parser_profile_name: statementUpload.parserProfileName,
    statement_password_key: statementUpload.statementPasswordKey,
    billing_period_start: statementUpload.billingPeriodStart,
    billing_period_end: statementUpload.billingPeriodEnd,
    uploaded_at: statementUpload.uploadedAt,
    synced_at: statementUpload.syncedAt,
    parse_status: statementUpload.parseStatus,
    parse_confidence: statementUpload.parseConfidence,
    parse_error: statementUpload.parseError,
    raw_metadata: statementUpload.rawMetadata,
  };
}

function mapTransactionRecord(transaction) {
  return {
    household_id: transaction.householdId,
    statement_upload_id: transaction.statementUploadId,
    owner_member_id: transaction.ownerMemberId,
    owner_scope: transaction.ownerScope,
    source_type: transaction.sourceType,
    source_reference: transaction.sourceReference,
    merchant_raw: transaction.merchantRaw,
    merchant_normalized: transaction.merchantNormalized,
    description: transaction.description,
    amount: transaction.amount,
    currency: transaction.currency,
    transaction_date: transaction.transactionDate,
    posted_at: transaction.postedAt,
    status: transaction.status,
    needs_review: transaction.needsReview,
    review_reason: transaction.reviewReason,
    confidence: transaction.confidence,
    classification_method: transaction.classificationMethod,
    category_id: transaction.categoryId,
    fingerprint: transaction.fingerprint,
    metadata: transaction.metadata,
  };
}

function resolveStatementParseStatus(summary) {
  if (summary.transactionCount === 0) {
    return 'failed';
  }

  if (summary.skippedRowCount > 0 || summary.reviewCount > 0) {
    return 'partial';
  }

  return 'parsed';
}

function jsonResponse(status, body) {
  return Response.json(body, { status });
}

function mergeReviewReason(existingReason, nextReason) {
  return [...new Set([existingReason, nextReason].filter(Boolean))].join(', ') || null;
}

function groupBy(rows, keySelector) {
  const groups = new Map();

  for (const row of rows) {
    const key = keySelector(row);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(row);
  }

  return groups;
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
