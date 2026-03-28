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
  const layoutSource = readAppFile(path.join('(tabs)', '_layout.tsx'));
  const dashboardSource = readAppFile(path.join('(tabs)', 'index.tsx'));
  const analyticsSource = readAppFile(path.join('(tabs)', 'analytics.tsx'));
  const settingsSource = readAppFile(path.join('(tabs)', 'settings.tsx'));
  const transactionsSource = readAppFile(path.join('(tabs)', 'transactions.tsx'));

  assert.match(layoutSource, /Tabs\.Screen name="analytics"/);
  assert.match(dashboardSource, /loadDashboardSnapshot/);
  assert.match(dashboardSource, /createDashboardQueryKey/);
  assert.match(dashboardSource, /Needs review/);
  assert.match(dashboardSource, /WhatsApp UPI/);
  assert.match(analyticsSource, /loadAnalyticsSnapshot/);
  assert.match(analyticsSource, /createAnalyticsQueryKey/);
  assert.match(analyticsSource, /router\.push/);
  assert.match(analyticsSource, /Weekly|Monthly|Yearly/);
  assert.match(analyticsSource, /Allocation Audit|LLM Analysis|Deep Analysis/);
  assert.match(transactionsSource, /buildTransactionsScreenState/);
  assert.match(transactionsSource, /loadTransactionsSnapshot/);
  assert.match(transactionsSource, /saveTransactionCategoryAssignment/);
  assert.match(transactionsSource, /useQuery/);
  assert.match(transactionsSource, /useMutation/);
  assert.match(transactionsSource, /useLocalSearchParams/);
  assert.match(transactionsSource, /Search by vendor/);
  assert.match(transactionsSource, /Category/);
  assert.match(transactionsSource, /Period/);
  assert.match(transactionsSource, /Needs review/);
  assert.match(transactionsSource, /WhatsApp UPI/);
  assert.match(settingsSource, /approve_whatsapp_participant|saveApprovedParticipant/);
  assert.match(settingsSource, /revoke_whatsapp_participant|revokeApprovedParticipant/);
  assert.match(settingsSource, /Approved participants/);
});
