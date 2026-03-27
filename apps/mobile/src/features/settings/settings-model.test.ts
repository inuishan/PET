import { describe, expect, it } from 'vitest';

import { createMockCoreProductState } from '@/features/core-product/core-product-state';

import { buildSettingsSnapshot } from './settings-model';

describe('buildSettingsSnapshot', () => {
  it('sorts parser profiles by urgency and derives category totals from the ledger', () => {
    const snapshot = buildSettingsSnapshot(createMockCoreProductState(), '2026-03-27T08:00:00.000Z');

    expect(snapshot.parserProfiles.map((profile) => profile.id)).toEqual([
      'icici-amazon-pay',
      'hdfc-regalia-gold',
      'amex-mrcc',
    ]);
    expect(snapshot.categories[0]).toMatchObject({
      name: 'Shopping',
      reviewCount: 0,
      transactionCount: 1,
      totalAmount: 12450,
    });
  });

  it('surfaces sync health and notification preferences for the settings screen', () => {
    const snapshot = buildSettingsSnapshot(createMockCoreProductState(), '2026-03-27T08:00:00.000Z');

    expect(snapshot.syncHealth.status).toBe('degraded');
    expect(snapshot.syncHealth.lastSuccessfulSyncLabel).toBe('1h 50m ago');
    expect(snapshot.syncHealth.pendingStatementCount).toBe(1);
    expect(snapshot.notificationPreferences).toHaveLength(3);
    expect(snapshot.notificationPreferences.filter((preference) => preference.enabled)).toHaveLength(2);
  });
});
