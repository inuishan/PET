import { describe, expect, it } from 'vitest';

import { loadAnalyticsReport } from './analytics-service';

describe('loadAnalyticsReport', () => {
  it('preserves explicit deep-analysis section buckets from the report payload', async () => {
    const client = {
      rpc() {
        return Promise.resolve({
          data: {
            comparison: {
              deltaPercentage: '11.6',
              deltaSpend: '2630.00',
              previousSpend: '22670.00',
            },
            generatedAt: '2026-03-28T05:45:00.000Z',
            id: 'report-1',
            insights: [
              {
                evidencePayload: [
                  {
                    context: null,
                    label: 'Current month spend',
                    metricKey: 'currentSpend',
                    transactionId: 'txn-101',
                    value: '9820.50',
                  },
                ],
                estimatedMonthlyImpact: '1200.00',
                generatedAt: '2026-03-28T05:40:00.000Z',
                generatedFrom: {
                  metrics: {
                    currentSpend: '9820.50',
                    previousSpend: '8120.00',
                  },
                  periodEnd: '2026-03-31',
                  periodStart: '2026-03-01',
                  signalKey: 'category_overspending',
                  signalVersion: 'phase3e_v1',
                  source: 'deterministic',
                  supportingTransactionIds: ['txn-101', 'txn-102'],
                },
                id: 'insight-1',
                recommendation: 'Shift one grocery basket to the lower-priced store.',
                summary: 'Groceries rose faster than the rest of the ledger.',
                title: 'Groceries are outpacing the rest of the ledger',
                type: 'savings_opportunity',
              },
            ],
            payload: {
              sections: [
                {
                  body: 'Dining and electronics were the two biggest month-over-month shifts.',
                  id: 'major-spend-shifts',
                  insightIds: ['insight-1'],
                  title: 'Major spend shifts',
                },
                {
                  body: 'The strongest savings lever remains grocery basket mix.',
                  id: 'savings-opportunities',
                  insightIds: ['insight-1'],
                  title: 'Savings opportunities',
                },
                {
                  body: 'One subscription cluster still needs a keep-or-cancel review.',
                  id: 'recurring-charge-findings',
                  insightIds: ['insight-1'],
                  title: 'Recurring-charge findings',
                },
                {
                  body: 'Weekend concentration remains higher than the baseline pattern.',
                  id: 'unusual-patterns',
                  insightIds: ['insight-1'],
                  title: 'Unusual patterns',
                },
                {
                  body: 'Reduce grocery basket size and review one recurring charge this week.',
                  id: 'recommended-next-actions',
                  insightIds: ['insight-1'],
                  title: 'Recommended next actions',
                },
              ],
              summaryInsightIds: ['insight-1'],
            },
            periodEnd: '2026-03-31',
            periodStart: '2026-03-01',
            reportType: 'monthly',
            summary: 'March household spend rose versus February.',
            title: 'March household savings report',
          },
          error: null,
        });
      },
    };

    const report = await loadAnalyticsReport(client, {
      householdId: '11111111-1111-4111-8111-111111111111',
      reportId: 'report-1',
    });

    expect(report).toMatchObject({
      comparison: {
        deltaPercentage: 11.6,
        deltaSpend: 2630,
        previousSpend: 22670,
      },
      payload: {
        sections: [
          { id: 'major-spend-shifts', title: 'Major spend shifts' },
          { id: 'savings-opportunities', title: 'Savings opportunities' },
          { id: 'recurring-charge-findings', title: 'Recurring-charge findings' },
          { id: 'unusual-patterns', title: 'Unusual patterns' },
          { id: 'recommended-next-actions', title: 'Recommended next actions' },
        ],
        summaryInsightIds: ['insight-1'],
      },
      periodEnd: '2026-03-31',
      periodStart: '2026-03-01',
      reportType: 'monthly',
      title: 'March household savings report',
    });
    expect(report?.payload.sections.map((section) => section.id)).toEqual([
      'major-spend-shifts',
      'savings-opportunities',
      'recurring-charge-findings',
      'unusual-patterns',
      'recommended-next-actions',
    ]);
  });

  it('fails fast when a report section is malformed', async () => {
    const client = {
      rpc() {
        return Promise.resolve({
          data: {
            comparison: {
              deltaPercentage: '11.6',
              deltaSpend: '2630.00',
              previousSpend: '22670.00',
            },
            generatedAt: '2026-03-28T05:45:00.000Z',
            id: 'report-1',
            insights: [],
            payload: {
              sections: [
                {
                  body: 42,
                  id: 'major-spend-shifts',
                  insightIds: [],
                  title: 'Major spend shifts',
                },
              ],
              summaryInsightIds: [],
            },
            periodEnd: '2026-03-31',
            periodStart: '2026-03-01',
            reportType: 'monthly',
            summary: 'March household spend rose versus February.',
            title: 'March household savings report',
          },
          error: null,
        });
      },
    };

    await expect(
      loadAnalyticsReport(client, {
        householdId: '11111111-1111-4111-8111-111111111111',
        reportId: 'report-1',
      }),
    ).rejects.toThrow('Expected body to be a non-empty string.');
  });
});
