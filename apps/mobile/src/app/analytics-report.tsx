import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuthSession } from '@/features/auth/auth-session';
import { formatCurrency } from '@/features/core-product/core-product-formatting';
import { loadAnalyticsReport } from '@/features/analytics/analytics-service';
import { getSupabaseClient } from '@/lib/supabase';

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Deep analysis</Text>
        <Text style={styles.heroTitle}>{report.title}</Text>
        <Text style={styles.heroMeta}>{formatReportPeriod(report.periodStart, report.periodEnd)}</Text>
        <Text style={styles.heroBody}>{report.summary}</Text>
        <View style={styles.comparisonRow}>
          <View style={styles.comparisonCard}>
            <Text style={styles.comparisonLabel}>Delta vs prior</Text>
            <Text style={styles.comparisonValue}>
              {report.comparison.deltaPercentage === null ? 'No prior data' : `${report.comparison.deltaPercentage.toFixed(1)}%`}
            </Text>
          </View>
          <View style={styles.comparisonCard}>
            <Text style={styles.comparisonLabel}>Previous spend</Text>
            <Text style={styles.comparisonValue}>{formatCurrency(report.comparison.previousSpend)}</Text>
          </View>
        </View>
      </View>

      {report.payload.sections.map((section) => (
        <View key={section.id} style={styles.card}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.cardBody}>{section.body}</Text>
          <Text style={styles.sectionMeta}>
            {section.insightIds.length} linked insight{section.insightIds.length === 1 ? '' : 's'}
          </Text>
        </View>
      ))}

      <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)/analytics')} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Back to Analytics</Text>
      </Pressable>
    </ScrollView>
  );
}

function formatReportPeriod(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(`${periodEnd}T00:00:00.000Z`);

  if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) {
    return dateFormatter.format(start);
  }

  return `${periodStart} - ${periodEnd}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#dce3eb',
    borderRadius: 28,
    borderWidth: 1,
    gap: 10,
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
  heroCard: {
    backgroundColor: '#000e24',
    borderRadius: 32,
    gap: 10,
    padding: 24,
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
  sectionMeta: {
    color: '#7a8596',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#000e24',
    fontSize: 20,
    fontWeight: '800',
  },
});
