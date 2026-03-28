import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeParsedStatementPayload } from '../../supabase/functions/_shared/statement-normalization.mjs';
import { createSupabaseWhatsAppIngestRepository } from '../../supabase/functions/_shared/whatsapp-review.ts';
import { parseWhatsAppExpenseMessage } from '../../supabase/functions/_shared/whatsapp-parser.ts';

const householdId = '11111111-1111-4111-8111-111111111111';
const senderMemberId = '22222222-2222-4222-8222-222222222222';
const spouseMemberId = '33333333-3333-4333-8333-333333333333';
const participantId = '44444444-4444-4444-8444-444444444444';

test('Phase 4 learned merchant aliases are reused before fallback categorization', async () => {
  const repository = createSupabaseWhatsAppIngestRepository(createSupabaseStub({
    aliases: [
      {
        category_id: 'category-groceries',
        confidence: 0.98,
        household_id: householdId,
        normalized_merchant_name: 'bigbasket',
      },
    ],
  }));

  const classification = await repository.classifyParsedTransaction({
    confidence: 0.61,
    householdId,
    merchantNormalized: 'bigbasket',
    merchantRaw: 'BigBasket',
  });

  assert.deepEqual(classification, {
    categoryId: 'category-groceries',
    confidence: 0.98,
    method: 'inherited',
    rationale: 'merchant_alias_match',
  });
});

test('Phase 4 confidence scoring stays fail-closed when payer attribution conflicts', () => {
  const clearCapture = parseWhatsAppExpenseMessage({
    householdId,
    id: 'message-clear',
    normalizedMessageText: 'Paid 620 to BigBasket for staples',
    participant: {
      displayName: 'Ishan',
      id: participantId,
      memberId: senderMemberId,
      phoneE164: '+919999888877',
    },
    providerMessageId: 'wamid.clear',
    providerSentAt: '2026-03-27T08:45:00.000Z',
    householdMembers: [
      { displayName: 'Ishan', id: senderMemberId },
      { displayName: 'Neha', id: spouseMemberId },
    ],
  });
  const conflictingCapture = parseWhatsAppExpenseMessage({
    householdId,
    id: 'message-conflict',
    normalizedMessageText: 'Neha paid 620 to BigBasket for staples',
    participant: {
      displayName: 'Ishan',
      id: participantId,
      memberId: senderMemberId,
      phoneE164: '+919999888877',
    },
    providerMessageId: 'wamid.conflict',
    providerSentAt: '2026-03-27T08:45:00.000Z',
    householdMembers: [
      { displayName: 'Ishan', id: senderMemberId },
      { displayName: 'Neha', id: spouseMemberId },
    ],
  });

  assert.equal(clearCapture.parseStatus, 'parsed');
  assert.equal(conflictingCapture.parseStatus, 'needs_review');
  assert.ok(clearCapture.confidence > conflictingCapture.confidence);
  assert.ok(conflictingCapture.reviewReasons.includes('owner_conflict'));
  assert.ok(conflictingCapture.confidence < 0.85);
});

test('Phase 4 statement normalization keeps parser-flagged rows in review even above the confidence threshold', () => {
  const normalized = normalizeParsedStatementPayload({
    rows: [
      {
        amount: '1299',
        confidence: 0.91,
        merchant: 'Spotify',
        needsReview: true,
        reviewReason: 'cadence_conflict',
        transactionDate: '2026-03-18',
      },
    ],
    statement: {
      bankName: 'American Express',
      billingPeriodEnd: '2026-03-31',
      billingPeriodStart: '2026-03-01',
      cardName: 'MRCC',
      householdId,
      parserProfileName: 'amex-mrcc',
      providerFileId: 'drive-file-spotify',
      providerFileName: 'amex-march-2026.pdf',
    },
  });

  assert.equal(normalized.summary.needsReviewCount, 1);
  assert.equal(normalized.summary.parseStatus, 'partial');
  assert.equal(normalized.rows[0]?.needsReview, true);
  assert.equal(normalized.rows[0]?.status, 'needs_review');
  assert.match(normalized.rows[0]?.reviewReason ?? '', /cadence_conflict/);
});

function createSupabaseStub(input) {
  return {
    from(table) {
      if (table !== 'merchant_aliases') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select() {
          const filters = [];

          return {
            eq(column, value) {
              filters.push((row) => row[column] === value);
              return this;
            },
            async maybeSingle() {
              const data = (input.aliases ?? []).find((row) => filters.every((filter) => filter(row))) ?? null;

              return {
                data,
                error: null,
              };
            },
          };
        },
      };
    },
  };
}
