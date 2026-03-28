import { normalizeMerchantName } from './merchant-normalization.mjs';

type MerchantAliasMemoryRecord = {
  active?: boolean | null;
  categoryId: string | null;
  confidence: number | null;
  confirmationCount?: number | null;
  normalizedMerchantName: string;
  rawMerchantName: string;
};

type HistoricalClassificationMemoryRecord = {
  categoryId: string | null;
  classificationMethod: 'inherited' | 'llm' | 'manual' | 'rules';
  confidence: number | null;
  merchantNormalized: string;
};

type ResolveMemoryInput = {
  aliases: MerchantAliasMemoryRecord[];
  historicalMatches: HistoricalClassificationMemoryRecord[];
  merchantNormalized?: string | null;
  merchantRaw?: string | null;
};

type MemoryMatch = {
  categoryId: string;
  confidence: number;
  rationale: 'accepted_household_alias' | 'deterministic_historical_consensus';
  source: 'merchant_alias' | 'historical_classification';
};

type MemoryResolution =
  | {
      match: MemoryMatch;
      outcome: 'reuse';
      reviewReason: null;
    }
  | {
      match: null;
      outcome: 'ambiguous';
      reviewReason: 'historical_classification_conflict' | 'merchant_alias_conflict';
    }
  | {
      match: null;
      outcome: 'none';
      reviewReason: null;
    };

const STRONG_HISTORICAL_CONFIDENCE = 0.85;
const MIN_HISTORICAL_MATCHES = 2;

export { normalizeMerchantName };

export function resolveMerchantClassificationMemory(input: ResolveMemoryInput): MemoryResolution {
  const normalizedMerchant = normalizeMerchantName(
    input.merchantNormalized ?? input.merchantRaw ?? '',
  );
  const normalizedRawMerchant = normalizeMerchantName(input.merchantRaw ?? '');
  const aliases = (input.aliases ?? [])
    .filter((alias) => alias.active !== false)
    .filter((alias) => alias.categoryId)
    .filter((alias) => normalizeMerchantName(alias.normalizedMerchantName) === normalizedMerchant);

  const directAliasMatches = aliases.filter((alias) =>
    normalizeMerchantName(alias.rawMerchantName) === normalizedRawMerchant
  );
  const directAliasCategoryIds = uniqueValues(directAliasMatches.map((alias) => alias.categoryId).filter(isString));

  if (directAliasCategoryIds.length === 1) {
    const directConfidence = resolveMaxConfidence(directAliasMatches, 1);

    return {
      match: {
        categoryId: directAliasCategoryIds[0],
        confidence: Number(directConfidence.toFixed(3)),
        rationale: 'accepted_household_alias',
        source: 'merchant_alias',
      },
      outcome: 'reuse',
      reviewReason: null,
    };
  }

  if (directAliasCategoryIds.length > 1) {
    return {
      match: null,
      outcome: 'ambiguous',
      reviewReason: 'merchant_alias_conflict',
    };
  }

  const aliasCategoryIds = uniqueValues(aliases.map((alias) => alias.categoryId).filter(isString));

  if (aliasCategoryIds.length === 1) {
    const aliasConfidence = resolveMaxConfidence(aliases, 1);

    return {
      match: {
        categoryId: aliasCategoryIds[0],
        confidence: Number(aliasConfidence.toFixed(3)),
        rationale: 'accepted_household_alias',
        source: 'merchant_alias',
      },
      outcome: 'reuse',
      reviewReason: null,
    };
  }

  if (aliasCategoryIds.length > 1) {
    return {
      match: null,
      outcome: 'ambiguous',
      reviewReason: 'merchant_alias_conflict',
    };
  }

  const historicalMatches = (input.historicalMatches ?? [])
    .filter((match) => match.categoryId)
    .filter((match) => match.classificationMethod !== 'llm')
    .filter((match) => normalizeMerchantName(match.merchantNormalized) === normalizedMerchant)
    .filter((match) => (match.confidence ?? 0) >= STRONG_HISTORICAL_CONFIDENCE);
  const historicalCategoryIds = uniqueValues(historicalMatches.map((match) => match.categoryId).filter(isString));

  if (historicalMatches.length >= MIN_HISTORICAL_MATCHES && historicalCategoryIds.length === 1) {
    const totalConfidence = historicalMatches.reduce((sum, match) => sum + (match.confidence ?? 0), 0);
    const averageConfidence = totalConfidence / historicalMatches.length;

    return {
      match: {
        categoryId: historicalCategoryIds[0],
        confidence: Number(averageConfidence.toFixed(3)),
        rationale: 'deterministic_historical_consensus',
        source: 'historical_classification',
      },
      outcome: 'reuse',
      reviewReason: null,
    };
  }

  if (historicalMatches.length >= MIN_HISTORICAL_MATCHES && historicalCategoryIds.length > 1) {
    return {
      match: null,
      outcome: 'ambiguous',
      reviewReason: 'historical_classification_conflict',
    };
  }

  return {
    match: null,
    outcome: 'none',
    reviewReason: null,
  };
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function resolveMaxConfidence(
  rows: Array<{ confidence: number | null }>,
  defaultValue: number,
) {
  const confidences = rows
    .map((row) => row.confidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (confidences.length === 0) {
    return defaultValue;
  }

  return Math.max(...confidences);
}
