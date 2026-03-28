import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  createHttpWhatsAppIngestDispatcher,
  createSupabaseWhatsAppParseRepository,
  handleWhatsAppParseRequest,
} from '../_shared/whatsapp-parser.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const internalAuthToken = Deno.env.get('WHATSAPP_INTERNAL_AUTH_TOKEN') ?? '';
const ingestFunctionUrl =
  Deno.env.get('WHATSAPP_INGEST_FUNCTION_URL')
  ?? (supabaseUrl ? `${supabaseUrl}/functions/v1/whatsapp-ingest` : '');
const ingestTimeoutMs = Number(Deno.env.get('WHATSAPP_INGEST_TIMEOUT_MS') ?? '5000');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
const repository = createSupabaseWhatsAppParseRepository(supabase);
const ingestDispatcher = createHttpWhatsAppIngestDispatcher({
  authToken: internalAuthToken,
  fetch,
  timeoutMs: ingestTimeoutMs,
  url: ingestFunctionUrl,
});

Deno.serve((request) =>
  handleWhatsAppParseRequest(request, {
    ingestDispatcher,
    internalAuthToken,
    repository,
  }));
