export type AnalyticsInsightType =
  | 'category_pattern'
  | 'duplicate_subscription'
  | 'overspending'
  | 'recurring_charge'
  | 'savings_opportunity'
  | 'unusual_spike';

export type AnalyticsReportType = 'monthly' | 'on_demand';

export type AnalyticsGenerationPeriod = {
  bucket: 'week' | 'month' | 'year';
  comparisonEndOn: string;
  comparisonStartOn: string;
  endOn: string;
  startOn: string;
};

export type AnalyticsFact = {
  amount: number;
  categoryId: string | null;
  categoryName: string;
  id: string;
  merchantName: string;
  needsReview: boolean;
  ownerDisplayName: string | null;
  ownerMemberId: string | null;
  ownerScope: 'member' | 'shared' | 'unknown';
  paymentSourceLabel: string;
  sourceType: 'credit_card_statement' | 'manual_entry' | 'system_adjustment' | 'upi_whatsapp';
  status: 'failed' | 'flagged' | 'needs_review' | 'processed';
  transactionDate: string;
  transactionMonth: string;
};

export type GeneratedInsightEvidence = {
  context: string | null;
  label: string;
  metricKey: string;
  transactionId: string | null;
  value: number | string;
};

export type GeneratedInsightProvenance = {
  metrics: Record<string, number | string | null>;
  periodEnd: string;
  periodStart: string;
  signalKey: string;
  signalVersion: 'phase3b_v1';
  source: 'deterministic';
  supportingTransactionIds: string[];
};

export type GeneratedAnalyticsInsight = {
  evidencePayload: GeneratedInsightEvidence[];
  estimatedMonthlyImpact: number | null;
  generatedAt: string;
  generatedFrom: GeneratedInsightProvenance;
  id: string;
  recommendation: string;
  summary: string;
  title: string;
  type: AnalyticsInsightType;
};

export type GeneratedAnalyticsReport = {
  comparison: {
    currentSpend: number;
    deltaPercentage: number | null;
    deltaSpend: number;
    previousSpend: number;
  };
  generatedAt: string;
  id: string;
  payload: {
    sections: Array<{
      body: string;
      id: string;
      insightIds: string[];
      title: string;
    }>;
    summaryInsightIds: string[];
  };
  periodEnd: string;
  periodStart: string;
  reportType: AnalyticsReportType;
  summary: string;
  title: string;
};

export type GeneratedAnalyticsOutputs = {
  comparison: GeneratedAnalyticsReport['comparison'];
  insights: GeneratedAnalyticsInsight[];
  report: GeneratedAnalyticsReport;
};

type GenerationInput = {
  createId?: () => string;
  facts: AnalyticsFact[];
  generatedAt: string;
  householdId: string;
  period: AnalyticsGenerationPeriod;
  reportType: AnalyticsReportType;
};

type ScoredInsight = GeneratedAnalyticsInsight & {
  score: number;
};

const SIGNAL_VERSION = 'phase3b_v1';

export function generateAnalyticsOutputs(input: GenerationInput): GeneratedAnalyticsOutputs {
  const createId = input.createId ?? (() => crypto.randomUUID());
  const trustedFacts = input.facts.filter((fact) => fact.status === 'processed' && fact.needsReview === false);
  const currentFacts = filterFactsForWindow(trustedFacts, input.period.startOn, input.period.endOn);
  const previousFacts = filterFactsForWindow(
    trustedFacts,
    input.period.comparisonStartOn,
    input.period.comparisonEndOn,
  );
  const comparison = buildComparison(currentFacts, previousFacts);
  const insights = buildInsights({
    comparison,
    createId,
    currentFacts,
    generatedAt: input.generatedAt,
    period: input.period,
    previousFacts,
    trustedFacts,
  });

  return {
    comparison,
    insights: insights.map(stripInsightScore),
    report: buildReport({
      comparison,
      createId,
      generatedAt: input.generatedAt,
      insights,
      period: input.period,
      reportType: input.reportType,
    }),
  };
}

function buildInsights(input: {
  comparison: GeneratedAnalyticsOutputs['comparison'];
  createId: () => string;
  currentFacts: AnalyticsFact[];
  generatedAt: string;
  period: AnalyticsGenerationPeriod;
  previousFacts: AnalyticsFact[];
  trustedFacts: AnalyticsFact[];
}) {
  const insights = [
    buildMerchantSpikeInsight(input),
    buildOverspendingInsight(input),
    buildSavingsOpportunityInsight(input),
    buildDuplicateSubscriptionInsight(input),
    buildCategoryPatternInsight(input),
  ].filter(Boolean) as ScoredInsight[];

  return insights.sort((left, right) => right.score - left.score);
}

function buildMerchantSpikeInsight(input: {
  comparison: GeneratedAnalyticsOutputs['comparison'];
  createId: () => string;
  currentFacts: AnalyticsFact[];
  generatedAt: string;
  period: AnalyticsGenerationPeriod;
  previousFacts: AnalyticsFact[];
  trustedFacts: AnalyticsFact[];
}) {
  const currentMerchantGroups = summarizeBy(input.currentFacts, (fact) => fact.merchantName);
  const previousFacts = input.trustedFacts.filter((fact) => fact.transactionDate < input.period.startOn);
  let bestCandidate: {
    baselineSpend: number;
    currentSpend: number;
    merchantName: string;
    supportingTransactionIds: string[];
  } | null = null;

  for (const [merchantName, summary] of currentMerchantGroups) {
    if (summary.totalSpend < 1_500) {
      continue;
    }

    const baselineFacts = previousFacts.filter((fact) => fact.merchantName === merchantName);
    const monthlyBaselineGroups = summarizeBy(baselineFacts, (fact) => fact.transactionMonth);
    const baselineSpend = monthlyBaselineGroups.size > 0
      ? Array.from(monthlyBaselineGroups.values()).reduce((total, monthlySummary) => total + monthlySummary.totalSpend, 0) / monthlyBaselineGroups.size
      : 0;
    const deltaSpend = summary.totalSpend - baselineSpend;

    if (baselineSpend === 0 && summary.totalSpend < 2_500) {
      continue;
    }

    if (baselineSpend > 0 && (summary.totalSpend < baselineSpend * 2 || deltaSpend < 1_000)) {
      continue;
    }

    if (!bestCandidate || deltaSpend > bestCandidate.currentSpend - bestCandidate.baselineSpend) {
      bestCandidate = {
        baselineSpend,
        currentSpend: summary.totalSpend,
        merchantName,
        supportingTransactionIds: summary.transactionIds,
      };
    }
  }

  if (!bestCandidate) {
    return null;
  }

  const deltaSpend = bestCandidate.currentSpend - bestCandidate.baselineSpend;
  const title = bestCandidate.baselineSpend > 0
    ? `${bestCandidate.merchantName} spend is well above its usual level`
    : `${bestCandidate.merchantName} is a new large merchant this period`;

  return createInsight({
    createId: input.createId,
    evidencePayload: [
      evidence('Current spend', 'currentSpend', bestCandidate.currentSpend),
      evidence('Historical baseline', 'baselineSpend', bestCandidate.baselineSpend),
      evidence('Extra spend to review', 'deltaSpend', deltaSpend),
    ],
    estimatedMonthlyImpact: roundCurrency(deltaSpend > 0 ? deltaSpend : bestCandidate.currentSpend),
    generatedAt: input.generatedAt,
    generatedFrom: {
      metrics: {
        baselineSpend: roundCurrency(bestCandidate.baselineSpend),
        currentSpend: roundCurrency(bestCandidate.currentSpend),
        deltaSpend: roundCurrency(deltaSpend),
      },
      periodEnd: input.period.endOn,
      periodStart: input.period.startOn,
      signalKey: 'merchant_spike',
      signalVersion: SIGNAL_VERSION,
      source: 'deterministic',
      supportingTransactionIds: bestCandidate.supportingTransactionIds,
    },
    recommendation: `Review ${bestCandidate.merchantName} for one-off purchases or billing errors before it becomes a repeat line item.`,
    score: deltaSpend,
    summary: bestCandidate.baselineSpend > 0
      ? `${bestCandidate.merchantName} reached ${formatCurrency(bestCandidate.currentSpend)} this period versus ${formatCurrency(bestCandidate.baselineSpend)} across prior history.`
      : `${bestCandidate.merchantName} added ${formatCurrency(bestCandidate.currentSpend)} with no comparable prior spend in the household ledger.`,
    title,
    type: 'unusual_spike',
  });
}

function buildOverspendingInsight(input: {
  comparison: GeneratedAnalyticsOutputs['comparison'];
  createId: () => string;
  currentFacts: AnalyticsFact[];
  generatedAt: string;
  period: AnalyticsGenerationPeriod;
  previousFacts: AnalyticsFact[];
}) {
  const currentCategories = summarizeBy(input.currentFacts, (fact) => fact.categoryName);
  const previousCategories = summarizeBy(input.previousFacts, (fact) => fact.categoryName);
  let bestCategory: { currentSpend: number; previousSpend: number; categoryName: string; transactionIds: string[] } | null = null;

  for (const [categoryName, currentSummary] of currentCategories) {
    const previousSpend = previousCategories.get(categoryName)?.totalSpend ?? 0;
    const deltaSpend = currentSummary.totalSpend - previousSpend;
    const dominantMerchantSpend = Math.max(
      ...Array.from(summarizeBy(currentSummary.facts, (fact) => fact.merchantName).values()).map((summary) => summary.totalSpend),
    );
    const dominantMerchantShare = currentSummary.totalSpend === 0
      ? 0
      : dominantMerchantSpend / currentSummary.totalSpend;

    if (
      currentSummary.totalSpend < 2_000 ||
      deltaSpend < 750 ||
      previousSpend <= 0 ||
      dominantMerchantShare > 0.7
    ) {
      continue;
    }

    if (!bestCategory || deltaSpend > bestCategory.currentSpend - bestCategory.previousSpend) {
      bestCategory = {
        categoryName,
        currentSpend: currentSummary.totalSpend,
        previousSpend,
        transactionIds: currentSummary.transactionIds,
      };
    }
  }

  if (!bestCategory) {
    return null;
  }

  const deltaSpend = bestCategory.currentSpend - bestCategory.previousSpend;
  const deltaPercentage = roundPercentage((deltaSpend / bestCategory.previousSpend) * 100);

  return createInsight({
    createId: input.createId,
    evidencePayload: [
      evidence('Current spend', 'currentSpend', bestCategory.currentSpend),
      evidence('Previous spend', 'previousSpend', bestCategory.previousSpend),
      evidence('Month-over-month change', 'deltaPercentage', deltaPercentage),
    ],
    estimatedMonthlyImpact: roundCurrency(Math.min(deltaSpend, bestCategory.currentSpend * 0.2)),
    generatedAt: input.generatedAt,
    generatedFrom: {
      metrics: {
        currentSpend: roundCurrency(bestCategory.currentSpend),
        deltaPercentage,
        deltaSpend: roundCurrency(deltaSpend),
        previousSpend: roundCurrency(bestCategory.previousSpend),
      },
      periodEnd: input.period.endOn,
      periodStart: input.period.startOn,
      signalKey: 'category_overspending',
      signalVersion: SIGNAL_VERSION,
      source: 'deterministic',
      supportingTransactionIds: bestCategory.transactionIds,
    },
    recommendation: `Set a tighter weekly limit for ${bestCategory.categoryName} and shift one purchase each week to a lower-cost alternative.`,
    score: deltaSpend,
    summary: `${bestCategory.categoryName} climbed to ${formatCurrency(bestCategory.currentSpend)} from ${formatCurrency(bestCategory.previousSpend)} in the comparison window.`,
    title: `${bestCategory.categoryName} is outpacing the prior period`,
    type: 'overspending',
  });
}

function buildSavingsOpportunityInsight(input: {
  comparison: GeneratedAnalyticsOutputs['comparison'];
  createId: () => string;
  currentFacts: AnalyticsFact[];
  generatedAt: string;
  period: AnalyticsGenerationPeriod;
}) {
  const currentCategories = summarizeBy(input.currentFacts, (fact) => fact.categoryName);
  let bestCategory: {
    averageTransactionAmount: number;
    categoryName: string;
    totalSpend: number;
    transactionCount: number;
    transactionIds: string[];
  } | null = null;

  for (const [categoryName, summary] of currentCategories) {
    const averageTransactionAmount = summary.totalSpend / summary.transactionCount;

    if (summary.transactionCount < 6 || summary.totalSpend < 2_000 || averageTransactionAmount > 400) {
      continue;
    }

    if (!bestCategory || summary.totalSpend > bestCategory.totalSpend) {
      bestCategory = {
        averageTransactionAmount,
        categoryName,
        totalSpend: summary.totalSpend,
        transactionCount: summary.transactionCount,
        transactionIds: summary.transactionIds,
      };
    }
  }

  if (!bestCategory) {
    return null;
  }

  return createInsight({
    createId: input.createId,
    evidencePayload: [
      evidence('Current spend', 'currentSpend', bestCategory.totalSpend),
      evidence('Transaction count', 'transactionCount', bestCategory.transactionCount),
      evidence('Average transaction amount', 'averageTransactionAmount', roundCurrency(bestCategory.averageTransactionAmount)),
    ],
    estimatedMonthlyImpact: roundCurrency(bestCategory.totalSpend * 0.15),
    generatedAt: input.generatedAt,
    generatedFrom: {
      metrics: {
        averageTransactionAmount: roundCurrency(bestCategory.averageTransactionAmount),
        currentSpend: roundCurrency(bestCategory.totalSpend),
        transactionCount: bestCategory.transactionCount,
      },
      periodEnd: input.period.endOn,
      periodStart: input.period.startOn,
      signalKey: 'category_frequency_savings',
      signalVersion: SIGNAL_VERSION,
      source: 'deterministic',
      supportingTransactionIds: bestCategory.transactionIds,
    },
    recommendation: `Batch a portion of ${bestCategory.categoryName} purchases into planned weekly trips instead of ad hoc spends.`,
    score: bestCategory.totalSpend,
    summary: `${bestCategory.categoryName} had ${bestCategory.transactionCount} purchases this period at an average of ${formatCurrency(bestCategory.averageTransactionAmount)} each.`,
    title: `Frequent ${bestCategory.categoryName} spends are adding up`,
    type: 'savings_opportunity',
  });
}

function buildDuplicateSubscriptionInsight(input: {
  comparison: GeneratedAnalyticsOutputs['comparison'];
  createId: () => string;
  currentFacts: AnalyticsFact[];
  generatedAt: string;
  period: AnalyticsGenerationPeriod;
  trustedFacts: AnalyticsFact[];
}) {
  const subscriptionFacts = input.trustedFacts.filter((fact) => fact.categoryName === 'Subscriptions');
  const groups = summarizeBy(subscriptionFacts, (fact) => fact.merchantName);
  let candidate: {
    averageAmount: number;
    currentCount: number;
    merchantName: string;
    supportingTransactionIds: string[];
  } | null = null;

  for (const [merchantName, summary] of groups) {
    const currentTransactions = input.currentFacts.filter((fact) => fact.categoryName === 'Subscriptions' && fact.merchantName === merchantName);
    const monthsActive = new Set(summary.facts.map((fact) => fact.transactionMonth)).size;
    const distinctSources = new Set(currentTransactions.map((fact) => fact.paymentSourceLabel)).size;

    if (monthsActive < 2 || currentTransactions.length < 2 || distinctSources < 2) {
      continue;
    }

    if (!candidate || currentTransactions.length > candidate.currentCount) {
      candidate = {
        averageAmount: summary.totalSpend / summary.transactionCount,
        currentCount: currentTransactions.length,
        merchantName,
        supportingTransactionIds: summary.transactionIds,
      };
    }
  }

  if (!candidate) {
    return null;
  }

  return createInsight({
    createId: input.createId,
    evidencePayload: [
      evidence('Current-period charges', 'currentChargeCount', candidate.currentCount),
      evidence('Typical monthly amount', 'averageAmount', roundCurrency(candidate.averageAmount)),
    ],
    estimatedMonthlyImpact: roundCurrency(candidate.averageAmount * Math.max(candidate.currentCount - 1, 1)),
    generatedAt: input.generatedAt,
    generatedFrom: {
      metrics: {
        averageAmount: roundCurrency(candidate.averageAmount),
        currentChargeCount: candidate.currentCount,
      },
      periodEnd: input.period.endOn,
      periodStart: input.period.startOn,
      signalKey: 'duplicate_subscription',
      signalVersion: SIGNAL_VERSION,
      source: 'deterministic',
      supportingTransactionIds: candidate.supportingTransactionIds,
    },
    recommendation: `Check whether ${candidate.merchantName} is being billed twice across payment sources and keep only the plan the household still uses.`,
    score: candidate.averageAmount * candidate.currentCount,
    summary: `${candidate.merchantName} posted ${candidate.currentCount} charges in the current period across multiple payment sources.`,
    title: `${candidate.merchantName} looks like a duplicate subscription`,
    type: 'duplicate_subscription',
  });
}

function buildCategoryPatternInsight(input: {
  comparison: GeneratedAnalyticsOutputs['comparison'];
  createId: () => string;
  currentFacts: AnalyticsFact[];
  generatedAt: string;
  period: AnalyticsGenerationPeriod;
}) {
  const currentCategories = summarizeBy(input.currentFacts, (fact) => fact.categoryName);
  let candidate: {
    categoryName: string;
    totalSpend: number;
    transactionIds: string[];
    weekendShare: number;
    weekendSpend: number;
  } | null = null;

  for (const [categoryName, summary] of currentCategories) {
    const sortedFacts = [...summary.facts].sort((left, right) => right.amount - left.amount);
    const dominantTransaction = sortedFacts[0];
    const adjustedFacts = dominantTransaction && dominantTransaction.amount > summary.totalSpend * 0.5
      ? sortedFacts.slice(1)
      : sortedFacts;
    const adjustedTotalSpend = adjustedFacts.reduce((total, fact) => total + fact.amount, 0);
    const weekendFacts = adjustedFacts.filter((fact) => isWeekend(fact.transactionDate));
    const weekendSpend = weekendFacts.reduce((total, fact) => total + fact.amount, 0);
    const weekendShare = adjustedTotalSpend === 0 ? 0 : roundPercentage((weekendSpend / adjustedTotalSpend) * 100);

    if (summary.transactionCount < 4 || adjustedTotalSpend < 1_500 || weekendShare < 65) {
      continue;
    }

    if (!candidate || weekendShare > candidate.weekendShare) {
      candidate = {
        categoryName,
        totalSpend: adjustedTotalSpend,
        transactionIds: adjustedFacts.map((fact) => fact.id),
        weekendShare,
        weekendSpend,
      };
    }
  }

  if (!candidate) {
    return null;
  }

  return createInsight({
    createId: input.createId,
    evidencePayload: [
      evidence('Weekend spend share', 'weekendShare', candidate.weekendShare),
      evidence('Weekend spend', 'weekendSpend', roundCurrency(candidate.weekendSpend)),
      evidence('Current spend', 'currentSpend', roundCurrency(candidate.totalSpend)),
    ],
    estimatedMonthlyImpact: roundCurrency(candidate.weekendSpend * 0.1),
    generatedAt: input.generatedAt,
    generatedFrom: {
      metrics: {
        currentSpend: roundCurrency(candidate.totalSpend),
        weekendShare: candidate.weekendShare,
        weekendSpend: roundCurrency(candidate.weekendSpend),
      },
      periodEnd: input.period.endOn,
      periodStart: input.period.startOn,
      signalKey: 'weekend_category_pattern',
      signalVersion: SIGNAL_VERSION,
      source: 'deterministic',
      supportingTransactionIds: candidate.transactionIds,
    },
    recommendation: `Plan ${candidate.categoryName} purchases before the weekend so fewer impulse transactions land in the highest-spend days.`,
    score: candidate.weekendSpend,
    summary: `${candidate.weekendShare}% of ${candidate.categoryName} spend landed on weekends in the current period.`,
    title: `${candidate.categoryName} spend is clustering on weekends`,
    type: 'category_pattern',
  });
}

function buildReport(input: {
  comparison: GeneratedAnalyticsOutputs['comparison'];
  createId: () => string;
  generatedAt: string;
  insights: ScoredInsight[];
  period: AnalyticsGenerationPeriod;
  reportType: AnalyticsReportType;
}) {
  const summaryInsightIds = input.insights.slice(0, 2).map((insight) => insight.id);
  const whatChangedInsights = input.insights.filter((insight) => insight.type === 'unusual_spike' || insight.type === 'overspending');
  const savingsInsights = input.insights.filter((insight) =>
    insight.type === 'savings_opportunity' || insight.type === 'duplicate_subscription' || insight.type === 'category_pattern'
  );
  const watchListInsights = input.insights.filter((insight) =>
    insight.type === 'unusual_spike' || insight.type === 'duplicate_subscription'
  );

  return {
    comparison: input.comparison,
    generatedAt: input.generatedAt,
    id: input.createId(),
    payload: {
      sections: [
        buildReportSection(
          'what-changed',
          'What changed',
          whatChangedInsights.length > 0
            ? whatChangedInsights.map((insight) => insight.summary).join(' ')
            : 'Household spend stayed within normal ranges relative to the comparison window.',
          whatChangedInsights,
        ),
        buildReportSection(
          'savings-opportunities',
          'Savings opportunities',
          savingsInsights.length > 0
            ? savingsInsights.map((insight) => insight.recommendation).join(' ')
            : 'No high-confidence savings opportunities crossed the deterministic threshold this period.',
          savingsInsights,
        ),
        buildReportSection(
          'watch-list',
          'Watch list',
          watchListInsights.length > 0
            ? watchListInsights.map((insight) => insight.summary).join(' ')
            : 'No unusual merchants or duplicate subscription patterns need extra review right now.',
          watchListInsights.length > 0 ? watchListInsights : input.insights.slice(0, 1),
        ),
        buildReportSection(
          'next-actions',
          'Next actions',
          input.insights.slice(0, 3).map((insight) => insight.recommendation).join(' '),
          input.insights.slice(0, Math.min(input.insights.length, 3)),
        ),
      ],
      summaryInsightIds,
    },
    periodEnd: input.period.endOn,
    periodStart: input.period.startOn,
    reportType: input.reportType,
    summary: buildReportSummary(input.comparison, input.insights),
    title: `${formatMonthLabel(input.period.startOn)} household savings report`,
  };
}

function buildReportSummary(
  comparison: GeneratedAnalyticsOutputs['comparison'],
  insights: ScoredInsight[],
) {
  const topInsight = insights[0];
  const lead = comparison.deltaSpend > 0
    ? `Spend increased by ${formatCurrency(comparison.deltaSpend)} versus the comparison period.`
    : 'Spend stayed flat or improved versus the comparison period.';

  if (!topInsight) {
    return lead;
  }

  return `${lead} ${topInsight.title} is the clearest actionable driver this cycle.`;
}

function buildReportSection(
  id: string,
  title: string,
  body: string,
  insights: Array<Pick<GeneratedAnalyticsInsight, 'id'>>,
) {
  return {
    body,
    id,
    insightIds: insights.map((insight) => insight.id),
    title,
  };
}

function buildComparison(currentFacts: AnalyticsFact[], previousFacts: AnalyticsFact[]) {
  const currentSpend = roundCurrency(currentFacts.reduce((total, fact) => total + fact.amount, 0));
  const previousSpend = roundCurrency(previousFacts.reduce((total, fact) => total + fact.amount, 0));
  const deltaSpend = roundCurrency(currentSpend - previousSpend);

  return {
    currentSpend,
    deltaPercentage: previousSpend === 0 ? null : roundPercentage((deltaSpend / previousSpend) * 100),
    deltaSpend,
    previousSpend,
  };
}

function summarizeBy(facts: AnalyticsFact[], keySelector: (fact: AnalyticsFact) => string) {
  const result = new Map<string, {
    facts: AnalyticsFact[];
    totalSpend: number;
    transactionCount: number;
    transactionIds: string[];
  }>();

  for (const fact of facts) {
    const key = keySelector(fact);
    const summary = result.get(key) ?? {
      facts: [],
      totalSpend: 0,
      transactionCount: 0,
      transactionIds: [],
    };

    summary.facts.push(fact);
    summary.totalSpend += fact.amount;
    summary.transactionCount += 1;
    summary.transactionIds.push(fact.id);
    result.set(key, summary);
  }

  return result;
}

function filterFactsForWindow(facts: AnalyticsFact[], startOn: string, endOn: string) {
  return facts.filter((fact) => fact.transactionDate >= startOn && fact.transactionDate <= endOn);
}

function createInsight(input: Omit<ScoredInsight, 'id'> & { createId: () => string }) {
  return {
    ...input,
    id: input.createId(),
  };
}

function stripInsightScore(insight: ScoredInsight): GeneratedAnalyticsInsight {
  const { score: _score, ...rest } = insight;
  return rest;
}

function evidence(label: string, metricKey: string, value: number | string): GeneratedInsightEvidence {
  return {
    context: null,
    label,
    metricKey,
    transactionId: null,
    value: typeof value === 'number' ? roundCurrency(value) : value,
  };
}

function roundCurrency(value: number) {
  return Number(value.toFixed(0));
}

function roundPercentage(value: number) {
  return Number(value.toFixed(1));
}

function formatCurrency(value: number) {
  return `INR ${roundCurrency(value).toLocaleString('en-IN')}`;
}

function formatMonthLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return parsed.toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  });
}

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}
