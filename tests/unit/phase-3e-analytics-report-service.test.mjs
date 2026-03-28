import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAnalyticsReport } from '../../apps/mobile/src/features/analytics/analytics-service.ts';

test('Phase 3E analytics service preserves richer deep-analysis section buckets', async () => {
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
                body: 'Dining and electronics were the two biggest month-over-month shifts.',
                id: 'major-spend-shifts',
                insightIds: ['insight-1'],
                title: 'Major spend shifts',
              },
              {
                body: 'The strongest savings lever remains grocery basket mix.',
                id: 'savings-opportunities',
                insightIds: ['insight-2'],
                title: 'Savings opportunities',
              },
              {
                body: 'One subscription cluster still needs a keep-or-cancel review.',
                id: 'recurring-charge-findings',
                insightIds: ['insight-3'],
                title: 'Recurring-charge findings',
              },
              {
                body: 'Weekend concentration remains higher than the baseline pattern.',
                id: 'unusual-patterns',
                insightIds: ['insight-4'],
                title: 'Unusual patterns',
              },
              {
                body: 'Reduce grocery basket size and review one recurring charge this week.',
                id: 'recommended-next-actions',
                insightIds: ['insight-5'],
                title: 'Recommended next actions',
              },
            ],
            summaryInsightIds: ['insight-1', 'insight-2'],
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

  assert.deepEqual(report?.payload.sections.map((section) => section.id), [
    'major-spend-shifts',
    'savings-opportunities',
    'recurring-charge-findings',
    'unusual-patterns',
    'recommended-next-actions',
  ]);
  assert.deepEqual(report?.payload.summaryInsightIds, ['insight-1', 'insight-2']);
  assert.equal(report?.reportType, 'monthly');
});

test('Phase 3E analytics service rejects malformed report sections', async () => {
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

  await assert.rejects(
    () => loadAnalyticsReport(client, {
      householdId: '11111111-1111-4111-8111-111111111111',
      reportId: 'report-1',
    }),
    /Expected body to be a non-empty string\./,
  );
});
