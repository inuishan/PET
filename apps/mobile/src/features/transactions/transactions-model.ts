import { formatShortDate } from '@/features/core-product/core-product-formatting';
import { type CoreProductState, getCategoryById } from '@/features/core-product/core-product-state';

export type TransactionFilter = 'all' | 'needs_review';
export type TransactionsLedgerState = Pick<CoreProductState, 'categories' | 'transactions'>;

export type TransactionsScreenState = {
  categoryOptions: Array<{
    id: string;
    name: string;
  }>;
  filterSummary: string[];
  groups: Array<{
    dateLabel: string;
    heading: string;
    totalAmount: number;
    transactionCount: number;
    transactions: Array<{
      amount: number;
      categoryId: string;
      categoryName: string;
      confidence: number;
      id: string;
      merchant: string;
      needsReview: boolean;
      ownerDisplayName: string | null;
      ownerMemberId: string | null;
      ownerScope: 'member' | 'shared' | 'unknown';
      postedAt: string;
      reviewPriority: 'high' | 'low' | 'medium' | 'none';
      reviewReason: string | null;
      reviewReasons: string[];
      sourceBadge: 'Card' | 'UPI';
      sourceContextLabel: string;
      sourceLabel: string;
      sourceType: 'credit_card_statement' | 'upi_whatsapp';
    }>;
  }>;
  reviewQueueCount: number;
  sourceSummary: {
    creditCardCount: number;
    upiCount: number;
    upiReviewCount: number;
  };
};

export type TransactionsScreenOptions = {
  asOf?: string;
  categoryId?: string | null;
  endOn?: string | null;
  ownerMemberId?: string | null;
  ownerScope?: 'all' | 'member' | 'shared' | 'unknown' | null;
  searchQuery?: string | null;
  sourceType?: 'all' | 'credit_card_statement' | 'upi_whatsapp' | null;
  startOn?: string | null;
  transactionIds?: string[] | null;
};

export function buildTransactionsScreenState(
  state: TransactionsLedgerState,
  filter: TransactionFilter = 'all',
  options: TransactionsScreenOptions = {}
): TransactionsScreenState {
  return {
    categoryOptions: state.categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
    filterSummary: buildFilterSummary(state, options),
    groups: groupTransactions(state, filter, options),
    reviewQueueCount: state.transactions.filter((transaction) => transaction.needsReview).length,
    sourceSummary: {
      creditCardCount: state.transactions.filter((transaction) => transaction.sourceType === 'credit_card_statement').length,
      upiCount: state.transactions.filter((transaction) => transaction.sourceType === 'upi_whatsapp').length,
      upiReviewCount: state.transactions.filter(
        (transaction) => transaction.sourceType === 'upi_whatsapp' && transaction.needsReview
      ).length,
    },
  };
}

export function reassignTransactionCategory(
  state: TransactionsLedgerState,
  transactionId: string,
  nextCategoryId: string
) {
  getCategoryById(state.categories, nextCategoryId);

  let hasUpdatedTransaction = false;
  const nextTransactions = state.transactions.map((transaction) => {
    if (transaction.id !== transactionId) {
      return transaction;
    }

    hasUpdatedTransaction = true;

    return {
      ...transaction,
      categoryId: nextCategoryId,
      needsReview: false,
      reviewReason: null,
      reviewReasons: [],
    };
  });

  if (!hasUpdatedTransaction) {
    throw new Error(`Unknown transaction: ${transactionId}`);
  }

  return {
    ...state,
    transactions: nextTransactions,
  };
}

function buildFilterSummary(state: TransactionsLedgerState, options: TransactionsScreenOptions) {
  const summary: string[] = [];
  const hasExplicitEvidenceSet = Boolean(options.transactionIds && options.transactionIds.length > 0);

  if (options.categoryId) {
    const categoryName = state.categories.find((category) => category.id === options.categoryId)?.name;

    if (categoryName) {
      summary.push(categoryName);
    }
  }

  if (options.sourceType && options.sourceType !== 'all') {
    summary.push(options.sourceType === 'upi_whatsapp' ? 'WhatsApp UPI' : 'Credit card');
  }

  if (options.startOn && options.endOn) {
    summary.push(formatPeriodLabel(options.startOn, options.endOn));
  }

  if (options.searchQuery && options.searchQuery.trim().length > 0) {
    summary.push(`Search: ${options.searchQuery.trim().toLowerCase()}`);
  }

  if (options.ownerMemberId) {
    const ownerName = state.transactions.find((transaction) => transaction.ownerMemberId === options.ownerMemberId)?.ownerDisplayName;

    if (ownerName) {
      summary.push(ownerName);
    }
  } else if (options.ownerScope === 'shared') {
    summary.push('Shared');
  } else if (options.ownerScope === 'unknown') {
    summary.push('Unknown');
  }

  if (hasExplicitEvidenceSet) {
    summary.push('Focused evidence set');
  }

  return summary;
}

function formatPeriodLabel(startOn: string, endOn: string) {
  const start = new Date(`${startOn}T00:00:00.000Z`);
  const end = new Date(`${endOn}T00:00:00.000Z`);

  if (
    start.getUTCDate() === 1 &&
    end.getUTCFullYear() === start.getUTCFullYear() &&
    end.getUTCMonth() === start.getUTCMonth() &&
    end.getUTCDate() >= 28
  ) {
    return start.toLocaleDateString('en-IN', {
      month: 'short',
      timeZone: 'UTC',
      year: 'numeric',
    });
  }

  if (
    start.getUTCDate() === 1 &&
    start.getUTCMonth() === 0 &&
    end.getUTCMonth() === 11 &&
    end.getUTCDate() === 31
  ) {
    return `${start.getUTCFullYear()}`;
  }

  return `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' })} - ${end.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  })}`;
}

function groupTransactions(
  state: TransactionsLedgerState,
  filter: TransactionFilter,
  options: TransactionsScreenOptions
): TransactionsScreenState['groups'] {
  const groupedTransactions = new Map<string, TransactionsScreenState['groups'][number]>();
  const filteredTransactions = filterTransactions(state, filter, options);
  const referenceDate = options.asOf ?? filteredTransactions[0]?.postedAt ?? state.transactions[0]?.postedAt ?? new Date().toISOString();

  for (const transaction of [...filteredTransactions].sort((left, right) => compareTransactions(left, right, filter))) {
    const dateLabel = formatShortDate(transaction.postedAt);
    const transactionWithCategory = {
      ...transaction,
      categoryName: getCategoryById(state.categories, transaction.categoryId).name,
      reviewPriority: deriveReviewPriority(transaction),
      sourceBadge: transaction.sourceType === 'upi_whatsapp' ? 'UPI' : 'Card',
    };
    const existingGroup = groupedTransactions.get(dateLabel);

    if (!existingGroup) {
      groupedTransactions.set(dateLabel, {
        dateLabel,
        heading: readRelativeHeading(transaction.postedAt, referenceDate),
        totalAmount: transaction.amount,
        transactionCount: 1,
        transactions: [transactionWithCategory],
      });
      continue;
    }

    groupedTransactions.set(dateLabel, {
      ...existingGroup,
      totalAmount: existingGroup.totalAmount + transaction.amount,
      transactionCount: existingGroup.transactionCount + 1,
      transactions: [...existingGroup.transactions, transactionWithCategory],
    });
  }

  const groupedValues = [...groupedTransactions.values()];

  if (filter !== 'needs_review') {
    return groupedValues;
  }

  return groupedValues.sort((left, right) => {
    const priorityDelta = getGroupPriorityWeight(right) - getGroupPriorityWeight(left);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return new Date(right.transactions[0]?.postedAt ?? 0).getTime() - new Date(left.transactions[0]?.postedAt ?? 0).getTime();
  });
}

function filterTransactions(
  state: TransactionsLedgerState,
  filter: TransactionFilter,
  options: TransactionsScreenOptions
) {
  const normalizedSearchQuery = options.searchQuery?.trim().toLowerCase() ?? '';
  const transactionIds = options.transactionIds ? new Set(options.transactionIds) : null;
  const hasExplicitEvidenceSet = transactionIds !== null && transactionIds.size > 0;

  return state.transactions.filter((transaction) => {
    if (filter === 'needs_review' && !transaction.needsReview) {
      return false;
    }

    if (hasExplicitEvidenceSet && !transactionIds.has(transaction.id)) {
      return false;
    }

    if (options.categoryId && transaction.categoryId !== options.categoryId) {
      return false;
    }

    if (options.sourceType && options.sourceType !== 'all' && transaction.sourceType !== options.sourceType) {
      return false;
    }

    if (options.ownerMemberId && transaction.ownerMemberId !== options.ownerMemberId) {
      return false;
    }

    if (options.ownerScope && options.ownerScope !== 'all' && transaction.ownerScope !== options.ownerScope) {
      return false;
    }

    if (options.startOn && readDateOnly(transaction.postedAt) < options.startOn) {
      return false;
    }

    if (options.endOn && readDateOnly(transaction.postedAt) > options.endOn) {
      return false;
    }

    if (normalizedSearchQuery.length > 0 && !transaction.merchant.toLowerCase().includes(normalizedSearchQuery)) {
      return false;
    }

    return true;
  });
}

function readDateOnly(isoDate: string) {
  return isoDate.slice(0, 10);
}

function readRelativeHeading(isoDate: string, referenceDate: string) {
  const transactionDate = startOfUtcDay(isoDate);
  const relativeTo = startOfUtcDay(referenceDate);
  const differenceInDays = Math.floor((relativeTo.getTime() - transactionDate.getTime()) / 86400000);

  if (differenceInDays === 0) {
    return 'Today';
  }

  if (differenceInDays === 1) {
    return 'Yesterday';
  }

  return formatShortDate(isoDate);
}

function startOfUtcDay(isoDate: string) {
  const date = new Date(isoDate);

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function compareTransactions(
  left: TransactionsLedgerState['transactions'][number],
  right: TransactionsLedgerState['transactions'][number],
  filter: TransactionFilter
) {
  if (filter === 'needs_review') {
    const priorityDelta = getPriorityWeight(deriveReviewPriority(right)) - getPriorityWeight(deriveReviewPriority(left));

    if (priorityDelta !== 0) {
      return priorityDelta;
    }
  }

  return new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime();
}

function deriveReviewPriority(
  transaction: TransactionsLedgerState['transactions'][number]
): TransactionsScreenState['groups'][number]['transactions'][number]['reviewPriority'] {
  if (!transaction.needsReview) {
    return 'none';
  }

  const reasons = new Set(
    [
      ...transaction.reviewReasons,
      ...(transaction.reviewReason ? transaction.reviewReason.split(',') : []),
    ]
      .map((reason) => reason.trim().toLowerCase())
      .filter((reason) => reason.length > 0)
  );

  if (
    transaction.confidence < 0.5 ||
    hasAnyReason(reasons, ['amount_ambiguous', 'missing_amount', 'missing_merchant', 'owner_conflict'])
  ) {
    return 'high';
  }

  if (
    transaction.confidence < 0.8 ||
    hasAnyReason(reasons, ['low_confidence', 'needs_review', 'owner_unknown'])
  ) {
    return 'medium';
  }

  return 'low';
}

function getPriorityWeight(priority: TransactionsScreenState['groups'][number]['transactions'][number]['reviewPriority']) {
  switch (priority) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}

function hasAnyReason(reasons: Set<string>, values: string[]) {
  return values.some((value) => reasons.has(value));
}

function getGroupPriorityWeight(group: TransactionsScreenState['groups'][number]) {
  return group.transactions.reduce((highestWeight, transaction) => {
    return Math.max(highestWeight, getPriorityWeight(transaction.reviewPriority));
  }, 0);
}
