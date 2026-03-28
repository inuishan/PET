import assert from 'node:assert/strict';
import test from 'node:test';

import { generateAnalyticsOutputs } from '../../supabase/functions/_shared/analytics-insights.ts';

const householdId = '11111111-1111-4111-8111-111111111111';
const generatedAt = '2026-03-28T05:45:00.000Z';
const period = {
  bucket: 'month',
  comparisonEndOn: '2026-02-28',
  comparisonStartOn: '2026-02-01',
  endOn: '2026-03-31',
  startOn: '2026-03-01',
};

const facts = [
  createFact({
    amount: 1250,
    categoryName: 'Food & Dining',
    id: 'fd-mar-1',
    merchantName: 'Swiggy',
    paymentSourceLabel: 'HDFC Millennia',
    transactionDate: '2026-03-02',
  }),
  createFact({
    amount: 1400,
    categoryName: 'Food & Dining',
    id: 'fd-mar-2',
    merchantName: 'Zomato',
    paymentSourceLabel: 'HDFC Millennia',
    transactionDate: '2026-03-06',
  }),
  createFact({
    amount: 1620,
    categoryName: 'Food & Dining',
    id: 'fd-mar-3',
    merchantName: 'Swiggy',
    paymentSourceLabel: 'HDFC Millennia',
    transactionDate: '2026-03-11',
  }),
  createFact({
    amount: 1580,
    categoryName: 'Food & Dining',
    id: 'fd-mar-4',
    merchantName: 'Restaurant Cluster',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-03-17',
  }),
  createFact({
    amount: 1350,
    categoryName: 'Food & Dining',
    id: 'fd-mar-5',
    merchantName: 'Swiggy',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-03-25',
  }),
  createFact({
    amount: 900,
    categoryName: 'Food & Dining',
    id: 'fd-feb-1',
    merchantName: 'Swiggy',
    paymentSourceLabel: 'HDFC Millennia',
    transactionDate: '2026-02-03',
  }),
  createFact({
    amount: 1180,
    categoryName: 'Food & Dining',
    id: 'fd-feb-2',
    merchantName: 'Zomato',
    paymentSourceLabel: 'HDFC Millennia',
    transactionDate: '2026-02-08',
  }),
  createFact({
    amount: 1050,
    categoryName: 'Food & Dining',
    id: 'fd-feb-3',
    merchantName: 'Swiggy',
    paymentSourceLabel: 'HDFC Millennia',
    transactionDate: '2026-02-15',
  }),
  createFact({
    amount: 1070,
    categoryName: 'Food & Dining',
    id: 'fd-feb-4',
    merchantName: 'Restaurant Cluster',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-02-21',
  }),
  createFact({
    amount: 240,
    categoryName: 'Transport',
    id: 'tr-mar-1',
    merchantName: 'Uber',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-03-01',
  }),
  createFact({
    amount: 220,
    categoryName: 'Transport',
    id: 'tr-mar-2',
    merchantName: 'Uber',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-03-03',
  }),
  createFact({
    amount: 210,
    categoryName: 'Transport',
    id: 'tr-mar-3',
    merchantName: 'Rapido',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-03-05',
  }),
  createFact({
    amount: 260,
    categoryName: 'Transport',
    id: 'tr-mar-4',
    merchantName: 'Uber',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-03-07',
  }),
  createFact({
    amount: 230,
    categoryName: 'Transport',
    id: 'tr-mar-5',
    merchantName: 'Ola',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-03-09',
  }),
  createFact({
    amount: 250,
    categoryName: 'Transport',
    id: 'tr-mar-6',
    merchantName: 'Uber',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-03-12',
  }),
  createFact({
    amount: 260,
    categoryName: 'Transport',
    id: 'tr-mar-7',
    merchantName: 'Uber',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-03-16',
  }),
  createFact({
    amount: 235,
    categoryName: 'Transport',
    id: 'tr-mar-8',
    merchantName: 'Rapido',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-03-18',
  }),
  createFact({
    amount: 210,
    categoryName: 'Transport',
    id: 'tr-mar-9',
    merchantName: 'Uber',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-03-21',
  }),
  createFact({
    amount: 220,
    categoryName: 'Transport',
    id: 'tr-mar-10',
    merchantName: 'Uber',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-03-23',
  }),
  createFact({
    amount: 225,
    categoryName: 'Transport',
    id: 'tr-feb-1',
    merchantName: 'Uber',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-02-04',
  }),
  createFact({
    amount: 215,
    categoryName: 'Transport',
    id: 'tr-feb-2',
    merchantName: 'Uber',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-02-11',
  }),
  createFact({
    amount: 235,
    categoryName: 'Transport',
    id: 'tr-feb-3',
    merchantName: 'Rapido',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-02-16',
  }),
  createFact({
    amount: 220,
    categoryName: 'Transport',
    id: 'tr-feb-4',
    merchantName: 'Uber',
    paymentSourceLabel: 'WhatsApp UPI',
    sourceType: 'upi_whatsapp',
    transactionDate: '2026-02-24',
  }),
  createFact({
    amount: 1100,
    categoryName: 'Shopping',
    id: 'shop-mar-1',
    merchantName: 'Westside',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-03-07',
  }),
  createFact({
    amount: 980,
    categoryName: 'Shopping',
    id: 'shop-mar-2',
    merchantName: 'Uniqlo',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-03-08',
  }),
  createFact({
    amount: 890,
    categoryName: 'Shopping',
    id: 'shop-mar-3',
    merchantName: 'Amazon',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-03-14',
  }),
  createFact({
    amount: 720,
    categoryName: 'Shopping',
    id: 'shop-mar-4',
    merchantName: 'Westside',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-03-15',
  }),
  createFact({
    amount: 410,
    categoryName: 'Shopping',
    id: 'shop-mar-5',
    merchantName: 'Amazon',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-03-18',
  }),
  createFact({
    amount: 129,
    categoryName: 'Subscriptions',
    id: 'sub-jan-1',
    merchantName: 'YouTube Premium',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-01-17',
  }),
  createFact({
    amount: 129,
    categoryName: 'Subscriptions',
    id: 'sub-feb-1',
    merchantName: 'YouTube Premium',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-02-17',
  }),
  createFact({
    amount: 129,
    categoryName: 'Subscriptions',
    id: 'sub-mar-1',
    merchantName: 'YouTube Premium',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-03-17',
  }),
  createFact({
    amount: 129,
    categoryName: 'Subscriptions',
    id: 'sub-mar-2',
    merchantName: 'YouTube Premium',
    paymentSourceLabel: 'HDFC Millennia',
    transactionDate: '2026-03-19',
  }),
  createFact({
    amount: 15500,
    categoryName: 'Shopping',
    id: 'spike-mar-1',
    merchantName: 'Croma',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-03-26',
  }),
  createFact({
    amount: 1200,
    categoryName: 'Shopping',
    id: 'shop-feb-6',
    merchantName: 'Croma',
    paymentSourceLabel: 'Amex MRCC',
    transactionDate: '2026-02-06',
  }),
];

test('generateAnalyticsOutputs derives stable insights and a richer report from shared deterministic signals', () => {
  const result = generateAnalyticsOutputs({
    generatedAt,
    householdId,
    period,
    reportType: 'monthly',
    facts,
  });

  assert.equal(result.comparison.currentSpend, 29393);
  assert.equal(result.comparison.previousSpend, 6424);
  assert.equal(result.insights.length, 5);
  assert.deepEqual(new Set(result.insights.map((insight) => insight.type)), new Set([
    'unusual_spike',
    'overspending',
    'savings_opportunity',
    'duplicate_subscription',
    'category_pattern',
  ]));

  const unusualSpike = result.insights.find((insight) => insight.type === 'unusual_spike');
  assert.match(unusualSpike.title, /Croma/i);
  assert.match(unusualSpike.recommendation, /review/i);
  assert.equal(unusualSpike.estimatedMonthlyImpact, 14300);
  assert.equal(unusualSpike.evidencePayload[0]?.metricKey, 'currentSpend');
  assert.equal(unusualSpike.generatedFrom.signalKey, 'merchant_spike');

  const duplicateSubscription = result.insights.find((insight) => insight.type === 'duplicate_subscription');
  assert.match(duplicateSubscription.summary, /2 charges/i);
  assert.equal(duplicateSubscription.estimatedMonthlyImpact, 129);
  assert.equal(duplicateSubscription.generatedFrom.supportingTransactionIds.length, 4);

  const categoryPattern = result.insights.find((insight) => insight.type === 'category_pattern');
  assert.match(categoryPattern.summary, /weekend/i);
  assert.equal(categoryPattern.generatedFrom.metrics.weekendShare, 90);

  assert.equal(result.report.reportType, 'monthly');
  assert.equal(result.report.payload.sections.length, 5);
  assert.deepEqual(
    result.report.payload.sections.map((section) => section.id),
    [
      'major-spend-shifts',
      'savings-opportunities',
      'recurring-charge-findings',
      'unusual-patterns',
      'recommended-next-actions',
    ],
  );
  assert.ok(result.report.payload.sections.every((section) => section.insightIds.length > 0));
});

test('generateAnalyticsOutputs keeps the deep report linked to the same insight ids shown inline', () => {
  const result = generateAnalyticsOutputs({
    generatedAt,
    householdId,
    period,
    reportType: 'on_demand',
    facts,
  });

  const insightIds = new Set(result.insights.map((insight) => insight.id));

  for (const section of result.report.payload.sections) {
    for (const insightId of section.insightIds) {
      assert.equal(insightIds.has(insightId), true);
    }
  }

  assert.equal(result.report.payload.summaryInsightIds.length >= 2, true);
  assert.ok(result.report.summary.includes('clearest actionable driver'));
});

function createFact(overrides) {
  return {
    amount: 0,
    categoryId: null,
    categoryName: 'Uncategorized',
    id: 'fact-id',
    merchantName: 'Unknown merchant',
    needsReview: false,
    ownerDisplayName: 'Ishan',
    ownerMemberId: 'member-1',
    ownerScope: 'member',
    paymentSourceLabel: 'Amex MRCC',
    sourceType: 'credit_card_statement',
    status: 'processed',
    transactionDate: '2026-03-01',
    transactionMonth: '2026-03-01',
    ...overrides,
    transactionMonth: `${String(overrides.transactionDate ?? '2026-03-01').slice(0, 7)}-01`,
  };
}
