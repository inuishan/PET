import { type ReactNode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatCurrency, formatShortDate } from '@/features/core-product/core-product-formatting';
import { useAuthSession } from '@/features/auth/auth-session';
import { createDashboardQueryKey, loadDashboardSnapshot } from '@/features/dashboard/dashboard-service';
import { getSupabaseClient } from '@/lib/supabase';

export default function DashboardScreen() {
  const { session } = useAuthSession();
  const [supabase] = useState(() => getSupabaseClient());
  const householdId =
    session.status === 'signed_in' && session.household.status === 'ready' ? session.household.householdId : null;
  const dashboardQuery = useQuery({
    enabled: householdId !== null,
    queryFn: async () => {
      if (!householdId) {
        throw new Error('A ready household is required to load the dashboard.');
      }

      return loadDashboardSnapshot(supabase, householdId);
    },
    queryKey: createDashboardQueryKey(householdId),
  });
  const dashboardSnapshot = dashboardQuery.data ?? null;
  const isEmptyDashboard =
    dashboardSnapshot !== null &&
    dashboardSnapshot.totals.transactionCount === 0 &&
    dashboardSnapshot.recentTransactions.length === 0;

  if (dashboardQuery.isPending) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <DashboardHero />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Loading dashboard</Text>
          <Text style={styles.cardBody}>Pulling month-to-date totals, sync health, and recent transactions.</Text>
        </View>
      </ScrollView>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <DashboardHero />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Unable to load dashboard</Text>
          <Text style={styles.cardBody}>
            {dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : 'The household dashboard could not be loaded.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void dashboardQuery.refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (!dashboardSnapshot) {
    return null;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <DashboardHero>
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
      </DashboardHero>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Sync freshness</Text>
          <View style={styles.syncPill}>
            <Text style={styles.syncPillText}>{dashboardSnapshot.sync.status}</Text>
          </View>
        </View>
        <Text style={styles.syncValue}>{dashboardSnapshot.sync.freshnessLabel}</Text>
        <Text style={styles.cardBody}>
          {describeSyncState(
            dashboardSnapshot.sync.pendingStatementCount,
            dashboardSnapshot.sync.status,
            isEmptyDashboard
          )}
        </Text>
      </View>

      {isEmptyDashboard ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>No dashboard activity yet</Text>
          <Text style={styles.cardBody}>
            Upload the first household statement to populate month-to-date totals and recent transactions.
          </Text>
        </View>
      ) : null}

      {dashboardSnapshot.alerts.length > 0 ? (
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
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent transactions</Text>
        {dashboardSnapshot.recentTransactions.length > 0 ? (
          dashboardSnapshot.recentTransactions.map((transaction) => (
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
          ))
        ) : (
          <View style={styles.card}>
            <Text style={styles.alertTitle}>No recent transactions</Text>
            <Text style={styles.cardBody}>Recent household activity will appear here after the first sync completes.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function describeSyncState(
  pendingStatementCount: number,
  syncStatus: 'degraded' | 'failing' | 'healthy',
  isEmptyDashboard: boolean
) {
  if (syncStatus === 'failing') {
    return 'At least one statement sync failed and needs attention.';
  }

  if (pendingStatementCount > 0) {
    return `${pendingStatementCount} statement ${pendingStatementCount === 1 ? 'is' : 'are'} waiting for parser recovery.`;
  }

  if (isEmptyDashboard) {
    return 'No statements have landed for this household yet.';
  }

  return 'The statement pipeline is clear for this household.';
}

function DashboardHero({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.heroCard}>
      <Text style={styles.kicker}>Household ledger</Text>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.body}>
        Track statement health, review risk, and the latest credit-card activity in one place.
      </Text>
      {children}
    </View>
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
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#182026',
    borderRadius: 999,
    marginTop: 4,
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
