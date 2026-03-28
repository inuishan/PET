import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  createHttpWhatsAppReplyDispatcher,
  createSupabaseWhatsAppIngestRepository,
  handleWhatsAppIngestRequest,
} from '../_shared/whatsapp-review.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const internalAuthToken = Deno.env.get('WHATSAPP_INTERNAL_AUTH_TOKEN') ?? '';
const acknowledgementsEnabled = parseBoolean(Deno.env.get('WHATSAPP_ACK_ENABLED') ?? '');
const replyFunctionUrl =
  Deno.env.get('WHATSAPP_REPLY_FUNCTION_URL')
  ?? (supabaseUrl ? `${supabaseUrl}/functions/v1/whatsapp-reply` : '');
const replyTimeoutMs = Number(Deno.env.get('WHATSAPP_REPLY_TIMEOUT_MS') ?? '5000');

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
const replyDispatcher = createHttpWhatsAppReplyDispatcher({
  authToken: internalAuthToken,
  fetch,
  timeoutMs: replyTimeoutMs,
  url: acknowledgementsEnabled ? replyFunctionUrl : undefined,
});

Deno.serve((request) =>
  handleWhatsAppIngestRequest(request, {
    acknowledgementsEnabled,
    internalAuthToken,
    repository: createSupabaseWhatsAppIngestRepository(supabase),
    replyDispatcher,
    scheduleBackgroundTask,
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

function parseBoolean(value: string) {
  return /^(1|true|yes|on)$/i.test(value.trim());
}
