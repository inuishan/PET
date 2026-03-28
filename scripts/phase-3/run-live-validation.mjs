#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { buildAnalyticsReportScreenState } from '../../apps/mobile/src/features/analytics/analytics-report-model.ts';
import { buildAnalyticsScreenState } from '../../apps/mobile/src/features/analytics/analytics-model.ts';
import { loadAnalyticsReport, loadAnalyticsSnapshot } from '../../apps/mobile/src/features/analytics/analytics-service.ts';
import { buildDashboardScreenState } from '../../apps/mobile/src/features/dashboard/dashboard-model.ts';
import {
  createTransactionsDrilldownParams,
  readTransactionsDrilldownParams,
} from '../../apps/mobile/src/features/transactions/transactions-drilldown.ts';
import {
  ANALYTICS_PIPELINE_SECRET_HEADER,
  handleAnalyticsGenerateRequest,
} from '../../supabase/functions/_shared/analytics-generate.ts';
import {
  buildPhase3RuntimeValidationReport,
  loadEnvFile,
} from './runtime-config.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseArguments(process.argv.slice(2));
  const report = buildPhase3RuntimeValidationReport({
    mobileEnv: loadEnvFile(options.mobileEnvPath),
    supabaseEnv: loadEnvFile(options.supabaseEnvPath),
  });

  if (report.errors.length > 0) {
    console.error('Phase 3 validation cannot start because the runtime configuration is invalid.');

    for (const error of report.errors) {
      console.error(`- ${error}`);
    }

    process.exit(1);
  }

  const result = options.mode === 'live'
    ? await runLivePhase3Validation(report.config, options)
    : await runMockPhase3Validation(report.config, options);

  console.log(JSON.stringify(result, null, 2));
}

export async function runMockPhase3Validation(config, options = {}) {
  const requestPayload = buildGenerationRequest(options);
  const facts = createMockAnalyticsFacts();
  let persisted = null;

  const response = await handleAnalyticsGenerateRequest(
    new Request(config.supabase.analyticsGenerateUrl?.toString() ?? 'http://localhost/functions/v1/analytics-generate', {
      body: JSON.stringify(requestPayload),
      headers: {
        'content-type': 'application/json',
        [ANALYTICS_PIPELINE_SECRET_HEADER]: config.supabase.analyticsPipelineSharedSecret,
      },
      method: 'POST',
    }),
    {
      now: () => '2026-03-28T05:45:00.000Z',
      repository: {
        async listAnalyticsFacts() {
          return facts;
        },
        async saveOutputs(input) {
          persisted = JSON.parse(JSON.stringify(input));

          return {
            insightCount: input.insights.length,
            reportId: input.report.id,
          };
        },
      },
      webhookSecret: config.supabase.analyticsPipelineSharedSecret,
    },
  );
  const generation = await response.json();

  if (response.status !== 200 || generation.success !== true || !persisted) {
    throw new Error(`Mock analytics generation failed. ${JSON.stringify(generation)}`);
  }

  const client = createStaticAnalyticsRpcClient({
    reportPayload: buildReportPayload(persisted),
    snapshotPayload: buildSnapshotPayload({
      comparison: persisted.comparison,
      facts,
      householdId: requestPayload.householdId,
      insights: persisted.insights,
      period: persisted.period,
      report: persisted.report,
    }),
  });

  const snapshot = await loadAnalyticsSnapshot(client, {
    bucket: requestPayload.bucket,
    comparisonEndOn: requestPayload.comparisonEndOn ?? null,
    comparisonStartOn: requestPayload.comparisonStartOn ?? null,
    endOn: requestPayload.endOn,
    householdId: requestPayload.householdId,
    startOn: requestPayload.startOn,
  });
  const report = await loadAnalyticsReport(client, {
    householdId: requestPayload.householdId,
    reportId: generation.data.reportId,
  });

  if (!report) {
    throw new Error('Mock analytics report lookup returned null.');
  }

  return buildValidationResult({
    evidenceTransactionIds: facts.map((fact) => fact.id),
    generation,
    report,
    snapshot,
    warnings: [],
  });
}

export async function runLivePhase3Validation(config, options = {}) {
  const requestPayload = buildGenerationRequest(options);
  const generationResponse = await fetch(config.supabase.analyticsGenerateUrl, {
    body: JSON.stringify(requestPayload),
    headers: {
      'content-type': 'application/json',
      [ANALYTICS_PIPELINE_SECRET_HEADER]: config.supabase.analyticsPipelineSharedSecret,
    },
    method: 'POST',
  });
  const generation = await parseJsonResponse(generationResponse, 'analytics-generate');

  if (!generationResponse.ok || generation.success !== true) {
    throw new Error(`Live analytics generation failed. ${JSON.stringify(generation)}`);
  }

  const client = createFetchAnalyticsRpcClient(config);
  const snapshot = await loadAnalyticsSnapshot(client, {
    bucket: requestPayload.bucket,
    comparisonEndOn: requestPayload.comparisonEndOn ?? null,
    comparisonStartOn: requestPayload.comparisonStartOn ?? null,
    endOn: requestPayload.endOn,
    householdId: requestPayload.householdId,
    startOn: requestPayload.startOn,
  });
  const report = await loadAnalyticsReport(client, {
    householdId: requestPayload.householdId,
    reportId: generation.data.reportId,
  });

  if (!report) {
    throw new Error('Live analytics report lookup returned null after generation.');
  }

  const evidenceTransactionIds = await fetchExistingTransactionIds(
    config,
    requestPayload.householdId,
    collectSupportingTransactionIds(report),
  );

  return buildValidationResult({
    evidenceTransactionIds,
    generation,
    report,
    snapshot,
    warnings: config.supabase.readTokenSource === 'service_role'
      ? [
          'Read validation used SUPABASE_SERVICE_ROLE_KEY. Set PHASE3_VALIDATION_READ_ACCESS_TOKEN to confirm the authenticated client path as well.',
        ]
      : [],
  });
}

function createFetchAnalyticsRpcClient(config) {
  return {
    async rpc(name, args = {}) {
      try {
        const data = await invokeRpc(config, name, args);
        return {
          data,
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error: {
            message: error instanceof Error ? error.message : 'Unknown RPC failure.',
          },
        };
      }
    },
  };
}

function createStaticAnalyticsRpcClient(input) {
  return {
    async rpc(name) {
      if (name === 'get_household_analytics_snapshot') {
        return {
          data: input.snapshotPayload,
          error: null,
        };
      }

      if (name === 'get_household_analytics_report') {
        return {
          data: input.reportPayload,
          error: null,
        };
      }

      return {
        data: null,
        error: {
          message: `Unsupported RPC: ${name}`,
        },
      };
    },
  };
}

async function invokeRpc(config, name, args) {
  const credentials = resolveRestCredentials(config);
  const endpoint = new URL(`/rest/v1/rpc/${name}`, config.supabase.supabaseUrl);
  const response = await fetch(endpoint, {
    body: JSON.stringify(args),
    headers: {
      apikey: credentials.apiKey,
      authorization: `Bearer ${credentials.authorizationToken}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    method: 'POST',
  });
  const payload = await parseJsonResponse(response, name);

  if (!response.ok) {
    throw new Error(`RPC ${name} failed. ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function fetchExistingTransactionIds(config, householdId, transactionIds) {
  if (transactionIds.length === 0) {
    return [];
  }

  const credentials = resolveRestCredentials(config);
  const endpoint = new URL('/rest/v1/transactions', config.supabase.supabaseUrl);
  endpoint.searchParams.set('select', 'id');
  endpoint.searchParams.set('household_id', `eq.${householdId}`);
  endpoint.searchParams.set('id', `in.(${transactionIds.map((id) => encodePostgrestValue(id)).join(',')})`);

  const response = await fetch(endpoint, {
    headers: {
      apikey: credentials.apiKey,
      authorization: `Bearer ${credentials.authorizationToken}`,
    },
    method: 'GET',
  });
  const payload = await parseJsonResponse(response, 'transactions evidence lookup');

  if (!response.ok) {
    throw new Error(`Evidence lookup failed. ${JSON.stringify(payload)}`);
  }

  return Array.isArray(payload) ? payload.map((row) => String(row.id)) : [];
}

function buildValidationResult(input) {
  const analyticsScreenState = buildAnalyticsScreenState(input.snapshot);
  const reportScreenState = buildAnalyticsReportScreenState(input.report);
  const dashboardScreenState = buildDashboardScreenState(
    buildDashboardSnapshotForValidation(input.snapshot),
  );
  const supportingTransactionIds = collectSupportingTransactionIds(input.report);
  const knownTransactionIds = new Set(input.evidenceTransactionIds);

  return {
    analyticsScreenState,
    dashboardScreenState,
    evidenceChecks: {
      missingTransactionIds: supportingTransactionIds.filter((transactionId) => !knownTransactionIds.has(transactionId)),
      supportingTransactionIds,
    },
    generation: input.generation,
    report: {
      generatedAt: input.report.generatedAt,
      id: input.report.id,
      insightCount: input.report.insights.length,
      sectionCount: input.report.payload.sections.length,
      title: input.report.title,
    },
    reportScreenState,
    roundTrips: {
      analyticsInsight: roundTripDrilldown(analyticsScreenState.insightCards[0]?.drilldown ?? null),
      reportSection: roundTripDrilldown(reportScreenState.sections[0]?.primaryDrilldown ?? null),
    },
    snapshot: {
      householdId: input.snapshot.householdId,
      insightsCount: input.snapshot.insights.length,
      latestReport: input.snapshot.latestReport,
      period: input.snapshot.period,
    },
    warnings: [...input.warnings],
  };
}

function buildDashboardSnapshotForValidation(snapshot) {
  return {
    alerts: [],
    analytics: snapshot,
    recentTransactions: [],
    sources: {
      statements: {
        detail: 'Phase 3 validation confirmed generated analytics outputs are readable from the backend path.',
        label: 'Statements',
        status: 'healthy',
      },
      whatsapp: {
        detail: 'Phase 3 validation focused on analytics consumption, not WhatsApp capture health.',
        label: 'WhatsApp UPI',
        status: 'healthy',
      },
    },
    sync: {
      freshnessLabel: 'Validated just now',
      pendingStatementCount: 0,
      status: 'healthy',
    },
    totals: {
      monthToDateSpend: snapshot.comparison.currentSpend,
      reviewQueueAmount: 0,
      reviewQueueCount: 0,
      reviewedAmount: snapshot.comparison.currentSpend,
      transactionCount: snapshot.comparison.currentTransactionCount,
    },
  };
}

function buildGenerationRequest(options) {
  const householdId = readRequiredOption(options.householdId, 'householdId');
  const bucket = options.bucket ?? 'month';
  const reportType = options.reportType ?? 'monthly';
  const period = resolveValidationPeriod(bucket, options);

  return {
    bucket,
    comparisonEndOn: options.comparisonEndOn ?? period.comparisonEndOn,
    comparisonStartOn: options.comparisonStartOn ?? period.comparisonStartOn,
    endOn: period.endOn,
    householdId,
    reportType,
    startOn: period.startOn,
  };
}

function resolveValidationPeriod(bucket, options) {
  if (options.startOn && options.endOn) {
    return {
      comparisonEndOn: options.comparisonEndOn ?? null,
      comparisonStartOn: options.comparisonStartOn ?? null,
      endOn: options.endOn,
      startOn: options.startOn,
    };
  }

  const asOf = new Date(`${options.asOf ?? new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

  if (Number.isNaN(asOf.getTime())) {
    throw new Error(`Invalid as-of date: ${options.asOf}`);
  }

  if (bucket === 'year') {
    const startOn = `${asOf.getUTCFullYear()}-01-01`;
    const endOn = `${asOf.getUTCFullYear()}-12-31`;

    return {
      comparisonEndOn: `${asOf.getUTCFullYear() - 1}-12-31`,
      comparisonStartOn: `${asOf.getUTCFullYear() - 1}-01-01`,
      endOn,
      startOn,
    };
  }

  if (bucket === 'week') {
    const weekday = asOf.getUTCDay();
    const offsetToMonday = weekday === 0 ? -6 : 1 - weekday;
    const start = addDays(formatDate(asOf), offsetToMonday);
    const end = addDays(start, 6);

    return {
      comparisonEndOn: addDays(start, -1),
      comparisonStartOn: addDays(start, -7),
      endOn: end,
      startOn: start,
    };
  }

  const startOn = `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const endOn = formatDate(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0)));
  const comparisonEndOn = formatDate(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 0)));
  const comparisonStartOn = `${new Date(`${comparisonEndOn}T00:00:00.000Z`).getUTCFullYear()}-${String(new Date(`${comparisonEndOn}T00:00:00.000Z`).getUTCMonth() + 1).padStart(2, '0')}-01`;

  return {
    comparisonEndOn,
    comparisonStartOn,
    endOn,
    startOn,
  };
}

function buildSnapshotPayload(input) {
  const trustedFacts = input.facts.filter((fact) => fact.status === 'processed' && fact.needsReview === false);
  const currentFacts = filterFactsForWindow(trustedFacts, input.period.startOn, input.period.endOn);

  return {
    categoryAllocation: buildCategoryAllocation(currentFacts),
    comparison: {
      currentSpend: input.comparison.currentSpend,
      currentTransactionCount: currentFacts.length,
      deltaPercentage: input.comparison.deltaPercentage,
      deltaSpend: input.comparison.deltaSpend,
      previousSpend: input.comparison.previousSpend,
      previousTransactionCount: countFactsForWindow(
        trustedFacts,
        input.period.comparisonStartOn,
        input.period.comparisonEndOn,
      ),
    },
    householdId: input.householdId,
    insights: input.insights.map((insight) => ({
      ...insight,
    })),
    latestReport: {
      generatedAt: input.report.generatedAt,
      id: input.report.id,
      periodEnd: input.report.periodEnd,
      periodStart: input.report.periodStart,
      title: input.report.title,
    },
    period: {
      bucket: input.period.bucket,
      comparisonEndOn: input.period.comparisonEndOn,
      comparisonStartOn: input.period.comparisonStartOn,
      endOn: input.period.endOn,
      startOn: input.period.startOn,
    },
    recurringChargeCandidates: buildRecurringCandidates(trustedFacts),
    spendByPaymentSource: buildPaymentSourceBreakdown(currentFacts),
    spendByPerson: buildSpendByPerson(currentFacts),
    trendSeries: buildTrendSeries(trustedFacts, input.period),
  };
}

function buildReportPayload(persisted) {
  return {
    comparison: {
      deltaPercentage: persisted.report.comparison.deltaPercentage,
      deltaSpend: persisted.report.comparison.deltaSpend,
      previousSpend: persisted.report.comparison.previousSpend,
    },
    generatedAt: persisted.report.generatedAt,
    id: persisted.report.id,
    insights: persisted.insights.map((insight) => ({
      ...insight,
    })),
    payload: persisted.report.payload,
    periodEnd: persisted.report.periodEnd,
    periodStart: persisted.report.periodStart,
    reportType: persisted.report.reportType,
    summary: persisted.report.summary,
    title: persisted.report.title,
  };
}

function buildCategoryAllocation(facts) {
  const totalSpend = facts.reduce((total, fact) => total + fact.amount, 0);
  const grouped = summarizeBy(facts, (fact) => fact.categoryName);

  return Array.from(grouped.entries())
    .map(([categoryName, summary]) => ({
      categoryId: summary.facts[0]?.categoryId ?? null,
      categoryName,
      reviewCount: summary.facts.filter((fact) => fact.needsReview).length,
      shareBps: totalSpend === 0 ? 0 : Math.round((summary.totalSpend / totalSpend) * 10_000),
      totalSpend: roundCurrency(summary.totalSpend),
      transactionCount: summary.facts.length,
    }))
    .sort((left, right) => right.totalSpend - left.totalSpend);
}

function buildPaymentSourceBreakdown(facts) {
  const totalSpend = facts.reduce((total, fact) => total + fact.amount, 0);
  const grouped = summarizeBy(facts, (fact) => `${fact.sourceType}::${fact.paymentSourceLabel}`);

  return Array.from(grouped.entries())
    .map(([compositeKey, summary]) => {
      const [sourceType, paymentSourceLabel] = compositeKey.split('::');

      return {
        paymentSourceLabel,
        shareBps: totalSpend === 0 ? 0 : Math.round((summary.totalSpend / totalSpend) * 10_000),
        sourceType,
        totalSpend: roundCurrency(summary.totalSpend),
        transactionCount: summary.facts.length,
      };
    })
    .sort((left, right) => right.totalSpend - left.totalSpend);
}

function buildSpendByPerson(facts) {
  const totalSpend = facts.reduce((total, fact) => total + fact.amount, 0);
  const grouped = summarizeBy(
    facts,
    (fact) => `${fact.ownerScope}::${fact.ownerMemberId ?? 'none'}::${fact.ownerDisplayName ?? 'Unknown'}`,
  );

  return Array.from(grouped.entries())
    .map(([compositeKey, summary]) => {
      const [ownerScope, ownerMemberId, ownerDisplayName] = compositeKey.split('::');

      return {
        ownerDisplayName: ownerDisplayName === 'Unknown' ? null : ownerDisplayName,
        ownerMemberId: ownerMemberId === 'none' ? null : ownerMemberId,
        ownerScope,
        shareBps: totalSpend === 0 ? 0 : Math.round((summary.totalSpend / totalSpend) * 10_000),
        totalSpend: roundCurrency(summary.totalSpend),
        transactionCount: summary.facts.length,
      };
    })
    .sort((left, right) => right.totalSpend - left.totalSpend);
}

function buildRecurringCandidates(facts) {
  const grouped = summarizeBy(facts, (fact) => `${fact.merchantName}::${fact.paymentSourceLabel}`);

  return Array.from(grouped.entries())
    .map(([compositeKey, summary]) => {
      const months = [...new Set(summary.facts.map((fact) => fact.transactionMonth))].sort();

      if (months.length < 2) {
        return null;
      }

      const [merchantName, paymentSourceLabel] = compositeKey.split('::');
      const sortedFacts = [...summary.facts].sort((left, right) =>
        left.transactionDate.localeCompare(right.transactionDate),
      );
      const dayDiffs = [];

      for (let index = 1; index < sortedFacts.length; index += 1) {
        dayDiffs.push(diffDays(sortedFacts[index - 1].transactionDate, sortedFacts[index].transactionDate));
      }

      return {
        averageAmount: roundCurrency(summary.totalSpend / summary.facts.length),
        averageCadenceDays: dayDiffs.length > 0 ? Math.round(dayDiffs.reduce((total, value) => total + value, 0) / dayDiffs.length) : null,
        categoryName: summary.facts[0]?.categoryName ?? 'Uncategorized',
        lastChargedOn: sortedFacts.at(-1)?.transactionDate ?? null,
        merchantName,
        monthsActive: months.length,
        paymentSourceLabel,
        transactionCount: summary.facts.length,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.transactionCount - left.transactionCount);
}

function buildTrendSeries(facts, period) {
  const grouped = summarizeBy(
    facts.filter((fact) => fact.transactionDate <= period.endOn),
    (fact) => fact.transactionMonth,
  );

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([transactionMonth, summary]) => ({
      bucketEndOn: formatDate(new Date(Date.UTC(
        Number(transactionMonth.slice(0, 4)),
        Number(transactionMonth.slice(5, 7)),
        0,
      ))),
      bucketLabel: formatMonthYearLabel(transactionMonth),
      bucketStartOn: transactionMonth,
      reviewCount: summary.facts.filter((fact) => fact.needsReview).length,
      totalSpend: roundCurrency(summary.totalSpend),
      transactionCount: summary.facts.length,
    }));
}

function roundTripDrilldown(drilldown) {
  if (!drilldown) {
    return null;
  }

  return readTransactionsDrilldownParams(createTransactionsDrilldownParams(drilldown));
}

function collectSupportingTransactionIds(report) {
  return [...new Set(
    report.insights.flatMap((insight) => insight.generatedFrom.supportingTransactionIds),
  )];
}

function summarizeBy(facts, getKey) {
  const summaries = new Map();

  for (const fact of facts) {
    const key = getKey(fact);
    const existing = summaries.get(key) ?? {
      facts: [],
      totalSpend: 0,
    };

    summaries.set(key, {
      facts: [...existing.facts, fact],
      totalSpend: existing.totalSpend + fact.amount,
    });
  }

  return summaries;
}

function filterFactsForWindow(facts, startOn, endOn) {
  return facts.filter((fact) => fact.transactionDate >= startOn && fact.transactionDate <= endOn);
}

function countFactsForWindow(facts, startOn, endOn) {
  return filterFactsForWindow(facts, startOn, endOn).length;
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function diffDays(startOn, endOn) {
  const start = new Date(`${startOn}T00:00:00.000Z`);
  const end = new Date(`${endOn}T00:00:00.000Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function addDays(dateOnly, dayDelta) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return formatDate(date);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthYearLabel(transactionMonth) {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(`${transactionMonth}T00:00:00.000Z`));
}

function parseArguments(argv) {
  const options = {
    asOf: null,
    bucket: 'month',
    comparisonEndOn: null,
    comparisonStartOn: null,
    endOn: null,
    householdId: null,
    mobileEnvPath: 'apps/mobile/.env.phase3.example',
    mode: 'mock',
    reportType: 'monthly',
    startOn: null,
    supabaseEnvPath: 'supabase/.env.functions.phase3.example',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--mobile-env') {
      options.mobileEnvPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--supabase-env') {
      options.supabaseEnvPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--mode') {
      options.mode = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--household-id') {
      options.householdId = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--bucket') {
      options.bucket = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--start-on') {
      options.startOn = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--end-on') {
      options.endOn = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--comparison-start-on') {
      options.comparisonStartOn = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--comparison-end-on') {
      options.comparisonEndOn = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--report-type') {
      options.reportType = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--as-of') {
      options.asOf = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument: ${argument}`);
  }

  return options;
}

function readRequiredOption(value, fieldName) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  throw new Error(`${fieldName} is required.`);
}

async function parseJsonResponse(response, label) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Unable to parse ${label} response as JSON. ${error.message}`);
  }
}

function encodePostgrestValue(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function resolveRestCredentials(config) {
  if (config.supabase.readTokenSource === 'authenticated_access_token') {
    return {
      apiKey: config.mobile.supabaseAnonKey,
      authorizationToken: config.supabase.validationReadAccessToken,
    };
  }

  return {
    apiKey: config.supabase.supabaseServiceRoleKey,
    authorizationToken: config.supabase.supabaseServiceRoleKey,
  };
}

function createMockAnalyticsFacts() {
  return [
    createFact({
      amount: 950,
      categoryName: 'Food & Dining',
      id: 'food-jan-1',
      merchantName: 'Swiggy',
      transactionDate: '2026-01-07',
    }),
    createFact({
      amount: 900,
      categoryName: 'Food & Dining',
      id: 'food-feb-1',
      merchantName: 'Swiggy',
      transactionDate: '2026-02-06',
    }),
    createFact({
      amount: 1800,
      categoryName: 'Food & Dining',
      id: 'food-mar-1',
      merchantName: 'Swiggy',
      transactionDate: '2026-03-05',
    }),
    createFact({
      amount: 1700,
      categoryName: 'Food & Dining',
      id: 'food-mar-2',
      merchantName: 'Zomato',
      transactionDate: '2026-03-19',
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
      transactionDate: '2026-03-18',
    }),
    createFact({
      amount: 650,
      categoryName: 'Shopping',
      id: 'shop-jan-1',
      merchantName: 'Croma',
      transactionDate: '2026-01-14',
    }),
    createFact({
      amount: 700,
      categoryName: 'Shopping',
      id: 'shop-feb-1',
      merchantName: 'Croma',
      transactionDate: '2026-02-10',
    }),
    createFact({
      amount: 4200,
      categoryName: 'Shopping',
      id: 'shop-mar-1',
      merchantName: 'Croma',
      transactionDate: '2026-03-22',
    }),
    createFact({
      amount: 1400,
      categoryName: 'Groceries',
      id: 'grocery-feb-1',
      merchantName: 'BigBasket',
      transactionDate: '2026-02-08',
    }),
    createFact({
      amount: 2500,
      categoryName: 'Groceries',
      id: 'grocery-mar-1',
      merchantName: 'BigBasket',
      transactionDate: '2026-03-08',
    }),
  ];
}

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
