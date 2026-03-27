const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function readAppFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), 'apps', 'mobile', 'src', 'app', relativePath), 'utf8');
}

test('Phase 1 onboarding screen keeps both create and join household wiring intact', () => {
  const source = readAppFile(path.join('(onboarding)', 'household.tsx'));

  assert.match(source, /useAuthSession\(\)/);
  assert.match(source, /mode === 'create'/);
  assert.match(source, /await createHousehold\(/);
  assert.match(source, /await joinHousehold\(/);
  assert.match(source, /Create Household/);
  assert.match(source, /Join With Code/);
});

test('Phase 1 tab screens remain wired to dashboard and review-state models', () => {
  const dashboardSource = readAppFile(path.join('(tabs)', 'index.tsx'));
  const transactionsSource = readAppFile(path.join('(tabs)', 'transactions.tsx'));

  assert.match(dashboardSource, /createDashboardSnapshot/);
  assert.match(dashboardSource, /Needs review/);
  assert.match(transactionsSource, /buildTransactionsScreenState/);
  assert.match(transactionsSource, /loadTransactionsSnapshot/);
  assert.match(transactionsSource, /saveTransactionCategoryAssignment/);
  assert.match(transactionsSource, /useQuery/);
  assert.match(transactionsSource, /useMutation/);
  assert.match(transactionsSource, /Needs review/);
});
