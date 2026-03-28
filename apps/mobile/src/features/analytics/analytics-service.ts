type ErrorLike = {
  message: string;
} | null;

type UnknownRecord = Record<string, unknown>;

export type AnalyticsBucket = 'week' | 'month' | 'year';

export type AnalyticsPeriod = {
  bucket: AnalyticsBucket;
  comparisonEndOn: string;
  comparisonStartOn: string;
  endOn: string;
  startOn: string;
};

export type AnalyticsSnapshot = {
  categoryAllocation: Array<{
    categoryId: string | null;
    categoryName: string;
    reviewCount: number;
    shareBps: number;
    totalSpend: number;
    transactionCount: number;
  }>;
  comparison: {
    currentSpend: number;
    currentTransactionCount: number;
    deltaPercentage: number | null;
    deltaSpend: number;
    previousSpend: number;
    previousTransactionCount: number;
  };
  householdId: string;
  insights: AnalyticsInsight[];
  latestReport: AnalyticsReportSummary | null;
  period: AnalyticsPeriod;
  recurringChargeCandidates: Array<{
    averageAmount: number;
    averageCadenceDays: number | null;
    categoryName: string;
    lastChargedOn: string;
    merchantName: string;
    monthsActive: number;
    paymentSourceLabel: string;
    transactionCount: number;
  }>;
  spendByPaymentSource: Array<{
    paymentSourceLabel: string;
    shareBps: number;
    sourceType: 'credit_card_statement' | 'manual_entry' | 'system_adjustment' | 'upi_whatsapp';
    totalSpend: number;
    transactionCount: number;
  }>;
  spendByPerson: Array<{
    ownerDisplayName: string | null;
    ownerMemberId: string | null;
    ownerScope: 'member' | 'shared' | 'unknown';
    shareBps: number;
    totalSpend: number;
    transactionCount: number;
  }>;
  trendSeries: Array<{
    bucketEndOn: string;
    bucketLabel: string;
    bucketStartOn: string;
    reviewCount: number;
    totalSpend: number;
    transactionCount: number;
  }>;
};

export type AnalyticsInsight = {
  evidencePayload: Array<{
    context: string | null;
    label: string;
    metricKey: string;
    transactionId: string | null;
    value: number | string;
  }>;
  estimatedMonthlyImpact: number | null;
  generatedAt: string;
  generatedFrom: {
    metrics: Record<string, number | string | null>;
    periodEnd?: string | null;
    periodStart?: string | null;
    signalKey: string;
    signalVersion: string;
    source: 'deterministic';
    supportingTransactionIds: string[];
  };
  id: string;
  recommendation: string;
  summary: string;
  title: string;
  type:
    | 'category_pattern'
    | 'duplicate_subscription'
    | 'overspending'
    | 'recurring_charge'
    | 'savings_opportunity'
    | 'unusual_spike';
};

export type AnalyticsReportSummary = {
  generatedAt: string;
  id: string;
  periodEnd: string;
  periodStart: string;
  title: string;
};

export type AnalyticsReport = {
  comparison: {
    deltaPercentage: number | null;
    deltaSpend: number;
    previousSpend: number;
  };
  generatedAt: string;
  id: string;
  insights: AnalyticsInsight[];
  payload: {
    sections: Array<{
      body: string;
      id: string;
      insightIds: string[];
      title: string;
    }>;
    summaryInsightIds: string[];
  };
  periodEnd: string;
  periodStart: string;
  reportType: 'monthly' | 'on_demand';
  summary: string;
  title: string;
};

export type AnalyticsClient = {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{
    data: T | null;
    error: ErrorLike;
  }>;
};

export function createAnalyticsQueryKey(householdId: string | null, period: AnalyticsPeriod | null) {
  return [
    'analytics',
    householdId,
    period?.startOn ?? null,
    period?.endOn ?? null,
    period?.comparisonStartOn ?? null,
    period?.comparisonEndOn ?? null,
    period?.bucket ?? null,
  ] as const;
}

export async function loadAnalyticsSnapshot(
  client: AnalyticsClient,
  input: {
    bucket: AnalyticsBucket;
    comparisonEndOn?: string | null;
    comparisonStartOn?: string | null;
    endOn: string;
    householdId: string;
    startOn: string;
  }
): Promise<AnalyticsSnapshot> {
  const householdId = readRequiredString(input.householdId, 'householdId');
  const response = await client.rpc<unknown>('get_household_analytics_snapshot', {
    target_bucket: readBucket(input.bucket, 'bucket'),
    target_comparison_end_on: normalizeOptionalString(input.comparisonEndOn),
    target_comparison_start_on: normalizeOptionalString(input.comparisonStartOn),
    target_end_on: readRequiredString(input.endOn, 'endOn'),
    target_household_id: householdId,
    target_start_on: readRequiredString(input.startOn, 'startOn'),
  });

  if (response.error) {
    throw new Error(`Unable to load household analytics: ${response.error.message}`);
  }

  return readAnalyticsSnapshot(response.data);
}

export async function loadAnalyticsReport(
  client: AnalyticsClient,
  input: {
    householdId: string;
    reportId?: string | null;
  }
): Promise<AnalyticsReport | null> {
  const householdId = readRequiredString(input.householdId, 'householdId');
  const response = await client.rpc<unknown>('get_household_analytics_report', {
    target_household_id: householdId,
    target_report_id: normalizeOptionalString(input.reportId),
  });

  if (response.error) {
    throw new Error(`Unable to load analytics report: ${response.error.message}`);
  }

  if (response.data === null) {
    return null;
  }

  return readAnalyticsReport(response.data);
}

function readAnalyticsSnapshot(input: unknown): AnalyticsSnapshot {
  const record = readRecord(input);

  return {
    categoryAllocation: readArray(record.categoryAllocation).map((entry) => {
      const allocation = readRecord(entry);

      return {
        categoryId: readNullableString(allocation.categoryId, 'categoryId'),
        categoryName: readRequiredString(allocation.categoryName, 'categoryName'),
        reviewCount: readNumber(allocation.reviewCount ?? 0, 'reviewCount'),
        shareBps: readNumber(allocation.shareBps ?? 0, 'shareBps'),
        totalSpend: readNumber(allocation.totalSpend ?? 0, 'totalSpend'),
        transactionCount: readNumber(allocation.transactionCount ?? 0, 'transactionCount'),
      };
    }),
    comparison: readAnalyticsComparison(record.comparison),
    householdId: readRequiredString(record.householdId, 'householdId'),
    insights: readArray(record.insights).map(readAnalyticsInsight),
    latestReport: record.latestReport === null || record.latestReport === undefined
      ? null
      : readAnalyticsReportSummary(record.latestReport),
    period: readAnalyticsPeriod(record.period),
    recurringChargeCandidates: readArray(record.recurringChargeCandidates).map((entry) => {
      const candidate = readRecord(entry);

      return {
        averageAmount: readNumber(candidate.averageAmount ?? 0, 'averageAmount'),
        averageCadenceDays: readNullableNumber(candidate.averageCadenceDays, 'averageCadenceDays'),
        categoryName: readRequiredString(candidate.categoryName, 'categoryName'),
        lastChargedOn: readRequiredString(candidate.lastChargedOn, 'lastChargedOn'),
        merchantName: readRequiredString(candidate.merchantName, 'merchantName'),
        monthsActive: readNumber(candidate.monthsActive, 'monthsActive'),
        paymentSourceLabel: readRequiredString(candidate.paymentSourceLabel, 'paymentSourceLabel'),
        transactionCount: readNumber(candidate.transactionCount, 'transactionCount'),
      };
    }),
    spendByPaymentSource: readArray(record.spendByPaymentSource).map((entry) => {
      const source = readRecord(entry);

      return {
        paymentSourceLabel: readRequiredString(source.paymentSourceLabel, 'paymentSourceLabel'),
        shareBps: readNumber(source.shareBps ?? 0, 'shareBps'),
        sourceType: readSourceType(source.sourceType, 'sourceType'),
        totalSpend: readNumber(source.totalSpend ?? 0, 'totalSpend'),
        transactionCount: readNumber(source.transactionCount ?? 0, 'transactionCount'),
      };
    }),
    spendByPerson: readArray(record.spendByPerson).map((entry) => {
      const person = readRecord(entry);

      return {
        ownerDisplayName: readNullableString(person.ownerDisplayName, 'ownerDisplayName'),
        ownerMemberId: readNullableString(person.ownerMemberId, 'ownerMemberId'),
        ownerScope: readOwnerScope(person.ownerScope, 'ownerScope'),
        shareBps: readNumber(person.shareBps ?? 0, 'shareBps'),
        totalSpend: readNumber(person.totalSpend ?? 0, 'totalSpend'),
        transactionCount: readNumber(person.transactionCount ?? 0, 'transactionCount'),
      };
    }),
    trendSeries: readArray(record.trendSeries).map((entry) => {
      const trend = readRecord(entry);

      return {
        bucketEndOn: readRequiredString(trend.bucketEndOn, 'bucketEndOn'),
        bucketLabel: readRequiredString(trend.bucketLabel, 'bucketLabel'),
        bucketStartOn: readRequiredString(trend.bucketStartOn, 'bucketStartOn'),
        reviewCount: readNumber(trend.reviewCount ?? 0, 'reviewCount'),
        totalSpend: readNumber(trend.totalSpend ?? 0, 'totalSpend'),
        transactionCount: readNumber(trend.transactionCount ?? 0, 'transactionCount'),
      };
    }),
  };
}

function readAnalyticsComparison(input: unknown): AnalyticsSnapshot['comparison'] {
  const comparison = readRecord(input);

  return {
    currentSpend: readNumber(comparison.currentSpend ?? 0, 'currentSpend'),
    currentTransactionCount: readNumber(comparison.currentTransactionCount ?? 0, 'currentTransactionCount'),
    deltaPercentage: readNullableNumber(comparison.deltaPercentage, 'deltaPercentage'),
    deltaSpend: readNumber(comparison.deltaSpend ?? 0, 'deltaSpend'),
    previousSpend: readNumber(comparison.previousSpend ?? 0, 'previousSpend'),
    previousTransactionCount: readNumber(comparison.previousTransactionCount ?? 0, 'previousTransactionCount'),
  };
}

function readAnalyticsInsight(input: unknown): AnalyticsInsight {
  const insight = readRecord(input);
  const generatedFrom = readRecord(insight.generatedFrom);

  return {
    evidencePayload: readArray(insight.evidencePayload).map((entry) => {
      const evidence = readRecord(entry);

      return {
        context: readNullableString(evidence.context, 'context'),
        label: readRequiredString(evidence.label, 'label'),
        metricKey: readRequiredString(evidence.metricKey, 'metricKey'),
        transactionId: readNullableString(evidence.transactionId, 'transactionId'),
        value: readLooseScalar(evidence.value, 'value'),
      };
    }),
    estimatedMonthlyImpact: readNullableNumber(insight.estimatedMonthlyImpact, 'estimatedMonthlyImpact'),
    generatedAt: readRequiredString(insight.generatedAt, 'generatedAt'),
    generatedFrom: {
      metrics: readLooseRecord(generatedFrom.metrics),
      periodEnd: readNullableString(generatedFrom.periodEnd, 'periodEnd'),
      periodStart: readNullableString(generatedFrom.periodStart, 'periodStart'),
      signalKey: readRequiredString(generatedFrom.signalKey, 'signalKey'),
      signalVersion: readRequiredString(generatedFrom.signalVersion, 'signalVersion'),
      source: readInsightSource(generatedFrom.source, 'source'),
      supportingTransactionIds: readArray(generatedFrom.supportingTransactionIds).map((entry) =>
        readRequiredString(entry, 'supportingTransactionIds')
      ),
    },
    id: readRequiredString(insight.id, 'id'),
    recommendation: readRequiredString(insight.recommendation, 'recommendation'),
    summary: readRequiredString(insight.summary, 'summary'),
    title: readRequiredString(insight.title, 'title'),
    type: readInsightType(insight.type, 'type'),
  };
}

function readAnalyticsPeriod(input: unknown): AnalyticsPeriod {
  const period = readRecord(input);

  return {
    bucket: readBucket(period.bucket, 'bucket'),
    comparisonEndOn: readRequiredString(period.comparisonEndOn, 'comparisonEndOn'),
    comparisonStartOn: readRequiredString(period.comparisonStartOn, 'comparisonStartOn'),
    endOn: readRequiredString(period.endOn, 'endOn'),
    startOn: readRequiredString(period.startOn, 'startOn'),
  };
}

function readAnalyticsReport(input: unknown): AnalyticsReport {
  const report = readRecord(input);
  const comparison = readRecord(report.comparison);
  const payload = readRecord(report.payload);

  return {
    comparison: {
      deltaPercentage: readNullableNumber(comparison.deltaPercentage, 'deltaPercentage'),
      deltaSpend: readNumber(comparison.deltaSpend ?? 0, 'deltaSpend'),
      previousSpend: readNumber(comparison.previousSpend ?? 0, 'previousSpend'),
    },
    generatedAt: readRequiredString(report.generatedAt, 'generatedAt'),
    id: readRequiredString(report.id, 'id'),
    insights: readArray(report.insights).map(readAnalyticsInsight),
    payload: {
      sections: readArray(payload.sections).map((entry) => {
        const section = readRecord(entry);

        return {
          body: readRequiredString(section.body, 'body'),
          id: readRequiredString(section.id, 'id'),
          insightIds: readArray(section.insightIds).map((item) => readRequiredString(item, 'insightIds')),
          title: readRequiredString(section.title, 'title'),
        };
      }),
      summaryInsightIds: readArray(payload.summaryInsightIds).map((item) => readRequiredString(item, 'summaryInsightIds')),
    },
    periodEnd: readRequiredString(report.periodEnd, 'periodEnd'),
    periodStart: readRequiredString(report.periodStart, 'periodStart'),
    reportType: readReportType(report.reportType, 'reportType'),
    summary: readRequiredString(report.summary, 'summary'),
    title: readRequiredString(report.title, 'title'),
  };
}

function readAnalyticsReportSummary(input: unknown): AnalyticsReportSummary {
  const report = readRecord(input);

  return {
    generatedAt: readRequiredString(report.generatedAt, 'generatedAt'),
    id: readRequiredString(report.id, 'id'),
    periodEnd: readRequiredString(report.periodEnd, 'periodEnd'),
    periodStart: readRequiredString(report.periodStart, 'periodStart'),
    title: readRequiredString(report.title, 'title'),
  };
}

function normalizeOptionalString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = readRequiredString(value, 'value');

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function readArray(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input;
}

function readRecord(input: unknown): UnknownRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected analytics payload to be an object.');
  }

  return input as UnknownRecord;
}

function readBucket(input: unknown, field: string): AnalyticsBucket {
  if (input === 'week' || input === 'month' || input === 'year') {
    return input;
  }

  throw new Error(`Expected ${field} to be a supported analytics bucket.`);
}

function readInsightType(input: unknown, field: string): AnalyticsInsight['type'] {
  if (
    input === 'category_pattern' ||
    input === 'duplicate_subscription' ||
    input === 'overspending' ||
    input === 'recurring_charge' ||
    input === 'savings_opportunity' ||
    input === 'unusual_spike'
  ) {
    return input;
  }

  throw new Error(`Expected ${field} to be a supported analytics insight type.`);
}

function readInsightSource(input: unknown, field: string): AnalyticsInsight['generatedFrom']['source'] {
  if (input === 'deterministic') {
    return input;
  }

  throw new Error(`Expected ${field} to be a supported analytics insight source.`);
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

function readNullableNumber(input: unknown, field: string) {
  if (input === null || input === undefined) {
    return null;
  }

  return readNumber(input, field);
}

function readNullableString(input: unknown, field: string) {
  if (input === null || input === undefined) {
    return null;
  }

  return readRequiredString(input, field);
}

function readLooseRecord(input: unknown): Record<string, number | string | null> {
  const record = readRecord(input);

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, readLooseScalar(value, key)]),
  );
}

function readLooseScalar(input: unknown, field: string): number | string | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === 'string' && input.trim().length > 0) {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : input.trim();
  }

  if (input === null || input === undefined) {
    return null;
  }

  throw new Error(`Expected ${field} to be numeric or textual.`);
}

function readOwnerScope(input: unknown, field: string): AnalyticsSnapshot['spendByPerson'][number]['ownerScope'] {
  if (input === 'member' || input === 'shared' || input === 'unknown') {
    return input;
  }

  throw new Error(`Expected ${field} to be a supported owner scope.`);
}

function readReportType(input: unknown, field: string): AnalyticsReport['reportType'] {
  if (input === 'monthly' || input === 'on_demand') {
    return input;
  }

  throw new Error(`Expected ${field} to be a supported analytics report type.`);
}

function readRequiredString(input: unknown, field: string) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error(`Expected ${field} to be a non-empty string.`);
  }

  return input.trim();
}

function readSourceType(input: unknown, field: string): AnalyticsSnapshot['spendByPaymentSource'][number]['sourceType'] {
  if (
    input === 'credit_card_statement' ||
    input === 'manual_entry' ||
    input === 'system_adjustment' ||
    input === 'upi_whatsapp'
  ) {
    return input;
  }

  throw new Error(`Expected ${field} to be a supported source type.`);
}
