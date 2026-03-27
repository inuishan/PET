import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  createSupabaseStatementRepository,
  handleStatementIngestRequest,
} from '../_shared/statement-ingest.mjs';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const pipelineSecret = Deno.env.get('STATEMENT_PIPELINE_SHARED_SECRET') ?? '';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

Deno.serve((request) =>
  handleStatementIngestRequest(request, {
    webhookSecret: pipelineSecret,
    repository: createSupabaseStatementRepository(supabase),
  }));
