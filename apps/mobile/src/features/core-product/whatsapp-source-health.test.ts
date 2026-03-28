import { describe, expect, it } from 'vitest';

import { buildWhatsAppSourceHealthSnapshot } from './whatsapp-source-health';

describe('buildWhatsAppSourceHealthSnapshot', () => {
  it('marks the source as setup-required before any participants are approved', () => {
    const snapshot = buildWhatsAppSourceHealthSnapshot(
      {
        approvedParticipantCount: 0,
        messages: [],
      },
      '2026-03-27T08:00:00.000Z'
    );

    expect(snapshot).toMatchObject({
      acknowledgementStatusLabel: 'Disabled until replies are configured',
      approvedParticipantCount: 0,
      failedCaptureCount: 0,
      healthBody: 'Approve at least one household participant before the Meta test number can ingest UPI expenses.',
      lastCaptureLabel: 'No approved participant traffic yet',
      reviewCaptureCount: 0,
      setupLabel: 'No approved participants',
      status: 'needs_setup',
    });
  });

  it('surfaces review-needed and failed captures in the source health summary', () => {
    const snapshot = buildWhatsAppSourceHealthSnapshot(
      {
        approvedParticipantCount: 2,
        messages: [
          {
            parseStatus: 'failed',
            receivedAt: '2026-03-27T07:57:00.000Z',
          },
          {
            parseStatus: 'needs_review',
            receivedAt: '2026-03-27T07:51:00.000Z',
          },
          {
            parseStatus: 'posted',
            receivedAt: '2026-03-27T07:10:00.000Z',
          },
        ],
      },
      '2026-03-27T08:00:00.000Z'
    );

    expect(snapshot).toMatchObject({
      approvedParticipantCount: 2,
      failedCaptureCount: 1,
      reviewCaptureCount: 1,
      setupLabel: '2 approved participants',
      status: 'failing',
    });
    expect(snapshot.lastCaptureLabel).toBe('3m ago');
    expect(snapshot.healthBody).toBe('1 WhatsApp capture failed recently. 1 more capture still needs review.');
  });
});
