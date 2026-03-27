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
    const transactions = buildTransactionRecords(normalizedPayload);
    const savedStatementUpload = await dependencies.repository.ingestStatement(statementUpload, transactions);
    const reviewCount = transactions.filter((transaction) => transaction.needsReview).length;

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
