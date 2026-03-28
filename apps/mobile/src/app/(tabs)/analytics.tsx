import { type ReactNode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';
import { buildAnalyticsScreenState, createAnalyticsPeriodWindow } from '@/features/analytics/analytics-model';
import {
  createAnalyticsQueryKey,
  loadAnalyticsSnapshot,
  type AnalyticsBucket,
} from '@/features/analytics/analytics-service';
import { formatCurrency } from '@/features/core-product/core-product-formatting';
import { createTransactionsDrilldownParams, type TransactionsDrilldown } from '@/features/transactions/transactions-drilldown';
import { getSupabaseClient } from '@/lib/supabase';

const bucketOptions: Array<{
  id: AnalyticsBucket;
  label: string;
}> = [
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'year', label: 'Yearly' },
];

export default function AnalyticsScreen() {
  const { session } = useAuthSession();
  const [activeBucket, setActiveBucket] = useState<AnalyticsBucket>('month');
  const [supabase] = useState(() => getSupabaseClient());
  const [analyticsAsOf] = useState(() => new Date().toISOString());
  const householdId =
    session.status === 'signed_in' && session.household.status === 'ready' ? session.household.householdId : null;
  const period = createAnalyticsPeriodWindow(activeBucket, analyticsAsOf);
  const analyticsQuery = useQuery({
    enabled: householdId !== null,
    queryFn: async () => {
      if (!householdId) {
        throw new Error('A ready household is required to load analytics.');
      }

      return loadAnalyticsSnapshot(supabase, {
        bucket: period.bucket,
        comparisonEndOn: period.comparisonEndOn,
        comparisonStartOn: period.comparisonStartOn,
        endOn: period.endOn,
        householdId,
        startOn: period.startOn,
      });
    },
    queryKey: createAnalyticsQueryKey(householdId, period),
  });
  const screenState = analyticsQuery.data ? buildAnalyticsScreenState(analyticsQuery.data) : null;

  function openTransactions(drilldown: TransactionsDrilldown) {
    router.push({
      params: createTransactionsDrilldownParams(drilldown),
      pathname: '/(tabs)/transactions',
    });
  }

  function openReport(reportId: string | null) {
    if (!reportId) {
      return;
    }

    router.push({
      params: {
        reportId,
      },
      pathname: '/analytics-report',
    });
  }

  if (analyticsQuery.isPending) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <AnalyticsHero />
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Loading Analytics</Text>
          <Text style={styles.cardBody}>Pulling trend buckets, allocation, and savings insights for this household.</Text>
        </View>
      </ScrollView>
    );
  }

  if (analyticsQuery.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <AnalyticsHero />
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Unable to load Analytics</Text>
          <Text style={styles.cardBody}>
            {analyticsQuery.error instanceof Error
              ? analyticsQuery.error.message
              : 'The analytics tab could not be loaded.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void analyticsQuery.refetch()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (!screenState) {
    return null;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AnalyticsHero>
        <View style={styles.heroMetricsRow}>
          <View style={styles.heroMetricCard}>
            <Text style={styles.heroMetricLabel}>Current period</Text>
            <Text style={styles.heroMetricValue}>{formatCurrency(screenState.hero.currentSpend)}</Text>
            <Text style={styles.heroMetricCaption}>{screenState.hero.periodLabel}</Text>
          </View>
          <View style={styles.heroMetricCard}>
            <Text style={styles.heroMetricLabel}>Vs prior period</Text>
            <Text style={styles.heroMetricValue}>
              {screenState.hero.deltaDirection === 'up' ? '+' : screenState.hero.deltaDirection === 'down' ? '-' : ''}
              {screenState.hero.deltaPercentage?.toFixed(1) ?? '0.0'}%
            </Text>
            <Text style={styles.heroMetricCaption}>{screenState.hero.deltaDirection}</Text>
          </View>
        </View>
      </AnalyticsHero>

      <View style={styles.filterRow}>
        {bucketOptions.map((option) => {
          const isActive = activeBucket === option.id;

          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              onPress={() => setActiveBucket(option.id)}
              style={[styles.filterChip, isActive ? styles.filterChipActive : null]}>
              <Text style={[styles.filterChipText, isActive ? styles.filterChipTextActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Capital Flow</Text>
          <Text style={styles.sectionMeta}>{screenState.hero.periodLabel}</Text>
        </View>
        <Text style={styles.cardBody}>Tap a bar to inspect the transactions behind that period bucket.</Text>
        <View style={styles.trendRow}>
          {screenState.trend.points.map((point) => (
            <Pressable
              key={point.bucketLabel}
              accessibilityRole="button"
              onPress={() => openTransactions(point.drilldown)}
              style={styles.trendColumn}>
              <View style={styles.trendTrack}>
                <View
                  style={[
                    styles.trendBar,
                    point.emphasis === 'current' ? styles.trendBarCurrent : null,
                    { height: `${Math.max(18, point.heightRatio * 100)}%` },
                  ]}
                />
              </View>
              <Text style={[styles.trendLabel, point.emphasis === 'current' ? styles.trendLabelCurrent : null]}>
                {point.shortLabel}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Allocation Audit</Text>
        <Text style={styles.allocationTotal}>{formatCurrency(screenState.allocation.totalSpend)}</Text>
        <View style={styles.stack}>
          {screenState.allocation.items.map((item) => (
            <Pressable
              key={item.categoryName}
              accessibilityRole="button"
              onPress={() => openTransactions(item.drilldown)}
              style={styles.listRow}>
              <View style={styles.listMeta}>
                <Text style={styles.listTitle}>{item.categoryName}</Text>
                <Text style={styles.listBody}>{item.transactionCount} transactions</Text>
              </View>
              <View style={styles.listRight}>
                <Text style={styles.listValue}>{item.shareLabel}</Text>
                <Text style={styles.listBody}>{formatCurrency(item.totalSpend)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>

      {screenState.breakdowns.map((section) => (
        <View key={section.id} style={styles.card}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.stack}>
            {section.items.map((item) => (
              <Pressable
                key={`${section.id}-${item.label}`}
                accessibilityRole="button"
                onPress={() => openTransactions(item.drilldown)}
                style={styles.listRow}>
                <View style={styles.listMeta}>
                  <Text style={styles.listTitle}>{item.label}</Text>
                  <Text style={styles.listBody}>{item.detail}</Text>
                </View>
                <View style={styles.listRight}>
                  <Text style={styles.listValue}>{item.shareLabel}</Text>
                  <Text style={styles.listBody}>{formatCurrency(item.totalSpend)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>LLM Analysis</Text>
        {screenState.insightCards.map((insight) => (
          <Pressable
            key={insight.title}
            accessibilityRole="button"
            onPress={() => openTransactions(insight.drilldown)}
            style={styles.insightCard}>
            <Text style={styles.insightEyebrow}>{insight.eyebrow}</Text>
            <Text style={styles.insightTitle}>{insight.title}</Text>
            <Text style={styles.cardBody}>{insight.body}</Text>
            {insight.impactLabel ? <Text style={styles.insightImpact}>{insight.impactLabel}</Text> : null}
          </Pressable>
        ))}
        {screenState.recurringCards.map((card) => (
          <Pressable
            key={card.merchantName}
            accessibilityRole="button"
            onPress={() => openTransactions(card.drilldown)}
            style={styles.recurringCard}>
            <Text style={styles.insightEyebrow}>Recurring charge</Text>
            <Text style={styles.insightTitle}>{card.merchantName}</Text>
            <Text style={styles.cardBody}>
              {card.cadenceLabel} via {card.paymentSourceLabel}.
            </Text>
            <Text style={styles.insightImpact}>{card.totalSpendLabel}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!screenState.deepAnalysis.reportId}
        onPress={() => openReport(screenState.deepAnalysis.reportId)}
        style={styles.deepAnalysisCard}>
        <Text style={styles.deepAnalysisEyebrow}>Deep Analysis</Text>
        <Text style={styles.deepAnalysisTitle}>{screenState.deepAnalysis.title}</Text>
        <Text style={styles.deepAnalysisBody}>
          Use the published report as the top-level narrative, then drill down into the matching transactions from the sections above.
        </Text>
        <Text style={styles.deepAnalysisCta}>{screenState.deepAnalysis.ctaLabel}</Text>
      </Pressable>
    </ScrollView>
  );
}

function AnalyticsHero({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.heroCard}>
      <Text style={styles.kicker}>Performance architecture</Text>
      <Text style={styles.heroTitle}>Analytics</Text>
      <Text style={styles.heroBody}>
        Review trend shifts, category allocation, spend-by-dimension views, and savings analysis without leaving the household ledger.
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  allocationTotal: {
    color: '#000e24',
    fontSize: 30,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    gap: 12,
    padding: 22,
  },
  cardBody: {
    color: '#5d6675',
    fontSize: 14,
    lineHeight: 21,
  },
  content: {
    backgroundColor: '#f7f9fb',
    gap: 18,
    padding: 20,
    paddingBottom: 36,
  },
  deepAnalysisBody: {
    color: '#c1cedf',
    fontSize: 14,
    lineHeight: 21,
  },
  deepAnalysisCard: {
    backgroundColor: '#000e24',
    borderRadius: 28,
    gap: 10,
    padding: 24,
  },
  deepAnalysisCta: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  deepAnalysisEyebrow: {
    color: '#85f8c4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  deepAnalysisTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  filterChip: {
    backgroundColor: '#e7ebf0',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: '#ffffff',
  },
  filterChipText: {
    color: '#5d6675',
    fontSize: 13,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#000e24',
  },
  filterRow: {
    backgroundColor: '#edf1f5',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    padding: 4,
  },
  heroBody: {
    color: '#becad8',
    fontSize: 15,
    lineHeight: 22,
  },
  heroCard: {
    backgroundColor: '#000e24',
    borderRadius: 32,
    gap: 14,
    padding: 24,
  },
  heroMetricCaption: {
    color: '#becad8',
    fontSize: 12,
    fontWeight: '600',
  },
  heroMetricCard: {
    backgroundColor: '#12233d',
    borderRadius: 20,
    flex: 1,
    gap: 4,
    padding: 16,
  },
  heroMetricLabel: {
    color: '#85f8c4',
    fontSize: 12,
    fontWeight: '700',
  },
  heroMetricValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  heroMetricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
  },
  impactLabel: {
    color: '#000e24',
    fontSize: 13,
    fontWeight: '700',
  },
  insightCard: {
    backgroundColor: '#eef2f6',
    borderLeftColor: '#006c4a',
    borderLeftWidth: 4,
    borderRadius: 24,
    gap: 8,
    padding: 18,
  },
  insightEyebrow: {
    color: '#006c4a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  insightImpact: {
    color: '#000e24',
    fontSize: 13,
    fontWeight: '700',
  },
  insightTitle: {
    color: '#000e24',
    fontSize: 18,
    fontWeight: '800',
  },
  kicker: {
    color: '#85f8c4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  listBody: {
    color: '#5d6675',
    fontSize: 12,
  },
  listMeta: {
    gap: 4,
  },
  listRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  listRow: {
    alignItems: 'center',
    backgroundColor: '#eef2f6',
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  listTitle: {
    color: '#000e24',
    fontSize: 15,
    fontWeight: '700',
  },
  listValue: {
    color: '#006c4a',
    fontSize: 15,
    fontWeight: '800',
  },
  recurringCard: {
    backgroundColor: '#eef2f6',
    borderLeftColor: '#304b79',
    borderLeftWidth: 4,
    borderRadius: 24,
    gap: 8,
    padding: 18,
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
  section: {
    gap: 12,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionMeta: {
    color: '#5d6675',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#000e24',
    fontSize: 22,
    fontWeight: '800',
  },
  stack: {
    gap: 10,
  },
  trendBar: {
    backgroundColor: '#304b79',
    borderRadius: 999,
    minHeight: 24,
    width: 12,
  },
  trendBarCurrent: {
    backgroundColor: '#006c4a',
  },
  trendColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  trendLabel: {
    color: '#7d8593',
    fontSize: 11,
    fontWeight: '700',
  },
  trendLabelCurrent: {
    color: '#000e24',
  },
  trendRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
    height: 220,
  },
  trendTrack: {
    alignItems: 'center',
    backgroundColor: '#edf1f5',
    borderRadius: 999,
    height: 180,
    justifyContent: 'flex-end',
    width: '100%',
  },
});
