import type {
  ClassificationResult,
  ParsedWhatsAppExpense,
  WhatsAppIngestRepository,
} from './whatsapp-types.ts';

export function createSupabaseWhatsAppIngestRepository(supabase: {
  from: (table: string) => any;
}): WhatsAppIngestRepository {
  return {
    async classifyParsedTransaction(input) {
      const aliasResult = await supabase
        .from('merchant_aliases')
        .select('category_id,confidence')
        .eq('household_id', input.householdId)
        .eq('normalized_merchant_name', input.merchantNormalized ?? '')
        .maybeSingle();

      if (aliasResult.error) {
        throw new Error(`Failed to load merchant aliases: ${aliasResult.error.message}`);
      }

      if (aliasResult.data?.category_id) {
        return {
          categoryId: aliasResult.data.category_id,
          confidence: aliasResult.data.confidence ?? input.confidence,
          method: 'inherited',
          rationale: 'merchant_alias_match',
        };
      }

      return classifyWithSystemCategories(supabase, input);
    },

    async createClassificationEvent(event) {
      const { error } = await supabase
        .from('classification_events')
        .insert({
          confidence: event.confidence,
          household_id: event.householdId,
          metadata: event.metadata,
          method: event.method,
          next_category_id: event.nextCategoryId,
          previous_category_id: event.previousCategoryId,
          rationale: event.rationale,
          transaction_id: event.transactionId,
        });

      if (error) {
        throw new Error(`Failed to create classification event: ${error.message}`);
      }
    },

    async createNotification(notification) {
      const { error } = await supabase
        .from('notifications')
        .insert({
          body: notification.body,
          channel: notification.channel,
          household_id: notification.householdId,
          notification_type: notification.notificationType,
          payload: notification.payload,
          recipient_user_id: notification.recipientUserId,
          related_transaction_id: notification.relatedTransactionId ?? null,
          title: notification.title,
        });

      if (error) {
        throw new Error(`Failed to create notification: ${error.message}`);
      }
    },

    async createTransaction(transaction) {
      const insertResult = await supabase
        .from('transactions')
        .insert({
          amount: transaction.amount,
          category_id: transaction.categoryId ?? null,
          classification_method: transaction.classificationMethod,
          confidence: transaction.confidence,
          currency: transaction.currency,
          description: transaction.description ?? null,
          fingerprint: transaction.fingerprint,
          household_id: transaction.householdId,
          merchant_normalized: transaction.merchantNormalized,
          merchant_raw: transaction.merchantRaw,
          metadata: transaction.metadata,
          needs_review: transaction.needsReview,
          owner_member_id: transaction.ownerMemberId,
          owner_scope: transaction.ownerScope,
          posted_at: transaction.postedAt,
          review_reason: transaction.reviewReason,
          source_reference: transaction.sourceReference,
          source_type: transaction.sourceType,
          status: transaction.status,
          transaction_date: transaction.transactionDate,
        })
        .select('id')
        .single();

      if (!insertResult.error && insertResult.data) {
        return {
          id: insertResult.data.id,
        };
      }

      if (!isDuplicateError(insertResult.error)) {
        throw new Error(`Failed to create transaction: ${insertResult.error?.message ?? 'unknown error'}`);
      }

      const existingTransactionResult = await supabase
        .from('transactions')
        .select('id')
        .eq('household_id', transaction.householdId)
        .eq('fingerprint', transaction.fingerprint)
        .maybeSingle();

      if (existingTransactionResult.error || !existingTransactionResult.data) {
        throw new Error(
          `Failed to load duplicate transaction: ${existingTransactionResult.error?.message ?? 'not found'}`,
        );
      }

      return {
        id: existingTransactionResult.data.id,
      };
    },

    async getExistingMessageOutcome(input) {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('parse_status,transaction_id')
        .eq('id', input.messageId)
        .eq('household_id', input.householdId)
        .maybeSingle();

      if (error) {
        throw new Error(`Failed to load WhatsApp message outcome: ${error.message}`);
      }

      if (!data) {
        return null;
      }

      if (data.parse_status !== 'posted' && data.parse_status !== 'needs_review' && data.parse_status !== 'failed') {
        return null;
      }

      return {
        parseStatus: data.parse_status,
        transactionId: data.transaction_id,
      };
    },

    async listHouseholdRecipients(householdId) {
      const { data, error } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('household_id', householdId);

      if (error) {
        throw new Error(`Failed to load household recipients: ${error.message}`);
      }

      return (data ?? []).map((recipient: any) => ({
        userId: recipient.user_id,
      }));
    },

    async updateMessageOutcome(update) {
      const { error } = await supabase
        .from('whatsapp_messages')
        .update({
          parse_metadata: update.parseMetadata,
          parse_status: update.parseStatus,
          transaction_id: update.transactionId,
        })
        .eq('id', update.messageId)
        .eq('household_id', update.householdId);

      if (error) {
        throw new Error(`Failed to update WhatsApp message outcome: ${error.message}`);
      }
    },
  };
}

async function classifyWithSystemCategories(
  supabase: { from: (table: string) => any },
  input: ParsedWhatsAppExpense,
): Promise<ClassificationResult> {
  const categoryName = resolveSystemCategoryName(input.merchantNormalized ?? input.merchantRaw ?? '');
  const categoriesResult = await supabase
    .from('categories')
    .select('id,name')
    .is('household_id', null)
    .in('name', uniqueValues([categoryName, 'Uncategorized']));

  if (categoriesResult.error) {
    throw new Error(`Failed to load categories: ${categoriesResult.error.message}`);
  }

  const matchedCategory = (categoriesResult.data ?? []).find((category: any) => category.name === categoryName)
    ?? (categoriesResult.data ?? []).find((category: any) => category.name === 'Uncategorized')
    ?? null;

  return {
    categoryId: matchedCategory?.id ?? null,
    confidence: matchedCategory?.name === 'Uncategorized' ? 0.5 : 0.88,
    method: 'rules',
    rationale: matchedCategory?.name === 'Uncategorized'
      ? 'uncategorized_default'
      : 'merchant_keyword_match',
  };
}

function resolveSystemCategoryName(merchant: string) {
  const normalized = normalizeMerchantName(merchant);

  if (/(zepto|blinkit|instamart|bigbasket|dmart|grofers)/.test(normalized)) {
    return 'Groceries';
  }

  if (/(swiggy|zomato|eats|restaurant|cafe)/.test(normalized)) {
    return 'Food & Dining';
  }

  if (/(uber|ola|rapido|metro|taxi|fuel|petrol)/.test(normalized)) {
    return 'Transport';
  }

  return 'Uncategorized';
}

function normalizeMerchantName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ');
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isDuplicateError(error: { code?: string | null; message?: string | null } | null | undefined) {
  if (!error) {
    return false;
  }

  return error.code === '23505' || /duplicate|unique/i.test(error.message ?? '');
}
