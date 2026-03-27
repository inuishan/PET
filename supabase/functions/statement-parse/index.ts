import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  createFcmPushProvider,
  createGoogleServiceAccountAccessTokenProvider,
  createNoopPhase1AlertService,
  createPhase1AlertService,
  createSupabaseNotificationRepository,
  parseAlertChannels,
} from '../_shared/phase-1-alerts.mjs';
import { handleStatementParseRequest } from '../_shared/statement-parse.mjs';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const pipelineSecret = Deno.env.get('STATEMENT_PIPELINE_SHARED_SECRET') ?? '';
const aiGatewayApiKey =
  Deno.env.get('VERCEL_AI_GATEWAY_API_KEY')
  ?? Deno.env.get('AI_GATEWAY_API_KEY')
  ?? '';
const aiGatewayUrl = Deno.env.get('STATEMENT_PARSE_GATEWAY_URL') ?? undefined;
const model = Deno.env.get('STATEMENT_PARSE_MODEL') ?? 'openai/gpt-5-mini';
const timeoutMs = Number(Deno.env.get('STATEMENT_PARSE_TIMEOUT_MS') ?? '30000');
const alertChannels = parseAlertChannels(Deno.env.get('PHASE1_ALERT_CHANNELS') ?? 'push');
const alertTopicPrefix = Deno.env.get('PHASE1_ALERT_PUSH_TOPIC_PREFIX') ?? 'phase1-user';
const fcmProjectId = Deno.env.get('PHASE1_ALERT_FCM_PROJECT_ID') ?? '';
const fcmServiceAccountJson = Deno.env.get('PHASE1_ALERT_FCM_SERVICE_ACCOUNT_JSON') ?? '';
const alertTimeoutMs = Number(Deno.env.get('PHASE1_ALERT_TIMEOUT_MS') ?? '5000');
const supabase = createSupabaseClient();
const alerts = createAlerts();

Deno.serve((request) =>
  handleStatementParseRequest(request, {
    alerts,
    pipelineSecret,
    aiGatewayApiKey,
    aiGatewayUrl,
    model,
    timeoutMs,
    fetch,
    scheduleBackgroundTask,
  }));

function createSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createAlerts() {
  if (!supabase) {
    return createNoopPhase1AlertService();
  }

  const parsedServiceAccount = parseServiceAccount(fcmServiceAccountJson);

  return createPhase1AlertService({
    defaultChannels: alertChannels,
    pushProvider: fcmProjectId && parsedServiceAccount
      ? createFcmPushProvider({
        fetch,
        getAccessToken: createGoogleServiceAccountAccessTokenProvider({
          fetch,
          serviceAccount: parsedServiceAccount,
          timeoutMs: alertTimeoutMs,
        }),
        projectId: fcmProjectId,
        timeoutMs: alertTimeoutMs,
      })
      : null,
    pushTopicPrefix: alertTopicPrefix,
    repository: createSupabaseNotificationRepository(supabase),
  });
}

function parseServiceAccount(rawServiceAccount: string) {
  if (!rawServiceAccount) {
    return null;
  }

  try {
    return JSON.parse(rawServiceAccount);
  } catch (error) {
    console.error('phase-1 push alerts are disabled because PHASE1_ALERT_FCM_SERVICE_ACCOUNT_JSON is invalid', error);
    return null;
  }
}

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
