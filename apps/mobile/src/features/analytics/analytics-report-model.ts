import { formatCurrency } from '../core-product/core-product-formatting.ts';
import { type TransactionsDrilldown } from '../transactions/transactions-drilldown.ts';

import { type AnalyticsInsight, type AnalyticsReport } from './analytics-service.ts';

const monthYearFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
});

const publishedFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

type AnalyticsReportSectionKind =
  | 'major_spend_shifts'
  | 'savings_opportunities'
  | 'recurring_charge_findings'
  | 'unusual_patterns'
  | 'recommended_next_actions';

type AnalyticsReportInsightCard = {
  body: string;
  drilldown: TransactionsDrilldown | null;
  evidenceLabel: string;
  eyebrow: string;
  id: string;
  impactLabel: string | null;
  title: string;
};

export type AnalyticsReportScreenState = {
  hero: {
    comparisonLabel: string;
    generatedLabel: string;
    metrics: Array<{
      id: 'delta' | 'previous_spend' | 'report_type';
      label: string;
      value: string;
    }>;
    periodLabel: string;
    summary: string;
    title: string;
  };
  navigation: {
    analyticsLabel: string;
  };
  sections: Array<{
    body: string;
    evidenceLabel: string;
    id: string;
    impactLabel: string | null;
    insightCountLabel: string;
    insights: AnalyticsReportInsightCard[];
    kind: AnalyticsReportSectionKind;
    primaryActionLabel: string;
    primaryDrilldown: TransactionsDrilldown | null;
    title: string;
  }>;
  summaryHighlights: AnalyticsReportInsightCard[];
};

type SectionBlueprint = {
  emptyBody: string;
  id: AnalyticsReportSectionKind;
  legacyIds: string[];
  legacyTitles: string[];
  title: string;
};

const sectionBlueprints: SectionBlueprint[] = [
  {
    emptyBody: 'No major spend shifts crossed the report threshold in this period.',
    id: 'major_spend_shifts',
    legacyIds: ['major-spend-shifts', 'major_spend_shifts', 'what-changed'],
    legacyTitles: ['Major spend shifts', 'What changed'],
    title: 'Major spend shifts',
  },
  {
    emptyBody: 'No high-confidence savings opportunity exceeded the current recommendation threshold.',
    id: 'savings_opportunities',
    legacyIds: ['savings-opportunities', 'savings_opportunities'],
    legacyTitles: ['Savings opportunities'],
    title: 'Savings opportunities',
  },
  {
    emptyBody: 'No recurring-charge finding needs action beyond the current review threshold.',
    id: 'recurring_charge_findings',
    legacyIds: ['recurring-charge-findings', 'recurring_charges', 'watch-list'],
    legacyTitles: ['Recurring-charge findings', 'Watch list'],
    title: 'Recurring-charge findings',
  },
  {
    emptyBody: 'No unusual behavior pattern stood out strongly enough to call out in this cycle.',
    id: 'unusual_patterns',
    legacyIds: ['unusual-patterns', 'unusual_patterns'],
    legacyTitles: ['Unusual patterns'],
    title: 'Unusual patterns',
  },
  {
    emptyBody: 'No next action was generated for this report yet.',
    id: 'recommended_next_actions',
    legacyIds: ['recommended-next-actions', 'recommended_next_actions', 'next-actions', 'next_actions'],
    legacyTitles: ['Recommended next actions', 'Next actions'],
    title: 'Recommended next actions',
  },
];

export function buildAnalyticsReportScreenState(report: AnalyticsReport): AnalyticsReportScreenState {
  const insightMap = new Map(report.insights.map((insight) => [insight.id, insight]));
  const summaryHighlights = report.payload.summaryInsightIds
    .map((insightId) => insightMap.get(insightId))
    .filter((insight): insight is AnalyticsInsight => insight !== undefined)
    .map((insight) => buildInsightCard(report, insight));

  return {
    hero: {
      comparisonLabel: buildComparisonLabel(report),
      generatedLabel: `Published ${publishedFormatter.format(new Date(report.generatedAt))}`,
      metrics: [
        {
          id: 'delta',
          label: 'Delta vs prior',
          value: report.comparison.deltaPercentage === null
            ? 'No prior data'
            : `${report.comparison.deltaSpend > 0 ? '+' : report.comparison.deltaSpend < 0 ? '' : ''}${report.comparison.deltaPercentage.toFixed(1)}%`,
        },
        {
          id: 'previous_spend',
          label: 'Previous spend',
          value: formatCurrency(report.comparison.previousSpend),
        },
        {
          id: 'report_type',
          label: 'Report type',
          value: report.reportType === 'monthly' ? 'Monthly report' : 'On-demand report',
        },
      ],
      periodLabel: formatReportPeriod(report.periodStart, report.periodEnd),
      summary: report.summary,
      title: report.title,
    },
    navigation: {
      analyticsLabel: 'Back to Analytics',
    },
    sections: sectionBlueprints.map((blueprint) => buildSectionCard(report, blueprint, insightMap)),
    summaryHighlights,
  };
}

function buildSectionCard(
  report: AnalyticsReport,
  blueprint: SectionBlueprint,
  insightMap: Map<string, AnalyticsInsight>,
): AnalyticsReportScreenState['sections'][number] {
  const matchedSection = report.payload.sections.find((section) => matchesBlueprint(blueprint, section.id, section.title));
  const linkedInsights = readSectionInsights(matchedSection?.insightIds ?? [], insightMap);
  const transactionIds = collectTransactionIds(linkedInsights);

  return {
    body: matchedSection?.body ?? blueprint.emptyBody,
    evidenceLabel: formatEvidenceCount(transactionIds.length),
    id: blueprint.id,
    impactLabel: formatSectionImpact(linkedInsights),
    insightCountLabel: formatInsightCount(linkedInsights.length),
    insights: linkedInsights.map((insight) => buildInsightCard(report, insight)),
    kind: blueprint.id,
    primaryActionLabel: transactionIds.length > 0 ? 'Open matching transactions' : 'Open Analytics',
    primaryDrilldown: transactionIds.length > 0
      ? buildSectionDrilldown(report, blueprint.title, transactionIds)
      : null,
    title: blueprint.title,
  };
}

function buildComparisonLabel(report: AnalyticsReport) {
  if (report.comparison.deltaPercentage === null) {
    return 'No prior period available';
  }

  const prefix = report.comparison.deltaSpend > 0 ? '+' : report.comparison.deltaSpend < 0 ? '' : '';
  const comparisonLabel = report.reportType === 'monthly' ? 'previous month' : 'previous period';

  return `${prefix}${report.comparison.deltaPercentage.toFixed(1)}% vs ${comparisonLabel}`;
}

function buildInsightCard(report: AnalyticsReport, insight: AnalyticsInsight): AnalyticsReportInsightCard {
  const supportingCount = insight.generatedFrom.supportingTransactionIds.length;

  return {
    body: `${insight.summary} ${insight.recommendation}`.trim(),
    drilldown: supportingCount > 0 ? buildInsightDrilldown(report, insight) : null,
    evidenceLabel: formatEvidenceCount(supportingCount, 'Backed by '),
    eyebrow: formatInsightType(insight.type),
    id: insight.id,
    impactLabel: insight.estimatedMonthlyImpact === null
      ? null
      : `Potential monthly impact: ${formatCurrency(insight.estimatedMonthlyImpact)}`,
    title: insight.title,
  };
}

function buildInsightDrilldown(report: AnalyticsReport, insight: AnalyticsInsight): TransactionsDrilldown {
  return {
    categoryId: null,
    endOn: insight.generatedFrom.periodEnd ?? report.periodEnd,
    origin: 'analytics',
    ownerMemberId: null,
    ownerScope: 'all',
    periodBucket: inferPeriodBucket(report),
    searchQuery: '',
    sourceType: 'all',
    startOn: insight.generatedFrom.periodStart ?? report.periodStart,
    subtitle: formatReportPeriod(report.periodStart, report.periodEnd),
    title: insight.title,
    transactionIds: [...insight.generatedFrom.supportingTransactionIds],
  };
}

function buildSectionDrilldown(report: AnalyticsReport, title: string, transactionIds: string[]): TransactionsDrilldown {
  return {
    categoryId: null,
    endOn: report.periodEnd,
    origin: 'analytics',
    ownerMemberId: null,
    ownerScope: 'all',
    periodBucket: inferPeriodBucket(report),
    searchQuery: '',
    sourceType: 'all',
    startOn: report.periodStart,
    subtitle: formatReportPeriod(report.periodStart, report.periodEnd),
    title,
    transactionIds,
  };
}

function collectTransactionIds(insights: AnalyticsInsight[]) {
  return [...new Set(insights.flatMap((insight) => insight.generatedFrom.supportingTransactionIds))];
}

function formatEvidenceCount(count: number, prefix = '') {
  return `${prefix}${count} matching transaction${count === 1 ? '' : 's'}`;
}

function formatInsightCount(count: number) {
  return `${count} linked insight${count === 1 ? '' : 's'}`;
}

function formatInsightType(type: AnalyticsInsight['type']) {
  switch (type) {
    case 'category_pattern':
      return 'Unusual pattern';
    case 'duplicate_subscription':
      return 'Recurring charge';
    case 'overspending':
      return 'Spend shift';
    case 'recurring_charge':
      return 'Recurring charge';
    case 'savings_opportunity':
      return 'Savings opportunity';
    case 'unusual_spike':
      return 'Spend shift';
    default:
      return 'Insight';
  }
}

function formatReportPeriod(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T00:00:00.000Z`);
  const end = new Date(`${periodEnd}T00:00:00.000Z`);

  if (start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()) {
    return monthYearFormatter.format(start);
  }

  return `${periodStart} - ${periodEnd}`;
}

function formatSectionImpact(insights: AnalyticsInsight[]) {
  const estimatedImpact = insights.reduce((total, insight) => total + (insight.estimatedMonthlyImpact ?? 0), 0);

  return estimatedImpact > 0 ? `Potential monthly impact: ${formatCurrency(estimatedImpact)}` : null;
}

function inferPeriodBucket(report: AnalyticsReport): TransactionsDrilldown['periodBucket'] {
  return report.reportType === 'monthly' ? 'month' : 'custom';
}

function matchesBlueprint(blueprint: SectionBlueprint, sectionId: string, title: string) {
  const normalizedId = normalizeKey(sectionId);
  const normalizedTitle = normalizeKey(title);

  return blueprint.legacyIds.some((candidate) => normalizeKey(candidate) === normalizedId) ||
    blueprint.legacyTitles.some((candidate) => normalizeKey(candidate) === normalizedTitle);
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function readSectionInsights(insightIds: string[], insightMap: Map<string, AnalyticsInsight>) {
  return dedupeInsights(
    insightIds
    .map((insightId) => insightMap.get(insightId))
    .filter((insight): insight is AnalyticsInsight => insight !== undefined),
  );
}

function dedupeInsights(insights: AnalyticsInsight[]) {
  return [...new Map(insights.map((insight) => [insight.id, insight])).values()];
}
