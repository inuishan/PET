import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAppSessionFromAuthSession,
  startGoogleOAuthSignIn,
} from '../../apps/mobile/src/features/auth/auth-service.ts';
import { getDefaultAuthenticatedHref } from '../../apps/mobile/src/features/auth/auth-routing.ts';
import {
  createHouseholdSetup,
  createNeedsHouseholdState,
  joinHouseholdSetup,
  loadHouseholdState,
} from '../../apps/mobile/src/features/household/household-session.ts';

const ownerUserId = '6d89bfa7-ec67-4ed7-b72f-4aa1fcd0e6e9';
const householdId = '9f0e1cdb-31b6-44e2-a56e-0dd8303ff2b8';

test('Phase 1 sign-in can restore an owner into a tabs-ready household session', async () => {
  const session = await buildAppSessionFromAuthSession(
    {
      user: {
        email: 'ishan@example.com',
        id: ownerUserId,
      },
    },
    (userId) =>
      loadHouseholdState(createHouseholdClient({
        householdName: 'Sharma Household',
        inviteCode: 'AB12CD34EF56',
        role: 'owner',
        userId,
      }), userId),
  );

  assert.deepEqual(session.household, {
    displayName: 'Ishan',
    householdId,
    householdName: 'Sharma Household',
    inviteCode: 'AB12CD34EF56',
    inviteExpiresAt: '2026-04-03T10:00:00.000Z',
    role: 'owner',
    status: 'ready',
  });
  assert.equal(
    getDefaultAuthenticatedHref({
      authStatus: session.status,
      householdStatus: session.household.status,
    }),
    '/(tabs)',
  );
});

test('Phase 1 sign-in and onboarding normalize owner creation and member joins', async () => {
  const signInResult = await startGoogleOAuthSignIn({
    createRedirectUrl: () => 'mobile://auth/callback',
    exchangeCodeForSession: async (code) => {
      assert.equal(code, 'pkce-code');
      return { error: null };
    },
    openAuthSession: async (startUrl, returnUrl) => {
      assert.equal(startUrl, 'https://supabase.example.com/auth?provider=google');
      assert.equal(returnUrl, 'mobile://auth/callback');
      return {
        type: 'success',
        url: 'mobile://auth/callback?code=pkce-code',
      };
    },
    signInWithOAuth: async (input) => {
      assert.equal(input.provider, 'google');
      return {
        data: {
          url: 'https://supabase.example.com/auth?provider=google',
        },
        error: null,
      };
    },
  });

  const signedInWithoutHousehold = await buildAppSessionFromAuthSession(
    {
      user: {
        email: 'spouse@example.com',
        id: '8a79dd7f-9170-4d93-98b6-3e9d8330c5b1',
      },
    },
    async () => createNeedsHouseholdState(),
  );

  const ownerHousehold = await createHouseholdSetup(createOwnerOnboardingClient(), {
    displayName: ' Ishan ',
    householdName: ' Sharma Household ',
  });
  const memberHousehold = await joinHouseholdSetup(createMemberOnboardingClient(), {
    displayName: ' Spouse ',
    inviteCode: ' ab12-cd34-ef56 ',
  });

  assert.deepEqual(signInResult, { ok: true });
  assert.equal(signedInWithoutHousehold.household.status, 'needs_household');
  assert.equal(
    getDefaultAuthenticatedHref({
      authStatus: signedInWithoutHousehold.status,
      householdStatus: signedInWithoutHousehold.household.status,
    }),
    '/(onboarding)/household',
  );
  assert.equal(ownerHousehold.householdName, 'Sharma Household');
  assert.equal(ownerHousehold.role, 'owner');
  assert.equal(memberHousehold.role, 'member');
  assert.equal(memberHousehold.householdName, 'Sharma Household');
});

test('Phase 1 shared household access resolves the same workspace for both signed-in users', async () => {
  const ownerHousehold = await createHouseholdSetup(createOwnerOnboardingClient(), {
    displayName: ' Ishan ',
    householdName: ' Sharma Household ',
  });
  const memberHousehold = await joinHouseholdSetup(createMemberOnboardingClient(), {
    displayName: ' Spouse ',
    inviteCode: ' ab12-cd34-ef56 ',
  });
  const ownerSession = await buildAppSessionFromAuthSession(
    {
      user: {
        email: 'ishan@example.com',
        id: ownerUserId,
      },
    },
    async () => ownerHousehold,
  );
  const memberSession = await buildAppSessionFromAuthSession(
    {
      user: {
        email: 'spouse@example.com',
        id: '8a79dd7f-9170-4d93-98b6-3e9d8330c5b1',
      },
    },
    async () => memberHousehold,
  );

  assert.equal(ownerSession.household.householdId, memberSession.household.householdId);
  assert.equal(ownerSession.household.householdName, memberSession.household.householdName);
  assert.equal(ownerSession.household.role, 'owner');
  assert.equal(memberSession.household.role, 'member');
  assert.equal(
    getDefaultAuthenticatedHref({
      authStatus: ownerSession.status,
      householdStatus: ownerSession.household.status,
    }),
    '/(tabs)',
  );
  assert.equal(
    getDefaultAuthenticatedHref({
      authStatus: memberSession.status,
      householdStatus: memberSession.household.status,
    }),
    '/(tabs)',
  );
});

function createHouseholdClient({ householdName, inviteCode, role, userId }) {
  return {
    from(table) {
      if (table === 'household_members') {
        return {
          select() {
            return createResolvedQuery({
              display_name: userId === ownerUserId ? 'Ishan' : 'Spouse',
              household_id: householdId,
              role,
            });
          },
        };
      }

      return {
        select() {
          return createResolvedQuery({
            name: householdName,
          });
        },
      };
    },
    async rpc(name) {
      assert.equal(name, 'ensure_household_invite');

      return {
        data: {
          householdId,
          inviteCode,
          inviteExpiresAt: '2026-04-03T10:00:00.000Z',
        },
        error: null,
      };
    },
  };
}

function createOwnerOnboardingClient() {
  return {
    from() {
      throw new Error('owner onboarding does not read tables directly');
    },
    async rpc(name, args) {
      assert.equal(name, 'create_household_with_owner');
      assert.deepEqual(args, {
        household_name: 'Sharma Household',
        owner_display_name: 'Ishan',
      });

      return {
        data: {
          displayName: 'Ishan',
          householdId,
          householdName: 'Sharma Household',
          inviteCode: 'AB12CD34EF56',
          inviteExpiresAt: '2026-04-03T10:00:00.000Z',
          role: 'owner',
          status: 'ready',
        },
        error: null,
      };
    },
  };
}

function createMemberOnboardingClient() {
  return {
    from() {
      throw new Error('member onboarding does not read tables directly');
    },
    async rpc(name, args) {
      assert.equal(name, 'join_household_with_invite');
      assert.deepEqual(args, {
        invite_code: 'AB12CD34EF56',
        member_display_name: 'Spouse',
      });

      return {
        data: {
          displayName: 'Spouse',
          householdId,
          householdName: 'Sharma Household',
          inviteCode: null,
          inviteExpiresAt: null,
          role: 'member',
          status: 'ready',
        },
        error: null,
      };
    },
  };
}

function createResolvedQuery(data) {
  return {
    eq() {
      return this;
    },
    async maybeSingle() {
      return {
        data,
        error: null,
      };
    },
  };
}
