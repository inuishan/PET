import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatCurrency, formatShortDate } from '@/features/core-product/core-product-formatting';
import { createMockCoreProductState } from '@/features/core-product/core-product-state';
import {
  buildTransactionsScreenState,
  reassignTransactionCategory,
  type TransactionFilter,
} from '@/features/transactions/transactions-model';

const filterOptions: Array<{
  id: TransactionFilter;
  label: (reviewQueueCount: number) => string;
}> = [
  { id: 'all', label: () => 'All rows' },
  { id: 'needs_review', label: (reviewQueueCount) => `Needs review (${reviewQueueCount})` },
];

export default function TransactionsScreen() {
  const [ledgerState, setLedgerState] = useState(() => createMockCoreProductState());
  const [filter, setFilter] = useState<TransactionFilter>('all');
  const [selectedTransactionId, setSelectedTransactionId] = useState('txn-004');

  const screenState = buildTransactionsScreenState(ledgerState, filter);
  const selectedTransaction =
    ledgerState.transactions.find((transaction) => transaction.id === selectedTransactionId) ?? ledgerState.transactions[0];

  if (!selectedTransaction) {
    return null;
  }

  const selectedCategory =
    ledgerState.categories.find((category) => category.id === selectedTransaction.categoryId) ?? ledgerState.categories[0];

  function handleReassignCategory(nextCategoryId: string) {
    setLedgerState((currentState) => reassignTransactionCategory(currentState, selectedTransaction.id, nextCategoryId));
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

        <View style={styles.categoryGrid}>
          {screenState.categoryOptions.map((category) => {
            const isActive = selectedTransaction.categoryId === category.id;

            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                onPress={() => handleReassignCategory(category.id)}
                style={[styles.categoryChip, isActive ? styles.categoryChipActive : null]}>
                <Text style={[styles.categoryChipText, isActive ? styles.categoryChipTextActive : null]}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        {screenState.groups.map((group) => (
          <View key={group.dateLabel} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{group.dateLabel}</Text>
              <Text style={styles.groupTotal}>{formatCurrency(group.totalAmount)}</Text>
            </View>

            {group.transactions.map((transaction) => {
              const isSelected = selectedTransaction.id === transaction.id;

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
