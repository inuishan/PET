import { formatCurrency } from '@/features/core-product/core-product-formatting';
import { type TransactionsDrilldown } from '@/features/transactions/transactions-drilldown';

import type { AnalyticsBucket, AnalyticsInsight, AnalyticsPeriod, AnalyticsSnapshot } from './analytics-service';

const monthYearFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

const shortMonthFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  timeZone: 'UTC',
});

const shortDayMonthFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});

export type AnalyticsScreenState = {
  allocation: {
    items: Array<{
      categoryId: string | null;
      categoryName: string;
      drilldown: TransactionsDrilldown;
      shareLabel: string;
      tone: 'accent' | 'muted' | 'primary' | 'secondary';
      totalSpend: number;
      transactionCount: number;
    }>;
    totalSpend: number;
  };
  breakdowns: Array<{
    id: 'payment_source' | 'person';
    items: Array<{
      detail: string;
      drilldown: TransactionsDrilldown;
      label: string;
      shareLabel: string;
      totalSpend: number;
    }>;
    title: string;
  }>;
  deepAnalysis: {
    ctaLabel: string;
    reportId: string | null;
    subtitle: string;
    title: string;
  };
  hero: {
    comparisonLabel: string;
    currentSpend: number;
    deltaDirection: 'down' | 'flat' | 'up';
    deltaPercentage: number | null;
    periodLabel: string;
  };
  insightCards: Array<{
    body: string;
    drilldown: TransactionsDrilldown;
    eyebrow: string;
    id: string;
    impactLabel: string | null;
    summary: string;
    title: string;
  }>;
  recurringCards: Array<{
    averageAmount: number;
    cadenceLabel: string;
    drilldown: TransactionsDrilldown;
    merchantName: string;
    paymentSourceLabel: string;
    totalSpendLabel: string;
  }>;
  trend: {
    maxSpend: number;
    points: Array<{
      bucketLabel: string;
      drilldown: TransactionsDrilldown;
      emphasis: 'current' | 'default';
      heightRatio: number;
      label: string;
      normalizedHeight: number;
      shortLabel: string;
      spend: number;
      transactionCount: number;
    }>;
  };
};

export function createAnalyticsPeriodWindow(bucket: AnalyticsBucket, referenceDate: string): AnalyticsPeriod {
  const reference = new Date(referenceDate);

  if (bucket === 'week') {
    const startOn = startOfWeek(reference);
    const endOn = addDays(startOn, 6);
    const comparisonEndOn = addDays(startOn, -1);
    const comparisonStartOn = addDays(startOn, -7);

    return {
      bucket,
      comparisonEndOn: formatDateOnly(comparisonEndOn),
      comparisonStartOn: formatDateOnly(comparisonStartOn),
      endOn: formatDateOnly(endOn),
      startOn: formatDateOnly(startOn),
    };
  }

  if (bucket === 'month') {
    const startOn = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
    const endOn = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0));
    const comparisonStartOn = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - 1, 1));
    const comparisonEndOn = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 0));

    return {
      bucket,
      comparisonEndOn: formatDateOnly(comparisonEndOn),
      comparisonStartOn: formatDateOnly(comparisonStartOn),
      endOn: formatDateOnly(endOn),
      startOn: formatDateOnly(startOn),
    };
  }

  const startOn = new Date(Date.UTC(reference.getUTCFullYear(), 0, 1));
  const endOn = new Date(Date.UTC(reference.getUTCFullYear(), 11, 31));
  const comparisonStartOn = new Date(Date.UTC(reference.getUTCFullYear() - 1, 0, 1));
  const comparisonEndOn = new Date(Date.UTC(reference.getUTCFullYear() - 1, 11, 31));

  return {
    bucket,
    comparisonEndOn: formatDateOnly(comparisonEndOn),
    comparisonStartOn: formatDateOnly(comparisonStartOn),
    endOn: formatDateOnly(endOn),
    startOn: formatDateOnly(startOn),
  };
}

export function buildAnalyticsScreenState(snapshot: AnalyticsSnapshot): AnalyticsScreenState {
  const totalSpend = snapshot.comparison.currentSpend;
  const maxTrendSpend = Math.max(...snapshot.trendSeries.map((point) => point.totalSpend), 1);

  return {
    allocation: {
      items: snapshot.categoryAllocation.map((allocation, index) => ({
        categoryId: allocation.categoryId,
        categoryName: allocation.categoryName,
        drilldown: {
          categoryId: allocation.categoryId,
          endOn: snapshot.period.endOn,
          origin: 'analytics',
          ownerMemberId: null,
          ownerScope: 'all',
          periodBucket: snapshot.period.bucket,
          searchQuery: '',
          sourceType: 'all',
          startOn: snapshot.period.startOn,
          subtitle: buildPeriodSubtitle(snapshot.period),
          title: `${allocation.categoryName} transactions`,
          transactionIds: [],
        },
        shareLabel: formatShare(allocation.shareBps),
        tone: readAllocationTone(index),
        totalSpend: allocation.totalSpend,
        transactionCount: allocation.transactionCount,
      })),
      totalSpend,
    },
    breakdowns: [
      {
        id: 'person',
        items: snapshot.spendByPerson.map((person) => ({
          detail: `${person.transactionCount} ${person.transactionCount === 1 ? 'transaction' : 'transactions'}`,
          drilldown: {
            categoryId: null,
            endOn: snapshot.period.endOn,
            origin: 'analytics',
            ownerMemberId: person.ownerMemberId,
            ownerScope: person.ownerScope,
            periodBucket: snapshot.period.bucket,
            searchQuery: '',
            sourceType: 'all',
            startOn: snapshot.period.startOn,
            subtitle: buildPeriodSubtitle(snapshot.period),
            title: `${readOwnerLabel(person.ownerDisplayName, person.ownerScope)} spend`,
            transactionIds: [],
          },
          label: readOwnerLabel(person.ownerDisplayName, person.ownerScope),
          shareLabel: formatShare(person.shareBps),
          totalSpend: person.totalSpend,
        })),
        title: 'Spend by person',
      },
      {
        id: 'payment_source',
        items: snapshot.spendByPaymentSource.map((source) => ({
          detail: `${source.transactionCount} ${source.transactionCount === 1 ? 'transaction' : 'transactions'}`,
          drilldown: {
            categoryId: null,
            endOn: snapshot.period.endOn,
            origin: 'analytics',
            ownerMemberId: null,
            ownerScope: 'all',
            periodBucket: snapshot.period.bucket,
            searchQuery: '',
            sourceType: readSupportedSourceType(source.sourceType),
            startOn: snapshot.period.startOn,
            subtitle: buildPeriodSubtitle(snapshot.period),
            title: `${source.paymentSourceLabel} transactions`,
            transactionIds: [],
          },
          label: source.paymentSourceLabel,
          shareLabel: formatShare(source.shareBps),
          totalSpend: source.totalSpend,
        })),
        title: 'Spend by payment source',
      },
    ],
    deepAnalysis: {
      ctaLabel: snapshot.latestReport ? 'Open Deep Analysis' : 'Deep Analysis Unavailable',
      reportId: snapshot.latestReport?.id ?? null,
      subtitle: snapshot.latestReport
        ? `Latest report • ${monthYearFormatter.format(toDateFromDateOnly(snapshot.latestReport.periodEnd))}`
        : 'Generate a richer savings narrative for the current period.',
      title: snapshot.latestReport?.title ?? 'Deep Analysis',
    },
    hero: {
      comparisonLabel: buildComparisonLabel(snapshot),
      currentSpend: totalSpend,
      deltaDirection: readDeltaDirection(snapshot.comparison.deltaSpend),
      deltaPercentage: snapshot.comparison.deltaPercentage,
      periodLabel: buildHeroPeriodLabel(snapshot.period),
    },
    insightCards: snapshot.insights.map((insight) => ({
      body: `${insight.summary} ${insight.recommendation}`.trim(),
      drilldown: buildInsightDrilldown(snapshot.period, insight),
      eyebrow: formatInsightType(insight.type),
      id: insight.id,
      impactLabel: insight.estimatedMonthlyImpact === null
        ? null
        : `Potential monthly impact: ${formatCurrency(insight.estimatedMonthlyImpact)}`,
      summary: insight.summary,
      title: insight.title,
    })),
    recurringCards: snapshot.recurringChargeCandidates.map((candidate) => ({
      averageAmount: candidate.averageAmount,
      cadenceLabel: candidate.averageCadenceDays === null
        ? 'Recurring candidate'
        : `Every ${candidate.averageCadenceDays} days`,
      drilldown: {
        categoryId: null,
        endOn: snapshot.period.endOn,
        origin: 'analytics',
        ownerMemberId: null,
        ownerScope: 'all',
        periodBucket: snapshot.period.bucket,
        searchQuery: candidate.merchantName,
        sourceType: inferSourceTypeFromLabel(candidate.paymentSourceLabel),
        startOn: snapshot.period.startOn,
        subtitle: buildPeriodSubtitle(snapshot.period),
        title: `${candidate.merchantName} recurring charges`,
        transactionIds: [],
      },
      merchantName: candidate.merchantName,
      paymentSourceLabel: candidate.paymentSourceLabel,
      totalSpendLabel: formatCurrency(candidate.averageAmount),
    })),
    trend: {
      maxSpend: maxTrendSpend,
      points: snapshot.trendSeries.map((point, index) => ({
        bucketLabel: point.bucketLabel,
        drilldown: {
          categoryId: null,
          endOn: point.bucketEndOn,
          origin: 'analytics',
          ownerMemberId: null,
          ownerScope: 'all',
          periodBucket: snapshot.period.bucket,
          searchQuery: '',
          sourceType: 'all',
          startOn: point.bucketStartOn,
          subtitle: buildPeriodSubtitle({
            ...snapshot.period,
            endOn: point.bucketEndOn,
            startOn: point.bucketStartOn,
          }),
          title: `${point.bucketLabel} spend`,
          transactionIds: [],
        },
        emphasis: index === snapshot.trendSeries.length - 1 ? 'current' : 'default',
        heightRatio: point.totalSpend / maxTrendSpend,
        label: point.bucketLabel,
        normalizedHeight: point.totalSpend / maxTrendSpend,
        shortLabel: shortMonthFormatter.format(toDateFromDateOnly(point.bucketStartOn)),
        spend: point.totalSpend,
        transactionCount: point.transactionCount,
      })),
    },
  };
}

function addDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function buildComparisonLabel(snapshot: AnalyticsSnapshot) {
  if (snapshot.comparison.deltaPercentage === null) {
    return 'No prior period available';
  }

  const direction = snapshot.comparison.deltaSpend > 0 ? 'up' : snapshot.comparison.deltaSpend < 0 ? 'down' : 'flat';
  const prefix = direction === 'up' ? '+' : direction === 'down' ? '' : '';

  return `${prefix}${snapshot.comparison.deltaPercentage.toFixed(1)}% vs previous ${snapshot.period.bucket}`;
}

function buildHeroPeriodLabel(period: AnalyticsPeriod) {
  if (period.bucket === 'month') {
    return monthYearFormatter.format(toDateFromDateOnly(period.startOn));
  }

  if (period.bucket === 'year') {
    return String(toDateFromDateOnly(period.startOn).getUTCFullYear());
  }

  return `${shortDayMonthFormatter.format(toDateFromDateOnly(period.startOn))} - ${shortDayMonthFormatter.format(toDateFromDateOnly(period.endOn))}`;
}

function buildInsightDrilldown(period: AnalyticsPeriod, insight: AnalyticsInsight): TransactionsDrilldown {
  return {
    categoryId: null,
    endOn: insight.generatedFrom.periodEnd ?? period.endOn,
    origin: 'analytics',
    ownerMemberId: null,
    ownerScope: 'all',
    periodBucket: period.bucket,
    searchQuery: '',
    sourceType: 'all',
    startOn: insight.generatedFrom.periodStart ?? period.startOn,
    subtitle: buildPeriodSubtitle(period),
    title: insight.title,
    transactionIds: insight.generatedFrom.supportingTransactionIds.length > 0
      ? insight.generatedFrom.supportingTransactionIds
      : [],
  };
}

function buildPeriodSubtitle(period: AnalyticsPeriod) {
  if (period.bucket === 'month') {
    return monthYearFormatter.format(toDateFromDateOnly(period.startOn));
  }

  if (period.bucket === 'year') {
    return `${toDateFromDateOnly(period.startOn).getUTCFullYear()} annual spend`;
  }

  return `${shortDayMonthFormatter.format(toDateFromDateOnly(period.startOn))} - ${shortDayMonthFormatter.format(toDateFromDateOnly(period.endOn))}`;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatInsightType(type: AnalyticsInsight['type']) {
  switch (type) {
    case 'category_pattern':
      return 'Category Pattern';
    case 'duplicate_subscription':
      return 'Subscription Leak';
    case 'overspending':
      return 'Overspending';
    case 'recurring_charge':
      return 'Recurring Charge';
    case 'savings_opportunity':
      return 'Savings Opportunity';
    case 'unusual_spike':
      return 'Unusual Spike';
    default:
      return 'Insight';
  }
}

function formatShare(shareBps: number) {
  return `${(shareBps / 100).toFixed(1)}%`;
}

function inferSourceTypeFromLabel(label: string): TransactionsDrilldown['sourceType'] {
  return label.toLowerCase().includes('upi') ? 'upi_whatsapp' : 'credit_card_statement';
}

function readAllocationTone(index: number): AnalyticsScreenState['allocation']['items'][number]['tone'] {
  if (index === 0) {
    return 'primary';
  }

  if (index === 1) {
    return 'secondary';
  }

  if (index === 2) {
    return 'accent';
  }

  return 'muted';
}

function readDeltaDirection(deltaSpend: number): AnalyticsScreenState['hero']['deltaDirection'] {
  if (deltaSpend > 0) {
    return 'up';
  }

  if (deltaSpend < 0) {
    return 'down';
  }

  return 'flat';
}

function readOwnerLabel(ownerDisplayName: string | null, ownerScope: 'member' | 'shared' | 'unknown') {
  if (ownerDisplayName) {
    return ownerDisplayName;
  }

  if (ownerScope === 'shared') {
    return 'Shared';
  }

  if (ownerScope === 'unknown') {
    return 'Unknown';
  }

  return 'Member';
}

function readSupportedSourceType(
  sourceType: AnalyticsSnapshot['spendByPaymentSource'][number]['sourceType']
): TransactionsDrilldown['sourceType'] {
  if (sourceType === 'credit_card_statement' || sourceType === 'upi_whatsapp') {
    return sourceType;
  }

  return 'all';
}

function startOfWeek(reference: Date) {
  const dayOfWeek = reference.getUTCDay();
  const distanceFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  return addDays(new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate())), -distanceFromMonday);
}

function toDateFromDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
