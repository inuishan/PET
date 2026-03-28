import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';
import { createAnalyticsPeriodWindow } from '@/features/analytics/analytics-model';
import { formatCurrency } from '@/features/core-product/core-product-formatting';
import { createDashboardQueryKey } from '@/features/dashboard/dashboard-service';
import {
  readTransactionsDrilldownParams,
  resolveTransactionsDrilldown,
  type TransactionsPeriodBucket,
} from '@/features/transactions/transactions-drilldown';
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

const reviewFilterOptions: Array<{
  id: TransactionFilter;
  label: (reviewQueueCount: number) => string;
}> = [
  { id: 'all', label: () => 'All rows' },
  { id: 'needs_review', label: (reviewQueueCount) => `Needs review (${reviewQueueCount})` },
];

const periodOptions: Array<{
  id: TransactionsPeriodBucket;
  label: string;
}> = [
  { id: 'all', label: 'All time' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

export default function TransactionsScreen() {
  const { session } = useAuthSession();
  const localSearchParams = useLocalSearchParams();
  const initialDrilldown = resolveTransactionsDrilldown(readTransactionsDrilldownParams(localSearchParams));
  const drilldownSignature = [
    initialDrilldown.categoryId,
    initialDrilldown.endOn,
    initialDrilldown.ownerMemberId,
    initialDrilldown.ownerScope,
    initialDrilldown.periodBucket,
    initialDrilldown.searchQuery,
    initialDrilldown.sourceType,
    initialDrilldown.startOn,
    initialDrilldown.subtitle,
    initialDrilldown.title,
    initialDrilldown.transactionIds.join(','),
  ].join('|');
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [searchQuery, setSearchQuery] = useState(initialDrilldown.searchQuery);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialDrilldown.categoryId);
  const [selectedPeriodBucket, setSelectedPeriodBucket] = useState<TransactionsPeriodBucket>(initialDrilldown.periodBucket);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [includeEvidenceSet, setIncludeEvidenceSet] = useState(initialDrilldown.transactionIds.length > 0);
  const [supabase] = useState(() => getSupabaseClient());
  const [transactionsAsOf] = useState(() => new Date().toISOString());
  const queryClient = useQueryClient();
  const householdId =
    session.status === 'signed_in' && session.household.status === 'ready' ? session.household.householdId : null;
  const dashboardQueryKey = createDashboardQueryKey(householdId);
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

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardQueryKey }),
      ]);
    },
  });
  const ledgerState = transactionsQuery.data ?? null;
  const resolvedPeriod = resolvePeriodWindow({
    analyticsAsOf: transactionsAsOf,
    initialDrilldown,
    selectedPeriodBucket,
  });
  const screenState = ledgerState
    ? buildTransactionsScreenState(ledgerState, filter, {
        asOf: transactionsAsOf,
        categoryId: selectedCategoryId,
        endOn: resolvedPeriod.endOn,
        ownerMemberId: initialDrilldown.ownerMemberId,
        ownerScope: initialDrilldown.ownerScope,
        searchQuery,
        sourceType: initialDrilldown.sourceType,
        startOn: resolvedPeriod.startOn,
        transactionIds: includeEvidenceSet ? initialDrilldown.transactionIds : [],
      })
    : null;
  const preferredTransactions = screenState?.groups.flatMap((group) => group.transactions) ?? [];
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

  useEffect(() => {
    setFilter('all');
    setSearchQuery(initialDrilldown.searchQuery);
    setSelectedCategoryId(initialDrilldown.categoryId);
    setSelectedPeriodBucket(initialDrilldown.periodBucket);
    setSelectedTransactionId(null);
    setIncludeEvidenceSet(initialDrilldown.transactionIds.length > 0);
  }, [drilldownSignature]);

  function clearEvidenceSet() {
    if (includeEvidenceSet) {
      setIncludeEvidenceSet(false);
    }
  }

  if (transactionsQuery.isPending) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Transactions</Text>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Loading transactions</Text>
          <Text style={styles.body}>Pulling the latest household rows, filters, and review queue from Supabase.</Text>
        </View>
      </ScrollView>
    );
  }

  if (transactionsQuery.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Transactions</Text>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Unable to load transactions</Text>
          <Text style={styles.body}>
            {transactionsQuery.error instanceof Error
              ? transactionsQuery.error.message
              : 'The transactions view could not be loaded.'}
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
        Search by vendor, filter by Category and Period, and keep the analytics drill-down view tied to the real ledger rows.
      </Text>

      {initialDrilldown.title || screenState.filterSummary.length > 0 ? (
        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>Focused view</Text>
          <Text style={styles.heroTitle}>{initialDrilldown.title ?? 'Filtered transaction set'}</Text>
          <Text style={styles.heroBody}>
            {initialDrilldown.subtitle ?? 'Drilled down from analytics into the matching household transaction subset.'}
          </Text>
          {screenState.filterSummary.length > 0 ? (
            <Text style={styles.heroFootnote}>{screenState.filterSummary.join(' · ')}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Search</Text>
        <TextInput
          accessibilityLabel="Search by vendor"
          onChangeText={(value) => {
            clearEvidenceSet();
            setSearchQuery(value);
          }}
          placeholder="Search by vendor..."
          placeholderTextColor="#8993a0"
          style={styles.searchInput}
          value={searchQuery}
        />

        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.filterRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              clearEvidenceSet();
              setSelectedCategoryId(null);
            }}
            style={[styles.filterChip, selectedCategoryId === null ? styles.filterChipActive : null]}>
            <Text style={[styles.filterChipText, selectedCategoryId === null ? styles.filterChipTextActive : null]}>
              All
            </Text>
          </Pressable>
          {screenState.categoryOptions.map((category) => {
            const isActive = selectedCategoryId === category.id;

            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                onPress={() => {
                  clearEvidenceSet();
                  setSelectedCategoryId(category.id);
                }}
                style={[styles.filterChip, isActive ? styles.filterChipActive : null]}>
                <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Period</Text>
        <View style={styles.filterRow}>
          {periodOptions.map((option) => {
            const isActive = selectedPeriodBucket === option.id;

            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                onPress={() => {
                  clearEvidenceSet();
                  setSelectedPeriodBucket(option.id);
                }}
                style={[styles.filterChip, isActive ? styles.filterChipActive : null]}>
                <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
          {initialDrilldown.periodBucket === 'custom' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedPeriodBucket('custom')}
              style={[styles.filterChip, selectedPeriodBucket === 'custom' ? styles.filterChipActive : null]}>
              <Text
                style={[
                  styles.filterChipText,
                  selectedPeriodBucket === 'custom' ? styles.filterChipTextActive : null,
                ]}>
                Focused
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Source mix</Text>
        <Text style={styles.summaryBody}>
          {screenState.sourceSummary.creditCardCount} card rows · {screenState.sourceSummary.upiCount} WhatsApp UPI captures · {screenState.sourceSummary.upiReviewCount} UPI captures still need review.
        </Text>
      </View>

      <View style={styles.filterRow}>
        {reviewFilterOptions.map((option) => {
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
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{selectedTransaction.merchant}</Text>
          <Text style={styles.detailAmount}>{formatCurrency(selectedTransaction.amount)}</Text>
          <Text style={styles.detailMeta}>
            {selectedCategory.name} · {selectedTransaction.sourceLabel} · {selectedTransaction.sourceContextLabel}
          </Text>
          {selectedTransaction.ownerDisplayName ? (
            <Text style={styles.detailMeta}>Owner: {selectedTransaction.ownerDisplayName}</Text>
          ) : null}
          <Text style={styles.body}>
            {selectedTransaction.reviewReason ?? 'This row is already trusted and included in the current household totals.'}
          </Text>
          {reassignCategoryMutation.error instanceof Error ? (
            <Text style={styles.errorText}>{reassignCategoryMutation.error.message}</Text>
          ) : null}
          <View style={styles.filterRow}>
            {screenState.categoryOptions.map((category) => {
              const isActive = selectedTransaction.categoryId === category.id;

              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  disabled={reassignCategoryMutation.isPending}
                  onPress={() => handleReassignCategory(category.id)}
                  style={[
                    styles.filterChip,
                    isActive ? styles.filterChipActive : null,
                    reassignCategoryMutation.isPending ? styles.filterChipDisabled : null,
                  ]}>
                  <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {screenState.groups.length > 0 ? (
        <View style={styles.section}>
          {screenState.groups.map((group) => (
            <View key={`${group.heading}-${group.dateLabel}`} style={styles.groupCard}>
              <View style={styles.groupHeader}>
                <View>
                  <Text style={styles.groupTitle}>{group.heading}</Text>
                  <Text style={styles.groupDate}>{group.dateLabel}</Text>
                </View>
                <Text style={styles.groupTotal}>{formatCurrency(group.totalAmount)}</Text>
              </View>
              {group.transactions.map((transaction) => {
                const isSelected = selectedTransaction?.id === transaction.id;

                return (
                  <Pressable
                    key={transaction.id}
                    accessibilityRole="button"
                    onPress={() => setSelectedTransactionId(transaction.id)}
                    style={[styles.transactionCard, isSelected ? styles.transactionCardSelected : null]}>
                    <View style={styles.transactionMeta}>
                      <Text style={styles.transactionMerchant}>{transaction.merchant}</Text>
                      <Text style={styles.transactionDetail}>
                        {transaction.categoryName} · {transaction.sourceLabel}
                      </Text>
                      <View style={styles.transactionTagRow}>
                        {transaction.ownerDisplayName ? (
                          <Text style={styles.transactionTag}>{transaction.ownerDisplayName}</Text>
                        ) : null}
                        <Text style={styles.transactionTag}>
                          {transaction.sourceBadge === 'UPI' ? 'WhatsApp UPI' : transaction.sourceLabel}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.transactionAmountBlock}>
                      <Text style={styles.transactionAmount}>{formatCurrency(transaction.amount)}</Text>
                      <Text style={styles.transactionState}>
                        {transaction.needsReview ? 'Flagged' : 'Processed'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>No rows in this view</Text>
          <Text style={styles.body}>
            {filter === 'needs_review'
              ? 'All flagged rows are resolved for this household.'
              : 'No transactions matched the current search and filter selection.'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function resolvePeriodWindow(input: {
  analyticsAsOf: string;
  initialDrilldown: ReturnType<typeof readTransactionsDrilldownParams>;
  selectedPeriodBucket: TransactionsPeriodBucket;
}) {
  if (input.selectedPeriodBucket === 'all') {
    return {
      endOn: null,
      startOn: null,
    };
  }

  if (
    input.initialDrilldown.periodBucket === input.selectedPeriodBucket &&
    input.initialDrilldown.startOn &&
    input.initialDrilldown.endOn
  ) {
    return {
      endOn: input.initialDrilldown.endOn,
      startOn: input.initialDrilldown.startOn,
    };
  }

  if (input.selectedPeriodBucket === 'custom') {
    return {
      endOn: input.initialDrilldown.endOn,
      startOn: input.initialDrilldown.startOn,
    };
  }

  const periodWindow = createAnalyticsPeriodWindow(input.selectedPeriodBucket, input.analyticsAsOf);

  return {
    endOn: periodWindow.endOn,
    startOn: periodWindow.startOn,
  };
}

const styles = StyleSheet.create({
  body: {
    color: '#5d6675',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    gap: 10,
    padding: 20,
  },
  content: {
    backgroundColor: '#f7f9fb',
    gap: 18,
    padding: 20,
    paddingBottom: 36,
  },
  detailAmount: {
    color: '#000e24',
    fontSize: 28,
    fontWeight: '800',
  },
  detailMeta: {
    color: '#6f7885',
    fontSize: 13,
    lineHeight: 20,
  },
  errorText: {
    color: '#a24a2a',
    fontSize: 13,
    fontWeight: '700',
  },
  fieldLabel: {
    color: '#6f7885',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  filterChip: {
    backgroundColor: '#e7ebf0',
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: '#000e24',
  },
  filterChipDisabled: {
    opacity: 0.55,
  },
  filterChipText: {
    color: '#5d6675',
    fontSize: 13,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  groupCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    gap: 12,
    padding: 18,
  },
  groupDate: {
    color: '#7f8895',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  groupTitle: {
    color: '#000e24',
    fontSize: 20,
    fontWeight: '800',
  },
  groupTotal: {
    color: '#000e24',
    fontSize: 16,
    fontWeight: '800',
  },
  heroBody: {
    color: '#becad8',
    fontSize: 14,
    lineHeight: 21,
  },
  heroCard: {
    backgroundColor: '#000e24',
    borderRadius: 30,
    gap: 8,
    padding: 24,
  },
  heroFootnote: {
    color: '#85f8c4',
    fontSize: 12,
    fontWeight: '700',
  },
  heroKicker: {
    color: '#85f8c4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#000e24',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  screen: {
    backgroundColor: '#f7f9fb',
    flex: 1,
  },
  searchInput: {
    backgroundColor: '#eef2f6',
    borderRadius: 18,
    color: '#000e24',
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  section: {
    gap: 14,
  },
  sectionTitle: {
    color: '#000e24',
    fontSize: 22,
    fontWeight: '800',
  },
  summaryBody: {
    color: '#5d6675',
    fontSize: 14,
    lineHeight: 21,
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    gap: 8,
    padding: 20,
  },
  title: {
    color: '#000e24',
    fontSize: 32,
    fontWeight: '800',
  },
  transactionAmount: {
    color: '#000e24',
    fontSize: 16,
    fontWeight: '800',
  },
  transactionAmountBlock: {
    alignItems: 'flex-end',
    gap: 6,
  },
  transactionCard: {
    alignItems: 'center',
    backgroundColor: '#eef2f6',
    borderRadius: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  transactionCardSelected: {
    backgroundColor: '#dfe8f2',
  },
  transactionDetail: {
    color: '#6f7885',
    fontSize: 13,
  },
  transactionMerchant: {
    color: '#000e24',
    fontSize: 16,
    fontWeight: '700',
  },
  transactionMeta: {
    flex: 1,
    gap: 5,
  },
  transactionState: {
    color: '#006c4a',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  transactionTag: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    color: '#5d6675',
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  transactionTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
