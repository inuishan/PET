import { z } from 'zod';

export type HouseholdRole = 'owner' | 'member';
export type HouseholdStatus = 'loading' | 'needs_household' | 'ready';

export type HouseholdState = {
  displayName: string | null;
  householdId: string | null;
  householdName: string | null;
  inviteCode: string | null;
  inviteExpiresAt: string | null;
  role: HouseholdRole | null;
  status: HouseholdStatus;
};

type ErrorLike = {
  message: string;
} | null;

type QueryResult<T> = Promise<{
  data: T | null;
  error: ErrorLike;
}>;

type SupabaseQuery = {
  eq: (column: string, value: string) => SupabaseQuery;
  maybeSingle: () => QueryResult<unknown>;
};

export type HouseholdClient = {
  from: (table: 'household_members' | 'households') => {
    select: (columns: string) => SupabaseQuery;
  };
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{
    data: T | null;
    error: ErrorLike;
  }>;
};

const householdNameSchema = z.string().trim().min(1).max(120);
const displayNameSchema = z.string().trim().max(120);
const inviteCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]+/g, '').toUpperCase())
  .pipe(z.string().min(6).max(64));

const membershipRecordSchema = z.object({
  display_name: z.string().nullable().optional(),
  household_id: z.string().uuid(),
  role: z.enum(['owner', 'member']),
});

const householdRecordSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const readyHouseholdStateSchema = z.object({
  displayName: z.string().nullable(),
  householdId: z.string().uuid(),
  householdName: z.string().trim().min(1).max(120),
  inviteCode: z.string().min(6).nullable(),
  inviteExpiresAt: z.string().nullable(),
  role: z.enum(['owner', 'member']),
  status: z.literal('ready'),
});

type ReadyHouseholdState = z.infer<typeof readyHouseholdStateSchema>;

export function createLoadingHouseholdState(): HouseholdState {
  return {
    displayName: null,
    householdId: null,
    householdName: null,
    inviteCode: null,
    inviteExpiresAt: null,
    role: null,
    status: 'loading',
  };
}

export function createNeedsHouseholdState(): HouseholdState {
  return {
    displayName: null,
    householdId: null,
    householdName: null,
    inviteCode: null,
    inviteExpiresAt: null,
    role: null,
    status: 'needs_household',
  };
}

export function normalizeHouseholdName(value: string) {
  return householdNameSchema.parse(value);
}

export function normalizeDisplayName(value: string) {
  const normalizedValue = displayNameSchema.parse(value);
  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function normalizeHouseholdInviteCode(value: string) {
  return inviteCodeSchema.parse(value);
}

export async function loadHouseholdState(
  client: HouseholdClient,
  userId: string
): Promise<HouseholdState> {
  const membershipResponse = await client
    .from('household_members')
    .select('household_id, role, display_name')
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipResponse.error) {
    throw new Error(`Unable to load household membership: ${membershipResponse.error.message}`);
  }

  if (!membershipResponse.data) {
    return createNeedsHouseholdState();
  }

  const membership = membershipRecordSchema.parse(membershipResponse.data);
  const householdResponse = await client
    .from('households')
    .select('name')
    .eq('id', membership.household_id)
    .maybeSingle();

  if (householdResponse.error || !householdResponse.data) {
    throw new Error('Unable to load household details for the signed-in user.');
  }

  const household = householdRecordSchema.parse(householdResponse.data);
  let inviteCode: string | null = null;
  let inviteExpiresAt: string | null = null;

  if (membership.role === 'owner') {
    const inviteState = await ensureHouseholdInvite(client, membership.household_id);
    inviteCode = inviteState.inviteCode;
    inviteExpiresAt = inviteState.inviteExpiresAt;
  }

  return {
    displayName: membership.display_name ?? null,
    householdId: membership.household_id,
    householdName: household.name,
    inviteCode,
    inviteExpiresAt,
    role: membership.role,
    status: 'ready',
  };
}

export async function createHouseholdSetup(
  client: HouseholdClient,
  input: {
    displayName: string;
    householdName: string;
  }
): Promise<ReadyHouseholdState> {
  const response = await client.rpc('create_household_with_owner', {
    household_name: normalizeHouseholdName(input.householdName),
    owner_display_name: normalizeDisplayName(input.displayName),
  });

  if (response.error || !response.data) {
    throw new Error(response.error?.message ?? 'Unable to create the household.');
  }

  return readyHouseholdStateSchema.parse(response.data);
}

export async function ensureHouseholdInvite(client: HouseholdClient, householdId: string) {
  const response = await client.rpc('ensure_household_invite', {
    target_household_id: householdId,
  });

  if (response.error || !response.data) {
    throw new Error(response.error?.message ?? 'Unable to create a household invite.');
  }

  return readyHouseholdStateSchema
    .pick({
      householdId: true,
      inviteCode: true,
      inviteExpiresAt: true,
    })
    .parse(response.data);
}

export async function joinHouseholdSetup(
  client: HouseholdClient,
  input: {
    displayName: string;
    inviteCode: string;
  }
): Promise<ReadyHouseholdState> {
  const response = await client.rpc('join_household_with_invite', {
    invite_code: normalizeHouseholdInviteCode(input.inviteCode),
    member_display_name: normalizeDisplayName(input.displayName),
  });

  if (response.error || !response.data) {
    throw new Error(response.error?.message ?? 'Unable to join the household.');
  }

  return readyHouseholdStateSchema.parse(response.data);
}
