import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StatementValidationError,
  normalizeParsedStatementPayload,
} from '../../supabase/functions/_shared/statement-normalization.mjs';

const baseStatement = {
  householdId: '11111111-1111-4111-8111-111111111111',
  providerFileId: 'drive-file-123',
  providerFileName: 'hdfc-april-2026.pdf',
  bankName: 'HDFC Bank',
  cardName: 'Regalia Gold',
  parserProfileName: 'hdfc-regalia-gold',
  billingPeriodStart: '2026-04-01',
  billingPeriodEnd: '2026-04-30',
};

test('normalizeParsedStatementPayload creates deterministic rows and review flags', () => {
  const normalized = normalizeParsedStatementPayload({
    statement: baseStatement,
    rows: [
      {
        merchant: '  Swiggy  ',
        description: 'Food order',
        amount: '₹1,234.50',
        transactionDate: '2026-04-12',
        confidence: 0.93,
      },
      {
        merchant: 'Swiggy',
        description: 'Food order',
        amount: '1234.50',
        transactionDate: '2026-04-12',
        confidence: 0.92,
      },
      {
        merchant: 'Mystery Merchant',
        amount: '399',
        transactionDate: '2026-04-18',
        confidence: 0.44,
      },
    ],
  });

  assert.equal(normalized.rows.length, 3);
  assert.equal(normalized.rows[0].merchantRaw, 'Swiggy');
  assert.equal(normalized.rows[0].merchantNormalized, 'swiggy');
  assert.notEqual(normalized.rows[0].fingerprint, normalized.rows[1].fingerprint);
  assert.equal(normalized.rows[2].needsReview, true);
  assert.equal(normalized.rows[2].status, 'needs_review');
  assert.equal(normalized.summary.transactionCount, 3);
  assert.equal(normalized.summary.needsReviewCount, 1);
  assert.equal(normalized.summary.parseStatus, 'partial');
});

test('normalizeParsedStatementPayload skips non-expense rows and exposes them in the summary', () => {
  const normalized = normalizeParsedStatementPayload({
    statement: baseStatement,
    rows: [
      {
        merchant: 'Card Payment',
        description: 'Auto debit',
        amount: '(5,000.00)',
        transactionDate: '2026-04-20',
        confidence: 0.88,
      },
    ],
  });

  assert.equal(normalized.rows.length, 0);
  assert.equal(normalized.skippedRows.length, 1);
  assert.equal(normalized.skippedRows[0].reason, 'non_expense_amount');
  assert.equal(normalized.summary.parseStatus, 'failed');
});

test('normalizeParsedStatementPayload skips structurally invalid rows instead of failing the whole statement', () => {
  const normalized = normalizeParsedStatementPayload({
    statement: baseStatement,
    rows: [
      {
        merchant: 'Valid Merchant',
        amount: '199',
        transactionDate: '2026-04-09',
        confidence: 0.8,
      },
      {
        merchant: 'Broken Merchant',
        amount: '99',
        transactionDate: '2026-04-10',
        currency: 'rupees',
      },
    ],
  });

  assert.equal(normalized.rows.length, 1);
  assert.equal(normalized.skippedRows.length, 1);
  assert.equal(normalized.skippedRows[0].reason, 'invalid_row_shape');
  assert.equal(normalized.summary.parseStatus, 'partial');
});

test('normalizeParsedStatementPayload rejects invalid statement metadata', () => {
  assert.throws(
    () =>
      normalizeParsedStatementPayload({
        statement: {
          ...baseStatement,
          providerFileId: '   ',
        },
        rows: [],
      }),
    StatementValidationError,
  );
});
