import { createMockCoreProductState } from '../../apps/mobile/src/features/core-product/core-product-state.ts';

const phase3AnalyticsSnapshot = {
  categoryAllocation: [
    {
      categoryId: 'category-food',
      categoryName: 'Food & Dining',
      reviewCount: 1,
      shareBps: 5240,
      totalSpend: 13250,
      transactionCount: 9,
    },
    {
      categoryId: 'category-subscriptions',
      categoryName: 'Subscriptions',
      reviewCount: 0,
      shareBps: 1830,
      totalSpend: 4630,
      transactionCount: 4,
    },
  ],
  comparison: {
    currentSpend: 25300,
    currentTransactionCount: 18,
    deltaPercentage: 11.6,
    deltaSpend: 2630,
    previousSpend: 22670,
    previousTransactionCount: 15,
  },
  householdId: '11111111-1111-4111-8111-111111111111',
  insights: [
    {
      evidencePayload: [
        {
          context: null,
          label: 'Current month spend',
          metricKey: 'currentSpend',
          transactionId: 'txn-003',
          value: 13250,
        },
      ],
      estimatedMonthlyImpact: 1500,
      generatedAt: '2026-03-28T05:40:00.000Z',
      generatedFrom: {
        metrics: {
          currentSpend: 13250,
          previousSpend: 11250,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'category_overspending',
        signalVersion: 'phase3b_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-003', 'txn-005'],
      },
      id: 'insight-1',
      recommendation: 'Reduce food delivery frequency by one order each week.',
      summary: 'Food delivery is up 18% versus the prior period.',
      title: 'Food delivery spend is climbing',
      type: 'overspending',
    },
  ],
  latestReport: {
    generatedAt: '2026-03-28T05:45:00.000Z',
    id: 'report-1',
    periodEnd: '2026-03-31',
    periodStart: '2026-03-01',
    title: 'March savings report',
  },
  period: {
    bucket: 'month',
    comparisonEndOn: '2026-02-28',
    comparisonStartOn: '2026-02-01',
    endOn: '2026-03-31',
    startOn: '2026-03-01',
  },
  recurringChargeCandidates: [
    {
      averageAmount: 1299,
      averageCadenceDays: 30,
      categoryName: 'Subscriptions',
      lastChargedOn: '2026-03-18',
      merchantName: 'Spotify',
      monthsActive: 3,
      paymentSourceLabel: 'Amex MRCC',
      transactionCount: 3,
    },
  ],
  spendByPaymentSource: [
    {
      paymentSourceLabel: 'Amex MRCC',
      shareBps: 4100,
      sourceType: 'credit_card_statement',
      totalSpend: 10373,
      transactionCount: 7,
    },
    {
      paymentSourceLabel: 'WhatsApp UPI',
      shareBps: 2190,
      sourceType: 'upi_whatsapp',
      totalSpend: 5540,
      transactionCount: 8,
    },
  ],
  spendByPerson: [
    {
      ownerDisplayName: 'Ishan',
      ownerMemberId: 'member-1',
      ownerScope: 'member',
      shareBps: 6100,
      totalSpend: 15433,
      transactionCount: 11,
    },
    {
      ownerDisplayName: null,
      ownerMemberId: null,
      ownerScope: 'shared',
      shareBps: 3900,
      totalSpend: 9867,
      transactionCount: 7,
    },
  ],
  trendSeries: [
    {
      bucketEndOn: '2026-01-31',
      bucketLabel: 'Jan 2026',
      bucketStartOn: '2026-01-01',
      reviewCount: 1,
      totalSpend: 21400,
      transactionCount: 17,
    },
    {
      bucketEndOn: '2026-02-28',
      bucketLabel: 'Feb 2026',
      bucketStartOn: '2026-02-01',
      reviewCount: 1,
      totalSpend: 22670,
      transactionCount: 15,
    },
    {
      bucketEndOn: '2026-03-31',
      bucketLabel: 'Mar 2026',
      bucketStartOn: '2026-03-01',
      reviewCount: 2,
      totalSpend: 25300,
      transactionCount: 18,
    },
  ],
};

const phase3AnalyticsReport = {
  comparison: {
    deltaPercentage: 11.6,
    deltaSpend: 2630,
    previousSpend: 22670,
  },
  generatedAt: '2026-03-28T05:45:00.000Z',
  id: 'report-1',
  insights: [
    {
      evidencePayload: [
        {
          context: null,
          label: 'Food delivery delta',
          metricKey: 'currentSpend',
          transactionId: 'txn-003',
          value: 13250,
        },
      ],
      estimatedMonthlyImpact: 1500,
      generatedAt: '2026-03-28T05:40:00.000Z',
      generatedFrom: {
        metrics: {
          currentSpend: 13250,
          previousSpend: 11250,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'category_overspending',
        signalVersion: 'phase3e_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-003', 'txn-005'],
      },
      id: 'insight-overspend',
      recommendation: 'Reduce food delivery frequency by one order each week.',
      summary: 'Food delivery is up 18% versus the prior period.',
      title: 'Food delivery spend is climbing',
      type: 'overspending',
    },
    {
      evidencePayload: [
        {
          context: null,
          label: 'Duplicate Spotify charges',
          metricKey: 'duplicateCount',
          transactionId: 'txn-011',
          value: 2,
        },
      ],
      estimatedMonthlyImpact: 129,
      generatedAt: '2026-03-28T05:41:00.000Z',
      generatedFrom: {
        metrics: {
          duplicateCount: 2,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'duplicate_subscription',
        signalVersion: 'phase3e_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-011', 'txn-012'],
      },
      id: 'insight-duplicate-subscription',
      recommendation: 'Keep one Spotify plan and cancel the extra renewal before next month.',
      summary: '2 charges landed for the same subscription family this cycle.',
      title: 'Spotify looks like a duplicate subscription',
      type: 'duplicate_subscription',
    },
    {
      evidencePayload: [
        {
          context: null,
          label: 'Weekend dining share',
          metricKey: 'weekendShare',
          transactionId: 'txn-021',
          value: 90,
        },
      ],
      estimatedMonthlyImpact: 700,
      generatedAt: '2026-03-28T05:42:00.000Z',
      generatedFrom: {
        metrics: {
          weekendShare: 90,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'weekend_category_pattern',
        signalVersion: 'phase3e_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-021', 'txn-022', 'txn-023'],
      },
      id: 'insight-weekend-pattern',
      recommendation: 'Plan weekend meals in advance so fewer impulse orders hit the highest-spend days.',
      summary: '90% of dining spend landed on weekends this month.',
      title: 'Dining spend is clustering on weekends',
      type: 'category_pattern',
    },
    {
      evidencePayload: [
        {
          context: null,
          label: 'Merchant spike',
          metricKey: 'currentSpend',
          transactionId: 'txn-031',
          value: 14300,
        },
      ],
      estimatedMonthlyImpact: 14300,
      generatedAt: '2026-03-28T05:43:00.000Z',
      generatedFrom: {
        metrics: {
          currentSpend: 14300,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'merchant_spike',
        signalVersion: 'phase3e_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-031'],
      },
      id: 'insight-spike',
      recommendation: 'Review the Croma purchase and confirm it belongs in this month’s household baseline.',
      summary: 'Croma produced a one-off merchant spike that sits well above the prior baseline.',
      title: 'Croma is well above the normal monthly baseline',
      type: 'unusual_spike',
    },
    {
      evidencePayload: [
        {
          context: null,
          label: 'Groceries delta',
          metricKey: 'currentSpend',
          transactionId: 'txn-041',
          value: 9820,
        },
      ],
      estimatedMonthlyImpact: 1200,
      generatedAt: '2026-03-28T05:44:00.000Z',
      generatedFrom: {
        metrics: {
          currentSpend: 9820,
          previousSpend: 8120,
        },
        periodEnd: '2026-03-31',
        periodStart: '2026-03-01',
        signalKey: 'grocery_savings',
        signalVersion: 'phase3e_v1',
        source: 'deterministic',
        supportingTransactionIds: ['txn-041', 'txn-042'],
      },
      id: 'insight-savings',
      recommendation: 'Shift one weekly grocery basket to the lower-priced store.',
      summary: 'Groceries rose faster than overall household spend.',
      title: 'Groceries are outpacing the rest of the ledger',
      type: 'savings_opportunity',
    },
  ],
  payload: {
    sections: [
      {
        body: 'Dining and electronics were the clearest spend drivers this month.',
        id: 'major-spend-shifts',
        insightIds: ['insight-overspend', 'insight-spike'],
        title: 'Major spend shifts',
      },
      {
        body: 'Groceries still offer the clearest savings lever in the current cycle.',
        id: 'savings-opportunities',
        insightIds: ['insight-savings'],
        title: 'Savings opportunities',
      },
      {
        body: 'One recurring charge cluster needs a keep-or-cancel review.',
        id: 'recurring-charge-findings',
        insightIds: ['insight-duplicate-subscription'],
        title: 'Recurring-charge findings',
      },
      {
        body: 'Weekend dining remains unusually concentrated.',
        id: 'unusual-patterns',
        insightIds: ['insight-weekend-pattern'],
        title: 'Unusual patterns',
      },
      {
        body: 'Review the spike, cancel the duplicate, and reset one grocery habit this week.',
        id: 'recommended-next-actions',
        insightIds: ['insight-spike', 'insight-duplicate-subscription', 'insight-savings'],
        title: 'Recommended next actions',
      },
    ],
    summaryInsightIds: ['insight-overspend', 'insight-savings'],
  },
  periodEnd: '2026-03-31',
  periodStart: '2026-03-01',
  reportType: 'monthly',
  summary: 'March spend increased by ₹2,630 versus February, with food delivery and one large electronics purchase driving the change.',
  title: 'March household savings report',
};

const phase3DashboardSnapshot = {
  alerts: [
    {
      id: 'review-queue',
      message: 'Resolve low-confidence rows before household totals are trusted.',
      title: '2 transactions need review',
      tone: 'warning',
    },
  ],
  analytics: phase3AnalyticsSnapshot,
  recentTransactions: [
    {
      amount: 1299,
      categoryName: 'Subscriptions',
      id: 'txn-006',
      merchant: 'Spotify',
      needsReview: false,
      ownerDisplayName: null,
      postedAt: '2026-03-27T08:00:00.000Z',
      sourceBadge: 'Card',
      sourceLabel: 'Amex MRCC',
    },
  ],
  sources: {
    statements: {
      detail: '1 statement is waiting for parser recovery.',
      label: 'Statements',
      status: 'degraded',
    },
    whatsapp: {
      detail: '1 WhatsApp capture needs review.',
      label: 'WhatsApp UPI',
      status: 'degraded',
    },
  },
  sync: {
    freshnessLabel: 'Updated 1h 50m ago',
    pendingStatementCount: 1,
    status: 'degraded',
  },
  totals: {
    monthToDateSpend: 25127,
    reviewQueueAmount: 4079,
    reviewQueueCount: 2,
    reviewedAmount: 21048,
    transactionCount: 6,
  },
};

export function createPhase3AnalyticsSnapshot() {
  return structuredClone(phase3AnalyticsSnapshot);
}

export function createPhase3AnalyticsReport() {
  return structuredClone(phase3AnalyticsReport);
}

export function createPhase3DashboardSnapshot() {
  return {
    ...structuredClone(phase3DashboardSnapshot),
    analytics: createPhase3AnalyticsSnapshot(),
  };
}

export function createPhase3ReleaseLedgerState() {
  const baseState = createMockCoreProductState();

  return {
    ...baseState,
    asOf: '2026-03-31T10:00:00.000Z',
    transactions: [
      ...baseState.transactions.map((transaction) => {
        if (transaction.id === 'txn-003' || transaction.id === 'txn-005') {
          return {
            ...transaction,
            ownerDisplayName: 'Ishan',
            ownerMemberId: 'member-1',
            ownerScope: 'member',
          };
        }

        return transaction;
      }),
      {
        amount: 129,
        categoryId: 'subscriptions',
        confidence: 0.97,
        id: 'txn-011',
        merchant: 'Spotify',
        needsReview: false,
        ownerDisplayName: 'Ishan',
        ownerMemberId: 'member-1',
        ownerScope: 'member',
        postedAt: '2026-03-12T08:00:00.000Z',
        reviewReason: null,
        reviewReasons: [],
        sourceContextLabel: 'Amex Mar 2026',
        sourceLabel: 'Amex MRCC',
        sourceType: 'credit_card_statement',
      },
      {
        amount: 129,
        categoryId: 'subscriptions',
        confidence: 0.97,
        id: 'txn-012',
        merchant: 'Spotify Duo',
        needsReview: false,
        ownerDisplayName: 'Ishan',
        ownerMemberId: 'member-1',
        ownerScope: 'member',
        postedAt: '2026-03-14T08:00:00.000Z',
        reviewReason: null,
        reviewReasons: [],
        sourceContextLabel: 'Amex Mar 2026',
        sourceLabel: 'Amex MRCC',
        sourceType: 'credit_card_statement',
      },
      {
        amount: 14300,
        categoryId: 'shopping',
        confidence: 0.99,
        id: 'txn-031',
        merchant: 'Croma',
        needsReview: false,
        ownerDisplayName: null,
        ownerMemberId: null,
        ownerScope: 'unknown',
        postedAt: '2026-03-30T08:00:00.000Z',
        reviewReason: null,
        reviewReasons: [],
        sourceContextLabel: 'ICICI Mar 2026',
        sourceLabel: 'ICICI Amazon Pay',
        sourceType: 'credit_card_statement',
      },
      {
        amount: 4800,
        categoryId: 'groceries',
        confidence: 0.92,
        id: 'txn-041',
        merchant: 'Nature Basket',
        needsReview: false,
        ownerDisplayName: null,
        ownerMemberId: null,
        ownerScope: 'shared',
        postedAt: '2026-03-15T08:00:00.000Z',
        reviewReason: null,
        reviewReasons: [],
        sourceContextLabel: 'ICICI Mar 2026',
        sourceLabel: 'ICICI Amazon Pay',
        sourceType: 'credit_card_statement',
      },
      {
        amount: 5020,
        categoryId: 'groceries',
        confidence: 0.91,
        id: 'txn-042',
        merchant: 'BigBasket',
        needsReview: false,
        ownerDisplayName: null,
        ownerMemberId: null,
        ownerScope: 'shared',
        postedAt: '2026-03-18T08:00:00.000Z',
        reviewReason: null,
        reviewReasons: [],
        sourceContextLabel: 'ICICI Mar 2026',
        sourceLabel: 'ICICI Amazon Pay',
        sourceType: 'credit_card_statement',
      },
    ],
  };
}
