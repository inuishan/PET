import type {
  HouseholdMember,
  ParseExpenseMessageInput,
  ParsedWhatsAppExpense,
} from './whatsapp-types.ts';

const AUTO_POST_CONFIDENCE_THRESHOLD = 0.85;

type ExtractedAmount = {
  amount: number;
  confidence: number;
  source: 'fallback' | 'pattern';
};

const MONTH_INDEX = new Map([
  ['jan', 0],
  ['feb', 1],
  ['mar', 2],
  ['apr', 3],
  ['may', 4],
  ['jun', 5],
  ['jul', 6],
  ['aug', 7],
  ['sep', 8],
  ['oct', 9],
  ['nov', 10],
  ['dec', 11],
]);

export function parseWhatsAppExpenseMessage(input: ParseExpenseMessageInput): ParsedWhatsAppExpense {
  const text = normalizeOptionalString(input.normalizedMessageText) ?? '';
  const validationErrors: string[] = [];
  const reviewReasons: string[] = [];
  const amountMatch = extractAmount(text);
  const amount = amountMatch ? amountMatch.amount : null;

  if (amount === null) {
    validationErrors.push('missing_amount');
  }

  if (amountMatch?.source === 'fallback') {
    reviewReasons.push('amount_ambiguous');
  }

  const merchantRaw = amount === null ? null : extractMerchant(text) ?? 'Unknown Merchant';

  if (merchantRaw === 'Unknown Merchant') {
    reviewReasons.push('missing_merchant');
  }

  const owner = resolveOwnerAttribution(text, input.participant, input.householdMembers ?? []);
  const transactionDate = resolveTransactionDate(text, input.providerSentAt);
  const note = extractNote(text);
  const confidence = validationErrors.length > 0
    ? 0
    : calculateConfidence({
      amountConfidence: amountMatch?.confidence ?? 0,
      hasKnownMerchant: merchantRaw !== 'Unknown Merchant',
      hasNote: Boolean(note),
      hasProviderDate: Boolean(input.providerSentAt),
      owner,
      text,
    });

  reviewReasons.push(...owner.reviewReasons);

  if (validationErrors.length === 0 && confidence < AUTO_POST_CONFIDENCE_THRESHOLD) {
    reviewReasons.push('low_confidence');
  }

  return {
    amount,
    confidence,
    currency: 'INR',
    householdId: input.householdId,
    merchantNormalized: merchantRaw ? normalizeMerchantName(merchantRaw) : null,
    merchantRaw,
    messageId: input.id,
    note,
    ownerMemberId: owner.ownerMemberId,
    ownerScope: owner.ownerScope,
    parseStatus: validationErrors.length > 0
      ? 'failed'
      : reviewReasons.length > 0
      ? 'needs_review'
      : 'parsed',
    participantId: input.participant.id,
    providerMessageId: input.providerMessageId,
    reviewReasons: uniqueValues(reviewReasons),
    transactionDate,
    validationErrors,
  };
}

function calculateConfidence(input: {
  amountConfidence: number;
  hasKnownMerchant: boolean;
  hasNote: boolean;
  hasProviderDate: boolean;
  owner: {
    explicitOwner: boolean;
    ownerScope: 'member' | 'shared' | 'unknown';
    reviewReasons: string[];
  };
  text: string;
}) {
  let score = 0.42;

  score += input.amountConfidence;
  score += input.hasKnownMerchant ? 0.18 : 0;
  score += input.hasNote ? 0.04 : 0;
  score += input.hasProviderDate ? 0.03 : 0;
  score += input.owner.ownerScope === 'unknown'
    ? 0
    : input.owner.ownerScope === 'shared'
    ? 0.12
    : input.owner.explicitOwner
    ? 0.12
    : 0.08;

  if (/\byesterday\b|\btoday\b|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/i.test(input.text)) {
    score += 0.04;
  }

  if (input.owner.reviewReasons.includes('owner_conflict')) {
    score -= 0.22;
  }

  if (input.owner.reviewReasons.includes('owner_unknown')) {
    score -= 0.18;
  }

  return clampConfidence(score);
}

function clampConfidence(value: number) {
  return Number(Math.max(0, Math.min(0.99, value)).toFixed(3));
}

function extractAmount(text: string): ExtractedAmount | null {
  const patterns = [
    {
      confidence: 0.22,
      expression: /(?:₹|\binr\b|\brs\.?\b)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    },
    {
      confidence: 0.19,
      expression: /\b(?:paid|spent|sent|gave)\s+([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.expression);

    if (match?.[1]) {
      return {
        amount: toAmount(match[1]),
        confidence: pattern.confidence,
        source: 'pattern',
      };
    }
  }

  const numericMatches = [...text.matchAll(/\b([0-9][0-9,]*(?:\.\d{1,2})?)\b/g)]
    .filter((match) => !isDateAdjacent(text, match.index ?? -1, match[1].length))
    .map((match) => toAmount(match[1]))
    .filter((value): value is number => Number.isFinite(value))
    .filter((value) => value > 0);

  if (numericMatches.length === 0) {
    return null;
  }

  return {
    amount: numericMatches[0],
    confidence: 0.04,
    source: 'fallback',
  };
}

function extractMerchant(text: string) {
  const patterns = [
    /\b(?:paid|spent|sent|gave)(?:\s+(?:₹|\binr\b|\brs\.?\b))?\s*[0-9][0-9,]*(?:\.\d{1,2})?\s+(?:to|at)\s+(.+)/i,
    /\b(?:to|at)\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = cleanMerchantCandidate(match?.[1] ?? null);

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function cleanMerchantCandidate(value: string | null) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return null;
  }

  const [merchant] = normalized.split(
    /\b(?:for|on|yesterday|today|shared|split|both|we|paid by|from)\b/i,
    1,
  );
  const cleaned = merchant
    .replace(/^[^a-z0-9]+/i, '')
    .replace(/[^a-z0-9&.' -]+$/i, '')
    .trim();

  return cleaned.length > 0 ? toDisplayName(cleaned) : null;
}

function extractNote(text: string) {
  const match = text.match(/\bfor\s+(.+)/i);
  const normalized = normalizeOptionalString(match?.[1] ?? null);

  if (!normalized) {
    return null;
  }

  const [note] = normalized.split(/\b(?:on|yesterday|today|shared|split|both|we)\b/i, 1);
  const cleaned = note.trim();

  return cleaned.length > 0 ? cleaned : null;
}

function resolveOwnerAttribution(
  text: string,
  participant: ParseExpenseMessageInput['participant'],
  householdMembers: HouseholdMember[],
) {
  const loweredText = text.toLowerCase();
  const otherMember = householdMembers.find((member) => member.id !== participant.memberId) ?? null;

  if (/\b(shared|split|both|we|joint|household)\b/i.test(loweredText)) {
    return {
      explicitOwner: true,
      ownerMemberId: null,
      ownerScope: 'shared' as const,
      reviewReasons: [],
    };
  }

  const explicitMember = resolveExplicitMember(text, participant, householdMembers, otherMember);

  if (explicitMember) {
    const reviewReasons = participant.memberId && explicitMember.id !== participant.memberId
      ? ['owner_conflict']
      : [];

    return {
      explicitOwner: true,
      ownerMemberId: explicitMember.id,
      ownerScope: 'member' as const,
      reviewReasons,
    };
  }

  if (participant.memberId) {
    return {
      explicitOwner: false,
      ownerMemberId: participant.memberId,
      ownerScope: 'member' as const,
      reviewReasons: [],
    };
  }

  return {
    explicitOwner: false,
    ownerMemberId: null,
    ownerScope: 'unknown' as const,
    reviewReasons: ['owner_unknown'],
  };
}

function resolveExplicitMember(
  text: string,
  participant: ParseExpenseMessageInput['participant'],
  householdMembers: HouseholdMember[],
  otherMember: HouseholdMember | null,
) {
  for (const member of householdMembers) {
    const aliases = buildMemberAliases(member, participant, otherMember);

    if (aliases.some((alias) => mentionsAliasAsPayer(text, alias))) {
      return member;
    }
  }

  return null;
}

function buildMemberAliases(
  member: HouseholdMember,
  participant: ParseExpenseMessageInput['participant'],
  otherMember: HouseholdMember | null,
) {
  const aliases = new Set<string>();
  const displayName = normalizeOptionalString(member.displayName)?.toLowerCase();

  if (displayName) {
    aliases.add(displayName);

    for (const part of displayName.split(/\s+/)) {
      if (part.length >= 3) {
        aliases.add(part);
      }
    }
  }

  if (member.id === participant.memberId) {
    aliases.add('i');
    aliases.add('me');
    aliases.add('my');
  } else if (otherMember && member.id === otherMember.id) {
    aliases.add('wife');
    aliases.add('husband');
    aliases.add('spouse');
    aliases.add('partner');
  }

  return [...aliases];
}

function mentionsAliasAsPayer(text: string, alias: string) {
  if (alias.length === 1) {
    return new RegExp(`\\b${escapeRegex(alias)}\\s+paid\\b`, 'i').test(text);
  }

  const patterns = [
    new RegExp(`\\b${escapeRegex(alias)}\\s+(?:paid|spent|sent|gave)\\b`, 'i'),
    new RegExp(`\\b(?:paid|spent|sent|gave)\\s+by\\s+${escapeRegex(alias)}\\b`, 'i'),
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function resolveTransactionDate(text: string, providerSentAt?: string | null) {
  const baseDate = normalizeProviderDate(providerSentAt);
  const loweredText = text.toLowerCase();

  if (loweredText.includes('yesterday') && baseDate) {
    return shiftDate(baseDate, -1);
  }

  if (loweredText.includes('today') && baseDate) {
    return baseDate;
  }

  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1]) {
    return isoMatch[1];
  }

  const slashMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slashMatch) {
    const year = slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3];
    return `${year.padStart(4, '0')}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`;
  }

  const monthMatch = text.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i);
  if (monthMatch) {
    const year = baseDate?.slice(0, 4) ?? String(new Date().getUTCFullYear());
    const monthIndex = MONTH_INDEX.get(monthMatch[2].slice(0, 3).toLowerCase()) ?? 0;

    return [
      year,
      String(monthIndex + 1).padStart(2, '0'),
      monthMatch[1].padStart(2, '0'),
    ].join('-');
  }

  return baseDate ?? new Date().toISOString().slice(0, 10);
}

function normalizeProviderDate(providerSentAt?: string | null) {
  const normalized = normalizeOptionalString(providerSentAt);

  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function shiftDate(dateText: string, days: number) {
  const parsed = new Date(`${dateText}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeMerchantName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ');
}

function toAmount(value: string) {
  const numericValue = Number(value.replace(/,/g, ''));
  return Number.isFinite(numericValue) ? Number(numericValue.toFixed(2)) : null;
}

function toDisplayName(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDateAdjacent(text: string, startIndex: number, length: number) {
  if (startIndex < 0) {
    return false;
  }

  const previousChar = text[startIndex - 1] ?? '';
  const nextChar = text[startIndex + length] ?? '';

  return previousChar === '/' || previousChar === '-' || nextChar === '/' || nextChar === '-';
}
