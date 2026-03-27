import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatCurrency, formatShortDate } from '@/features/core-product/core-product-formatting';
import { createMockCoreProductState } from '@/features/core-product/core-product-state';
import { createDashboardSnapshot } from '@/features/dashboard/dashboard-model';

const dashboardSnapshot = createDashboardSnapshot(createMockCoreProductState());

export default function DashboardScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.kicker}>Household ledger</Text>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.body}>
          Track statement health, review risk, and the latest credit-card activity in one place.
        </Text>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Month to date</Text>
            <Text style={styles.metricValue}>{formatCurrency(dashboardSnapshot.totals.monthToDateSpend)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Needs review</Text>
            <Text style={styles.metricValue}>{formatCurrency(dashboardSnapshot.totals.reviewQueueAmount)}</Text>
            <Text style={styles.metricCaption}>{dashboardSnapshot.totals.reviewQueueCount} rows pending</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Sync freshness</Text>
          <View style={styles.syncPill}>
            <Text style={styles.syncPillText}>{dashboardSnapshot.sync.status}</Text>
          </View>
        </View>
        <Text style={styles.syncValue}>{dashboardSnapshot.sync.freshnessLabel}</Text>
        <Text style={styles.cardBody}>
          {dashboardSnapshot.sync.pendingStatementCount} statement is waiting for parser recovery.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alerts</Text>
        {dashboardSnapshot.alerts.map((alert) => (
          <View
            key={alert.id}
            style={[styles.alertCard, alert.tone === 'critical' ? styles.alertCardCritical : null]}>
            <Text style={styles.alertTitle}>{alert.title}</Text>
            <Text style={styles.cardBody}>{alert.message}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent transactions</Text>
        {dashboardSnapshot.recentTransactions.map((transaction) => (
          <View key={transaction.id} style={styles.transactionRow}>
            <View style={styles.transactionMeta}>
              <Text style={styles.transactionMerchant}>{transaction.merchant}</Text>
              <Text style={styles.transactionDetail}>
                {transaction.categoryName} · {formatShortDate(transaction.postedAt)}
              </Text>
            </View>
            <View style={styles.transactionAmountBlock}>
              <Text style={styles.transactionAmount}>{formatCurrency(transaction.amount)}</Text>
              {transaction.needsReview ? <Text style={styles.reviewBadge}>Review</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  alertCard: {
    backgroundColor: '#f8ecdc',
    borderColor: '#ead5b9',
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  alertCardCritical: {
    backgroundColor: '#f7ddd7',
    borderColor: '#e8b9aa',
  },
  alertTitle: {
    color: '#182026',
    fontSize: 17,
    fontWeight: '700',
  },
  body: {
    color: '#5d5346',
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#fffaf2',
    borderColor: '#ead5b9',
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  cardBody: {
    color: '#5d5346',
    fontSize: 14,
    lineHeight: 21,
  },
  content: {
    backgroundColor: '#f4eadc',
    gap: 18,
    padding: 20,
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: '#182026',
    borderRadius: 28,
    gap: 14,
    padding: 24,
  },
  kicker: {
    color: '#d7c5ab',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  metricCaption: {
    color: '#b2c0cf',
    fontSize: 12,
    fontWeight: '600',
  },
  metricCard: {
    backgroundColor: '#22303a',
    borderRadius: 20,
    flex: 1,
    gap: 4,
    padding: 16,
  },
  metricLabel: {
    color: '#d7c5ab',
    fontSize: 13,
    fontWeight: '600',
  },
  metricValue: {
    color: '#fffaf2',
    fontSize: 24,
    fontWeight: '800',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  reviewBadge: {
    alignSelf: 'flex-end',
    color: '#a64b2a',
    fontSize: 12,
    fontWeight: '700',
  },
  screen: {
    backgroundColor: '#f4eadc',
    flex: 1,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#182026',
    fontSize: 20,
    fontWeight: '800',
  },
  syncPill: {
    backgroundColor: '#efe1cc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  syncPillText: {
    color: '#7b6448',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  syncValue: {
    color: '#182026',
    fontSize: 22,
    fontWeight: '800',
  },
  title: {
    color: '#fffaf2',
    fontSize: 34,
    fontWeight: '800',
  },
  transactionAmount: {
    color: '#182026',
    fontSize: 16,
    fontWeight: '800',
  },
  transactionAmountBlock: {
    alignItems: 'flex-end',
    gap: 6,
  },
  transactionDetail: {
    color: '#7b6448',
    fontSize: 13,
  },
  transactionMerchant: {
    color: '#182026',
    fontSize: 16,
    fontWeight: '700',
  },
  transactionMeta: {
    flex: 1,
    gap: 4,
  },
  transactionRow: {
    alignItems: 'center',
    backgroundColor: '#fffaf2',
    borderColor: '#ead5b9',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    padding: 18,
  },
});
