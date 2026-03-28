import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';
import { buildAnalyticsReportScreenState } from '@/features/analytics/analytics-report-model';
import { loadAnalyticsReport } from '@/features/analytics/analytics-service';
import { createTransactionsDrilldownParams, type TransactionsDrilldown } from '@/features/transactions/transactions-drilldown';
import { getSupabaseClient } from '@/lib/supabase';

export default function AnalyticsReportScreen() {
  const { session } = useAuthSession();
  const { reportId } = useLocalSearchParams<{ reportId?: string | string[] }>();
  const [supabase] = useState(() => getSupabaseClient());
  const normalizedReportId = Array.isArray(reportId) ? reportId[0] ?? null : reportId ?? null;
  const householdId =
    session.status === 'signed_in' && session.household.status === 'ready' ? session.household.householdId : null;
  const reportQuery = useQuery({
    enabled: householdId !== null && normalizedReportId !== null,
    queryFn: async () => {
      if (!householdId) {
        throw new Error('A ready household is required to load deep analysis.');
      }

      return loadAnalyticsReport(supabase, {
        householdId,
        reportId: normalizedReportId,
      });
    },
    queryKey: ['analytics-report', householdId, normalizedReportId],
  });

  if (reportQuery.isPending) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Deep analysis</Text>
          <Text style={styles.heroTitle}>Loading report</Text>
          <Text style={styles.heroBody}>Pulling the latest narrative, comparisons, and supporting sections.</Text>
        </View>
      </ScrollView>
    );
  }

  if (reportQuery.isError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Deep analysis</Text>
          <Text style={styles.heroTitle}>Unable to load report</Text>
          <Text style={styles.heroBody}>
            {reportQuery.error instanceof Error ? reportQuery.error.message : 'The analytics report could not be loaded.'}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void reportQuery.refetch()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  if (!reportQuery.data) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Deep analysis</Text>
          <Text style={styles.heroTitle}>Report unavailable</Text>
          <Text style={styles.heroBody}>Generate a monthly report from Analytics before opening deep analysis.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/analytics')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Open Analytics</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const report = reportQuery.data;
  const screenState = buildAnalyticsReportScreenState(report);

  function openAnalytics() {
    router.replace('/(tabs)/analytics');
  }

  function openTransactions(drilldown: TransactionsDrilldown | null) {
    if (!drilldown) {
      openAnalytics();
      return;
    }

    router.push({
      params: createTransactionsDrilldownParams(drilldown),
      pathname: '/(tabs)/transactions',
    });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Deep analysis</Text>
        <Text style={styles.heroTitle}>{screenState.hero.title}</Text>
        <Text style={styles.heroMeta}>{screenState.hero.periodLabel}</Text>
        <Text style={styles.heroBody}>{screenState.hero.summary}</Text>
        <View style={styles.heroChipRow}>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>{screenState.hero.generatedLabel}</Text>
          </View>
          <View style={styles.heroChip}>
            <Text style={styles.heroChipText}>{screenState.hero.comparisonLabel}</Text>
          </View>
        </View>
        <View style={styles.comparisonRow}>
          {screenState.hero.metrics.map((metric) => (
            <View key={metric.id} style={styles.comparisonCard}>
              <Text style={styles.comparisonLabel}>{metric.label}</Text>
              <Text style={styles.comparisonValue}>{metric.value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.heroActionRow}>
          <Pressable accessibilityRole="button" onPress={openAnalytics} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{screenState.navigation.analyticsLabel}</Text>
          </Pressable>
          {screenState.summaryHighlights[0]?.drilldown ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => openTransactions(screenState.summaryHighlights[0]?.drilldown ?? null)}
              style={styles.secondaryHeroButton}>
              <Text style={styles.secondaryHeroButtonText}>Review top evidence</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {screenState.summaryHighlights.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary anchors</Text>
          {screenState.summaryHighlights.map((insight) => (
            <View key={insight.id} style={styles.insightCard}>
              <Text style={styles.insightEyebrow}>{insight.eyebrow}</Text>
              <Text style={styles.insightTitle}>{insight.title}</Text>
              <Text style={styles.cardBody}>{insight.body}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaChip}>{insight.evidenceLabel}</Text>
                {insight.impactLabel ? <Text style={styles.metaChip}>{insight.impactLabel}</Text> : null}
              </View>
              {insight.drilldown ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openTransactions(insight.drilldown)}
                  style={styles.inlineButton}>
                  <Text style={styles.inlineButtonText}>Open matching transactions</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {screenState.sections.map((section) => (
        <View key={section.id} style={styles.card}>
          <Text style={styles.sectionEyebrow}>Report section</Text>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.cardBody}>{section.body}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaChip}>{section.insightCountLabel}</Text>
            <Text style={styles.metaChip}>{section.evidenceLabel}</Text>
            {section.impactLabel ? <Text style={styles.metaChip}>{section.impactLabel}</Text> : null}
          </View>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={() => openTransactions(section.primaryDrilldown)}
              style={styles.inlineButton}>
              <Text style={styles.inlineButtonText}>{section.primaryActionLabel}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={openAnalytics} style={styles.ghostButton}>
              <Text style={styles.ghostButtonText}>{screenState.navigation.analyticsLabel}</Text>
            </Pressable>
          </View>
          {section.insights.map((insight) => (
            <View key={insight.id} style={styles.supportingCard}>
              <Text style={styles.insightEyebrow}>{insight.eyebrow}</Text>
              <Text style={styles.supportingTitle}>{insight.title}</Text>
              <Text style={styles.cardBody}>{insight.body}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaChip}>{insight.evidenceLabel}</Text>
                {insight.impactLabel ? <Text style={styles.metaChip}>{insight.impactLabel}</Text> : null}
              </View>
              {insight.drilldown ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openTransactions(insight.drilldown)}
                  style={styles.supportingButton}>
                  <Text style={styles.supportingButtonText}>Open evidence set</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ))}

      <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/analytics')} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Back to Analytics</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#dce3eb',
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    padding: 22,
  },
  cardBody: {
    color: '#596677',
    fontSize: 14,
    lineHeight: 21,
  },
  comparisonCard: {
    backgroundColor: '#11213e',
    borderRadius: 20,
    flex: 1,
    gap: 4,
    padding: 16,
  },
  comparisonLabel: {
    color: '#8ea4c7',
    fontSize: 12,
    fontWeight: '700',
  },
  comparisonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  comparisonValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  content: {
    backgroundColor: '#f7f9fb',
    gap: 18,
    padding: 20,
    paddingBottom: 36,
  },
  heroBody: {
    color: '#c2cde0',
    fontSize: 14,
    lineHeight: 21,
  },
  heroChip: {
    backgroundColor: '#12233d',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroChipText: {
    color: '#85f8c4',
    fontSize: 12,
    fontWeight: '700',
  },
  heroCard: {
    backgroundColor: '#000e24',
    borderRadius: 32,
    gap: 10,
    padding: 24,
  },
  heroActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  heroEyebrow: {
    color: '#85f8c4',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  heroMeta: {
    color: '#8ea4c7',
    fontSize: 13,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#000e24',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryHeroButton: {
    borderColor: '#2c4771',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondaryHeroButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  screen: {
    backgroundColor: '#f7f9fb',
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#000e24',
    borderRadius: 20,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  section: {
    gap: 12,
  },
  sectionEyebrow: {
    color: '#006c4a',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ghostButton: {
    borderColor: '#dce3eb',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ghostButtonText: {
    color: '#000e24',
    fontSize: 13,
    fontWeight: '700',
  },
  inlineButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#000e24',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  inlineButtonText: {
    color: '#ffffff',
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
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  insightTitle: {
    color: '#000e24',
    fontSize: 22,
    fontWeight: '800',
  },
  metaChip: {
    backgroundColor: '#edf1f5',
    borderRadius: 999,
    color: '#445165',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    color: '#000e24',
    fontSize: 20,
    fontWeight: '800',
  },
  supportingButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderColor: '#dce3eb',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  supportingButtonText: {
    color: '#000e24',
    fontSize: 13,
    fontWeight: '700',
  },
  supportingCard: {
    backgroundColor: '#f7f9fb',
    borderColor: '#e2e8f0',
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  supportingTitle: {
    color: '#000e24',
    fontSize: 18,
    fontWeight: '800',
  },
});
