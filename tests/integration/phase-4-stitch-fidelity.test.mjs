import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function readFile(...segments) {
  return fs.readFileSync(path.join(process.cwd(), ...segments), 'utf8');
}

test('Phase 4 trust surfaces keep the required Stitch HTML references and screenshots in place', () => {
  const requiredAssets = [
    ['stitch-dashboard-html', 'dashboard-with-spending-alerts.html'],
    ['stitch-dashboard-html', 'updated-dashboard-with-annotations.html'],
    ['stitch-dashboard-html', 'transaction-history.html'],
    ['stitch-dashboard-html', 'analytics-expense-focus.html'],
    ['stitch-dashboard-html', 'images', 'dashboard-with-spending-alerts.png'],
    ['stitch-dashboard-html', 'images', 'updated-dashboard-with-annotations.png'],
    ['stitch-dashboard-html', 'images', 'transaction-history.png'],
    ['stitch-dashboard-html', 'images', 'analytics-expense-focus.png'],
  ];

  for (const assetPath of requiredAssets) {
    assert.equal(fs.existsSync(path.join(process.cwd(), ...assetPath)), true, `missing Stitch asset: ${assetPath.join('/')}`);
  }

  const dashboardSource = readFile('apps', 'mobile', 'src', 'app', '(tabs)', 'index.tsx');
  const transactionsSource = readFile('apps', 'mobile', 'src', 'app', '(tabs)', 'transactions.tsx');
  const analyticsSource = readFile('apps', 'mobile', 'src', 'app', '(tabs)', 'analytics.tsx');

  assert.match(dashboardSource, /Spending Alerts/);
  assert.match(dashboardSource, /Upload your latest statement for accurate tracking\./);
  assert.match(transactionsSource, /Search by vendor/);
  assert.match(transactionsSource, /Needs review/);
  assert.match(analyticsSource, /Recurring charge/);
  assert.match(analyticsSource, /Deep Analysis/);
});
