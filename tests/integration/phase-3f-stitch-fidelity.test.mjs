import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readFile(...segments) {
  return fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');
}

test('Phase 3F dashboard and analytics screens stay aligned with the required Stitch reference labels', () => {
  const dashboardReference = [
    readFile('stitch-dashboard-html', 'dashboard-with-spending-alerts.html'),
    readFile('stitch-dashboard-html', 'updated-dashboard-with-annotations.html'),
  ].join('\n');
  const analyticsReference = readFile('stitch-dashboard-html', 'analytics-expense-focus.html');
  const dashboardSource = readFile('apps', 'mobile', 'src', 'app', '(tabs)', 'index.tsx');
  const dashboardModelSource = readFile('apps', 'mobile', 'src', 'features', 'dashboard', 'dashboard-model.ts');
  const analyticsSource = readFile('apps', 'mobile', 'src', 'app', '(tabs)', 'analytics.tsx');
  const reportSource = readFile('apps', 'mobile', 'src', 'app', 'analytics-report.tsx');

  assert.match(dashboardReference, /Upload your latest statement for accurate tracking\./);
  assert.match(dashboardReference, /Drive Sync/);
  assert.match(dashboardReference, /WhatsApp UPI tracking active/);
  assert.match(dashboardReference, /Spending Alerts/);
  assert.match(dashboardSource, /Upload your latest statement for accurate tracking\./);
  assert.match(dashboardSource, /WhatsApp UPI/);
  assert.match(dashboardSource, /Spending Alerts/);
  assert.match(dashboardSource, /Deep Analysis/);
  assert.match(dashboardModelSource, /Drive Sync/);

  assert.match(analyticsReference, /Weekly/);
  assert.match(analyticsReference, /Monthly/);
  assert.match(analyticsReference, /Yearly/);
  assert.match(analyticsReference, /Capital Flow/);
  assert.match(analyticsReference, /Allocation Audit/);
  assert.match(analyticsSource, /Weekly/);
  assert.match(analyticsSource, /Monthly/);
  assert.match(analyticsSource, /Yearly/);
  assert.match(analyticsSource, /Capital Flow/);
  assert.match(analyticsSource, /Allocation Audit/);
  assert.match(analyticsSource, /LLM Analysis/);
  assert.match(reportSource, /Deep analysis/);
  assert.match(reportSource, /Back to Analytics/);
});

test('Phase 3F transactions screen preserves the Stitch transaction-history controls and drill-down framing', () => {
  const transactionHistoryReference = readFile('stitch-dashboard-html', 'transaction-history.html');
  const transactionsSource = readFile('apps', 'mobile', 'src', 'app', '(tabs)', 'transactions.tsx');

  assert.match(transactionHistoryReference, /Search by vendor\.\.\./);
  assert.match(transactionHistoryReference, /Category:/);
  assert.match(transactionHistoryReference, /Period:/);
  assert.match(transactionHistoryReference, /Today/);
  assert.match(transactionHistoryReference, /Yesterday/);

  assert.match(transactionsSource, /Search by vendor/);
  assert.match(transactionsSource, /Category/);
  assert.match(transactionsSource, /Period/);
  assert.match(transactionsSource, /Focused view/);
  assert.match(transactionsSource, /Needs review/);
});
