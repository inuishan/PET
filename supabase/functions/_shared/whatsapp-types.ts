export type HouseholdMember = {
  displayName?: string | null;
  id: string;
};

export type LoadedMessageForParsing = {
  householdId: string;
  id: string;
  normalizedMessageText: string;
  parseMetadata?: Record<string, unknown>;
  participant: {
    displayName?: string | null;
    id: string;
    memberId?: string | null;
    phoneE164: string;
  };
  providerMessageId: string;
  providerSentAt?: string | null;
};

export type ParsedWhatsAppExpense = {
  amount: number | null;
  confidence: number;
  currency: 'INR';
  existingParseMetadata?: Record<string, unknown>;
  householdId: string;
  merchantNormalized: string | null;
  merchantRaw: string | null;
  messageId: string;
  note: string | null;
  ownerMemberId: string | null;
  ownerScope: 'member' | 'shared' | 'unknown';
  parseStatus: 'failed' | 'needs_review' | 'parsed';
  participantId: string;
  participantPhoneE164: string | null;
  providerMessageId: string;
  providerSentAt: string | null;
  reviewReasons: string[];
  transactionDate: string;
  validationErrors: string[];
};

export type WhatsAppReplyDispatchInput = {
  amount: number | null;
  currency: 'INR';
  merchantRaw: string | null;
  outcome: 'failed' | 'needs_review' | 'posted';
  phoneNumberId: string;
  providerMessageId: string;
  providerSentAt: string | null;
  recipientPhoneE164: string;
};

export type ParseExpenseMessageInput = {
  householdId: string;
  householdMembers?: HouseholdMember[];
  id: string;
  normalizedMessageText: string;
  participant: LoadedMessageForParsing['participant'];
  providerMessageId: string;
  providerSentAt?: string | null;
};

export type ParseHandoff = {
  householdId: string;
  messageId: string;
  participantId: string;
  providerMessageId: string;
};

export type WhatsAppParseRepository = {
  listHouseholdMembers: (householdId: string) => Promise<HouseholdMember[]>;
  loadMessageForParsing: (input: {
    householdId: string;
    messageId: string;
    participantId: string;
  }) => Promise<LoadedMessageForParsing | null>;
};

export type ClassificationResult = {
  categoryId: string | null;
  confidence: number | null;
  method: 'inherited' | 'llm' | 'manual' | 'rules';
  rationale: string;
};

export type NotificationRecipient = {
  userId: string;
};

export type TransactionInsert = {
  amount: number;
  classificationMethod: 'inherited' | 'llm' | 'manual' | 'rules';
  confidence: number;
  currency: string;
  fingerprint: string;
  householdId: string;
  merchantNormalized: string;
  merchantRaw: string;
  metadata: Record<string, unknown>;
  needsReview: boolean;
  ownerMemberId: string | null;
  ownerScope: 'member' | 'shared' | 'unknown';
  postedAt: string;
  reviewReason: string | null;
  sourceReference: string;
  sourceType: 'upi_whatsapp';
  status: 'needs_review' | 'processed';
  transactionDate: string;
  description?: string | null;
  categoryId?: string | null;
};

export type WhatsAppIngestRepository = {
  classifyParsedTransaction: (input: ParsedWhatsAppExpense) => Promise<ClassificationResult>;
  createClassificationEvent: (event: {
    confidence: number | null;
    householdId: string;
    metadata: Record<string, unknown>;
    method: ClassificationResult['method'];
    nextCategoryId: string | null;
    previousCategoryId: string | null;
    rationale: string;
    transactionId: string;
  }) => Promise<void>;
  createNotification: (notification: {
    body: string;
    channel: 'push';
    householdId: string;
    notificationType: string;
    payload: Record<string, unknown>;
    recipientUserId: string;
    relatedTransactionId?: string | null;
    title: string;
  }) => Promise<void>;
  createTransaction: (transaction: TransactionInsert) => Promise<{ id: string }>;
  getExistingMessageOutcome?: (input: {
    householdId: string;
    messageId: string;
  }) => Promise<{
    parseStatus: 'failed' | 'needs_review' | 'posted';
    transactionId: string | null;
  } | null>;
  listHouseholdRecipients: (householdId: string) => Promise<NotificationRecipient[]>;
  updateMessageOutcome: (update: {
    householdId: string;
    messageId: string;
    parseMetadata: Record<string, unknown>;
    parseStatus: 'failed' | 'needs_review' | 'posted';
    transactionId: string | null;
  }) => Promise<void>;
};
