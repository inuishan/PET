import { formatRelativeDuration } from './core-product-formatting';
import type { WhatsAppSourceStatus } from './core-product-state';

type WhatsAppMessageHealth = {
  parseStatus: string;
  receivedAt: string;
};

export type WhatsAppSourceHealthInput = {
  approvedParticipantCount: number;
  messages: WhatsAppMessageHealth[];
};

export type WhatsAppSourceHealthSnapshot = {
  acknowledgementStatusLabel: string;
  approvedParticipantCount: number;
  failedCaptureCount: number;
  healthBody: string;
  lastCaptureLabel: string;
  reviewCaptureCount: number;
  setupLabel: string;
  status: WhatsAppSourceStatus;
};

export function buildWhatsAppSourceHealthSnapshot(
  input: WhatsAppSourceHealthInput,
  asOf: string
): WhatsAppSourceHealthSnapshot {
  const failedCaptureCount = input.messages.filter((message) => message.parseStatus === 'failed').length;
  const reviewCaptureCount = input.messages.filter((message) => message.parseStatus === 'needs_review').length;
  const latestMessage = [...input.messages].sort(
    (left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime()
  )[0] ?? null;
  const status = getWhatsAppSourceStatus(input.approvedParticipantCount, failedCaptureCount, reviewCaptureCount);

  return {
    acknowledgementStatusLabel: 'Disabled until replies are configured',
    approvedParticipantCount: input.approvedParticipantCount,
    failedCaptureCount,
    healthBody: describeWhatsAppSource(status, failedCaptureCount, reviewCaptureCount),
    lastCaptureLabel: latestMessage
      ? formatRelativeDuration(latestMessage.receivedAt, asOf)
      : 'No approved participant traffic yet',
    reviewCaptureCount,
    setupLabel: formatApprovedParticipantLabel(input.approvedParticipantCount),
    status,
  };
}

function getWhatsAppSourceStatus(
  approvedParticipantCount: number,
  failedCaptureCount: number,
  reviewCaptureCount: number
): WhatsAppSourceStatus {
  if (approvedParticipantCount === 0) {
    return 'needs_setup';
  }

  if (failedCaptureCount > 0) {
    return 'failing';
  }

  if (reviewCaptureCount > 0) {
    return 'degraded';
  }

  return 'healthy';
}

function describeWhatsAppSource(
  status: WhatsAppSourceStatus,
  failedCaptureCount: number,
  reviewCaptureCount: number
) {
  if (status === 'needs_setup') {
    return 'Approve at least one household participant before the Meta test number can ingest UPI expenses.';
  }

  if (status === 'failing') {
    if (reviewCaptureCount > 0) {
      return `${formatCaptureCount(failedCaptureCount, 'failed recently')}. ${formatCaptureCount(reviewCaptureCount, 'still needs review')}.`;
    }

    return `${formatCaptureCount(failedCaptureCount, 'failed recently')}.`;
  }

  if (status === 'degraded') {
    return `${formatCaptureCount(reviewCaptureCount, 'still needs review before the source is fully trusted')}.`;
  }

  return 'Ready for the first approved WhatsApp message.';
}

function formatApprovedParticipantLabel(count: number) {
  return `${count === 0 ? 'No' : count} approved participant${count === 1 ? '' : 's'}`;
}

function formatCaptureCount(count: number, suffix: string) {
  return `${count} WhatsApp capture${count === 1 ? '' : 's'} ${suffix}`;
}
