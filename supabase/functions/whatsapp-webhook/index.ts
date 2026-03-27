import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  createHttpWhatsAppParseDispatcher,
  createSupabaseWhatsAppRepository,
  handleWhatsAppWebhookRequest,
} from '../_shared/whatsapp-ingestion.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const verifyToken = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN') ?? '';
const appSecret = Deno.env.get('META_APP_SECRET') ?? '';
const parseFunctionUrl =
  Deno.env.get('WHATSAPP_PARSE_FUNCTION_URL')
  ?? (supabaseUrl ? `${supabaseUrl}/functions/v1/whatsapp-parse` : '');
const parseTimeoutMs = Number(Deno.env.get('WHATSAPP_PARSE_TIMEOUT_MS') ?? '5000');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
const repository = createSupabaseWhatsAppRepository(supabase);
const parseDispatcher = createHttpWhatsAppParseDispatcher({
  fetch,
  serviceRoleKey: supabaseServiceRoleKey,
  timeoutMs: parseTimeoutMs,
  url: parseFunctionUrl,
});

Deno.serve((request) =>
  handleWhatsAppWebhookRequest(request, {
    appSecret,
    parseDispatcher,
    repository,
    scheduleBackgroundTask,
    verifyToken,
  }));

function scheduleBackgroundTask(task: Promise<unknown>) {
  const runtime = globalThis as typeof globalThis & {
    EdgeRuntime?: {
      waitUntil?: (promise: Promise<unknown>) => void;
    };
  };

  if (runtime.EdgeRuntime?.waitUntil) {
    runtime.EdgeRuntime.waitUntil(task);
    return;
  }

  void task;
}
