import { formatShortDate } from '@/features/core-product/core-product-formatting';
import { type CoreProductState, getCategoryById } from '@/features/core-product/core-product-state';

export type TransactionFilter = 'all' | 'needs_review';

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
  state: CoreProductState,
  filter: TransactionFilter = 'all'
): TransactionsScreenState {
  const filteredTransactions =
    filter === 'needs_review'
      ? state.transactions.filter((transaction) => transaction.needsReview)
      : state.transactions;

  const groupedTransactions = [...filteredTransactions]
    .sort((left, right) => new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime())
    .reduce<TransactionsScreenState['groups']>((groups, transaction) => {
      const dateLabel = formatShortDate(transaction.postedAt);
      const nextTransaction = {
        ...transaction,
        categoryName: getCategoryById(state.categories, transaction.categoryId).name,
      };
      const existingGroupIndex = groups.findIndex((group) => group.dateLabel === dateLabel);

      if (existingGroupIndex === -1) {
        return [
          ...groups,
          {
            dateLabel,
            totalAmount: transaction.amount,
            transactionCount: 1,
            transactions: [nextTransaction],
          },
        ];
      }

      const existingGroup = groups[existingGroupIndex];

      return groups.map((group, groupIndex) => {
        if (groupIndex !== existingGroupIndex || !existingGroup) {
          return group;
        }

        return {
          dateLabel,
          totalAmount: existingGroup.totalAmount + transaction.amount,
          transactionCount: existingGroup.transactionCount + 1,
          transactions: [...existingGroup.transactions, nextTransaction],
        };
      });
    }, []);

  return {
    categoryOptions: state.categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
    groups: groupedTransactions,
    reviewQueueCount: state.transactions.filter((transaction) => transaction.needsReview).length,
  };
}

export function reassignTransactionCategory(
  state: CoreProductState,
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
