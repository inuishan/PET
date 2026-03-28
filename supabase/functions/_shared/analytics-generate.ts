import {
  generateAnalyticsOutputs,
  type AnalyticsFact,
  type AnalyticsGenerationPeriod,
  type AnalyticsReportType,
  type GeneratedAnalyticsOutputs,
} from './analytics-insights.ts';

export const ANALYTICS_PIPELINE_SECRET_HEADER = 'x-analytics-pipeline-secret';

type ErrorLike = {
  message: string;
} | null;

type UnknownRecord = Record<string, unknown>;

type GenerationRepository = {
  listAnalyticsFacts: (input: {
    comparisonEndOn: string;
    comparisonStartOn: string;
    endOn: string;
    householdId: string;
    startOn: string;
  }) => Promise<AnalyticsFact[]>;
  saveOutputs: (input: {
    comparison: GeneratedAnalyticsOutputs['comparison'];
    householdId: string;
    insights: GeneratedAnalyticsOutputs['insights'];
    period: AnalyticsGenerationPeriod;
    report: GeneratedAnalyticsOutputs['report'];
  }) => Promise<{
    insightCount: number;
    reportId: string | null;
  }>;
};

type SelectQuery<T> = Promise<{
  data: T[] | null;
  error: ErrorLike;
}> & {
  eq: (column: string, value: string) => SelectQuery<T>;
  gte: (column: string, value: string) => SelectQuery<T>;
  lte: (column: string, value: string) => SelectQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => SelectQuery<T>;
};

type SupabaseLike = {
  from: (table: 'analytics_reports' | 'household_transaction_analytics_facts' | 'insights') => {
    insert: (value: UnknownRecord | UnknownRecord[]) => Promise<{
      data: UnknownRecord[] | null;
      error: ErrorLike;
    }> & {
      select: (columns: string) => {
        single: () => Promise<{
          data: UnknownRecord | null;
          error: ErrorLike;
        }>;
      };
    };
    select: (columns: string) => SelectQuery<UnknownRecord>;
  };
};

export async function handleAnalyticsGenerateRequest(
  request: Request,
  dependencies: {
    now?: () => string;
    repository?: GenerationRepository;
    webhookSecret?: string;
  },
) {
  if (request.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      error: {
        code: 'method_not_allowed',
        message: 'Use POST for analytics generation.',
      },
    });
  }

  if (!isAuthorizedRequest(request, dependencies.webhookSecret)) {
    return jsonResponse(401, {
      success: false,
      error: {
        code: 'unauthorized',
        message: 'Missing or invalid analytics pipeline secret.',
      },
    });
  }

  if (!dependencies.repository) {
    return jsonResponse(500, {
      success: false,
      error: {
        code: 'analytics_generation_not_configured',
        message: 'Analytics generation dependencies are not configured.',
      },
    });
  }

  let input: {
    householdId: string;
    period: AnalyticsGenerationPeriod;
    reportType: AnalyticsReportType;
  };

  try {
    input = normalizeGenerationRequest(await request.json());
  } catch (error) {
    return jsonResponse(400, {
      success: false,
      error: {
        code: 'invalid_analytics_generation_request',
        message: error instanceof Error ? error.message : 'Request body must be valid JSON.',
      },
    });
  }

  try {
    const historyStartOn = addDays(input.period.endOn, -365);
    const facts = await dependencies.repository.listAnalyticsFacts({
      comparisonEndOn: input.period.comparisonEndOn,
      comparisonStartOn: input.period.comparisonStartOn,
      endOn: input.period.endOn,
      householdId: input.householdId,
      startOn: historyStartOn,
    });
    const outputs = generateAnalyticsOutputs({
      facts,
      generatedAt: dependencies.now?.() ?? new Date().toISOString(),
      householdId: input.householdId,
      period: input.period,
      reportType: input.reportType,
    });
    const saved = await dependencies.repository.saveOutputs({
      comparison: outputs.comparison,
      householdId: input.householdId,
      insights: outputs.insights,
      period: input.period,
      report: outputs.report,
    });

    return jsonResponse(200, {
      success: true,
      data: saved,
    });
  } catch (error) {
    console.error('analytics-generate failed', error);

    return jsonResponse(502, {
      success: false,
      error: {
        code: 'analytics_generation_failed',
        message: 'Failed to generate or persist analytics outputs.',
      },
    });
  }
}

export function createSupabaseAnalyticsGenerationRepository(supabase: SupabaseLike): GenerationRepository {
  return {
    async listAnalyticsFacts(input) {
      const { data, error } = await supabase
        .from('household_transaction_analytics_facts')
        .select('transaction_id, transaction_date, amount, needs_review, status, owner_scope, owner_member_id, owner_display_name, source_type, payment_source_label, category_id, category_name, merchant_name, transaction_month')
        .eq('household_id', input.householdId)
        .gte('transaction_date', input.startOn)
        .lte('transaction_date', input.endOn)
        .order('transaction_date', { ascending: true });

      if (error) {
        throw new Error(`analytics fact query failed: ${error.message}`);
      }

      return readArray(data).map(readAnalyticsFact);
    },
    async saveOutputs(input) {
      const reportInsert = await supabase
        .from('analytics_reports')
        .insert({
          comparison_period_end: input.period.comparisonEndOn,
          comparison_period_start: input.period.comparisonStartOn,
          generated_at: input.report.generatedAt,
          generation_metadata: {
            comparison: input.comparison,
            signalVersion: 'phase3b_v1',
            summaryInsightIds: input.report.payload.summaryInsightIds,
          },
          household_id: input.householdId,
          id: input.report.id,
          period_end: input.period.endOn,
          period_start: input.period.startOn,
          report_payload: input.report.payload,
          report_type: input.report.reportType,
          status: 'published',
          summary: input.report.summary,
          title: input.report.title,
        })
        .select('id')
        .single();

      if (reportInsert.error) {
        throw new Error(`analytics report insert failed: ${reportInsert.error.message}`);
      }

      if (input.insights.length > 0) {
        const insightsInsert = await supabase
          .from('insights')
          .insert(input.insights.map((insight) => ({
            analytics_report_id: input.report.id,
            estimated_monthly_impact: insight.estimatedMonthlyImpact,
            evidence_payload: insight.evidencePayload,
            generated_at: insight.generatedAt,
            generated_from: insight.generatedFrom,
            household_id: input.householdId,
            id: insight.id,
            insight_type: insight.type,
            recommendation: insight.recommendation,
            status: 'published',
            summary: insight.summary,
            title: insight.title,
          })));

        if (insightsInsert.error) {
          throw new Error(`analytics insights insert failed: ${insightsInsert.error.message}`);
        }
      }

      return {
        insightCount: input.insights.length,
        reportId: reportInsert.data?.id ? String(reportInsert.data.id) : input.report.id,
      };
    },
  };
}

function normalizeGenerationRequest(input: unknown) {
  const record = readRecord(input);
  const bucket = readBucket(record.bucket ?? 'month');
  const startOn = readRequiredString(record.startOn, 'startOn');
  const endOn = readRequiredString(record.endOn, 'endOn');

  return {
    householdId: readRequiredString(record.householdId, 'householdId'),
    period: {
      bucket,
      comparisonEndOn: readOptionalString(record.comparisonEndOn) ?? defaultComparisonWindow(bucket, startOn, endOn).comparisonEndOn,
      comparisonStartOn: readOptionalString(record.comparisonStartOn) ?? defaultComparisonWindow(bucket, startOn, endOn).comparisonStartOn,
      endOn,
      startOn,
    },
    reportType: readReportType(record.reportType ?? 'monthly'),
  };
}

function defaultComparisonWindow(bucket: AnalyticsGenerationPeriod['bucket'], startOn: string, endOn: string) {
  if (bucket === 'month') {
    const currentStart = new Date(`${startOn}T00:00:00.000Z`);
    const comparisonEnd = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 0));
    const comparisonStart = new Date(Date.UTC(comparisonEnd.getUTCFullYear(), comparisonEnd.getUTCMonth(), 1));

    return {
      comparisonEndOn: formatDate(comparisonEnd),
      comparisonStartOn: formatDate(comparisonStart),
    };
  }

  if (bucket === 'year') {
    const currentStart = new Date(`${startOn}T00:00:00.000Z`);
    const comparisonStart = new Date(Date.UTC(currentStart.getUTCFullYear() - 1, 0, 1));
    const comparisonEnd = new Date(Date.UTC(currentStart.getUTCFullYear() - 1, 11, 31));

    return {
      comparisonEndOn: formatDate(comparisonEnd),
      comparisonStartOn: formatDate(comparisonStart),
    };
  }

  const dayCount = diffDays(startOn, endOn);
  const comparisonEndOn = addDays(startOn, -1);

  return {
    comparisonEndOn,
    comparisonStartOn: addDays(comparisonEndOn, -(dayCount - 1)),
  };
}

function readAnalyticsFact(input: unknown): AnalyticsFact {
  const record = readRecord(input);

  return {
    amount: readNumber(record.amount, 'amount'),
    categoryId: readOptionalString(record.category_id),
    categoryName: readRequiredString(record.category_name, 'category_name'),
    id: readRequiredString(record.transaction_id, 'transaction_id'),
    merchantName: readRequiredString(record.merchant_name, 'merchant_name'),
    needsReview: Boolean(record.needs_review),
    ownerDisplayName: readOptionalString(record.owner_display_name),
    ownerMemberId: readOptionalString(record.owner_member_id),
    ownerScope: readOwnerScope(record.owner_scope),
    paymentSourceLabel: readRequiredString(record.payment_source_label, 'payment_source_label'),
    sourceType: readSourceType(record.source_type),
    status: readStatus(record.status),
    transactionDate: readRequiredString(record.transaction_date, 'transaction_date'),
    transactionMonth: readRequiredString(record.transaction_month, 'transaction_month'),
  };
}

function isAuthorizedRequest(request: Request, webhookSecret?: string) {
  const providedSecret = request.headers.get(ANALYTICS_PIPELINE_SECRET_HEADER);
  return Boolean(webhookSecret) && providedSecret === webhookSecret;
}

function readRecord(input: unknown): UnknownRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected an object payload.');
  }

  return input as UnknownRecord;
}

function readArray<T>(input: T[] | null | undefined) {
  return Array.isArray(input) ? input : [];
}

function readRequiredString(input: unknown, field: string) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error(`Expected ${field} to be a non-empty string.`);
  }

  return input.trim();
}

function readOptionalString(input: unknown) {
  if (input === null || input === undefined) {
    return null;
  }

  return readRequiredString(input, 'value');
}

function readNumber(input: unknown, field: string) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === 'string' && input.trim().length > 0) {
    const parsed = Number(input);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`Expected ${field} to be numeric.`);
}

function readBucket(input: unknown): AnalyticsGenerationPeriod['bucket'] {
  if (input === 'week' || input === 'month' || input === 'year') {
    return input;
  }

  throw new Error('Expected bucket to be a supported analytics bucket.');
}

function readReportType(input: unknown): AnalyticsReportType {
  if (input === 'monthly' || input === 'on_demand') {
    return input;
  }

  throw new Error('Expected reportType to be a supported analytics report type.');
}

function readOwnerScope(input: unknown): AnalyticsFact['ownerScope'] {
  if (input === 'member' || input === 'shared' || input === 'unknown') {
    return input;
  }

  throw new Error('Expected owner_scope to be supported.');
}

function readSourceType(input: unknown): AnalyticsFact['sourceType'] {
  if (
    input === 'credit_card_statement' ||
    input === 'manual_entry' ||
    input === 'system_adjustment' ||
    input === 'upi_whatsapp'
  ) {
    return input;
  }

  throw new Error('Expected source_type to be supported.');
}

function readStatus(input: unknown): AnalyticsFact['status'] {
  if (input === 'failed' || input === 'flagged' || input === 'needs_review' || input === 'processed') {
    return input;
  }

  throw new Error('Expected status to be supported.');
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return formatDate(parsed);
}

function diffDays(startOn: string, endOn: string) {
  const start = new Date(`${startOn}T00:00:00.000Z`).getTime();
  const end = new Date(`${endOn}T00:00:00.000Z`).getTime();
  return Math.max(Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1, 1);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function jsonResponse(status: number, body: UnknownRecord) {
  return Response.json(body, { status });
}
