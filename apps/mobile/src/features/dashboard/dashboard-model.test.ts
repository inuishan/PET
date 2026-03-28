import { describe, expect, it } from 'vitest';

import { createMockCoreProductState } from '@/features/core-product/core-product-state';

import { createDashboardSnapshot } from './dashboard-model';

describe('createDashboardSnapshot', () => {
  it('summarizes totals, sync freshness, alerts, and recent activity for the dashboard', () => {
    const snapshot = createDashboardSnapshot(createMockCoreProductState(), '2026-03-27T08:00:00.000Z');

    expect(snapshot.totals.monthToDateSpend).toBe(25127);
    expect(snapshot.totals.reviewQueueAmount).toBe(4079);
    expect(snapshot.totals.reviewQueueCount).toBe(2);
    expect(snapshot.sync.freshnessLabel).toBe('Updated 1h 50m ago');
    expect(snapshot.alerts.map((alert) => alert.title)).toEqual([
      '2 transactions need review',
      'Statement sync needs attention',
    ]);
  });

  it('limits recent transactions to the latest four rows in descending order', () => {
    const snapshot = createDashboardSnapshot(createMockCoreProductState(), '2026-03-27T08:00:00.000Z');

    expect(snapshot.recentTransactions).toHaveLength(4);
    expect(snapshot.recentTransactions.map((transaction) => transaction.id)).toEqual([
      'txn-006',
      'txn-005',
      'txn-004',
      'txn-003',
    ]);
  });

  it('keeps card and WhatsApp activity in the same dashboard feed with source attribution', () => {
    const state = createMockCoreProductState();
    const snapshot = createDashboardSnapshot(
      {
        ...state,
        transactions: [
          {
            ...state.transactions[5],
            id: 'txn-upi-001',
            merchant: 'Zepto',
            ownerDisplayName: 'Ishan',
            ownerScope: 'member',
            postedAt: '2026-03-27T07:50:00.000Z',
            reviewReason: 'owner_conflict',
            reviewReasons: ['owner_conflict'],
            sourceContextLabel: 'Meta test number',
            sourceLabel: 'WhatsApp UPI',
            sourceType: 'upi_whatsapp',
          },
          ...state.transactions,
        ],
        whatsappSource: {
          approvedParticipantCount: 2,
          failedCaptureCount: 0,
          lastCaptureAt: '2026-03-27T07:50:00.000Z',
          reviewCaptureCount: 1,
          status: 'degraded',
        },
      },
      '2026-03-27T08:00:00.000Z'
    );

    expect(snapshot.recentTransactions[0]).toMatchObject({
      id: 'txn-upi-001',
      ownerDisplayName: 'Ishan',
      sourceBadge: 'UPI',
      sourceLabel: 'WhatsApp UPI',
    });
    expect(snapshot.sources.whatsapp).toMatchObject({
      detail: '1 WhatsApp capture needs review.',
      status: 'degraded',
    });
  });
});
