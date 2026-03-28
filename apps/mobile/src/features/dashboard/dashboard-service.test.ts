import { describe, expect, it, vi } from 'vitest';

import {
  loadDashboardSnapshot,
  type DashboardClient,
} from './dashboard-service';

function createSelectBuilder<T>(data: T, error: { message: string } | null = null) {
  const builder = {
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (onFulfilled: (value: { data: T; error: { message: string } | null }) => unknown) =>
      Promise.resolve(onFulfilled({ data, error })),
  };

  return builder;
}

function createAnalyticsSnapshot(totalSpend: number) {
  return {
    categoryAllocation: [],
    comparison: {
      currentSpend: totalSpend,
      currentTransactionCount: totalSpend === 0 ? 0 : 1,
      deltaPercentage: null,
      deltaSpend: totalSpend,
      previousSpend: 0,
      previousTransactionCount: 0,
    },
    householdId: '11111111-1111-4111-8111-111111111111',
    insights: [],
    latestReport: null,
    period: {
      bucket: 'month',
      comparisonEndOn: '2026-02-28',
      comparisonStartOn: '2026-02-01',
      endOn: '2026-03-31',
      startOn: '2026-03-01',
    },
    recurringChargeCandidates: [],
    spendByPaymentSource: [],
    spendByPerson: [],
    trendSeries: [
      {
        bucketEndOn: '2026-03-31',
        bucketLabel: 'Mar 2026',
        bucketStartOn: '2026-03-01',
        reviewCount: 0,
        totalSpend,
        transactionCount: totalSpend === 0 ? 0 : 1,
      },
    ],
  };
}

describe('loadDashboardSnapshot', () => {
  it('loads the household dashboard summary and recent transactions from Supabase', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'get_household_dashboard_summary') {
        return {
          data: {
            householdId: '11111111-1111-4111-8111-111111111111',
            syncStatus: {
              failedStatementCount: 0,
              lastStatementSyncAt: '2026-03-27T07:50:00.000Z',
              lastStatementUploadAt: '2026-03-27T07:40:00.000Z',
              lastSuccessfulSyncAt: '2026-03-27T06:10:00.000Z',
              latestParseStatus: 'partial',
              needsReviewStatementCount: 1,
              pendingStatementCount: 1,
            },
            totals: {
              clearedSpend: '21048.00',
              monthStart: '2026-03-01',
              reviewCount: 2,
              totalSpend: '25127.00',
              transactionCount: 6,
            },
          },
          error: null,
        };
      }

      return {
        data: {
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
            currentSpend: 25127,
            currentTransactionCount: 6,
            deltaPercentage: 11.6,
            deltaSpend: 2630,
            previousSpend: 22497,
            previousTransactionCount: 5,
          },
          householdId: '11111111-1111-4111-8111-111111111111',
          insights: [
            {
              evidencePayload: [
                {
                  context: null,
                  label: 'Current month spend',
                  metricKey: 'currentSpend',
                  transactionId: 'transaction-upi-1',
                  value: 13250,
                },
              ],
              estimatedMonthlyImpact: 1500,
              generatedAt: '2026-03-27T07:56:00.000Z',
              generatedFrom: {
                metrics: {
                  currentSpend: 13250,
                  previousSpend: 11250,
                },
                periodEnd: '2026-03-31',
                periodStart: '2026-03-01',
                signalKey: 'category_overspending',
                signalVersion: 'phase3c_v1',
                source: 'deterministic',
                supportingTransactionIds: ['transaction-6', 'transaction-upi-1'],
              },
              id: 'insight-1',
              recommendation: 'Reduce food delivery frequency by one order each week.',
              summary: 'Food delivery is up 18% versus the prior period.',
              title: 'Food delivery spend is climbing',
              type: 'overspending',
            },
          ],
          latestReport: {
            generatedAt: '2026-03-27T07:58:00.000Z',
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
              totalSpend: 22497,
              transactionCount: 15,
            },
            {
              bucketEndOn: '2026-03-31',
              bucketLabel: 'Mar 2026',
              bucketStartOn: '2026-03-01',
              reviewCount: 2,
              totalSpend: 25127,
              transactionCount: 18,
            },
          ],
        },
        error: null,
      };
    });
    const recentTransactionsBuilder = createSelectBuilder([
      {
        amount: '1299.00',
        categories: {
          name: 'Subscriptions',
        },
        id: 'transaction-6',
        metadata: {
          cardName: 'Amex MRCC',
        },
        merchant_raw: 'Spotify',
        needs_review: false,
        owner_member: null,
        posted_at: '2026-03-27',
        statement_uploads: null,
        source_type: 'credit_card_statement',
        transaction_date: '2026-03-27',
      },
      {
        amount: '245.00',
        categories: null,
        id: 'transaction-upi-1',
        metadata: null,
        merchant_raw: 'Zepto',
        needs_review: true,
        owner_member: {
          display_name: 'Ishan',
        },
        posted_at: null,
        statement_uploads: null,
        source_type: 'upi_whatsapp',
        transaction_date: '2026-03-26',
      },
    ]);
    const participantsBuilder = createSelectBuilder([
      { id: 'participant-1' },
      { id: 'participant-2' },
    ]);
    const messagesBuilder = createSelectBuilder([
      {
        parse_status: 'needs_review',
        received_at: '2026-03-27T07:55:00.000Z',
      },
      {
        parse_status: 'posted',
        received_at: '2026-03-27T07:10:00.000Z',
      },
    ]);
    const client: DashboardClient = {
      from: vi.fn((table) => ({
        select: vi.fn(() => {
          if (table === 'transactions') {
            return recentTransactionsBuilder;
          }

          if (table === 'whatsapp_participants') {
            return participantsBuilder;
          }

          return messagesBuilder;
        }),
      })),
      rpc,
    };

    await expect(
      loadDashboardSnapshot(client, '11111111-1111-4111-8111-111111111111', {
        asOf: '2026-03-27T08:00:00.000Z',
      })
    ).resolves.toEqual({
      alerts: [
        {
          id: 'review-queue',
          message: 'Resolve low-confidence rows before household totals are trusted.',
          title: '2 transactions need review',
          tone: 'warning',
        },
        {
          id: 'sync-health',
          message: '1 statement is waiting for parser recovery.',
          title: 'Statement sync needs attention',
          tone: 'warning',
        },
      ],
      recentTransactions: [
        {
          amount: 1299,
          categoryName: 'Subscriptions',
          id: 'transaction-6',
          merchant: 'Spotify',
          needsReview: false,
          postedAt: '2026-03-27T08:00:00.000Z',
          sourceBadge: 'Card',
          sourceLabel: 'Amex MRCC',
        },
        {
          amount: 245,
          categoryName: 'Uncategorized',
          id: 'transaction-upi-1',
          merchant: 'Zepto',
          needsReview: true,
          ownerDisplayName: 'Ishan',
          postedAt: '2026-03-26T08:00:00.000Z',
          sourceBadge: 'UPI',
          sourceLabel: 'WhatsApp UPI',
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
      analytics: expect.objectContaining({
        comparison: expect.objectContaining({
          currentSpend: 25127,
          deltaPercentage: 11.6,
        }),
        insights: [
          expect.objectContaining({
            estimatedMonthlyImpact: 1500,
            id: 'insight-1',
            recommendation: 'Reduce food delivery frequency by one order each week.',
            title: 'Food delivery spend is climbing',
          }),
        ],
        latestReport: expect.objectContaining({
          id: 'report-1',
          title: 'March savings report',
        }),
      }),
      totals: {
        monthToDateSpend: 25127,
        reviewQueueAmount: 4079,
        reviewQueueCount: 2,
        reviewedAmount: 21048,
        transactionCount: 6,
      },
    });

    expect(rpc).toHaveBeenCalledWith('get_household_dashboard_summary', {
      target_household_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(rpc).toHaveBeenCalledWith('get_household_analytics_snapshot', {
      target_bucket: 'month',
      target_comparison_end_on: '2026-02-28',
      target_comparison_start_on: '2026-02-01',
      target_end_on: '2026-03-31',
      target_household_id: '11111111-1111-4111-8111-111111111111',
      target_start_on: '2026-03-01',
    });
    expect(recentTransactionsBuilder.eq).toHaveBeenCalledWith('household_id', '11111111-1111-4111-8111-111111111111');
    expect(recentTransactionsBuilder.order).toHaveBeenCalledWith('transaction_date', { ascending: false });
    expect(recentTransactionsBuilder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(recentTransactionsBuilder.limit).toHaveBeenCalledWith(4);
    expect(participantsBuilder.is).toHaveBeenCalledWith('revoked_at', null);
    expect(messagesBuilder.limit).toHaveBeenCalledWith(20);
  });

  it('returns an explicit empty dashboard snapshot when the household has no transactions yet', async () => {
    const participantsBuilder = createSelectBuilder([]);
    const messagesBuilder = createSelectBuilder([]);
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'get_household_dashboard_summary') {
        return {
          data: {
            householdId: '11111111-1111-4111-8111-111111111111',
            syncStatus: {
              failedStatementCount: 0,
              lastStatementSyncAt: null,
              lastStatementUploadAt: null,
              lastSuccessfulSyncAt: null,
              latestParseStatus: null,
              needsReviewStatementCount: 0,
              pendingStatementCount: 0,
            },
            totals: {
              clearedSpend: 0,
              monthStart: '2026-03-01',
              reviewCount: 0,
              totalSpend: 0,
              transactionCount: 0,
            },
          },
          error: null,
        };
      }

      return {
        data: createAnalyticsSnapshot(0),
        error: null,
      };
    });
    const client: DashboardClient = {
      from: vi.fn((table) => ({
        select: vi.fn(() => {
          if (table === 'transactions') {
            return createSelectBuilder([]);
          }

          if (table === 'whatsapp_participants') {
            return participantsBuilder;
          }

          return messagesBuilder;
        }),
      })),
      rpc,
    };

    await expect(
      loadDashboardSnapshot(client, '11111111-1111-4111-8111-111111111111', {
        asOf: '2026-03-27T08:00:00.000Z',
      })
    ).resolves.toEqual({
      alerts: [],
      recentTransactions: [],
      sources: {
        statements: {
          detail: 'No statements have landed for this household yet.',
          label: 'Statements',
          status: 'healthy',
        },
        whatsapp: {
          detail: 'Approve at least one participant before the Meta test number is ready.',
          label: 'WhatsApp UPI',
          status: 'needs_setup',
        },
      },
      sync: {
        freshnessLabel: 'No statements synced yet',
        pendingStatementCount: 0,
        status: 'healthy',
      },
      analytics: expect.objectContaining({
        comparison: expect.objectContaining({
          currentSpend: 0,
          deltaPercentage: null,
        }),
        insights: [],
        latestReport: null,
      }),
      totals: {
        monthToDateSpend: 0,
        reviewQueueAmount: 0,
        reviewQueueCount: 0,
        reviewedAmount: 0,
        transactionCount: 0,
      },
    });
  });

  it('falls back to the first category record when Supabase returns a relation array', async () => {
    const rpc = vi.fn(async (fn: string) => {
      if (fn === 'get_household_dashboard_summary') {
        return {
          data: {
            householdId: '11111111-1111-4111-8111-111111111111',
            syncStatus: {
              failedStatementCount: 0,
              lastStatementSyncAt: '2026-03-27T07:50:00.000Z',
              lastStatementUploadAt: '2026-03-27T07:40:00.000Z',
              lastSuccessfulSyncAt: '2026-03-27T06:10:00.000Z',
              latestParseStatus: 'parsed',
              needsReviewStatementCount: 0,
              pendingStatementCount: 0,
            },
            totals: {
              clearedSpend: '5400.00',
              monthStart: '2026-03-01',
              reviewCount: 0,
              totalSpend: '5400.00',
              transactionCount: 1,
            },
          },
          error: null,
        };
      }

      return {
        data: createAnalyticsSnapshot(5400),
        error: null,
      };
    });
    const client: DashboardClient = {
      from: vi.fn(() => ({
        select: vi.fn(() =>
          createSelectBuilder([
            {
              amount: '5400.00',
              categories: [{ name: 'Groceries' }],
              id: 'transaction-5',
              metadata: {
                cardName: 'ICICI Amazon Pay',
              },
              merchant_raw: 'Nature Basket',
              needs_review: false,
              owner_member: null,
              posted_at: '2026-03-26',
              statement_uploads: null,
              source_type: 'credit_card_statement',
              transaction_date: '2026-03-26',
            },
          ])
        ),
      })),
      rpc,
    };

    await expect(
      loadDashboardSnapshot(client, '11111111-1111-4111-8111-111111111111', {
        asOf: '2026-03-27T08:00:00.000Z',
      })
    ).resolves.toMatchObject({
      recentTransactions: [
        {
          categoryName: 'Groceries',
          merchant: 'Nature Basket',
          sourceBadge: 'Card',
        },
      ],
    });
  });

  it('surfaces Supabase errors with a dashboard-specific message', async () => {
    const client: DashboardClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => createSelectBuilder([], { message: 'permission denied' })),
      })),
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          message: 'RLS failed',
        },
      }),
    };

    await expect(
      loadDashboardSnapshot(client, '11111111-1111-4111-8111-111111111111')
    ).rejects.toThrow('Unable to load dashboard summary: RLS failed');
  });
});
