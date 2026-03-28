import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';
import { formatCurrency, formatShortDate } from '@/features/core-product/core-product-formatting';
import {
  buildDashboardScreenState,
  type DashboardNavigation,
} from '@/features/dashboard/dashboard-model';
import { createDashboardQueryKey, loadDashboardSnapshot } from '@/features/dashboard/dashboard-service';
import { createTransactionsDrilldownParams } from '@/features/transactions/transactions-drilldown';
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
  const dashboardScreenState = dashboardSnapshot ? buildDashboardScreenState(dashboardSnapshot) : null;
  const showAnalyticsSection = dashboardSnapshot?.analytics !== null;
  const isEmptyDashboard =
    dashboardSnapshot !== null &&
    dashboardSnapshot.totals.transactionCount === 0 &&
    dashboardSnapshot.recentTransactions.length === 0;

  function openDashboardNavigation(navigation: DashboardNavigation) {
    if (navigation.kind === 'analytics') {
      router.push('/(tabs)/analytics');
      return;
    }

    if (navigation.kind === 'analytics-report') {
      router.push({
        params: {
          reportId: navigation.reportId,
        },
        pathname: '/analytics-report',
      });
      return;
    }

    router.push({
      params: createTransactionsDrilldownParams(navigation.drilldown),
      pathname: '/(tabs)/transactions',
    });
  }

  function openSettings() {
    router.push('/(tabs)/settings');
  }

  function openTransactions() {
    router.push('/(tabs)/transactions');
  }

  if (dashboardQuery.isPending) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Household ledger</Text>
          <Text style={styles.heroTitle}>Dashboard</Text>
          <Text style={styles.heroBody}>Loading trend-aware spend, WhatsApp UPI capture, and AI recommendations.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Loading dashboard</Text>
          <Text style={styles.cardBody}>Pulling trend buckets, AI insights, and the latest household activity.</Text>
        </View>
      </ScrollView>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Household ledger</Text>
          <Text style={styles.heroTitle}>Dashboard</Text>
          <Text style={styles.heroBody}>The dashboard could not assemble its WhatsApp UPI, source health, and analytics context.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Unable to load dashboard</Text>
          <Text style={styles.cardBody}>
            {dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : 'The household dashboard could not be loaded.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void dashboardQuery.refetch()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (!dashboardSnapshot || !dashboardScreenState) {
    return null;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {!isEmptyDashboard && (dashboardSnapshot.sync.status !== 'healthy' || dashboardSnapshot.alerts.length > 0) ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {dashboardSnapshot.sync.status !== 'healthy'
              ? 'Upload your latest statement for accurate tracking.'
              : dashboardSnapshot.alerts[0]?.title ?? 'Review the latest dashboard alerts.'}
          </Text>
        </View>
      ) : null}

      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Monthly spend</Text>
        <Text style={styles.heroTitle}>{formatCurrency(dashboardScreenState.hero.currentSpend)}</Text>
        <Text style={styles.heroPeriod}>{dashboardScreenState.hero.periodLabel}</Text>

        <View style={styles.sparklineRow}>
          <View style={styles.sparklineTrack}>
            {dashboardScreenState.hero.sparklinePoints.map((point) => (
              <View key={point.id} style={styles.sparklineColumn}>
                <View style={[styles.sparklineBar, { height: `${Math.max(18, point.normalizedHeight * 100)}%` }]} />
                <Text style={styles.sparklineLabel}>{point.shortLabel}</Text>
              </View>
            ))}
          </View>
          <View
            style={[
              styles.trendBadge,
              dashboardScreenState.hero.trendDirection === 'down' ? styles.trendBadgeDown : null,
            ]}>
            <Text style={styles.trendBadgeText}>{dashboardScreenState.hero.trendBadgeLabel}</Text>
          </View>
        </View>
        <Text style={styles.heroBody}>{dashboardScreenState.hero.trendNarrative}</Text>

        <View style={styles.heroMetaRow}>
          <View style={styles.heroMetaCard}>
            <Text style={styles.heroMetaLabel}>Needs review</Text>
            <Text style={styles.heroMetaValue}>{formatCurrency(dashboardSnapshot.totals.reviewQueueAmount)}</Text>
            <Text style={styles.heroMetaCaption}>{dashboardSnapshot.totals.reviewQueueCount} rows pending</Text>
          </View>
          <View style={styles.heroMetaCard}>
            <Text style={styles.heroMetaLabel}>Cleared spend</Text>
            <Text style={styles.heroMetaValue}>{formatCurrency(dashboardSnapshot.totals.reviewedAmount)}</Text>
            <Text style={styles.heroMetaCaption}>{dashboardSnapshot.sync.freshnessLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.chipRow}>
        {dashboardScreenState.sourceChips.map((chip) => (
          <View
            key={chip.id}
            style={[
              styles.sourceChip,
              chip.tone === 'positive' ? styles.sourceChipPositive : null,
              chip.tone === 'warning' ? styles.sourceChipWarning : null,
            ]}>
            <Text
              style={[
                styles.sourceChipText,
                chip.tone === 'positive' ? styles.sourceChipTextPositive : null,
              ]}>
              {chip.label}
            </Text>
          </View>
        ))}
      </View>

      {dashboardScreenState.categoryHighlights.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Spend concentration</Text>
          {dashboardScreenState.categoryHighlights.map((item) => (
            <View key={item.categoryName} style={styles.categoryRow}>
              <View style={styles.categoryRowHeader}>
                <Text style={styles.categoryTitle}>{item.categoryName}</Text>
                <Text style={styles.categoryShare}>{item.shareLabel}</Text>
              </View>
              <View style={styles.categoryTrack}>
                <View style={[styles.categoryFill, { width: `${Math.max(8, item.widthRatio * 100)}%` }]} />
              </View>
              <View style={styles.categoryRowHeader}>
                <Text style={styles.categoryDetail}>{item.amountLabel}</Text>
                <Text style={styles.categoryDetail}>{item.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {showAnalyticsSection ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>AI Insights</Text>
            <Pressable accessibilityRole="button" onPress={() => openDashboardNavigation(dashboardScreenState.deepAnalysis.navigation)}>
              <Text style={styles.sectionLink}>Open Analytics</Text>
            </Pressable>
          </View>
          {dashboardScreenState.aiInsightCards.map((insight) => (
            <Pressable
              key={insight.id}
              accessibilityRole="button"
              onPress={() => openDashboardNavigation(insight.navigation)}
              style={styles.insightCard}>
              <Text style={styles.insightEyebrow}>{insight.eyebrow}</Text>
              <Text style={styles.insightTitle}>{insight.title}</Text>
              <Text style={styles.cardBody}>{insight.summary}</Text>
              <Text style={styles.insightRecommendation}>{insight.recommendation}</Text>
              {insight.impactLabel ? <Text style={styles.insightImpact}>{insight.impactLabel}</Text> : null}
              <Text style={styles.insightEvidence}>{insight.evidenceLabel}</Text>
              <Text style={styles.insightAction}>{insight.actionLabel}</Text>
            </Pressable>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => openDashboardNavigation(dashboardScreenState.deepAnalysis.navigation)}
            style={styles.deepAnalysisCard}>
            <Text style={styles.deepAnalysisEyebrow}>Deep Analysis</Text>
            <Text style={styles.deepAnalysisTitle}>{dashboardScreenState.deepAnalysis.title}</Text>
            <Text style={styles.deepAnalysisBody}>{dashboardScreenState.deepAnalysis.subtitle}</Text>
            <Text style={styles.deepAnalysisAction}>{dashboardScreenState.deepAnalysis.actionLabel}</Text>
          </Pressable>
        </View>
      ) : null}

      {dashboardSnapshot.alerts.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Spending Alerts</Text>
            <View style={styles.alertCountBadge}>
              <Text style={styles.alertCountBadgeText}>{dashboardSnapshot.alerts.length} Active</Text>
            </View>
          </View>
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

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{dashboardScreenState.statementSync.title}</Text>
        <Text style={styles.cardBody}>{dashboardScreenState.statementSync.body}</Text>
        <Pressable accessibilityRole="button" onPress={openSettings} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{dashboardScreenState.statementSync.actionLabel}</Text>
        </Pressable>
      </View>

      {isEmptyDashboard ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>No dashboard activity yet</Text>
          <Text style={styles.cardBody}>
            Upload the first household statement to unlock trend lines, AI recommendations, and recent activity.
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Pressable accessibilityRole="button" onPress={openTransactions}>
            <Text style={styles.sectionLink}>View all</Text>
          </Pressable>
        </View>
        {dashboardSnapshot.recentTransactions.length > 0 ? (
          dashboardSnapshot.recentTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.transactionRow}>
              <View style={styles.transactionMeta}>
                <Text style={styles.transactionMerchant}>{transaction.merchant}</Text>
                <Text style={styles.transactionDetail}>
                  {transaction.sourceLabel} · {transaction.categoryName} · {formatShortDate(transaction.postedAt)}
                </Text>
                {transaction.ownerDisplayName ? (
                  <Text style={styles.transactionOwner}>Owner: {transaction.ownerDisplayName}</Text>
                ) : null}
              </View>
              <View style={styles.transactionAmountBlock}>
                <Text style={styles.transactionAmount}>{formatCurrency(transaction.amount)}</Text>
                <Text style={styles.transactionBadge}>{transaction.sourceBadge}</Text>
                {transaction.needsReview ? <Text style={styles.reviewBadge}>Needs review</Text> : null}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardBody}>Recent household activity will appear here after the first sync completes.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  alertCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dce3eb',
    borderRadius: 28,
    borderWidth: 1,
    gap: 8,
    padding: 22,
  },
  alertCardCritical: {
    borderColor: '#f1c1b9',
    backgroundColor: '#fff4f2',
  },
  alertCountBadge: {
    backgroundColor: '#ffe2dd',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  alertCountBadgeText: {
    color: '#b03924',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  alertTitle: {
    color: '#000e24',
    fontSize: 18,
    fontWeight: '800',
  },
  banner: {
    backgroundColor: '#3a2500',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bannerText: {
    color: '#ffd89f',
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#dce3eb',
    borderRadius: 30,
    borderWidth: 1,
    gap: 14,
    padding: 22,
  },
  cardBody: {
    color: '#596677',
    fontSize: 14,
    lineHeight: 21,
  },
  categoryDetail: {
    color: '#7a8596',
    fontSize: 12,
    fontWeight: '600',
  },
  categoryFill: {
    backgroundColor: '#68dba9',
    borderRadius: 999,
    height: '100%',
  },
  categoryRow: {
    gap: 8,
  },
  categoryRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryShare: {
    color: '#000e24',
    fontSize: 12,
    fontWeight: '800',
  },
  categoryTitle: {
    color: '#000e24',
    fontSize: 14,
    fontWeight: '800',
  },
  categoryTrack: {
    backgroundColor: '#ecf0f4',
    borderRadius: 999,
    height: 10,
    overflow: 'hidden',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  content: {
    backgroundColor: '#f7f9fb',
    gap: 18,
    padding: 20,
    paddingBottom: 36,
  },
  deepAnalysisAction: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  deepAnalysisBody: {
    color: '#c2cde0',
    fontSize: 14,
    lineHeight: 21,
  },
  deepAnalysisCard: {
    backgroundColor: '#000e24',
    borderRadius: 28,
    gap: 10,
    padding: 22,
  },
  deepAnalysisEyebrow: {
    color: '#85f8c4',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  deepAnalysisTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  heroBody: {
    color: '#c2cde0',
    fontSize: 14,
    lineHeight: 21,
  },
  heroCard: {
    backgroundColor: '#000e24',
    borderRadius: 36,
    gap: 10,
    overflow: 'hidden',
    padding: 24,
  },
  heroEyebrow: {
    color: '#8ea4c7',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  heroMetaCaption: {
    color: '#8ea4c7',
    fontSize: 11,
    fontWeight: '600',
  },
  heroMetaCard: {
    backgroundColor: '#11213e',
    borderRadius: 22,
    flex: 1,
    gap: 4,
    padding: 16,
  },
  heroMetaLabel: {
    color: '#8ea4c7',
    fontSize: 12,
    fontWeight: '700',
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  heroMetaValue: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  heroPeriod: {
    color: '#8ea4c7',
    fontSize: 14,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.1,
  },
  insightAction: {
    color: '#006c4a',
    fontSize: 13,
    fontWeight: '800',
  },
  insightCard: {
    backgroundColor: '#ffffff',
    borderColor: '#dce3eb',
    borderRadius: 28,
    borderWidth: 1,
    gap: 8,
    padding: 22,
  },
  insightEvidence: {
    color: '#7a8596',
    fontSize: 12,
    fontWeight: '700',
  },
  insightEyebrow: {
    color: '#006c4a',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  insightImpact: {
    color: '#000e24',
    fontSize: 13,
    fontWeight: '800',
  },
  insightRecommendation: {
    color: '#000e24',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  insightTitle: {
    color: '#000e24',
    fontSize: 20,
    fontWeight: '800',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#000e24',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  reviewBadge: {
    color: '#b03924',
    fontSize: 12,
    fontWeight: '800',
  },
  screen: {
    backgroundColor: '#f7f9fb',
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
  sectionLink: {
    color: '#006c4a',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#000e24',
    fontSize: 24,
    fontWeight: '800',
  },
  sourceChip: {
    backgroundColor: '#ffffff',
    borderColor: '#dce3eb',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sourceChipPositive: {
    backgroundColor: '#ebfff5',
    borderColor: '#b8ebd2',
  },
  sourceChipText: {
    color: '#4d5a6b',
    fontSize: 13,
    fontWeight: '700',
  },
  sourceChipTextPositive: {
    color: '#006c4a',
  },
  sourceChipWarning: {
    backgroundColor: '#fff7ed',
    borderColor: '#f1dcc0',
  },
  sparklineBar: {
    backgroundColor: '#85f8c4',
    borderRadius: 999,
    minHeight: 18,
    width: 12,
  },
  sparklineColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 8,
    justifyContent: 'flex-end',
  },
  sparklineLabel: {
    color: '#8ea4c7',
    fontSize: 11,
    fontWeight: '700',
  },
  sparklineRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 16,
    marginVertical: 4,
  },
  sparklineTrack: {
    alignItems: 'flex-end',
    backgroundColor: '#11213e',
    borderRadius: 24,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    height: 96,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  transactionAmount: {
    color: '#000e24',
    fontSize: 16,
    fontWeight: '800',
  },
  transactionAmountBlock: {
    alignItems: 'flex-end',
    gap: 4,
  },
  transactionBadge: {
    color: '#6f7c8d',
    fontSize: 12,
    fontWeight: '800',
  },
  transactionDetail: {
    color: '#7a8596',
    fontSize: 13,
  },
  transactionMerchant: {
    color: '#000e24',
    fontSize: 16,
    fontWeight: '800',
  },
  transactionMeta: {
    flex: 1,
    gap: 4,
  },
  transactionOwner: {
    color: '#596677',
    fontSize: 12,
    fontWeight: '700',
  },
  transactionRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#dce3eb',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    padding: 18,
  },
  trendBadge: {
    alignItems: 'center',
    backgroundColor: '#82f5c1',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 76,
    paddingHorizontal: 12,
  },
  trendBadgeDown: {
    backgroundColor: '#ffd4cc',
  },
  trendBadgeText: {
    color: '#002114',
    fontSize: 12,
    fontWeight: '800',
  },
});
