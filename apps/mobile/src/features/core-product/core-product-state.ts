export type CategoryTone = 'amber' | 'blue' | 'coral' | 'mint' | 'rose' | 'slate' | 'teal';

export type CoreCategory = {
  id: string;
  name: string;
  tone: CategoryTone;
};

export type ParserProfileStatus = 'active' | 'fallback' | 'needs_attention';

export type ParserProfile = {
  id: string;
  issuer: string;
  lastUsedAt: string;
  name: string;
  status: ParserProfileStatus;
  successRate: number;
};

export type NotificationPreference = {
  channel: 'email' | 'push';
  description: string;
  enabled: boolean;
  id: string;
  label: string;
};

export type SyncStatus = 'degraded' | 'failing' | 'healthy';

export type SyncHealth = {
  failureCount: number;
  lastAttemptAt: string;
  lastError: string | null;
  lastSuccessfulSyncAt: string;
  pendingStatementCount: number;
  status: SyncStatus;
};

export type LedgerSourceType = 'credit_card_statement' | 'upi_whatsapp';

export type WhatsAppSourceStatus = SyncStatus | 'needs_setup';

export type WhatsAppSourceHealth = {
  approvedParticipantCount: number;
  failedCaptureCount: number;
  lastCaptureAt: string | null;
  reviewCaptureCount: number;
  status: WhatsAppSourceStatus;
};

export type LedgerTransaction = {
  amount: number;
  cardLabel?: string;
  categoryId: string;
  confidence: number;
  id: string;
  merchant: string;
  needsReview: boolean;
  ownerDisplayName: string | null;
  ownerMemberId: string | null;
  ownerScope: 'member' | 'shared' | 'unknown';
  postedAt: string;
  reviewReason: string | null;
  reviewReasons: string[];
  sourceContextLabel: string;
  sourceLabel: string;
  sourceType: LedgerSourceType;
  statementLabel?: string;
};

export type CoreProductState = {
  asOf: string;
  categories: CoreCategory[];
  notificationPreferences: NotificationPreference[];
  parserProfiles: ParserProfile[];
  sync: SyncHealth;
  transactions: LedgerTransaction[];
  whatsappSource: WhatsAppSourceHealth;
};

export function createMockCoreProductState(): CoreProductState {
  return {
    asOf: '2026-03-27T08:00:00.000Z',
    categories: [
      { id: 'food-dining', name: 'Food & Dining', tone: 'coral' },
      { id: 'groceries', name: 'Groceries', tone: 'mint' },
      { id: 'transport', name: 'Transport', tone: 'blue' },
      { id: 'shopping', name: 'Shopping', tone: 'amber' },
      { id: 'bills-utilities', name: 'Bills & Utilities', tone: 'slate' },
      { id: 'subscriptions', name: 'Subscriptions', tone: 'teal' },
      { id: 'uncategorized', name: 'Uncategorized', tone: 'rose' },
    ],
    notificationPreferences: [
      {
        channel: 'push',
        description: 'Surface parser failures within the household app.',
        enabled: true,
        id: 'push-parse-failures',
        label: 'Parser failures',
      },
      {
        channel: 'email',
        description: 'Send a summary when a statement sync has been blocked for over an hour.',
        enabled: false,
        id: 'email-sync-escalations',
        label: 'Sync escalations',
      },
      {
        channel: 'push',
        description: 'Notify when new rows land with `needs_review` turned on.',
        enabled: true,
        id: 'push-review-queue',
        label: 'Review queue alerts',
      },
    ],
    parserProfiles: [
      {
        id: 'hdfc-regalia-gold',
        issuer: 'HDFC Bank',
        lastUsedAt: '2026-03-26T17:45:00.000Z',
        name: 'Regalia Gold PDF parser',
        status: 'fallback',
        successRate: 92,
      },
      {
        id: 'icici-amazon-pay',
        issuer: 'ICICI Bank',
        lastUsedAt: '2026-03-27T05:20:00.000Z',
        name: 'Amazon Pay statement parser',
        status: 'needs_attention',
        successRate: 71,
      },
      {
        id: 'amex-mrcc',
        issuer: 'American Express',
        lastUsedAt: '2026-03-18T11:30:00.000Z',
        name: 'MRCC PDF parser',
        status: 'active',
        successRate: 97,
      },
    ],
    sync: {
      failureCount: 1,
      lastAttemptAt: '2026-03-27T07:45:00.000Z',
      lastError: 'ICICI statement password lookup failed in the n8n decrypt step.',
      lastSuccessfulSyncAt: '2026-03-27T06:10:00.000Z',
      pendingStatementCount: 1,
      status: 'degraded',
    },
    whatsappSource: {
      approvedParticipantCount: 1,
      failedCaptureCount: 0,
      lastCaptureAt: null,
      reviewCaptureCount: 0,
      status: 'healthy',
    },
    transactions: [
      {
        amount: 12450,
        categoryId: 'shopping',
        confidence: 0.99,
        id: 'txn-001',
        merchant: 'Amazon Marketplace',
        needsReview: false,
        ownerDisplayName: null,
        ownerMemberId: null,
        ownerScope: 'unknown',
        postedAt: '2026-03-24T08:00:00.000Z',
        reviewReason: null,
        reviewReasons: [],
        cardLabel: 'ICICI Amazon Pay',
        sourceContextLabel: 'ICICI Mar 2026',
        sourceLabel: 'ICICI Amazon Pay',
        sourceType: 'credit_card_statement',
        statementLabel: 'ICICI Mar 2026',
      },
      {
        amount: 3200,
        categoryId: 'transport',
        confidence: 0.58,
        id: 'txn-002',
        merchant: 'Uber India',
        needsReview: true,
        ownerDisplayName: null,
        ownerMemberId: null,
        ownerScope: 'unknown',
        postedAt: '2026-03-25T09:30:00.000Z',
        reviewReason: 'Merchant alias confidence is below the transport threshold.',
        reviewReasons: [],
        cardLabel: 'HDFC Regalia Gold',
        sourceContextLabel: 'HDFC Mar 2026',
        sourceLabel: 'HDFC Regalia Gold',
        sourceType: 'credit_card_statement',
        statementLabel: 'HDFC Mar 2026',
      },
      {
        amount: 1899,
        categoryId: 'food-dining',
        confidence: 0.93,
        id: 'txn-003',
        merchant: 'Swiggy',
        needsReview: false,
        ownerDisplayName: null,
        ownerMemberId: null,
        ownerScope: 'unknown',
        postedAt: '2026-03-25T20:15:00.000Z',
        reviewReason: null,
        reviewReasons: [],
        cardLabel: 'Amex MRCC',
        sourceContextLabel: 'Amex Mar 2026',
        sourceLabel: 'Amex MRCC',
        sourceType: 'credit_card_statement',
        statementLabel: 'Amex Mar 2026',
      },
      {
        amount: 879,
        categoryId: 'uncategorized',
        confidence: 0.44,
        id: 'txn-004',
        merchant: 'Google One',
        needsReview: true,
        ownerDisplayName: null,
        ownerMemberId: null,
        ownerScope: 'unknown',
        postedAt: '2026-03-26T13:05:00.000Z',
        reviewReason: 'The parser could not distinguish between subscriptions and utilities.',
        reviewReasons: [],
        cardLabel: 'HDFC Regalia Gold',
        sourceContextLabel: 'HDFC Mar 2026',
        sourceLabel: 'HDFC Regalia Gold',
        sourceType: 'credit_card_statement',
        statementLabel: 'HDFC Mar 2026',
      },
      {
        amount: 5400,
        categoryId: 'groceries',
        confidence: 0.9,
        id: 'txn-005',
        merchant: 'Nature Basket',
        needsReview: false,
        ownerDisplayName: null,
        ownerMemberId: null,
        ownerScope: 'unknown',
        postedAt: '2026-03-26T19:00:00.000Z',
        reviewReason: null,
        reviewReasons: [],
        cardLabel: 'ICICI Amazon Pay',
        sourceContextLabel: 'ICICI Mar 2026',
        sourceLabel: 'ICICI Amazon Pay',
        sourceType: 'credit_card_statement',
        statementLabel: 'ICICI Mar 2026',
      },
      {
        amount: 1299,
        categoryId: 'subscriptions',
        confidence: 0.96,
        id: 'txn-006',
        merchant: 'Spotify',
        needsReview: false,
        ownerDisplayName: null,
        ownerMemberId: null,
        ownerScope: 'unknown',
        postedAt: '2026-03-27T07:20:00.000Z',
        reviewReason: null,
        reviewReasons: [],
        cardLabel: 'Amex MRCC',
        sourceContextLabel: 'Amex Mar 2026',
        sourceLabel: 'Amex MRCC',
        sourceType: 'credit_card_statement',
        statementLabel: 'Amex Mar 2026',
      },
    ],
  };
}

export function getCategoryById(categories: CoreCategory[], categoryId: string) {
  const category = categories.find((currentCategory) => currentCategory.id === categoryId);

  if (!category) {
    throw new Error(`Unknown category: ${categoryId}`);
  }

  return category;
}
