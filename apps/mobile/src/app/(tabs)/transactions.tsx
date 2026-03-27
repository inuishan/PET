import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';
import { formatCurrency, formatShortDate } from '@/features/core-product/core-product-formatting';
import {
  buildTransactionsScreenState,
  reassignTransactionCategory,
  type TransactionFilter,
  type TransactionsLedgerState,
} from '@/features/transactions/transactions-model';
import {
  loadTransactionsSnapshot,
  saveTransactionCategoryAssignment,
} from '@/features/transactions/transactions-service';
import { getSupabaseClient } from '@/lib/supabase';

const filterOptions: Array<{
  id: TransactionFilter;
  label: (reviewQueueCount: number) => string;
}> = [
  { id: 'all', label: () => 'All rows' },
  { id: 'needs_review', label: (reviewQueueCount) => `Needs review (${reviewQueueCount})` },
];

export default function TransactionsScreen() {
  const { session } = useAuthSession();
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [supabase] = useState(() => getSupabaseClient());
  const queryClient = useQueryClient();
  const householdId =
    session.status === 'signed_in' && session.household.status === 'ready' ? session.household.householdId : null;
  const transactionsQueryKey = ['transactions', householdId] as const;
  const transactionsQuery = useQuery({
    enabled: householdId !== null,
    queryFn: async () => {
      if (!householdId) {
        throw new Error('A ready household is required to load transactions.');
      }

      return loadTransactionsSnapshot(supabase, householdId);
    },
    queryKey: transactionsQueryKey,
  });
  const reassignCategoryMutation = useMutation({
    mutationFn: (input: { categoryId: string; transactionId: string }) =>
      saveTransactionCategoryAssignment(supabase, input),
    onSuccess: (_result, variables) => {
      queryClient.setQueryData<TransactionsLedgerState | undefined>(transactionsQueryKey, (currentState) => {
        if (!currentState) {
          return currentState;
        }

        return reassignTransactionCategory(currentState, variables.transactionId, variables.categoryId);
      });
    },
    onSettled: async () => {
      if (!householdId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: transactionsQueryKey });
    },
  });
  const ledgerState = transactionsQuery.data ?? null;
  const screenState = ledgerState ? buildTransactionsScreenState(ledgerState, filter) : null;
  const preferredTransactions =
    filter === 'needs_review' ? (screenState?.groups.flatMap((group) => group.transactions) ?? []) : (ledgerState?.transactions ?? []);
  const resolvedSelectedTransactionId =
    preferredTransactions.some((transaction) => transaction.id === selectedTransactionId)
      ? selectedTransactionId
      : preferredTransactions[0]?.id ?? null;
  const selectedTransaction = resolvedSelectedTransactionId
    ? ledgerState?.transactions.find((transaction) => transaction.id === resolvedSelectedTransactionId) ?? null
    : null;
  const selectedCategory =
    selectedTransaction
      ? ledgerState?.categories.find((category) => category.id === selectedTransaction.categoryId) ??
        ledgerState?.categories[0] ??
        null
      : null;

  useEffect(() => {
    if (resolvedSelectedTransactionId !== selectedTransactionId) {
      setSelectedTransactionId(resolvedSelectedTransactionId);
    }
  }, [resolvedSelectedTransactionId, selectedTransactionId]);

  if (transactionsQuery.isPending) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Transactions</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Loading household transactions</Text>
          <Text style={styles.body}>Pulling the latest statement rows and review queue from Supabase.</Text>
        </View>
      </ScrollView>
    );
  }

  if (transactionsQuery.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Transactions</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Unable to load transactions</Text>
          <Text style={styles.body}>
            {transactionsQuery.error instanceof Error
              ? transactionsQuery.error.message
              : 'The review queue could not be loaded.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void transactionsQuery.refetch()}
            style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (!transactionsQuery.data) {
    return null;
  }

  if (!ledgerState || !screenState) {
    return null;
  }

  function handleReassignCategory(nextCategoryId: string) {
    if (!selectedTransaction || reassignCategoryMutation.isPending) {
      return;
    }

    reassignCategoryMutation.mutate({
      categoryId: nextCategoryId,
      transactionId: selectedTransaction.id,
    });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Transactions</Text>
      <Text style={styles.body}>
        Review the parser output, isolate low-confidence rows, and correct categories before the
        monthly totals are trusted.
      </Text>

      <View style={styles.filterRow}>
        {filterOptions.map((option) => {
          const isActive = filter === option.id;

          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              onPress={() => setFilter(option.id)}
              style={[styles.filterChip, isActive ? styles.filterChipActive : null]}>
              <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                {option.label(screenState.reviewQueueCount)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedTransaction && selectedCategory ? (
        <View style={styles.detailCard}>
          <Text style={styles.sectionLabel}>Selected transaction</Text>
          <Text style={styles.detailTitle}>{selectedTransaction.merchant}</Text>
          <Text style={styles.detailAmount}>{formatCurrency(selectedTransaction.amount)}</Text>
          <Text style={styles.detailMeta}>
            {selectedCategory.name} · {formatShortDate(selectedTransaction.postedAt)} · {selectedTransaction.cardLabel}
          </Text>
          <Text style={styles.detailBody}>
            {selectedTransaction.reviewReason ?? 'This row is already trusted and included in the household totals.'}
          </Text>
          {reassignCategoryMutation.error instanceof Error ? (
            <Text style={styles.errorText}>{reassignCategoryMutation.error.message}</Text>
          ) : null}

          <View style={styles.categoryGrid}>
            {screenState.categoryOptions.map((category) => {
              const isActive = selectedTransaction.categoryId === category.id;

              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  disabled={reassignCategoryMutation.isPending}
                  onPress={() => handleReassignCategory(category.id)}
                  style={[
                    styles.categoryChip,
                    isActive ? styles.categoryChipActive : null,
                    reassignCategoryMutation.isPending ? styles.categoryChipDisabled : null,
                  ]}>
                  <Text style={[styles.categoryChipText, isActive ? styles.categoryChipTextActive : null]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Review queue clear</Text>
          <Text style={styles.body}>All flagged transactions in this household have been reviewed.</Text>
        </View>
      )}

      {screenState.groups.length > 0 ? (
        <View style={styles.section}>
          {screenState.groups.map((group) => (
            <View key={group.dateLabel} style={styles.groupCard}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>{group.dateLabel}</Text>
                <Text style={styles.groupTotal}>{formatCurrency(group.totalAmount)}</Text>
              </View>

              {group.transactions.map((transaction) => {
                const isSelected = selectedTransaction?.id === transaction.id;

                return (
                  <Pressable
                    key={transaction.id}
                    accessibilityRole="button"
                    onPress={() => setSelectedTransactionId(transaction.id)}
                    style={[styles.transactionRow, isSelected ? styles.transactionRowSelected : null]}>
                    <View style={styles.transactionMeta}>
                      <Text style={styles.transactionMerchant}>{transaction.merchant}</Text>
                      <Text style={styles.transactionDetail}>
                        {transaction.categoryName} · {transaction.statementLabel}
                      </Text>
                    </View>
                    <View style={styles.amountMeta}>
                      <Text style={styles.transactionAmount}>{formatCurrency(transaction.amount)}</Text>
                      {transaction.needsReview ? <Text style={styles.reviewBadge}>Needs review</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No rows in this view</Text>
          <Text style={styles.body}>
            {filter === 'needs_review'
              ? 'All flagged rows are resolved for this household.'
              : 'No statement rows are available for this household yet.'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  amountMeta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  body: {
    color: '#5d5346',
    fontSize: 15,
    lineHeight: 22,
  },
  categoryChip: {
    backgroundColor: '#f4eadc',
    borderColor: '#e3ccb0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  categoryChipActive: {
    backgroundColor: '#182026',
    borderColor: '#182026',
  },
  categoryChipDisabled: {
    opacity: 0.6,
  },
  categoryChipText: {
    color: '#7b6448',
    fontSize: 13,
    fontWeight: '700',
  },
  categoryChipTextActive: {
    color: '#fffaf2',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  content: {
    backgroundColor: '#f4eadc',
    gap: 18,
    padding: 20,
    paddingBottom: 36,
  },
  detailAmount: {
    color: '#182026',
    fontSize: 28,
    fontWeight: '800',
  },
  detailBody: {
    color: '#5d5346',
    fontSize: 14,
    lineHeight: 21,
  },
  detailCard: {
    backgroundColor: '#fffaf2',
    borderColor: '#e3ccb0',
    borderRadius: 26,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  detailMeta: {
    color: '#7b6448',
    fontSize: 13,
    lineHeight: 20,
  },
  detailTitle: {
    color: '#182026',
    fontSize: 24,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#fffaf2',
    borderColor: '#ead5b9',
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  emptyTitle: {
    color: '#182026',
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    color: '#a64b2a',
    fontSize: 13,
    fontWeight: '700',
  },
  filterChip: {
    backgroundColor: '#efe1cc',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: '#182026',
  },
  filterChipText: {
    color: '#7b6448',
    fontSize: 13,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#fffaf2',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  groupCard: {
    backgroundColor: '#fffaf2',
    borderColor: '#ead5b9',
    borderRadius: 24,
    borderWidth: 1,
    gap: 6,
    padding: 18,
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  groupTitle: {
    color: '#182026',
    fontSize: 18,
    fontWeight: '800',
  },
  groupTotal: {
    color: '#7b6448',
    fontSize: 14,
    fontWeight: '700',
  },
  reviewBadge: {
    color: '#a64b2a',
    fontSize: 12,
    fontWeight: '700',
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#182026',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#fffaf2',
    fontSize: 13,
    fontWeight: '700',
  },
  screen: {
    backgroundColor: '#f4eadc',
    flex: 1,
  },
  section: {
    gap: 14,
  },
  sectionLabel: {
    color: '#7b6448',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#182026',
    fontSize: 32,
    fontWeight: '800',
  },
  transactionAmount: {
    color: '#182026',
    fontSize: 16,
    fontWeight: '800',
  },
  transactionDetail: {
    color: '#7b6448',
    fontSize: 13,
  },
  transactionMerchant: {
    color: '#182026',
    fontSize: 15,
    fontWeight: '700',
  },
  transactionMeta: {
    flex: 1,
    gap: 4,
  },
  transactionRow: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  transactionRowSelected: {
    backgroundColor: '#f8ecdc',
  },
});
