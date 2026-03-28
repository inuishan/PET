import { z } from 'zod';

const publicEnvSchema = z.object({
  EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX: z.string().min(1),
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = {
  phase1AlertPushTopicPrefix: string;
  supabaseAnonKey: string;
  supabaseUrl: string;
};

export function parsePublicEnv(input: Record<string, string | undefined>): PublicEnv {
  const parsed = publicEnvSchema.safeParse(input);

  if (!parsed.success) {
    const missingKeys = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid public environment configuration: ${missingKeys}`);
  }

  return {
    phase1AlertPushTopicPrefix: parsed.data.EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX,
    supabaseAnonKey: parsed.data.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    supabaseUrl: parsed.data.EXPO_PUBLIC_SUPABASE_URL,
  };
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX: process.env.EXPO_PUBLIC_PHASE1_ALERT_PUSH_TOPIC_PREFIX,
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });
}
