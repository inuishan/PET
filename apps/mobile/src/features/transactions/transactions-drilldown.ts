export type TransactionsPeriodBucket = 'all' | 'custom' | 'month' | 'week' | 'year';

export type TransactionsDrilldown = {
  categoryId?: string | null;
  endOn?: string | null;
  origin?: 'analytics' | null;
  ownerMemberId?: string | null;
  ownerScope?: 'all' | 'member' | 'shared' | 'unknown' | null;
  periodBucket?: TransactionsPeriodBucket | null;
  searchQuery?: string | null;
  sourceType?: 'all' | 'credit_card_statement' | 'upi_whatsapp' | null;
  startOn?: string | null;
  subtitle?: string | null;
  title?: string | null;
  transactionIds?: string[];
};

export type ResolvedTransactionsDrilldown = {
  categoryId: string | null;
  endOn: string | null;
  origin: 'analytics' | null;
  ownerMemberId: string | null;
  ownerScope: 'all' | 'member' | 'shared' | 'unknown';
  periodBucket: TransactionsPeriodBucket;
  searchQuery: string;
  sourceType: 'all' | 'credit_card_statement' | 'upi_whatsapp';
  startOn: string | null;
  subtitle: string | null;
  title: string | null;
  transactionIds: string[];
};

type SearchParamRecord = Record<string, string | string[] | undefined>;

export function createTransactionsDrilldownParams(input: TransactionsDrilldown) {
  const drilldown = normalizeInputTransactionsDrilldown(input);
  const params: Record<string, string> = {};

  appendParam(params, 'categoryId', drilldown.categoryId);
  appendParam(params, 'endOn', drilldown.endOn);
  appendParam(params, 'origin', drilldown.origin);
  appendParam(params, 'ownerMemberId', drilldown.ownerMemberId);

  if (drilldown.ownerScope && drilldown.ownerScope !== 'all') {
    params.ownerScope = drilldown.ownerScope;
  }

  if (drilldown.periodBucket && drilldown.periodBucket !== 'all') {
    params.periodBucket = drilldown.periodBucket;
  }

  if (drilldown.searchQuery) {
    params.searchQuery = drilldown.searchQuery;
  }

  if (drilldown.sourceType && drilldown.sourceType !== 'all') {
    params.sourceType = drilldown.sourceType;
  }

  appendParam(params, 'startOn', drilldown.startOn);
  appendParam(params, 'subtitle', drilldown.subtitle);
  appendParam(params, 'title', drilldown.title);

  if (drilldown.transactionIds && drilldown.transactionIds.length > 0) {
    params.transactionIds = drilldown.transactionIds.join(',');
  }

  return params;
}

export function readTransactionsDrilldownParams(input: SearchParamRecord): TransactionsDrilldown {
  return normalizeInputTransactionsDrilldown({
    categoryId: readOptionalValue(input.categoryId),
    endOn: readOptionalValue(input.endOn),
    origin: readOrigin(input.origin),
    ownerMemberId: readOptionalValue(input.ownerMemberId),
    ownerScope: readRawOwnerScope(input.ownerScope),
    periodBucket: readPeriodBucket(input.periodBucket),
    searchQuery: readOptionalValue(input.searchQuery),
    sourceType: readRawSourceType(input.sourceType),
    startOn: readOptionalValue(input.startOn),
    subtitle: readOptionalValue(input.subtitle),
    title: readOptionalValue(input.title),
    transactionIds: readCsvValues(input.transactionIds),
  });
}

export function resolveTransactionsDrilldown(input: TransactionsDrilldown): ResolvedTransactionsDrilldown {
  const drilldown = normalizeInputTransactionsDrilldown(input);

  return {
    categoryId: drilldown.categoryId ?? null,
    endOn: drilldown.endOn ?? null,
    origin: drilldown.origin ?? null,
    ownerMemberId: drilldown.ownerMemberId ?? null,
    ownerScope: drilldown.ownerScope ?? 'all',
    periodBucket: drilldown.periodBucket ?? 'all',
    searchQuery: drilldown.searchQuery ?? '',
    sourceType: drilldown.sourceType ?? 'all',
    startOn: drilldown.startOn ?? null,
    subtitle: drilldown.subtitle ?? null,
    title: drilldown.title ?? null,
    transactionIds: drilldown.transactionIds ?? [],
  };
}

function appendParam(params: Record<string, string>, key: string, value: string | null) {
  if (value && value.trim().length > 0) {
    params[key] = value.trim();
  }
}

function normalizeInputTransactionsDrilldown(input: TransactionsDrilldown): TransactionsDrilldown {
  return {
    categoryId: normalizeOptionalString(input.categoryId) ?? undefined,
    endOn: normalizeOptionalString(input.endOn) ?? undefined,
    origin: input.origin === 'analytics' ? 'analytics' : undefined,
    ownerMemberId: normalizeOptionalString(input.ownerMemberId) ?? undefined,
    ownerScope: input.ownerScope ?? undefined,
    periodBucket: input.periodBucket ?? undefined,
    searchQuery: normalizeOptionalString(input.searchQuery) ?? undefined,
    sourceType: input.sourceType ?? undefined,
    startOn: normalizeOptionalString(input.startOn) ?? undefined,
    subtitle: normalizeOptionalString(input.subtitle) ?? undefined,
    title: normalizeOptionalString(input.title) ?? undefined,
    transactionIds: input.transactionIds ? normalizeTransactionIds(input.transactionIds) : undefined,
  };
}

function normalizeOptionalString(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeTransactionIds(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function readOptionalValue(input: string | string[] | undefined) {
  const value = Array.isArray(input) ? input[0] : input;

  if (typeof value !== 'string') {
    return null;
  }

  return value.trim().length > 0 ? value.trim() : null;
}

function readOrigin(input: string | string[] | undefined): TransactionsDrilldown['origin'] {
  return readOptionalValue(input) === 'analytics' ? 'analytics' : null;
}

function readRawOwnerScope(input: string | string[] | undefined): TransactionsDrilldown['ownerScope'] {
  const value = readOptionalValue(input);

  if (value === 'member' || value === 'shared' || value === 'unknown') {
    return value;
  }

  return undefined;
}

function readPeriodBucket(input: string | string[] | undefined): TransactionsDrilldown['periodBucket'] {
  const value = readOptionalValue(input);

  if (value === 'custom' || value === 'month' || value === 'week' || value === 'year') {
    return value;
  }

  return undefined;
}

function readRawSourceType(input: string | string[] | undefined): TransactionsDrilldown['sourceType'] {
  const value = readOptionalValue(input);

  if (value === 'credit_card_statement' || value === 'upi_whatsapp') {
    return value;
  }

  return undefined;
}

function readCsvValues(input: string | string[] | undefined) {
  const value = readOptionalValue(input);

  if (!value) {
    return undefined;
  }

  return normalizeTransactionIds(value.split(','));
}
