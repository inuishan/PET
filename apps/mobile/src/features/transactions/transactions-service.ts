import {
  type CategoryTone,
  type CoreCategory,
  type CoreProductState,
  type LedgerTransaction,
} from '@/features/core-product/core-product-state';

type ErrorLike = {
  message: string;
} | null;

type SelectQuery<T> = Promise<{
  data: T[] | null;
  error: ErrorLike;
}> & {
  eq: (column: string, value: string) => SelectQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => SelectQuery<T>;
};

type UnknownRecord = Record<string, unknown>;

type CategoryRow = {
  color_token?: string | null;
  household_id: string | null;
  id: string;
  is_system: boolean;
  name: string;
};

type StatementUploadRow = {
  bank_name?: string | null;
  billing_period_end?: string | null;
  card_name?: string | null;
};

type TransactionMetadata = {
  cardName?: string | null;
  statementLabel?: string | null;
};

type TransactionRow = {
  amount: number;
  category_id: string | null;
  confidence?: number | null;
  id: string;
  merchant_raw: string;
  metadata: TransactionMetadata | null;
  needs_review: boolean;
  posted_at?: string | null;
  review_reason?: string | null;
  statement_uploads?: StatementUploadRow | StatementUploadRow[] | null;
  transaction_date: string;
};

export type TransactionsSnapshot = Pick<CoreProductState, 'categories' | 'transactions'>;

export type TransactionsClient = {
  from: (table: 'categories' | 'transactions') => {
    select: (columns: string) => SelectQuery<unknown>;
  };
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{
    data: T | null;
    error: ErrorLike;
  }>;
};

const categoryToneByColorToken: Record<string, CategoryTone> = {
  amber: 'amber',
  blue: 'blue',
  green: 'mint',
  indigo: 'teal',
  orange: 'coral',
  red: 'rose',
  rose: 'rose',
  sky: 'blue',
  slate: 'slate',
  stone: 'slate',
  violet: 'teal',
};

const monthYearFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

export async function loadTransactionsSnapshot(
  client: TransactionsClient,
  householdId: string
): Promise<TransactionsSnapshot> {
  const [categoriesResponse, transactionsResponse] = await Promise.all([
    client
      .from('categories')
      .select('id, household_id, is_system, name, color_token')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    client
      .from('transactions')
      .select(
        'id, category_id, merchant_raw, amount, transaction_date, posted_at, needs_review, review_reason, confidence, metadata, statement_uploads(card_name, bank_name, billing_period_end)'
      )
      .eq('household_id', householdId)
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  if (categoriesResponse.error) {
    throw new Error(`Unable to load transaction categories: ${categoriesResponse.error.message}`);
  }

  if (transactionsResponse.error) {
    throw new Error(`Unable to load household transactions: ${transactionsResponse.error.message}`);
  }

  const categories = readArray(categoriesResponse.data).map(readCategoryRow).filter((category) => {
    return category.is_system || category.household_id === householdId;
  });
  const uncategorizedCategoryId = categories.find((category) => category.name === 'Uncategorized')?.id;

  return {
    categories: categories.map(mapCategoryRow),
    transactions: readArray(transactionsResponse.data).map((row) =>
      mapTransactionRow(readTransactionRow(row), uncategorizedCategoryId)
    ),
  };
}

export async function saveTransactionCategoryAssignment(
  client: TransactionsClient,
  input: {
    categoryId: string;
    transactionId: string;
  }
) {
  const categoryId = readRequiredString(input.categoryId, 'categoryId');
  const transactionId = readRequiredString(input.transactionId, 'transactionId');
  const response = await client.rpc<{ transactionId?: unknown }>('reassign_transaction_category', {
    next_category_id: categoryId,
    target_transaction_id: transactionId,
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return {
    transactionId: response.data ? readRequiredString(response.data.transactionId, 'transactionId') : transactionId,
  };
}

function mapCategoryRow(category: CategoryRow): CoreCategory {
  return {
    id: category.id,
    name: category.name,
    tone: mapCategoryTone(category.color_token),
  };
}

function mapCategoryTone(colorToken: string | null | undefined): CategoryTone {
  if (!colorToken) {
    return 'slate';
  }

  return categoryToneByColorToken[colorToken] ?? 'slate';
}

function mapTransactionRow(transaction: TransactionRow, uncategorizedCategoryId: string | undefined): LedgerTransaction {
  const statementUpload = normalizeStatementUpload(transaction.statement_uploads);
  const metadata = transaction.metadata ?? {};

  return {
    amount: transaction.amount,
    cardLabel: normalizeLabel(metadata.cardName, statementUpload?.card_name, 'Statement import'),
    categoryId: transaction.category_id ?? requireUncategorizedCategoryId(uncategorizedCategoryId),
    confidence: transaction.confidence ?? 0,
    id: transaction.id,
    merchant: transaction.merchant_raw,
    needsReview: transaction.needs_review,
    postedAt: normalizeIsoDate(transaction.posted_at ?? transaction.transaction_date),
    reviewReason: transaction.review_reason ?? null,
    statementLabel: normalizeLabel(
      metadata.statementLabel,
      formatStatementLabel(statementUpload, transaction.transaction_date),
      'Statement import'
    ),
  };
}

function normalizeStatementUpload(
  statementUpload: TransactionRow['statement_uploads']
): StatementUploadRow | null {
  if (Array.isArray(statementUpload)) {
    return statementUpload[0] ?? null;
  }

  return statementUpload ?? null;
}

function normalizeLabel(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return 'Statement import';
}

function normalizeIsoDate(dateValue: string) {
  return `${dateValue}T08:00:00.000Z`;
}

function formatStatementLabel(statementUpload: StatementUploadRow | null, transactionDate: string) {
  const bankName = statementUpload?.bank_name?.trim();
  const referenceDate = statementUpload?.billing_period_end ?? transactionDate;

  if (!bankName) {
    return null;
  }

  return `${bankName} ${monthYearFormatter.format(new Date(`${referenceDate}T00:00:00.000Z`))}`;
}

function requireUncategorizedCategoryId(uncategorizedCategoryId: string | undefined) {
  if (!uncategorizedCategoryId) {
    throw new Error('Unable to load the default uncategorized category.');
  }

  return uncategorizedCategoryId;
}

function readCategoryRow(input: unknown): CategoryRow {
  const record = readRecord(input);

  return {
    color_token: readOptionalString(record.color_token),
    household_id: readNullableString(record.household_id, 'household_id'),
    id: readRequiredString(record.id, 'id'),
    is_system: readBoolean(record.is_system, 'is_system'),
    name: readRequiredString(record.name, 'name'),
  };
}

function readTransactionRow(input: unknown): TransactionRow {
  const record = readRecord(input);

  return {
    amount: readNumber(record.amount, 'amount'),
    category_id: readNullableString(record.category_id, 'category_id'),
    confidence: readOptionalNumber(record.confidence),
    id: readRequiredString(record.id, 'id'),
    merchant_raw: readRequiredString(record.merchant_raw, 'merchant_raw'),
    metadata: readTransactionMetadata(record.metadata),
    needs_review: readBoolean(record.needs_review, 'needs_review'),
    posted_at: readOptionalString(record.posted_at),
    review_reason: readOptionalString(record.review_reason),
    statement_uploads: readStatementUploads(record.statement_uploads),
    transaction_date: readRequiredString(record.transaction_date, 'transaction_date'),
  };
}

function readTransactionMetadata(input: unknown): TransactionMetadata | null {
  if (input === null || input === undefined) {
    return null;
  }

  const record = readRecord(input);

  return {
    cardName: readOptionalString(record.cardName),
    statementLabel: readOptionalString(record.statementLabel),
  };
}

function readStatementUploads(input: unknown): TransactionRow['statement_uploads'] {
  if (input === null || input === undefined) {
    return null;
  }

  if (Array.isArray(input)) {
    return input.map(readStatementUploadRow);
  }

  return readStatementUploadRow(input);
}

function readStatementUploadRow(input: unknown): StatementUploadRow {
  const record = readRecord(input);

  return {
    bank_name: readOptionalString(record.bank_name),
    billing_period_end: readOptionalString(record.billing_period_end),
    card_name: readOptionalString(record.card_name),
  };
}

function readArray(input: unknown) {
  if (input === null || input === undefined) {
    return [];
  }

  if (!Array.isArray(input)) {
    throw new Error('Expected an array response from Supabase.');
  }

  return input;
}

function readRecord(input: unknown): UnknownRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected a record response from Supabase.');
  }

  return input as UnknownRecord;
}

function readBoolean(input: unknown, field: string) {
  if (typeof input !== 'boolean') {
    throw new Error(`Expected ${field} to be a boolean.`);
  }

  return input;
}

function readNumber(input: unknown, field: string) {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }

  if (typeof input === 'string' && input.trim().length > 0) {
    const value = Number(input);

    if (Number.isFinite(value)) {
      return value;
    }
  }

  throw new Error(`Expected ${field} to be numeric.`);
}

function readOptionalNumber(input: unknown) {
  if (input === null || input === undefined) {
    return null;
  }

  return readNumber(input, 'confidence');
}

function readRequiredString(input: unknown, field: string) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new Error(`Expected ${field} to be a non-empty string.`);
  }

  return input.trim();
}

function readOptionalString(input: unknown) {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input !== 'string') {
    throw new Error('Expected an optional string value.');
  }

  return input.trim().length > 0 ? input.trim() : null;
}

function readNullableString(input: unknown, field: string) {
  if (input === null || input === undefined) {
    return null;
  }

  return readRequiredString(input, field);
}
