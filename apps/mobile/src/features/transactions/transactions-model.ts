import { formatShortDate } from '@/features/core-product/core-product-formatting';
import { type CoreProductState, getCategoryById } from '@/features/core-product/core-product-state';

export type TransactionFilter = 'all' | 'needs_review';
export type TransactionsLedgerState = Pick<CoreProductState, 'categories' | 'transactions'>;

export type TransactionsScreenState = {
  categoryOptions: Array<{
    id: string;
    name: string;
  }>;
  groups: Array<{
    dateLabel: string;
    totalAmount: number;
    transactionCount: number;
    transactions: Array<{
      amount: number;
      cardLabel: string;
      categoryId: string;
      categoryName: string;
      confidence: number;
      id: string;
      merchant: string;
      needsReview: boolean;
      postedAt: string;
      reviewReason: string | null;
      statementLabel: string;
    }>;
  }>;
  reviewQueueCount: number;
};

export function buildTransactionsScreenState(
  state: TransactionsLedgerState,
  filter: TransactionFilter = 'all'
): TransactionsScreenState {
  return {
    categoryOptions: state.categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
    groups: groupTransactions(state, filter),
    reviewQueueCount: state.transactions.filter((transaction) => transaction.needsReview).length,
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

function groupTransactions(
  state: TransactionsLedgerState,
  filter: TransactionFilter
): TransactionsScreenState['groups'] {
  const groupedTransactions = new Map<string, TransactionsScreenState['groups'][number]>();
  const filteredTransactions =
    filter === 'needs_review'
      ? state.transactions.filter((transaction) => transaction.needsReview)
      : state.transactions;

  for (const transaction of [...filteredTransactions].sort(
    (left, right) => new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime()
  )) {
    const dateLabel = formatShortDate(transaction.postedAt);
    const transactionWithCategory = {
      ...transaction,
      categoryName: getCategoryById(state.categories, transaction.categoryId).name,
    };
    const existingGroup = groupedTransactions.get(dateLabel);

    if (!existingGroup) {
      groupedTransactions.set(dateLabel, {
        dateLabel,
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

  return [...groupedTransactions.values()];
}
