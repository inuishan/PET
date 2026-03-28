import type { LedgerTransaction } from './core-product-state';

export type Phase1LedgerProjectionInput = {
  amount: number;
  categoryId?: string | null;
  confidence?: number | null;
  fingerprint?: string | null;
  id?: string | null;
  merchantRaw: string;
  metadata?: {
    cardName?: string | null;
    statementLabel?: string | null;
  } | null;
  needsReview: boolean;
  postedAt?: string | null;
  reviewReason?: string | null;
  transactionDate: string;
};

type ProjectionDefaults = {
  cardLabel: string;
  categoryId: string;
  statementLabel: string;
};

export function projectPhase1TransactionsToLedgerTransactions(
  transactions: Phase1LedgerProjectionInput[],
  defaults: ProjectionDefaults
): LedgerTransaction[] {
  return transactions.map((transaction, index) => ({
    amount: transaction.amount,
    cardLabel: normalizeLabel(transaction.metadata?.cardName, defaults.cardLabel),
    categoryId: normalizeLabel(transaction.categoryId, defaults.categoryId),
    confidence: transaction.confidence ?? 0,
    id: transaction.id ?? transaction.fingerprint ?? `phase-1-ingested-${index + 1}`,
    merchant: transaction.merchantRaw,
    needsReview: transaction.needsReview,
    ownerDisplayName: null,
    ownerScope: 'unknown',
    postedAt: transaction.postedAt ?? `${transaction.transactionDate}T08:00:00.000Z`,
    reviewReason: transaction.reviewReason ?? null,
    reviewReasons: [],
    statementLabel: normalizeLabel(transaction.metadata?.statementLabel, defaults.statementLabel),
    sourceContextLabel: normalizeLabel(transaction.metadata?.statementLabel, defaults.statementLabel),
    sourceLabel: normalizeLabel(transaction.metadata?.cardName, defaults.cardLabel),
    sourceType: 'credit_card_statement',
  }));
}

function normalizeLabel(value: string | null | undefined, fallbackValue: string) {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallbackValue;
}
