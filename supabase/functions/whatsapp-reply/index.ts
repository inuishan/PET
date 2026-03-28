import {
  createMetaWhatsAppReplyClient,
  handleWhatsAppReplyRequest,
} from '../_shared/whatsapp-reply.ts';

const internalAuthToken =
  Deno.env.get('WHATSAPP_INTERNAL_AUTH_TOKEN')
  ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  ?? '';
const acknowledgementsEnabled = parseBoolean(Deno.env.get('WHATSAPP_ACK_ENABLED') ?? '');
const graphApiBaseUrl = Deno.env.get('META_GRAPH_API_BASE_URL') ?? 'https://graph.facebook.com/v23.0';
const replyWindowMs = Number(
  Deno.env.get('WHATSAPP_ACK_REPLY_WINDOW_MS') ?? String(24 * 60 * 60 * 1000),
);
const accessToken = Deno.env.get('META_WHATSAPP_ACCESS_TOKEN') ?? '';

const replyClient = createMetaWhatsAppReplyClient({
  accessToken,
  apiBaseUrl: graphApiBaseUrl,
  fetch,
});

Deno.serve((request) =>
  handleWhatsAppReplyRequest(request, {
    acknowledgementsEnabled,
    internalAuthToken,
    replyClient,
    replyWindowMs,
  }));

function parseBoolean(value: string) {
  return /^(1|true|yes|on)$/i.test(value.trim());
}
