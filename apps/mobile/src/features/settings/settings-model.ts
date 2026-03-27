import { formatRelativeDuration } from '@/features/core-product/core-product-formatting';
import { type CoreProductState, type ParserProfileStatus } from '@/features/core-product/core-product-state';

const profileStatusRank: Record<ParserProfileStatus, number> = {
  active: 2,
  fallback: 1,
  needs_attention: 0,
};

export function buildSettingsSnapshot(state: CoreProductState, asOf: string = state.asOf) {
  const categories = state.categories
    .map((category) => {
      const matchingTransactions = state.transactions.filter((transaction) => transaction.categoryId === category.id);

      return {
        id: category.id,
        name: category.name,
        reviewCount: matchingTransactions.filter((transaction) => transaction.needsReview).length,
        tone: category.tone,
        totalAmount: matchingTransactions.reduce((totalAmount, transaction) => totalAmount + transaction.amount, 0),
        transactionCount: matchingTransactions.length,
      };
    })
    .sort((left, right) => {
      if (right.totalAmount !== left.totalAmount) {
        return right.totalAmount - left.totalAmount;
      }

      return left.name.localeCompare(right.name);
    });

  const parserProfiles = [...state.parserProfiles].sort((left, right) => {
    const statusRankDifference = profileStatusRank[left.status] - profileStatusRank[right.status];

    if (statusRankDifference !== 0) {
      return statusRankDifference;
    }

    return new Date(right.lastUsedAt).getTime() - new Date(left.lastUsedAt).getTime();
  });

  return {
    categories,
    notificationPreferences: [...state.notificationPreferences],
    parserProfiles,
    syncHealth: {
      failureCount: state.sync.failureCount,
      lastAttemptLabel: formatRelativeDuration(state.sync.lastAttemptAt, asOf),
      lastError: state.sync.lastError,
      lastSuccessfulSyncLabel: formatRelativeDuration(state.sync.lastSuccessfulSyncAt, asOf),
      pendingStatementCount: state.sync.pendingStatementCount,
      status: state.sync.status,
    },
  };
}
