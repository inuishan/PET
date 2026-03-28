import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeMerchantName,
  resolveMerchantClassificationMemory,
} from '../../supabase/functions/_shared/classification-memory.ts';

test('resolveMerchantClassificationMemory reuses a single accepted alias immediately', () => {
  const result = resolveMerchantClassificationMemory({
    aliases: [
      {
        categoryId: 'category-groceries',
        confidence: 1,
        confirmationCount: 1,
        normalizedMerchantName: 'zepto',
        rawMerchantName: 'Zepto',
      },
    ],
    historicalMatches: [],
    merchantNormalized: 'zepto',
    merchantRaw: 'Zepto',
  });

  assert.equal(result.outcome, 'reuse');
  assert.equal(result.match?.categoryId, 'category-groceries');
  assert.equal(result.match?.source, 'merchant_alias');
  assert.equal(result.match?.rationale, 'accepted_household_alias');
  assert.equal(result.reviewReason, null);
});

test('resolveMerchantClassificationMemory degrades conflicting aliases into an explicit ambiguity signal', () => {
  const result = resolveMerchantClassificationMemory({
    aliases: [
      {
        categoryId: 'category-groceries',
        confidence: 1,
        confirmationCount: 1,
        normalizedMerchantName: 'amazon',
        rawMerchantName: 'Amazon',
      },
      {
        categoryId: 'category-shopping',
        confidence: 1,
        confirmationCount: 1,
        normalizedMerchantName: 'amazon',
        rawMerchantName: 'AMAZON',
      },
    ],
    historicalMatches: [],
    merchantNormalized: 'amazon',
    merchantRaw: 'Amazon',
  });

  assert.equal(result.outcome, 'ambiguous');
  assert.equal(result.match, null);
  assert.equal(result.reviewReason, 'merchant_alias_conflict');
});

test('resolveMerchantClassificationMemory reuses deterministic historical consensus when alias memory is absent', () => {
  const result = resolveMerchantClassificationMemory({
    aliases: [],
    historicalMatches: [
      {
        categoryId: 'category-transport',
        classificationMethod: 'rules',
        confidence: 0.92,
        merchantNormalized: 'uber',
      },
      {
        categoryId: 'category-transport',
        classificationMethod: 'inherited',
        confidence: 0.96,
        merchantNormalized: 'uber',
      },
    ],
    merchantNormalized: 'uber',
    merchantRaw: 'Uber',
  });

  assert.equal(result.outcome, 'reuse');
  assert.equal(result.match?.categoryId, 'category-transport');
  assert.equal(result.match?.source, 'historical_classification');
  assert.equal(result.match?.rationale, 'deterministic_historical_consensus');
});

test('resolveMerchantClassificationMemory ignores weak single historical matches', () => {
  const result = resolveMerchantClassificationMemory({
    aliases: [],
    historicalMatches: [
      {
        categoryId: 'category-groceries',
        classificationMethod: 'rules',
        confidence: 0.88,
        merchantNormalized: 'zepto',
      },
    ],
    merchantNormalized: 'zepto',
    merchantRaw: 'Zepto',
  });

  assert.equal(result.outcome, 'none');
  assert.equal(result.match, null);
  assert.equal(result.reviewReason, null);
});

test('normalizeMerchantName keeps a single normalization path for household memory', () => {
  assert.equal(normalizeMerchantName('  AMAZON-PAY   UPI  '), 'amazon pay upi');
});
