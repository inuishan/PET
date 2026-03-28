import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  createSupabaseAnalyticsGenerationRepository,
  handleAnalyticsGenerateRequest,
} from '../_shared/analytics-generate.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const pipelineSecret = Deno.env.get('ANALYTICS_PIPELINE_SHARED_SECRET') ?? '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

Deno.serve((request) =>
  handleAnalyticsGenerateRequest(request, {
    repository: createSupabaseAnalyticsGenerationRepository(supabase),
    webhookSecret: pipelineSecret,
  }));
