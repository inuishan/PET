import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  createSupabaseWhatsAppIngestRepository,
  handleWhatsAppIngestRequest,
} from '../_shared/whatsapp-review.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const internalAuthToken = Deno.env.get('WHATSAPP_INTERNAL_AUTH_TOKEN') ?? supabaseServiceRoleKey;

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
  handleWhatsAppIngestRequest(request, {
    internalAuthToken,
    repository: createSupabaseWhatsAppIngestRepository(supabase),
  }));
